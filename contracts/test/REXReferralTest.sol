// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "../REXReferral.sol";

contract REXReferralTest is REXReferral {
    // REX Referral Contract
    //
    // Responsibilities:
    // - Expose test functions for REXReferral internal functions

    function registerReferredUserTest(address userAddr, string memory affiliateId) public {
        registerReferredUser(userAddr, affiliateId);
    }

    function registerOrganicUserTest(address userAddr) public {
        registerOrganicUser(userAddr);
    }

    function safeRegisterUserTest(address userAddr, string memory affiliateId) public {
        safeRegisterUser(userAddr, affiliateId);
    }
}
