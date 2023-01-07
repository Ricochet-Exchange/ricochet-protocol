import { network, ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

describe("RecurringDeposits", () => {
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let mockSuperToken: any;
    let recurringDeposits: any;
    const GELATO_OPS = "0x527a819db1eb0e34426297b03bae11F2f8B3A19E"; // Mainnet Gelato Ops Address
    const USDC_TOKEN = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // Mainnet USDC Token Address
    const RIC_TOKEN = "0x263026E7e53DBFDce5ae55Ade22493f828922965"; // Mainnet RIC Token Address
    const RIC_HOLDER = "0x14aD7D958ab2930863B68E7D98a7FDE6Ae4Cd12f"; // Ricochet holder
    const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Mainnet Uniswap Router Address
    const ONE_ETH = BigNumber.from("1000000");

    const deploy = async (period: number) => {
      // Get RIC token at contract address
      const ricToken = await ethers.getContractAt("MockERC20", RIC_TOKEN);
      const usdcToken = await ethers.getContractAt("MockERC20", USDC_TOKEN);
      const gasToken = usdcToken;

      // Make a mock token for scheduled deposits
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mockERC20 = await MockERC20.deploy("MockERC20", "MERC20");
    
      // Mint alice and bob some tokens
      await mockERC20.mint(alice.getAddress(), ONE_ETH);
      await mockERC20.mint(bob.getAddress(), ONE_ETH);


      // Make a corresponding mock super token for mockERC20
      const MockSuperToken = await ethers.getContractFactory("MockSuperToken");
      const mockSuperToken = await MockSuperToken.deploy(mockERC20.address);
      
      const RecurringDeposits = await ethers.getContractFactory("RecurringDeposits");
      const recurringDeposits = await RecurringDeposits.deploy(
          mockSuperToken.address, 
          usdcToken.address,
          UNISWAP_ROUTER,
          period, 
          25, 
          GELATO_OPS, 
          deployer.address, 
          { gasLimit: 10000000 }
      );
      await recurringDeposits.deployed();
      await recurringDeposits.createTask();

      // Approve the contract to spend alice and bob's tokens
      await gasToken.connect(alice).approve(recurringDeposits.address, ONE_ETH);
      await gasToken.connect(bob).approve(recurringDeposits.address, ONE_ETH);
      await mockERC20.connect(alice).approve(recurringDeposits.address, ONE_ETH);
      await mockERC20.connect(bob).approve(recurringDeposits.address, ONE_ETH);

      
      return { recurringDeposits, mockSuperToken, mockERC20, gasToken };
    };

    const getTokens = async (account: SignerWithAddress, tokenAddress: string, amount: BigNumber) => {
      // Get token at contract address
      const token = await ethers.getContractAt("MockERC20", tokenAddress);

      // Impersonate a large RIC token holder and transfer RIC to alice and bob
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        // Ricochet holder
        params: ["0x14aD7D958ab2930863B68E7D98a7FDE6Ae4Cd12f"],
      });
      const ricHolder = await ethers.getSigner(RIC_HOLDER);

      // Transfer amount to account
      await token.connect(ricHolder).transfer(account.getAddress(), amount);
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

    it("1.2 Creates the gelato task", async () => {

    });
  
  });

  // Create a new context and test case for the depositGas and withdrawGas functions in REXRecurringDeposits.sol
  context("2 Gas Tank", () => {
    
    it("2.1 Deposit and withdraw gas works", async () => {
      const { recurringDeposits, gasToken } = await deploy(3600);

      // Send alice some RIC tokens for a gas deposit
      await getTokens(alice, gasToken.address, ONE_ETH);

      // Create a new scheduled deposit
      let createDeposit = await recurringDeposits.connect(alice).scheduleDeposit(ONE_ETH, 1);

      // Deposit gas for alice
      let depositGas = await recurringDeposits.connect(alice).depositGas(ONE_ETH);
      expect(await recurringDeposits.gasTank(alice.address)).to.equal(ONE_ETH , "Incorrect deposit gas");
      expect(await gasToken.balanceOf(alice.address)).to.equal(0, "Incorrect ric balance after deposit");

      // Withdraw gas for alice
      let withdrawGas = await recurringDeposits.connect(alice).withdrawGas(ONE_ETH);
      expect(await recurringDeposits.gasTank(alice.address)).to.equal(0, "Incorrect withdraw gas"); 
      expect(await gasToken.balanceOf(alice.address)).to.equal(ONE_ETH, "Incorrect ric balance after withdraw");

    });

  });

    
  context("3 Scheduling a recurring deposit", () => {

    it("3.1 User can schedule a recurring deposit", async () => {
      // Deploy the Supertoken and RecurringDeposits contracts
      const { recurringDeposits, mockSuperToken } = await deploy(3600);

      // Schedule a recurring deposit
      const times = await ethers.BigNumber.from("10");
      await recurringDeposits.connect(alice).scheduleDeposit(ONE_ETH, times);

      // Check that the deposit was scheduled correctly
      const owner = (await recurringDeposits.depositIndices(alice.getAddress())).toString();
      const deposit = await recurringDeposits.scheduledDeposits(owner);
      expect(deposit.amount.toString()).to.equal(ONE_ETH.toString(), "Incorrect deposit amount");
      expect(deposit.times.toString()).to.equal(times.toString(), "Incorrect number of times");
    });

    it("3.2 Anyone can perform the next scheduled deposit", async () => {
      const { recurringDeposits, mockSuperToken, mockERC20 } = await deploy(3600);

      // Schedule a recurring deposit
      const times = 1;
      const feeRateScaler = 10000;
      const feeRate = await recurringDeposits.feeRate();
      await recurringDeposits.connect(alice).scheduleDeposit(ONE_ETH, times);

      // Get the token balances for alice
      const initialERC20Balance = await mockERC20.balanceOf(alice.getAddress());
      const initialSuperTokenBalance = await mockSuperToken.balanceOf(alice.getAddress());

      // Advance the block timestamp to trigger the deposit
      await ethers.provider.send("evm_increaseTime", [3700]);
      await ethers.provider.send("evm_mine", []);

      // Approve the contract to spend the depositor's tokens
      await mockERC20.connect(alice).approve(recurringDeposits.address, ONE_ETH);

      // Perform the next deposit
      await recurringDeposits.performNextDeposit();

      // Get the balance of the depositor after the deposit
      const finalERC20Balance = await mockERC20.balanceOf(alice.getAddress());
      const finalSuperTokenBalance = await mockSuperToken.balanceOf(alice.getAddress());

      // Get the depolyer's balance of the deposit token
      const deployerERC20Balance = await mockERC20.balanceOf(deployer.getAddress());

      // Check that the deposit has been performed
      expect(finalERC20Balance.sub(initialERC20Balance).toString()).to.equal(ONE_ETH.mul(-1).toString(), "Incorrect amount deposited");
      expect(deployerERC20Balance.toString()).to.equal((ONE_ETH.mul(feeRate).div(feeRateScaler)).toString(), "Incorrect fee taken");
      expect(finalSuperTokenBalance.sub(initialSuperTokenBalance).toString()).to.equal((ONE_ETH.mul(feeRateScaler-feeRate).div(feeRateScaler)).toString(), "Incorrect amount received");
      const scheduledDeposit = await recurringDeposits.scheduledDeposits(0);
      expect(scheduledDeposit.times.toString()).to.equal("0", "Incorrect number of times");
    });

    it("3.3 User can cancel their scheduled deposit", async () => {
      const { recurringDeposits, mockSuperToken, mockERC20 } = await deploy(3600);

      // Schedule a recurring deposit
      const times = 1;
      await recurringDeposits.connect(alice).scheduleDeposit(ONE_ETH, times);

      // Approve the contract to spend the depositor's tokens
      await mockERC20.connect(alice).approve(recurringDeposits.address, ONE_ETH);

      // Cancel the deposit
      await recurringDeposits.connect(alice).cancelScheduledDeposit();

      // Check that the deposit has been cancelled
      const scheduledDeposit = await recurringDeposits.scheduledDeposits(0);
      expect(scheduledDeposit.times.toString()).to.equal("0", "Incorrect number of times");
    });

  });
});
