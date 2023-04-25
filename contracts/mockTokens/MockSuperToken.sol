pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockSuperToken is ERC20 {
    ERC20 public underlyingToken;

    constructor(ERC20 _underlyingToken) ERC20("Supertoken", "ST") {
        underlyingToken = _underlyingToken;
    }

    function upgrade(uint amount) public {
        require(
            underlyingToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        _mint(msg.sender, amount);
    }

    function upgradeTo(address to, uint amount, bytes calldata data) public {
        require(
            underlyingToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        _mint(to, amount);
    }

    function getUnderlyingToken() public view returns (address) {
        return address(underlyingToken);
    }
}
