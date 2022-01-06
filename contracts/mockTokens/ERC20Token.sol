// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Token is ERC20 {
    constructor(uint256 initialSupply) ERC20("ERC20 Token", "TOKEN") {
        _mint(msg.sender, initialSupply);
    }
}
// The default value of decimals is 18. To select a different value for decimals you should overload it.