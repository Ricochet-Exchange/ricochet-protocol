pragma solidity ^0.8.0;

/**
 * @title Ricochet's Uniswap V3 Market Interface
 *
 * @notice This interface defines the functions for managing Uniswap V3 markets in the Ricochet protocol.
 */
interface IREXUniswapV3Market {
    /**
     * @notice Get the latest price from the Chainlink Aggregator.
     * @dev The latest price is returned as an int.
     */
    function getLatestPrice() external view returns (int);

    function inputToken() external view returns (address);
}
