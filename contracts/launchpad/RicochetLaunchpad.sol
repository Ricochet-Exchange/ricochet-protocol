// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

// import "hardhat/console.sol";

import {ISuperfluid, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions} from '@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol'; //"@superfluid-finance/ethereum-monorepo/packages/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {IConstantFlowAgreementV1} from '@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol';

import {IInstantDistributionAgreementV1} from '@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol';

import {SuperAppBase} from '@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol';

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import './RicochetLaunchpadStorage.sol';
import './RicochetLaunchpadHelper.sol';

import '../referral/IREXReferral.sol';

contract RicochetLaunchpad is Ownable, SuperAppBase {
  // TODO: uint256 public constant RATE_PERCISION = 1000000;
  using SafeERC20 for ERC20;
  using RicochetLaunchpadHelper for RicochetLaunchpadStorage.RicochetLaunchpad;
  using RicochetLaunchpadStorage for RicochetLaunchpadStorage.RicochetLaunchpad;
  RicochetLaunchpadStorage.RicochetLaunchpad internal _launchpad;
  IREXReferral internal referrals;

  event UpdatedStream(address from, int96 newRate, int96 totalInflow);

  constructor(
    ISuperfluid host,
    IConstantFlowAgreementV1 cfa,
    IInstantDistributionAgreementV1 ida,
    string memory registrationKey,
    IREXReferral _rexReferral
  ) {
    require(address(host) != address(0), 'host');
    require(address(cfa) != address(0), 'cfa');
    require(address(ida) != address(0), 'ida');
    require(!host.isApp(ISuperApp(msg.sender)), 'owner SA');

    _launchpad.host = host;
    _launchpad.cfa = cfa;
    _launchpad.ida = ida;
    referrals = _rexReferral;

    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
      SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

    if (bytes(registrationKey).length > 0) {
      _launchpad.host.registerAppWithKey(configWord, registrationKey);
    } else {
      _launchpad.host.registerApp(configWord);
    }
  }

  function initialize(
    ISuperToken inputToken,
    ISuperToken outputToken,
    address originator,
    address beneficiary,
    uint256 outputRate,
    uint128 feeRate
  ) external {
    require(
      address(inputToken) != address(0) &&
        address(_launchpad.inputToken) == address(0),
      'inputToken'
    );
    require(
      address(outputToken) != address(0) &&
        address(_launchpad.outputToken) == address(0),
      'outputToken'
    );
    require(address(originator) != address(0), 'originator');
    require(address(beneficiary) != address(0), 'beneficiary');

    _launchpad.inputToken = inputToken;
    _launchpad.outputToken = outputToken;
    _launchpad.feeRate = feeRate;
    _launchpad.outputIndexId = 0;
    _launchpad.outputRate = outputRate;
    _launchpad.owner = owner();
    _launchpad.originator = originator;
    _launchpad.beneficiary = beneficiary;

    // Set up the IDA for sending tokens back
    _launchpad._createIndex(_launchpad.outputIndexId, _launchpad.outputToken);

    _launchpad.lastDistributionAt = block.timestamp;
  }

  function _registerReferral(bytes memory _ctx, address _shareholder) internal {
    require(referrals.addressToAffiliate(_shareholder) == 0, 'noAffiliates');
    ISuperfluid.Context memory decompiledContext = _launchpad.host.decodeCtx(
      _ctx
    );
    string memory affiliateId;
    if (decompiledContext.userData.length > 0) {
      (affiliateId) = abi.decode(decompiledContext.userData, (string));
    } else {
      affiliateId = '';
    }

    referrals.safeRegisterCustomer(_shareholder, affiliateId);
  }

  /**************************************************************************
   * Stream Exchange Logic
   *************************************************************************/

  /// @dev If a new stream is opened, or an existing one is opened
  function _updateOutflow(
    bytes calldata ctx,
    bytes calldata agreementData,
    bool doDistributeFirst
  ) private returns (bytes memory newCtx) {
    newCtx = ctx;

    (, , uint128 totalUnitsApproved, uint128 totalUnitsPending) = _launchpad
      .ida
      .getIndex(
        _launchpad.outputToken,
        address(this),
        _launchpad.outputIndexId
      );
    // Check balance and account for
    uint256 balance = ISuperToken(_launchpad.inputToken).balanceOf(
      address(this)
    ) /
      (10 **
        (18 - ERC20(_launchpad.inputToken.getUnderlyingToken()).decimals()));

    if (
      doDistributeFirst &&
      totalUnitsApproved + totalUnitsPending > 0 &&
      balance > 0
    ) {
      newCtx = _launchpad._distribute(newCtx);
    }

    (address requester, address flowReceiver) = abi.decode(
      agreementData,
      (address, address)
    );
    require(flowReceiver == address(this), '!appflow');
    int96 appFlowRate = _launchpad.cfa.getNetFlow(
      _launchpad.inputToken,
      address(this)
    );
    (, int96 requesterFlowRate, , ) = _launchpad.cfa.getFlow(
      _launchpad.inputToken,
      requester,
      address(this)
    );

    // Make sure the requester has at least 8 hours of balance to stream
    require(
      int(_launchpad.inputToken.balanceOf(requester)) >=
        requesterFlowRate * 8 hours,
      '!enoughTokens'
    );

    require(requesterFlowRate >= 0, '!negativeRates');

    address affiliate = referrals.getAffiliateAddress(requester);

    if (affiliate != address(0)) {
      // affiliate and admin share 50/50 2% of requesterFlowRate.
      int96 affiliateShares = (requesterFlowRate / 100) * 2;
      newCtx = _launchpad._updateSubscriptionWithContext(
        newCtx,
        _launchpad.outputIndexId,
        affiliate,
        uint128(uint(int(affiliateShares / 2))),
        _launchpad.outputToken
      );
      newCtx = _launchpad._updateSubscriptionWithContext(
        newCtx,
        _launchpad.outputIndexId,
        owner(),
        uint128(uint(int(affiliateShares / 2))),
        _launchpad.outputToken
      );
      // take 2% off of requesterFlowRate if they have an affiliate
      newCtx = _launchpad._updateSubscriptionWithContext(
        newCtx,
        _launchpad.outputIndexId,
        requester,
        uint128(uint(int(requesterFlowRate - affiliateShares))),
        _launchpad.outputToken
      );
    } else {
      newCtx = _launchpad._updateSubscriptionWithContext(
        newCtx,
        _launchpad.outputIndexId,
        requester,
        uint128(uint(int(requesterFlowRate))),
        _launchpad.outputToken
      );
    }

    emit UpdatedStream(requester, requesterFlowRate, appFlowRate);
  }

  function distribute() external {
    _launchpad._distribute(new bytes(0));
  }

  function closeStream(address streamer) public {
    _launchpad._closeStream(streamer);
  }

  function emergencyCloseStream(address streamer) public {
    _launchpad._emergencyCloseStream(streamer);
  }

  function emergencyDrain() public {
    _launchpad._emergencyDrain();
  }

  function setFeeRate(uint128 feeRate) external onlyOwner {
    _launchpad.feeRate = feeRate;
  }

  function isAppJailed() external view returns (bool) {
    return _launchpad.host.isAppJailed(this);
  }

  function getIDAShares(
    uint32 index,
    address streamer
  )
    external
    view
    returns (
      bool exist,
      bool approved,
      uint128 units,
      uint256 pendingDistribution
    )
  {
    (exist, approved, units, pendingDistribution) = _launchpad
      .ida
      .getSubscription(
        _launchpad.outputToken,
        address(this),
        _launchpad.outputIndexId,
        streamer
      );
  }

  function getSharePrice() external view returns (uint256) {
    return _launchpad.lastSharePrice;
  }

  function getInputToken() external view returns (ISuperToken) {
    return _launchpad.inputToken;
  }

  function getOutputToken() external view returns (ISuperToken) {
    return _launchpad.outputToken;
  }

  function getOutputIndexId() external view returns (uint32) {
    return _launchpad.outputIndexId;
  }

  function getOutputRate() external view returns (uint256) {
    return _launchpad.outputRate;
  }

  function getTotalInflow() external view returns (int96) {
    return _launchpad.cfa.getNetFlow(_launchpad.inputToken, address(this));
  }

  function getLastDistributionAt() external view returns (uint256) {
    return _launchpad.lastDistributionAt;
  }

  function getOwner() external view returns (address) {
    return _launchpad.owner;
  }

  function getFeeRate() external view returns (uint128) {
    return _launchpad.feeRate;
  }

  function getStreamRate(
    address streamer
  ) external view returns (int96 requesterFlowRate) {
    (, requesterFlowRate, , ) = _launchpad.cfa.getFlow(
      _launchpad.inputToken,
      streamer,
      address(this)
    );
  }

  /**
   * @dev Transfers ownership of the contract to a new account (`newOwner`).
   * Can only be called by the current owner.
   * NOTE: Override this to add changing the
   */
  function transferOwnership(
    address newOwner
  ) public virtual override onlyOwner {
    super.transferOwnership(newOwner);
    _launchpad.owner = newOwner;
  }

  /**************************************************************************
   * SuperApp callbacks
   *************************************************************************/

  function afterAgreementCreated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32, // _agreementId,
    bytes calldata _agreementData,
    bytes calldata, // _cbdata,
    bytes calldata _ctx
  )
    external
    override
    onlyExpected(_superToken, _agreementClass)
    onlyHost
    returns (bytes memory newCtx)
  {
    if (
      !_launchpad._isInputToken(_superToken) ||
      !_launchpad._isCFAv1(_agreementClass)
    ) return _ctx;

    address requester = abi.decode(_agreementData, (address));

    _registerReferral(_ctx, requester);
    return _updateOutflow(_ctx, _agreementData, true);
  }

  function afterAgreementUpdated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32, //_agreementId,
    bytes calldata _agreementData,
    bytes calldata, //_cbdata,
    bytes calldata _ctx
  )
    external
    override
    onlyExpected(_superToken, _agreementClass)
    onlyHost
    returns (bytes memory newCtx)
  {
    if (
      !_launchpad._isInputToken(_superToken) ||
      !_launchpad._isCFAv1(_agreementClass)
    ) return _ctx;
    return _updateOutflow(_ctx, _agreementData, true);
  }

  function afterAgreementTerminated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32, //_agreementId,
    bytes calldata _agreementData,
    bytes calldata, //_cbdata,
    bytes calldata _ctx
  ) external override onlyHost returns (bytes memory newCtx) {
    console.log('afterAgreementTerminated');
    // According to the app basic law, we should never revert in a termination callback
    if (
      !_launchpad._isInputToken(_superToken) ||
      !_launchpad._isCFAv1(_agreementClass)
    ) return _ctx;
    // Skip distribution when terminating to avoid reverts
    return _updateOutflow(_ctx, _agreementData, false);
  }

  modifier onlyHost() {
    require(msg.sender == address(_launchpad.host), 'one host');
    _;
  }

  modifier onlyExpected(ISuperToken superToken, address agreementClass) {
    if (_launchpad._isCFAv1(agreementClass)) {
      require(_launchpad._isInputToken(superToken), '!inputAccepted');
    } else if (_launchpad._isIDAv1(agreementClass)) {
      require(_launchpad._isOutputToken(superToken), '!outputAccepted');
    }
    _;
  }
}
