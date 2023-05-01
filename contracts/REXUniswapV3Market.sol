// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

// Superfluid Imports
import {ISuperfluid, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {IInstantDistributionAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

// Open Zeppelin Imports
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Uniswap Imports
import "./uniswap/IUniswapV3Pool.sol";
import "./uniswap/IUniswapV3Factory.sol";

// Gelato Imports
import "./gelato/OpsTaskCreator.sol";

// Chainlink
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// REX Imports
import "./ISETHCustom.sol";
import "./matic/IWMATIC.sol";
import "./superswap/interfaces/ISwapRouter02.sol";
import "./referral/IREXReferral.sol";

// Hardhat console
import "hardhat/console.sol";

contract REXUniswapV3Market is
    Ownable,
    SuperAppBase,
    Initializable,
    OpsTaskCreator
{
    using SafeERC20 for ERC20;

    // REX Market Structures

    // Parameters needed to perform a shareholder update (i.e. a flow rate update)
    struct ShareholderUpdate {
        address shareholder; // The shareholder to update
        address affiliate; // The affiliate to update
        int96 previousFlowRate; // The previous flow rate of the shareholder
        int96 currentFlowRate; // The current flow rate of the shareholder
        ISuperToken token; // The token to update the flow rate for
    }

    // The struct for the output pools (i.e. Superfluid IDA pools)
    struct OutputPool {
        ISuperToken token; // The token to distribute
        uint128 feeRate; // Fee taken by the DAO on each output distribution
        uint256 emissionRate; // Rate to emit tokens if there's a balance, used for subsidies
    }

    // Internal Oracle token exchange rates, recorded during swaps
    struct TokenExchangeRate {
        uint256 rate; // The exchange rate of the token
        uint256 timestamp; // The timestamp of the exchange rate
    }

    // Superfluid Variables
    ISuperfluid internal host; // Superfluid host contract
    IConstantFlowAgreementV1 internal cfa; // The stored constant flow agreement class address
    IInstantDistributionAgreementV1 internal ida; // The stored instant dist. agreement class address

    // REX Referral System
    IREXReferral internal referrals;

    // REX Market Variables
    mapping(uint32 => OutputPool) public outputPools; // Maps IDA indexes to their distributed Supertokens
    mapping(ISuperToken => uint32) public outputPoolIndicies; // Maps tokens to their IDA indexes in OutputPools
    uint32 public numOutputPools; // The number of output pools
    uint public lastDistributedAt; // The timestamp of the last distribution
    uint public rateTolerance; // The percentage to deviate from the oracle (basis points)
    uint128 public feeRate; // Fee taken by the protocol on each distribution (basis points)
    uint128 public affiliateFee; // Fee taken by the affilaite on each distribution (basis points)
    uint128 public shareScaler; // The scaler to apply to the share of the outputToken pool
    ISuperToken public inputToken; // e.g. USDCx
    ISuperToken public outputToken; // e.g. ETHx
    ISuperToken public subsidyToken; // e.g. RICx
    address public underlyingInputToken; // e.g. USDC
    address public underlyingOutputToken; // e.g. WETH
    IWMATIC public wmatic;
    ISuperToken public maticx;
    uint32 public constant OUTPUT_INDEX = 0; // Superfluid IDA Index for outputToken's output pool
    uint32 public constant SUBSIDY_INDEX = 1; // Superfluid IDA Index for subsidyToken's output pool
    uint256 public constant INTERVAL = 60; // The interval for gelato to check for execution
    uint128 public constant BASIS_POINT_SCALER = 1e4; // The scaler for basis points

    // Uniswap Variables
    ISwapRouter02 public router; // UniswapV3 Router
    IUniswapV3Pool public uniswapPool; // The Uniswap V3 pool for inputToken and outputToken
    address[] public uniswapPath; // The path between inputToken and outputToken
    uint24 public poolFee; // The pool fee to use in the path between inputToken and outputToken

    // Chainlink Variables
    AggregatorV3Interface public priceFeed; // Chainlink price feed for the inputToken/outputToken pair
    bool internal invertPrice; // Whether to invert the price in rate conversions

    // Gelato task variables
    bytes32 public taskId;
    uint256 public gelatoFeeShare = 100; // number of basis points gelato takes for executing the task

    /// @dev Swap data for performance tracking overtime
    /// @param inputAmount The amount of inputToken swapped
    /// @param outputAmount The amount of outputToken received
    /// @param oraclePrice The oracle price at the time of the swap
    event RexSwap(
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 oraclePrice
    );

    constructor(
        address _owner,
        ISuperfluid _host,
        IConstantFlowAgreementV1 _cfa,
        IInstantDistributionAgreementV1 _ida,
        string memory _registrationKey,
        IREXReferral _rexReferral,
        address payable _ops,
        address _taskCreator
    ) OpsTaskCreator(_ops, _taskCreator) {
        host = _host;
        cfa = _cfa;
        ida = _ida;
        referrals = _rexReferral;

        transferOwnership(_owner);

        uint256 _configWord = SuperAppDefinitions.APP_LEVEL_FINAL;

        if (bytes(_registrationKey).length > 0) {
            host.registerAppWithKey(_configWord, _registrationKey);
        } else {
            host.registerApp(_configWord);
        }
    }

    /// @dev Creates the distribute task on Gelato Network
    function createTask() external payable onlyOwner {
        // Check the task wasn't already created
        require(taskId == bytes32(""), "Already started task");

        // Create a timed interval task with Gelato Network
        bytes memory execData = abi.encodeCall(this.distribute, ("", false));
        ModuleData memory moduleData = ModuleData({
            modules: new Module[](1),
            args: new bytes[](1)
        });
        moduleData.modules[0] = Module.TIME;
        moduleData.args[0] = _timeModuleArg(block.timestamp, INTERVAL);
        bytes32 id = _createTask(address(this), execData, moduleData, ETH);
        taskId = id;
    }

    /// @dev Initializer for wmatic and maticx
    /// @param _wmatic is the WMATIC token
    /// @param _maticx is the MATICx token
    function initializeMATIC(
        IWMATIC _wmatic,
        ISuperToken _maticx
    ) public onlyOwner {
        require(address(wmatic) == address(0), "A");
        wmatic = _wmatic;
        maticx = _maticx;
    }

    /// @dev Initilalize the REX Market contract
    /// @param _inputToken is the input supertoken for the market
    /// @param _outputToken is the output supertoken for the market
    /// @param _subsidyToken is the subsidy supertoken for the market
    /// @param _shareScaler is the scaler for the output (IDA) pool shares
    /// @param _feeRate is the protocol dev share rate
    /// @param _rateTolerance is the rate tolerance for the market
    function initializeMarket(
        ISuperToken _inputToken,
        ISuperToken _outputToken,
        ISuperToken _subsidyToken,
        uint128 _shareScaler,
        uint128 _feeRate,
        uint128 _affiliateFee,
        uint256 _rateTolerance
    ) public onlyOwner initializer {
        inputToken = _inputToken;
        outputToken = _outputToken;
        subsidyToken = _subsidyToken;
        shareScaler = _shareScaler;
        rateTolerance = _rateTolerance;
        feeRate = _feeRate;
        affiliateFee = _affiliateFee;

        // Create a OutputPool for the outputToken
        addOutputPool(outputToken, _feeRate, 0);
        // Create a OutputPool for the subsidyToken
        addOutputPool(subsidyToken, _feeRate, 0);

        outputPoolIndicies[outputToken] = OUTPUT_INDEX;
        outputPoolIndicies[subsidyToken] = SUBSIDY_INDEX;

        underlyingOutputToken = _getUnderlyingToken(outputToken);
        underlyingInputToken = _getUnderlyingToken(inputToken);

        // Approve upgrading underlying outputTokens if its not a supertoken
        // Supertokens have their own address as the underlying token
        if (underlyingOutputToken != address(outputToken)) {
            ERC20(underlyingOutputToken).safeIncreaseAllowance(
                address(outputToken),
                2 ** 256 - 1
            );
        }

        lastDistributedAt = block.timestamp;
    }

    /// @dev Initialize the Uniswap V3 Router and Factory and do approvals
    /// @param _uniswapRouter is the Uniswap V3 Router
    /// @param _uniswapFactory is the Uniswap V3 Factory
    /// @param _uniswapPath is the Uniswap V3 path
    /// @param _poolFee is the Uniswap V3 pool fee
    function initializeUniswap(
        ISwapRouter02 _uniswapRouter,
        IUniswapV3Factory _uniswapFactory,
        address[] memory _uniswapPath,
        uint24 _poolFee
    ) external onlyOwner {
        router = _uniswapRouter;
        poolFee = _poolFee;
        uniswapPath = _uniswapPath;

        // Get the pool from the Uniswap V3 Factory
        IUniswapV3Factory factory = IUniswapV3Factory(_uniswapFactory);

        // Require that the pool for input/output swaps exists
        require(
            factory.getPool(
                address(underlyingInputToken),
                address(underlyingOutputToken),
                poolFee
            ) != address(0),
            "PDNE1"
        );

        // Require that the pool for gas reimbursements exists
        if (address(underlyingInputToken) != address(wmatic)) {
            require(
                factory.getPool(
                    address(wmatic),
                    address(underlyingInputToken),
                    poolFee
                ) != address(0),
                "PDNE2"
            );
        }

        // Use the pool for the underlying tokens for the input/output supertokens
        uniswapPool = IUniswapV3Pool(
            factory.getPool(
                address(underlyingInputToken),
                address(underlyingOutputToken),
                poolFee
            )
        );

        // Approve Uniswap Router to spend
        ERC20(underlyingInputToken).safeIncreaseAllowance(
            address(router),
            2 ** 256 - 1
        );

        // Approve Uniswap Router to spend subsidyToken
        ERC20(_getUnderlyingToken(subsidyToken)).safeIncreaseAllowance(
            address(router),
            2 ** 256 - 1
        );
    }

    /// @dev Initialize the Chainlink Aggregator
    /// @param _priceFeed is the Chainlink Aggregator
    function initializePriceFeed(
        AggregatorV3Interface _priceFeed,
        bool _invertPrice
    ) external onlyOwner {
        // Only init priceFeed if not already initialized
        require(address(priceFeed) == address(0), "A");
        priceFeed = _priceFeed;
        invertPrice = _invertPrice;
    }

    /// @dev Get the latest price from the Chainlink Aggregator
    /// @return price is the latest price
    /// @notice From https://docs.chain.link/data-feeds/using-data-feeds
    function getLatestPrice() public view returns (int) {
        if (address(priceFeed) == address(0)) {
            return 0;
        }  

        (,int price, , ,) = priceFeed.latestRoundData();
        return price;
    }

    /// @dev Add a new output pool to the market
    /// @param _token is the output token for the pool
    /// @param _feeRate is the protocol dev share rate
    /// @param _emissionRate is the emission rate for the pool
    function addOutputPool(
        ISuperToken _token,
        uint128 _feeRate,
        uint256 _emissionRate
    ) public onlyOwner {
        OutputPool memory _newPool = OutputPool(
            _token,
            _feeRate,
            _emissionRate
        );
        outputPools[numOutputPools] = _newPool;
        outputPoolIndicies[_token] = numOutputPools;
        // Create a Superfluid IDA index for the output pool
        _createIndex(numOutputPools, _token);
        numOutputPools++;
    }

    /// @dev Distribute tokens to streamers
    /// @param ctx is the context for the distribution
    /// @param ignoreGasReimbursement is whether to ignore gas reimbursements (i.e. Gelato)
    function distribute(
        bytes memory ctx,
        bool ignoreGasReimbursement
    ) public payable returns (bytes memory newCtx) {
        newCtx = ctx;

        uint gasUsed = gasleft(); // Track gas used in this function
        uint256 inputTokenAmount = inputToken.balanceOf(address(this));

        // If there is no inputToken to distribute, then return
        if (inputTokenAmount == 0) {
            return newCtx;
        }

        // Swap inputToken for outputToken
        _swap(inputTokenAmount);

        // At this point, we've got enough of tokenA and tokenB to perform the distribution
        uint256 outputTokenAmount = outputToken.balanceOf(address(this));

        // If there is no outputToken to distribute, then return
        if (outputTokenAmount == 0) {
            return newCtx;
        }

        // Distribute outputToken
        (outputTokenAmount, ) = ida.calculateDistribution(
            outputToken,
            address(this),
            OUTPUT_INDEX,
            outputTokenAmount
        );

        newCtx = _idaDistribute(
            OUTPUT_INDEX,
            uint128(outputTokenAmount),
            outputToken,
            newCtx
        );

        // TODO: Emit Distribution event

        // Distribute subsidyToken
        uint distAmount = (block.timestamp - lastDistributedAt) *
            outputPools[SUBSIDY_INDEX].emissionRate;
        if (
            distAmount > 0 && distAmount < subsidyToken.balanceOf(address(this))
        ) {
            newCtx = _idaDistribute(
                SUBSIDY_INDEX,
                uint128(distAmount),
                subsidyToken,
                newCtx
            );
            // TODO: Emit SubsidyDistribution event
        }

        // Record when the last distribution happened for other calculations
        lastDistributedAt = block.timestamp;

        // Check if we should override the gas reimbursement feature
        // i.e. this is a distribution for a stream update
        if (ignoreGasReimbursement) {
            return newCtx;
        }
        // Otherwise, calculate the gas reimbursement for Gelato or for the msg.sender

        // Get the fee details from Gelato Ops
        (uint256 fee, address feeToken) = _getFeeDetails();

        // If the fee is greater than 0, reimburse the fee to the Gelato Ops
        if (fee > 0) {
            _swapForGas(fee);
            // Log the balances of the tokens
            wmatic.withdraw(wmatic.balanceOf(address(this)));
            _transfer(fee, feeToken);
        } else {
            // Otherwise, reimburse the gas to the msg.sender
            gasUsed = gasUsed - gasleft();
            fee = gasUsed * tx.gasprice; // TODO: add a threshold?
            _swapForGas(fee);
            wmatic.transfer(msg.sender, fee);
        }
    }

    // Uniswap V3 Swap Methods

    /// @dev Swap input token for WMATIC
    function _swapForGas(uint256 amountOut) internal returns (uint256) {
        // If the underlyingInputToken is WMATIC, then just return the amountOut
        if (underlyingInputToken == address(wmatic)) {
            return amountOut;
        }

        // gelatoFeeShare reserves some underlyingInputToken for gas reimbursement
        // Use this amount to swap for enough WMATIC to cover the gas fee
        IV3SwapRouter.ExactOutputParams memory params = IV3SwapRouter
            .ExactOutputParams({
                path: abi.encodePacked(
                    address(wmatic),
                    poolFee,
                    underlyingInputToken
                ),
                recipient: address(this),
                amountOut: amountOut,
                // This is a swap for the gas fee reimbursement and will not be frontrun
                amountInMaximum: type(uint256).max
            });

        return router.exactOutput(params);
    }

    // @notice Swap input token for output token
    // @param amount Amount of inputToken to swap
    // @return outAmount Amount of outputToken received
    // @dev This function has grown to do far more than just swap, this needs to be refactored
    function _swap(uint256 amount) internal returns (uint256 outAmount) {
        uint256 minOutput; // The minimum amount of output tokens based on oracle

        // Downgrade if this is not a supertoken
        if (underlyingInputToken != address(inputToken)) {
            inputToken.downgrade(inputToken.balanceOf(address(this)));
        }

        // Calculate the amount of tokens
        amount = ERC20(underlyingInputToken).balanceOf(address(this));
        amount =
            (amount * (BASIS_POINT_SCALER - gelatoFeeShare)) /
            BASIS_POINT_SCALER;

        // @dev Calculate minOutput based on oracle
        // @dev This should be its own method
        uint latestPrice = uint(int(getLatestPrice()));

        // If there's no oracle address setup, don't protect against slippage
        if (latestPrice == 0) {
            minOutput = 0; 
        } else if (!invertPrice) {
            // This is the common case, e.g. USDC >> ETH
            minOutput = amount * 1e8 / latestPrice * (10**(18 - ERC20(underlyingInputToken).decimals()));
        } else {
            // Invert the price provided by the oracle, e.g. ETH >> USDC
            minOutput = amount * latestPrice / 1e8 / 1e12;
        }

        // Apply the rate tolerance to allow for some slippage
        minOutput =
            (minOutput * (BASIS_POINT_SCALER - rateTolerance)) /
            BASIS_POINT_SCALER;

        // This is the code for the uniswap
        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter
            .ExactInputParams({
                path: abi.encodePacked(
                    underlyingInputToken,
                    poolFee,
                    underlyingOutputToken
                ),
                recipient: address(this),
                amountIn: amount,
                amountOutMinimum: minOutput
            });
        outAmount = router.exactInput(params);

        // Emit swap event for performance tracking
        emit RexSwap(amount, outAmount, latestPrice);

        // Upgrade if this is not a supertoken
        // TODO: This should be its own method
        if (underlyingOutputToken != address(outputToken)) {
            if (outputToken == maticx) {
                wmatic.withdraw(
                    ERC20(underlyingOutputToken).balanceOf(address(this))
                );
                ISETHCustom(address(outputToken)).upgradeByETH{
                    value: address(this).balance
                }();
            } else {
                outputToken.upgrade(
                    ERC20(underlyingOutputToken).balanceOf(address(this)) *
                        (10 ** (18 - ERC20(underlyingOutputToken).decimals()))
                );
            }
        } // else this is a native supertoken
    }

    function _isInputToken(
        ISuperToken _superToken
    ) internal view returns (bool) {
        return address(_superToken) == address(inputToken);
    }

    function _shouldDistribute() internal view returns (bool) {
        // TODO: Might no longer be required
        (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
            .getIndex(
                outputPools[OUTPUT_INDEX].token,
                address(this),
                OUTPUT_INDEX
            );
        return _totalUnitsApproved + _totalUnitsPending > 0;
    }

    // function get the underlying tokens for token a and b, if token
    // is a supertoken, then the underlying is the supertoken itself
    function _getUnderlyingToken(
        ISuperToken _token
    ) internal view returns (address) {
        // If the token is maticx, then the underlying token is wmatic
        if (address(_token) == address(maticx)) {
            return address(wmatic);
        }

        address underlyingToken = _token.getUnderlyingToken();

        // If the underlying token is 0x0, then the token is a supertoken
        if (address(underlyingToken) == address(0)) {
            return address(_token);
        }

        return underlyingToken;
    }

    // Superfluid Callbacks

    function beforeAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata, // _agreementData,
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;
    }

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;

        if (_shouldDistribute()) {
            _newCtx = distribute(_newCtx, true);
        }

        (address _shareholder, int96 _flowRate, ) = _getShareholderInfo(
            _agreementData,
            _superToken
        );

        _registerReferral(_ctx, _shareholder);

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            referrals.getAffiliateAddress(_shareholder),
            0,
            _flowRate,
            _superToken
        );
        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);
    }

    /// @dev Called before an agreement is updated
    /// @param _superToken The agreement SuperToken for this update
    /// @param _agreementClass The agreement class for this update
    /// @param _agreementData Agreement data associated with this update
    /// @param _ctx Superfluid context data
    /// @return _cbdata Callback data
    function beforeAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
        // Only allow the Superfluid host to call this function
        _onlyHost();

        // If the agreement is not a CFAv1 agreement, then return the context
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        // Get the stakeholders current flow rate and save it in cbData
        (, int96 _flowRate, ) = _getShareholderInfo(
            _agreementData,
            _superToken
        );

        // Encode the rate for use in afterAgreementUpdated
        _cbdata = abi.encode(_flowRate);
    }

    /// @dev Called after an agreement is updated
    /// @param _superToken The agreement SuperToken for this update
    /// @param _agreementClass The agreement class for this update
    /// @param _agreementData Agreement data associated with this update
    /// @param _cbdata Callback data associated with this update
    /// @param _ctx SuperFluid context data
    /// @return _newCtx updated SuperFluid context data
    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();

        // If the agreement is not a CFAv1 agreement, return the context
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        // Copy the argment context to a new context return variable
        _newCtx = _ctx;

        // Get the caller's address and current flow rate from the agreement data
        (address _shareholder, int96 _flowRate, ) = _getShareholderInfo(
            _agreementData,
            _superToken
        );

        // Decode the cbData to get the caller's previous flow rate, set in beforeAgreementUpdated
        int96 _beforeFlowRate = abi.decode(_cbdata, (int96));

        // Before updating the shares, check if the distribution should be triggered
        // Trigger the distribution flushes the system before changing share allocations
        // This may no longer be needed
        if (_shouldDistribute()) {
            _newCtx = distribute(_newCtx, true);
        }

        // Build the shareholder update parameters and update the shareholder
        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            referrals.getAffiliateAddress(_shareholder),
            _beforeFlowRate,
            _flowRate,
            _superToken
        );

        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);
    }

    // Agreement Terminated

    function beforeAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        (, int96 _flowRateMain, uint256 _timestamp) = _getShareholderInfo(
            _agreementData,
            _superToken
        );

        uint256 _uinvestAmount = _calcUserUninvested(
            _timestamp,
            uint256(uint96(_flowRateMain)),
            // Select the correct lastDistributedAt for this _superToken
            lastDistributedAt
        );
        _cbdata = abi.encode(_uinvestAmount, int256(_flowRateMain));
    }

    /// @dev Called after an agreement is terminated
    /// @param _superToken The agreement SuperToken for this update
    /// @param _agreementClass The agreement class for this update
    /// @param _agreementData Agreement data associated with this update
    /// @param _cbdata Callback data associated with this update
    /// @param _ctx SuperFluid context data
    /// @return _newCtx updated SuperFluid context data
    function afterAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        // Only allow the Superfluid host to call this function
        _onlyHost();

        // If the agreement is not a CFAv1 agreement, return the context
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;

        // Get the caller's address and current flow rate from the agreement data
        (address _shareholder, ) = abi.decode(
            _agreementData,
            (address, address)
        );

        // Decode the cbData to get the caller's previous flow rate, set in beforeAgreementTerminated
        (uint256 _uninvestAmount, int96 _beforeFlowRate) = abi.decode(
            _cbdata,
            (uint256, int96)
        );

        // Build the shareholder update parameters and update the shareholder
        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            referrals.getAffiliateAddress(_shareholder),
            _beforeFlowRate,
            0,
            _superToken
        );

        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);

        // Refund the unswapped amount back to the person who started the stream
        try
            _superToken.transferFrom(
                address(this),
                _shareholder,
                _uninvestAmount
            )
        // solhint-disable-next-line no-empty-blocks
        {

        } catch {
            // In case of any problems here, just log the error for record keeping and continue
            console.log(
                "Error refunding uninvested amount to shareholder:",
                _shareholder
            );
            console.log("Uninvested amount:", _uninvestAmount);
        }
    }

    // Superfluid Agreement Helper Methods

    /// @dev Distributes `_distAmount` amount of `_distToken` token among all IDA index subscribers
    /// @param _index IDA index ID
    /// @param _distAmount amount to distribute
    /// @param _distToken distribute token address
    /// @param _ctx SuperFluid context data
    /// @return _newCtx updated SuperFluid context data
    function _idaDistribute(
        uint32 _index,
        uint128 _distAmount,
        ISuperToken _distToken,
        bytes memory _ctx
    ) internal returns (bytes memory _newCtx) {
        _newCtx = _ctx;
        if (_newCtx.length == 0) {
            // No context provided
            host.callAgreement(
                ida,
                abi.encodeWithSelector(
                    ida.distribute.selector,
                    _distToken,
                    _index,
                    _distAmount,
                    new bytes(0) // placeholder ctx
                ),
                new bytes(0) // user data
            );
        } else {
            (_newCtx, ) = host.callAgreementWithContext(
                ida,
                abi.encodeWithSelector(
                    ida.distribute.selector,
                    _distToken,
                    _index,
                    _distAmount,
                    new bytes(0) // placeholder ctx
                ),
                new bytes(0), // user data
                _newCtx
            );
        }
    }

    function _createIndex(uint256 index, ISuperToken distToken) internal {
        host.callAgreement(
            ida,
            abi.encodeWithSelector(
                ida.createIndex.selector,
                distToken,
                index,
                new bytes(0) // placeholder ctx
            ),
            new bytes(0) // user data
        );
    }

    /// @dev Same as _updateSubscription but uses provided SuperFluid context data
    /// @param ctx SuperFluid context data
    /// @param index IDA index ID
    /// @param subscriber is subscriber address
    /// @param shares is distribution shares count
    /// @param distToken is distribution token address
    /// @return newCtx updated SuperFluid context data
    function _updateSubscriptionWithContext(
        bytes memory ctx,
        uint256 index,
        address subscriber,
        uint128 shares,
        ISuperToken distToken
    ) internal returns (bytes memory newCtx) {
        newCtx = ctx;
        (newCtx, ) = host.callAgreementWithContext(
            ida,
            abi.encodeWithSelector(
                ida.updateSubscription.selector,
                distToken,
                index,
                subscriber,
                shares,
                new bytes(0)
            ),
            new bytes(0), // user data
            newCtx
        );
    }

    // REX Referral Methods
    function _registerReferral(
        bytes memory _ctx,
        address _shareholder
    ) internal {
        require(
            referrals.addressToAffiliate(_shareholder) == 0,
            "noAffiliates"
        );
        ISuperfluid.Context memory decompiledContext = host.decodeCtx(_ctx);
        string memory affiliateId;
        if (decompiledContext.userData.length > 0) {
            (affiliateId) = abi.decode(decompiledContext.userData, (string));
        } else {
            affiliateId = "";
        }

        referrals.safeRegisterCustomer(_shareholder, affiliateId);
    }

    // Helper Methods

    /// @dev Checks if the agreementClass is a CFAv1 agreement
    /// @param _agreementClass Agreement class address
    /// @return _isCFAv1 is the agreement class a CFAv1 agreement
    function _isCFAv1(address _agreementClass) internal view returns (bool) {
        return
            ISuperAgreement(_agreementClass).agreementType() ==
            keccak256(
                "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
            );
    }

    /// @dev Restricts calls to only from SuperFluid host
    function _onlyHost() internal view {
        require(msg.sender == address(host), "!host");
    }

    /// @dev Calculate the uninvested amount for the user based on the flow rate and last update time
    /// @param _prevUpdateTimestamp is the previous update timestamp
    /// @param _flowRate is the flow rate
    /// @param _lastDistributedAt is the last distributed timestamp
    /// @return _uninvestedAmount is the uninvested amount
    function _calcUserUninvested(
        uint256 _prevUpdateTimestamp,
        uint256 _flowRate,
        uint256 _lastDistributedAt
    ) internal view returns (uint256 _uninvestedAmount) {
        _uninvestedAmount =
            _flowRate *
            (block.timestamp -
                (
                    (_prevUpdateTimestamp > _lastDistributedAt)
                        ? _prevUpdateTimestamp
                        : _lastDistributedAt
                ));
    }

    // Shareholder Math Methods (TODO: Move to a library?)

    function _updateShareholder(
        bytes memory _ctx,
        ShareholderUpdate memory _shareholderUpdate
    ) internal returns (bytes memory _newCtx) {
        // Check the input supertoken used and figure out the output Index
        // inputToken maps the OUTPUT_INDEX
        // maybe a better way to do this

        uint32 outputIndex;
        uint32 subsidyIndex;

        outputIndex = OUTPUT_INDEX;
        subsidyIndex = SUBSIDY_INDEX;
        _shareholderUpdate.token = outputToken;

        (
            uint128 userShares,
            uint128 daoShares,
            uint128 affiliateShares
        ) = _getShareAllocations(_shareholderUpdate);

        _newCtx = _ctx;

        // TODO: Update the fee taken by the DAO, Affiliate
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            OUTPUT_INDEX,
            _shareholderUpdate.shareholder,
            userShares,
            outputToken
        );
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            SUBSIDY_INDEX,
            _shareholderUpdate.shareholder,
            userShares,
            subsidyToken
        );
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            OUTPUT_INDEX,
            owner(),
            daoShares,
            outputToken
        );
        // Owner is not added to subsidy pool

        address affiliate = referrals.getAffiliateAddress(
            _shareholderUpdate.shareholder
        );
        if (affiliate != address(0)) {
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                OUTPUT_INDEX,
                affiliate,
                affiliateShares,
                outputToken
            );
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                SUBSIDY_INDEX,
                affiliate,
                affiliateShares,
                subsidyToken
            );
        }
    }

    function _getShareholderInfo(
        bytes calldata _agreementData,
        ISuperToken _superToken
    )
        internal
        view
        returns (address _shareholder, int96 _flowRate, uint256 _timestamp)
    {
        (_shareholder, ) = abi.decode(_agreementData, (address, address));
        (_timestamp, _flowRate, , ) = cfa.getFlow(
            _superToken,
            _shareholder,
            address(this)
        );
    }

    /**
     * @dev Calculates the time for the next distribution based on the given input parameters in wei.
     *
     * @param gasPrice The gas price in wei per gas unit for the transaction.
     * @param gasLimit The maximum amount of gas to be used for the transaction.
     * @param tokenToMaticRate The conversion rate from tokens to Matic.
     *
     * @return The timestamp for the next token distribution.
     */
    function getNextDistributionTime(uint256 gasPrice, uint256 gasLimit, uint256 tokenToMaticRate) public view returns (uint256) {
        uint256 inflowRate = uint256(int256(cfa.getNetFlow(inputToken, address(this)))) / (10 ** 9); // Safe conversion - Netflow rate will always we positive or zero
        
        uint256 tokenAmount = gasPrice * gasLimit * tokenToMaticRate;
        uint256 timeToDistribute = (tokenAmount / inflowRate) / (10 ** 9);
        return lastDistributedAt + timeToDistribute;
    }

    /// @dev Get `_streamer` IDA subscription info for token with index `_index`
    /// @param _index is token index in IDA
    /// @param _streamer is streamer address
    /// @return _exist Does the subscription exist?
    /// @return _approved Is the subscription approved?
    /// @return _units Units of the suscription.
    /// @return _pendingDistribution Pending amount of tokens to be distributed for unapproved subscription.
    function getIDAShares(
        uint32 _index,
        address _streamer
    )
        public
        view
        returns (
            bool _exist,
            bool _approved,
            uint128 _units,
            uint256 _pendingDistribution
        )
    {
        (_exist, _approved, _units, _pendingDistribution) = ida.getSubscription(
            outputPools[_index].token,
            address(this),
            _index,
            _streamer
        );
    }

    function _getShareAllocations(
        ShareholderUpdate memory _shareholderUpdate
    )
        internal
        view
        returns (uint128 userShares, uint128 daoShares, uint128 affiliateShares)
    {
        (, , daoShares, ) = getIDAShares(
            outputPoolIndicies[_shareholderUpdate.token],
            owner()
        );
        daoShares *= shareScaler;

        if (address(0) != _shareholderUpdate.affiliate) {
            (, , affiliateShares, ) = getIDAShares(
                outputPoolIndicies[_shareholderUpdate.token],
                _shareholderUpdate.affiliate
            );
            affiliateShares *= shareScaler;
        }

        // Compute the change in flow rate, will be negative is slowing the flow rate
        int96 changeInFlowRate = _shareholderUpdate.currentFlowRate -
            _shareholderUpdate.previousFlowRate;
        uint128 feeShares;
        // if the change is positive value then DAO has some new shares,
        // which would be 2% of the increase in shares
        if (changeInFlowRate > 0) {
            // Add new shares to the DAO
            feeShares = uint128(
                (uint256(int256(changeInFlowRate)) * feeRate) /
                    BASIS_POINT_SCALER
            );
            if (address(0) != _shareholderUpdate.affiliate) {
                affiliateShares +=
                    (feeShares * affiliateFee) /
                    BASIS_POINT_SCALER;
                feeShares -= (feeShares * affiliateFee) / BASIS_POINT_SCALER;
            }
            daoShares += feeShares;
        } else {
            // Make the rate positive
            changeInFlowRate = -1 * changeInFlowRate;
            feeShares = uint128(
                (uint256(int256(changeInFlowRate)) * feeRate) /
                    BASIS_POINT_SCALER
            );
            if (address(0) != _shareholderUpdate.affiliate) {
                affiliateShares -= ((feeShares * affiliateFee) /
                    BASIS_POINT_SCALER >
                    affiliateShares)
                    ? affiliateShares
                    : (feeShares * affiliateFee) / BASIS_POINT_SCALER;
                feeShares -= (feeShares * affiliateFee) / BASIS_POINT_SCALER;
            }
            daoShares -= (feeShares > daoShares) ? daoShares : feeShares;
        }
        userShares =
            (uint128(uint256(int256(_shareholderUpdate.currentFlowRate))) *
                (BASIS_POINT_SCALER - feeRate)) /
            BASIS_POINT_SCALER;

        // Scale back shares
        affiliateShares /= shareScaler;
        daoShares /= shareScaler;
        userShares /= shareScaler;
    }

    /// @dev Close stream from `streamer` address if balance is less than 8 hours of streaming
    /// @param streamer is stream source (streamer) address
    function closeStream(address streamer, ISuperToken token) public {
        // Only closable iff their balance is less than 8 hours of streaming
        (, int96 streamerFlowRate, , ) = cfa.getFlow(
            token,
            streamer,
            address(this)
        );
        // int96 streamerFlowRate = getStreamRate(token, streamer);
        require(
            int(token.balanceOf(streamer)) <= streamerFlowRate * 8 hours,
            "!closable"
        );

        // Close the streamers stream
        // Does this trigger before/afterAgreementTerminated
        host.callAgreement(
            cfa,
            abi.encodeWithSelector(
                cfa.deleteFlow.selector,
                token,
                streamer,
                address(this),
                new bytes(0) // placeholder
            ),
            "0x"
        );
    }

    /// @dev Withdraw subsidy token from the contract
    function withdrawSubsidyToken(uint _amount) external onlyOwner {
        require(subsidyToken.transfer(owner(), _amount), "WST");
    }

    /// @dev Sets emission rate for a output pool/token
    /// @param _emissionRate Emission rate for the output pool/token
    function setEmissionRate(uint128 _emissionRate) external onlyOwner {
        outputPools[SUBSIDY_INDEX].emissionRate = _emissionRate;
    }

    /// @dev sets the rateTolerance for the swap
    /// @param _rateTolerance is the rateTolerance for the swap in basis points
    /// @notice this needs a min and max
    function setRateTolerance(uint256 _rateTolerance) external onlyOwner {
        require(rateTolerance <= 1e4, "RT");
        rateTolerance = _rateTolerance;
    }

    /// @dev sets the gelatoFeeShare for the swap
    /// @param _gelatoFeeShare is the gelatoFeeShare for the swap in basis points
    /// @notice this needs a min and max
    function setGelatoFeeShare(uint256 _gelatoFeeShare) external onlyOwner {
        require(_gelatoFeeShare <= 1e4, "GFS");
        gelatoFeeShare = _gelatoFeeShare;
    }

    // Payable for X->MATICx markets to work
    receive() external payable {}
}
