contract LimitOrderManager {

    struct LimitOrder {
        bool isBuy;
        uint256 streamRate;
        address priceFeed;
        uint256 price;
        uint256 taskId;
        bool executed;
        address token;
    }

    mapping (address => mapping (address => LimitOrder)) public limitOrders; // inner mapping is for market Address

    event LimitOrderCreated(msg.sender, _market, _isBuy, _streamRate, _priceFeed, _price);

    function createLimitOrder(address _market, bool _isBuy, uint256 _streamRate, address _priceFeed, uint256 _price, address _token) {
        // check require (uer has given acl permissions to the contract)
        limitOrders[msg.sender][_market] = LimitOrder(_isBuy, _streamRate, _priceFeed, _price, 0, false, _token);
        createGelatoTask();
        emit LimitOrderCreated(msg.sender, _market, _isBuy, _streamRate, _priceFeed, _price);
    }

    function cancelLimitOrder(address _market) {
        delete limitOrders[msg.sender][_market];
    }

    function createGelatoTask() {
        // create gelato task
    }

    function updateUserStream(address _user, address _market) {
        // update user stream
        LimitOrder memory limitOrder = limitOrders[_user][_market];

        require(limitOrder.executed == false);
        
        if (limitOrder.isBuy) {
            if checkPriceFeed(limitOrder.priceFeed, limitOrder.price) < limitOrder.price {
                // start a stream to buy the token for the user
            }
        } else {
            if checkPriceFeed(limitOrder.priceFeed, limitOrder.price) > limitOrder.price {
                // start a stream to sell the token for the user
            }
        }
    }

    function checkPriceFeed(address _priceFeed, uint256 _price) returns (uint256) {
        // get price from chainlink price feed
    }
}