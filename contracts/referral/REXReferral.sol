// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract REXReferral is Ownable {
    // REX Referral Contract
    //
    // Responsibilities:
    // - Create new referrals
    // - Manage referrals and referred users

    struct Affiliate {
        string name; // Full name of the affiliate
        string id; // Referral ID of the affiliate
        bool enabled; // Whether the affiliate is enabled or not
        uint256 totalRef; // Total number of referrals
        address addr; // Address of the affiliate
    }

    mapping(address => uint256) public addressToAffiliate;
    mapping(string => uint256) public affiliateIdToAffiliate;
    mapping(address => uint256) public userToAffiliate;
    mapping(address => bool) public isUserOrganic;
    Affiliate[] public affiliates;

    event AffiliateApplied(string name, string id);
    event AffiliateWithdrawn(string affiliateId);

    constructor() {
        affiliates.push(Affiliate("Genesis", "genesis", false, 0, address(0)));
    }

    // Modifiers

    /// @dev Restricts calls for a valid Affiliate ID
    modifier validAffiliate(string memory affiliateId) {
        require(
            affiliateIdToAffiliate[affiliateId] > 0,
            "Not a valid affiliate"
        );
        _;
    }

    /// @dev Restrict calls to only from a valid affiliate address
    modifier validAffiliateAddress() {
        require(addressToAffiliate[msg.sender] > 0, "Not a valid affiliate");
        _;
    }

    /// @dev Restricts calls to valid addresses (not a dead address)
    modifier notZero(address addr) {
        require(addr != address(0), "Address cannot be 0");
        _;
    }

    // Enable a affiliate to refer users
    function verifyAffiliate(string memory affiliateId)
        public
        onlyOwner
        validAffiliate(affiliateId)
        returns (bool)
    {
        affiliates[affiliateIdToAffiliate[affiliateId]].enabled = true;
        return true;
    }

    // Disable affiliate to refer users
    function disableAffiliate(string memory affiliateId)
        public
        onlyOwner
        validAffiliate(affiliateId)
        returns (bool)
    {
        affiliates[affiliateIdToAffiliate[affiliateId]].enabled = false;
        return true;
    }

    // Check if a affiliate is enabled
    function isAffiliateEnabled(string memory affiliateId)
        public
        view
        validAffiliate(affiliateId)
        returns (bool)
    {
        return affiliates[affiliateIdToAffiliate[affiliateId]].enabled;
    }

    // Apply a new affiliate
    function applyForAffiliate(string memory name, string memory id) public {
        require(addressToAffiliate[msg.sender] == 0, "Already applied");
        require(affiliateIdToAffiliate[id] == 0, "Affiliate ID already exists");
        Affiliate memory affliate = Affiliate(name, id, false, 0, msg.sender);
        affiliates.push(affliate);
        addressToAffiliate[msg.sender] = affiliates.length - 1;
        affiliateIdToAffiliate[id] = affiliates.length - 1;
        emit AffiliateApplied(name, id);
    }

    // Withdraw affiliate
    function withdrawAffiliate() public validAffiliateAddress {
        require(
            affiliates[addressToAffiliate[msg.sender]].enabled == false,
            "Affiliate is already enabled"
        );
        string memory affiliateId = affiliates[addressToAffiliate[msg.sender]]
            .id;
        addressToAffiliate[msg.sender] = 0;
        affiliateIdToAffiliate[affiliateId] = 0;
        emit AffiliateWithdrawn(affiliateId);
    }

    // Change affiliate address (to transfer rewards)
    function changeAffiliateAddress(address newAddress)
        public
        validAffiliateAddress
        notZero(newAddress)
    {
        uint256 affiliateIdx = addressToAffiliate[msg.sender];
        Affiliate storage affiliate = affiliates[affiliateIdx];
        affiliate.addr = newAddress;
        delete addressToAffiliate[msg.sender];
        addressToAffiliate[newAddress] = affiliateIdx;
    }

    // Register a user with an affiliate
    function registerReferredUser(address userAddr, string memory affiliateId)
        internal
        validAffiliate(affiliateId)
        notZero(userAddr)
    {
        require(
            isUserOrganic[userAddr] == false,
            "Already registered organically"
        );
        require(
            userToAffiliate[userAddr] == 0,
            "Already registered to affiliate"
        );

        uint256 affiliateIdx = affiliateIdToAffiliate[affiliateId];
        require(
            affiliates[affiliateIdx].enabled == true,
            "Affiliate is not active"
        );

        userToAffiliate[userAddr] = affiliateIdx;
        affiliates[affiliateIdx].totalRef += 1;
    }

    // Register a user as organic
    function registerOrganicUser(address userAddr) internal notZero(userAddr) {
        require(
            userToAffiliate[userAddr] == 0,
            "Already registered to affiliate"
        );
        isUserOrganic[userAddr] = true;
    }

    // Get affiliate address for user - returns 0 if user is organic
    function getAffiliateAddress(address userAddr)
        public
        view
        returns (address)
    {
        if (isUserOrganic[userAddr] || userToAffiliate[userAddr] == 0) {
            return address(0);
        }

        Affiliate memory affiliate = affiliates[userToAffiliate[userAddr]];
        if (!affiliate.enabled) {
            return address(0);
        }
        return affiliate.addr;
    }

    // Perform all checks for user and register organically or to affiliate when necessary
    function safeRegisterUser(address userAddr, string memory affiliateId)
        internal
    {
        // User is already registered organically
        if (isUserOrganic[userAddr]) {
            return;
        }

        // User is already registered with affiliate
        if (getAffiliateAddress(userAddr) != address(0)) {
            return;
        }

        // No affiliate ID - register this user organically
        if (bytes(affiliateId).length == 0) {
            registerOrganicUser(userAddr);
            return;
        }

        // Affiliate ID present - but invalid or inactive
        uint256 affiliateIdx = affiliateIdToAffiliate[affiliateId];
        if (affiliateIdx == 0 || affiliates[affiliateIdx].enabled == false) {
            registerOrganicUser(userAddr);
            return;
        }

        // Finally, register affiliate
        registerReferredUser(userAddr, affiliateId);
    }
}
