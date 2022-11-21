// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

interface IRexSuperSwap {
    function swap(
        ISuperToken _from,
        ISuperToken _to,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] memory path,
        uint24[] memory poolFees, // Example: 0.3% * 10000 = 3000
        bool _hasUnderlyingFrom,
        bool _hasUnderlyingTo
   ) external payable returns (uint256 amountOut);

}

