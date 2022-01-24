// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./libraries/REXUniswapV2Adapter.sol";

import './REXMarket.sol';
import './referral/IREXReferral.sol';

contract REXOneWayMarket is REXMarket {
  using SafeERC20 for ERC20;
  using REXUniswapV2Adapter for IUniswapV2Router02;

  uint32 constant OUTPUT_INDEX = 0;
  IUniswapV2Router02 router;
    // REX One Way Market Contracts
    // - Swaps the accumulated input tokens for output token
    // - Option to add subsidy tokens (can't be the same as the output token)

  constructor(
    address _owner,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida,
    string memory _registrationKey,
    IREXReferral _rexReferral
  ) public REXMarket(_owner, _host, _cfa, _ida, _registrationKey, _rexReferral) {

  }

  function initializeOneWayMarket(
    IUniswapV2Router02 _router,
    ITellor _tellor,
    ISuperToken _inputToken,
    uint256 _rateTolerance,
    uint256 _inputTokenRequestId,
    ISuperToken _outputToken,
    uint128 _feeRate,
    uint256 _ouptutTokenRequestId) public onlyOwner initializer {

    router = _router;
    REXMarket.initializeMarket(_inputToken, _rateTolerance, _tellor, _inputTokenRequestId, 100000, _feeRate);
    addOutputPool(_outputToken, _feeRate, 0, _ouptutTokenRequestId);

    // Approvals
    // Unlimited approve for sushiswap
    ERC20(market.inputToken.getUnderlyingToken()).safeIncreaseAllowance(
        address(router),
        2**256 - 1
    );
    // ERC20(market.outputPools[0].token.getUnderlyingToken()).safeIncreaseAllowance(
    //     address(router),
    //     2**256 - 1
    // );
    // and Supertoken upgrades
    ERC20(market.inputToken.getUnderlyingToken()).safeIncreaseAllowance(
        address(market.inputToken),
        2**256 - 1
    );
    ERC20(address(market.outputPools[OUTPUT_INDEX].token)).safeIncreaseAllowance(
        address(market.outputPools[OUTPUT_INDEX].token),
        2**256 - 1
    );

  }

  function setRouter(address _router) public onlyOwner {
    router = IUniswapV2Router02(_router);
  }

  function distribute(bytes memory ctx) public override returns (bytes memory newCtx) {

    newCtx = ctx;

    require(market.oracles[market.outputPools[OUTPUT_INDEX].token].lastUpdatedAt >= block.timestamp - 3600, "!currentValue");

    uint256 minOutput = getMinimumSwapOutput(market.inputToken, market.outputPools[OUTPUT_INDEX].token, ISuperToken(market.inputToken).balanceOf(address(this)));
    router.swap(market.inputToken, market.outputPools[OUTPUT_INDEX].token, ISuperToken(market.inputToken).balanceOf(address(this)), minOutput, block.timestamp + 3600);

    // market.outputPools[0] MUST be the output token of the swap
    uint256 outputBalance = market.outputPools[OUTPUT_INDEX].token.balanceOf(address(this));
    (uint256 actualAmount,) = ida.calculateDistribution(
        market.outputPools[0].token,
        address(this),
        0,
        outputBalance);
    // Return if there's not anything to actually distribute
    if (actualAmount == 0) { return newCtx; }

    // Calculate the fee for making the distribution
    uint256 feeCollected = actualAmount * market.feeRate / 1e6;
    uint256 distAmount = actualAmount - feeCollected;

    console.log("ouptutBalance", outputBalance);
    console.log("actualAmount", actualAmount);
    console.log("feesCollected", feeCollected);
    console.log("distAmount", distAmount);

    // Make the distribution for output pool 0
    newCtx = _idaDistribute(0, uint128(actualAmount), market.outputPools[OUTPUT_INDEX].token, newCtx);
    emit Distribution(actualAmount, feeCollected, address(market.outputPools[OUTPUT_INDEX].token));

    // Go through the other OutputPools and trigger distributions
    for( uint32 index = 1; index < market.numOutputPools; index++) {
      outputBalance = market.outputPools[index].token.balanceOf(address(this));
      if (outputBalance > 0) {
        // Should oneway market only support subsidy tokens?
        if (market.feeRate != 0) {
          newCtx = _idaDistribute(index, uint128(outputBalance), market.outputPools[index].token, newCtx);
          emit Distribution(outputBalance, feeCollected, address(market.outputPools[index].token));
        } else {
          actualAmount = (block.timestamp - market.lastDistributionAt) * market.outputPools[index].emissionRate;
          if (actualAmount < outputBalance) {
            newCtx = _idaDistribute(index, uint128(actualAmount), market.outputPools[index].token, newCtx);
            emit Distribution(actualAmount, 0, address(market.outputPools[index].token));
          }
        }
      }
    }

    market.lastDistributionAt = block.timestamp;

  }

}
