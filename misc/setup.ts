import { waffle, ethers } from "hardhat";
import { impersonateAccounts } from "./helpers";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Constants } from "./Constants";
import * as dotenv from "dotenv";

const { provider, loadFixture } = waffle;

// import RexMarket from 'path to rexmarket ABI';
// import RexOneWayMarket from 'path to rex one way market ABI';
// import RexSushiMarket from 'path to sushi market ABI';

// NOTE: It is essential to pass in a Deployer into the contracts for initialization
// This is because when we are testing the emit, the passed in contract expects a
// provider and will throw an error if this doesn't exist.

dotenv.config();

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
  maticx: SuperToken;
  // ibAlluoUSD: SuperToken;
  // ibAlluoETH: SuperToken;
  stIbAlluoUSD: SuperToken;
  stIbAlluoETH: SuperToken;
  rexshirt: SuperToken;
}

export interface IUser {
  address: string;
  token: string;
  options?: any;
  alias?: string;
}

export const REX_REFERRAL_ADDRESS = process.env.REX_REFERRAL_ADDRESS !== undefined ? process.env.REX_REFERRAL_ADDRESS : "";

export const setup = async () => {

  // TODO: Should be set dynamically based on the network we're on
  let _constants = Constants.matic;

  const users: { [key: string]: IUser } = {};
  let tokens: { [key: string]: any } = {};  // TypesOfTokens
  // tokens.ric = new ERC20();

  const contracts: any = {};
  const constants: { [key: string]: string } = {
    "OWNER_ADDRESS": _constants.OWNER_ADDRESS,
    "ALICE_ADDRESS": _constants.ALICE_ADDRESS,
    "CARL_ADDRESS": _constants.CARL_ADDRESS,
    "BOB_ADDRESS": _constants.BOB_ADDRESS,
    "RIC_TOKEN_ADDRESS": _constants.RIC_TOKEN_ADDRESS,
    "SF_RESOLVER": _constants.SF_RESOLVER,
    "USDCX_SOURCE_ADDRESS": _constants.USDCX_SOURCE_ADDRESS,
    "MATICX_SOURCE_ADDRESS": _constants.MATICX_SOURCE_ADDRESS,
    "IBALLUOUSD_SOURCE_ADDRESS": _constants.IBALLUOUSD_SOURCE_ADDRESS,
    "IBALLUOETH_SOURCE_ADDRESS": _constants.IBALLUOETH_SOURCE_ADDRESS,
    "SUSHISWAP_ROUTER_ADDRESS": _constants.SUSHISWAP_ROUTER_ADDRESS,
    "IDA_SUPERFLUID_ADDRESS": _constants.IDA_SUPERFLUID_ADDRESS,
    "CFA_SUPERFLUID_ADDRESS": _constants.CFA_SUPERFLUID_ADDRESS,
  };

  const accountAddrs = [
    _constants.OWNER_ADDRESS,
    _constants.ALICE_ADDRESS,
    _constants.BOB_ADDRESS,
    _constants.CARL_ADDRESS,
    _constants.KAREN_ADDRESS,
    _constants.USDCX_SOURCE_ADDRESS,
    _constants.ETHX_SOURCE_ADDRESS,
    _constants.MATICX_SOURCE_ADDRESS,
    _constants.IBALLUOUSD_SOURCE_ADDRESS,
    _constants.IBALLUOETH_SOURCE_ADDRESS,
    _constants.RIC_SOURCE_ADDRESS,
    _constants.SF_RESOLVER,
  ];
  const accounts: SignerWithAddress[] = await impersonateAccounts(accountAddrs);
  const names = ["admin", "alice", "bob", "carl", "karen", "usdcxspender", "ethxspender", "maticxspender", "ibAlluoUSDspender", "ibAlluoETHspender", "ricspender"];

  // Initialize superfluid sdk
  const superfluid = await Framework.create({
    provider: ethers.provider,  //   PROVIDER,  // ethers.getDefaultProvider(),
    resolverAddress: _constants.SF_RESOLVER,
    networkName: "hardhat",
    dataMode: "WEB3_ONLY",
    protocolReleaseVersion: "v1",
    chainId: 31337
  });

  // Declare supertokens as ERC 20 contracts
  const superTokens: ISuperToken = {
    maticx: await superfluid.loadSuperToken(
      "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3"
    ),
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
    stIbAlluoUSD: await superfluid.loadSuperToken(
      "0xE9E759B969B991F2bFae84308385405B9Ab01541"
    ),
    stIbAlluoETH: await superfluid.loadSuperToken(
      "0x2D4Dc956FBd0044a4EBA945e8bbaf98a14025C2d"
    ),
    // ibAlluoUSD: await superfluid.loadSuperToken(_constants.IBALLUOUSD_ADDRESS),
    // ibAlluoETH: await superfluid.loadSuperToken(_constants.IBALLUOETH_ADDRESS),
    ric: await superfluid.loadSuperToken(
      _constants.RIC_TOKEN_ADDRESS
    ),
    rexshirt: await superfluid.loadSuperToken(
      _constants.REXSHIRT_ADDRESS
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

  // console.log(superTokens.ethx)
  // Declare ERC 20 tokens
  tokens.ric = await ethers.getContractAt(
    "ERC20", _constants.RIC_TOKEN_ADDRESS
  );
  // tokens.weth = await ethers.getContractAt(
  //   "ERC20",
  //   await superTokens.ethx.underlyingToken.address
  // );
  tokens.wbtc = await ethers.getContractAt(
    "ERC20",
    await superTokens.wbtcx.underlyingToken.address
  );
  tokens.usdc = await ethers.getContractAt(
    "ERC20",
    await superTokens.usdcx.underlyingToken.address
  );
  tokens.maticx = await ethers.getContractAt(
    "ERC20",
    await superTokens.maticx.underlyingToken.address
  );
  tokens.ibAlluoUSD = await ethers.getContractAt(
    "ERC20",
    await superTokens.stIbAlluoUSD.underlyingToken.address
  );
  tokens.ibAlluoETH = await ethers.getContractAt(
    "ERC20",
    await superTokens.stIbAlluoETH.underlyingToken.address
  );

  let var2:string = tokens.usdc;
  tokens.ric = tokens.ric.connect(accounts[0]);


  return {
    superfluid,
    users,
    accounts,
    tokens,
    superTokens,
    contracts,
    constants,
  };
};
