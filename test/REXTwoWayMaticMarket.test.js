/* eslint-disable no-await-in-loop */
const {
  web3tx,
  toWad,
  wad4human,
  fromDecimals,
  BN,
} = require('@decentral.ee/web3-helpers');
const {
  numberToHex,
} = require('web3-utils');
const {
  expect,
} = require('chai');
const { time } = require('@openzeppelin/test-helpers');
const axios = require('axios').default;
const deployFramework = require('@superfluid-finance/ethereum-contracts/scripts/deploy-framework');
const deployTestToken = require('@superfluid-finance/ethereum-contracts/scripts/deploy-test-token');
const deploySuperToken = require('@superfluid-finance/ethereum-contracts/scripts/deploy-super-token');
const SuperfluidSDK = require('@superfluid-finance/js-sdk');
const traveler = require('ganache-time-traveler');
const SuperfluidGovernanceBase = require('./artifacts/superfluid/SuperfluidGovernanceII.json');

const superTokenAbi=[{"inputs":[{"internalType":"contract ISuperfluid","name":"host","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"agreementClass","type":"address"},{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":false,"internalType":"bytes","name":"state","type":"bytes"}],"name":"AgreementAccountStateUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"agreementClass","type":"address"},{"indexed":false,"internalType":"bytes32","name":"id","type":"bytes32"},{"indexed":false,"internalType":"bytes32[]","name":"data","type":"bytes32[]"}],"name":"AgreementCreated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"agreementClass","type":"address"},{"indexed":false,"internalType":"bytes32","name":"id","type":"bytes32"},{"indexed":true,"internalType":"address","name":"penaltyAccount","type":"address"},{"indexed":true,"internalType":"address","name":"rewardAccount","type":"address"},{"indexed":false,"internalType":"uint256","name":"rewardAmount","type":"uint256"}],"name":"AgreementLiquidated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"liquidatorAccount","type":"address"},{"indexed":true,"internalType":"address","name":"agreementClass","type":"address"},{"indexed":false,"internalType":"bytes32","name":"id","type":"bytes32"},{"indexed":true,"internalType":"address","name":"penaltyAccount","type":"address"},{"indexed":true,"internalType":"address","name":"bondAccount","type":"address"},{"indexed":false,"internalType":"uint256","name":"rewardAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"bailoutAmount","type":"uint256"}],"name":"AgreementLiquidatedBy","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"agreementClass","type":"address"},{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":false,"internalType":"uint256","name":"slotId","type":"uint256"}],"name":"AgreementStateUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"agreementClass","type":"address"},{"indexed":false,"internalType":"bytes32","name":"id","type":"bytes32"}],"name":"AgreementTerminated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"agreementClass","type":"address"},{"indexed":false,"internalType":"bytes32","name":"id","type":"bytes32"},{"indexed":false,"internalType":"bytes32[]","name":"data","type":"bytes32[]"}],"name":"AgreementUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":true,"internalType":"address","name":"tokenHolder","type":"address"}],"name":"AuthorizedOperator","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"bailoutAccount","type":"address"},{"indexed":false,"internalType":"uint256","name":"bailoutAmount","type":"uint256"}],"name":"Bailout","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"operatorData","type":"bytes"}],"name":"Burned","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"bytes32","name":"uuid","type":"bytes32"},{"indexed":false,"internalType":"address","name":"codeAddress","type":"address"}],"name":"CodeUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"operatorData","type":"bytes"}],"name":"Minted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":true,"internalType":"address","name":"tokenHolder","type":"address"}],"name":"RevokedOperator","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"data","type":"bytes"},{"indexed":false,"internalType":"bytes","name":"operatorData","type":"bytes"}],"name":"Sent","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"TokenDowngraded","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"account","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"TokenUpgraded","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"address","name":"spender","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"operator","type":"address"}],"name":"authorizeOperator","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"balance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"burn","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"id","type":"bytes32"},{"internalType":"bytes32[]","name":"data","type":"bytes32[]"}],"name":"createAgreement","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"subtractedValue","type":"uint256"}],"name":"decreaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"defaultOperators","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"downgrade","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"getAccountActiveAgreements","outputs":[{"internalType":"contract ISuperAgreement[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"agreementClass","type":"address"},{"internalType":"bytes32","name":"id","type":"bytes32"},{"internalType":"uint256","name":"dataLength","type":"uint256"}],"name":"getAgreementData","outputs":[{"internalType":"bytes32[]","name":"data","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"agreementClass","type":"address"},{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"slotId","type":"uint256"},{"internalType":"uint256","name":"dataLength","type":"uint256"}],"name":"getAgreementStateSlot","outputs":[{"internalType":"bytes32[]","name":"slotData","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getCodeAddress","outputs":[{"internalType":"address","name":"codeAddress","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getHost","outputs":[{"internalType":"address","name":"host","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getUnderlyingToken","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"granularity","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"addedValue","type":"uint256"}],"name":"increaseAllowance","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"underlyingToken","type":"address"},{"internalType":"uint8","name":"underlyingDecimals","type":"uint8"},{"internalType":"string","name":"n","type":"string"},{"internalType":"string","name":"s","type":"string"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"isAccountCritical","outputs":[{"internalType":"bool","name":"isCritical","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"isAccountCriticalNow","outputs":[{"internalType":"bool","name":"isCritical","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"isAccountSolvent","outputs":[{"internalType":"bool","name":"isSolvent","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"isAccountSolventNow","outputs":[{"internalType":"bool","name":"isSolvent","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"operator","type":"address"},{"internalType":"address","name":"tokenHolder","type":"address"}],"name":"isOperatorFor","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"id","type":"bytes32"},{"internalType":"address","name":"liquidator","type":"address"},{"internalType":"address","name":"penaltyAccount","type":"address"},{"internalType":"uint256","name":"rewardAmount","type":"uint256"},{"internalType":"uint256","name":"bailoutAmount","type":"uint256"}],"name":"makeLiquidationPayouts","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"operationApprove","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"operationDowngrade","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"operationTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"operationUpgrade","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"bytes","name":"operatorData","type":"bytes"}],"name":"operatorBurn","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"sender","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"},{"internalType":"bytes","name":"operatorData","type":"bytes"}],"name":"operatorSend","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"proxiableUUID","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"realtimeBalanceOf","outputs":[{"internalType":"int256","name":"availableBalance","type":"int256"},{"internalType":"uint256","name":"deposit","type":"uint256"},{"internalType":"uint256","name":"owedDeposit","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"realtimeBalanceOfNow","outputs":[{"internalType":"int256","name":"availableBalance","type":"int256"},{"internalType":"uint256","name":"deposit","type":"uint256"},{"internalType":"uint256","name":"owedDeposit","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"operator","type":"address"}],"name":"revokeOperator","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes","name":"userData","type":"bytes"}],"name":"selfBurn","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes","name":"userData","type":"bytes"}],"name":"selfMint","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"send","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"int256","name":"delta","type":"int256"}],"name":"settleBalance","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"id","type":"bytes32"},{"internalType":"uint256","name":"dataLength","type":"uint256"}],"name":"terminateAgreement","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"}],"name":"transferAll","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"holder","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"id","type":"bytes32"},{"internalType":"bytes32[]","name":"data","type":"bytes32[]"}],"name":"updateAgreementData","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"account","type":"address"},{"internalType":"uint256","name":"slotId","type":"uint256"},{"internalType":"bytes32[]","name":"slotData","type":"bytes32[]"}],"name":"updateAgreementStateSlot","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newAddress","type":"address"}],"name":"updateCode","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"upgrade","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"upgradeTo","outputs":[],"stateMutability":"nonpayable","type":"function"}]


