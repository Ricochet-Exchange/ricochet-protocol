import { ethers } from "hardhat";
import { impersonateAccounts } from "./helpers";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { waffle } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { provider, loadFixture } = waffle;

const TellorPlayground = require("usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json");

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

export interface ISuperToken {
  ethx: SuperToken;
  usdcx: SuperToken;
  wbtcx: SuperToken;
  daix: SuperToken;
}

export interface IUser {
  address: string;
  token: string;
  options?: any;
  alias?: string;
}

export const setup = async () => {
  const users: { [key: string]: IUser } = {};
  const tokens: {[key: string]: any} = {};

  const contracts: any = {};
  const addresses: string[] = [
    OWNER_ADDRESS,
    ALICE_ADDRESS,
    CARL_ADDRESS,
    BOB_ADDRESS,
    RIC_TOKEN_ADDRESS,
    SF_RESOLVER,
    USDCX_SOURCE_ADDRESS
  ];

  const accountAddrs = [
    OWNER_ADDRESS,
    ALICE_ADDRESS,
    BOB_ADDRESS,
    CARL_ADDRESS,
    USDCX_SOURCE_ADDRESS,
    SF_RESOLVER,
  ];
  const accounts : SignerWithAddress[] = await impersonateAccounts(accountAddrs);
  const names = ["admin", "alice", "bob", "carl", "spender"];

  // Initialize superfluid sdk
  const superfluid = await Framework.create({
    provider: PROVIDER,
    resolverAddress: SF_RESOLVER,
    networkName: "matic",
  });

  // Declare supertokens as ERC 20 contraxts
  const superTokens: ISuperToken = {
    ethx: await superfluid.loadSuperToken(
      "0xCAa7349CEA390F89641fe306D93591f87595dc1F"
    ),
    usdcx: await superfluid.loadSuperToken(
      "0xCAa7349CEA390F89641fe306D93591f87595dc1F"
    ),
    wbtcx: await superfluid.loadSuperToken(
      "0xCAa7349CEA390F89641fe306D93591f87595dc1F"
    ),
    daix: await superfluid.loadSuperToken(
      "0xCAa7349CEA390F89641fe306D93591f87595dc1F"
    ),
  };

  // Declare all users for transactions (usdcx)
  for (let i = 0; i < names.length; i += 1) {
    users[names[i]] = {
      address: accounts[i].address,
      token: superTokens.usdcx.address,
      alias: names[i],
    };
  }

  // Decalare ERC 20 tokens
  tokens.ric = await ethers.getContractAt(
    "ERC20",
    RIC_TOKEN_ADDRESS,
    accounts[0]
  );
  tokens.weth = await ethers.getContractAt(
    "ERC20",
    await superTokens.ethx.underlyingToken.address
  );
  tokens.wbtc = await ethers.getContractAt(
    "ERC20",
    await superTokens.wbtcx.underlyingToken.address
  );
  tokens.usdc = await ethers.getContractAt(
    "ERC20",
    await superTokens.usdcx.underlyingToken.address
  );

  return {
    superfluid,
    users,
    accounts,
    tokens,
    superTokens,
    contracts,
    addresses,
  };
};
