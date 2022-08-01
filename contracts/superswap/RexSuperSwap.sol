//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import { ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import "./TransferHelper.sol";
import "./interfaces/ISwapRouter02.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract RexSuperSwap {
  using SafeERC20 for ERC20;
  ISwapRouter02 public immutable swapRouter;

  event SuperSwapComplete(uint256 amountOut);
  event SwapJustMade(uint256 amountIn);

  constructor(ISwapRouter02 _swapRouter) {
    swapRouter = _swapRouter;
  }

  /**
   * @dev Swaps `amountIn` of `_from` SuperToken for at least `amountOutMin`
   * of `_to` SuperToken through `path` with `poolFees` fees for each pair.
   *
   * Returns the amount of `_to` SuperToken received.
   */
  function swap(
    ISuperToken _from,
    ISuperToken _to,
    uint256 amountIn,
    uint256 amountOutMin,
    address[] memory path,
    uint24[] memory poolFees // Example: 0.3% * 10000 = 3000
  ) external returns (uint256 amountOut) {
    require(amountIn > 0, "Amount cannot be 0");
    require(path.length > 1, "Incorrect path");
    require(poolFees.length == path.length - 1, "Incorrect poolFees length");

    // Step 1: Get underlying tokens and verify path
    address fromBase = _from.getUnderlyingToken();
    address toBase = _to.getUnderlyingToken();

    require(path[0] == fromBase, "Invalid 'from' base token");
    require(path[path.length - 1] == toBase, "Invalid 'to' base token");
    // Step 2: Transfer SuperTokens from sender
    TransferHelper.safeTransferFrom(
      address(_from),
      msg.sender,
      address(this),
      amountIn
    );

    console.log("starting balance of Maticx - ", _from.balanceOf(address(this)));

    // Step 3: Downgrade
    _from.downgrade(amountIn);

    // Encode the path for swap
    bytes memory encodedPath;
    for (uint256 i = 0; i < path.length; i++) {
      if (i == path.length - 1) {
        encodedPath = abi.encodePacked(encodedPath, path[i]);
      } else {
        encodedPath = abi.encodePacked(encodedPath, path[i], poolFees[i]);
      }
    }

    // Approve the router to spend token supplied (fromBase).
    TransferHelper.safeApprove(fromBase, address(swapRouter), amountIn);

    console.log("balance of Maticx before swap - ", _from.balanceOf(address(this)));

    IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter
      .ExactInputParams({
        path: encodedPath,
        recipient: address(this),
        amountIn: amountIn,
        amountOutMinimum: amountOutMin
      });
    
    // Execute the swap
    amountOut = swapRouter.exactInput(params);

    console.log("balance of Maticx after swap - ", _from.balanceOf(address(this)));

    emit SwapJustMade(amountOut);

    // Step 5: Upgrade and send tokens back
    TransferHelper.safeApprove(address(toBase), address(_to), amountOut);
    _to.upgrade(amountOut);
    TransferHelper.safeApprove(address(_to), msg.sender, amountOut);
    // TransferHelper.safeTransfer(
    //   address(_to),
    //   msg.sender,
    //   amountOut
    // );
    // _to.transfer(msg.sender, amountOut);

    console.log("balance of usdcx after swap - ", _to.balanceOf(address(this)));
   
    // transfer swapped token back to user
    _to.transfer(msg.sender, _to.balanceOf(address(this)));
    emit SuperSwapComplete(amountOut);
  }
}
