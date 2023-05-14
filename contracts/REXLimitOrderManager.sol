pragma solidity ^0.8.0;

import {ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperToken.sol";

import {SuperTokenV1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperTokenV1Library.sol";

import "./IREXUniswapV3Market.sol";

/**
 * @title Ricochet's Limit Order Manager
 *
 * @notice This contract manages limit orders in the Ricochet protocol.
 *
 */
contract REXLimitOrderManager {
    using SuperTokenV1Library for ISuperToken;

    struct LimitOrder {
        bool isInverted;
        uint256 streamRate;
        uint256 price;
        bytes32 taskId;
        bool executed;
    }

    /**
     * @notice This mapping stores the limit orders for each user.
     * @dev The mapping is indexed by user address and market address.
     *
     */
    mapping(address => mapping(address => LimitOrder)) public limitOrders;

    event LimitOrderCreated(
        address _user,
        address _market,
        bool _isInverted,
        uint256 _streamRate,
        uint256 _price
    );

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
    ) external {
        IREXUniswapV3Market market = IREXUniswapV3Market(_market);
        ISuperToken token = ISuperToken(market.inputToken());

        require(
            token.isOperatorFor(address(this), msg.sender),
            "No ACL permission"
        );

        bytes32 taskId = createGelatoTask(); // TODO: create gelato task

        limitOrders[msg.sender][_market] = LimitOrder(
            _isInverted,
            _streamRate,
            _price,
            taskId,
            false
        );
        emit LimitOrderCreated(
            msg.sender,
            _market,
            _isInverted,
            _streamRate,
            _price
        );
    }

    /**
     *
     * @notice Cancels a limit order.
     * @dev The order is cancelled for the specified market, msg.sender is used for user's address.
     * @param _market The address of the REX market where the order is placed for.
     */
    function cancelLimitOrder(address _market) public {
        LimitOrder memory order = limitOrders[msg.sender][_market];
        order.executed = true; // fail safe

        cancelGelatoTask(order.taskId); // TODO: cancel gelato task
    }

    function createGelatoTask() internal returns (bytes32 taskId) {
        // TODO: create gelato task
    }

    function cancelGelatoTask(bytes32 _taskId) internal {
        // TODO: cancel gelato task
    }

    /**
     * 
     * @notice Updates the user's stream if order is in limit.
     * @dev The user's stream is updated based on the current price of the market.
     * @param _user The address of the user whose stream is updated.
     * @param _market The address of the REX market where the order is placed for. 
     */
    function updateUserStream(address _user, address _market) external {
        LimitOrder memory order = limitOrders[_user][_market];
        require(order.executed == false, "Already executed");

        IREXUniswapV3Market market = IREXUniswapV3Market(_market);
        ISuperToken token = ISuperToken(market.inputToken());
        uint256 price = uint256(uint(market.getLatestPrice()));
        if (price < order.price) {
            token.createFlowFrom(_user, _market, order.streamRate);
        }
    }
}
