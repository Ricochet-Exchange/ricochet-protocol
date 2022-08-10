//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import { ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import "./TransferHelper.sol";
import "./interfaces/ISwapRouter02.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../ISETHCustom.sol";

import "hardhat/console.sol";


contract RexSuperSwap {
  using SafeERC20 for ERC20;
  ISwapRouter02 public immutable swapRouter;

  address public constant MATICX = 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3;

  event SuperSwapComplete(uint256 amountOut);

  constructor(ISwapRouter02 _swapRouter) {
    swapRouter = _swapRouter;
  }

  // Having unlimited approvals rather then dealing with decimal converisons.
    // Not a problem as contract is not storing any tokens.
    function approve(IERC20 _token, address _spender) internal {
        if (_token.allowance(_spender, msg.sender) == 0) {
            TransferHelper.safeApprove(address(_token), address(_spender), ((2 ** 256) - 1));
        }
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
    uint24[] memory poolFees, // Example: 0.3% * 10000 = 3000
    bool _hasUnderlyingFrom,
    bool _hasUnderlyingTo
  ) external payable returns (uint256 amountOut) {
    require(amountIn > 0, "Amount cannot be 0");
    require(path.length > 1, "Incorrect path");
    require(poolFees.length == path.length - 1, "Incorrect poolFees length");

    // Step 1: Get underlying tokens and verify path
    address fromBase = address(_from);
    address toBase = address(_to);
    if (_hasUnderlyingFrom) {
      fromBase = _from.getUnderlyingToken();
    }
    if(_hasUnderlyingTo){
      toBase = _to.getUnderlyingToken();
    }

    require(path[0] == fromBase, "Invalid 'from' base token");
    require(path[path.length - 1] == toBase, "Invalid 'to' base token");

    // Step 2: Transfer SuperTokens from sender
    TransferHelper.safeTransferFrom(
      address(_from),
      msg.sender,
      address(this),
      amountIn
    );

    console.log("starting balance of from token - ", _from.balanceOf(address(this)));

    // Step 3: Downgrade if it's not a native token
    if(_hasUnderlyingFrom){
      _from.downgrade(amountIn);
    }

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
    approve(IERC20(fromBase), address(swapRouter));

    console.log("balance of from token before swap - ", address(this).balance);

    IV3SwapRouter.ExactInputParams memory params = IV3SwapRouter
      .ExactInputParams({
        path: encodedPath,
        recipient: address(this),
        amountIn: ERC20(fromBase).balanceOf(address(this)),
        amountOutMinimum: amountOutMin
      });
    
    // Execute the swap
    amountOut = swapRouter.exactInput(params);

    console.log("balance of to token after swap - ", ERC20(toBase).balanceOf(address(this)));
  
    // Step 5: Upgrade and send tokens back
    approve(IERC20(toBase), address(_to));

    // Upgrade if it's not a native SuperToken
    if (_hasUnderlyingTo) {
      if (address(_to) == MATICX) {
        console.log("upgrade MATICX");
        // if MATICX then use different method to upgrade
        ISETHCustom(address(_to)).upgradeByETH{value: address(this).balance}();
      } else {
        console.log("reaching case to upgrade");
        _to.upgrade(amountOut * (10**(18 - ERC20(toBase).decimals())));
      }
    }

    approve(IERC20(address(_to)), msg.sender);
    
    console.log("balance of downgraded token after upgrade should be 0 - ", ERC20(toBase).balanceOf(address(this)));
    console.log("balance of swapped super token - ", _to.balanceOf(address(this)));
    // transfer swapped token back to user
    _to.transfer(msg.sender, _to.balanceOf(address(this)));
    emit SuperSwapComplete(amountOut);
  }
}
