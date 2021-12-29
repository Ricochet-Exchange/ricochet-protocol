// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import './REXMarket.sol';
import './RicochetToken.sol';
import './sushiswap/IMiniChefV2.sol';
import './matic/IWMATIC.sol';
import './superfluid/IMATICx.sol';

contract REXSushiFarmMarketBase is REXMarket {

  using SafeERC20 for IERC20;

  // Token addresses
  address public constant sushi = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2;
  address public constant sushix = 0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b; // TODO
  address public constant maticx = 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3; // TODO
  uint256 public constant sushixRequestId = 80; // TODO
  uint256 public constant maticxRequestId = 6; // TODO
  address public constant sushiRouter = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
  IMiniChefV2 public constant masterChef = IMiniChefV2(0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd);

  // Token to pair with market.inputToken
  address public token1;

  // Sushiswap Farm pool id (1 == WETH/USDC)
  uint256 public poolId;

  RicochetToken rexToken;

  IUniswapV2Router02 router;

  constructor(
    address _owner,
    address _slpAddress,
    address _token1,
    uint256 _poolId,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida
  ) public REXMarket(_owner, _host, _cfa, _ida) {

    RicochetToken _rexToken = new RicochetToken(_host);
    _rexToken.initialize(IERC20(_slpAddress), 18, "Ricochet SLP", "rexSLP");
    rexToken = _rexToken;
    poolId = _poolId;
    token1 = _token1;
    router = IUniswapV2Router02(sushiRouter);

    addOutputPool(ISuperToken(address(rexToken)), 20000, 0, 77);
    addOutputPool(ISuperToken(sushix), 200000, 0, 77);
    addOutputPool(ISuperToken(maticx), 200000, 0, 77);
  }

  // Converts input token to output token
  function distribute(bytes memory ctx) public override returns (bytes memory newCtx) {
    newCtx = ctx;

    require(market.oracles[market.outputPools[0].token].lastUpdatedAt >= block.timestamp - 3600, "!currentValue");

    _swapAndDeposit(ISuperToken(market.inputToken).balanceOf(address(this)),  block.timestamp + 3600);

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
  function harvest(bytes memory ctx) public override returns (bytes memory newCtx) {
    newCtx = ctx;
    // Get SUSHI and MATIC reward
    // Try to harvest from minichef, catch and continue iff there's no sushi
    try masterChef.withdrawAndHarvest(poolId, 0, address(this)) {
    } catch Error(string memory reason) {
      // If no sushi, withdraw errors with boringERC20Error
      require(keccak256(bytes(reason)) == keccak256(bytes("BoringERC20: Transfer failed")), "!boringERC20Error");
      return newCtx;
    }

    for (uint32 i = 1; i <= 2; i++) {
      uint256 tokens = IERC20(market.outputPools[i].token.getUnderlyingToken()).balanceOf(address(this));

      // Calculate the fee
      uint256 feeCollected = tokens * market.outputPools[i].feeRate / 1e6;
      tokens = tokens - feeCollected;

      // Upgrade and take a fee
      if (tokens > 0) {
        // Special case for handling native MATIC
        if (maticx == address(market.outputPools[i].token)) {
          IWMATIC(market.outputPools[i].token.getUnderlyingToken()).withdraw(tokens);
          IMATICx(address(maticx)).upgradeByETH{value: tokens}();
        } else {
          market.outputPools[i].token.upgrade(tokens);
        }
        // TODO: This should be done in IDA, maybe?
        market.outputPools[i].token.transfer(market.owner, feeCollected);
      }
    }
    return newCtx;
  }

  // Credit: Pickle.finance
  function _swapAndDeposit(
    uint256 amount,  // Assumes this is outputToken.balanceOf(address(this))
    uint256 deadline
  ) public returns(uint) {

    ERC20 inputToken = ERC20(market.inputToken.getUnderlyingToken());
    ERC20 pairToken = ERC20(token1);

    // Downgrade all the input supertokens
    market.inputToken.downgrade(market.inputToken.balanceOf(address(this)));

    // Swap half of input tokens to pair tokens
    uint256 inTokenBalance = inputToken.balanceOf(address(this));
    uint256 minOutputAmount = inTokenBalance * market.oracles[market.inputToken].usdPrice / market.oracles[ISuperToken(token1)].usdPrice;
    if (inTokenBalance > 0) {
      _swapSushiswap(address(inputToken), address(pairToken), inTokenBalance / 2, minOutputAmount);
    }

    // Adds liquidity for inputToken/pairToken
    inTokenBalance = inputToken.balanceOf(address(this));
    uint256 _pairTokenBalance = pairToken.balanceOf(address(this));
    if (inTokenBalance > 0 && _pairTokenBalance > 0) {
      // TODO: Move approvals to the constructor
      pairToken.approve(address(router), _pairTokenBalance);
      (uint amountA, uint amountB, uint liquidity) = router.addLiquidity(
          address(inputToken),
          address(pairToken),
          inTokenBalance,
          _pairTokenBalance,
          0,
          0,
          address(this),
          block.timestamp + 60
      );
      uint256 slpBalance = ERC20(rexToken.getUnderlyingToken()).balanceOf(address(this));
      // Deposit the SLP tokens recieved into MiniChef
      // TODO: Unlimited approvals in the constructor
      ERC20(rexToken.getUnderlyingToken()).approve(address(masterChef), slpBalance);

      masterChef.deposit(poolId, slpBalance, address(this));
      rexToken.mintTo(address(this), slpBalance, new bytes(0));
    }

  }

    // Credit: Pickle.finance
    function _swapSushiswap(
        address _from,
        address _to,
        uint256 _amount,
        uint256 _minOutputAmount // TODO: Integrate this is, after the swap check rates
    ) internal {
        require(_to != address(0));

        address[] memory path;

        // TODO: Support changing the path
        path = new address[](2);
        path[0] = _from;
        path[1] = _to;

        router.swapExactTokensForTokens(
            _amount,
            _minOutputAmount,
            path,
            address(this),
            block.timestamp + 60
        );

    }

}
