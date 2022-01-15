import { network, ethers } from 'hardhat';
import { increaseTime } from "../hardhat-utils/time-utils";
import { assert, expect } from 'chai';

import { Bank, GLDToken, TellorPlayground, USDToken } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from 'ethers';

describe("Bank", function () {
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const KEEPER_ROLE = ethers.utils.solidityKeccak256(["string"], ["KEEPER_ROLE"]);
  const REPORTER_ROLE = ethers.utils.solidityKeccak256(["string"], ["REPORTER_ROLE"]);

  const DAYS_IN_A_YEAR = ethers.BigNumber.from(365);
  const BIGNUMBER_10000 = ethers.BigNumber.from(10000);

  const INTEREST_RATE = 1200; // 12%
  const ORIGINATION_FEE = 100; // 1%
  const COLLATERALIZATION_RATIO = 150;
  const LIQUIDATION_PENALTY = 25;
  const PERIOD = 86400;
  const BANK_NAME = "Test Bank";
  const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
  const TELLOR_REQUEST_ID = 60;
  let oracle;
  const INITIAL_BALANCE = "8000";
  let depositAmount: BigNumber;
  let largeDepositAmount: BigNumber;
  let withdrawAmount;
  let borrowAmount: BigNumber;
  let largeBorrowAmount: BigNumber;
  let smallBorrowAmount: BigNumber;

  let deployer: SignerWithAddress;    // admin
  let randomUser: SignerWithAddress;
  let randomUser2: SignerWithAddress;
  let randomUser3: SignerWithAddress;
  let randomUser4: SignerWithAddress;
  let randomUser5: SignerWithAddress;
  let randomUser6: SignerWithAddress;
  let randomUser7: SignerWithAddress;
  let randomUser8: SignerWithAddress;
  let randomUser9: SignerWithAddress;

  let CT2;
  let DT2;
  let ctInstance2: GLDToken;
  let dtInstance2: USDToken;
  let bankInstance2: Bank;
  let bank2;
  let tp: TellorPlayground;

  beforeEach(async function () {
    // get signers
    [deployer, randomUser, randomUser2, randomUser3, randomUser4, randomUser5, randomUser6,
      randomUser7, randomUser8, randomUser9] = await ethers.getSigners();

    // Bank set up
    CT2 = await ethers.getContractFactory("GLDToken");
    DT2 = await ethers.getContractFactory("USDToken");
    ctInstance2 = await CT2.deploy(ethers.utils.parseUnits("20000"));  // JR
    dtInstance2 = await DT2.deploy(ethers.utils.parseUnits("20000"));  // JR
    await ctInstance2.deployed();
    await dtInstance2.deployed();
    bank2 = (await ethers.getContractFactory("Bank", deployer));
    bankInstance2 = await bank2.deploy(TELLOR_ORACLE_ADDRESS);
    await bankInstance2.deployed();

    await bankInstance2.connect(deployer).init(deployer.address, BANK_NAME, INTEREST_RATE, ORIGINATION_FEE,
      COLLATERALIZATION_RATIO, LIQUIDATION_PENALTY, PERIOD, randomUser6.address, TELLOR_ORACLE_ADDRESS);
    await bankInstance2.setCollateral(ctInstance2.address, 2, 1000, 1000);
    await bankInstance2.setDebt(dtInstance2.address, 1, 1000, 1000);
    depositAmount = ethers.utils.parseUnits("100");
    largeDepositAmount = ethers.utils.parseUnits("5000");
    withdrawAmount = ethers.utils.parseUnits("50");
    borrowAmount = ethers.utils.parseUnits("66");
    largeBorrowAmount = ethers.utils.parseUnits("75");
    smallBorrowAmount = ethers.utils.parseUnits("20");
    //  A non-admin has a positive balance
    await ctInstance2.transfer(randomUser2.address, ethers.utils.parseUnits(INITIAL_BALANCE));
    await dtInstance2.transfer(randomUser2.address, ethers.utils.parseUnits(INITIAL_BALANCE));
    //  The admin has a positive balance
    await ctInstance2.transfer(deployer.address, ethers.utils.parseUnits(INITIAL_BALANCE));  // Added line
    await dtInstance2.transfer(deployer.address, ethers.utils.parseUnits(INITIAL_BALANCE));  // Added line

    // set keepers
    await bankInstance2.addKeeper(randomUser3.address);
    await bankInstance2.addKeeper(randomUser4.address);
    //set updaters
    await bankInstance2.addReporter(randomUser5.address);
    await bankInstance2.addReporter(randomUser6.address);
  });

  it('should create bank with correct parameters', async function () {
    const interestRate = await bankInstance2.getInterestRate();
    const originationFee = await bankInstance2.getOriginationFee();
    const collateralizationRatio = await bankInstance2.getCollateralizationRatio();
    const liquidationPenalty = await bankInstance2.getLiquidationPenalty();
    const reserveBalance = await bankInstance2.getReserveBalance();
    const reserveCollateralBalance = await bankInstance2.getReserveCollateralBalance();
    // ==
    const isAdmin = await bankInstance2.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    const isKeeper1 = await bankInstance2.hasRole(KEEPER_ROLE, randomUser3.address);
    const isKeeper2 = await bankInstance2.hasRole(KEEPER_ROLE, randomUser4.address);
    const isReporter1 = await bankInstance2.hasRole(REPORTER_ROLE, randomUser5.address);
    const isReporter2 = await bankInstance2.hasRole(REPORTER_ROLE, randomUser6.address);
    const dtAddress = await bankInstance2.getDebtTokenAddress();
    const ctAddress = await bankInstance2.getCollateralTokenAddress();
    const name = await bankInstance2.getName();

    // console.log("  ===== bankInstance2.isAdmin: " + isAdmin);
    assert.ok(isAdmin);
    assert.ok(isKeeper1);
    assert.ok(isKeeper2);
    assert.ok(isReporter1);
    assert.ok(isReporter2);
    assert.equal(name, BANK_NAME);
    assert(interestRate.eq(ethers.BigNumber.from(INTEREST_RATE)));
    assert(originationFee.eq(ethers.BigNumber.from(ORIGINATION_FEE)));
    assert(collateralizationRatio.eq(ethers.BigNumber.from(COLLATERALIZATION_RATIO)));
    assert(liquidationPenalty.eq(ethers.BigNumber.from(LIQUIDATION_PENALTY)));
    assert(reserveBalance.eq(ethers.constants.Zero));
    assert(reserveCollateralBalance.eq(ethers.constants.Zero));
    assert(dtAddress, dtInstance2.address);
    assert(ctAddress, ctInstance2.address);
  });

  it('only admin role should add / remove new roles', async function () {
    const admin = await bankInstance2.getRoleMember(DEFAULT_ADMIN_ROLE, 0);
    assert((await bankInstance2.getRoleMemberCount(KEEPER_ROLE)).eq(ethers.constants.Two));
    assert((await bankInstance2.getRoleMemberCount(REPORTER_ROLE)).eq(ethers.constants.Two));

    // user not in role adds keeper
    await expect(bankInstance2.connect(randomUser7).addKeeper(randomUser8.address))
      .to.be.revertedWith("AccessControl");
    await expect(bankInstance2.connect(randomUser7).addReporter(randomUser8.address))
      .to.be.revertedWith("AccessControl");

    // keeper adds another keeper
    let keeper = (await bankInstance2.getRoleMember(KEEPER_ROLE, 0));
    let keeperSigner = await ethers.getSigner(keeper);
    await expect(bankInstance2.connect(keeperSigner).addKeeper(randomUser8.address)).to.be.revertedWith("AccessControl");

    // reporter adds another reporter  
    let reporter = await bankInstance2.getRoleMember(REPORTER_ROLE, 0);
    let reporterSigner = await ethers.getSigner(reporter);
    await expect(bankInstance2.connect(reporterSigner).addReporter(randomUser8.address)).to.be.revertedWith("AccessControl");

    // admin adds new keeper
    let adminSigner = await ethers.getSigner(admin);
    await bankInstance2.connect(adminSigner).addKeeper(randomUser8.address);
    assert((await bankInstance2.getRoleMemberCount(KEEPER_ROLE)).eq(ethers.BigNumber.from(3)));

    // admin adds new reporter
    await bankInstance2.connect(adminSigner).addReporter(randomUser8.address);
    assert((await bankInstance2.getRoleMemberCount(REPORTER_ROLE)).eq(ethers.BigNumber.from(3)));

    // keeper removes keeper
    keeper = (await bankInstance2.getRoleMember(KEEPER_ROLE, 0));
    keeperSigner = await ethers.getSigner(keeper);
    const removeKeeper = await bankInstance2.getRoleMember(KEEPER_ROLE, 1);
    await expect(bankInstance2.connect(keeperSigner).revokeKeeper(removeKeeper)).to.be.revertedWith("AccessControl");

    // reporter removes reporter
    reporter = await bankInstance2.getRoleMember(REPORTER_ROLE, 0);
    reporterSigner = await ethers.getSigner(reporter);
    const removeReporter = await bankInstance2.getRoleMember(REPORTER_ROLE, 1);
    await expect(bankInstance2.connect(reporterSigner).revokeReporter(removeReporter)).to.be.revertedWith("AccessControl");

    // admin removes keeper and updater
    await bankInstance2.connect(adminSigner).revokeKeeper(removeKeeper);
    await bankInstance2.connect(adminSigner).revokeReporter(removeReporter);

    assert((await bankInstance2.getRoleMemberCount(KEEPER_ROLE)).eq(ethers.BigNumber.from(2)));
    assert((await bankInstance2.getRoleMemberCount(REPORTER_ROLE)).eq(ethers.BigNumber.from(2)));
  });


  it('should allow admin to deposit reserves', async function () {
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    // let adminAllowance = await dtInstance2.allowance(deployer.address, bankInstance2.address);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);
    const reserveBalance = await bankInstance2.getReserveBalance();
    const tokenBalance = await dtInstance2.balanceOf(bankInstance2.address);
    assert(reserveBalance.eq(depositAmount));
    assert(tokenBalance.eq(depositAmount));
  });

  it('should allow admin to withdraw reserves', async function () {

    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);
    const beforeReserveBalance = await bankInstance2.getReserveBalance();
    await bankInstance2.connect(deployer).reserveWithdraw(depositAmount);
    const afterReserveBalance = await bankInstance2.getReserveBalance();
    const bankTokenBalance = await dtInstance2.balanceOf(bankInstance2.address);
    const bankFactoryOwner = await bankInstance2.getBankFactoryOwner();
    const bankCreatorBalance = await dtInstance2.balanceOf(deployer.address);
    const bankFactoryOwnerBalance = await dtInstance2.balanceOf(bankFactoryOwner);
    const feeAmt = depositAmount.div(ethers.BigNumber.from(200));
    assert(beforeReserveBalance.eq(depositAmount));
    assert(afterReserveBalance.eq(ethers.constants.Zero));
    assert(bankTokenBalance.eq(ethers.constants.Zero));
    assert(bankFactoryOwnerBalance.eq(feeAmt));
  });

  it('should not allow non-admin to deposit reserves', async function () {
    await expect(bankInstance2.connect(randomUser2).reserveDeposit(ethers.utils.parseUnits("100"))).to.be.revertedWith("AccessControl");
  });

  it('should not allow non-admin to withdraw reserves', async function () {
    await expect(bankInstance2.connect(randomUser2).reserveWithdraw(ethers.utils.parseUnits("100"))).to.be.revertedWith("AccessControl");
  });

  it('should allow user to deposit collateral into vault', async function () {
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    const collateralAmount = await bankInstance2.connect(randomUser2).getVaultCollateralAmount();
    const debtAmount = await bankInstance2.connect(randomUser2).getVaultDebtAmount();
    const tokenBalance = await ctInstance2.balanceOf(bankInstance2.address);
    assert(collateralAmount.eq(depositAmount));
    assert(debtAmount.eq(ethers.constants.Zero));
    assert(tokenBalance.eq(depositAmount));
  });

  it('should allow user to withdraw collateral from vault', async function () {
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    // let user2Allowance = await ctInstance2.allowance(randomUser2.address, bankInstance2.address);

    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await bankInstance2.connect(randomUser2).vaultWithdraw(depositAmount);

    const collateralAmount = await bankInstance2.connect(randomUser2).getVaultCollateralAmount();
    const debtAmount = await bankInstance2.connect(randomUser2).getVaultDebtAmount();
    const tokenBalance = await ctInstance2.balanceOf(bankInstance2.address);
    assert(collateralAmount.eq(ethers.constants.Zero));
    assert(debtAmount.eq(ethers.constants.Zero));
    assert(tokenBalance.eq(ethers.constants.Zero));
  });

  it('should not allow user to withdraw more collateral than they have in vault', async function () {
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await expect(bankInstance2.connect(randomUser2).vaultWithdraw(largeDepositAmount)).to.be.revertedWith("CANNOT WITHDRAW MORE COLLATERAL");
  });

  it('should not allow user to withdraw collateral from vault if undercollateralized', async function () {   // Not passed
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);
  
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await bankInstance2.connect(randomUser2).vaultBorrow(depositAmount);
    await expect(bankInstance2.connect(randomUser2).vaultWithdraw(largeDepositAmount)).to.be.revertedWith("CANNOT UNDERCOLLATERALIZE VAULT");
  });  // Error ---> I get "reverted with reason string 'NOT ENOUGH COLLATERAL'"

  it('should add origination fee to a vault\'s borrowed amount', async function () {   // Not passed
    // await dtInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    // await bankInstance2.connect(randomUser2).reserveDeposit(depositAmount);
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await bankInstance2.connect(randomUser2).vaultBorrow(depositAmount);
    const collateralAmount = await bankInstance2.connect(randomUser2).getVaultCollateralAmount();
    const debtAmount = await bankInstance2.connect(randomUser2).getVaultDebtAmount();
    console.log("123456aaa collateralAmount: " + collateralAmount);
    assert(collateralAmount.eq(depositAmount));
    console.log("123456 - ");
    // Calculate borrowed amount
    let b_amount = borrowAmount;
    b_amount = b_amount.add(
      b_amount.mul(ethers.BigNumber.from(ORIGINATION_FEE)).div(BIGNUMBER_10000));
    assert(debtAmount.eq(ethers.BigNumber.from(b_amount)));

    const collateralBalance = await ctInstance2.balanceOf(bankInstance2.address);
    const debtBalance = await dtInstance2.balanceOf(bankInstance2.address);
    assert(collateralBalance.eq(depositAmount));
    assert(debtBalance.eq(ethers.BigNumber.from(34)));
  });  // Error ---> I get "reverted with reason string 'NOT ENOUGH COLLATERAL"

  it('should allow the user to borrow', async function () {    // JR TEMPLATE
    // The approve is required
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    const reserveBalance = await bankInstance2.getReserveBalance();
    const tokenBalance = await ctInstance2.balanceOf(bankInstance2.address);
    const debtAmount2 = await bankInstance2.connect(randomUser2).getVaultDebtAmount();
    console.log("============= AAA: reserveBalance: " + reserveBalance);
    console.log("============= AAA: tokenBalance: " + tokenBalance);
    console.log("============= AAA: debtAmount2: " + debtAmount2);

    await bankInstance2.connect(randomUser2).vaultBorrow(smallBorrowAmount);
    console.log("============= AAA: allow the user to borrow ======");
    await increaseTime(60 * 60 * 24 * 2 + 10);
    await bankInstance2.connect(randomUser2).vaultBorrow(smallBorrowAmount);
    const collateralAmount = await bankInstance2.connect(randomUser2).getVaultCollateralAmount();
    const debtAmount = await bankInstance2.connect(randomUser2).getVaultDebtAmount();
    assert(collateralAmount.eq(depositAmount));
    // Calculate borrowed amount, use pays origination fee on 2 borrows
    let s_amount = smallBorrowAmount;
    let b_amount = s_amount.add(s_amount.mul(ethers.BigNumber.from(ORIGINATION_FEE)).div(BIGNUMBER_10000));
    let f_b_amount = b_amount.add(b_amount.mul(ethers.BigNumber.from(INTEREST_RATE)).div(BIGNUMBER_10000)).div(DAYS_IN_A_YEAR);
    f_b_amount = f_b_amount.add(b_amount.mul(ethers.BigNumber.from(INTEREST_RATE)).div(BIGNUMBER_10000)).div(DAYS_IN_A_YEAR);
    f_b_amount = f_b_amount.add(s_amount.mul(ethers.BigNumber.from(ORIGINATION_FEE)).div(BIGNUMBER_10000));
    f_b_amount = f_b_amount.add(s_amount);
    // console.log("CCCC - allow user to borrow - collateralAmount " + collateralAmount);
    const collateralBalance = await ctInstance2.connect(randomUser2).balanceOf(bankInstance2.address);
    const debtBalance = await dtInstance2.connect(randomUser2).balanceOf(bankInstance2.address);
    assert(collateralBalance.eq(depositAmount));
    assert(debtBalance.eq(ethers.utils.parseUnits("60")));
  });

  it('should not allow the user to borrow above collateralization ratio', async function () {
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await expect(bankInstance2.connect(randomUser2).vaultBorrow("66600000000000000000")).to.be.revertedWith("NOT ENOUGH COLLATERAL");
    await bankInstance2.connect(randomUser2).vaultBorrow(ethers.utils.parseUnits("66"));
    await expect(bankInstance2.connect(randomUser2).vaultBorrow(ethers.constants.One)).to.be.revertedWith("NOT ENOUGH COLLATERAL");
  });

  it('should accrue interest on a vault\'s borrowed amount', async function () {
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await bankInstance2.connect(randomUser2).vaultBorrow(borrowAmount);
    await increaseTime(60 * 60 * 24 * 2 + 10) // Let two days pass
    const repayAmount = await bankInstance2.connect(randomUser2).getVaultRepayAmount();
    let b_amount = borrowAmount;
    b_amount = b_amount.add(b_amount.mul(ethers.BigNumber.from(ORIGINATION_FEE)).div(BIGNUMBER_10000));
    let f_b_amount = b_amount.add(b_amount.mul(ethers.BigNumber.from(INTEREST_RATE)).div(BIGNUMBER_10000).div(DAYS_IN_A_YEAR)); // Day 1 interest rate
    f_b_amount = f_b_amount.add(b_amount.mul(ethers.BigNumber.from(INTEREST_RATE)).div(BIGNUMBER_10000).div(DAYS_IN_A_YEAR)); // Day 2 interest rate
    assert(repayAmount.eq(f_b_amount));
    const collateralBalance = await ctInstance2.balanceOf(bankInstance2.address);
    const debtBalance = await dtInstance2.balanceOf(bankInstance2.address);
    // Calculate debt, collateral left after borrow
    assert(collateralBalance.eq(depositAmount));
    assert(debtBalance.eq(depositAmount.sub(borrowAmount)));
  });

  it('should accrue interest on a vault\'s borrowed amount with repayment', async function () {
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await bankInstance2.connect(randomUser2).vaultBorrow(borrowAmount);
    await increaseTime(60 * 60 * 24 + 10) // Let one days pass
    let repayAmount = await bankInstance2.connect(randomUser2).getVaultRepayAmount();
    let b_amount = borrowAmount;
    b_amount = b_amount.add(b_amount.mul(ethers.BigNumber.from(ORIGINATION_FEE)).div(BIGNUMBER_10000));
    b_amount = b_amount.add(b_amount.mul(ethers.BigNumber.from(INTEREST_RATE)).div(BIGNUMBER_10000).div(DAYS_IN_A_YEAR)); // Day 1 interest rate
    assert(repayAmount.eq(b_amount));

    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, smallBorrowAmount);
    await bankInstance2.connect(randomUser2).vaultRepay(smallBorrowAmount);
    await increaseTime(60 * 60 * 24 + 10) // Let one days pass
    b_amount = b_amount.sub(smallBorrowAmount);
    b_amount = b_amount.add(b_amount.mul(ethers.BigNumber.from(INTEREST_RATE)).div(BIGNUMBER_10000).div(DAYS_IN_A_YEAR)); // Day 1 interest rate
    repayAmount = await bankInstance2.connect(randomUser2).getVaultRepayAmount();
    assert(repayAmount.eq(b_amount));

    const collateralBalance = await ctInstance2.balanceOf(bankInstance2.address);
    const debtBalance = await dtInstance2.balanceOf(bankInstance2.address);
    // Calculate debt, collateral left after borrow
    expect(collateralBalance.eq(depositAmount));
    expect(debtBalance.eq(depositAmount.sub(borrowAmount.sub(smallBorrowAmount))));
  });

  it('should allow user to withdraw after debt repayment', async function () {
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await bankInstance2.connect(randomUser2).vaultBorrow(borrowAmount);
    await increaseTime(60 * 60 * 24 * 2 + 10) // Let two days pass
    const repayAmount = await bankInstance2.connect(randomUser2).getVaultRepayAmount();
    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, repayAmount);
    await bankInstance2.connect(randomUser2).vaultRepay(repayAmount);
    const debtAmount = await bankInstance2.connect(randomUser2).getVaultDebtAmount();
    assert(debtAmount.eq(ethers.constants.Zero));
    let b_amount = borrowAmount;
    b_amount = b_amount.add(b_amount.mul(ethers.BigNumber.from(ORIGINATION_FEE)).div(BIGNUMBER_10000));
    var f_b_amount = b_amount.add(b_amount.mul(ethers.BigNumber.from(INTEREST_RATE)).div(BIGNUMBER_10000).div(DAYS_IN_A_YEAR)); // Day 1 interest rate
    f_b_amount = f_b_amount.add(b_amount.mul(ethers.BigNumber.from(INTEREST_RATE)).div(BIGNUMBER_10000).div(DAYS_IN_A_YEAR)); // Day 2 interest rate
    // The debt balance should be the original + fees and interest
    const collateralBalance = await ctInstance2.balanceOf(bankInstance2.address);
    const debtBalance = await dtInstance2.balanceOf(bankInstance2.address);
    assert(collateralBalance.eq(depositAmount));
    assert(debtBalance.eq(depositAmount.sub(borrowAmount).add(f_b_amount)));
  });

  it('should not allow user to withdraw without debt repayment', async function () {
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await bankInstance2.connect(randomUser2).vaultBorrow(borrowAmount);
    await increaseTime(60 * 60 * 24 * 2 + 10) // Let two days pass
    await expect(bankInstance2.connect(randomUser2).vaultWithdraw(depositAmount)).to.be.revertedWith("CANNOT UNDERCOLLATERALIZE VAULT");
  });

  it('should not allow user to borrow below the collateralization ratio', async function () {
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await expect(bankInstance2.connect(randomUser2).vaultBorrow(largeBorrowAmount)).to.be.revertedWith("NOT ENOUGH COLLATERAL");
  });

  // xit('should calculate correct collateralization ratio for a user\'s vault', async function () {

  //   await dtInstance2.approve(bankInstance2.address, depositAmount);
  //   await bankInstance2.reserveDeposit(depositAmount);

  //   // The first price for the collateral and debt
  //   await web3.eth.sendTransaction({ to: oa, from: _accounts[0], gas: 4000000, data: oracle2.methods.requestData("USDT", "USDT/USD", 1000, 0).encodeABI() })
  //   for (let i = 0; i <= 4; i++) {
  //     await web3.eth.sendTransaction({ to: oracle.address, from: _accounts[i], gas: 4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000).encodeABI() })
  //   }

  //   await web3.eth.sendTransaction({ to: oa, from: _accounts[0], gas: 4000000, data: oracle2.methods.requestData("GLD", "GLD/USD", 1000, 0).encodeABI() })
  //   for (var i = 0; i <= 4; i++) {
  //     await web3.eth.sendTransaction({ to: oracle.address, from: _accounts[i], gas: 4000000, data: oracle2.methods.submitMiningSolution("nonce", 2, 1700000).encodeABI() })
  //   }
  //   await bankInstance2.updateCollateralPrice();
  //   await bankInstance2.updateDebtPrice();

  //   let debtPrice = await bankInstance2.getDebtTokenPrice();
  //   let collateralPrice = await bankInstance2.getCollateralTokenPrice();
  //   assert(debtPrice.eq(ethers.BigNumber.from(1000)));
  //   assert(collateralPrice.eq(ethers.BigNumber.from(1700000)));

  //   await dtInstance2.connect(randomUser2).approve(bankInstance2.address, largeDepositAmount);
  //   await bankInstance2.connect(randomUser2).reserveDeposit(largeDepositAmount);
  //   // ethers.utils.parseUnits("100");
  //   await ctInstance2.connect(randomUser2).approve(bankInstance2.address, ethers.utils.parseUnits("1"));
  //   await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseUnits("1"));
  //   await bankInstance2.connect(randomUser2).vaultBorrow(ethers.utils.parseUnits("1100"));
  //   const collateralizationRatio = await bankInstance2.getVaultCollateralizationRatio(randomUser2.address);
  //   assert(collateralizationRatio.eq(ethers.BigNumber.from(15301)));
  // });

  it('should not liquidate overcollateralized vault', async function () {
    await dtInstance2.connect(deployer).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

    await dtInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
    await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
    await bankInstance2.connect(randomUser2).vaultBorrow(borrowAmount);
    await expect(bankInstance2.connect(randomUser5).liquidate(randomUser2.address)).to.be.revertedWith("not keeper or admin");
    //call as keeper
    await expect(bankInstance2.connect(randomUser4).liquidate(randomUser2.address)).to.be.revertedWith("VAULT NOT UNDERCOLLATERALIZED")
    //call as admin
    await expect(bankInstance2.connect(deployer).liquidate(randomUser2.address)).to.be.revertedWith("VAULT NOT UNDERCOLLATERALIZED");
  });

  // xit('should liquidate undercollateralized vault', async function () {
  // const BIGNUMBER_1000 = ethers.BigNumber.from(1000);
  // await dtInstance2.approve(bankInstance2.address, depositAmount);
  // await bankInstance2.reserveDeposit(depositAmount);

  // // The first price for the collateral and debt
  // await web3.eth.sendTransaction({ to: oa, from: _accounts[0], gas: 4000000, data: oracle2.methods.requestData("USDT", "USDT/USD", 1000, 0).encodeABI() })
  // for (var i = 0; i <= 4; i++) {
  //   await web3.eth.sendTransaction({ to: oracle.address, from: _accounts[i], gas: 4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000).encodeABI() })
  // }
  // await web3.eth.sendTransaction({ to: oa, from: _accounts[0], gas: 4000000, data: oracle2.methods.requestData("GLD", "GLD/USD", 1000, 0).encodeABI() })
  // for (var i = 0; i <= 4; i++) {
  //   await web3.eth.sendTransaction({ to: oracle.address, from: _accounts[i], gas: 4000000, data: oracle2.methods.submitMiningSolution("nonce", 2, 2000).encodeABI() })
  // }
  // await bankInstance2.updateCollateralPrice();
  // await bankInstance2.updateDebtPrice();
  // let debtPrice = await bankInstance2.getDebtTokenPrice();
  // let collateralPrice = await bankInstance2.getCollateralTokenPrice();
  // assert(debtPrice.eq(ethers.BigNumber.from(1000)));
  // assert(collateralPrice.eq(2000));

  // await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
  // await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
  // await bankInstance2.connect(randomUser2).vaultBorrow(largeBorrowAmount);
  // let collateralizationRatio = await bankInstance2.connect(randomUser2).getVaultCollateralizationRatio(randomUser2.address);
  // let b_amount = largeBorrowAmount.add(largeBorrowAmount.mul(ethers.BigNumber.from(ORIGINATION_FEE)).div(BIGNUMBER_10000));
  // assert(collateralizationRatio.eq(
  //   depositAmount.mul(ethers.BigNumber.from(2000)).mul(BIGNUMBER_10000).div(b_amount.mul(ethers.BigNumber.from(1000)))));

  // // Lower the price of collateral, push the vault into undercollateralized
  // // The first price for the collateral and debt
  // await web3.eth.sendTransaction({ to: oa, from: _accounts[0], gas: 4000000, data: oracle2.methods.requestData("USDT", "USDT/USD", 1000, 0).encodeABI() })
  // for (var i = 0; i <= 4; i++) {
  //   await web3.eth.sendTransaction({ to: oracle.address, from: _accounts[i], gas: 4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000).encodeABI() })
  // }
  // await web3.eth.sendTransaction({ to: oa, from: _accounts[0], gas: 4000000, data: oracle2.methods.requestData("GLD", "GLD/USD", 1000, 0).encodeABI() })
  // for (var i = 0; i <= 4; i++) {
  //   await web3.eth.sendTransaction({ to: oracle.address, from: _accounts[i], gas: 4000000, data: oracle2.methods.submitMiningSolution("nonce", 2, 1000).encodeABI() })
  // }
  // await bankInstance2.updateCollateralPrice();
  // await bankInstance2.updateDebtPrice();
  // debtPrice = await bankInstance2.getDebtTokenPrice();
  // collateralPrice = await bankInstance2.getCollateralTokenPrice();
  // assert(debtPrice.eq(ethers.BigNumber.from(1000)));
  // assert(collateralPrice.eq(ethers.BigNumber.from(1000)));
  // const repayAmount = await bankInstance2.connect(randomUser2).getVaultRepayAmount();

  // collateralizationRatio = await bankInstance2.getVaultCollateralizationRatio(randomUser2.address);
  // assert(collateralizationRatio.eq(((depositAmount.mul(BIGNUMBER_1000)).mul(BIGNUMBER_10000)).div(b_amount.mul(BIGNUMBER_1000))));
  // await bankInstance2.liquidate(randomUser2.address);

  // const BIGNUMBER_100 = ethers.BigNumber.from(100);
  // const debtOwed = b_amount.add(
  //   b_amount.mul(ethers.BigNumber.from(LIQUIDATION_PENALTY).mul(BIGNUMBER_100).div(BIGNUMBER_100).div(BIGNUMBER_100))
  // );
  // const collateralToLiquidate = debtOwed.mul(BIGNUMBER_1000).div(BIGNUMBER_1000);

  // const collateralAmount = await bankInstance2.connect(randomUser2).getVaultCollateralAmount();
  // const debtAmount = await bankInstance2.connect(randomUser2).getVaultDebtAmount();
  // const debtReserveBalance = await bankInstance2.getReserveBalance();
  // const collateralReserveBalance = await bankInstance2.getReserveCollateralBalance();
  // const bankFactoryOwner = await bankInstance2.getBankFactoryOwner();
  // const bankFactoryOwnerBalance = await ctInstance2.balanceOf(bankFactoryOwner);
  // const feeAmt = collateralToLiquidate.div(ethers.BigNumber.from(10));
  // assert(bankFactoryOwnerBalance.eq(feeAmt));
  // assert(collateralAmount.eq(depositAmount.sub(collateralToLiquidate))); // TODO: Check math
  // assert(debtAmount.eq(ethers.constants.Zero));
  // assert(debtReserveBalance.eq(depositAmount.sub(largeBorrowAmount).add(repayAmount)));
  // assert(collateralReserveBalance.eq(collateralToLiquidate.sub(feeAmt)));
  // });

  it('should not update prices if not admin / reporter', async function () {
    await expect(bankInstance2.connect(randomUser4).updateCollateralPrice()).to.be.revertedWith("not price updater or admin");
    await expect(bankInstance2.connect(randomUser4).updateDebtPrice()).to.be.revertedWith("not price updater or admin");
  });

});