const TEST_TRAVEL_TIME = 3600 * 2; // 1 hours

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function impersonateAccount(account) {
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [account],
  });
}

async function setBalance(account, balance) {
  const hexBalance = numberToHex(toWad(balance));
  await hre.network.provider.request({
    method: 'hardhat_setBalance',
    params: [
      account,
      hexBalance,
    ],
  });
}
async function impersonateAndSetBalance(account) {
  await impersonateAccount(account);
  await setBalance(account, 10000);
}

async function createSFRegistrationKey(sf, deployer) {
  const registrationKey = `testKey-${Date.now()}`;
  const appKey = web3.utils.sha3(
    web3.eth.abi.encodeParameters(
      ['string', 'address', 'string'],
      [
        'org.superfluid-finance.superfluid.appWhiteListing.registrationKey',
        deployer,
        registrationKey,
      ],
    ),
  );

  const governance = await sf.host.getGovernance.call();
  console.log(`SF Governance: ${governance}`);

  const sfGovernanceRO = await ethers
    .getContractAt(SuperfluidGovernanceBase.abi, governance);

  const govOwner = await sfGovernanceRO.owner();
  await impersonateAndSetBalance(govOwner);

  const sfGovernance = await ethers
    .getContractAt(SuperfluidGovernanceBase.abi, governance, await ethers.getSigner(govOwner));

  await sfGovernance.whiteListNewApp(sf.host.address, appKey);

  return registrationKey;
}

