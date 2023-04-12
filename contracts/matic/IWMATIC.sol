//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IWMATIC {
    function deposit() external payable;
    function transfer(address to, uint value) external returns (bool);
    function withdraw(uint) external;
    function balanceOf(address account) external view returns (uint256);
}
