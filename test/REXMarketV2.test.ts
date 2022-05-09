import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import { HttpService } from "./../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TellorPlayground, REXTwoWayMarket, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from "../typechain";

import { increaseTime } from "./../misc/helpers";
import { Constants } from "../misc/Constants";
import { AbiCoder, parseUnits } from "ethers/lib/utils";

// Interfaces
interface balanceHistory {
    // Lists of balances for each token
    tokenA: string[];
    tokenB: string[];
    ricochetToken: string[];
};

export interface rexCustomer {
    signer: SignerWithAddress;
    balanceHistory: balanceHistory;
}

// CONSTANTS
const { provider } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours
const TOKENA_SUBSCRIPTION_INDEX = 0;
const TOKENB_SUBSCRIPTION_INDEX = 1;
const SUBSIDYA_SUBSCRIPTION_INDEX = 2;
const SUBSIDYB_SUBSCRIPTION_INDEX = 3;
const ORACLE_PRECISION_DIGITS = 1000000;  // A six-digit precision is required by the Tellor oracle
const SF_RESOLVER_ADDRESS = "0xE0cc76334405EE8b39213E620587d815967af39C";
const TOKENA_ADDRESS = "0xCAa7349CEA390F89641fe306D93591f87595dc1F"; // USDCx
const TOKENB_ADDRESS = "0x27e1e4E6BC79D93032abef01025811B7E4727e85"; // ETHx
const RICOCHET_TOKEN_ADDRESS = "0x263026E7e53DBFDce5ae55Ade22493f828922965";

// VARIABLES ASSIGNED IN HOOKS
let deployer: SignerWithAddress,
    alice: rexCustomer,
    bob: rexCustomer,
    carl: rexCustomer,
    karen: rexCustomer,
    tokenA: SuperToken,
    tokenB: SuperToken,
    tokenAWhaleSigner: SignerWithAddress,
    tokenBWhaleSigner: SignerWithAddress,
    sf: Framework,
  	ricochetToken: SuperToken,
  	resolverAddress: any

// SIMPLE HELPERS
const errorHandler = (err: any) => {
    if (err) throw err;
};

