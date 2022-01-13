import { setup, IUser, ISuperToken } from "./../misc/setup";
import { common } from "./../misc/common";
import { waffle, ethers } from "hardhat";
import { expect } from "chai";
import axios from "axios";
import { Framework } from "@superfluid-finance/sdk-core";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { getSeconds, increaseTime } from "./../misc/helpers";
const { loadFixture } = waffle;

let sf: Framework,
  superT: ISuperToken,
  u: { [key: string]: IUser },
  app: any,
  tokenss: { [key: string]: any },
  sfRegistrationKey: any,
  accountss: SignerWithAddress[],
  addr: string[],
  tp: any;

describe("RexMarket", function () {
  before(async () => {
    const {
      superfluid,
      users,
      accounts,
      tokens,
      superTokens,
      contracts,
      addresses,
    } = await setup();
    const { createSFRegistrationKey } = await common();
    u = users;
    sf = superfluid;
    superT = superTokens;
    tokenss = tokens;
    accountss = accounts;
    sfRegistrationKey = createSFRegistrationKey;
    addr = addresses;
  });

  async function deployContracts() {
    const registrationKey = await sfRegistrationKey(sf, u.admin.address);

    const REXMarketFactory = await ethers.getContractFactory(
      "REXMarket",
      accountss[0]
    );

    app = await REXMarketFactory.deploy(
      u.admin.address,
      sf.host.hostContract.address,
      sf.cfaV1.host.hostContract.address,
      sf.idaV1.host.hostContract.address
    );

    u.app = {
      address: app.address,
      token: superT.wbtcx.address,
      alias: "App",
    };

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
      await superT.usdcx
        .balanceOf({ account: u.admin.address, providerOrSigner: accountss[0] })
        .toString()
    );

    let inflowRate = "2592000000"; // 1000 usdc per month, 1000*24*30*60*60
    await sf.cfaV1.createFlow({
      sender: u.admin.address,
      receiver: u.app.address,
      superToken: addr[6],
      flowRate: inflowRate,
    });

    await increaseTime(getSeconds(30));
    console.log(
      "balance after 30 days",
      await superT.usdcx
        .balanceOf({ account: u.admin.address, providerOrSigner: accountss[0] })
        .toString()
    );

    await sf.cfaV1.deleteFlow({
      sender: u.admin.address,
      receiver: u.app.address,
      superToken: addr[6],
    });
    console.log(
      "balance afterwards days",
      await superT.usdcx
        .balanceOf({ account: u.admin.address, providerOrSigner: accountss[0] })
        .toString()
    );
  });
});
