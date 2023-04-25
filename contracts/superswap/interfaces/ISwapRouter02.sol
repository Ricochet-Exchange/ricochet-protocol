// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;
pragma abicoder v2;

import "./ISelfPermit.sol";

import "./IV2SwapRouter.sol";
import "./IV3SwapRouter.sol";
import "./IApproveAndCall.sol";
import "./IMulticallExtended.sol";

/// @title Router token swapping functionality
interface ISwapRouter02 is
    IV2SwapRouter,
    IV3SwapRouter,
    IApproveAndCall,
    IMulticallExtended,
    ISelfPermit
{

}
