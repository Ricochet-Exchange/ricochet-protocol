import { setup, IUser, ISuperToken } from "./../misc/setup";
import { common } from "./../misc/common";
import { waffle, ethers } from "hardhat";
import { expect } from "chai";
import axios from "axios";
import { Framework } from "@superfluid-finance/sdk-core";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  getSeconds,
  increaseTime,
  impersonateAccounts,
} from "./../misc/helpers";
const { loadFixture } = waffle;
const {
  web3tx,
  toWad,
  wad4human,
  fromDecimals,
  BN,
} = require("@decentral.ee/web3-helpers");

let sf: Framework,
  superT: ISuperToken,
  u: { [key: string]: IUser },
  app: any,
  tokenss: { [key: string]: any },
  sfRegistrationKey: any,
  accountss: SignerWithAddress[],
  constant: { [key: string]: string },
  tp: any,
  approveSubscriptions: any,
  ERC20: any;

describe("RexOneWayMarket", function () {
  beforeEach(async () => {
    const {
      superfluid,
      users,
      accounts,
      tokens,
      superTokens,
      contracts,
      constants,
      tellor,
    } = await setup();

    const { createSFRegistrationKey } = await common();

    u = users;
    sf = superfluid;
    superT = superTokens;
    tokenss = tokens;
    accountss = accounts;
    sfRegistrationKey = createSFRegistrationKey;
    constant = constants;
    tp = tellor;

    const registrationKey = await sfRegistrationKey(sf, u.admin.address);

    const REXMarketFactory = await ethers.getContractFactory(
      "REXOneWayMarket",
      accountss[0]
    );
    app = await REXMarketFactory.deploy(
      u.admin.address,
      sf.host.hostContract.address,
      "0x6EeE6060f715257b970700bc2656De21dEdF074C",
      "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1",
      registrationKey
    );
    console.log("erro3?");

    await app.initializeOneWayMarket(
      constant.SUSHISWAP_ROUTER_ADDRESS,
      constant.TELLOR_ORACLE_ADDRESS,
      superT.usdcx.address,
      20000,
      constant.TELLOR_USDC_REQUEST_ID,
      superT.ethx.address,
      20000,
      constant.TELLOR_ETH_REQUEST_ID
    );
    await app.addOutputPool(constant.RIC_TOKEN_ADDRESS, 0, 1000000000, 77);

    u.app = {
      address: app.address,
      token: superT.wbtcx.address,
      alias: "App",
    };
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=wrapped-bitcoin&vs_currencies=usd"
    );

    let oraclePrice: any = (
      parseInt(response.data["wrapped-bitcoin"].usd, 10) *
      1.02 *
      1000000
    ).toString();
    oraclePrice = parseInt(oraclePrice);
    console.log("oraclePrice", oraclePrice);
    await tp.submitValue(constant.TELLOR_ETH_REQUEST_ID, oraclePrice);
    await tp.submitValue(constant.TELLOR_USDC_REQUEST_ID, 1000000);
    await tp.submitValue(77, 1000000);

  });

  it("should be correctly configured", async () => {
    expect(await app.isAppJailed()).to.equal(false);
    expect(await app.getInputToken()).to.equal(superT.usdcx.address);

    const outputPoolFirst = await app.getOuputPool(0);
    const outputPoolSecond = await app.getOuputPool(1);

    expect(outputPoolFirst[0]).to.equal(superT.ethx.address);
    expect(outputPoolFirst[1]).to.equal("20000");
    expect(outputPoolFirst[2]).to.equal("0");

    expect(outputPoolSecond[0]).to.equal(tokenss.ric.address);
    expect(outputPoolSecond[1]).to.equal("0");
    expect(outputPoolSecond[2]).to.equal("1000000000");
    //console.log(await app.getOracleInfo(superT.usdcx.address));
    expect(await app.getTellorOracle()).to.equal(
      constant.TELLOR_ORACLE_ADDRESS
    );
    expect(await app.getTotalInflow()).to.equal(0);
  });

  it("should create a stream exchange with the correct parameters", async () => {
    const inflowRate = "77160493827160";
    const inflowRateIDAShares = "77160";
    console.log(
      "usdc balance of admin: ",
      (
        await superT.usdcx.balanceOf({
          account: u.admin.address,
          providerOrSigner: accountss[0],
        })
      ).toString()
    );
    console.log(
      "usdcx balance of app: ",
      (
        await superT.usdcx.balanceOf({
          account: u.app.address,
          providerOrSigner: accountss[0],
        })
      ).toString()
    );

    const approveTxn = await superT.usdcx
      .approve({
        receiver: u.app.address,
        amount: ethers.constants.MaxUint256.toString(),
      })
      .exec(accountss[0]);
    const approveTxnReceipt = await approveTxn.wait();
    //console.log("approve?", approveTxnReceipt);

    const txnResponse = await sf.cfaV1
      .createFlow({
        sender: u.admin.address,
        receiver: u.app.address,
        superToken: superT.usdcx.address,
        flowRate: inflowRate,
      })
      .exec(accountss[0]);
    const txnReceipt = await txnResponse.wait();

    await increaseTime(3600);
    console.log(
      "usdcx balance of admin: ",
      (
        await superT.usdcx.balanceOf({
          account: u.admin.address,
          providerOrSigner: accountss[0],
        })
      ).toString()
    );
    console.log(
      "usdcx balance of app: ",
      (
        await superT.usdcx.balanceOf({
          account: u.app.address,
          providerOrSigner: accountss[0],
        })
      ).toString()
    );

    // Expect the parameters are correct
    console.log(
      "stream rate",
      await app.getStreamRate(u.admin.address, superT.usdcx.address)
    );
    console.log(" get ida shares", await app.getIDAShares(0, u.admin.address));

    expect(
      await app.getStreamRate(u.admin.address, superT.usdcx.address)
    ).to.equal(inflowRate);
    expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(
      `true,false,${inflowRateIDAShares},0`
    );
  });

  it("approval should be unlimited", async () => {
    //const appSigner = await impersonateAccounts([u.app.address]);
    await sf.idaV1
      .approveSubscription({
        indexId: "0",
        superToken: superT.ethx.address,
        publisher: u.app.address,
        userData: "0x",
      })
      .exec(accountss[0]);

    await sf.idaV1
      .approveSubscription({
        indexId: "1",
        superToken: tokenss.ric.address,
        publisher: u.app.address,
        userData: "0x",
      })
      .exec(accountss[0]);

    // Not executing, check later / discuss after going through the contracts.
    //expect(
    // await tokenss.weth.allowance(
    //   u.app.address,
    //   constant.SUSHISWAP_ROUTER_ADDRESS
    // )
    //).to.be.equal(ethers.constants.MaxUint256);
    //expect(
    //  await tokenss.usdc.allowance(
    //   u.app.address,
    //  constant.SUSHISWAP_ROUTER_ADDRESS
    // )
    //).to.be.equal(ethers.constants.MaxUint256);

    // expect(
    //   await tokenss.weth.allowance(app.address, superT.ethx.address)
    // ).to.be.equal(ethers.constants.MaxUint256);

    // expect(
    //   await tokenss.usdc.allowance(app.address, superT.usdcx.address)
    // ).to.be.equal(ethers.constants.MaxUint256);
  });

  it("should distribute tokens to streamers", async () => {
    await sf.idaV1
      .approveSubscription({
        indexId: "0",
        superToken: superT.ethx.address,
        publisher: u.app.address,
        userData: "0x",
      })
      .exec(accountss[1]);

    await sf.idaV1
      .approveSubscription({
        indexId: "0",
        superToken: superT.ethx.address,
        publisher: u.app.address,
        userData: "0x",
      })
      .exec(accountss[2]);

    console.log("Transfer alice");
    await superT.usdcx
      .transfer({ receiver: u.alice.address, amount: toWad(400) })
      .exec(accountss[4]);
    console.log("Transfer bob");
    await superT.usdcx
      .transfer({ receiver: u.bob.address, amount: toWad(400) })
      .exec(accountss[4]);
    console.log("Done");

    //await takeMeasurements();

    const inflowRate = "1000000000000000";
    const inflowRatex2 = "2000000000000000";
    const inflowRateIDAShares = "1000000";
    const inflowRateIDASharesx2 = "2000000";

    // 1. Initialize a stream exchange
    // 2. Create 2 streamers, one with 2x the rate of the other
    const txnResponseAlice = await sf.cfaV1
      .createFlow({
        sender: u.alice.address,
        receiver: u.app.address,
        superToken: superT.usdcx.address,
        flowRate: inflowRate,
      })
      .exec(accountss[1]);
    const txnReceipt = await txnResponseAlice.wait();

    const txnResponseBob = await sf.cfaV1
      .createFlow({
        sender: u.bob.address,
        receiver: u.app.address,
        superToken: superT.usdcx.address,
        flowRate: inflowRatex2,
      })
      .exec(accountss[1]);
    const txnReceiptBob = await txnResponseBob.wait();

    expect(
      await app.getStreamRate(u.alice.address, superT.usdcx.address)
    ).to.equal(inflowRate);
    expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(
      `true,false,${inflowRateIDAShares},0`
    );
    expect(
      await app.getStreamRate(u.bob.address, superT.usdcx.address)
    ).to.equal(inflowRatex2);
    expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(
      `true,false,${inflowRateIDASharesx2},0`
    );
    // 3. Advance time 1 hour
    await increaseTime(3600);
    await app.updateTokenPrice(superT.usdcx.address);
    await app.updateTokenPrice(superT.ethx.address);
    // 4. Trigger a distribution
    await app.distribute("0x");
    // 4. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
    //await takeMeasurements();

    // let deltaAlice = await delta('alice', aliceBalances);
    // let deltaBob = await delta('bob', bobBalances);
    // let deltaOwner = await delta('owner', ownerBalances);
    // // verify
    // console.log(deltaOwner)
    // console.log(deltaAlice)
    // console.log(deltaBob)
    // // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
    // expect(deltaOwner.outputx / (deltaAlice.outputx + deltaBob.outputx + deltaOwner.outputx)).to.within(0.02, 0.02001)
    // expect(deltaAlice.outputx * 2).to.be.within(deltaBob.outputx * 0.998, deltaBob.outputx * 1.008)
  });

  it("make sure output tokens and subsidy tokens are streamed correctly", async () => {

    // The token with feeRate != 0 is output token in this case that is ethx 
    // The token with emissionRate != 0 is subsisdy token in this case that ric tokens. 
    // 0. Approve subscriptions
    await superT.ric
      .transfer({ receiver: u.app.address, amount: toWad(400).toString() })
      .exec(accountss[0]);

    await sf.idaV1
    .approveSubscription({
      indexId: "0",
      superToken: superT.ethx.address,
      publisher: u.app.address,
      userData: "0x",
    })
    .exec(accountss[2]);

  await sf.idaV1
    .approveSubscription({
      indexId: "1",
      superToken: superT.ric.address,
      publisher: u.app.address,
      userData: "0x",
    })
    .exec(accountss[2]);
    console.log(" get ida shares", await app.getIDAShares(0, u.bob.address));

    // 1. Check balance for output and subsidy tokens and usdcx
    console.log(
      "USDCx balance of bob: ",
      (
        await superT.usdcx.balanceOf({
          account: u.bob.address,
          providerOrSigner: accountss[2],
        })
      ).toString()
    );
    console.log(
      "ETHx balance of bob: ",
      (
        await superT.ethx.balanceOf({
          account: u.bob.address,
          providerOrSigner: accountss[2],
        })
      ).toString()
    );
    console.log(
      "RIC balance of bob: ",
      (
        await superT.ric.balanceOf({
          account: u.bob.address,
          providerOrSigner: accountss[2],
        })
      ).toString()
    );

    // 2. Create a stream from an account to app to excahnge tokens
    const inflowRatex2 = "2000000000000000";
    const txnResponseBob = await sf.cfaV1
    .createFlow({
      sender: u.bob.address,
      receiver: u.app.address,
      superToken: superT.usdcx.address,
      flowRate: inflowRatex2,
    })
    .exec(accountss[2]);
    const txnReceiptBob = await txnResponseBob.wait();

    // 3. Increase time by 1 hour
    await increaseTime(60*60);
    const lastDistributionAt = await app.getLastDistributionAt()
    //await app.updateTokenPrice(superT.usdcx.address);
    //await app.updateTokenPrice(superT.ethx.address);
    //await app.updateTokenPrice(superT.ric.address);

    // 4. Distribute tokens 
    await app.distribute("0x");
    // 5. Check balance for output and subsidy tokens
    console.log(
      "USDCx balance of bob: ",
      (
        await superT.usdcx.balanceOf({
          account: u.bob.address,
          providerOrSigner: accountss[2],
        })
      ).toString()
    );
    console.log(
      "ETHx balance of bob: ",
      (
        await superT.ethx.balanceOf({
          account: u.bob.address,
          providerOrSigner: accountss[2],
        })
      ).toString()
    );
    console.log(
      "RIC balance of bob: ",
      (
        await superT.ric.balanceOf({
          account: u.bob.address,
          providerOrSigner: accountss[2],
        })
      ).toString()
    );

  
  });


});
