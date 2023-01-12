// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
// import tickmath
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";

import "./REXMarket.sol";
import './ISETHCustom.sol';
import "./superswap/interfaces/ISwapRouter02.sol";

contract REXTwoWayMarket is REXMarket {
    using SafeERC20 for ERC20;

    ISuperToken inputTokenA;
    ISuperToken inputTokenB;
    uint32 constant OUTPUTA_INDEX = 0;
    uint32 constant OUTPUTB_INDEX = 1;
    uint32 constant SUBSIDYA_INDEX = 2;
    uint32 constant SUBSIDYB_INDEX = 3;
    uint256 lastDistributionTokenAAt;
    uint256 lastDistributionTokenBAt;
    address public constant MATICX = 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3;
    ISuperToken subsidyToken;
    ISwapRouter02 router;
    IUniswapV3Pool uniswapPool;
    uint24[] public poolFees = [500];
    address[] public uniswapPath;
    address poolAddress;

    // REX Two Way Market Contracts
    // - Swaps the accumulated input tokens for output tokens

    constructor(
        address _owner,
        ISuperfluid _host,
        IConstantFlowAgreementV1 _cfa,
        IInstantDistributionAgreementV1 _ida,
        string memory _registrationKey,
        IREXReferral _rexReferral
    ) REXMarket(_owner, _host, _cfa, _ida, _registrationKey, _rexReferral) {}

    function initializeTwoWayMarket(
        ISuperToken _inputTokenA,
        uint128 _inputTokenAShareScaler,
        ISuperToken _inputTokenB,
        uint128 _inputTokenBShareScaler,
        uint128 _feeRate,
        uint256 _rateTolerance
    ) public onlyOwner initializer {
        inputTokenA = _inputTokenA;
        inputTokenB = _inputTokenB;
        market.inputToken = _inputTokenA; // market.inputToken isn't used but is set bc of the REXMarket
        market.rateTolerance = _rateTolerance;
        market.feeRate = _feeRate;
        market.affiliateFee = 500000;
        require(
            _inputTokenAShareScaler >= 1e6 && _inputTokenBShareScaler >= 1e6,
            "!scaleable"
        );
        addOutputPool(
            inputTokenA,
            _feeRate,
            0,
            _inputTokenAShareScaler
        );
        addOutputPool(
            inputTokenB,
            _feeRate,
            0,
            _inputTokenBShareScaler
        );
        market.outputPoolIndicies[inputTokenA] = OUTPUTA_INDEX;
        market.outputPoolIndicies[inputTokenB] = OUTPUTB_INDEX;

        address inputTokenAUnderlying = _getUnderlyingToken(inputTokenA);
        address inputTokenBUnderlying = _getUnderlyingToken(inputTokenB);

        if (inputTokenAUnderlying != address(inputTokenA)) {
            ERC20(inputTokenAUnderlying).safeIncreaseAllowance(
                address(inputTokenA),
                2**256 - 1
            );
        }

        if (inputTokenBUnderlying != address(inputTokenB)) {
            ERC20(inputTokenBUnderlying).safeIncreaseAllowance(
                address(inputTokenB),
                2**256 - 1
            );
        }

        market.lastDistributionAt = block.timestamp;
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



    function initializeSubsidies(
        uint256 _emissionRate,
        ISuperToken _subsidyToken
    ) public onlyOwner {
        subsidyToken = _subsidyToken;
        require(
            address(market.outputPools[SUBSIDYA_INDEX].token) == address(0) &&
                address(market.outputPools[SUBSIDYB_INDEX].token) == address(0),
            "already initialized"
        );
        addOutputPool(
            _subsidyToken,
            0,
            _emissionRate,
            market.outputPools[OUTPUTB_INDEX].shareScaler
        );
        addOutputPool(
            _subsidyToken,
            0,
            _emissionRate,
            market.outputPools[OUTPUTA_INDEX].shareScaler
        );
        lastDistributionTokenAAt = block.timestamp;
        lastDistributionTokenBAt = block.timestamp;
        // Does not need to add subsidy token to outputPoolIndicies
        // since these pools are hardcoded
    }

    function initializeUniswap(
        ISwapRouter02 _uniswapRouter,
        IUniswapV3Pool _uniswapPool,
        address[] memory _uniswapPath,
        uint24[] memory _poolFees
    ) external onlyOwner {
        router = _uniswapRouter;
        uniswapPool = _uniswapPool;
        uniswapPath = _uniswapPath;
        poolFees = _poolFees;

        // Approve Uniswap Router
        ERC20(_getUnderlyingToken(inputTokenA)).safeIncreaseAllowance(
            address(router),
            2**256 - 1
        );
        ERC20(_getUnderlyingToken(inputTokenB)).safeIncreaseAllowance(
            address(router),
            2**256 - 1
        );

    }

    function addOutputPool(
        ISuperToken _token,
        uint128 _feeRate,
        uint256 _emissionRate,
        uint128 _shareScaler
    ) public override onlyOwner {
        // Only Allow 4 output pools, this overrides the block in REXMarket
        // where there can't be two output pools of the same token
        require(market.numOutputPools < 4, "too many pools");

        OutputPool memory _newPool = OutputPool(
            _token,
            _feeRate,
            _emissionRate,
            _shareScaler
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

        // At this point, we've got enough of tokenA and tokenB to perform the distribution
        uint256 tokenAAmount = inputTokenA.balanceOf(address(this));
        uint256 tokenBAmount = inputTokenB.balanceOf(address(this));

        // TODO: Calculate the amount of tokenA and tokenB we need to have
        // Check how much inputTokenA we have already from tokenB
        uint256 tokenHave = 0;
            // (tokenBAmount *
            // market.oracles[inputTokenB].usdPrice) /
            // market.oracles[inputTokenA].usdPrice;
        // If we have more tokenA than we need, swap the surplus to inputTokenB
        if (tokenHave < tokenAAmount) {
            tokenHave = tokenAAmount - tokenHave;
            _swap(inputTokenA, inputTokenB, tokenHave);
            // Otherwise we have more tokenB than we need, swap the surplus to inputTokenA
        } else {
            tokenHave = 0;
                // (tokenAAmount * market.oracles[inputTokenA].usdPrice) /
                // market.oracles[inputTokenB].usdPrice;
            tokenHave = tokenBAmount - tokenHave;
            _swap(inputTokenB, inputTokenA, tokenHave);
        }

        // At this point, we've got enough of tokenA and tokenB to perform the distribution
        tokenAAmount = inputTokenA.balanceOf(address(this));
        tokenBAmount = inputTokenB.balanceOf(address(this));

        if (tokenAAmount == 0 && tokenBAmount == 0) {
            return newCtx;
        }

        // Perform the distributions
        uint256 feeCollected;
        uint256 distAmount;

        (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
            .getIndex(
                market.outputPools[OUTPUTA_INDEX].token,
                address(this),
                OUTPUTA_INDEX
            );
        if (tokenAAmount > 0 && _totalUnitsApproved + _totalUnitsPending > 0) {
            (tokenAAmount, ) = ida.calculateDistribution(
                inputTokenA,
                address(this),
                OUTPUTA_INDEX,
                tokenAAmount
            );

            // Distribute TokenA
            require(
                inputTokenA.balanceOf(address(this)) >= tokenAAmount,
                "!enough"
            );
            newCtx = _idaDistribute(
                OUTPUTA_INDEX,
                uint128(tokenAAmount),
                inputTokenA,
                newCtx
            );
            emit Distribution(distAmount, feeCollected, address(inputTokenA));

            // Distribution Subsidy
            distAmount =
                (block.timestamp - lastDistributionTokenAAt) *
                market.outputPools[SUBSIDYA_INDEX].emissionRate;
            if (
                distAmount <
                market.outputPools[SUBSIDYA_INDEX].token.balanceOf(
                    address(this)
                )
            ) {
                newCtx = _idaDistribute(
                    SUBSIDYA_INDEX,
                    uint128(distAmount),
                    market.outputPools[SUBSIDYA_INDEX].token,
                    newCtx
                );
                emit Distribution(
                    distAmount,
                    0,
                    address(market.outputPools[SUBSIDYA_INDEX].token)
                );
            }
            lastDistributionTokenAAt = block.timestamp;
        }

        (, , _totalUnitsApproved, _totalUnitsPending) = ida.getIndex(
            market.outputPools[OUTPUTB_INDEX].token,
            address(this),
            OUTPUTB_INDEX
        );
        if (tokenBAmount > 0 && _totalUnitsApproved + _totalUnitsPending > 0) {
            (tokenBAmount, ) = ida.calculateDistribution(
                inputTokenB,
                address(this),
                OUTPUTB_INDEX,
                tokenBAmount
            );

            // Distribute TokenB
            require(
                inputTokenB.balanceOf(address(this)) >= tokenBAmount,
                "!enough"
            );
            newCtx = _idaDistribute(
                OUTPUTB_INDEX,
                uint128(tokenBAmount),
                inputTokenB,
                newCtx
            );
            emit Distribution(distAmount, feeCollected, address(inputTokenB));

            // Distribution Subsidy
            distAmount =
                (block.timestamp - lastDistributionTokenBAt) *
                market.outputPools[SUBSIDYB_INDEX].emissionRate;
            if (
                distAmount <
                market.outputPools[SUBSIDYB_INDEX].token.balanceOf(
                    address(this)
                )
            ) {
                newCtx = _idaDistribute(
                    SUBSIDYB_INDEX,
                    uint128(distAmount),
                    market.outputPools[SUBSIDYB_INDEX].token,
                    newCtx
                );
                emit Distribution(
                    distAmount,
                    0,
                    address(market.outputPools[SUBSIDYB_INDEX].token)
                );
            }
            lastDistributionTokenBAt = block.timestamp;
        }

        market.lastDistributionAt = block.timestamp;
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
        (, , uint128 shares, ) = getIDAShares(OUTPUTA_INDEX, shareholder);
        require(shares == 0, "Already streaming");
        (, , shares, ) = getIDAShares(OUTPUTB_INDEX, shareholder);
        require(shares == 0, "Already streaming");
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
            _getLastDistributionAt(_superToken)
        );
        _cbdata = abi.encode(_uinvestAmount, int256(_flowRateMain));
    }


    // Src: Charm Finance, Unlicense
    // https://github.com/charmfinance/alpha-vaults-contracts/blob/07db2b213315eea8182427be4ea51219003b8c1a/contracts/AlphaStrategy.sol#L136
    // Modified to return a price in 1e6 decimals
    /// @dev Fetches time-weighted average price in ticks from Uniswap pool.
    /// @param _token The token to check decimals and scale the twap 
    /// @return _price The price in 1e6 decimals
    function getTwap(address _token) public view returns (uint _price) {
        uint32 _twapDuration = 30; // TODO: Parameterize this
        uint32[] memory secondsAgo = new uint32[](2);
        secondsAgo[0] = _twapDuration;
        secondsAgo[1] = 0;

        (int56[] memory tickCumulatives, ) = uniswapPool.observe(secondsAgo);

        // Converts the tick into a price (with 1e6 decimals of percision)
        _price = 1e18 / ((uint(TickMath.getSqrtRatioAtTick(int24((tickCumulatives[1] - tickCumulatives[0]) / int(uint(_twapDuration))))) / (2 ** 96)) ** 2 / 1**(18 - ERC20(_token).decimals()));
    }


    function _swap(
        ISuperToken input,
        ISuperToken output,
        uint256 amount
    ) internal returns (uint256) {
        address inputToken; // The underlying input token address
        address outputToken; // The underlying output token address
        address[] memory path; // The path to take
        uint256 minOutput; // The minimum amount of output tokens based on oracle
        uint256 outputAmount; // The balance before the swap

        inputToken = input.getUnderlyingToken();
        outputToken = output.getUnderlyingToken();

        // Downgrade and scale the input amount
        // Handle case input or output is native supertoken
        if (inputToken == address(0)) {
            inputToken = address(input);
        } else {
            input.downgrade(amount);
            // Scale it to 1e18 for calculations
            amount =
                ERC20(inputToken).balanceOf(address(this)) *
                (10**(18 - ERC20(inputToken).decimals()));
        }

        if (outputToken == address(0)) {
            outputToken = address(output);
        }

        // TODO: Calculate minOutput based on oracle
        uint twapPrice = getTwap(_getUnderlyingToken(input));

        if (input == inputTokenA) {
            minOutput = amount * 1e6 / twapPrice;
        } else {
            minOutput = amount * twapPrice / 1e6;
        }
        minOutput = (minOutput * (1e6 - market.rateTolerance)) / 1e6;

        // Scale back from 1e18 to outputToken decimals
        // minOutput = (minOutput * (10**(ERC20(outputToken).decimals()))) / 1e18;
        // Scale it back to inputToken decimals
        amount = amount / (10**(18 - ERC20(inputToken).decimals()));

        // Assumes a direct path to swap input/output
        path = new address[](2);
        path[0] = inputToken;
        path[1] = outputToken;

        IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter
            .ExactInputParams({
                path: _getEncodedPath(uniswapPath, poolFees),
                recipient: address(this),
                amountIn: amount,
                amountOutMinimum: minOutput
            });

        router.exactInput(params);
        console.log("1", ERC20(outputToken).balanceOf(address(this)));


        // if (address(output) != outputToken) {
        //     output.upgrade(
        //         ERC20(outputToken).balanceOf(address(this)) *
        //             (10**(18 - ERC20(outputToken).decimals()))
        //     );
        // }

        // Assumes `amount` was outputToken.balanceOf(address(this))
        outputAmount = ERC20(outputToken).balanceOf(address(this));

        return outputAmount;

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

    function _updateShareholder(
        bytes memory _ctx,
        ShareholderUpdate memory _shareholderUpdate
    ) internal override returns (bytes memory _newCtx) {
        // Check the input supertoken used and figure out the output Index
        // inputTokenA maps the OUTPUTB_INDEX
        // maybe a better way to do this
        uint32 outputIndex;
        uint32 subsidyIndex;
        if (
            market.outputPoolIndicies[_shareholderUpdate.token] == OUTPUTA_INDEX
        ) {
            outputIndex = OUTPUTB_INDEX;
            subsidyIndex = SUBSIDYB_INDEX;
            _shareholderUpdate.token = inputTokenB;
        } else {
            outputIndex = OUTPUTA_INDEX;
            subsidyIndex = SUBSIDYA_INDEX;
            _shareholderUpdate.token = inputTokenA;
        }

        (
            uint128 userShares,
            uint128 daoShares,
            uint128 affiliateShares
        ) = _getShareAllocations(_shareholderUpdate);

        _newCtx = _ctx;

        // TODO: Update the fee taken by the DAO, Affiliate
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            outputIndex,
            _shareholderUpdate.shareholder,
            userShares,
            market.outputPools[outputIndex].token
        );
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            subsidyIndex,
            _shareholderUpdate.shareholder,
            userShares,
            subsidyToken
        );
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            outputIndex,
            owner(),
            daoShares,
            market.outputPools[outputIndex].token
        );
        // Owner is not added to subsidy pool

        address affiliate = referrals.getAffiliateAddress(
            _shareholderUpdate.shareholder
        );
        if (affiliate != address(0)) {
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                outputIndex,
                affiliate,
                affiliateShares,
                market.outputPools[outputIndex].token
            );
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                subsidyIndex,
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
            address(_superToken) == address(inputTokenA) ||
            address(_superToken) == address(inputTokenB);
    }

    function _getLastDistributionAt(ISuperToken _token)
        internal
        view
        returns (uint256)
    {
        return
            market.outputPoolIndicies[_token] == OUTPUTA_INDEX
                ? lastDistributionTokenBAt
                : lastDistributionTokenAAt;
    }

    function _shouldDistribute() internal override returns (bool) {
        // TODO: This section should be checked,
        //       since it only checks one IDA,
        (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
            .getIndex(
                market.outputPools[OUTPUTA_INDEX].token,
                address(this),
                OUTPUTA_INDEX
            );
        if (_totalUnitsApproved + _totalUnitsPending > 0) {
            (, , _totalUnitsApproved, _totalUnitsPending) = ida.getIndex(
                market.outputPools[OUTPUTB_INDEX].token,
                address(this),
                OUTPUTB_INDEX
            );
            if (_totalUnitsApproved + _totalUnitsPending > 0) {
                return true;
            }
        }

        return false;
    }

    function _onlyScalable(ISuperToken _superToken, int96 _flowRate)
        internal
        override
    {
        if (market.outputPoolIndicies[_superToken] == OUTPUTA_INDEX) {
            require(
                uint128(uint256(int256(_flowRate))) %
                    (market.outputPools[OUTPUTB_INDEX].shareScaler * 1e3) ==
                    0,
                "notScalable"
            );
        } else {
            require(
                uint128(uint256(int256(_flowRate))) %
                    (market.outputPools[OUTPUTA_INDEX].shareScaler * 1e3) ==
                    0,
                "notScalable"
            );
        }
    }

    receive() external payable {}

}
