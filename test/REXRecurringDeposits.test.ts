import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";


describe("RecurringDeposits", () => {
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let mockSuperToken: any;
    let recurringDeposits: any;

    const deploy = async (period: number) => {
        console.log("Deploying MockSuperToken...");
        const MockSuperToken = await ethers.getContractFactory("MockSuperToken");
        const mockSuperToken = await MockSuperToken.deploy();
        console.log("Deployed MockSuperToken:", mockSuperToken.address);
        console.log("Deploying RecurringDeposits...");
        
        const RecurringDeposits = await ethers.getContractFactory("RecurringDeposits");
        const recurringDeposits = await RecurringDeposits.deploy(mockSuperToken.address, period);
        
        return { recurringDeposits, mockSuperToken };
    };
  
    before(async () => {
      [deployer, alice, bob] = await ethers.getSigners();
      
    });

  context("Contract constructor", () => {
    it("Initializes the contract correctly", async () => {
      // Check that the contract variables have the expected values
      const depositTokenAddress = await recurringDeposits.depositToken();
      const period = await recurringDeposits.period();
      expect(depositTokenAddress).to.equal(mockSuperToken.address, "Incorrect deposit token address");
      expect(period.toString()).to.equal("3600", "Incorrect period");
    });
  });

    
  context("Scheduling a recurring deposit", () => {
    it("User can schedule a recurring deposit", async () => {
      // Deploy the Supertoken and RecurringDeposits contracts
      const { recurringDeposits, mockSuperToken } = await deploy(3600);

      // Schedule a recurring deposit
      const amount = await ethers.BigNumber.from("1000");
      const times = await ethers.BigNumber.from("10");
      await recurringDeposits.scheduleDeposit(amount, times);

      // Check that the deposit was scheduled correctly
      const owner = (await recurringDeposits.depositIndices(alice.getAddress())).toString();
      const deposit = await recurringDeposits.scheduledDeposits(owner);
      expect(deposit.amount.toString()).to.equal(amount.toString(), "Incorrect deposit amount");
      expect(deposit.times.toString()).to.equal(times.toString(), "Incorrect number of times");
    });

    it("#2.1 User can perform the next scheduled deposit", async () => {
      const { recurringDeposits, mockSuperToken } = await deploy(3600);

      // Schedule a recurring deposit
      const amount = ethers.utils.parseEther("1");
      const times = 1;
      await recurringDeposits.scheduleDeposit(amount, times, { value: amount });

      // Get the balance of the depositor before the deposit
      const initialBalance = await mockSuperToken.balanceOf(deployer.address);

      // Advance the block timestamp to trigger the deposit
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);

      // Perform the next deposit
      await recurringDeposits.performNextDeposit();

      // Get the balance of the depositor after the deposit
      const finalBalance = await mockSuperToken.balanceOf(deployer.address);

      // Check that the deposit has been performed
      expect(finalBalance.sub(initialBalance).toString()).to.equal(amount.toString(), "Incorrect amount deposited");
      const scheduledDeposit = await recurringDeposits.scheduledDeposits(0);
      expect(scheduledDeposit.times.toString()).to.equal("0", "Incorrect number of times");
    });


  });
});
