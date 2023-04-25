// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

interface IREXReferral {
  function addressToAffiliate(address) external view returns (uint256);

  /**
   * @dev Add a market contract to allow-list
   * @param contractAddr address for REXMarket contract
   */
  function registerApp(address contractAddr) external;

  /**
   * @dev Remove a market contract from allow-list
   * @param contractAddr address for REXMarket contract
   */
  function unregisterApp(address contractAddr) external;

  /**
   * @dev Apply for a new affiliate
   * @param name address for customer
   * @param affiliateId referral ID
   */
  function applyForAffiliate(
    string memory name,
    string memory affiliateId
  ) external;

  /**
   * @dev Enable a affiliate and allow to refer customers
   * @param affiliateId referral ID
   */
  function verifyAffiliate(string memory affiliateId) external;

  /**
   * @dev Disable affiliate and disallow to refer customers
   * @param affiliateId referral ID
   */
  function disableAffiliate(string memory affiliateId) external;

  /**
   * @dev Check if an affiliate is enabled
   * @param affiliateId referral ID
   */
  function isAffiliateEnabled(
    string memory affiliateId
  ) external view returns (bool);

  /**
   * @dev Withdraw affiliate for caller - only allowed for a disabled affiliate
   */
  function withdrawAffiliate() external;

  /**
   * @dev Change affiliate address (to transfer rewards)
   * @param newAddress address for customer
   */
  function changeAffiliateAddress(address newAddress) external;

  /**
   * @dev Get affiliate address for customer - returns 0 if customer is organic
   * @param customerAddr address for customer
   */
  function getAffiliateAddress(
    address customerAddr
  ) external view returns (address);

  /**
   * @dev Perform all checks for customer and register organically or to affiliate when necessary
   * @param customerAddr address for new customer
   * @param affiliateId affiliateId of the referral
   */
  function safeRegisterCustomer(
    address customerAddr,
    string memory affiliateId
  ) external;
}
