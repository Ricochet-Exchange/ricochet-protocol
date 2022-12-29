import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";


describe("RecurringDeposits", () => {
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let mockSuperToken: any;
    let recurringDeposits: any;
    const GELATO_OPS = "0x527a819db1eb0e34426297b03bae11F2f8B3A19E"; // Mainnet Gelato Ops Address

    const deploy = async (period: number) => {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mockERC20 = await MockERC20.deploy("MockERC20", "MERC20");

      // Mint alice and bob some tokens
      await mockERC20.mint(alice.getAddress(), ethers.utils.parseEther("1000"));
      await mockERC20.mint(bob.getAddress(), ethers.utils.parseEther("1000"));

      const MockSuperToken = await ethers.getContractFactory("MockSuperToken");
      const mockSuperToken = await MockSuperToken.deploy(mockERC20.address);
      
      console.log("Recurring deposits");
      const RecurringDeposits = await ethers.getContractFactory("RecurringDeposits");
      const recurringDeposits = await RecurringDeposits.deploy(mockSuperToken.address, period, 25, GELATO_OPS, deployer.address, { gasLimit: 10000000 });

      // Approve the contract to spend alice and bob's tokens
      await mockERC20.connect(alice).approve(recurringDeposits.address, ethers.utils.parseEther("1000"));
      await mockERC20.connect(bob).approve(recurringDeposits.address, ethers.utils.parseEther("1000"));
      
      return { recurringDeposits, mockSuperToken, mockERC20 };
    };
  
    before(async () => {
      [deployer, alice, bob] = await ethers.getSigners();
      
    });

  context("1 Contract constructor", () => {
    it("1.1 Initializes the contract correctly", async () => {
      const { recurringDeposits, mockSuperToken } = await deploy(3600);

      // Check that the contract variables have the expected values
      const depositTokenAddress = await recurringDeposits.depositToken();
      const period = await recurringDeposits.period();
      expect(depositTokenAddress).to.equal(mockSuperToken.address, "Incorrect deposit token address");
      expect(period.toString()).to.equal("3600", "Incorrect period");
    });
  });

    
  context("2 Scheduling a recurring deposit", () => {
    it("2.1 User can schedule a recurring deposit", async () => {
      // Deploy the Supertoken and RecurringDeposits contracts
      const { recurringDeposits, mockSuperToken } = await deploy(3600);

      // Schedule a recurring deposit
      const amount = await ethers.BigNumber.from("1000");
      const times = await ethers.BigNumber.from("10");
      await recurringDeposits.connect(alice).scheduleDeposit(amount, times);

      // Check that the deposit was scheduled correctly
      const owner = (await recurringDeposits.depositIndices(alice.getAddress())).toString();
      const deposit = await recurringDeposits.scheduledDeposits(owner);
      expect(deposit.amount.toString()).to.equal(amount.toString(), "Incorrect deposit amount");
      expect(deposit.times.toString()).to.equal(times.toString(), "Incorrect number of times");
    });

    it("2.2 Anyone can perform the next scheduled deposit", async () => {
      const { recurringDeposits, mockSuperToken, mockERC20 } = await deploy(3600);

      // Schedule a recurring deposit
      const amount = ethers.utils.parseEther("1");
      const times = 1;
      const feeRateScaler = 10000;
      const feeRate = await recurringDeposits.feeRate();
      await recurringDeposits.connect(alice).scheduleDeposit(amount, times);

      // Get the token balances for alice
      const initialERC20Balance = await mockERC20.balanceOf(alice.getAddress());
      const initialSuperTokenBalance = await mockSuperToken.balanceOf(alice.getAddress());

      // Advance the block timestamp to trigger the deposit
      await ethers.provider.send("evm_increaseTime", [3700]);
      await ethers.provider.send("evm_mine", []);

      // Approve the contract to spend the depositor's tokens
      await mockERC20.connect(alice).approve(recurringDeposits.address, amount);

      // Perform the next deposit
      await recurringDeposits.performNextDeposit();

      // Get the balance of the depositor after the deposit
      const finalERC20Balance = await mockERC20.balanceOf(alice.getAddress());
      const finalSuperTokenBalance = await mockSuperToken.balanceOf(alice.getAddress());

      // Get the depolyer's balance of the deposit token
      const deployerERC20Balance = await mockERC20.balanceOf(deployer.getAddress());

      // Check that the deposit has been performed
      expect(finalERC20Balance.sub(initialERC20Balance).toString()).to.equal(amount.mul(-1).toString(), "Incorrect amount deposited");
      expect(deployerERC20Balance.toString()).to.equal((amount.mul(feeRate).div(feeRateScaler)).toString(), "Incorrect fee taken");
      expect(finalSuperTokenBalance.sub(initialSuperTokenBalance).toString()).to.equal((amount.mul(feeRateScaler-feeRate).div(feeRateScaler)).toString(), "Incorrect amount received");
      const scheduledDeposit = await recurringDeposits.scheduledDeposits(0);
      expect(scheduledDeposit.times.toString()).to.equal("0", "Incorrect number of times");
    });

    it("2.3 User can cancel their scheduled deposit", async () => {
      const { recurringDeposits, mockSuperToken, mockERC20 } = await deploy(3600);

      // Schedule a recurring deposit
      const amount = ethers.utils.parseEther("1");
      const times = 1;
      await recurringDeposits.connect(alice).scheduleDeposit(amount, times);

      // Approve the contract to spend the depositor's tokens
      await mockERC20.connect(alice).approve(recurringDeposits.address, amount);

      // Cancel the deposit
      await recurringDeposits.connect(alice).cancelScheduledDeposit();

      // Check that the deposit has been cancelled
      const scheduledDeposit = await recurringDeposits.scheduledDeposits(0);
      expect(scheduledDeposit.times.toString()).to.equal("0", "Incorrect number of times");
    });

  });
});
