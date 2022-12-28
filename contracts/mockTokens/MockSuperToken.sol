pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockSupertoken is ERC20 {

  ERC20 public underlyingToken;

  constructor(
    ERC20 _underlyingToken
  ) ERC20("Supertoken", "ST") {
    underlyingToken = _underlyingToken;
  }

  function upgrade(uint amount) public {
    require(underlyingToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    _mint(msg.sender, amount);
  }
}