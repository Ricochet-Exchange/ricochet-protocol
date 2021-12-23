contract REXOneWayMarket is REXMarketBase {

  constructor(
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida
  ) public REXMarketBase(_host, _cfa, _ida) {

    // TODO

  }

  function updateOraclePrices

  function distribute(bytes memory ctx) external returns (bytes memory newCtx) {
    newCtx = ctx;

   require(market.oracles[market.outputPools[0].token] >= block.timestamp - 3600, "!currentValue");

   _swap(self, ISuperToken(market.inputToken).balanceOf(address(this)), _value, block.timestamp + 3600);

   // market.outputPools[0] MUST be the output token of the swap
   uint256 outputBalance = market.outputPools[0].token.balanceOf(address(this));
   (uint256 actualAmount,) = self.ida.calculateDistribution(
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
    newCtx = _idaDistribute(self, self.outputIndexId, uint128(distAmount), self.outputToken, newCtx);
    emit Distribution(distAmount, feeCollected, address(self.outputToken));

    outputBalance = market.outputPools[1].token.balanceOf(addres(this));
    if (market.numOutputPools > 1 &&  outputBalance > 0) {
      // market.outputPools[1] MUST be the subsidy token
      distAmount = (block.timestamp - self.lastDistributionAt) * self.subsidyRate;
      if (distAmount < outputBalance) {
        newCtx = _idaDistribute(self, self.subsidyIndexId, uint128(subsidyAmount), self.subsidyToken, newCtx);
        emit Distribution(subsidyAmount, 0, address(self.subsidyToken));
      }
    }

  }

}
