// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import {ERC20Mock} from "./ERC20Mock.sol";

contract UniswapRouterMock {
    // fakes a swap, mints the outToken (path[1]) to the receiver
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256, // amountOutMinimum
        address[] calldata path,
        address to,
        uint256 // deadline
    ) public returns (uint256[] memory) {
        ERC20Mock(path[0]).transferFrom(msg.sender, address(this), amountIn);
        ERC20Mock(path[1]).mint(to, amountIn);
        return new uint256[](0);
    }
}