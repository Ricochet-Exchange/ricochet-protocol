// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import './REXMarket.sol';
import './ISETHCustom.sol';
import './alluo/IbAlluo.sol';

contract REXTwoWayAlluoMarket is REXMarket {
  using SafeERC20 for ERC20;

  // DAI
  address constant inputTokenAUnderlying =
    0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;
  // // WBTC
  // address constant inputTokenBUnderlying = 0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6;
  // WETH
  address constant inputTokenBUnderlying =
    0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;

  ISuperToken inputTokenA;
  ISuperToken inputTokenB;
  uint32 constant OUTPUTA_INDEX = 0;
  uint32 constant OUTPUTB_INDEX = 1;
  uint32 constant SUBSIDYA_INDEX = 2;
  uint32 constant SUBSIDYB_INDEX = 3;
  uint256 lastDistributionTokenAAt;
  uint256 lastDistributionTokenBAt;
  ISuperToken subsidyToken;
  // Quickswap
  IUniswapV2Router02 router =
    IUniswapV2Router02(0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506);

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
    market.affiliateFee = 500000; // TODO: Parameterize this

    addOutputPool(inputTokenA, _feeRate, 0);
    addOutputPool(inputTokenB, _feeRate, 0);
    market.outputPoolIndicies[inputTokenA] = OUTPUTA_INDEX;
    market.outputPoolIndicies[inputTokenB] = OUTPUTB_INDEX;

    // Approve ibAlluoA to deposit inputTokenA
    ERC20(inputTokenAUnderlying).safeIncreaseAllowance(
      address(inputTokenA.getUnderlyingToken()),
      2 ** 256 - 1
    );

    // otherwise approve underlying for upgrade
    ERC20(inputTokenBUnderlying).safeIncreaseAllowance(
      address(inputTokenB.getUnderlyingToken()),
      2 ** 256 - 1
    );

    // Approve ibAlluoA to deposit inputTokenA
    ERC20(inputTokenA.getUnderlyingToken()).safeIncreaseAllowance(
      address(inputTokenA),
      2 ** 256 - 1
    );
    ERC20(inputTokenB.getUnderlyingToken()).safeIncreaseAllowance(
      address(inputTokenB),
      2 ** 256 - 1
    );

    ERC20(inputTokenAUnderlying).safeIncreaseAllowance(
      address(router),
      2 ** 256 - 1
    );
    ERC20(inputTokenBUnderlying).safeIncreaseAllowance(
      address(router),
      2 ** 256 - 1
    );

    market.lastDistributionAt = block.timestamp;
  }

  function initializeSubsidies(
    uint256 _emissionRate,
    ISuperToken _subsidyToken
  ) public onlyOwner {
    subsidyToken = _subsidyToken;
    require(
      address(market.outputPools[SUBSIDYA_INDEX].token) == address(0) &&
        address(market.outputPools[SUBSIDYB_INDEX].token) == address(0),
      'already initialized'
    );
    addOutputPool(_subsidyToken, 0, _emissionRate);
    addOutputPool(_subsidyToken, 0, _emissionRate);
    lastDistributionTokenAAt = block.timestamp;
    lastDistributionTokenBAt = block.timestamp;
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
    require(market.numOutputPools < 4, 'too many pools');

    OutputPool memory _newPool = OutputPool(_token, _feeRate, _emissionRate);
    market.outputPools[market.numOutputPools] = _newPool;
    market.outputPoolIndicies[_token] = market.numOutputPools;
    _createIndex(market.numOutputPools, _token);
    market.numOutputPools++;
  }

  function distribute(
    bytes memory ctx
  ) public override returns (bytes memory newCtx) {
    newCtx = ctx;

    IbAlluo ibTokenA = IbAlluo(inputTokenA.getUnderlyingToken());
    IbAlluo ibTokenB = IbAlluo(inputTokenB.getUnderlyingToken());

    // At this point, we've got enough of tokenA and tokenB to perform the distribution
    ibTokenA.updateRatio();
    ibTokenB.updateRatio();
    uint256 tokenAAmount = (inputTokenA.balanceOf(address(this)) *
      ibTokenA.growingRatio()) / 1e18;
    uint256 tokenBAmount = (inputTokenB.balanceOf(address(this)) *
      ibTokenB.growingRatio()) / 1e18;

    // TODO: get token price from oracle

    // Check how much inputTokenA we have already from tokenB
    // TODO: calculate token have using oracle
    uint256 tokenHave = 0; // tokenBAmount * tokenBprice / tokenAPrice;

    uint256 minOutput;
    // If we have more tokenA than we need, swap the surplus to inputTokenB
    if (tokenHave < tokenAAmount) {
      // tokenHave becomes tokenANeed
      tokenHave = tokenAAmount - tokenHave;
      // Convert token have A to ibAlluoA amount
      inputTokenA.downgrade((tokenHave * 1e18) / ibTokenA.growingRatio());

      ibTokenA.withdraw(inputTokenAUnderlying, tokenHave);

      _swap(
        inputTokenAUnderlying,
        inputTokenBUnderlying,
        ERC20(inputTokenAUnderlying).balanceOf(address(this)),
        0,
        block.timestamp + 3600
      );

      ibTokenB.deposit(
        inputTokenBUnderlying,
        ERC20(inputTokenBUnderlying).balanceOf(address(this))
      );
      inputTokenB.upgrade(ibTokenB.balanceOf(address(this)));
      // Otherwise we have more tokenB than we need, swap the surplus to inputTokenA
    } else {
      // TODO: Calculate token have using oracle
      tokenHave = 0;
      // (tokenAAmount * market.oracles[inputTokenA].usdPrice) /
      // market.oracles[inputTokenB].usdPrice;
      tokenHave = tokenBAmount - tokenHave;

      // Convert token have B to ibAlluoB amount
      inputTokenB.downgrade((tokenHave * 1e18) / ibTokenB.growingRatio());

      ibTokenB.withdrawTo(address(this), inputTokenBUnderlying, tokenHave);

      _swap(
        inputTokenBUnderlying,
        inputTokenAUnderlying,
        ERC20(inputTokenBUnderlying).balanceOf(address(this)),
        0,
        block.timestamp + 3600
      );
      // Deposit inputTokenAUnderlying
      ibTokenA.deposit(
        inputTokenAUnderlying,
        ERC20(inputTokenAUnderlying).balanceOf(address(this))
      );
      inputTokenA.upgrade(ibTokenA.balanceOf(address(this)));
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
      require(inputTokenA.balanceOf(address(this)) >= tokenAAmount, '!enough');
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
        market.outputPools[SUBSIDYA_INDEX].token.balanceOf(address(this))
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
      require(inputTokenB.balanceOf(address(this)) >= tokenBAmount, '!enough');
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
        market.outputPools[SUBSIDYB_INDEX].token.balanceOf(address(this))
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
    if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass)) return _ctx;
    (address shareholder, ) = abi.decode(_agreementData, (address, address));
    (, , uint128 shares, ) = getIDAShares(OUTPUTA_INDEX, shareholder);
    require(shares == 0, 'Already streaming');
    (, , shares, ) = getIDAShares(OUTPUTB_INDEX, shareholder);
    require(shares == 0, 'Already streaming');
  }

  function beforeAgreementTerminated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32, //_agreementId,
    bytes calldata _agreementData,
    bytes calldata _ctx
  ) external view virtual override returns (bytes memory _cbdata) {
    _onlyHost();
    if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass)) return _ctx;

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

  function _swap(
    address input,
    address output,
    uint256 amount,
    uint256 minOutput,
    uint256 deadline
  ) internal returns (uint256) {
    address[] memory path; // The path to take

    // Assumes a direct path to swap input/output
    path = new address[](2);
    path[0] = input;
    path[1] = output;

    router.swapExactTokensForTokens(
      amount,
      0,
      path,
      address(this),
      block.timestamp + 3600
    );
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
    if (market.outputPoolIndicies[_shareholderUpdate.token] == OUTPUTA_INDEX) {
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

    if (_shareholderUpdate.affiliate != address(0)) {
      _newCtx = _updateSubscriptionWithContext(
        _newCtx,
        outputIndex,
        _shareholderUpdate.affiliate,
        affiliateShares,
        market.outputPools[outputIndex].token
      );
    }
  }

  function _isInputToken(
    ISuperToken _superToken
  ) internal view override returns (bool) {
    return
      address(_superToken) == address(inputTokenA) ||
      address(_superToken) == address(inputTokenB);
  }

  function _getLastDistributionAt(
    ISuperToken _token
  ) internal view returns (uint256) {
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

  receive() external payable {}
}
