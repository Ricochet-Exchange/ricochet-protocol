// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import 'hardhat/console.sol';
import '@openzeppelin/contracts/access/AccessControlEnumerable.sol';

contract REXReferral is AccessControlEnumerable {
  // REX Referral Contract
  //
  // Responsibilities:
  // - Create new referrals
  // - Manage referrals and referred customers

  struct Affiliate {
    string name; // Full name of the affiliate
    string id; // Referral ID of the affiliate
    bool enabled; // Whether the affiliate is enabled or not
    uint256 totalRef; // Total number of referrals
    address addr; // Address of the affiliate
  }

  mapping(address => uint256) public addressToAffiliate;
  mapping(string => uint256) public affiliateIdToAffiliate;
  mapping(address => uint256) public customerToAffiliate;
  mapping(address => bool) public isCustomerOrganic;
  Affiliate[] public affiliates;

  event AffiliateApplied(string name, string id);
  event AffiliateWithdrawn(string affiliateId);
  event ReferredCustomerRegistered(
    address customer,
    address affiliate,
    string affiliateId
  );
  event OrganicCustomerRegistered(address customer);

  // Roles
  bytes32 public constant APP_ROLE = keccak256('APP_ROLE');

  constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _setRoleAdmin(APP_ROLE, DEFAULT_ADMIN_ROLE);
    affiliates.push(Affiliate('Genesis', 'genesis', false, 0, address(0)));
  }

  // Modifiers
  /// @dev Restricts calls for a valid Affiliate ID
  modifier validAffiliate(string memory affiliateId) {
    require(affiliateIdToAffiliate[affiliateId] > 0, 'Not a valid affiliate');
    _;
  }

  /// @dev Restrict calls to only from a valid affiliate address
  modifier validAffiliateAddress() {
    require(addressToAffiliate[msg.sender] > 0, 'Not a valid affiliate');
    _;
  }

  /// @dev Restricts calls to valid addresses
  modifier notZero(address addr) {
    require(addr != address(0), 'Address cannot be 0');
    _;
  }

  /// @dev Restricts calls to admin role
  modifier onlyAdmin() {
    _checkRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _;
  }

  /// @dev Restricts calls to market role
  modifier onlyApprovedApp() {
    _checkRole(APP_ROLE, msg.sender);
    _;
  }

  // Add a market contract to allow-list
  // OpenZeppelin already checks for admin role
  function registerApp(address contractAddr) public {
    grantRole(APP_ROLE, contractAddr);
  }

  // Remove a market contract from allow-list
  // OpenZeppelin already checks for admin role
  function unregisterApp(address contractAddr) public {
    revokeRole(APP_ROLE, contractAddr);
  }

  // Apply a new affiliate
  function applyForAffiliate(
    string memory name,
    string memory affiliateId
  ) public {
    require(addressToAffiliate[msg.sender] == 0, 'Already applied');
    require(
      affiliateIdToAffiliate[affiliateId] == 0,
      'Affiliate ID already exists'
    );
    Affiliate memory affliate = Affiliate(
      name,
      affiliateId,
      false,
      0,
      msg.sender
    );
    affiliates.push(affliate);
    addressToAffiliate[msg.sender] = affiliates.length - 1;
    affiliateIdToAffiliate[affiliateId] = affiliates.length - 1;
    affiliates[affiliateIdToAffiliate[affiliateId]].enabled = true;
    emit AffiliateApplied(name, affiliateId);
  }

  // Disable affiliate to refer customers
  function disableAffiliate(
    string memory affiliateId
  ) public onlyAdmin validAffiliate(affiliateId) {
    affiliates[affiliateIdToAffiliate[affiliateId]].enabled = false;
  }

  // Check if a affiliate is enabled
  function isAffiliateEnabled(
    string memory affiliateId
  ) public view validAffiliate(affiliateId) returns (bool) {
    return affiliates[affiliateIdToAffiliate[affiliateId]].enabled;
  }

  // Withdraw affiliate
  function withdrawAffiliate() public validAffiliateAddress {
    require(
      affiliates[addressToAffiliate[msg.sender]].enabled == false,
      'Affiliate is already enabled'
    );
    string memory affiliateId = affiliates[addressToAffiliate[msg.sender]].id;
    addressToAffiliate[msg.sender] = 0;
    affiliateIdToAffiliate[affiliateId] = 0;
    emit AffiliateWithdrawn(affiliateId);
  }

  // Change affiliate address (to transfer rewards)
  function changeAffiliateAddress(
    address newAddress
  ) public validAffiliateAddress notZero(newAddress) {
    uint256 affiliateIdx = addressToAffiliate[msg.sender];
    Affiliate storage affiliate = affiliates[affiliateIdx];
    affiliate.addr = newAddress;
    delete addressToAffiliate[msg.sender];
    addressToAffiliate[newAddress] = affiliateIdx;
  }

  // Register a customer with an affiliate
  function registerReferredCustomer(
    address customerAddr,
    string memory affiliateId
  ) internal validAffiliate(affiliateId) notZero(customerAddr) {
    require(
      isCustomerOrganic[customerAddr] == false,
      'Already registered organically'
    );
    require(
      customerToAffiliate[customerAddr] == 0,
      'Already registered to affiliate'
    );

    uint256 affiliateIdx = affiliateIdToAffiliate[affiliateId];
    require(
      affiliates[affiliateIdx].enabled == true,
      'Affiliate is not active'
    );

    customerToAffiliate[customerAddr] = affiliateIdx;
    affiliates[affiliateIdx].totalRef += 1;
    emit ReferredCustomerRegistered(
      customerAddr,
      affiliates[affiliateIdx].addr,
      affiliateId
    );
  }

  // Register a customer as organic
  function registerOrganicCustomer(
    address customerAddr
  ) internal notZero(customerAddr) {
    require(
      customerToAffiliate[customerAddr] == 0,
      'Already registered to affiliate'
    );
    isCustomerOrganic[customerAddr] = true;
    emit OrganicCustomerRegistered(customerAddr);
  }

  // Get affiliate address for customer - returns 0 if customer is organic
  function getAffiliateAddress(
    address customerAddr
  ) public view returns (address) {
    if (
      isCustomerOrganic[customerAddr] || customerToAffiliate[customerAddr] == 0
    ) {
      return address(0);
    }

    Affiliate memory affiliate = affiliates[customerToAffiliate[customerAddr]];
    if (!affiliate.enabled) {
      return address(0);
    }
    return affiliate.addr;
  }

  // Perform all checks for customer and register organically or to affiliate when necessary
  function safeRegisterCustomer(
    address customerAddr,
    string memory affiliateId
  ) public onlyApprovedApp {
    // Customer is already registered organically
    if (isCustomerOrganic[customerAddr]) {
      return;
    }

    // Customer is already registered with affiliate
    if (getAffiliateAddress(customerAddr) != address(0)) {
      return;
    }

    // No affiliate ID - register this customer organically
    if (bytes(affiliateId).length == 0) {
      registerOrganicCustomer(customerAddr);
      return;
    }

    // Affiliate ID present - but invalid or inactive
    uint256 affiliateIdx = affiliateIdToAffiliate[affiliateId];
    if (affiliateIdx == 0 || affiliates[affiliateIdx].enabled == false) {
      registerOrganicCustomer(customerAddr);
      return;
    }

    // Finally, register affiliate
    registerReferredCustomer(customerAddr, affiliateId);
  }
}