describe("RexTwoWayMarket", function() {

  before(async () => {
    [deployer, alice, bob, karen, carl] = await ethers.getSigners();

    // Create SF SDK
    const sf = await Framework.create({
      provider: ethers.provider,  //   PROVIDER,  // ethers.getDefaultProvider(),
      resolverAddress: SF_RESOLVER_ADDRESS,
      networkName: "hardhat",
      dataMode: "WEB3_ONLY",
      protocolReleaseVersion: "v1"
    });

    // Load Supertokens
    tokenA = await sf.loadSuperToken(TOKENA_ADDRESS);
    tokenB = await sf.loadSuperToken(TOKENB_ADDRESS);
    ricochetToken = await sf.loadSuperToken(RICOCHET_TOKEN_ADDRESS);




    // Find tokenA whale
    // Find tokenB whale
    // Give alice some tokenA and tokenB
    // Give bob some tokenA and tokenB
    // Give karen some tokenA and tokenB
    // Create Reg. Key
    // Deploy REXReferral
    // Deploy REXMarket
    // Register alice as referred by carl
    // Save the block to use to reset state later

  });

  afterEach(async () => {
    // Check the app isn't jailed
    assert.isFalse(
        await t.sf.host.isAppJailed(app.address),
        "App got jailed"
    );
  });

  context("#1 - new rexmarket with no streamers") {

    beforeEach(async () => {

      // Reset to the block where the REXMarket was deployed, this resets state

    });

    it("#1.1 before/afterAgreementCreated callbacks, distribute", async () => {

      // Open a stream for alice with carl as referral to USDC side
      // Open a stream as bob with noone as referral to ETH side
      // Expect app's IDA share allocations are correct (alice, bob, carl, and DAO)
        // Output pools for USDC, ETH, and subsidies
      // Expect alice to be referred by carl
      // Expect bob to be an organic referral

      // Fast forward 1 hour
      // Call distribute
      // Expect alice to receive the right amount of ETH
      // Expect carl to receive the right amount of ETH
      // Expect DAO to receive the right amount of ETH
      // Expect bob to receive the right amount of USDC
      // Expect DAO to receive the right amount of USDC


    });

    it("#1.2 before/afterAgreementTerminated callbacks", async () => {

      // Open a stream for alice with carl as referral to USDC side
      // Open a stream as bob with noone as referral to ETH side

      // Close alices stream
      // Expect 0 IDA shares for alice and carl (referrer)
      // Expect alices balance to be unchanged

      // Close bobs stream
      // Expect 0 IDA shares for bob
      // Expect bobs balance to be unchanged

    });

    it("#1.3 distribute with subsidies", async () => {

      // Open a stream for alice with carl as referral to USDC side
      // Open a stream as bob with noone as referral to ETH side

      // Fast forward 1 hour
      // Call distribute

      // Expect alice and bob receive the same amount of subsidies
      // Expect subsidies distributed are correct based on the time that passed
    });

    it("#1.4 closeStreams", async () => {

      // See: https://github.com/Ricochet-Exchange/ricochet/blob/main/01-Contracts/test/SteamExchange.test.js#L479

    });

  });

  context("#2 - existing rexmarket with streamers on both sides") {

    beforeEach(async () => {

      // Deploy a new RexTwoWayMarket
      // Give alice some USDC and ETH
      // Give bob some USDC and ETH
      // Give karen some USDC and ETH
      // Register alice as referred by carl
      // Open a stream for alice with carl as referral to USDC side
      // Open a stream as bob with noone as referral to ETH side

    });

    afterEach(async () => {

      // Checkt the app isn't jailed
      assert.isFalse(
          await t.sf.host.isAppJailed(app.address),
          "App got jailed"
      );

      // Reset the state of the fork
      await network.provider.request({
        method: "hardhat_reset",
        params: [...],
      });

    });

    it("#2.1 before/afterAgreementCreated callbacks, distribute", async () => {

      // Open a stream for karen with carl as referral to USDC side
      // Expect app's IDA share allocations are correct (alice, bob, carl, karen, and DAO)
      // Expect karen to be referred by carl

      // Fast forward 1 hour
      // Call distribute
      // Expect alice to receive the right amount of ETH
      // Expect karen to receive the right amount of ETH
      // Expect carl to receive the right amount of ETH
      // Expect DAO to receive the right amount of ETH
      // Expect bob to receive the right amount of USDC
      // Expect DAO to receive the right amount of USDC


    });

    it("#2.2 before/afterAgreementUpdated callbacks, distribute", async () => {

      // Update a stream for alice with carl as referral to USDC side
      // Expect app's IDA share allocations are correct (alice, bob, carl, and DAO)

      // Fast forward 1 hour
      // Call distribute
      // Expect alice to receive the right amount of ETH
      // Expect karen to receive the right amount of ETH
      // Expect carl to receive the right amount of ETH
      // Expect DAO to receive the right amount of ETH
      // Expect bob to receive the right amount of USDC
      // Expect DAO to receive the right amount of USDC

    });

    it("#2.3 before/afterAgreementTerminated callbacks, distribute", async () => {

      // Open a stream for karen with carl as referral to USDC side

      // Close alices stream
      // Expect 0 IDA shares for alice and carl (referrer)
      // Expect alices balance to be unchanged

      // Close bobs stream
      // Expect 0 IDA shares for bob
      // Expect bobs balance to be unchanged

    });

  });

  context("#3 - existing rexmarket with streamers one side") {

    beforeEach(async () => {

      // Deploy a new RexTwoWayMarket
      // Give alice some USDC and ETH
      // Give bob some USDC and ETH
      // Give karen some USDC and ETH
      // Register alice as referred by carl
      // Open a stream for alice with carl as referral to USDC side
      // Open a stream as bob with noone as referral to ETH side

    });

    afterEach(async () => {

      // Checkt the app isn't jailed
      assert.isFalse(
          await t.sf.host.isAppJailed(app.address),
          "App got jailed"
      );

      // Reset the state of the fork
      await network.provider.request({
        method: "hardhat_reset",
        params: [...],
      });

    });

    it("#3.1 before/afterAgreementCreated callbacks, distribute", async () => {

      // Open a stream for karen with carl as referral to USDC side
      // Expect app's IDA share allocations are correct (alice, bob, carl, karen, and DAO)
      // Expect karen to be referred by carl

      // Fast forward 1 hour
      // Call distribute
      // Expect alice to receive the right amount of ETH
      // Expect karen to receive the right amount of ETH
      // Expect carl to receive the right amount of ETH
      // Expect DAO to receive the right amount of ETH
      // Expect bob to receive the right amount of USDC
      // Expect DAO to receive the right amount of USDC


    });

    it("#3.2 before/afterAgreementUpdated callbacks, distribute", async () => {

      // Update a stream for alice with carl as referral to USDC side
      // Expect app's IDA share allocations are correct (alice, bob, carl, and DAO)

      // Fast forward 1 hour
      // Call distribute
      // Expect alice to receive the right amount of ETH
      // Expect karen to receive the right amount of ETH
      // Expect carl to receive the right amount of ETH
      // Expect DAO to receive the right amount of ETH
      // Expect bob to receive the right amount of USDC
      // Expect DAO to receive the right amount of USDC

    });

    it("#3.3 before/afterAgreementTerminated callbacks, distribute", async () => {

      // Open a stream for karen with carl as referral to USDC side

      // Close alices stream
      // Expect 0 IDA shares for alice and carl (referrer)
      // Expect alices balance to be unchanged

      // Close bobs stream
      // Expect 0 IDA shares for bob
      // Expect bobs balance to be unchanged

    });

  });

  context("#4 - existing rexmarket is jailed with many streamers") {

    beforeEach(async () => {

      // Deploy a new RexTwoWayMarket
      // Give alice some USDC and ETH
      // Give bob some USDC and ETH
      // Give karen some USDC and ETH
      // Register alice as referred by carl
      // Open a stream for alice with carl as referral to USDC side
      // Open a stream as bob with noone as referral to ETH side

    });

    afterEach(async () => {

      // Checkt the app isn't jailed
      assert.isFalse(
          await t.sf.host.isAppJailed(app.address),
          "App got jailed"
      );

      // Reset the state of the fork
      await network.provider.request({
        method: "hardhat_reset",
        params: [...],
      });

    });

    it("#4.1 emergencyDrain", async () => {

      // See: https://github.com/Ricochet-Exchange/ricochet/blob/main/01-Contracts/test/SteamExchange.test.js#L555

    });

    it("#4.2 emergencyCloseStream for all streamers", async () => {

      // See: https://github.com/Ricochet-Exchange/ricochet/blob/main/01-Contracts/test/SteamExchange.test.js#L570

    });

  });

});
