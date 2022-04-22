import { waffle, ethers } from "hardhat";
import { impersonateAccounts } from "./helpers";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Constants } from "./Constants";

const { provider, loadFixture } = waffle;

import TellorPlayground from "usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json";
import { ERC20 } from "../typechain";

// import RexMarket from 'path to rexmarket ABI';
// import RexOneWayMarket from 'path to rex one way market ABI';
// import RexSushiMarket from 'path to sushi market ABI';

// NOTE: It is essential to pass in a Deployer into the contracts for initialization
// This is because when we are testing the emit, the passed in contract expects a
// provider and will throw an error if this doesn't exist.

const ETHX_ADDRESS = "";
const USDCX_ADDRESS = "";
const WBTCX_ADDRESS = "";
const DAIX_ADDRESS = ""

const PROVIDER = provider;

export interface ISuperToken {
  ethx: SuperToken;
  usdcx: SuperToken;
  wbtcx: SuperToken;
  daix: SuperToken;
  ric: SuperToken;
}

export interface IUser {
  address: string;
  token: string;
  options?: any;
  alias?: string;
}

// export interface TypesOfTokens {
//   ric: Promise<ERC20>;
//   weth: Promise<ERC20>;
//   wbtc: Promise<ERC20>;
//   usdc: Promise<ERC20>;
// }

export const setup = async () => {
  const users: { [key: string]: IUser } = {};
  let tokens: { [key: string]: any } = {};  // TypesOfTokens
  // tokens.ric = new ERC20();

  const contracts: any = {};
  const constants: { [key: string]: string } = {
    "OWNER_ADDRESS": Constants.OWNER_ADDRESS,
    "ALICE_ADDRESS": Constants.ALICE_ADDRESS,
    "CARL_ADDRESS": Constants.CARL_ADDRESS,
    "BOB_ADDRESS": Constants.BOB_ADDRESS,
    "RIC_TOKEN_ADDRESS": Constants.RIC_TOKEN_ADDRESS,
    "SF_RESOLVER": Constants.SF_RESOLVER,
    "USDCX_SOURCE_ADDRESS": Constants.USDCX_SOURCE_ADDRESS,
    "TELLOR_ORACLE_ADDRESS": Constants.TELLOR_ORACLE_ADDRESS,
    "SUSHISWAP_ROUTER_ADDRESS": Constants.SUSHISWAP_ROUTER_ADDRESS,
    "TELLOR_ETH_REQUEST_ID": Constants.TELLOR_ETH_REQUEST_ID.toString(),
    "TELLOR_USDC_REQUEST_ID": Constants.TELLOR_USDC_REQUEST_ID.toString(),
    "IDA_SUPERFLUID_ADDRESS": Constants.IDA_SUPERFLUID_ADDRESS,
    "CFA_SUPERFLUID_ADDRESS": Constants.CFA_SUPERFLUID_ADDRESS,
  };

  const accountAddrs = [
    Constants.OWNER_ADDRESS,
    Constants.ALICE_ADDRESS,
    Constants.BOB_ADDRESS,
    Constants.CARL_ADDRESS,
    Constants.KAREN_ADDRESS,
    Constants.USDCX_SOURCE_ADDRESS,
    Constants.ETHX_SOURCE_ADDRESS,
    Constants.SF_RESOLVER,
  ];

  const accounts: SignerWithAddress[] = await impersonateAccounts(accountAddrs);
  const names = ["admin", "alice", "bob", "carl", "usdcxspender", "ethxspender"];

  // Initialize superfluid sdk
  const superfluid = await Framework.create({
    provider: ethers.provider,  //   PROVIDER,  // ethers.getDefaultProvider(),
    resolverAddress: Constants.SF_RESOLVER,
    networkName: "hardhat",
    dataMode: "WEB3_ONLY",
    protocolReleaseVersion: "v1"
  });

  // Declare supertokens as ERC 20 contracts
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
    ric: await superfluid.loadSuperToken(
      Constants.RIC_TOKEN_ADDRESS
    )
  };

  // Declare all users for transactions (usdcx)
  for (let i = 0; i < names.length; i += 1) {
    users[names[i]] = {
      address: accounts[i].address,
      token: superTokens.usdcx.address,
      alias: names[i],
    };
  }

  // Declare ERC 20 tokens
  tokens.ric = await ethers.getContractAt(
    "ERC20", Constants.RIC_TOKEN_ADDRESS
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
  // let var2:string = tokens.usdc;
  tokens.ric = tokens.ric.connect(accounts[0]);

  // Trellor Protocol to determine the price
  const TellorPlayground = await ethers.getContractFactory('TellorPlayground');
  let tellor = await TellorPlayground.attach(Constants.TELLOR_ORACLE_ADDRESS);
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


  // const accounts : SignerWithAddress[] = await impersonateAccounts(accountAddrs);
  // const names = ["admin", "alice", "bob", "carl", "spender"];

