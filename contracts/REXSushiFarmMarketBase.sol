// contract REXSushiFarmMarketBase is REXMarketBase {

//   // Token addresses
//   address public constant sushi = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2;
//   address public constant sushix = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2; // TODO
//   address public constant maticx = 0x6B3595068778DD592e39A122f4f5a5cF09C90fE2; // TODO
//   uint256 public constant sushixRequestId = 60; // TODO
//   uint256 public constant maticxRequestId = 60; // TODO
//   address public constant sushiRouter = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;
//   address public constant masterChef = 0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd;

//   // Token to pair with market.inputToken
//   address public token1;

//   // Sushiswap Farm pool id (1 == WETH/USDC)
//   uint256 public poolId;

//   constructor(
//     address _token1,
//     uint256 _poolId,
//     ISuperfluid _host,
//     IConstantFlowAgreementV1 _cfa,
//     IInstantDistributionAgreementV1 _ida
//   ) public REXMarketBase(_host, _cfa, _ida) {

//     poolId = _poolId;
//     token1 = _token1;

//     addOutputPool(rexSlp, 20000, 0, 77);
//     addOutputPool(sushix, 200000, 0, 77);
//     addOutputPool(maticx, 200000, 0, 77);
//   }

//   // Converts input token to output token
//   function distribute() public virtual {  }

//   // Harvests rewards if any
//   function harvest() public virtual {  }

//   // Credit: Pickle.finance
//   function _swapAndDeposit(
//     uint256 amount,  // Assumes this is outputToken.balanceOf(address(this))
//     uint256 exchangeRate,
//     uint256 deadline
//   ) public returns(uint) {

//     ERC20 inputToken = ERC20(market.inputToken.getUnderlyingToken());
//     ERC20 pairToken = ERC20(token1);

//     // Downgrade all the input supertokens
//     self.inputToken.downgrade(market.inputToken.balanceOf(address(this)));

//     // Swap half of input tokens to pair tokens
//     uint256 _inTokenBalance = inputToken.balanceOf(address(this));
//     if (_inTokenBalance > 0) {
//       _swapSushiswap(address(inputToken), address(pairToken), _inTokenBalance / 2, exchangeRate);
//     }

//     // Adds liquidity for inputToken/pairToken
//     _inTokenBalance = inputToken.balanceOf(address(this));
//     uint256 _pairTokenBalance = pairToken.balanceOf(address(this));
//     if (_inTokenBalance > 0 && _pairTokenBalance > 0) {
//       pairToken.safeApprove(address(sushiRouter), 0);
//       pairToken.safeApprove(address(sushiRouter), _pairTokenBalance);
//       console.log("addLiquidity");
//       (uint amountA, uint amountB, uint liquidity) = self.sushiRouter.addLiquidity(
//           address(inputToken),
//           address(pairToken),
//           _inTokenBalance,
//           _pairTokenBalance,
//           0,
//           0,
//           address(this),
//           block.timestamp + 60
//       );
//       console.log("added liquidity", liquidity);
//       console.log("SLP test", self.slpToken.balanceOf(0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA));
//       console.log("SLP", address(self.slpToken));
//       uint256 slpBalance = self.slpToken.balanceOf(address(this));
//       console.log("This many SLP tokens", slpBalance);
//       // Deposit the SLP tokens recieved into MiniChef
//       self.slpToken.approve(address(self.miniChef), slpBalance);

//       self.miniChef.deposit(self.pid, slpBalance, address(this));
//       console.log("Deposited to minichef");
//       // Mint an equal amount of SLPx
//       IRicochetToken(address(self.outputToken)).mintTo(address(this), slpBalance, new bytes(0));
//       console.log("upgraded");
//     }

//   }

//     // Credit: Pickle.finance
//     function _swapSushiswap(
//         IUniswapV2Router02 sushiRouter,
//         address _from,
//         address _to,
//         uint256 _amount,
//         uint256 _exchangeRate // TODO: Integrate this is, after the swap check rates
//     ) internal {
//         require(_to != address(0));

//         address[] memory path;

//         // TODO: This is direct pairs, probably not the best
//         // if (_from == weth || _to == weth) {
//             path = new address[](2);
//             path[0] = _from;
//             path[1] = _to;
//         // } else {
//         //     path = new address[](3);
//         //     path[0] = _from;
//         //     path[1] = weth;
//         //     path[2] = _to;
//         // }

//         sushiRouter.swapExactTokensForTokens(
//             _amount,
//             0,
//             path,
//             address(this),
//             block.timestamp + 60
//         );

//         // TODO: Check that the output matches the exchange rate
//     }

//     function _harvest(StreamExchangeStorage.StreamExchange storage self) internal {
//       // Get SUSHI and MATIC reward
//       // Try to harvest from minichef, catch and continue iff there's no sushi
//       try self.miniChef.withdrawAndHarvest(self.pid, 0, address(this)) {
//       } catch Error(string memory reason) {
//         require(keccak256(bytes(reason)) == keccak256(bytes("BoringERC20: Transfer failed")), "!boringERC20Error");
//         return;
//       }

//       // Upgrade SUSHI and MATIC if any
//       uint256 sushis = IERC20(self.sushixToken.getUnderlyingToken()).balanceOf(address(this));
//       uint256 matics = IERC20(self.maticxToken.getUnderlyingToken()).balanceOf(address(this));

//       // Calculate the fee for MATIC
//       uint256 feeCollected = matics * self.harvestFeeRate / 1e6;
//       matics = matics - feeCollected;

//       // Upgrade and take a fee
//       IWMATIC(self.maticxToken.getUnderlyingToken()).withdraw(matics);
//       if (matics > 0) {
//         IMATICx(address(self.maticxToken)).upgradeByETH{value: matics}();
//         // TODO: Move this into IDA shares to reduce gas
//         self.maticxToken.transfer(self.owner, feeCollected);
//       }

//       // Calculate the fee
//       feeCollected = sushis * self.harvestFeeRate / 1e6;
//       sushis = sushis - feeCollected;
//       if (sushis > 0) {
//         self.sushixToken.upgrade(sushis);
//         // TODO: Move this into IDA shares to reduce gas
//         self.sushixToken.transfer(self.owner, feeCollected);
//       }
//     }

// }
