// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "./libraries/REXUniswapV2Adapter.sol";

import "./REXMarket.sol";
import "./RicochetToken.sol";
import "./sushiswap/IMiniChefV2.sol";
import "./matic/IWMATIC.sol";
import "./superfluid/IMATICx.sol";


contract REXSushiFarmMarket is REXMarket {

  using SafeERC20 for ERC20;
  using REXUniswapV2Adapter for IUniswapV2Router02;

  // Token addresses
  address public constant sushi = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2;
  ISuperToken public constant sushix = ISuperToken(0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b); // TODO
  ISuperToken public constant maticx = ISuperToken(0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3); // TODO
  uint256 public constant sushixRequestId = 80; // TODO
  uint256 public constant maticxRequestId = 6; // TODO
  address public constant sushiRouter = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
  IMiniChefV2 public constant masterChef = IMiniChefV2(0x0769fd68dFb93167989C6f7254cd0D766Fb2841F);

  // Token to pair with market.inputToken
  address public pairToken;

  // Sushiswap Farm pool id (1 == WETH/USDC)
  uint256 public poolId;

  RicochetToken rexToken;

  IUniswapV2Router02 router;

  constructor(
    address _owner,
    address _slpAddress,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida,
    string memory _registrationKey,
    IREXReferral _rexReferral
  ) public REXMarket(_owner, _host, _cfa, _ida, _registrationKey, _rexReferral) {

    RicochetToken _rexToken = new RicochetToken(_host);
    _rexToken.initialize(ERC20(_slpAddress), 18, "Ricochet SLP", "rexSLP");
    rexToken = _rexToken;
    router = IUniswapV2Router02(sushiRouter);
  }

  function initializeMarket(
    ISuperToken _inputToken,
    uint256 _rateTolerance,
    ITellor _tellor,
    uint256 _inputTokenRequestId,
    uint128 _affiliateFee,
    uint128 _feeRate
  ) public override onlyOwner {
    REXMarket.initializeMarket(_inputToken,_rateTolerance,_tellor,_inputTokenRequestId, _affiliateFee, _feeRate);
    //NOTE: REXLP token doesnt have a oracle price...
    addOutputPool(ISuperToken(address(rexToken)), 20000, 0, 77);
    addOutputPool(sushix, 200000, 0, 78);
    addOutputPool(maticx, 200000, 0, 6);
  }

  function initializeSushiFarmMarket(
    address _pairToken,
    uint256 _pairTokenRequestId,
    uint256 _poolId
  ) public onlyOwner {

    require(pairToken == address(0), "Already initialized");
    poolId = _poolId;
    pairToken = _pairToken;
    // TODO: ISuperToken is getting used here for a plain erc20
    //       best to refactor ISuperToken to just address in oracleInfo
    OracleInfo memory newOracle = OracleInfo(_pairTokenRequestId, 0, 0);
    market.oracles[ISuperToken(pairToken)] = newOracle;
    updateTokenPrice(ISuperToken(pairToken));

    // Approvals
    ERC20(pairToken).safeIncreaseAllowance(address(router), 2**256 - 1);
    ERC20(market.inputToken.getUnderlyingToken()).safeIncreaseAllowance(address(router), 2**256 - 1);
    ERC20(rexToken.getUnderlyingToken()).safeIncreaseAllowance(address(masterChef), 2**256 - 1);
    ERC20(rexToken.getUnderlyingToken()).safeIncreaseAllowance(address(rexToken), 2**256 - 1);
    ERC20(sushix.getUnderlyingToken()).safeIncreaseAllowance(address(sushix), 2**256 - 1);
    ERC20(maticx.getUnderlyingToken()).safeIncreaseAllowance(address(maticx), 2**256 - 1);

  }

  function getRexTokenAddress() public view returns (address) {
    return address(rexToken);
  }

  /// @dev Get SushiSwap router address
  /// @return SushiSwap router address
  function getRouter() external view returns (address) {
    return address(router);
  }

  // Converts input token to output token
  function distribute(bytes memory ctx) public override returns (bytes memory newCtx) {

    newCtx = ctx;

    // TODO: This should check the oracle's updated for inputToken and pairToken
    require(market.oracles[market.inputToken].lastUpdatedAt >= block.timestamp - 3600, "!currentValue");

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
    market.outputPools[0].token.transfer(owner(), feeCollected);
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
          market.outputPools[index].token.transfer(owner(), feeCollected);
          emit Distribution(distAmount, feeCollected, address(market.outputPools[index].token));
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
  function harvest(bytes memory ctx) public returns (bytes memory newCtx) {

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
      uint256 tokens = ERC20(market.outputPools[i].token.getUnderlyingToken()).balanceOf(address(this));


      // Calculate the fee
      uint256 feeCollected = tokens * market.outputPools[i].feeRate / 1e6;
      tokens = tokens - feeCollected;

      // Upgrade and take a fee
      if (tokens > 0) {
        // Special case for handling native MATIC
        if (maticx == market.outputPools[i].token) {
          IWMATIC(market.outputPools[i].token.getUnderlyingToken()).withdraw(tokens);
          IMATICx(address(maticx)).upgradeByETH{value: tokens}();
        } else {
          market.outputPools[i].token.upgrade(tokens);
        }
      }
    }
    return newCtx;
  }

  // Credit: Pickle.finance
  function _swapAndDeposit(
    uint256 amount,  // Assumes this is outputToken.balanceOf(address(this))
    uint256 deadline
  ) public returns(uint) {


    ERC20 _inputToken = ERC20(market.inputToken.getUnderlyingToken());
    ERC20 _pairToken = ERC20(pairToken);

    // Swap half of input tokens to pair tokens
    uint256 inTokenBalance = _inputToken.balanceOf(address(this));
    uint256 minOutput = getMinimumSwapOutput(market.inputToken, ISuperToken(pairToken), inTokenBalance);

    if (inTokenBalance > 0) {
      router.swap(market.inputToken, ISuperToken(pairToken), inTokenBalance / 2, minOutput, block.timestamp + 60, false);
    }

    // Downgrade the remaining input supertokens
    market.inputToken.downgrade(market.inputToken.balanceOf(address(this)));

    // Adds liquidity for inputToken/pairToken
    inTokenBalance = _inputToken.balanceOf(address(this));
    uint256 _pairTokenBalance = _pairToken.balanceOf(address(this));
    if (inTokenBalance > 0 && _pairTokenBalance > 0) {

      // TODO: Move approvals to the constructor
      _pairToken.approve(address(router), _pairTokenBalance);
      (uint amountA, uint amountB, uint liquidity) = router.addLiquidity(
          address(_inputToken),
          address(_pairToken),
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

  fallback() external payable { }

}
