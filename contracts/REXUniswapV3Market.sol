// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./uniswap/IUniswapV3Pool.sol";
import "./uniswap/IUniswapV3Factory.sol";
import "./uniswap/FixedPoint96.sol";
import "./uniswap/FullMath.sol";

// import tickmath
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";

import "./REXMarket.sol";
import './ISETHCustom.sol';
import './matic/IWMATIC.sol';
import "./superswap/interfaces/ISwapRouter02.sol";

// REX One Way Uniswap Market
// - Accepts inputToken and converts it to outputToken
// - Sources liquidity using UniswapV3 liquidity pools
// - Uses a subsidyToken to incentivize contract interactions
// - Uses a referral system to incentivize referrals to the contract
contract REXUniswapV3Market is REXMarket {
    using SafeERC20 for ERC20;

    // REX Market Variables
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

    constructor(
        address _owner,
        ISuperfluid _host,
        IConstantFlowAgreementV1 _cfa,
        IInstantDistributionAgreementV1 _ida,
        string memory _registrationKey,
        IREXReferral _rexReferral
    ) REXMarket(_owner, _host, _cfa, _ida, _registrationKey, _rexReferral) {}

    function initializeTwoWayMarket(
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
    ) public override onlyOwner {
        // Only Allow 4 output pools, this overrides the block in REXMarket
        // where there can't be two output pools of the same token
        require(market.numOutputPools < 4, "too many pools");

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

    function distribute(bytes memory ctx)
        public
        override
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


    // // Src: Charm Finance, Unlicense
    // // https://github.com/charmfinance/alpha-vaults-contracts/blob/07db2b213315eea8182427be4ea51219003b8c1a/contracts/AlphaStrategy.sol#L136
    // function getTwap() public view returns (uint _price) {
    //     uint32 _twapDuration = 5; // TODO: Parameterize this
    //     uint32[] memory secondsAgo = new uint32[](2);
    //     secondsAgo[0] = _twapDuration;
    //     secondsAgo[1] = 0;

    //     (int56[] memory tickCumulatives,  ) = uniswapPool.observe(secondsAgo);
        
    //     uint sqrtRatioX96 = TickMath.getSqrtRatioAtTick(int24((tickCumulatives[1] - tickCumulatives[0]) / int(uint(_twapDuration))));
    //     _price = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, FixedPoint96.Q96);

    //     // TODO: This section needs some work, I can't explain this math well enough
    //     // If the tickCumulatives are negative use alternative calculation:
    //     if(tickCumulatives[0] < 0 ) {
    //         _price = ((sqrtRatioX96 * 1e18 / (2 ** 96)) ** 2) / 1e18;
    //     } else {
    //         _price = 1e18 / (((sqrtRatioX96 * 1e18 / (2 ** 96)) ** 2) / 1e18);
    //     }
    // }


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
        view
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

    function _updateShareholder(
        bytes memory _ctx,
        ShareholderUpdate memory _shareholderUpdate
    ) internal override returns (bytes memory _newCtx) {
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

    function _isInputToken(ISuperToken _superToken)
        internal
        view
        override
        returns (bool)
    {
        return
            address(_superToken) == address(inputToken); 
    }

    function _shouldDistribute() internal override returns (bool) {
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

    receive() external payable {}

}
