const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("REXReferral Contract", function () {
  let RexReferral;
  let referral;
  let owner; // eslint-disable-line no-unused-vars
  let addr1;
  let addr2;
  let addr3;
  let addr4;
  let addrs;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    RexReferral = await ethers.getContractFactory("REXReferralTest");
    [owner, addr1, addr2, addr3, addr4, ...addrs] = await ethers.getSigners();

    referral = await RexReferral.deploy();
    await referral.deployed();
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

  describe("ReferredUser", function () {
    const AFFILIATE_NAME = "Shadow";
    const AFFILIATE_ID = "shadow77";

    it("Do not register Organic user as an ReferredUser", async function () {
      const REVERTED_MESSAGE = "Already registered organically";

      const affiliateUser = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateUser.wait();

      const organiceUser = await referral.registerOrganicUserTest(addr2.address);
      await organiceUser.wait();

      await expect(
        referral.registerReferredUserTest(addr2.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("Do not register referred user as Organic user", async function () {
      const REVERTED_MESSAGE = "Already registered to affiliate";

      const affiliateUser = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateUser.wait();
      await referral.verifyAffiliate(AFFILIATE_ID);

      await referral.registerReferredUserTest(addr1.address, AFFILIATE_ID);
      // Same account cannot be registered as an organic user.
      await expect(
        referral.registerOrganicUserTest(addr1.address)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("Do no register user as an ReferredUser if Affiliate not verified.", async function () {
      const REVERTED_MESSAGE = "Affiliate is not active";
      const affiliateUser = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateUser.wait();
      await expect(
        referral.registerReferredUserTest(addr2.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("Do not register already referred user as a new referred user.", async function () {
      const REVERTED_MESSAGE = "Already registered to affiliate";
      const TEMP_AFFILIATE_ID = "Goku";

      const affiliateUser = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      const affiliateUser2 = await referral
        .connect(addr2)
        .applyForAffiliate(AFFILIATE_NAME, TEMP_AFFILIATE_ID);
      await affiliateUser.wait();
      await affiliateUser2.wait();

      await referral.verifyAffiliate(AFFILIATE_ID);
      await referral.verifyAffiliate(TEMP_AFFILIATE_ID);

      // Refer user first time.
      await referral.registerReferredUserTest(addr1.address, AFFILIATE_ID);

      // Refer the same user again to the same referral.
      await expect(
        referral.registerReferredUserTest(addr1.address, AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);

      // Refer the same user to the another referral.
      await expect(
        referral.registerReferredUserTest(addr1.address, TEMP_AFFILIATE_ID)
      ).to.be.revertedWith(REVERTED_MESSAGE);
    });

    it("register user as an ReferredUser", async function () {
      const affiliateUser = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateUser.wait();
      const tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      const affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      let affiliate = await referral.affiliates(affiateIndex);
      expect(affiliate.totalRef).to.equal(0);

      await referral.registerReferredUserTest(addr1.address, AFFILIATE_ID);
      await referral.registerReferredUserTest(addr2.address, AFFILIATE_ID);

      // Check if affiliate totalRef is 2
      affiliate = await referral.affiliates(affiateIndex);
      expect(affiliate.totalRef).to.equal(2);

      // Check if user succesfully registered
      const user1 = await referral.userToAffiliate(addr1.address);
      expect(user1).to.equal(1);
      const user2 = await referral.userToAffiliate(addr2.address);
      expect(user2).to.equal(1);

      // User3 not referred by any Affiliate.
      const user3 = await referral.userToAffiliate(addrs[1].address);
      expect(user3).to.equal(0);
    });
  });

  describe("getAffiliateAddress", function () {
    const AFFILIATE_NAME = "Shadow";
    const AFFILIATE_ID = "shadow77";

    it("getAffiliateAddress for organic user", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";

      const organiceUser = await referral.registerOrganicUserTest(addr1.address);
      await organiceUser.wait();

      const userAddress = await referral.getAffiliateAddress(addr1.address);
      expect(userAddress).to.equal(zeroAddress);
    });

    it("getAffiliateAddress for referred user", async function () {
      const affiliateUser = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateUser.wait();
      const tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      const affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      const affiliate = await referral.affiliates(affiateIndex);

      const newReferredUser = await referral.registerReferredUserTest(
        addr1.address,
        AFFILIATE_ID
      );
      await newReferredUser.wait();

      const referredUser = await referral.getAffiliateAddress(addr1.address);
      expect(referredUser).to.equal(affiliate.addr);
    });

    it("getAffiliateAddress for disabled Affiliate", async function () {
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const affiliateUser = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateUser.wait();

      let tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      const newReferredUser = await referral.registerReferredUserTest(
        addr1.address,
        AFFILIATE_ID
      );
      await newReferredUser.wait();

      tx = await referral.disableAffiliate(AFFILIATE_ID);
      await tx.wait();

      const referredUser = await referral.getAffiliateAddress(addr1.address);
      expect(referredUser).to.equal(zeroAddress);
    });
  });

  describe("safeRegisterUser", function () {
    const AFFILIATE_NAME = "Shadow";
    const AFFILIATE_ID = "shadow77";

    // register user as an OrganicUser
    it("register user as an OrganicUser", async function () {
      const organicUser = await referral.safeRegisterUserTest(addr1.address, "");
      await organicUser.wait();

      const isOrganic = await referral.isUserOrganic(addr1.address);
      expect(isOrganic).to.equal(true);
    });

    // register user with invalid affiliate - should be organic
    it("register user with invalid affiliate", async function () {
      const referredUser = await referral.safeRegisterUserTest(addr2.address, AFFILIATE_ID);
      await referredUser.wait();

      const isOrganic = await referral.isUserOrganic(addr2.address);
      expect(isOrganic).to.equal(true);
    });


    it("register users with various cases", async function () {

      // register user with valid but disabled affiliate
      const affiliateUser = await referral.applyForAffiliate(
        AFFILIATE_NAME,
        AFFILIATE_ID
      );
      await affiliateUser.wait();

      let referredUser = await referral.safeRegisterUserTest(addr3.address, AFFILIATE_ID);
      await referredUser.wait();

      let isOrganic = await referral.isUserOrganic(addr3.address);
      expect(isOrganic, "register user with valid but disabled affiliate").to.equal(true);


      // register user with valid affiliate
      tx = await referral.verifyAffiliate(AFFILIATE_ID);
      await tx.wait();

      referredUser = await referral.safeRegisterUserTest(addr4.address, AFFILIATE_ID);
      await referredUser.wait();

      isOrganic = await referral.isUserOrganic(addr4.address);
      expect(isOrganic, "register user with valid affiliate - isOrganic").to.equal(false);

      const affiateIndex = await referral.affiliateIdToAffiliate(AFFILIATE_ID);
      const affiliate = await referral.affiliates(affiateIndex);

      let affiliateAddress = await referral.getAffiliateAddress(addr4.address);
      expect(affiliateAddress, "register user with valid affiliate - affiliateAddress").to.equal(affiliate.addr);

      // register organic user with valid affiliate
      isOrganic = await referral.isUserOrganic(addr3.address);
      expect(isOrganic, "register organic user with valid affiliate - isOrganic").to.equal(true);

      const alreadyOrganicUser = await referral.safeRegisterUserTest(addr3.address, AFFILIATE_ID);
      await alreadyOrganicUser.wait();

      affiliateAddress = await referral.getAffiliateAddress(addr3.address);
      expect(affiliateAddress, "register organic user with valid affiliate - affiliateAddress").to.equal("0x0000000000000000000000000000000000000000");
    });
  });
});
