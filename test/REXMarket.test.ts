import { ContractType, setup } from "./../misc/setup";
import { common } from "./../misc/common";
import { waffle } from "hardhat";
import { expect } from "chai";
import { web3tx } from "@decentral.ee/web3-helpers";



import {
  getSeconds,
  increaseTime,
  impersonateAccounts,
} from "./../misc/helpers";
const { loadFixture } = waffle;

let sf, superT, u, deployRexMarket,app;

describe("RexMarket", function () {
  before(async () => {
    const {
      superfluid,
      users,
      tokens,
      superTokens,
      contracts,
      addresses,
      deployContracts,
    } = await setup();
    u = users;
    sf = superfluid;
    superT = superTokens;
  });

  async function deployContracts() {
    // ==============
    // Deploy REXMarket contract

    // Include this in REXMarket deployment constructor code
    const registrationKey = await createSFRegistrationKey(sf, u.admin.address);

    const REXMarketFactory = await ethers.getContractFactory('REXMarket', u.admin.address);
    app = await REXMarketFactory.deploy(
        u.admin.address,
        sf.host.address,
        sf.agreements.cfa.address,
        sf.agreements.ida.address
    );

    u.app = sf.user({
        address: app.address,
        token: wbtcx.address,
    });

    u.app.alias = 'App';

    // ==============
    // Get actual price
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=wrapped-bitcoin&vs_currencies=usd');
    oraclePrice = parseInt(response.data['wrapped-bitcoin'].usd * 1.02 * 1000000).toString();
    console.log('oraclePrice', oraclePrice);
    await tp.submitValue(60, oraclePrice);
}


  it("make sure uninvested sum is streamed back to the streamer / investor / swapper", async () => {
    // Always add the following line of code in all test cases (waffle fixture)
    await loadFixture(deployRexMarket);

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
