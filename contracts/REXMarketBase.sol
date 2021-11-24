contract REXMarketBase {

  // REX Market Base Contract
  //
  // Responsibilities:
  // - Reusable superfluid functionality
  // - Oracle management functionality
  // - IDA pool share management functionality
  //
  // Deployment Sequence:
  // - Construct the contract with the Superfluid and owner info
  // - Initialize the input token and props (initializeMarket)
  // - Add first output pool which is the main output token sent (addOutputPool)
  // - Add second output pool which is the subsidy token send (addOutputPool)
  //
  // Extending REX Markets:
  // - Contract should be extended and the extending contract should override:
  //   - distribute() - must take accumulated input tokens, convert to
  //                    output tokens and distribute to output pool
  //   - harvest() - (optional) must harvest yield, aggregate it such so that
  //                 the distrute method can distribute it

  struct OracleInfo {
    uint256 requestId;
    uint256 usdPrice;
    uint256 lastUpdatedAt;
  }

  struct OutputPool {
      Token token;
      uint128 feeRate;           // Fee taken by the DAO on each output distribution
      uint256 emissionRate;      // Rate to emit tokens if there's a balance, used for subsidies
  }

  struct Market {
    ISuperToken inputToken;
    uint256 lastDistributionAt;                   // The last time a distribution was made
    uint256 rateTolerance;                        // The percentage to deviate from the oracle scaled to 1e6
    address owner;                                // The owner of the market (reciever of fees)
    mapping(address => OracleInfo) oracles;           // Maps tokens to their oracle info
    mapping(uint32 => OutputPool) outputPools;   // Maps IDA indexes to their distributed Supertokens
    uint8 numOutputPools;                        // Indexes outputPools and outputPoolFees
  }

  ISuperfluid host;                     // Superfluid host contract
  IConstantFlowAgreementV1 cfa;         // The stored constant flow agreement class address
  IInstantDistributionAgreementV1 ida;  // The stored instant dist. agreement class address
  IUniswapV2Router02 router;            // Address of uniswap compatible router
  ITellor tellor;                       // Address of deployed simple oracle for input//output token
  Market market;

  constructor(address _owner, ISuperfluid _host, IConstantFlowAgreementV1 _cfa, IInstantDistributionAgreementV1 _ida) public {
    host = _host;
    cfa = _cfa;
    ida = _ida;
    owner = _owner;
  }

// Market initialization methods

  function initializeMarket(
    ISuperToken _inputToken,
    uint256 _rateTolerance,
    ITellor _tellor,
    uint256 _inputTokenRequestId) public onlyOwner {

    require(market.inputToken == address(0), "!reinitable");
    require(oracle == address(0), "!reinitable");
    market.inputToken = _inputToken;
    market.rateTolerance = _rateTolerance;
    tellor = _tellor;
    Oracle newOracle = new OracleInfo(_inputTokenRequestId, 0, 0);
    // TODO: Check oracle and set init price, initialy set to 0s
    market.oracles[market.inputToken] = newOracle;
  }

  function addOutputPool(
    ISuperToken _token,
    uint128 _feeRate,
    uint256 _emissionRate,
    uint256 _requestId) public onlyOwner {
    // TODO: There's probably a maxiumum number of pools before the distribute method
    //       will run out of gas, limit should be the same for all markets
    require(_requestId != 0, "!validReqId");
    require(market.oracleRequestIds[_token] == 0, "!unique");
    OutputPool newPool = new OutputPool(_token, _feeRate, _emissionRate);
    market.outputPools[market.numOutputPools] = newPool;
    _createIndex(market.numOutputPools, _token);
    market.numOutputPools++;
    Oracle newOracle = new OracleInfo(_requestId, 0, 0);
    // TODO: Check oracle and set init price, initialy set to 0s
    market.oracles[market.inputToken] = newOracle;
  }

// Custom functionality that needs to be overrided by contract extending the base

  // Converts input token to output token
  function distribute(bytes memory _ctx) public virtual returns(bytes memory newCtx) {  }

  // Harvests rewards if any
  function harvest(bytes memory _ctx) public virtual returns (bytes memory newCtx) {  }

// Standardized functionality for all REX Markets

  // Oracle Functions

  function updateTokenPrice(address _token) public {
    (bool ifRetrieve,
    uint256 value,
    uint256 timestampRetrieved) = getCurrentValue(market.oracles[_token].requestId);
    require(_didGet, "!getCurrentValue");
    require(_timestamp >= block.timestamp - 3600, "!currentValue");
    market.oracles[_token].usdPrice = _value;
    market.oracles[_token].lastUpdatedAt = _timestamp;
  }

  function getCurrentValue(uint256 _requestId)
    public view returns (
        bool ifRetrieve,
        uint256 value,
        uint256 timestampRetrieved
    )
  {
      uint256 _count = self.oracle.getNewValueCountbyRequestId(_requestId);
      uint256 _time = self.oracle.getTimestampbyRequestIDandIndex(_requestId, _count - 1);
      uint256 _value = self.oracle.retrieveData(_requestId, _time);
      if (_value > 0) return (true, _value, _time);
      return (false, 0, _time);
  }

  // Superfluid Functions

  function afterAgreementCreated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32 ,//_agreementId,
    bytes calldata _agreementData,
    bytes calldata ,//_cbdata,
    bytes calldata _ctx
  )
    external override
    onlyHost
    onlyExpected(_superToken, _agreementClass)
    returns (bytes memory newCtx)
  {
    newCtx = ctx;

    (address shareholder,
     int96 flowRate) = _getShareholderInfo(_agreementData);

    newCtx = harvest(newCtx);
    newCtx = distribute(newCtx);
    newCtx = _updateShareholder(newCtx, shareholder, flowRate);
  }

  function afterAgreementUpdated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32 ,//_agreementId,
    bytes calldata _agreementData,
    bytes calldata ,//_cbdata,
    bytes calldata _ctx
  )
    external override
    onlyHost
    onlyExpected(_superToken, _agreementClass)
    returns (bytes memory newCtx)
  {
    newCtx = ctx;

    (address shareholder,
     int96 flowRate) = _getShareholderInfo(_agreementData);

    newCtx = harvest(newCtx);
    newCtx = distribute(newCtx);
    newCtx = _updateShareholder(newCtx, shareholder, flowRate);
  }

  function afterAgreementTerminated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32 ,//_agreementId,
    bytes calldata _agreementData,
    bytes calldata ,//_cbdata,
    bytes calldata _ctx
  )
    external override
    onlyHost
    returns (bytes memory newCtx)
  {
    newCtx = ctx;
    (address shareholder, ) = _getShareholderInfo(_agreementData);
    newCtx = _updateShareholder(newCtx, shareholder, 0);
  }

  function _updateShareholder(bytes memory ctx, address shareholder, int96 shareholderFlowRate) internal returns (bytes memory newCtx) {
    // TODO: We need to make sure this for-loop won't run out of gas, do this we can set a limit on numOutputPools
    // We need to go through all the output tokens and update their IDA shares
    for (uint256 index = 0; index < market.numOutputPools; index++) {
      newCtx = _updateSubscriptionWithContext(newCtx, index, shareholder, uint128(uint(int(shareholderFlowRate))), market.outputPools[index].token);
      // TODO: Update the fee taken by the DAO
    }
  }

  function _getShareholderInfo(bytes calldata _agreementData) internal view returns(address shareholder, int96 flowRate) {
    (shareholder, ) = abi.decode(_agreementData, (address, address));
    (, flowRate, , ) = cfa.getFlow(market.inputToken, shareholder, address(this));
  }

