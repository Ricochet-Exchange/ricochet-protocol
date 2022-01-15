const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("REXReferral Contract", function () {
  let RexReferral;
  let referral;
  let owner; // eslint-disable-line no-unused-vars
  let whiteListedAccount;
  let whiteListAddr;
  let addr1;
  let addr2;
  let addr3;
  let addr4;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    RexReferral = await ethers.getContractFactory("REXReferralTest");
    [owner, whiteListAddr, addr1, addr2, addr3, addr4, ...addrs] =
      await ethers.getSigners();

    referral = await RexReferral.deploy();
    await referral.deployed();
    await referral.whitelistAddress(whiteListAddr.address);

    whiteListedAccount = referral.connect(whiteListAddr);
  });

  describe("Constructor", function () {
    it("Deployment should assign the genesis as the default first element to affiliates array", async function () {
      const genises = await referral.affiliates(0);
      expect(genises.name).to.equal("Genesis");
      expect(genises.id).to.equal("genesis");
      expect(genises.enabled).to.equal(false);
      expect(genises.totalRef).to.equal(0);
      expect(genises.addr).to.equal(
        "0x0000000000000000000000000000000000000000"
      );
    });
  });

  describe("Affiliate", function () {
    const AFFILIATE_NAME = "Shadow";
    const AFFILIATE_ID = "shadow77";

    it("Create a new Affiliate", async function () {
      const tx = await referral.applyForAffiliate(AFFILIATE_NAME, AFFILIATE_ID);
      await tx.wait();

      // Cannot applyForAffiliate again once applied.
      let REVERTED_MESSAGE = "Already applied";
      await expect(
        referral.applyForAffiliate(AFFILIATE_NAME, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      // AFFILIATE_ID should always be unique even when applying from a different account.
      REVERTED_MESSAGE = "Affiliate ID already exists";
      await expect(
        referral.connect(addr1).applyForAffiliate("Goku", AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("Only contract owner can verifyAffiliate and disableAffiliate", async function () {
      // Only contract owner should be able to call verifyAffiliate and disableAffiliate functions.
      const REVERTED_MESSAGE = "Ownable: caller is not the owner";
      await expect(
        referral.connect(addr1).verifyAffiliate(AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      await expect(
        referral.connect(addr2).disableAffiliate(AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("Disable/Enable Affliate", async function () {
      let tx = await referral
        .connect(addr1)
        .applyForAffiliate(AFFILIATE_NAME, AFFILIATE_ID);
      await tx.wait();

      // Affiliate should be disabled by default.
      let isAffiliated = await referral.isAffiliateEnabled(AFFILIATE_ID);
      expect(isAffiliated).to.equal(false);

      // Contract owner can verify Affiliate
      tx = referral.verifyAffiliate(AFFILIATE_ID);
      isAffiliated = await referral.isAffiliateEnabled(AFFILIATE_ID);
      expect(isAffiliated).to.equal(true);

      // Contract owner can disbale Affiliate
      tx = referral.disableAffiliate(AFFILIATE_ID);
      isAffiliated = await referral.isAffiliateEnabled(AFFILIATE_ID);
      expect(isAffiliated).to.equal(false);
    });

    it("Check if valid Affliate", async function () {
      const REVERTED_MESSAGE = "Not a valid affiliate";
      await expect(referral.verifyAffiliate("Goku")).to.be.revertedWith(
        REVERTED_MESSAGE
      );
    });

    it("changeAffiliateAddress", async function () {
      const newAddress = addr2.address;
      const REVERTED_MESSAGE = "Not a valid affiliate";

      // Changing AffiliateAddress without registering as an affiate should be reverted.
      await expect(
        referral.changeAffiliateAddress(newAddress)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      const tx = await referral
        .connect(addr1)
        .applyForAffiliate(AFFILIATE_NAME, AFFILIATE_ID);
      await tx.wait();

      // Before changing Affiliate Address
      const affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      let myAffliate = await referral.affiliates(affiateIndex);
      expect(myAffliate.addr).to.equal(addr1.address);

      await referral.connect(addr1).changeAffiliateAddress(newAddress);

      // Checking Address has changed to newAddress.
      myAffliate = await referral.affiliates(affiateIndex);
      expect(myAffliate.addr).to.equal(newAddress);
    });

    it("changeAffiliateAddress to zero address", async function () {
      const tx = await referral
        .connect(addr1)
        .applyForAffiliate(AFFILIATE_NAME, AFFILIATE_ID);
      await tx.wait();

      // New Address cannot be a zero address.
      const REVERTED_MESSAGE = "Address cannot be 0";
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      await expect(
        referral.connect(addr1).changeAffiliateAddress(zeroAddress)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("withdrawAffiliate", async function () {
      let tx = await referral.applyForAffiliate(AFFILIATE_NAME, AFFILIATE_ID);
      await tx.wait();

      // Check affiliateIdToAffiliate is exists and greater than 0
      let affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      expect(affiateIndex).to.equal(1);

      tx = await referral.withdrawAffiliate();
      await tx.wait();

      affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      expect(affiateIndex).to.equal(0);
    });

    it("withdrawAffiliate only if Affiliate is not yet verified.", async function () {
      const REVERTED_MESSAGE = "Affiliate is already enabled";

      let tx = await referral.applyForAffiliate(AFFILIATE_NAME, AFFILIATE_ID);
      await tx.wait();

      // Cannot withdraw if Affiliate is already verified.
      tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      await expect(referral.withdrawAffiliate()).to.be.revertedWith(
        REVERTED_MESSAGE
      );
    });
  });

  describe("ReferredCustomer", function () {
    const AFFILIATE_NAME = "Shadow";
    const AFFILIATE_ID = "shadow77";

    it("Do not register Organic customer as an ReferredCustomer", async function () {
      const REVERTED_MESSAGE = "Already registered organically";

      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();

      const organiceCustomer = await whiteListedAccount.registerOrganicCustomerTest(
        addr2.address
      );
      await organiceCustomer.wait();

      await expect(
        whiteListedAccount.registerReferredCustomerTest(addr2.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("Do not register referred customer as Organic customer", async function () {
      const REVERTED_MESSAGE = "Already registered to affiliate";

      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();
      await referral.verifyAffiliate(AFFILIATE_ID);

      await whiteListedAccount.registerReferredCustomerTest(
        addr1.address,
        AFFILIATE_ID
      );
      // Same account cannot be registered as an organic customer.
      await expect(
        whiteListedAccount.registerOrganicCustomerTest(addr1.address)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("Do no register customer as an ReferredCustomer if Affiliate not verified.", async function () {
      const REVERTED_MESSAGE = "Affiliate is not active";
      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();
      await expect(
        whiteListedAccount.registerReferredCustomerTest(addr2.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("Do not register already referred customer as a new referred customer.", async function () {
      const REVERTED_MESSAGE = "Already registered to affiliate";
      const TEMP_AFFILIATE_ID = "Goku";

      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      const affiliateCustomer2 = await referral
        .connect(addr2)
        .applyForAffiliate(AFFILIATE_NAME, TEMP_AFFILIATE_ID);
      await affiliateCustomer.wait();
      await affiliateCustomer2.wait();

      await referral.verifyAffiliate(AFFILIATE_ID);
      await referral.verifyAffiliate(TEMP_AFFILIATE_ID);

      // Refer customer first time.
      await whiteListedAccount.registerReferredCustomerTest(
        addr1.address,
        AFFILIATE_ID
      );

      // Refer the same customer again to the same referral.
      await expect(
        whiteListedAccount.registerReferredCustomerTest(addr1.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      // Refer the same customer to the another referral.
      await expect(
        whiteListedAccount.registerReferredCustomerTest(
          addr1.address,
          TEMP_AFFILIATE_ID
        )
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("register customer as an ReferredCustomer", async function () {
      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();
      const tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      const affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      let affiliate = await referral.affiliates(affiateIndex);
      expect(affiliate.totalRef).to.equal(0);

      await whiteListedAccount.registerReferredCustomerTest(
        addr1.address,
        AFFILIATE_ID
      );
      await whiteListedAccount.registerReferredCustomerTest(
        addr2.address,
        AFFILIATE_ID
      );

      // Check if affiliate totalRef is 2
      affiliate = await referral.affiliates(affiateIndex);
      expect(affiliate.totalRef).to.equal(2);

      // Check if customer succesfully registered
      const customer1 = await referral.customerToAffiliate(addr1.address);
      expect(customer1).to.equal(1);
      const customer2 = await referral.customerToAffiliate(addr2.address);
      expect(customer2).to.equal(1);

      // Customer3 not referred by any Affiliate.
      const customer3 = await referral.customerToAffiliate(addrs[1].address);
      expect(customer3).to.equal(0);
    });
  });

  describe("getAffiliateAddress", function () {
    const AFFILIATE_NAME = "Shadow";
    const AFFILIATE_ID = "shadow77";

    it("getAffiliateAddress for organic customer", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";

      const organiceCustomer = await whiteListedAccount.registerOrganicCustomerTest(
        addr1.address
      );
      await organiceCustomer.wait();

      const customerAddress = await referral.getAffiliateAddress(addr1.address);
      expect(customerAddress).to.equal(zeroAddress);
    });

    it("getAffiliateAddress for referred customer", async function () {
      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();
      const tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      const affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      const affiliate = await referral.affiliates(affiateIndex);

      const newReferredCustomer = await whiteListedAccount.registerReferredCustomerTest(
        addr1.address,
        AFFILIATE_ID
      );
      await newReferredCustomer.wait();

      const referredCustomer = await referral.getAffiliateAddress(addr1.address);
      expect(referredCustomer).to.equal(affiliate.addr);
    });

    it("getAffiliateAddress for disabled Affiliate", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();

      let tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      const newReferredCustomer = await whiteListedAccount.registerReferredCustomerTest(
        addr1.address,
        AFFILIATE_ID
      );
      await newReferredCustomer.wait();

      tx = await referral.disableAffiliate(AFFILIATE_ID);
      await tx.wait();

      const referredCustomer = await referral.getAffiliateAddress(addr1.address);
      expect(referredCustomer).to.equal(zeroAddress);
    });
  });

  describe("safeRegisterCustomer", function () {
    const AFFILIATE_NAME = "Shadow";
    const AFFILIATE_ID = "shadow77";

    // register customer as an OrganicCustomer
    it("register customer as an OrganicCustomer", async function () {
      const organicCustomer = await whiteListedAccount.safeRegisterCustomerTest(
        addr1.address,
        ""
      );
      await organicCustomer.wait();

      const isOrganic = await referral.isCustomerOrganic(addr1.address);
      expect(isOrganic).to.equal(true);
    });

    // register customer with invalid affiliate - should be organic
    it("register customer with invalid affiliate", async function () {
      const referredCustomer = await whiteListedAccount.safeRegisterCustomerTest(
        addr2.address,
        AFFILIATE_ID
      );
      await referredCustomer.wait();

      const isOrganic = await referral.isCustomerOrganic(addr2.address);
      expect(isOrganic).to.equal(true);
    });

    it("register customers with various cases", async function () {
      // register customer with valid but disabled affiliate
      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();

      let referredCustomer = await whiteListedAccount.safeRegisterCustomerTest(
        addr3.address,
        AFFILIATE_ID
      );
      await referredCustomer.wait();

      let isOrganic = await referral.isCustomerOrganic(addr3.address);
      expect(
        isOrganic,
        "register customer with valid but disabled affiliate"
      ).to.equal(true);

      // register customer with valid affiliate
      const tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      referredCustomer = await whiteListedAccount.safeRegisterCustomerTest(
        addr4.address,
        AFFILIATE_ID
      );
      await referredCustomer.wait();

      isOrganic = await referral.isCustomerOrganic(addr4.address);
      expect(
        isOrganic,
        "register customer with valid affiliate - isOrganic"
      ).to.equal(false);

      const affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      const affiliate = await referral.affiliates(affiateIndex);

      let affiliateAddress = await referral.getAffiliateAddress(addr4.address);
      expect(
        affiliateAddress,
        "register customer with valid affiliate - affiliateAddress"
      ).to.equal(affiliate.addr);

      // register organic customer with valid affiliate
      isOrganic = await referral.isCustomerOrganic(addr3.address);
      expect(
        isOrganic,
        "register organic customer with valid affiliate - isOrganic"
      ).to.equal(true);

      const alreadyOrganicCustomer = await whiteListedAccount.safeRegisterCustomerTest(
        addr3.address,
        AFFILIATE_ID
      );
      await alreadyOrganicCustomer.wait();

      affiliateAddress = await referral.getAffiliateAddress(addr3.address);
      expect(
        affiliateAddress,
        "register organic customer with valid affiliate - affiliateAddress"
      ).to.equal("0x0000000000000000000000000000000000000000");
    });
  });

  describe("check allowedCustomers", function () {
    const AFFILIATE_NAME = "Shadow";
    const AFFILIATE_ID = "shadow77";

    // register customer as an OrganicCustomer
    it("Access denied for non-whitelisted address.", async function () {
      const REVERTED_MESSAGE =
        "Access denied. Not eligible to call this function.";

      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();

      await expect(
        referral.registerReferredCustomerTest(addr2.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      await expect(
        referral.registerOrganicCustomerTest(addr2.address)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      await expect(
        referral.safeRegisterCustomerTest(addr2.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("removeFromWhitelistAddress", async function () {
      const REVERTED_MESSAGE =
        "Access denied. Not eligible to call this function.";

      const affiliateCustomer = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateCustomer.wait();
      await referral.verifyAffiliate(AFFILIATE_ID);
      await referral.removeFromWhitelistAddress(whiteListAddr.address);

      await expect(
        whiteListedAccount.registerReferredCustomerTest(addr2.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      await expect(
        whiteListedAccount.registerOrganicCustomerTest(addr2.address)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      await expect(
        whiteListedAccount.safeRegisterCustomerTest(addr2.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });
  });
});