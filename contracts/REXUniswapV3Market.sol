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

    // Structures 

    struct ShareholderUpdate {
      address shareholder;
      address affiliate;
      int96 previousFlowRate;
      int96 currentFlowRate;
      ISuperToken token;
    }

    struct OutputPool {
        ISuperToken token;
        uint128 feeRate; // Fee taken by the DAO on each output distribution
        uint256 emissionRate; // Rate to emit tokens if there's a balance, used for subsidies
    }

    struct Market {
        ISuperToken inputToken;
        uint256 lastDistributionAt; // The last time a distribution was made
        uint256 rateTolerance; // The percentage to deviate from the oracle scaled to 1e6
        uint128 feeRate;
        uint128 affiliateFee;
        address owner; // The owner of the market (reciever of fees)
        mapping(uint32 => OutputPool) outputPools; // Maps IDA indexes to their distributed Supertokens
        mapping(ISuperToken => uint32) outputPoolIndicies; // Maps tokens to their IDA indexes in OutputPools
        uint8 numOutputPools; // Indexes outputPools and outputPoolFees
        // If there is a difference in magnitude between the inputToken and outputToken, 
        // the difference is scaled by this amount when crediting shares of the outputToken pool
        // If USDC is 1 and ETH is 5000 USDC, that's 3 orders of magnitude, so the is set to 1e(3+1) = 1e4
        // an addition of +1 accounts for the case when ETH increases to 50000 USDC
        // This same math should be applied to any pairing of tokens (e.g. MATIC/ETH, RIC/ETH)
        // TL;DR: This addresses the issue that you can't sell 1 wei of USDC to ETH, 1 wei of ETH is 5000 wei of USDC
        uint128 shareScaler; 
        // Keep track of the exchange rates for the last 10 distributions
    }

    // Superfluid Variables
    ISuperfluid internal host; // Superfluid host contract
    IConstantFlowAgreementV1 internal cfa; // The stored constant flow agreement class address
    IInstantDistributionAgreementV1 internal ida; // The stored instant dist. agreement class address
    IREXReferral internal referrals;

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

    // REX Market Variables
    Market internal market;
    ISuperToken inputToken;  // e.g. USDCx
    ISuperToken outputToken; // e.g. ETHx
    ISuperToken subsidyToken; // e.g. RICx
    uint32 constant OUTPUT_INDEX = 0;  // Superfluid IDA Index for outputToken's output pool
    uint32 constant SUBSIDY_INDEX = 1; // Superfluid IDA Index for subsidyToken's output pool
   
   
    ISuperToken public constant MATICX = ISuperToken(0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3);

    // Uniswap Variables
    ISwapRouter02 router; // UniswapV3 Router
    IUniswapV3Pool uniswapPool; // The Uniswap V3 pool for inputToken and outputToken
    address[] uniswapPath; // The path between inputToken and outputToken
    uint24[] poolFees; // The pool fee to use in the path between inputToken and outputToken 

    // Internal Oracle Variables
    struct TokenExchangeRate {
        uint256 rate;
        uint256 timestamp;
    }
    // A list of the last several exchange rates recorded based on the swap rate
    // Array here functions as a circular buffer so we have these constants
    // based on these the fastest TWAP is a 3 minute twap 
    uint public constant BUFFER_SIZE = 3; // 3 slot circular buffer
    uint public constant BUFFER_DELAY = 60; // 60 seconds
    TokenExchangeRate[BUFFER_SIZE] public tokenExchangeRates; 
    // This is the index for the circular buffer
    uint256 public tokenExchangeRateIndex;

    event RecordTokenPrice(uint256 rate, uint256 timestamp);

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

    // Initializer Methods
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
        market.shareScaler = _shareScaler;
        market.rateTolerance = _rateTolerance;
        market.feeRate = _feeRate;
        market.affiliateFee = 500000;
        addOutputPool(
            outputToken,
            _feeRate,
            0
        );
        addOutputPool(
            subsidyToken,
            _feeRate,
            0
        );
        market.outputPoolIndicies[outputToken] = OUTPUT_INDEX;
        market.outputPoolIndicies[subsidyToken] = SUBSIDY_INDEX;

        // Approve upgrading underlying outputTokens if its not a supertoken
        address underlying = _getUnderlyingToken(outputToken);
        // Supertokens have their own address as the underlying token
        if (underlying != address(outputToken)) { 
            ERC20(underlying).safeIncreaseAllowance(
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

        market.lastDistributionAt = block.timestamp;
    }

    function initializeUniswap(
        ISwapRouter02 _uniswapRouter,
        IUniswapV3Factory _uniswapFactory,
        address[] memory _uniswapPath,
        uint24[] memory _poolFees
    ) external onlyOwner {
        router = _uniswapRouter;
        poolFees = _poolFees;
        uniswapPath = _uniswapPath;

        // Get the pool from the Uniswap V3 Factory
        IUniswapV3Factory factory = IUniswapV3Factory(_uniswapFactory);
        // Use the pool for the underlying tokens for the input/output supertokens 
        uniswapPool = IUniswapV3Pool(
            factory.getPool(
                address(_getUnderlyingToken(inputToken)),
                address(_getUnderlyingToken(outputToken)),
                poolFees[0]
            )
        );

        // Approve Uniswap Router to spend
        ERC20(_getUnderlyingToken(inputToken)).safeIncreaseAllowance(
            address(router),
            2**256 - 1
        );

    }

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
        market.outputPools[market.numOutputPools] = _newPool;
        market.outputPoolIndicies[_token] = market.numOutputPools;
        _createIndex(market.numOutputPools, _token);
        market.numOutputPools++;
    }

    // Getter Methods

    /// @dev Get output token address
    /// @return output token address
    function getOutputPool(uint32 _index)
        external
        view
        returns (OutputPool memory)
    {
        return market.outputPools[_index];
    }

    /// @dev Get last distribution timestamp
    /// @return last distribution timestamp
    function getLastDistributionAt() external view returns (uint256) {
        return market.lastDistributionAt;
    }

    /// @dev Get emission rate for a given output pool/token
    /// @param _index IDA index for the output pool/token
    /// @return Emission rate for the output pool
    function getEmissionRate(uint32 _index) external view returns (uint256) {
        return market.outputPools[_index].emissionRate;
    }

    function distribute(bytes memory ctx)
        public
        returns (bytes memory newCtx)
    {
        newCtx = ctx;

        uint256 inputTokenAmount = inputToken.balanceOf(address(this));
        uint256 outputTokenAmount = _swap(inputTokenAmount); // Swap inputToken for outputToken
        // TODO: log a swap event

        // At this point, we've got enough of tokenA and tokenB to perform the distribution
        outputTokenAmount = outputToken.balanceOf(address(this));
        _recordExchangeRate(inputTokenAmount * 1e18 / outputTokenAmount, block.timestamp);

        if (inputTokenAmount == 0) {
            return newCtx;
        }

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

        uint distAmount =
            (block.timestamp - market.lastDistributionAt) *
            market.outputPools[SUBSIDY_INDEX].emissionRate;
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
        market.lastDistributionAt = block.timestamp;
        // TODO: Emit Distribution event

        

    }

    function _swap(
        uint256 amount
    ) internal returns (uint256) {
        address input; // The underlying input token address
        address output; // The underlying output token address
        uint256 minOutput; // The minimum amount of output tokens based on oracle

        input = _getUnderlyingToken(inputToken);
        output = _getUnderlyingToken(outputToken);


        // Downgrade if this is not a supertoken
        if (input != address(inputToken)) {
            inputToken.downgrade(inputToken.balanceOf(address(this)));
        } 
        
        // Calculate the amount of tokens
        amount = ERC20(input).balanceOf(address(this));
        //Scale it to 1e18 if not (e.g. USDC, WBTC)
        amount = amount * (10**(18 - ERC20(input).decimals()));

        // TODO: Calculate minOutput based on oracle
        uint twapPrice = getTwap();
        
        minOutput = amount * 1e6 / twapPrice;

        minOutput = (minOutput * (1e6 - market.rateTolerance)) / 1e6;

        // Scale back from 1e18 to outputToken decimals
        // minOutput = (minOutput * (10**(ERC20(outputToken).decimals()))) / 1e18;
        // Scale it back to inputToken decimals
        amount = amount / (10**(18 - ERC20(input).decimals()));

        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter
            .ExactInputParams({
                path: abi.encodePacked(input, poolFees[0], output),
                recipient: address(this),
                amountIn: amount,
                amountOutMinimum: minOutput
            });

        uint256 outAmount = router.exactInput(params);
        // Upgrade if this is not a supertoken
        if (output != address(outputToken)) {
            if (outputToken == MATICX) {
                IWMATIC(_getUnderlyingToken(MATICX)).withdraw(ERC20(output).balanceOf(address(this)));
                ISETHCustom(address(outputToken)).upgradeByETH{value: address(this).balance}();
            } else {
                outputToken.upgrade(
                    ERC20(output).balanceOf(address(this)) *
                        (10**(18 - ERC20(output).decimals()))
                );
            }
        } // else this is a native supertoken
    }

    function _getEncodedPath(address[] memory _path, uint24[] memory _poolFees)
        internal
        pure
        returns (bytes memory encodedPath)
    {
        for (uint256 i = 0; i < _path.length; i++) {
            if (i == _path.length - 1) {
                encodedPath = abi.encodePacked(encodedPath, _path[i]);
            } else {
                encodedPath = abi.encodePacked(
                    encodedPath,
                    _path[i],
                    _poolFees[i]
                );
            }
        }
        return encodedPath;
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
                market.outputPools[OUTPUT_INDEX].token,
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
            _newCtx = distribute(_newCtx);
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
            _newCtx = distribute(_newCtx);
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
            // Select the correct lastDistributionAt for this _superToken
            market.lastDistributionAt
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
            market.outputPools[_index].token,
            address(this),
            _index,
            _streamer
        );
    }

    function _getShareAllocations(ShareholderUpdate memory _shareholderUpdate)
     internal returns (uint128 userShares, uint128 daoShares, uint128 affiliateShares)
    {
      (,,daoShares,) = getIDAShares(market.outputPoolIndicies[_shareholderUpdate.token], owner());
      daoShares *= market.shareScaler;

      if (address(0) != _shareholderUpdate.affiliate) {
        (,,affiliateShares,) = getIDAShares(market.outputPoolIndicies[_shareholderUpdate.token], _shareholderUpdate.affiliate);
        affiliateShares *= market.shareScaler;
      }

      // Compute the change in flow rate, will be negative is slowing the flow rate
      int96 changeInFlowRate = _shareholderUpdate.currentFlowRate - _shareholderUpdate.previousFlowRate;
      uint128 feeShares;
      // if the change is positive value then DAO has some new shares,
      // which would be 2% of the increase in shares
      if(changeInFlowRate > 0) {
        // Add new shares to the DAO
        feeShares = uint128(uint256(int256(changeInFlowRate)) * market.feeRate / 1e6);
        if (address(0) != _shareholderUpdate.affiliate) {
          affiliateShares += feeShares * market.affiliateFee / 1e6;
          feeShares -= feeShares * market.affiliateFee / 1e6;
        }
        daoShares += feeShares;
      } else {
        // Make the rate positive
        changeInFlowRate = -1 * changeInFlowRate;
        feeShares = uint128(uint256(int256(changeInFlowRate)) * market.feeRate / 1e6);
        if (address(0) != _shareholderUpdate.affiliate) {
          affiliateShares -= (feeShares * market.affiliateFee / 1e6 > affiliateShares) ? affiliateShares : feeShares * market.affiliateFee / 1e6;
          feeShares -= feeShares * market.affiliateFee / 1e6;
        }
        daoShares -= (feeShares > daoShares) ? daoShares : feeShares;
      }
      userShares = uint128(uint256(int256(_shareholderUpdate.currentFlowRate))) * (1e6 - market.feeRate) / 1e6;

      // Scale back shares
      affiliateShares /= market.shareScaler;
      daoShares /= market.shareScaler;
      userShares /= market.shareScaler;

    }

    // Internal Oracle Methods

    function _recordExchangeRate(uint256 rate, uint256 timestamp) internal { 
        // Record the exchange rate and timestamp in the circular buffer, tokenExchangeRates
        if (block.timestamp - market.lastDistributionAt > BUFFER_DELAY) {
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
        } else {

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
        market.outputPools[_index].emissionRate = _emissionRate;
    }

    // Payable for X->MATICx markets to work
    receive() external payable {}

}
