import { ethers } from "hardhat";
import { impersonateAccounts } from "./helpers";
import SuperfluidSDK from "@superfluid-finance/js-sdk";
import { web3tx } from "@decentral.ee/web3-helpers";
import { waffle } from "hardhat";

import SuperfluidGovernanceBase from "@superfluid-finance/ethereum-contracts/build/contracts/SuperfluidGovernanceII.json";
import TellorPlayground from "usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json";
const { provider, loadFixture } = waffle;

// import RexMarket from 'path to rexmarket ABI';
// import RexOneWayMarket from 'path to rex one way market ABI';
// import RexSushiMarket from 'path to sushi market ABI';

// NOTE: It is essential to pass in a Deployer into the contracts for initialization
// This is because when we are testing the emit, the passed in contract expects a
// provider and will throw an error if this doesn't exist.

const OWNER_ADDRESS = "0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA";
const ALICE_ADDRESS = "0x9f348cdD00dcD61EE7917695D2157ef6af2d7b9B";
const BOB_ADDRESS = "0x00Ce20EC71942B41F50fF566287B811bbef46DC8";
const CARL_ADDRESS = "0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf";

const USDCX_SOURCE_ADDRESS = "0xA08f80dc1759b12fdC40A4dc64562b322C418E1f";
const SF_RESOLVER = "0xE0cc76334405EE8b39213E620587d815967af39C";
const RIC_TOKEN_ADDRESS = "0x263026E7e53DBFDce5ae55Ade22493f828922965";
const PROVIDER = provider;

export enum ContractType {
  REXMarket = "REXMarket",
  RexOneWayMarket = "RexOneWayMarket",
  RexSushiFarmMarket = "RexSushiFarmMarket",
}

export const setup = async () => {
  const users: any = {};
  const tokens: any = {};
  const superTokens: any = {};
  const contracts: any = {};
  const addresses: any = [
    OWNER_ADDRESS,
    ALICE_ADDRESS,
    CARL_ADDRESS,
    BOB_ADDRESS,
    RIC_TOKEN_ADDRESS,
  ];

  const accountAddrs = [
    OWNER_ADDRESS,
    ALICE_ADDRESS,
    BOB_ADDRESS,
    CARL_ADDRESS,
    USDCX_SOURCE_ADDRESS,
  ];
  const accounts = await impersonateAccounts(accountAddrs);
  const names = ["admin", "alice", "bob", "carl", "spender"];

  // Initialize superfluid sdk
  const superfluid = new SuperfluidSDK.Framework({
    ethers: PROVIDER,
    resolverAddress: SF_RESOLVER,
    tokens: ["WBTC", "DAI", "USDC", "ETH"],
    version: "v1",
  });
  await superfluid.initialize();

  // Declare supertokens as ERC 20 contraxts
  superTokens.ethx = superfluid.tokens.ETHx;
  superTokens.wbtcx = superfluid.tokens.WBTCx;
  superTokens.daix = superfluid.tokens.DAIx;
  superTokens.usdcx = superfluid.tokens.USDCx;

  // Declare all users for transactions (usdcx)
  for (let i = 0; i < names.length; i += 1) {
    users[names[i].toLowerCase()] = superfluid.user({
      address: accounts[i].address,
      token: superTokens.usdcx.address,
    });
    users[names[i].toLowerCase()].alias = names[i];
  }

  // Decalare ERC 20 tokens
  tokens.ric = await ethers.getContractAt(
    "ERC20",
    RIC_TOKEN_ADDRESS,
    users.admin
  );
  tokens.weth = await ethers.getContractAt(
    "ERC20",
    await superTokens.ethx.getUnderlyingToken()
  );
  tokens.wbtc = await ethers.getContractAt(
    "ERC20",
    await superTokens.wbtcx.getUnderlyingToken()
  );
  tokens.usdc = await ethers.getContractAt(
    "ERC20",
    await superTokens.usdcx.getUnderlyingToken()
  );

  async function deployContracts(contract: ContractType) {
    switch (contract) {
      case ContractType.REXMarket:
        const REXMarketFactory = await ethers.getContractFactory(
          "REXMarket",
          users.owner
        );
        const app = await REXMarketFactory.deploy(
          users.owner.address,
          superfluid.host.address,
          superfluid.agreements.cfa.address,
          superfluid.agreements.ida.address
        );
        return app;
        break;

      case ContractType.RexOneWayMarket:
        break;

      case ContractType.RexSushiFarmMarket:
        break;

      default:
        break;
    }
  }

  return {
    superfluid,
    users,
    tokens,
    superTokens,
    contracts,
    addresses,
    deployContracts,
  };
};
