contract REXMarketBase {

  struct SubsidyPool {
      ISuperToken token;
      uint256 emissionRate;      // Rate to emit tokens if there's a balance, used for subsidies
  }

  struct LiquidityPool {
    ISuperToken inputToken;
    ISuperToken outputToken;
    uint128 feeRate;
  }

  struct Market {
    LiquidityPool poolA;
    LiquidityPool poolB;
    uint256 lastDistributionAt;                   // The last time a distribution was made
    uint256 rateTolerance;                        // The percentage to deviate from the oracle scaled to 1e6
    address owner;                                // The owner of the market (reciever of fees)
    mapping(address => uint256) oracleRequestIds; // Maps tokens to their oracle request ID
    mapping(uint32 => SubsidyPool) subsidyPools;  // Maps IDA indexes to their distributed Supertokens
    uint8 numSubsidyPools;                        // Indexes outputPools and outputPoolFees
  }

  ISuperfluid host;                     // Superfluid host contract
  IConstantFlowAgreementV1 cfa;         // The stored constant flow agreement class address
  IInstantDistributionAgreementV1 ida;  // The stored instant dist. agreement class address
  IUniswapV2Router02 router;            // Address of uniswap compatible router
  ITellor oracle;                       // Address of deployed simple oracle for input//output token
  Market market;

// Custom functionality that needs to be overrided by contract extending the base

  // Converts input token to output token
  function distribute() public virtual;

  // Harvests rewards if any
  function harvest() public virtual;

// Standardized functionality for all REX Markets

  function afterAgreementCreated(...,bytes calldata _agreementData,...) {
      (address shareholder,
       int96 shareholderFlowRate) = _getShareholderInfo(_agreementData)

      harvest();
      distribute();
      _createNewShareholder(shareholder, shareholderFlowRate);
  }

  function afterAgreementUpdated(...,bytes calldata _agreementData,...) {
      (address shareholder,
       int96 shareholderFlowRate) = _getShareholderInfo(_agreementData)

      harvest();
      distribute();
      _updateShareholder(shareholder, shareholderFlowRate);
  }

  function afterAgreementTerminated(...,bytes calldata _agreementData,...) {
      (address shareholder, ) = _getShareholderInfo(_agreementData)

      claim(); // Claim fees for contract owner on agreement termination
      _deleteShareholder(shareholder);
  }

  function _createNewShareholder(address shareholder, int96 shareholderFlowRate) { }

  function _updateShareholder(address shareholder, int96 shareholderFlowRate) { }

  function _deleteShareholder(address shareholder) { }

  function _getShareholderInfo(bytes calldata _agreementData) { }

}
