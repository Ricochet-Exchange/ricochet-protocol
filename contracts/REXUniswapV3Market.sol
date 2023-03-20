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

// REX Imports
import './ISETHCustom.sol';
import './matic/IWMATIC.sol';
import "./superswap/interfaces/ISwapRouter02.sol";
import "./referral/IREXReferral.sol";


contract REXUniswapV3Market is Ownable, SuperAppBase, Initializable, OpsTaskCreator {
    using SafeERC20 for ERC20;

    // REX Market Structures 
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
    uint public rateTolerance; // The percentage to deviate from the oracle scaled to 1e6
    uint128 public feeRate; // Fee taken by the protocol on each distribution (basis points)
    uint128 public affiliateFee; // Fee taken by the affilaite on each distribution (basis points)
    uint128 public shareScaler; // The scaler to apply to the share of the outputToken pool
    ISuperToken public inputToken;  // e.g. USDCx
    ISuperToken public outputToken; // e.g. ETHx
    ISuperToken public subsidyToken; // e.g. RICx
    address public underlyingInputToken; // e.g. USDC
    address public underlyingOutputToken; // e.g. WETH
    IWMATIC public wmatic;
    ISuperToken public maticx;
    uint32 constant OUTPUT_INDEX = 0;  // Superfluid IDA Index for outputToken's output pool
    uint32 constant SUBSIDY_INDEX = 1; // Superfluid IDA Index for subsidyToken's output pool


    // Uniswap Variables
    ISwapRouter02 router; // UniswapV3 Router
    IUniswapV3Pool uniswapPool; // The Uniswap V3 pool for inputToken and outputToken
    address[] uniswapPath; // The path between inputToken and outputToken
    uint24 poolFee; // The pool fee to use in the path between inputToken and outputToken 

    // Gelato task variables
    uint256 public count;
    uint256 public lastExecuted;
    bytes32 public taskId;
    uint256 public gelatoFeeShare = 10; // number of basis points gelato takes for executing the task
    uint256 public constant MAX_COUNT = 5;
    uint256 public constant INTERVAL = 60;

    // Internal Buffering Oracle Variables
    uint public constant BUFFER_SIZE = 3; // 3 slot circular buffer architecture
    uint public constant BUFFER_DELAY = 60; // min. 60 seconds between each data sample
    TokenExchangeRate[BUFFER_SIZE] public tokenExchangeRates; // The exchange rates of the token
    uint256 public tokenExchangeRateIndex; // The index of the next exchange rate to be recorded

    /// @dev Record the price of the token at the time of the swap
    /// @param rate is the price of the token at the time of the swap
    /// @param timestamp is the timestamp of the swap
    event RecordTokenPrice(uint256 rate, uint256 timestamp);
    
    // TODO: Emit these events where appropriate
    /// @dev Distribution event. Emitted on each token distribution operation.
    /// @param totalAmount is total distributed amount
    /// @param feeCollected is fee amount collected during distribution
    /// @param token is distributed token address
    event Distribution(
        uint256 totalAmount,
        uint256 feeCollected,
        address token
    );

    /// @dev Shareholder update event. Emitted on each shareholder update operation.
    /// @param shareholder is the shareholder address
    /// @param affiliate is the affiliate address
    /// @param previousFlowRate is the previous flow rate of the shareholder
    /// @param currentFlowRate is the current flow rate of the shareholder
    /// @param token is the token address of the pool where shares changed
    event ShareholderShareUpdate(
        address shareholder,
        address affiliate,
        int96 previousFlowRate,
        int96 currentFlowRate,
        ISuperToken token
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
        bytes memory execData = abi.encodeCall(this.distribute, ('', false));
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
    /// @param _initialTokenExchangeRate is the initial exchange rate between input/output
    /// @param _rateTolerance is the rate tolerance for the market
    function initializeMarket(
        ISuperToken _inputToken,
        ISuperToken _outputToken,
        ISuperToken _subsidyToken,
        uint128 _shareScaler,
        uint128 _feeRate,
        uint256 _initialTokenExchangeRate,
        uint256 _rateTolerance
    ) public onlyOwner initializer {
        inputToken = _inputToken;
        outputToken = _outputToken;
        subsidyToken = _subsidyToken;
        shareScaler = _shareScaler;
        rateTolerance = _rateTolerance;
        feeRate = _feeRate;
        affiliateFee = 500000;
    
        // Create a OutputPool for the outputToken
        addOutputPool(
            outputToken,
            _feeRate,
            0
        );
        // Create a OutputPool for the subsidyToken
        addOutputPool(
            subsidyToken,
            _feeRate,
            0
        );


        outputPoolIndicies[outputToken] = OUTPUT_INDEX;
        outputPoolIndicies[subsidyToken] = SUBSIDY_INDEX;

        underlyingOutputToken = _getUnderlyingToken(outputToken);
        underlyingInputToken = _getUnderlyingToken(inputToken);

        // Approve upgrading underlying outputTokens if its not a supertoken
        // Supertokens have their own address as the underlying token
        if (underlyingOutputToken != address(outputToken)) { 
            ERC20(underlyingOutputToken).safeIncreaseAllowance(
                address(outputToken),
                2**256 - 1
            );
        }

        // Set up tokenExchangeRates
        for(uint i = 0; i < BUFFER_SIZE; i++) {
            tokenExchangeRates[i] = TokenExchangeRate({
                rate: _initialTokenExchangeRate,
                timestamp: block.timestamp
            });
        }

        lastDistributedAt = block.timestamp;
    }

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

        // Require that the pool for i/o swaps exists
        require(
            factory.getPool(
                address(underlyingInputToken),
                address(underlyingOutputToken),
                poolFee
            ) != address(0),
            "PDNE1"
        );

        // Require that the pool for gas reimbursements exists
        // Log get pool params
        console.log("underlyingInputToken", address(underlyingInputToken));
        console.log("wmatic", address(wmatic));
        console.log("poolFee", poolFee);
        require(
            factory.getPool(
                address(underlyingInputToken),
                address(wmatic),
                poolFee
            ) != address(0),
            "PDNE2"
        );

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
            2**256 - 1
        );

        // Approve Uniswap Router to spend subsidyToken
        ERC20(_getUnderlyingToken(subsidyToken)).safeIncreaseAllowance(
            address(router),
            2**256 - 1
        );

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

    // TODO: Remove this in favor of
    /// @dev Get last distribution timestamp
    /// @return last distribution timestamp
    function getLastDistributionAt() external view returns (uint256) {
        return lastDistributedAt;
    }

    function distribute(bytes memory ctx, bool ignoreGasReimbursement) 
        public
        payable 
        returns (bytes memory newCtx)
    {

        newCtx = ctx;

        uint gasUsed = gasleft(); // Track gas used in this function
        uint256 inputTokenAmount = inputToken.balanceOf(address(this));
        uint256 outputTokenAmount = _swap(inputTokenAmount); // Swap inputToken for outputToken

        // At this point, we've got enough of tokenA and tokenB to perform the distribution
        outputTokenAmount = outputToken.balanceOf(address(this));
        _recordExchangeRate(inputTokenAmount * 1e18 / outputTokenAmount, block.timestamp);

        // If there is no outputToken, return
        if (inputTokenAmount == 0) {
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
        uint distAmount =
            (block.timestamp - lastDistributedAt) *
            outputPools[SUBSIDY_INDEX].emissionRate;
        if (
            distAmount > 0 && distAmount <
            subsidyToken.balanceOf(
                address(this)
            )
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
        if(fee > 0) {
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

    function _swapForGas(
        uint256 amountOut
    ) internal returns (uint256) {
        
        // gelatoFeeShare reserves some underlyingInputToken for gas reimbursement
        uint256 inputTokenBalance = ERC20(underlyingInputToken).balanceOf(address(this));

        // Use this amount to swap for enough WMATIC to cover the gas fee
        IV3SwapRouter.ExactOutputParams memory params = IV3SwapRouter.ExactOutputParams({
            path: abi.encodePacked(address(wmatic), poolFee, underlyingInputToken),
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
    ) internal returns (uint256 outAmount) {
        uint256 minOutput; // The minimum amount of output tokens based on oracle

        // Downgrade if this is not a supertoken
        if (underlyingInputToken != address(inputToken)) {
            inputToken.downgrade(inputToken.balanceOf(address(this)));
        } 
        
        // Calculate the amount of tokens
        amount = ERC20(underlyingInputToken).balanceOf(address(this));
        // Scale it to 1e18 if not (e.g. USDC, WBTC)
        amount = amount * (10**(18 - ERC20(underlyingInputToken).decimals()));

        // @dev Calculate minOutput based on oracle
        // @dev This should be its own method
        uint twapPrice = getTwap();
        
        minOutput = amount * 1e6 / twapPrice;

        minOutput = (minOutput * (1e6 - rateTolerance)) / 1e6;

        // Scale back from 1e18 to outputToken decimals
        // minOutput = (minOutput * (10**(ERC20(outputToken).decimals()))) / 1e18;
        // Scale it back to inputToken decimals
        amount = amount / (10**(18 - ERC20(underlyingInputToken).decimals()));
        amount = amount / 10000 * (10000 - gelatoFeeShare);
        // The left over input tokne amount is for the gelato fee

        // This is the code for the swap
        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter
            .ExactInputParams({
                path: abi.encodePacked(underlyingInputToken, poolFee, underlyingOutputToken),
                recipient: address(this),
                amountIn: amount,
                amountOutMinimum: minOutput
            });
        
        outAmount = router.exactInput(params);

        // Upgrade if this is not a supertoken
        // TODO: This should be its own method
        if (underlyingOutputToken != address(outputToken)) {
            if (outputToken == maticx) {
                wmatic.withdraw(ERC20(underlyingOutputToken).balanceOf(address(this)));
                ISETHCustom(address(outputToken)).upgradeByETH{value: address(this).balance}();
            } else {
                outputToken.upgrade(
                    ERC20(underlyingOutputToken).balanceOf(address(this)) *
                        (10**(18 - ERC20(underlyingOutputToken).decimals()))
                );
            }
        } // else this is a native supertoken
    }

    function _isInputToken(ISuperToken _superToken)
        internal
        view
        returns (bool)
    {
        return
            address(_superToken) == address(inputToken); 
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
    function _getUnderlyingToken(ISuperToken _token)
        internal
        view
        returns (address)
    {
        address underlyingToken = address(
            _token.getUnderlyingToken()
        );

        if (underlyingToken == address(0)) {
            underlyingToken = address(_token);
        }

        return underlyingToken;
    }



    // Superfluid Callbacks

    // Agreement Created

    function beforeAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;
        (address shareholder, ) = abi.decode(
            _agreementData,
            (address, address)
        );
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
            _agreementData, _superToken
        );

        _registerReferral(_ctx, _shareholder);

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
          _shareholder, referrals.getAffiliateAddress(_shareholder), 0, _flowRate, _superToken
        );
        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);

    }

    // Superfluid Agreement Management Methods

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

    /// @dev Set new `shares` share for `subscriber` address in IDA with `index` index
    /// @param index IDA index ID
    /// @param subscriber is subscriber address
    /// @param shares is distribution shares count
    /// @param distToken is distribution token address
    function _updateSubscription(
        uint256 index,
        address subscriber,
        uint128 shares,
        ISuperToken distToken
    ) internal {
        host.callAgreement(
            ida,
            abi.encodeWithSelector(
                ida.updateSubscription.selector,
                distToken,
                index,
                subscriber,
                // All shares are scaled based on the difference in magnitude between the input token and the output token
                // This addresses the issue that you can't sell 1 wei of USDC to ETH
                shares,
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

    // Agreement Updated

     function beforeAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
      _onlyHost();
      if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
          return _ctx;

      // Get the stakeholders current flow rate and save it in cbData
      (, int96 _flowRate,) = _getShareholderInfo(
          _agreementData, _superToken
      );

      _cbdata = abi.encode(_flowRate);
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;
        (address _shareholder, int96 _flowRate,) = _getShareholderInfo(
            _agreementData, _superToken
        );

        int96 _beforeFlowRate = abi.decode(_cbdata, (int96));


        if (_shouldDistribute()) {
            _newCtx = distribute(_newCtx, true);
        }

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
          _shareholder, referrals.getAffiliateAddress(_shareholder), _beforeFlowRate, _flowRate, _superToken
        );

        // TODO: Udpate shareholder needs before and after flow rate
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

        (
            address _shareholder,
            int96 _flowRateMain,
            uint256 _timestamp
        ) = _getShareholderInfo(_agreementData, _superToken);

        uint256 _uinvestAmount = _calcUserUninvested(
            _timestamp,
            uint256(uint96(_flowRateMain)),
            // Select the correct lastDistributedAt for this _superToken
            lastDistributedAt
        );
        _cbdata = abi.encode(_uinvestAmount, int256(_flowRateMain));
    }

    function afterAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;
        (address _shareholder, ) = abi.decode(_agreementData, (address, address));
        (uint256 _uninvestAmount, int96 _beforeFlowRate ) = abi.decode(_cbdata, (uint256, int96));

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
          _shareholder, referrals.getAffiliateAddress(_shareholder), _beforeFlowRate, 0, _superToken
        );

        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);
        // Refund the unswapped amount back to the person who started the stream
        try _superToken.transferFrom(address(this), _shareholder, _uninvestAmount)
        // solhint-disable-next-line no-empty-blocks
        {} catch {
        }
    }

    // REX Referral Methods
    function _registerReferral(bytes memory _ctx, address _shareholder) internal {
        require(referrals.addressToAffiliate(_shareholder) == 0, "noAffiliates");
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

        // internal helper function to get the amount that needs to be returned back to the user
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

    function _getShareholderInfo(bytes calldata _agreementData, ISuperToken _superToken)
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

    /// @dev Get `_streamer` IDA subscription info for token with index `_index`
    /// @param _index is token index in IDA
    /// @param _streamer is streamer address
    /// @return _exist Does the subscription exist?
    /// @return _approved Is the subscription approved?
    /// @return _units Units of the suscription.
    /// @return _pendingDistribution Pending amount of tokens to be distributed for unapproved subscription.
    function getIDAShares(uint32 _index, address _streamer)
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

    function _getShareAllocations(ShareholderUpdate memory _shareholderUpdate)
     internal returns (uint128 userShares, uint128 daoShares, uint128 affiliateShares)
    {
      (,,daoShares,) = getIDAShares(outputPoolIndicies[_shareholderUpdate.token], owner());
      daoShares *= shareScaler;

      if (address(0) != _shareholderUpdate.affiliate) {
        (,,affiliateShares,) = getIDAShares(outputPoolIndicies[_shareholderUpdate.token], _shareholderUpdate.affiliate);
        affiliateShares *= shareScaler;
      }

      // Compute the change in flow rate, will be negative is slowing the flow rate
      int96 changeInFlowRate = _shareholderUpdate.currentFlowRate - _shareholderUpdate.previousFlowRate;
      uint128 feeShares;
      // if the change is positive value then DAO has some new shares,
      // which would be 2% of the increase in shares
      if(changeInFlowRate > 0) {
        // Add new shares to the DAO
        feeShares = uint128(uint256(int256(changeInFlowRate)) * feeRate / 1e6);
        if (address(0) != _shareholderUpdate.affiliate) {
          affiliateShares += feeShares * affiliateFee / 1e6;
          feeShares -= feeShares * affiliateFee / 1e6;
        }
        daoShares += feeShares;
      } else {
        // Make the rate positive
        changeInFlowRate = -1 * changeInFlowRate;
        feeShares = uint128(uint256(int256(changeInFlowRate)) * feeRate / 1e6);
        if (address(0) != _shareholderUpdate.affiliate) {
          affiliateShares -= (feeShares * affiliateFee / 1e6 > affiliateShares) ? affiliateShares : feeShares * affiliateFee / 1e6;
          feeShares -= feeShares * affiliateFee / 1e6;
        }
        daoShares -= (feeShares > daoShares) ? daoShares : feeShares;
      }
      userShares = uint128(uint256(int256(_shareholderUpdate.currentFlowRate))) * (1e6 - feeRate) / 1e6;

      // Scale back shares
      affiliateShares /= shareScaler;
      daoShares /= shareScaler;
      userShares /= shareScaler;

    }

    // Internal Oracle Methods
    // TODO: Chainlink?

    function _recordExchangeRate(uint256 rate, uint256 timestamp) internal { 
        // Record the exchange rate and timestamp in the circular buffer, tokenExchangeRates
        if (block.timestamp - lastDistributedAt > BUFFER_DELAY) {
            // Only record the exchange rate if the last distribution was more than 60 seconds ago
            // This is to prevent the exchange rate from being recorded too frequently
            // which may cause the average exchange rate to be manipulated
            tokenExchangeRates[tokenExchangeRateIndex] = TokenExchangeRate(rate, timestamp);
            // Increment the index, account for the circular buffer structure
            tokenExchangeRateIndex = (tokenExchangeRateIndex + 1) % BUFFER_SIZE;
            emit RecordTokenPrice(rate, timestamp);
        }

    }

    // Function to compute a average value from tokenExchangeRates circular buffer using the tokenExchangeRateIndex
    function getTwap() public view returns (uint256) {
        uint256 sum = 0;
        uint startIndex = tokenExchangeRateIndex;
        for (uint256 i = 0; i < BUFFER_SIZE; i++) {
            sum += tokenExchangeRates[startIndex].rate;
            if (startIndex == 0) {
                startIndex = BUFFER_SIZE - 1;
            } else {
                startIndex -= 1;
            }
        }
        if (sum == 0) {
            return 1;   // Will be 0 for the first BUFFER_SIZE distributions
        }
        return sum / BUFFER_SIZE;
    }

    
    // 

    /// @dev Allows anyone to close any stream if the app is jailed.
    /// @param streamer is stream source (streamer) address
    function emergencyCloseStream(address streamer, ISuperToken token) external virtual {
        // Allows anyone to close any stream if the app is jailed
        require(host.isAppJailed(ISuperApp(address(this))), "!jailed");

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

    /// @dev Close stream from `streamer` address if balance is less than 8 hours of streaming
    /// @param streamer is stream source (streamer) address
    function closeStream(address streamer, ISuperToken token) public {
      // Only closable iff their balance is less than 8 hours of streaming
      (,int96 streamerFlowRate,,) = cfa.getFlow(token, streamer, address(this));
      // int96 streamerFlowRate = getStreamRate(token, streamer);
      require(int(token.balanceOf(streamer)) <= streamerFlowRate * 8 hours,
                "!closable");

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

    /// @dev Drain contract's input and output tokens balance to owner if SuperApp dont have any input streams.
    function emergencyDrain(ISuperToken token) external virtual onlyOwner {
        require(host.isAppJailed(ISuperApp(address(this))), "!jailed");

        token.transfer(
            owner(),
            token.balanceOf(address(this))
        );
    }

    /// @dev Sets emission rate for a output pool/token
    /// @param _index IDA index for the output pool/token
    /// @param _emissionRate Emission rate for the output pool/token
    function setEmissionRate(uint32 _index, uint128 _emissionRate)
        external
        onlyOwner
    {
        outputPools[_index].emissionRate = _emissionRate;
    }

    // Payable for X->MATICx markets to work
    receive() external payable {}

}
