import { ethers } from "hardhat";
import { parseUnits } from "@ethersproject/units";

import { setup , IUser, ISuperToken} from "./setup";
import { impersonateAccounts } from "./helpers";


const { web3tx, wad4human } = require("@decentral.ee/web3-helpers");
const SuperfluidGovernanceBase = require("@superfluid-finance/ethereum-contracts/build/contracts/SuperfluidGovernanceII.json");

export const common = async () => {
  const { superfluid, users, tokens, superTokens, contracts, addresses } =
    await setup();

  const appBalances : { [key: string] : string[]} = {
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const ownerBalances : { [key: string] : string[]}= {
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const aliceBalances : { [key: string] : string[]} = {
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const bobBalances : { [key: string] : string[]} = {
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };

  async function checkBalance(users: any) {
    for (let i = 0; i < users.length; ++i) {
      console.log("Balance of ", users[i].alias);
      console.log(
        "usdcx: ",
        (await superTokens.usdcx.balanceOf(users[i].address)).toString()
      );
      console.log(
        "wbtcx: ",
        (await superTokens.wbtcx.balanceOf(users[i].address)).toString()
      );
    }
  }

  async function upgrade(accounts: any) {
    for (let i = 0; i < accounts.length; ++i) {
      await web3tx(
        superTokens.usdcx.upgrade,
        `${accounts[i].alias} upgrades many USDCx`
      )(parseUnits("100000000", 18), {
        from: accounts[i].address,
      });
      await web3tx(
        superTokens.daix.upgrade,
        `${accounts[i].alias} upgrades many DAIx`
      )(parseUnits("100000000", 18), {
        from: accounts[i].address,
      });

      await checkBalance(accounts[i]);
    }
  }


  async function logUsers() {
    let string = "user\t\ttokens\t\tnetflow\n";
    let p = 0;
    for (const [, user] of Object.entries(users)) {
      if (await hasFlows(user)) {
        p++;
        string += `${user.alias}\t\t${wad4human(
          await superTokens.usdcx.balanceOf(user.address as any)
        )}\t\t${wad4human((await (user as any).details()).cfa.netFlow)}
            `;
      }
    }
    if (p == 0) return console.warn("no users with flows");
    console.log("User logs:");
    console.log(string);
  }

  async function hasFlows(user: any) {
    const { inFlows, outFlows } = (await user.details()).cfa.flows;
    return inFlows.length + outFlows.length > 0;
  }

  // Need to migrate this to superfluid sdk 
  
  // async function subscribe(user:any) {
  //   // Alice approves a subscription to the app
  //   console.log(superfluid.host.hostContract.callAgreement);
  //   console.log(superfluid.idaV1.host.hostContract.address);
  //   console.log(superTokens.usdcx.address);
  //   console.log(u.app.address);
  //   await web3tx(
  //     (superfluid.host as any).callAgreement,
  //     "user approves subscription to the app"
  //   )(
  //     (superfluid.idaV1.host.hostContract.address,
  //     (superfluid.agreements as any).ida.contract.methods
  //       .approveSubscription(superTokens.ethx.address, app.address, 0, "0x")
  //       .encodeABI(),
  //     "0x", // user data
  //     {
  //       from: user,
  //     }
  //   );
  // }

  // async function updateBalances() {
  //   appBalances.ethx.push((await superTokens.ethx.balanceOf(app.address)).toString());
  //   ownerBalances.ethx.push((await superTokens.ethx.balanceOf(users.admin.address)).toString());
  //   aliceBalances.ethx.push((await superTokens.ethx.balanceOf(users.alice.address)).toString());
  //   bobBalances.ethx.push((await superTokens.ethx.balanceOf(users.bob.address)).toString());

  //   appBalances.wbtcx.push((await superTokens.wbtcx.balanceOf(app.address)).toString());
  //   ownerBalances.wbtcx.push(
  //     (await superTokens.wbtcx.balanceOf(users.admin.address)).toString()
  //   );
  //   aliceBalances.wbtcx.push(
  //     (await superTokens.wbtcx.balanceOf(users.alice.address)).toString()
  //   );
  //   bobBalances.wbtcx.push((await superTokens.wbtcx.balanceOf(users.bob.address)).toString());

  //   appBalances.usdcx.push((await superTokens.usdcx.balanceOf(app.address)).toString());
  //   ownerBalances.usdcx.push(
  //     (await superTokens.usdcx.balanceOf(users.admin.address)).toString()
  //   );
  //   aliceBalances.usdcx.push(
  //     (await superTokens.usdcx.balanceOf(users.alice.address)).toString()
  //   );
  //   bobBalances.usdcx.push((await superTokens.usdcx.balanceOf(users.bob.address)).toString());

  //   appBalances.ric.push((await tokens.ric.balanceOf(app.address)).toString());
  //   ownerBalances.ric.push((await tokens.ric.balanceOf(users.admin.address)).toString());
  //   aliceBalances.ric.push((await tokens.ric.balanceOf(users.alice.address)).toString());
  //   bobBalances.ric.push((await tokens.ric.balanceOf(users.bob.address)).toString());
  // }

  async function createSFRegistrationKey(deployerAddr: string) {
    const registrationKey = `testKey-${Date.now()}`;
    const encodedKey = ethers.utils.solidityKeccak256(
      ["string", "address", "string"],
      [
        "org.superfluid-finance.superfluid.appWhiteListing.registrationKey",
        deployerAddr,
        registrationKey,
      ]
    );

    const hostABI = [
      "function getGovernance() external view returns (address)",
    ];

    const host = await ethers.getContractAt(hostABI, addresses[5]);
    const governance = await host.getGovernance();

    const sfGovernanceRO = await ethers.getContractAt(
      SuperfluidGovernanceBase.abi,
      governance
    );

    const govOwner = await sfGovernanceRO.owner();
    const [govOwnerSigner] = await impersonateAccounts([govOwner]);

    const sfGovernance = await ethers.getContractAt(
      SuperfluidGovernanceBase.abi,
      governance,
      govOwnerSigner
    );

    await sfGovernance.whiteListNewApp(addresses[5], encodedKey);

    return registrationKey;
  }

  return { createSFRegistrationKey };
};
