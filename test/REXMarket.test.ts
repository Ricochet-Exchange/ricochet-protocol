import { setup } from "./../misc/setup";
import { common } from "./../misc/common";
import { loadFixture } from "waffle";
import { web3tx } from "@decentral.ee/web3-helpers";
import {
  getSeconds,
  increaseTime,
  impersonateAccounts,
} from "./../misc/helpers";

let sf, superT, u, deployRexMarket;

describe("RexMarket", function () {
  before(async () => {
    const {
      superfluid,
      users,
      tokens,
      superTokens,
      contracts,
      addresses,
      getContract,
      deployContracts,
    } = await setup();
    u = users;
    sf = superfluid;
    superT = superTokens;
    deployRexMarket = deployContracts("REXMarket");
  });

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
