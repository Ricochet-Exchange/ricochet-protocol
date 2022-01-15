// SPDX-License-Identifier: AGPLv3
 pragma solidity ^0.8.0;

 import "hardhat/console.sol";
 import "../referral/REXReferral.sol";

 contract REXReferralTest is REXReferral {
     // REX Referral Contract
     //
     // Responsibilities:
     // - Expose test functions for REXReferral internal functions

     function registerReferredUserTest(address userAddr, string memory affiliateId) public {
         registerReferredCustomer(userAddr, affiliateId);
     }

     function registerOrganicUserTest(address userAddr) public {
         registerOrganicCustomer(userAddr);
     }

     function safeRegisterUserTest(address userAddr, string memory affiliateId) public {
         safeRegisterCustomer(userAddr, affiliateId);
     }
 }
