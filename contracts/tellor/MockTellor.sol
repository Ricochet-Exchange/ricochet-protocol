// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockTellor {
    uint8 public firstToken;

    constructor() {}

    function requestData(
        string memory token,
        string memory ticker,
        uint16 value,
        uint16 value2
    ) public {
        // requestData("USDT", "USDT/USD", 1000, 0);
    }
}
