import { assert, expect } from "chai";
import { ethers } from 'hardhat';
import { Bank, BankFactory, GLDToken, TellorPlayground, USDToken } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BankData } from "./BankData";

describe("BankFactory", function () {

  const FIRST_BANK_NUMBER = 0;
  const SECOND_BANK_NUMBER = 1;

  // Bank Parameters
  const BANK_NAME = "Test Bank";
  const INTEREST_RATE = 12;
  const ORIGINATION_FEE = 1;
  const COLLATERALIZATION_RATIO = 150;
  const LIQUIDATION_PENALTY = 25;
  const PERIOD = 86400;

  // Tellor Oracle
  const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
  const TELLOR_REQUEST_ID = 60;

  let newBank: BankData;
  let bankFactoryInstance: BankFactory;
  let bankInstance: Bank;
  let bank;
  let bankFactory;
  let ctInstance: GLDToken;
  let dtInstance: USDToken;
  let tp: TellorPlayground;
  let owner: string;
  let deployer: SignerWithAddress;
  let randomUser: SignerWithAddress;
  let randomUser2: SignerWithAddress;
  const ZERO = ethers.BigNumber.from(0);
  const ONE = ethers.constants.One;    // the same as "ethers.BigNumber.from(1);"

  beforeEach(async function () {

    // get signers
    [, deployer, randomUser, randomUser2] = await ethers.getSigners();

    bankFactory = (await ethers.getContractFactory(
      "BankFactory",
      deployer
    ));
    bank = (await ethers.getContractFactory(
      "Bank",
      deployer
    ));

    bankInstance = await bank.deploy(TELLOR_ORACLE_ADDRESS);
    bankFactoryInstance = await bankFactory.deploy(bankInstance.address);
    await bankFactoryInstance.deployed();

    // Deploy Tellor Oracle contracts
    const TellorPlayground = await ethers.getContractFactory('TellorPlayground');
    tp = await TellorPlayground.attach(TELLOR_ORACLE_ADDRESS);
    tp = tp.connect(deployer);

    // Bank set up
    const CT = await ethers.getContractFactory("GLDToken");
    const DT = await ethers.getContractFactory("USDToken");
    ctInstance = await CT.deploy(ethers.BigNumber.from(10000));
    dtInstance = await DT.deploy(ethers.BigNumber.from(10000));

    await ctInstance.transfer(randomUser.address, ethers.BigNumber.from(500));
    await dtInstance.transfer(randomUser.address, ethers.BigNumber.from(500));
  });

  it("should be owned by the creator", async function () {
    owner = await bankFactoryInstance.owner();
    assert.equal(owner, await deployer.getAddress());
  });

  it("should emit a BankCreated event", async function () {
    expect(
      await bankFactoryInstance.connect(randomUser).createBank(BANK_NAME, INTEREST_RATE,
        ORIGINATION_FEE, COLLATERALIZATION_RATIO, LIQUIDATION_PENALTY, PERIOD, TELLOR_ORACLE_ADDRESS))
      .to.emit(bankFactoryInstance, "BankCreated");
  });

  it("should create a bank clone with correct parameters", async function () {
    await bankFactoryInstance.connect(randomUser).createBank(BANK_NAME, INTEREST_RATE,
      ORIGINATION_FEE, COLLATERALIZATION_RATIO, LIQUIDATION_PENALTY, PERIOD, TELLOR_ORACLE_ADDRESS);
    newBank = await filterEvent(bankFactoryInstance, FIRST_BANK_NUMBER);
    let myBank = await bankInstance.attach(newBank.bankAddress);
    await myBank.deployed();
    await myBank.connect(randomUser).setCollateral(ctInstance.address, 2, 1000, 1000);
    await myBank.connect(randomUser).setDebt(dtInstance.address, 1, 1000, 1000);
    const interestRate = await myBank.getInterestRate();
    const originationFee = await myBank.getOriginationFee();
    const collateralizationRatio = await myBank.getCollateralizationRatio();
    const liquidationPenalty = await myBank.getLiquidationPenalty();
    const reserveBalance = await myBank.getReserveBalance();
    const reserveCollateralBalance = await myBank.getReserveCollateralBalance();
    const dtAddress = await myBank.getDebtTokenAddress();
    const ctAddress = await myBank.getCollateralTokenAddress();
    const bankCount = await bankFactoryInstance.getNumberOfBanks();
    const bankAddress = await bankFactoryInstance.getBankAddressAtIndex(0);

    assert.equal(bankAddress, await myBank.address);
    assert(bankCount.eq(ONE));
    assert.equal(owner, await deployer.getAddress());
    assert(interestRate.eq(ethers.BigNumber.from(INTEREST_RATE)));
    assert(originationFee.eq(ethers.BigNumber.from(ORIGINATION_FEE)));
    assert(collateralizationRatio.eq(ethers.BigNumber.from(COLLATERALIZATION_RATIO)));
    assert(liquidationPenalty.eq(ethers.BigNumber.from(LIQUIDATION_PENALTY)));
    assert(reserveBalance.eq(ZERO));
    assert(reserveCollateralBalance.eq(ZERO));
    assert.equal(dtAddress, dtInstance.address);
    assert.equal(ctAddress, ctInstance.address);
  });

  it("should create multiple bank clones with correct parameters", async function () {

    // Create first bank
    await bankFactoryInstance.connect(randomUser).createBank(BANK_NAME, INTEREST_RATE,
      ORIGINATION_FEE, COLLATERALIZATION_RATIO, LIQUIDATION_PENALTY, PERIOD, TELLOR_ORACLE_ADDRESS);
    newBank = await filterEvent(bankFactoryInstance, FIRST_BANK_NUMBER);
    // console.log("  ===== New Bank 2: " + newBank);
    let myBank = await bankInstance.attach(newBank.bankAddress);
    await myBank.deployed();
    await myBank.connect(randomUser).setCollateral(ctInstance.address, 2, 1000, 1000);
    await myBank.connect(randomUser).setDebt(dtInstance.address, 1, 1000, 1000);
    const owner1 = newBank.bankOwner;

    assert.equal(newBank.bankAddress, myBank.address);
    assert.equal(await bankFactoryInstance.getBankAddressAtIndex(FIRST_BANK_NUMBER), await myBank.address);
    assert((await bankFactoryInstance.getNumberOfBanks()).eq(ONE));

    // Create second bank
    await bankFactoryInstance.connect(randomUser2).createBank(BANK_NAME, INTEREST_RATE,
      ORIGINATION_FEE, COLLATERALIZATION_RATIO, LIQUIDATION_PENALTY, PERIOD, TELLOR_ORACLE_ADDRESS);
    newBank = await filterEvent(bankFactoryInstance, SECOND_BANK_NUMBER);
    let myBank2 = await bankInstance.attach(newBank.bankAddress);
    await myBank2.deployed();
    await myBank2.connect(randomUser2).setCollateral(ctInstance.address, 2, 1000, 1000);
    await myBank2.connect(randomUser2).setDebt(dtInstance.address, 1, 1000, 1000);
    const owner2 = newBank.bankOwner;  
    
    const bankCount = await bankFactoryInstance.getNumberOfBanks();
    const bankAddress1 = await bankFactoryInstance.getBankAddressAtIndex(FIRST_BANK_NUMBER);
    const bankAddress2 = await bankFactoryInstance.getBankAddressAtIndex(SECOND_BANK_NUMBER);

    assert.equal(bankAddress1, myBank.address);
    assert.equal(bankAddress2, myBank2.address);
    assert(bankCount.eq(ethers.constants.Two));
    assert.equal(owner1, randomUser.address);
    assert.equal(owner2, randomUser2.address);
  });

});

describe("getNumberOfBanks", () => {
  it("should return the correct number", async () => {

  });
});

describe("getBankAddressAtIndex", () => {
  it("should return the correct address", async () => {

  });
});

// returns the address and the owner of the bank created with the number passed as a parameter
async function filterEvent(bankFactoryInstance: BankFactory, bankNumber: number): Promise<BankData> {
  let newAddress: string = "";
  let bankOwner: string = "";
  const bankAddress = await bankFactoryInstance.getBankAddressAtIndex(bankNumber);
  const filter = bankFactoryInstance.filters.BankCreated();
  // beware about an error regarding the block number in mainnet forking
  const logs = bankFactoryInstance.queryFilter(filter, parseInt(`${process.env.FORK_BLOCK_NUMBER}`));
  (await logs).forEach((log) => {
    // console.log("function filterEvent === new bank: " + log.args.newBankAddress + "  owner: " + log.args.owner);
    // console.log("function filterEvent === bankAddress: " + bankAddress);
    newAddress = log.args.newBankAddress;
    bankOwner = log.args.owner;
  });
  return {
    bankAddress: newAddress,
    bankOwner: bankOwner
  }
}
