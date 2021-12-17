// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import './REXMarket.sol';

contract REXOneWayMarket is REXMarket {

  constructor(
    // TODO: Make 1 output pool as part of construction
    address _owner,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida
  ) public REXMarket(_owner, _host, _cfa, _ida) {

    // TODO

  }

  function distribute(bytes memory ctx) public override returns (bytes memory newCtx) {

    newCtx = ctx;

    require(market.oracles[market.outputPools[0].token].lastUpdatedAt >= block.timestamp - 3600, "!currentValue");

    _swap(market.inputToken, market.outputPools[0].token, ISuperToken(market.inputToken).balanceOf(address(this)), block.timestamp + 3600);

    // market.outputPools[0] MUST be the output token of the swap
    uint256 outputBalance = market.outputPools[0].token.balanceOf(address(this));
    (uint256 actualAmount,) = ida.calculateDistribution(
        market.outputPools[0].token,
        address(this),
        0,
        outputBalance);
    // Return if there's not anything to actually distribute
    if (actualAmount == 0) { return newCtx; }

    // Calculate the fee for making the distribution
    uint256 feeCollected = actualAmount * market.outputPools[0].feeRate / 1e6;
    uint256 distAmount = actualAmount - feeCollected;

    // Make the distribution
    newCtx = _idaDistribute(0, uint128(distAmount), market.outputPools[0].token, newCtx);
    emit Distribution(distAmount, feeCollected, address(market.outputPools[0].token));

    for( uint32 index = 1; index < market.numOutputPools; index++) {
      outputBalance = market.outputPools[index].token.balanceOf(address(this));
      if (outputBalance > 0) {
        if (market.outputPools[index].feeRate != 0) {
          feeCollected = outputBalance * market.outputPools[index].feeRate / 1e6;
          distAmount = outputBalance - feeCollected;
          newCtx = _idaDistribute(index, uint128(distAmount), market.outputPools[index].token, newCtx);
          emit Distribution(distAmount, feeCollected, address(market.outputPools[index].token));
          // TODO: ERC20 transfer fee
        } else {
          distAmount = (block.timestamp - market.lastDistributionAt) * market.outputPools[index].emissionRate;
          if (distAmount < outputBalance) {
            newCtx = _idaDistribute(index, uint128(distAmount), market.outputPools[index].token, newCtx);
            emit Distribution(distAmount, 0, address(market.outputPools[index].token));
          }
        }
      }
    }

  }

  function _swap(
        ISuperToken input,
        ISuperToken output,
        uint256 amount,  // Assumes this is outputToken.balanceOf(address(this))
        uint256 deadline
  ) internal returns(uint) {

   address inputToken;           // The underlying input token address
   address outputToken;          // The underlying output token address
   address[] memory path;        // The path to take
   uint256 minOutput;            // The minimum amount of output tokens based on Tellor
   uint256 outputAmount;         // The balance before the swap

   inputToken = input.getUnderlyingToken();
   outputToken = output.getUnderlyingToken();

   // Downgrade and scale the input amount
   input.downgrade(amount);
   // Scale it to 1e18 for calculations
   amount = ERC20(inputToken).balanceOf(address(this)) * (10 ** (18 - ERC20(inputToken).decimals()));

   minOutput = amount  * market.oracles[input].usdPrice / market.oracles[output].usdPrice;
   minOutput = minOutput * (1e6 - market.rateTolerance) / 1e6;

   // Scale back from 1e18 to outputToken decimals
   minOutput = minOutput * (10 ** (ERC20(outputToken).decimals())) / 1e18;
   // Scale it back to inputToken decimals
   amount = amount / (10 ** (18 - ERC20(inputToken).decimals()));

   // Assumes a direct path to swap input/output
   path = new address[](2);
   path[0] = inputToken;
   path[1] = outputToken;
   router.swapExactTokensForTokens(
      amount,
      0, // Accept any amount but fail if we're too far from the oracle price
      path,
      address(this),
      deadline
   );
   // Assumes `amount` was outputToken.balanceOf(address(this))
   outputAmount = ERC20(outputToken).balanceOf(address(this));
   require(outputAmount >= minOutput, "BAD_EXCHANGE_RATE: Try again later");

   // Convert the outputToken back to its supertoken version
   output.upgrade(outputAmount * (10 ** (18 - ERC20(outputToken).decimals())));

   return outputAmount;
 }

}
