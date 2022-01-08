// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;


import {ISuperfluid, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {IInstantDistributionAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./tellor/ITellor.sol";
import "hardhat/console.sol";

contract REXMarket is Ownable, SuperAppBase, Initializable {

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
      ISuperToken token;
      uint128 feeRate;           // Fee taken by the DAO on each output distribution
      uint256 emissionRate;      // Rate to emit tokens if there's a balance, used for subsidies
  }

  struct Market {
    ISuperToken inputToken;
    uint256 lastDistributionAt;                   // The last time a distribution was made
    uint256 rateTolerance;                        // The percentage to deviate from the oracle scaled to 1e6
    address owner;                                // The owner of the market (reciever of fees)
    mapping(ISuperToken => OracleInfo) oracles;           // Maps tokens to their oracle info
    mapping(uint32 => OutputPool) outputPools;   // Maps IDA indexes to their distributed Supertokens
    uint8 numOutputPools;                        // Indexes outputPools and outputPoolFees
  }

  ISuperfluid host;                     // Superfluid host contract
  IConstantFlowAgreementV1 cfa;         // The stored constant flow agreement class address
  IInstantDistributionAgreementV1 ida;  // The stored instant dist. agreement class address
  ITellor oracle;                       // Address of deployed simple oracle for input//output token
  Market market;
  uint32 PRIMARY_OUTPUT_INDEX = 0;

  // TODO: Emit these events where appropriate
  /// @dev Distribution event. Emitted on each token distribution operation.
  /// @param totalAmount is total distributed amount
  /// @param feeCollected is fee amount collected during distribution
  /// @param token is distributed token address
  event Distribution(uint256 totalAmount, uint256 feeCollected, address token);

  constructor(address _owner,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida,
    string memory _registrationKey
  ) public {
    host = _host;
    cfa = _cfa;
    ida = _ida;
    transferOwnership(_owner);

    uint256 configWord =
        SuperAppDefinitions.APP_LEVEL_FINAL |
        SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
        SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
        SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

    console.log(_registrationKey);
    if(bytes(_registrationKey).length > 0) {
        host.registerAppWithKey(configWord, _registrationKey);
    } else {
        host.registerApp(configWord);
    }
  }

// Market initialization methods

  function initializeMarket(
    ISuperToken _inputToken,
    uint256 _rateTolerance,
    ITellor _tellor,
    uint256 _inputTokenRequestId) public virtual onlyOwner {

    require(address(market.inputToken) == address(0), "Already initialized");
    market.inputToken = _inputToken;
    market.rateTolerance = _rateTolerance;
    oracle = _tellor;
    OracleInfo memory newOracle = OracleInfo(_inputTokenRequestId, 0, 0);
    market.oracles[market.inputToken] = newOracle;
    updateTokenPrice(_inputToken);
  }

  function addOutputPool(
    ISuperToken _token,
    uint128 _feeRate,
    uint256 _emissionRate,
    uint256 _requestId) public onlyOwner {
    // NOTE: Careful how many output pools, theres a loop over these pools
    require(_requestId != 0, "!validReqId");
    require(market.oracles[_token].requestId == 0, "!unique");
    //
    OutputPool memory newPool = OutputPool(_token, _feeRate, _emissionRate);
    market.outputPools[market.numOutputPools] = newPool;
    _createIndex(market.numOutputPools, _token);
    market.numOutputPools++;
    OracleInfo memory newOracle = OracleInfo(_requestId, 0, 0);
    market.oracles[_token] = newOracle;
    updateTokenPrice(_token);
  }

// Custom functionality that needs to be overrided by contract extending the base

  // Converts input token to output token
  function distribute(bytes memory _ctx) public virtual returns(bytes memory newCtx) {  }

  // Harvests rewards if any
  function harvest(bytes memory _ctx) public virtual returns (bytes memory newCtx) {  }

// Standardized functionality for all REX Markets

  // Oracle Functions

  function updateTokenPrice(ISuperToken _token) public {
    console.log("token", address(_token));
    (bool ifRetrieve,
    uint256 value,
    uint256 timestampRetrieved) = getCurrentValue(market.oracles[_token].requestId);
    console.log("rid", market.oracles[_token].requestId);
    console.log("timestampRetrieved", timestampRetrieved);
    require(ifRetrieve, "!getCurrentValue");
    require(timestampRetrieved >= block.timestamp - 3600, "!currentValue");
    market.oracles[_token].usdPrice = value;
    market.oracles[_token].lastUpdatedAt = timestampRetrieved;
  }

  function getCurrentValue(uint256 _requestId)
    public view returns (
        bool ifRetrieve,
        uint256 value,
        uint256 timestampRetrieved
    )
  {
      uint256 _count = oracle.getNewValueCountbyRequestId(_requestId);
      uint256 _time = oracle.getTimestampbyRequestIDandIndex(_requestId, _count - 1);
      uint256 _value = oracle.retrieveData(_requestId, _time);
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
    if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass)) return _ctx;
    console.log("inside after agreement1");

    newCtx = _ctx;

    // NOTE: This section be moved to a method: if(shouldDistribute()) { ... }
    (, , uint128 totalUnitsApproved, uint128 totalUnitsPending) = ida.getIndex(
                                                                         market.outputPools[PRIMARY_OUTPUT_INDEX].token,
                                                                         address(this),
                                                                         PRIMARY_OUTPUT_INDEX);
    // Check balance and account for
    uint256 balance = ISuperToken(market.inputToken).balanceOf(address(this)) /
                      (10 ** (18 - ERC20(market.inputToken.getUnderlyingToken()).decimals()));

    if (totalUnitsApproved + totalUnitsPending > 0 && balance > 0) {
      newCtx = distribute(newCtx);
    }

    (address shareholder, int96 flowRate) = _getShareholderInfo(_agreementData);

    console.log("inside after agreement4");

    newCtx = _updateShareholder(newCtx, shareholder, flowRate);
    console.log("inside after agreement5");

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
    newCtx = _ctx;

    (address shareholder,
     int96 flowRate) = _getShareholderInfo(_agreementData);

    newCtx = harvest(newCtx);
    newCtx = distribute(newCtx);
    newCtx = _updateShareholder(newCtx, shareholder, flowRate);
  }

  // We need before agreement to get the uninvested amount using the flowRate before update
  function beforeAgreementTerminated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32, //_agreementId,
    bytes calldata _agreementData,
    bytes calldata _ctx
  )
    external
    override
    view
    onlyExpected(_superToken, _agreementClass)
    onlyHost
    returns (bytes memory cbdata)
  {
      (address shareholder, ) = _getShareholderInfo(_agreementData);

      (uint256 timestamp,int96 flowRateMain, , ) = cfa.getFlow(market.inputToken, shareholder, address(this));
      uint256 uinvestAmount = _calcUserUninvested(timestamp, uint256(uint96(flowRateMain)), market.lastDistributionAt);
      cbdata = abi.encode(uinvestAmount);

  }

  function afterAgreementTerminated(
    ISuperToken , //_superToken
    address , //_agreementClass
    bytes32 ,//_agreementId,
    bytes calldata _agreementData,
    bytes calldata _cbdata,//_cbdata,
    bytes calldata _ctx
  )
    external override
    onlyHost
    returns (bytes memory newCtx)
  {
    newCtx = _ctx;
    (address shareholder, ) = _getShareholderInfo(_agreementData);
    uint256 uninvestAmount = abi.decode(_cbdata,(uint256));
    // Refund the unswapped amount back to the person who started the stream
    market.inputToken.transferFrom(address(this), shareholder, uninvestAmount);
    newCtx = _updateShareholder(newCtx, shareholder, 0);
  }

  /// @dev Get flow rate for `streamer`
  /// @param streamer is streamer address
  /// @return requesterFlowRate `streamer` flow rate
  function getStreamRate(address streamer) external view returns (int96 requesterFlowRate) {
    (, requesterFlowRate, , ) = cfa.getFlow(market.inputToken, streamer, address(this));
  }

  /// @dev Get `streamer` IDA subscription info for token with index `index`
  /// @param index is token index in IDA
  /// @param streamer is streamer address
  /// @return exist Does the subscription exist?
  /// @return approved Is the subscription approved?
  /// @return units Units of the suscription.
  /// @return pendingDistribution Pending amount of tokens to be distributed for unapproved subscription.
  function getIDAShares(uint32 index, address streamer) external view returns (bool exist,
                bool approved,
                uint128 units,
                uint256 pendingDistribution) {

    (exist, approved, units, pendingDistribution) = ida.getSubscription(
                                                                  market.outputPools[index].token,
                                                                  address(this),
                                                                  index,
                                                                  streamer);
  }

  function _updateShareholder(bytes memory ctx, address shareholder, int96 shareholderFlowRate) internal returns (bytes memory newCtx) {
    // TODO: We need to make sure this for-loop won't run out of gas, do this we can set a limit on numOutputPools
    // We need to go through all the output tokens and update their IDA shares
    newCtx = ctx;
    for (uint32 index = 0; index < market.numOutputPools; index++) {
      newCtx = _updateSubscriptionWithContext(newCtx, index, shareholder, uint128(uint(int(shareholderFlowRate))), market.outputPools[index].token);
      // TODO: Update the fee taken by the DAO
    }
  }

  function _getShareholderInfo(bytes calldata _agreementData) internal view returns(address shareholder, int96 flowRate) {
    (shareholder, ) = abi.decode(_agreementData, (address, address));
    (, flowRate, , ) = cfa.getFlow(market.inputToken, shareholder, address(this));
  }

  /// @dev Distributes `distAmount` amount of `distToken` token among all IDA index subscribers
  /// @param index IDA index ID
  /// @param distAmount amount to distribute
  /// @param distToken distribute token address
  /// @param ctx SuperFluid context data
  /// @return newCtx updated SuperFluid context data
  function _idaDistribute(uint32 index, uint128 distAmount, ISuperToken distToken, bytes memory ctx) internal returns (bytes memory newCtx) {
    newCtx = ctx;
    if (newCtx.length == 0) { // No context provided
      host.callAgreement(
        ida,
        abi.encodeWithSelector(
            ida.distribute.selector,
            distToken,
            index,
            distAmount,
            new bytes(0) // placeholder ctx
        ),
        new bytes(0) // user data
      );
    } else {
      require(host.isCtxValid(newCtx) || newCtx.length == 0, "!distribute");
      (newCtx, ) = host.callAgreementWithContext(
        ida,
        abi.encodeWithSelector(
            ida.distribute.selector,
            distToken,
            index,
            distAmount,
            new bytes(0) // placeholder ctx
        ),
        new bytes(0), // user data
        newCtx
      );
    }
  }

  // internal helper function to get the amount that needs to be returned back to the user
  function _calcUserUninvested(
        uint256 _prevUpdateTimestamp,
        uint256 _flowRate,
        uint256 _lastDistributedAt
    ) internal view returns (uint256) {
        uint256 _userUninvestedSum;

        // solhint-disable not-rely-on-time
        (_prevUpdateTimestamp > _lastDistributedAt)
            ? _userUninvestedSum +=
                _flowRate *
                (block.timestamp - _prevUpdateTimestamp)
            : _userUninvestedSum =
            _flowRate *
            (block.timestamp - _lastDistributedAt);
        // solhint-enable not-rely-on-time

        // console.log("Uninvested amount is: %s", _userUninvestedSum);
        return _userUninvestedSum;
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


  function _isInputToken(ISuperToken _superToken) internal view returns (bool) {
    return address(_superToken) == address(market.inputToken);
  }


  function _isOutputToken(ISuperToken _superToken) internal view returns (bool) {
    console.log("_isOutputToken", address(_superToken));
    console.log("market.oracles[_superToken].requestId", market.oracles[_superToken].requestId );
    if (market.oracles[_superToken].requestId != 0) {
      return true;
    } else {
      return false;
    }
  }


  function _isCFAv1(address _agreementClass) internal view returns (bool) {
      return ISuperAgreement(_agreementClass).agreementType()
          == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
  }


  function _isIDAv1(address _agreementClass) internal view returns (bool) {
      return ISuperAgreement(_agreementClass).agreementType()
          == keccak256("org.superfluid-finance.agreements.InstantDistributionAgreement.v1");
  }

// Superfluid Agreement Management Methods

  function _createIndex(uint256 index, ISuperToken distToken) internal {
    console.log("Create index", index);
    console.log(address(distToken));
    host.callAgreement(
       ida,
       abi.encodeWithSelector(
           ida.createIndex.selector,
           distToken,
           index,
           new bytes(0) // placeholder ctx
       ),
       new bytes(0) // user data
     );
  }

  /// @dev Set new `shares` share for `subscriber` address in IDA with `index` index
  /// @param index IDA index ID
  /// @param subscriber is subscriber address
  /// @param shares is distribution shares count
  /// @param distToken is distribution token address
  function _updateSubscription(
      uint256 index,
      address subscriber,
      uint128 shares,
      ISuperToken distToken) internal {
    host.callAgreement(
       ida,
       abi.encodeWithSelector(
           ida.updateSubscription.selector,
           distToken,
           index,
           // one share for the to get it started
           subscriber,
           shares / 1e9,
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
    (newCtx, ) = host.callAgreementWithContext(
      ida,
      abi.encodeWithSelector(
        ida.updateSubscription.selector,
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
