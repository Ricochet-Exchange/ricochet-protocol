// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

contract REXSushiFarmMarketBase is REXMarketBase {

  // Token addresses
  address public constant sushi = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2;
  address public constant sushix = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2; // TODO
  address public constant maticx = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2; // TODO
  address public constant slp = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2;
  uint256 public constant sushixRequestId = 60; // TODO
  uint256 public constant maticxRequestId = 60; // TODO
  address public constant sushiRouter = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
  address public constant masterChef = 0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd;

  // Token to pair with market.inputToken
  address public token1;

  // Sushiswap Farm pool id (1 == WETH/USDC)
  uint256 public poolId;

  constructor(
    address _token1,
    uint256 _poolId,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida
  ) public REXMarketBase(_host, _cfa, _ida) {

    // TODO: The rexLP token should get created here

    poolId = _poolId;
    token1 = _token1;

    addOutputPool(rexSlp, 20000, 0, 77);
    addOutputPool(sushix, 200000, 0, 77);
    addOutputPool(maticx, 200000, 0, 77);
  }

  // Converts input token to output token
  function distribute(bytes memory ctx) public override returns (bytes memory newCtx) {
    newCtx = ctx;

    require(market.oracles[market.outputPools[0].token].lastUpdatedAt >= block.timestamp - 3600, "!currentValue");

    _swapAndDeposit(market.inputToken, market.outputPools[0].token, ISuperToken(market.inputToken).balanceOf(address(this)), block.timestamp + 3600);

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

    // Make the distribution for output pool 0
    newCtx = _idaDistribute(0, uint128(distAmount), market.outputPools[0].token, newCtx);
    emit Distribution(distAmount, feeCollected, address(market.outputPools[0].token));

    // Go through the other OutputPools and trigger distributions
    for( uint32 index = 1; index < market.numOutputPools; index++) {
      outputBalance = market.outputPools[index].token.balanceOf(address(this));
      if (outputBalance > 0) {
        // Should oneway market only support subsidy tokens?
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

  // Harvests rewards if any
  function harvest(bytes memory ctx) public override returns (bytes memory ctx) {

    // Get SUSHI and MATIC reward
    // Try to harvest from minichef, catch and continue iff there's no sushi
    try MiniChef(masterChef).withdrawAndHarvest(poolId, 0, address(this)) {
    } catch Error(string memory reason) {
      // If no sushi, withdraw errors with boringERC20Error
      require(keccak256(bytes(reason)) == keccak256(bytes("BoringERC20: Transfer failed")), "!boringERC20Error");
      return;
    }

    for (uint i = 1; i <= 2; i++) {
      uint256 tokens = IERC20(market.outputPools[i].token.getUnderlyingToken()).balanceOf(address(this));

      // Calculate the fee
      uint256 feeCollected = tokens * market.outputPools[i].feeRate / 1e6;
      tokens = tokens - feeCollected;

      // Upgrade and take a fee
      if (tokens > 0) {
        // Special case for handling native MATIC
        if (maticx == market.outputPools[i].token) {
          IWMATIC(market.outputPools[i].token.getUnderlyingToken()).withdraw(matics);
          IMATICx(address(self.maticxToken)).upgradeByETH{value: matics}();
        } else {
          market.outputPools[i].token.upgrade(tokens);
        }
        market.outputPools[i].token.transfer(self.owner, feeCollected);
      }
    }
  }

  // Credit: Pickle.finance
  function _swapAndDeposit(
    uint256 amount,  // Assumes this is outputToken.balanceOf(address(this))
    uint256 exchangeRate,
    uint256 deadline
  ) public returns(uint) {

    ERC20 inputToken = ERC20(market.inputToken.getUnderlyingToken());
    ERC20 pairToken = ERC20(token1);

    // Downgrade all the input supertokens
    market.inputToken.downgrade(market.inputToken.balanceOf(address(this)));

    // Swap half of input tokens to pair tokens
    uint256 _inTokenBalance = inputToken.balanceOf(address(this));
    if (_inTokenBalance > 0) {
      _swapSushiswap(address(inputToken), address(pairToken), _inTokenBalance / 2, exchangeRate);
    }

    // Adds liquidity for inputToken/pairToken
    _inTokenBalance = inputToken.balanceOf(address(this));
    uint256 _pairTokenBalance = pairToken.balanceOf(address(this));
    if (_inTokenBalance > 0 && _pairTokenBalance > 0) {
      pairToken.safeApprove(address(sushiRouter), 0);
      pairToken.safeApprove(address(sushiRouter), _pairTokenBalance);
      console.log("addLiquidity");
      (uint amountA, uint amountB, uint liquidity) = router.addLiquidity(
          address(inputToken),
          address(pairToken),
          _inTokenBalance,
          _pairTokenBalance,
          0,
          0,
          address(this),
          block.timestamp + 60
      );
      uint256 slpBalance = self.slpToken.balanceOf(address(this));
      console.log("This many SLP tokens", slpBalance);
      // Deposit the SLP tokens recieved into MiniChef
      self.slpToken.approve(address(self.miniChef), slpBalance);

      self.miniChef.deposit(self.pid, slpBalance, address(this));
      console.log("Deposited to minichef");
      // Mint an equal amount of SLPx
      IRicochetToken(address(self.outputToken)).mintTo(address(this), slpBalance, new bytes(0));
      console.log("upgraded");
    }

  }

    // Credit: Pickle.finance
    function _swapSushiswap(
        IUniswapV2Router02 sushiRouter,
        address _from,
        address _to,
        uint256 _amount,
        uint256 _exchangeRate // TODO: Integrate this is, after the swap check rates
    ) internal {
        require(_to != address(0));

        address[] memory path;

        // TODO: This is direct pairs, probably not the best
        // if (_from == weth || _to == weth) {
            path = new address[](2);
            path[0] = _from;
            path[1] = _to;
        // } else {
        //     path = new address[](3);
        //     path[0] = _from;
        //     path[1] = weth;
        //     path[2] = _to;
        // }

        sushiRouter.swapExactTokensForTokens(
            _amount,
            0,
            path,
            address(this),
            block.timestamp + 60
        );

        // TODO: Check that the output matches the exchange rate
    }

}