// Modifiers

  /// @dev Restricts calls to only from SuperFluid host
  modifier onlyHost() {
      require(msg.sender == address(host), "!host");
      _;
  }

  /// @dev Accept only input token for CFA, output and subsidy tokens for IDA
  modifier onlyExpected(ISuperToken superToken, address agreementClass) {
    if (_isCFAv1(agreementClass)) {
      require(_isInputToken(superToken), "!inputAccepted");
    } else if (_isIDAv1(agreementClass)) {
      require(_isOutputToken(superToken), "!outputAccepted");
    }
    _;
  }

// Boolean Helpers

  /// @dev Is `superToken` address an input token?
  /// @param superToken token address
  /// @return bool - is `superToken` address an input token
  function _isInputToken(ISuperToken _superToken) internal view returns (bool) {
    return address(_superToken) == address(market.inputToken);
  }

  /// @dev Is `superToken` address an output token?
  /// @param superToken token address
  /// @return bool - is `superToken` address an output token
  function _isOutputToken(ISuperToken _superToken) internal view returns (bool) {
    if (market.oracleRequestIds[_superToken] != 0) {
      return true;
    } else {
      return false;
    }
  }

  /// @dev Is provided agreement address an CFA?
  /// @param agreementClass agreement address
  /// @return bool - is provided address an CFA
  function _isCFAv1(address _agreementClass) internal view returns (bool) {
      return ISuperAgreement(_agreementClass).agreementType()
          == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
  }

  /// @dev Is provided agreement address an IDA?
  /// @param agreementClass agreement address
  /// @return bool - is provided address an IDA
  function _isIDAv1(address _agreementClass) internal view returns (bool) {
      return ISuperAgreement(_agreementClass).agreementType()
          == keccak256("org.superfluid-finance.agreements.InstantDistributionAgreement.v1");
  }

// Superfluid Agreement Management Methods

  /// @dev Create new IDA index for `distToken`
  /// @param index IDA index ID
  /// @param distToken token address
  function _createIndex(uint256 index, ISuperToken distToken) internal {
    self.host.callAgreement(
       self.ida,
       abi.encodeWithSelector(
           self.ida.createIndex.selector,
           distToken,
           index,
           new bytes(0) // placeholder ctx
       ),
       new bytes(0) // user data
     );
  }

  /// @dev Same as _updateSubscription but uses provided SuperFluid context data
  /// @param ctx SuperFluid context data
  /// @param index IDA index ID
  /// @param subscriber is subscriber address
  /// @param shares is distribution shares count
  /// @param distToken is distribution token address
  /// @return newCtx updated SuperFluid context data
  function _updateSubscriptionWithContext(
    bytes memory ctx,
    uint256 index,
    address subscriber,
    uint128 shares,
    ISuperToken distToken)
    internal returns (bytes memory newCtx)  {

    newCtx = ctx;
    (newCtx, ) = self.host.callAgreementWithContext(
      self.ida,
      abi.encodeWithSelector(
        self.ida.updateSubscription.selector,
        distToken,
        index,
        subscriber,
        shares / 1e9,  // Number of shares is proportional to their rate
        new bytes(0)
      ),
      new bytes(0), // user data
      newCtx
    );
  }

}
