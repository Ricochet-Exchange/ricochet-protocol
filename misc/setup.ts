import { waffle, ethers } from "hardhat";
import { impersonateAccounts } from "./helpers";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
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
const BOB_ADDRESS = "0xf7f0CFC3772d29d4CC1482A2ACB7Be16a85a2223";
const CARL_ADDRESS = "0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf";

const ETHX_ADDRESS = "";
const USDCX_ADDRESS = "";
const WBTCX_ADDRESS = "";
const DAIX_ADDRESS = ""

const USDCX_SOURCE_ADDRESS = "0xA08f80dc1759b12fdC40A4dc64562b322C418E1f";
const SF_RESOLVER = "0xE0cc76334405EE8b39213E620587d815967af39C";
const RIC_TOKEN_ADDRESS = "0x263026E7e53DBFDce5ae55Ade22493f828922965";
const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
const SUSHISWAP_ROUTER_ADDRESS = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
const TELLOR_ETH_REQUEST_ID = "1";
const TELLOR_USDC_REQUEST_ID = "78";
const IDA_SUPERFLUID_ADDRESS = "0x6EeE6060f715257b970700bc2656De21dEdF074C";
const CFA_SUPERFLUID_ADDRESS = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";

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
  const constants: {[key: string] : string} = {
    "OWNER_ADDRESS": OWNER_ADDRESS,
    "ALICE_ADDRESS":ALICE_ADDRESS,
    "CARL_ADDRESS":CARL_ADDRESS,
    "BOB_ADDRESS":BOB_ADDRESS,
    "RIC_TOKEN_ADDRESS":RIC_TOKEN_ADDRESS,
    "SF_RESOLVER":SF_RESOLVER,
    "USDCX_SOURCE_ADDRESS":USDCX_SOURCE_ADDRESS,
    "TELLOR_ORACLE_ADDRESS":TELLOR_ORACLE_ADDRESS,
    "SUSHISWAP_ROUTER_ADDRESS":SUSHISWAP_ROUTER_ADDRESS,
    "TELLOR_ETH_REQUEST_ID":TELLOR_ETH_REQUEST_ID,
    "TELLOR_USDC_REQUEST_ID":TELLOR_USDC_REQUEST_ID,
    "IDA_SUPERFLUID_ADDRESS":IDA_SUPERFLUID_ADDRESS,
    "CFA_SUPERFLUID_ADDRESS":CFA_SUPERFLUID_ADDRESS,
  };

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
    networkName: "hardhat",
    dataMode: "WEB3_ONLY",
    protocolReleaseVersion: "v1"
  });

  // Declare supertokens as ERC 20 contraxts
  const superTokens: ISuperToken = {
    ethx: await superfluid.loadSuperToken(
      "0x27e1e4E6BC79D93032abef01025811B7E4727e85"
    ),
    usdcx: await superfluid.loadSuperToken(
      "0xCAa7349CEA390F89641fe306D93591f87595dc1F"
    ),
    wbtcx: await superfluid.loadSuperToken(
      "0x4086eBf75233e8492F1BCDa41C7f2A8288c2fB92"
    ),
    daix: await superfluid.loadSuperToken(
      "0x1305f6b6df9dc47159d12eb7ac2804d4a33173c2"
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
    RIC_TOKEN_ADDRESS
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
  tokens.ric = tokens.ric.connect(accounts[0]);

  // Trellor Protocol to determine the price
  const TellorPlayground = await ethers.getContractFactory('TellorPlayground');
  let tellor = await TellorPlayground.attach(TELLOR_ORACLE_ADDRESS);
  tellor = tellor.connect(accounts[0]);

  return {
    superfluid,
    users,
    accounts,
    tokens,
    superTokens,
    contracts,
    constants,
    tellor
  };
};
