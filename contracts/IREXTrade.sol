// Interface for RexTrade.sol
//
// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

interface IRexTrade {
    function _startRexTrade(address _shareholder, int96 _flowRate, uint _indexValue, uint _units) external;
    function _endRexTrade(address _shareholder, uint _indexValue) external;
}