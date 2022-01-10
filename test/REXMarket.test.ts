import { setup } from "./../misc/setup";
import { common } from "./../misc/common";
import { waffle, ethers } from "hardhat";
import { expect } from "chai";
import axios from "axios";
import SuperfluidSDK from "@superfluid-finance/js-sdk";

import { getSeconds, increaseTime } from "./../misc/helpers";
const { loadFixture } = waffle;

let sf: SuperfluidSDK.Framework,
  superT: any,
  u: any,
  app: any,
  tokenss: any,
  sfRegistrationKey: any,
  tp: any;

describe("RexMarket", function () {
  before(async () => {
    const { superfluid, users, tokens, superTokens, contracts, addresses } =
      await setup();
    const { createSFRegistrationKey } = await common();
    u = users;
    sf = superfluid;
    superT = superTokens;
    tokenss = tokens;
    sfRegistrationKey = createSFRegistrationKey;
  });

  async function deployContracts() {
    const registrationKey = await sfRegistrationKey(sf, u.admin.address);

    const REXMarketFactory = await ethers.getContractFactory(
      "REXMarket",
      u.admin.address
    );
    app = await REXMarketFactory.deploy(
      u.admin.address,
      (sf.host as any).address,
      (sf.agreements.cfa as any)?.address,
      (sf.agreements.ida as any)?.address
    );

    u.app = sf.user({
      address: app.address,
      token: superT.wbtcx.address,
    });

    u.app.alias = "App";

    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=wrapped-bitcoin&vs_currencies=usd"
    );
    let oraclePrice = (
      parseInt(response.data["wrapped-bitcoin"].usd, 10) *
      1.02 *
      1000000
    ).toString();
    console.log("oraclePrice", oraclePrice);
    await tp.submitValue(60, oraclePrice);
  }

  it("make sure uninvested sum is streamed back to the streamer / investor / swapper", async () => {
    // Always add the following line of code in all test cases (waffle fixture)
    await loadFixture(deployContracts);

    // start flow of 1000 USDC from admin address
    console.log(
      "balance start",
      (await superT.usdcx.balanceOf(u.admin.address)).toString()
    );

    let inflowRate = "2592000000"; // 1000 usdc per month, 1000*24*30*60*60
    await u.admin.flow({ flowRate: inflowRate, recipient: u.app });

    await increaseTime(getSeconds(30));
    console.log(
      "balance after 30 days",
      (await superT.usdcx.balanceOf(u.admin.address)).toString()
    );

    await u.admin.flow({ flowRate: "0", recipient: u.app });
    console.log(
      "balance afterwards days",
      (await superT.usdcx.balanceOf(u.admin.address)).toString()
    );
  });
});