describe('REXTwoWayMarket', () => {
  const errorHandler = (err) => {
    if (err) throw err;
  };

  const names = ['Admin', 'Alice', 'Bob', 'Carl', 'Karen', 'UsdcSpender', 'MaticSpender'];

  let sf;
  let dai;
  let daix;
  let maticx;
  let wmatic;
  let usd;
  let usdcx;
  let ric;
  let usdc;
  let app;
  let tp; // Tellor playground
  let usingTellor;
  let sr; // Mock Sushi Router
  const ricAddress = '0x263026e7e53dbfdce5ae55ade22493f828922965';
  const u = {}; // object with all users
  const aliases = {};
  let owner;
  let alice;
  let bob;
  let carl;
  let usdcSpender;
  let maticSpender;
  const SF_RESOLVER = '0xE0cc76334405EE8b39213E620587d815967af39C';
  const RIC_TOKEN_ADDRESS = '0x263026E7e53DBFDce5ae55Ade22493f828922965';
  const SUSHISWAP_ROUTER_ADDRESS = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
  const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
  const TELLOR_MATIC_REQUEST_ID = 6;
  const TELLOR_USDC_REQUEST_ID = 78;
  const TELLOR_RIC_REQUEST_ID = 77;
  const COINGECKO_KEY = 'matic-network';

  // random address from polygonscan that have a lot of usdcx
  const USDCX_SOURCE_ADDRESS = '0x323578F3743Cd013fF6b3a1A1Ac708194527E007';
  const MATICX_SOURCE_ADDRESS = '0xC2F9fE8b6827c43D36AE8d770e65b3F36F6A04b4';
  const USDC_SOURCE_ADDRESS = '0x1a13f4ca1d028320a707d99520abfefca3998b7f';
  const OUTPUT_TOKEN_ADDRESS = '0xB63E38D21B31719e6dF314D3d2c351dF0D4a9162'; // IDLE


  const CARL_ADDRESS = '0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf';
  const BOB_ADDRESS = '0x00Ce20EC71942B41F50fF566287B811bbef46DC8';
  const ALICE_ADDRESS = '0x9f348cdD00dcD61EE7917695D2157ef6af2d7b9B';
  const OWNER_ADDRESS = '0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA';
  const REPORTER_ADDRESS = '0xeA74b2093280bD1E6ff887b8f2fE604892EBc89f';
  const KAREN_ADDRESS = "0xbf188ab46C1ca9d9e47a7996d585566ECeDdAeAb"
  let oraclePrice;
  let ricOraclePrice;

  const appBalances = {
    maticx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const ownerBalances = {
    maticx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const aliceBalances = {
    maticx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const bobBalances = {
    maticx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const carlBalances = {
    maticx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };

  const karenBalances = {
    maticx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };

  async function approveSubscriptions(
    users = [u.alice.address, u.bob.address, u.carl.address, u.karen.address, u.admin.address],
    tokens = [usdcx.address, maticx.address, ric.address, ric.address],
  ) {
    // Do approvals
    // Already approved?
    console.log('Approving subscriptions...');

    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
        await web3tx(
          sf.host.callAgreement,
          `${users[userIndex]} approves subscription to the app ${tokens[tokenIndex]} ${tokenIndex}`,
        )(
          sf.agreements.ida.address,
          sf.agreements.ida.contract.methods
            .approveSubscription(tokens[tokenIndex], app.address, tokenIndex, '0x')
            .encodeABI(),
          '0x', // user data
          {
            from: users[userIndex],
          },
        );
      }
    }
    console.log('Approved.');
  }

  before(async () => {
    // ==============
    // impersonate accounts and set balances

    const accountAddrs = [OWNER_ADDRESS, ALICE_ADDRESS, BOB_ADDRESS, CARL_ADDRESS, KAREN_ADDRESS, USDCX_SOURCE_ADDRESS, MATICX_SOURCE_ADDRESS];

    accountAddrs.forEach(async (account) => {
      await impersonateAndSetBalance(account);
    });

    // ==============
    // get signers
    owner = await ethers.provider.getSigner(OWNER_ADDRESS);
    reporter = await ethers.provider.getSigner(REPORTER_ADDRESS);
    alice = await ethers.provider.getSigner(ALICE_ADDRESS);
    bob = await ethers.provider.getSigner(BOB_ADDRESS);
    carl = await ethers.provider.getSigner(CARL_ADDRESS);
    karen = await ethers.provider.getSigner(KAREN_ADDRESS);
    usdcSpender = await ethers.provider.getSigner(USDCX_SOURCE_ADDRESS);
    maticSpender = await ethers.provider.getSigner(MATICX_SOURCE_ADDRESS);
    const accounts = [owner, alice, bob, carl, karen, usdcSpender, maticSpender];

    // ==============
    // Init Superfluid Framework

    sf = new SuperfluidSDK.Framework({
      web3,
      resolverAddress: SF_RESOLVER,
      tokens: ['MATICx', 'WBTC', 'DAI', 'USDC'],
      version: 'v1',
    });
    await sf.initialize();
    maticx = sf.tokens.MATICx
    console.log("MATICx Address", maticx.address);
    daix = sf.tokens.DAIx;
    usdcx = sf.tokens.USDCx;

    // ==============
    // Init SF users

    for (let i = 0; i < names.length; i += 1) {
      // Bob will be the ETHx streamer
      if (names[i].toLowerCase() == "bob") {
        u[names[i].toLowerCase()] = sf.user({
          address: accounts[i]._address || accounts[i].address,
          token: maticx.address,
        });
      } else {
        u[names[i].toLowerCase()] = sf.user({
          address: accounts[i]._address || accounts[i].address,
          token: usdcx.address,
        });
      }

      u[names[i].toLowerCase()].alias = names[i];
      aliases[u[names[i].toLowerCase()].address] = names[i];
    }

    // ==============
    // NOTE: Assume the oracle is up to date
    // Deploy Tellor Oracle contracts

    const TellorPlayground = await ethers.getContractFactory('TellorPlayground');
    tp = await TellorPlayground.attach(TELLOR_ORACLE_ADDRESS);
    tp = tp.connect(owner);

    // ==============
    // Setup tokens

    const ERC20 = await ethers.getContractFactory('ERC20');
    ric = await ERC20.attach(RIC_TOKEN_ADDRESS);
    wmatic = await ERC20.attach(await maticx.getUnderlyingToken());
    usdc = await ERC20.attach(await usdcx.getUnderlyingToken());
    ric = ric.connect(owner);

    // Attach alice to the SLP token
    outputx = maticx;
    output = await ERC20.attach(await outputx.getUnderlyingToken());


  });

  beforeEach(async () => {
    // Update the oracles
    // Get actual price
    let response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids='+COINGECKO_KEY+'&vs_currencies=usd');
    oraclePrice = parseInt(response.data[COINGECKO_KEY].usd * 1000000).toString();
    console.log('oraclePrice', oraclePrice);
    await tp.submitValue(TELLOR_MATIC_REQUEST_ID, oraclePrice);
    await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
    response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=richochet&vs_currencies=usd');
    ricOraclePrice = parseInt(response.data['richochet'].usd * 1000000).toString();
    await tp.submitValue(TELLOR_RIC_REQUEST_ID, 1000000);

    // ==============
    // Deploy REX Market

    // Deploy REXReferral
    RexReferral = await ethers.getContractFactory("REXReferral", {
      signer: owner,
    });
    referral = await RexReferral.deploy();
    await referral.deployed();

    const REXTwoWayMarket = await ethers.getContractFactory('REXTwoWayMaticMarket', {
      signer: owner,
    });

    const registrationKey = await createSFRegistrationKey(sf, u.admin.address);
    console.log(registrationKey);
    console.log('Deploying REXTwoWayMarket...');
    app = await REXTwoWayMarket.deploy(
      u.admin.address,
      sf.host.address,
      sf.agreements.cfa.address,
      sf.agreements.ida.address,
      registrationKey,
      referral.address);

    console.log('Deployed REXTwoWayMarket');

    await app.initializeTwoWayMarket(
      usdcx.address,
      TELLOR_USDC_REQUEST_ID,
      1e9,
      maticx.address,
      TELLOR_MATIC_REQUEST_ID,
      1e9,
      20000,
      20000
    )

    await app.initializeSubsidies(10000000000000);
    // send the contract some RIC
    await ric.transfer(app.address, '3971239975789381077848')

    // Register the market with REXReferral
    await referral.registerApp(app.address);
    referral = await referral.connect(carl);
    await referral.applyForAffiliate("carl", "carl");
    referral = await referral.connect(owner);
    await referral.verifyAffiliate("carl");



    u.app = sf.user({
      address: app.address,
      token: outputx.address,
    });
    u.app.alias = 'App';
    // ==============


  });

  async function checkBalance(user) {
    console.log('Balance of ', user.alias);
    console.log('usdcx: ', (await usdcx.balanceOf(user.address)).toString());
    console.log('maticx: ', (await maticx.balanceOf(user.address)).toString());
    console.log('ric: ', (await ric.balanceOf(user.address)).toString());
  }

  async function delta(account, balances) {
    const len = balances.maticx.length;
    const changeInOutToken = balances.maticx[len - 1] - balances.maticx[len - 2];
    const changeInInToken = balances.usdcx[len - 1] - balances.usdcx[len - 2];
    const changeInSubsidyToken = balances.ric[len - 1] - balances.ric[len - 2];
    console.log();
    console.log('Change in balances for ', account);
    console.log('Maticx:', changeInOutToken, 'Bal:', balances.maticx[len - 1]);
    console.log('Usdcx:', changeInInToken, 'Bal:', balances.usdcx[len - 1]);
    console.log('Ric:', changeInSubsidyToken, 'Bal:', balances.ric[len - 1]);
    return {
      maticx: changeInOutToken,
      usdcx: changeInInToken,
      ric: changeInSubsidyToken
    }
  }

  async function takeMeasurements() {

    appBalances.maticx.push((await maticx.balanceOf(app.address)).toString());
    ownerBalances.maticx.push((await maticx.balanceOf(u.admin.address)).toString());
    aliceBalances.maticx.push((await maticx.balanceOf(u.alice.address)).toString());
    carlBalances.maticx.push((await maticx.balanceOf(u.carl.address)).toString());
    karenBalances.maticx.push((await maticx.balanceOf(u.karen.address)).toString());
    bobBalances.maticx.push((await maticx.balanceOf(u.bob.address)).toString());

    appBalances.usdcx.push((await usdcx.balanceOf(app.address)).toString());
    ownerBalances.usdcx.push((await usdcx.balanceOf(u.admin.address)).toString());
    aliceBalances.usdcx.push((await usdcx.balanceOf(u.alice.address)).toString());
    carlBalances.usdcx.push((await usdcx.balanceOf(u.carl.address)).toString());
    karenBalances.usdcx.push((await usdcx.balanceOf(u.karen.address)).toString());
    bobBalances.usdcx.push((await usdcx.balanceOf(u.bob.address)).toString());

    appBalances.ric.push((await ric.balanceOf(app.address)).toString());
    ownerBalances.ric.push((await ric.balanceOf(u.admin.address)).toString());
    aliceBalances.ric.push((await ric.balanceOf(u.alice.address)).toString());
    carlBalances.ric.push((await ric.balanceOf(u.carl.address)).toString());
    karenBalances.ric.push((await ric.balanceOf(u.karen.address)).toString());
    bobBalances.ric.push((await ric.balanceOf(u.bob.address)).toString());
  }

  describe.only('REXTwoWayMarket', async () => {

    xit('should not allow two streams', async () => {
      const inflowRateUsdc = '1000000000000000';
      const inflowRateMatic  = '10000000000000';


      console.log('Transfer alice usdc');
      await usdcx.transfer(u.alice.address, toWad(400), { from: u.usdcspender.address });
      console.log('Transfer alice matic');
      await maticx.transfer(u.alice.address, toWad(1), { from: u.maticspender.address });
      console.log('Done');

      await approveSubscriptions([u.alice.address]);

      await u.alice.flow({ flowRate: inflowRateUsdc, recipient: u.app });
      const aliceMatic = await sf.user({
        address: u.alice.address,
        token: maticx.address,
      });

      await expect(
        aliceMatic.flow({ flowRate: inflowRateMatic, recipient: u.app })
      ).to.be.revertedWith("Already streaming");

    });

    it.only('should not allow affiliate streams', async () => {
      const inflowRateUsdc = '1000000000000000';

      console.log('Transfer alice');
      await usdcx.transfer(u.carl.address, toWad(400), { from: u.usdcspender.address });
      console.log('Done');

      await approveSubscriptions([u.carl.address]);

      await expect(
        u.carl.flow({ flowRate: inflowRateUsdc, recipient: u.app })
      ).to.be.revertedWith("noAffiliates");

    });

    it('should not allow small streams', async () => {

      // Lower bound on a stream is shareScaler * 1e3

      const inflowRateMin     = '1000000000000';
      const inflowRatePrime   = '13000000000000';
      const inflowRateTooLow  = '100000000000';
      const inflowRateNot10   = '1000000000001';

      const inflowRateMinMATIC     = '10000000000';
      const inflowRatePrimeMATIC   = '130000000000';
      const inflowRateTooLowMATIC  = '1000000000';
      const inflowRateNot10MATIC   = '10000000001';

      console.log('Transfer alice USDCx');
      await usdcx.transfer(u.alice.address, toWad(400), { from: u.usdcspender.address });
      await maticx.transfer(u.bob.address, toWad(1), { from: u.maticspender.address });

      // console.log('Transfer alice ETH');
      // await ethx.transfer(u.alice.address, toWad(1), { from: u.ethspender.address });
      console.log('Done');

      await approveSubscriptions([u.alice.address, u.carl.address, u.admin.address, u.bob.address]);

      // Make sure it reverts not scalable values
      await expect(
        u.alice.flow({ flowRate: inflowRateTooLow, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') })
      ).to.be.revertedWith("notScalable");

      await expect(
        u.alice.flow({ flowRate: inflowRateNot10, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') })
      ).to.be.revertedWith("notScalable");

      // Make sure it works with scalable, prime flow rates
      await u.alice.flow({
        flowRate: inflowRatePrime,
        recipient: u.app,
        userData: web3.eth.abi.encodeParameter('string', 'carl')
      });

      // Confirm speed limit allocates shares correctly
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,12740,0`);
      expect((await app.getIDAShares(1, u.admin.address)).toString()).to.equal(`true,true,234,0`);
      expect((await app.getIDAShares(1, u.carl.address)).toString()).to.equal(`true,true,26,0`);

      // Stop the flow
      await u.alice.flow({
        flowRate: '0',
        recipient: u.app
      });

      // Confirm speed limit allocates shares correctly
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(1, u.admin.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(1, u.carl.address)).toString()).to.equal(`true,true,0,0`);

      // Test minimum flow rate
      await u.alice.flow({
        flowRate: inflowRateMin,
        recipient: u.app,
        userData: web3.eth.abi.encodeParameter('string', 'carl')
      });

      // Confirm speed limit allocates shares correctly
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,980,0`);
      expect((await app.getIDAShares(1, u.admin.address)).toString()).to.equal(`true,true,18,0`);
      expect((await app.getIDAShares(1, u.carl.address)).toString()).to.equal(`true,true,2,0`);

      // Stop the flow
      await u.alice.flow({
        flowRate: '0',
        recipient: u.app,
        userData: web3.eth.abi.encodeParameter('string', 'carl')
      });

      // Confirm speed limit allocates shares correctly
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(1, u.admin.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(1, u.carl.address)).toString()).to.equal(`true,true,0,0`);

      // TEST ETH SIDE

      // Make sure it reverts not scalable values
      await expect(
        u.bob.flow({ flowRate: inflowRateTooLowMATIC, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') })
      ).to.be.revertedWith("notScalable");

      await expect(
        u.bob.flow({ flowRate: inflowRateNot10MATIC, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') })
      ).to.be.revertedWith("notScalable");

      // Make sure it works with scalable, prime flow rates
      await u.bob.flow({
        flowRate: inflowRatePrimeMATIC,
        recipient: u.app,
        userData: web3.eth.abi.encodeParameter('string', 'carl')
      });

      // Confirm speed limit allocates shares correctly
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,12740,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,234,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,26,0`);

      // Stop the flow
      await u.bob.flow({
        flowRate: '0',
        recipient: u.app
      });

      // Confirm speed limit allocates shares correctly
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,0,0`);

      // Test minimum flow rate
      await u.bob.flow({
        flowRate: inflowRateMinMATIC,
        recipient: u.app,
        userData: web3.eth.abi.encodeParameter('string', 'carl')
      });

      // Confirm speed limit allocates shares correctly
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,980,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,18,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,2,0`);

      // Stop the flow
      await u.bob.flow({
        flowRate: '0',
        recipient: u.app,
        userData: web3.eth.abi.encodeParameter('string', 'carl')
      });

      // Confirm speed limit allocates shares correctly
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,0,0`);

    });

    xit("should make sure subsidy tokens and output tokens are correct" , async () => {
      // The token with feeRate != 0 is output token in this case that is ethx
      // The token with emissionRate != 0 is subsisdy token in this case that ric tokens.
      // 0. Approve subscriptions
      await usdcx.transfer(u.alice.address, toWad(400).toString(), { from: u.usdcspender.address });
      //console.log("transfer?");
      //await ricx.transfer(u.app.address, toWad(400).toString(), { from: u.admin.address });
      //console.log("ric transfer");
      //checkBalance(u.bob);
      //checkBalance(u.alice);
      //checkBalance(u.spender);
      //checkBalance(u.admin);
      //console.log(toWad(10).toString());
      //await ethx.transfer(u.app.address, toWad(10).toString(), { from: u.bob.address });
      //console.log("ethx transfer");
      await approveSubscriptions();
      // 1. Check balance for output and subsidy tokens and usdcx
      //await takeMeasurements();
      await checkBalance(u.alice);

      // 2. Create a stream from an account to app to excahnge tokens
      let aliceBeforeBalance = parseInt(await ric.balanceOf(u.alice.address));
      console.log(aliceBeforeBalance);

      await u.alice.flow({ flowRate: "77160493827160", recipient: u.app });
      // 3. Increase time by 1 hour
      await traveler.advanceTimeAndBlock(60*60);
      await tp.submitValue(TELLOR_MATIC_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(outputx.address);
      // 4. Stop the flow
      //await u.alice.flow({ flowRate: '0', recipient: u.app });
      let deltaAlice = await delta('alice', aliceBalances );
      console.log(deltaAlice);
      // 4. Distribute tokens
      await checkBalance(u.alice);
      await app.distribute('0x');
      await checkBalance(u.alice);
      // 5. Check balance for output and subsidy tokens
      let ricEmissionRate = 10000000000000;
      let expectAliceRicRewards = 60 * 60 * ricEmissionRate;
      let aliceAfterBalance = (await ric.balanceOf(u.alice.address)).toString();
      console.log(aliceAfterBalance);
      expect(parseInt(aliceAfterBalance)).to.within(aliceBeforeBalance + (expectAliceRicRewards * 0.999), aliceBeforeBalance + (expectAliceRicRewards * 1.06));

    });

    xit('should create a stream exchange with the correct parameters', async () => {
      const inflowRate = '77000000000000';
      const inflowRateIDAShares = '77000';

      console.log('Transfer alice');
      await usdcx.transfer(u.alice.address, toWad(400), { from: u.usdcspender.address });
      console.log('Transfer bob');
      await maticx.transfer(u.bob.address, toWad(1), { from: u.maticspender.address });
      console.log('Done');

      await approveSubscriptions([u.alice.address, u.bob.address]);

      await u.alice.flow({ flowRate: inflowRate, recipient: u.app });
      await u.bob.flow({ flowRate: inflowRate, recipient: u.app });
      // Expect the parameters are correct
      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);
      expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(`true,true,0,0`);
      expect(await app.getStreamRate(u.bob.address, maticx.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(1, u.bob.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);

    });

    xit('approval should be unlimited', async () => {
      await approveSubscriptions();
      expect(await output.allowance(app.address, SUSHISWAP_ROUTER_ADDRESS))
        .to.be.equal(ethers.constants.MaxUint256);
      expect(await usdc.allowance(app.address, SUSHISWAP_ROUTER_ADDRESS))
        .to.be.equal(ethers.constants.MaxUint256);
      expect(await output.allowance(app.address, maticx.address))
        .to.be.equal(ethers.constants.MaxUint256);
      expect(await usdc.allowance(app.address, usdcx.address))
        .to.be.equal(ethers.constants.MaxUint256);
    });

    it('should distribute tokens to streamers', async () => {
      await approveSubscriptions([u.alice.address, u.bob.address, u.carl.address, u.karen.address, u.admin.address]);

      console.log('Transfer alice');
      await usdcx.transfer(u.alice.address, toWad(400), { from: u.usdcspender.address });
      console.log('Transfer bob');
      await maticx.transfer(u.bob.address, toWad(300), { from: u.maticspender.address });
      console.log('Done');

      const inflowRateUsdc = '1000000000000000';
      const inflowRateMatic  = '1000000000000000';
      const inflowRateIDASharesUsdc = '1000000';
      const inflowRateIDASharesMatic = '10000';

      // 1. Initialize a stream exchange
      // 2. Create 2 streamers, one with 2x the rate of the other
      await u.alice.flow({ flowRate: inflowRateUsdc, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl')});
      await u.bob.flow({ flowRate: inflowRateMatic, recipient: u.app });
      await takeMeasurements();

      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal(inflowRateUsdc);
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,980000,0`);
      expect((await app.getIDAShares(1, u.admin.address)).toString()).to.equal(`true,true,18000,0`);
      expect((await app.getIDAShares(1, u.carl.address)).toString()).to.equal(`true,true,2000,0`);
      expect(await app.getStreamRate(u.bob.address, maticx.address)).to.equal(inflowRateMatic);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,980000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,20000,0`);
      // 3. Advance time 1 hour
      await traveler.advanceTimeAndBlock(3600);
      console.log("Fast forward")
      await checkBalance(u.alice)
      await checkBalance(u.bob)
      await tp.submitValue(TELLOR_MATIC_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await tp.submitValue(TELLOR_RIC_REQUEST_ID, 1000000);
      await app.updateTokenPrices();
      // 4. Trigger a distribution
      await app.distribute('0x');
      // 5. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      let deltaAlice = await delta('alice', aliceBalances);
      let deltaCarl = await delta('carl', carlBalances);
      let deltaKaren = await delta('karen', karenBalances);
      let deltaBob = await delta('bob', bobBalances);
      let deltaOwner = await delta('owner', ownerBalances);
      // verify
      console.log(deltaOwner)
      console.log(deltaCarl)
      console.log(deltaKaren)
      console.log(deltaAlice)
      console.log(deltaBob)
      // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
      expect(deltaBob.maticx * oraclePrice / 1e6 * -1 ).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
      expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.maticx * 0.98, deltaAlice.maticx * 1.06)

      // TODO: Check that there was a sushiswap event with Bobs ETH less alices USD gets Swapped

      // Flip, alice streams more USDC than Bob streams ETH
      expect((await app.getIDAShares(1, u.carl.address)).toString()).to.equal(`true,true,2000,0`);
      await u.alice.flow({ flowRate: (parseInt(inflowRateUsdc) * 10).toString(), recipient: u.app });
      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal('10000000000000000');
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,9800000,0`);
      expect((await app.getIDAShares(1, u.carl.address)).toString()).to.equal(`true,true,20000,0`);
      expect((await app.getIDAShares(1, u.admin.address)).toString()).to.equal(`true,true,180000,0`);
      expect(await app.getStreamRate(u.bob.address, maticx.address)).to.equal(inflowRateMatic);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,980000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,20000,0`);
      await takeMeasurements();
      await traveler.advanceTimeAndBlock(3600);
      await tp.submitValue(TELLOR_MATIC_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await tp.submitValue(TELLOR_RIC_REQUEST_ID, ricOraclePrice);
      await app.updateTokenPrices();
      // 4. Trigger a distribution
      await app.distribute('0x');
      // 5. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      deltaAlice = await delta('alice', aliceBalances);
      deltaCarl = await delta('carl', carlBalances);
      deltaKaren = await delta('karen', karenBalances);
      deltaBob = await delta('bob', bobBalances);
      deltaOwner = await delta('owner', ownerBalances);
      // verify
      console.log(deltaOwner)
      console.log(deltaCarl)
      console.log(deltaKaren)
      console.log(deltaAlice)
      console.log(deltaBob)
      // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
      expect(deltaBob.maticx * oraclePrice / 1e6 * -1 ).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
      expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.maticx * 0.98, deltaAlice.maticx * 1.06)

      console.log('Transfer karen');
      await usdcx.transfer(u.karen.address, toWad(400), { from: u.usdcspender.address });


      // Add another streamer, alice streams more USDC than Bob streams ETH
      await u.karen.flow({ flowRate: inflowRateUsdc, recipient: u.app });
      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal('10000000000000000');
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,9800000,0`);
      expect((await app.getIDAShares(1, u.carl.address)).toString()).to.equal(`true,true,20000,0`);
      expect(await app.getStreamRate(u.bob.address, maticx.address)).to.equal(inflowRateMatic);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,980000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,20000,0`);
      expect(await app.getStreamRate(u.karen.address, usdcx.address)).to.equal(inflowRateUsdc);
      expect((await app.getIDAShares(1, u.karen.address)).toString()).to.equal(`true,true,980000,0`);
      expect((await app.getIDAShares(1, u.admin.address)).toString()).to.equal(`true,true,200000,0`);


      await takeMeasurements();
      await traveler.advanceTimeAndBlock(3600);

      await tp.submitValue(TELLOR_MATIC_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await tp.submitValue(TELLOR_RIC_REQUEST_ID, ricOraclePrice);
      await app.updateTokenPrices();
      // 4. Trigger a distribution
      await app.distribute('0x');
      // 5. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      deltaAlice = await delta('alice', aliceBalances);
      deltaCarl = await delta('carl', carlBalances);
      deltaKaren = await delta('karen', karenBalances);
      deltaBob = await delta('bob', bobBalances);
      deltaOwner = await delta('owner', ownerBalances);
      // verify
      console.log(deltaOwner)
      console.log(deltaCarl)
      console.log(deltaKaren)
      console.log(deltaAlice)
      console.log(deltaBob)
      // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
      expect(deltaBob.maticx * oraclePrice / 1e6 * -1 ).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
      expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.maticx * 0.98, deltaAlice.maticx * 1.06)
      expect(deltaKaren.usdcx / oraclePrice * 1e6 * -1).to.within(deltaKaren.maticx * 0.98, deltaKaren.maticx * 1.06)

      let aliceBeforeBalance = parseInt(await usdcx.balanceOf(u.alice.address));
      console.log("before", aliceBeforeBalance.toString());
      // await traveler.advanceTimeAndBlock(30);
      await u.alice.flow({ flowRate: '0', recipient: u.app });
      let aliceAfterBalance = await usdcx.balanceOf(u.alice.address);
      // Need to also account for the four hour fee
      aliceAfterBalance = aliceAfterBalance - 4 * 60 * 60 * parseInt(inflowRateUsdc) * 10;
      expect(aliceBeforeBalance).to.within(aliceAfterBalance * 0.999, aliceAfterBalance * 1.001);
      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal(0);
      expect((await app.getIDAShares(1, u.alice.address)).toString()).to.equal(`true,true,0,0`);

      await takeMeasurements();
      await traveler.advanceTimeAndBlock(3600);

      await tp.submitValue(TELLOR_MATIC_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await tp.submitValue(TELLOR_RIC_REQUEST_ID, ricOraclePrice);
      await app.updateTokenPrices();
      // 4. Trigger a distributions
      await app.distribute('0x');
      // 5. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      deltaAlice = await delta('alice', aliceBalances);
      deltaCarl = await delta('carl', carlBalances);
      deltaKaren = await delta('karen', karenBalances);
      deltaBob = await delta('bob', bobBalances);
      deltaOwner = await delta('owner', ownerBalances);
      // verify
      console.log(deltaOwner)
      console.log(deltaCarl)
      console.log(deltaKaren)
      console.log(deltaAlice)
      console.log(deltaBob)
      // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
      expect(deltaBob.maticx * oraclePrice / 1e6 * -1 ).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
      expect(deltaAlice.usdcx).to.equal(0)
      expect(deltaAlice.maticx).to.equal(0)
      expect(deltaKaren.usdcx / oraclePrice * 1e6 * -1).to.within(deltaKaren.maticx * 0.98, deltaKaren.maticx * 1.06)

      // Add another streamer, alice streams more USDC than Bob streams ETH
      await u.karen.flow({ flowRate: '0', recipient: u.app });
      expect(await app.getStreamRate(u.karen.address, usdcx.address)).to.equal(0);
      expect((await app.getIDAShares(1, u.karen.address)).toString()).to.equal(`true,true,0,0`);

      await takeMeasurements();
      await traveler.advanceTimeAndBlock(3600);

      await tp.submitValue(TELLOR_MATIC_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await tp.submitValue(TELLOR_RIC_REQUEST_ID, ricOraclePrice);
      await app.updateTokenPrices();
      // 4. Trigger a distribution
      await app.distribute('0x');
      // 5. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      deltaAlice = await delta('alice', aliceBalances);
      deltaCarl = await delta('carl', carlBalances);
      deltaKaren = await delta('karen', karenBalances);
      deltaBob = await delta('bob', bobBalances);
      deltaOwner = await delta('owner', ownerBalances);
      // verify
      console.log(deltaOwner)
      console.log(deltaCarl)
      console.log(deltaKaren)
      console.log(deltaAlice)
      console.log(deltaBob)
      // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
      expect(deltaBob.maticx * oraclePrice / 1e6 * -1 ).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
      expect(deltaKaren.usdcx).to.equal(0)
      expect(deltaKaren.maticx).to.equal(0)

    });

  });
});
