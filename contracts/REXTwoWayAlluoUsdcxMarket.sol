// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./REXMarket.sol";
import './ISETHCustom.sol';
import './alluo/IbAlluo.sol';

contract REXTwoWayAlluoUsdcxMarket is REXMarket {
    using SafeERC20 for ERC20;

    ISuperToken inputTokenA; // USDCx
    ISuperToken inputTokenB; // stibAlluoUSD

    uint32 constant OUTPUTB_INDEX = 0;
    uint32 constant SUBSIDYB_INDEX = 1;

    ISuperToken subsidyToken;

    // REX Two Way Alluo Market
    // - Accepts ibAlluoXXX and convert it to ibAlluoYYY (both directions)
    // - Sources liquidity using UniswapV2 liquidity pools

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
        ISuperToken _inputTokenB,
        uint128 _feeRate,
        uint256 _rateTolerance
    ) public onlyOwner initializer {
        inputTokenA = _inputTokenA;
        inputTokenB = _inputTokenB;
        market.inputToken = _inputTokenA; // market.inputToken isn't used but is set bc of the REXMarket
        market.rateTolerance = _rateTolerance;
        market.feeRate = _feeRate;
        market.affiliateFee = 500000;
        addOutputPool(
            inputTokenB,
            _feeRate,
            0
        );
        market.outputPoolIndicies[inputTokenB] = OUTPUTB_INDEX;


        // Approve stibAlluoUSD to upgrade ibAlluoUSD
        ERC20(inputTokenB.getUnderlyingToken()).safeIncreaseAllowance(
            address(inputTokenB),
            2**256 - 1
        );

        // Approve USDC to deposit to ibAlluoUSD
        ERC20(inputTokenA.getUnderlyingToken()).safeIncreaseAllowance(
            address(inputTokenB.getUnderlyingToken()),
            2**256 - 1
        );

        market.lastDistributionAt = block.timestamp;
    }

    function initializeSubsidies(
        uint256 _emissionRate,
        ISuperToken _subsidyToken
    ) public onlyOwner {
        subsidyToken = _subsidyToken;
        require(
            address(market.outputPools[SUBSIDYB_INDEX].token) == address(0),
            "already initialized"
        );
        addOutputPool(
            _subsidyToken,
            0,
            _emissionRate
        );

        market.lastDistributionAt = block.timestamp;
        // Does not need to add subsidy token to outputPoolIndicies
        // since these pools are hardcoded
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
        // updateTokenPrice(_token);
    }

    function distribute(bytes memory ctx)
        public
        override
        returns (bytes memory newCtx)
    {
        newCtx = ctx;

        IbAlluo ibTokenB = IbAlluo(inputTokenB.getUnderlyingToken());

        // Get token amounts in terms of USD
        uint256 tokenAAmount = inputTokenA.balanceOf(address(this));
        uint256 tokenBAmount;

        inputTokenA.downgrade(tokenAAmount - tokenBAmount);
        ibTokenB.deposit(inputTokenA.getUnderlyingToken(), ERC20(inputTokenA.getUnderlyingToken()).balanceOf(address(this)));
        inputTokenB.upgrade(ibTokenB.balanceOf(address(this)));

        // OK to distribute

        // At this point, we've got enough of tokenA and tokenB to perform the distribution
        // tokenAAmount = inputTokenA.balanceOf(address(this));
        tokenBAmount = inputTokenB.balanceOf(address(this));

        if (tokenBAmount == 0) {
            return newCtx;
        } else {

          (tokenBAmount, ) = ida.calculateDistribution(
              inputTokenB,
              address(this),
              OUTPUTB_INDEX,
              tokenBAmount
          );

          newCtx = _idaDistribute(
              OUTPUTB_INDEX,
              uint128(tokenBAmount),
              inputTokenB,
              newCtx
          );
          emit Distribution(tokenBAmount, 0, address(inputTokenB));

          // Distribution Subsidy
          uint256 distAmount =
              (block.timestamp - market.lastDistributionAt) *
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

          market.lastDistributionAt = block.timestamp;
        }
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
        (, , uint128 shares, ) = getIDAShares(OUTPUTB_INDEX, shareholder);
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

    function _updateShareholder(
        bytes memory _ctx,
        ShareholderUpdate memory _shareholderUpdate
    ) internal override returns (bytes memory _newCtx) {
        // Check the input supertoken used and figure out the output Index
        // inputTokenA maps the OUTPUTB_INDEX
        // maybe a better way to do this
        uint32 outputIndex;
        uint32 subsidyIndex;

        _shareholderUpdate.token = inputTokenB;


        (
            uint128 userShares,
            uint128 daoShares,
            uint128 affiliateShares
        ) = _getShareAllocations(_shareholderUpdate);

        _newCtx = _ctx;

        // TODO: Update the fee taken by the DAO, Affiliate
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            OUTPUTB_INDEX,
            _shareholderUpdate.shareholder,
            uint128(uint256(int256(_shareholderUpdate.currentFlowRate))),
            market.outputPools[OUTPUTB_INDEX].token
        );
        _newCtx = _updateSubscriptionWithContext(
            _newCtx,
            SUBSIDYB_INDEX,
            _shareholderUpdate.shareholder,
            uint128(uint256(int256(_shareholderUpdate.currentFlowRate))),
            subsidyToken
        );
    }

    function _isInputToken(ISuperToken _superToken)
        internal
        view
        override
        returns (bool)
    {
        return address(_superToken) == address(inputTokenA);
    }

    function _getLastDistributionAt(ISuperToken _token)
        internal
        view
        returns (uint256)
    {
        return market.lastDistributionAt;
    }

    function _shouldDistribute() internal override returns (bool) {
        // TODO: This section should be checked,
        //       since it only checks one IDA,

        (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida.getIndex(
            market.outputPools[OUTPUTB_INDEX].token,
            address(this),
            OUTPUTB_INDEX
        );
        if (_totalUnitsApproved + _totalUnitsPending > 0) {
            return true;
        }

        return false;
    }

}
