// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

// Superfluid Imports
import {ISuperfluid, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {IInstantDistributionAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

// Open Zeppelin Imports
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Uniswap Imports
import "./uniswap/IUniswapV3Pool.sol";
import "./uniswap/IUniswapV3Factory.sol";

// Gelato Imports
import "./gelato/OpsTaskCreator.sol";

// Chainlink
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// REX Imports
import "./superfluid/ISETHCustom.sol";
import "./matic/IWMATIC.sol";
import "./uniswap/interfaces/ISwapRouter02.sol";
import "./REXTrade.sol";

// Hardhat console
import "hardhat/console.sol";

contract REXMarketV4 is
    ReentrancyGuard,
    SuperAppBase,
    OpsTaskCreator
{
    using SafeERC20 for ERC20;
    using Counters for Counters.Counter;

    // REX Market Structures

    // Parameters needed to perform a shareholder update (i.e. a flow rate update)
    struct ShareholderUpdate {
        address shareholder; // The shareholder to update
        int96 currentFlowRate; // The current flow rate of the shareholder
        ISuperToken token; // The token to update the flow rate for
    }

    // Superfluid Variables
    ISuperfluid internal host; // Superfluid host contract
    IConstantFlowAgreementV1 internal cfa; // The stored constant flow agreement class address
    IInstantDistributionAgreementV1 internal ida; // The stored instant dist. agreement class address

    // REX Market Variables
    REXTrade public rexTrade;
    uint public lastDistributedAt; // The timestamp of the last distribution
    ISuperToken public inputToken; // e.g. USDCx
    ISuperToken public outputToken; // e.g. ETHx
    address public underlyingInputToken; // e.g. USDC
    address public underlyingOutputToken; // e.g. WETH
    IWMATIC public wmatic;
    ISuperToken public maticx;
    uint32 public constant OUTPUT_INDEX = 0; // Superfluid IDA Index for outputToken's output pool
    uint256 public constant INTERVAL = 60; // The interval for gelato to check for execution
    uint128 public constant BASIS_POINT_SCALER = 1e4; // The scaler for basis points
    // TODO: make's minoutput 0 for simulation
    uint public constant RATE_TOLERANCE = 1e4; // The percentage to deviate from the oracle (basis points)
    uint128 public constant SHARE_SCALER = 100000; // The scaler to apply to the share of the outputToken pool

    // Uniswap Variables
    ISwapRouter02 public router; // UniswapV3 Router
    address[] public uniswapPath; // The path between inputToken and outputToken
    uint24[] public poolFees; // The pool fee to use in the path between inputToken and outputToken
    uint24 public constant GELATO_GAS_POOL_FEE = 500; // The pool fee to use for gas reimbursements to Gelato

    // Chainlink Variables
    AggregatorV3Interface public priceFeed; // Chainlink price feed for the inputToken/outputToken pair
    bool internal invertPrice; // Whether to invert the price in rate conversions

    // Gelato task variables
    bytes32 public taskId;
    uint256 public gelatoFeeShare = 100; // number of basis points gelato takes for executing the task
    uint256 public distributionInterval = 4 hours; // the interval between distributions

    /// @dev Swap data for performance tracking overtime
    /// @param inputAmount The amount of inputToken swapped
    /// @param outputAmount The amount of outputToken received
    /// @param oraclePrice The oracle price at the time of the swap
    event RexSwap(
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 oraclePrice
    );

    event UpdateGelatoFeeShare(uint256 newGelatoFee);

    constructor(
        ISuperfluid _host,
        IConstantFlowAgreementV1 _cfa,
        IInstantDistributionAgreementV1 _ida,
        string memory _registrationKey,
        address payable _ops
    ) OpsTaskCreator(_ops, address(this)) {
        host = _host;
        cfa = _cfa;
        ida = _ida;

        uint256 _configWord = SuperAppDefinitions.APP_LEVEL_FINAL;

        if (bytes(_registrationKey).length > 0) {
            host.registerAppWithKey(_configWord, _registrationKey);
        } else {
            host.registerApp(_configWord);
        }

        // Deploy RexTrade for trade tracking
        rexTrade = new REXTrade();
    }

    /// @dev Creates the distribute task on Gelato Network
    function createTask() external payable {
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
        taskId = _createTask(address(this), execData, moduleData, ETH);
    }

    /// @dev Initializer for wmatic and maticx
    /// @param _wmatic is the WMATIC token
    /// @param _maticx is the MATICx token
    function initializeMATIC(IWMATIC _wmatic, ISuperToken _maticx) external {
        require(address(wmatic) == address(0), "A");
        wmatic = _wmatic;
        maticx = _maticx;
    }

    /// @dev Initilalize the REX Market contract
    /// @param _inputToken is the input supertoken for the market
    /// @param _outputToken is the output supertoken for the market
    function initializeMarket(
        ISuperToken _inputToken,
        ISuperToken _outputToken
    ) external {
        require(address(inputToken) == address(0), "IU"); // Blocks if already initialized
        inputToken = _inputToken;
        outputToken = _outputToken;
        lastDistributedAt = block.timestamp;
        underlyingOutputToken = _getUnderlyingToken(outputToken);
        underlyingInputToken = _getUnderlyingToken(inputToken);

        // Make the output IDA pool
        _createIndex(OUTPUT_INDEX, outputToken);

        // Approve upgrading underlying outputTokens if its not a supertoken
        // Supertokens have their own address as the underlying token
        if (underlyingOutputToken != address(outputToken)) {
            ERC20(underlyingOutputToken).safeIncreaseAllowance(
                address(outputToken),
                2 ** 256 - 1
            );
        }
    }

    /// @dev Initialize the Uniswap V3 Router and Factory and do approvals
    /// @param _uniswapRouter is the Uniswap V3 Router
    /// @param _uniswapFactory is the Uniswap V3 Factory
    /// @param _uniswapPath is the Uniswap V3 path
    /// @param _poolFees is the Uniswap V3 pool fees
    function initializeUniswap(
        ISwapRouter02 _uniswapRouter,
        IUniswapV3Factory _uniswapFactory,
        address[] memory _uniswapPath,
        uint24[] memory _poolFees
    ) external {
        require(address(router) == address(0), "IU"); // Blocks if already initialized

        // Set contract variables
        router = _uniswapRouter;
        poolFees = _poolFees;
        uniswapPath = _uniswapPath;

        // Get the pool from the Uniswap V3 Factory
        IUniswapV3Factory factory = IUniswapV3Factory(_uniswapFactory);

        // Require that the pool for input/output swaps exists
        for (uint i = 0; i < uniswapPath.length - 1; i++)
            require(
                factory.getPool(
                    address(uniswapPath[i]),
                    address(uniswapPath[i + 1]),
                    poolFees[i]
                ) != address(0),
                "PDNE"
            );

        // Require that the pool for gas reimbursements exists
        if (address(underlyingInputToken) != address(wmatic)) {
            require(
                factory.getPool(
                    address(wmatic),
                    address(underlyingInputToken),
                    GELATO_GAS_POOL_FEE
                ) != address(0),
                "PDNE"
            );
        }

        // Approve Uniswap Router to spend
        ERC20(underlyingInputToken).safeIncreaseAllowance(
            address(router),
            2 ** 256 - 1
        );
    }

    /// @dev Initialize the Chainlink Aggregator
    /// @param _priceFeed is the Chainlink Aggregator
    function initializePriceFeed(
        AggregatorV3Interface _priceFeed,
        bool _invertPrice
    ) external {
        require(address(priceFeed) == address(0), "A"); // Blocks if already initialized
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

        (, int price, , , ) = priceFeed.latestRoundData();
        return price;
    }

    /// @dev Distribute tokens to streamers
    /// @param ctx is the context for the distribution
    /// @param ignoreGasReimbursement is whether to ignore gas reimbursements (i.e. Gelato)
    function distribute(
        bytes memory ctx,
        bool ignoreGasReimbursement
    ) public payable nonReentrant returns (bytes memory newCtx) {
        uint gasUsed = gasleft(); // Track gas used in this function
        newCtx = ctx;
        uint256 inputTokenAmount = inputToken.balanceOf(address(this));

        // If there is no inputToken to distribute, then return immediately
        if (inputTokenAmount == 0) {
            return newCtx;
        }

        // Swap inputToken for outputToken, capture the latest price and output amount
        (uint256 outputTokenAmount, uint256 latestPrice) = _swap(
            inputTokenAmount
        );

        // Emit swap event for performance tracking purposes
        emit RexSwap(inputTokenAmount, outputTokenAmount, latestPrice);

        // Set outputTokenAmount to the balanceOf to account for any spare change from last round
        outputTokenAmount = outputToken.balanceOf(address(this));

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

        // If the last distribution is less than the desired interval
        if (
            block.timestamp - lastDistributedAt <= distributionInterval &&
            gelatoFeeShare > 1
        ) {
            // Reduce the gelatoFeeShare by 1-basis point
            gelatoFeeShare = gelatoFeeShare - 1;
        } else if (gelatoFeeShare < 100) {
            // Otherwise raise the gelatoFeeShare by 1-basis point
            gelatoFeeShare = gelatoFeeShare + 1;
        }
        emit UpdateGelatoFeeShare(gelatoFeeShare);

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
            ERC20(address(wmatic)).safeTransfer(msg.sender, fee);
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
                    GELATO_GAS_POOL_FEE,
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
    function _swap(
        uint256 amount
    ) internal returns (uint256 outAmount, uint256 latestPrice) {
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

        // Calculate minOutput based on oracle
        latestPrice = uint(int(getLatestPrice()));
        // If there's no oracle address setup, don't protect against slippage
        // if (latestPrice == 0) {
        //     minOutput = 0;
        // } else if (!invertPrice) {
        //     minOutput = (amount * 1e8) / latestPrice;
        //     // Scale the minOutput to the right percision
        //     minOutput *= 10 ** (18 - ERC20(underlyingInputToken).decimals());
        // } else {
        //     // Invert the rate provided by the oracle, e.g. ETH >> USDC
        //     minOutput = (amount * latestPrice) / 1e8;
        //     // Scale the minOutput to the right percision
        //     minOutput /=
        //         10 ** (18 - ERC20(underlyingOutputToken).decimals()) *
        //         1e8;
        // }

        // Apply the rate tolerance to allow for some slippage
        // minOutput =
        //     (minOutput * (BASIS_POINT_SCALER - RATE_TOLERANCE)) /
        //     BASIS_POINT_SCALER;

        // Encode the path for swap
        bytes memory encodedPath;
        for (uint256 i = 0; i < uniswapPath.length; i++) {
            if (i == uniswapPath.length - 1) {
                encodedPath = abi.encodePacked(encodedPath, uniswapPath[i]);
            } else {
                encodedPath = abi.encodePacked(
                    encodedPath,
                    uniswapPath[i],
                    poolFees[i]
                );
            }
        }

        // This is the code for the uniswap
        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter
            .ExactInputParams({
                path: encodedPath,
                recipient: address(this),
                amountIn: amount,
                // Disabled on this version since initial liquidity for REX liquidity Network is low
                // REX Swaps are very small by design, its unlikely frontrunning these swaps will be worth it
                amountOutMinimum: 0
            });
        outAmount = router.exactInput(params);

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

    function _isOutputToken(
        ISuperToken _superToken
    ) internal view returns (bool) {
        return address(_superToken) == address(outputToken);
    }

    function _shouldDistribute() internal view returns (bool) {
        // TODO: Might no longer be required
        (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
            .getIndex(outputToken, address(this), OUTPUT_INDEX);
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

        // Make sure the agreement is either:
        // - inputToken and CFAv1
        // - outputToken and IDAv1
        require(
            (_isInputToken(_superToken) && _isCFAv1(_agreementClass)) ||
                (_isOutputToken(_superToken) && _isIDAv1(_agreementClass)),
            "!token"
        );

        // If this isn't a CFA Agreement class, return the context and be done
        if (!_isCFAv1(_agreementClass)) return _ctx;
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

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            _flowRate,
            _superToken
        );
        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);

        // Get the current index value for rextrade tracking
        uint _indexValue = getIDAIndexValue();

        // Get IDA shares for this user for rextrade tracking
        (, , uint128 _units, ) = getIDAShares(_shareholder);

        // Mint the shareholder an NFT to track their trade
        rexTrade.startRexTrade(_shareholder, _flowRate, _indexValue, _units);
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
        ( , int96 _flowRate, ) = _getShareholderInfo(
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
    /// @param _ctx SuperFluid context data
    /// @return _newCtx updated SuperFluid context data
    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata, // _cbdata,
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

        
        // Before updating the shares, check if the distribution should be triggered
        // Trigger the distribution flushes the system before changing share allocations
        // This may no longer be needed
        if (_shouldDistribute()) {
            _newCtx = distribute(_newCtx, true);
        }

        // Get the current index value for rextrade tracking
        uint _indexValue = getIDAIndexValue();

        // End the trade for this shareholder
        rexTrade.endRexTrade(_shareholder, _indexValue, 0);

        // Build the shareholder update parameters and update the shareholder
        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            _flowRate,
            _superToken
        );

        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);

        // Get IDA shares for this user for rextrade tracking
        (, , uint128 _units, ) = getIDAShares(_shareholder);

        // Mint the shareholder an NFT to track their trade
        rexTrade.startRexTrade(_shareholder, _flowRate, _indexValue, _units);
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

        (
            ,
            int96 _flowRateMain,
            uint256 _timestamp
        ) = _getShareholderInfo(_agreementData, _superToken);

        uint256 _uinvestAmount = _calcUserUninvested(
            _timestamp,
            uint256(uint96(_flowRateMain)),
            // Select the correct lastDistributedAt for this _superToken
            lastDistributedAt
        );

        _cbdata = abi.encode(_uinvestAmount);
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

        // Get the current index value for rextrade tracking
        uint _indexValue = getIDAIndexValue();

        // Decode the cbData to get the caller's previous flow rate, set in beforeAgreementTerminated
        uint256 _uninvestAmount = abi.decode(_cbdata, (uint256));

        // End the trade for this shareholder
        rexTrade.endRexTrade(_shareholder, _indexValue, _uninvestAmount);

        // Build the shareholder update parameters and update the shareholder
        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
            _shareholder,
            0,
            _superToken
        );

        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);

        // Refund the unswapped amount back to the person who started the stream
        // Methods in the terminate callback can not revert, hence the try-catch
        try
            _superToken.transferFrom(
                address(this),
                _shareholder,
                _uninvestAmount
            )
        // solhint-disable-next-line no-empty-blocks
        {

        } catch {
            // In case of any problems here, log the error for record keeping and continue
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

    /// @dev Checks if the agreementClass is a CFAv1 agreement
    /// @param _agreementClass Agreement class address
    /// @return _isIDAv1 is the agreement class a CFAv1 agreement
    function _isIDAv1(address _agreementClass) internal view returns (bool) {
        return
            ISuperAgreement(_agreementClass).agreementType() ==
            keccak256(
                "org.superfluid-finance.agreements.InstantDistributionAgreement.v1"
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
        _newCtx = _ctx;

        _shareholderUpdate.token = outputToken;

        uint128 userShares = _getShareAllocations(_shareholderUpdate);

        // TODO: Update the fee taken by the DAO, Affiliate
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            OUTPUT_INDEX,
            _shareholderUpdate.shareholder,
            userShares,
            outputToken
        );
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
    function getNextDistributionTime(
        uint256 gasPrice,
        uint256 gasLimit,
        uint256 tokenToMaticRate
    ) public view returns (uint256) {
        uint256 inflowRate = uint256(
            int256(cfa.getNetFlow(inputToken, address(this)))
        ) / (10 ** 9); // Safe conversion - Netflow rate will always we positive or zero

        uint256 tokenAmount = gasPrice * gasLimit * tokenToMaticRate;
        uint256 timeToDistribute = (tokenAmount / inflowRate) / (10 ** 9);
        return lastDistributedAt + timeToDistribute;
    }

    /// @dev Get `_streamer` IDA subscription info for token with index `_index`
    /// @param _streamer is streamer address
    /// @return _exist Does the subscription exist?
    /// @return _approved Is the subscription approved?
    /// @return _units Units of the suscription.
    /// @return _pendingDistribution Pending amount of tokens to be distributed for unapproved subscription.
    function getIDAShares(
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
            outputToken,
            address(this),
            OUTPUT_INDEX,
            _streamer
        );
    }

    function _getShareAllocations(
        ShareholderUpdate memory _shareholderUpdate
    ) internal pure returns (uint128 userShares) {
        // The user's shares will always be their current flow rate
        userShares = (
            uint128(uint256(int256(_shareholderUpdate.currentFlowRate)))
        );

        // The flow rate is scaled to account for the fact you can't by any ETH with just 1 wei of USDC
        userShares /= SHARE_SCALER;
    }

    function getIDAIndexValue() public view returns (uint256) {
        (, uint256 _indexValue, , ) = ida.getIndex(
            outputToken,
            address(this),
            OUTPUT_INDEX
        );
        return _indexValue;
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
    
    function getTradeInfo(address _trader, uint _tradeIndex) public view returns (
        REXTrade.Trade memory trade
    ){
        trade = rexTrade.getTradeInfo(_trader, _tradeIndex);
    }

    function getLatestTrade(address _trader) public view returns (
        REXTrade.Trade memory trade
    ){
        trade = rexTrade.getLatestTrade(_trader);
    }

    function getTradeCount(address _trader) public view returns (
        uint256 count
    ){
        count = rexTrade.tradeCountsByUser(_trader);
    }

    // Payable for X->MATICx markets to work
    receive() external payable {}
}
