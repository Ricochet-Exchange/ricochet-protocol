pragma solidity ^0.8.0;

/**
 * @title Ricochet's Limit Order Manager Interface
 *
 * @notice This interface defines the functions for managing limit orders in the Ricochet protocol.
 *
 */
interface IREXLimitOrderManager {
    struct LimitOrder {
        bool isInverted;
        uint256 streamRate;
        uint256 price;
        uint256 taskId;
        bool executed;
    }

    /**
     *
     * @notice Creates a new limit order.
     * @dev The order is created with the specified parameters.
     * @param _market The address of the REX market where the order is placed for.
     * @param _isInverted A boolean indicating if the order is for an inverted market.
     * @param _streamRate The streaming rate for the order.
     * @param _price The price at which the order is placed.
     */
    function createLimitOrder(
        address _market,
        bool _isInverted,
        uint256 _streamRate,
        uint256 _price
    ) external;

    /**
     *
     * @notice Cancels a limit order.
     * @dev The order is cancelled for the specified market, msg.sender is used for user's address.
     * @param _market The address of the REX market where the order is placed for.
     */
    function cancelLimitOrder(address _market) external;

    /**
     *
     * @notice Updates the user's stream.
     * @dev The user's stream is updated based on the current price of the market.
     * @param _user The address of the user whose stream is updated.
     * @param _market The address of the REX market where the order is placed for.
     */
    function updateUserStream(address _user, address _market) external;
}
