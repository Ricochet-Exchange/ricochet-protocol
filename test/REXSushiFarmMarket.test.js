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

describe('REXSushiFarmMarket', () => {
  const errorHandler = (err) => {
    if (err) throw err;
  };

  const SF_RESOLVER = '0xE0cc76334405EE8b39213E620587d815967af39C';
  const RIC_TOKEN_ADDRESS = '0x263026E7e53DBFDce5ae55Ade22493f828922965';
  const SUSHISWAP_ROUTER_ADDRESS = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
  const SUSHISWAP_MINICHEF_ADDRESS = '0x0769fd68dFb93167989C6f7254cd0D766Fb2841F';
  const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
  const TELLOR_REQUEST_ID = 1;
  const RATE_TOLERANCE = 30000;
  const MINICHEF_POOL_ID = 1;
  const USDC_ETH_SLP_ADDRESS = "0x34965ba0ac2451A34a0471F04CCa3F990b8dea27";
  const ETH_ADDRESS = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";

  // random address from polygonscan that have a lot of usdcx
  const USDCX_SOURCE_ADDRESS = '0x81Ea02098336435d5e92e032C029AAB850304f5D';
  const USDC_SOURCE_ADDRESS = '0x1a13f4ca1d028320a707d99520abfefca3998b7f';
  const MATICX_ADDRESS = '0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3';
  const SUSHIX_ADDRESS = '0xDaB943C03f9e84795DC7BF51DdC71DaF0033382b';

  const CARL_ADDRESS = '0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf';
  const BOB_ADDRESS = '0x00Ce20EC71942B41F50fF566287B811bbef46DC8';
  const ALICE_ADDRESS = '0x9f348cdD00dcD61EE7917695D2157ef6af2d7b9B';
  const OWNER_ADDRESS = '0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA';


  const names = ['Admin', 'Alice', 'Bob', 'Carl', 'Spender'];

  let sf;     // Superfluid SDK object
  let slp;
  let slpx;
  let sushix;
  let maticx;
  let ethx;
  let eth;
  let usdcx;
  let usdc;
  let ric;
  let app;
  let tp; // Tellor playground
  const u = {}; // object with all users
  const aliases = {};
  let owner;
  let alice;
  let bob;
  let carl;
  let spender;
  let oraclePrice;

  // TODO: Better way to store this
  const appBalances = {
    sushix: [],
    maticx: [],
    slpx: [],
    slp: [],
    usdcx: [],
    ric: [],
  };
  const ownerBalances = {
    sushix: [],
    maticx: [],
    slpx: [],
    slp: [],
    usdcx: [],
    ric: [],
  };
  const aliceBalances = {
    sushix: [],
    maticx: [],
    slpx: [],
    slp: [],
    usdcx: [],
    ric: [],
  };
  const bobBalances = {
    sushix: [],
    maticx: [],
    slpx: [],
    slp: [],
    usdcx: [],
    ric: [],
  };

  async function approveSubscriptions(
    users = [u.admin.address, u.alice.address, u.bob.address],
    tokens = [slpx.address, sushix.address, maticx.address],
  ) {
    // Do approvals
    // Already approved?
    console.log('Approving subscriptions...');

    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      for (let userIndex = 0; userIndex < users.length; userIndex += 1) {

        await web3tx(
          sf.host.callAgreement,
          `${users[userIndex]} approves subscription to the app ${app.address}, token ${tokens[tokenIndex]}, index ${tokenIndex}`,
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
        console.log('Approved.');
      }
    }
    console.log('Approved.');
  }

  before(async () => {
    // ==============
    // impersonate accounts and set balances

    const accountAddrs = [OWNER_ADDRESS, ALICE_ADDRESS, BOB_ADDRESS, CARL_ADDRESS, USDCX_SOURCE_ADDRESS];

    accountAddrs.forEach(async (account) => {
      await impersonateAndSetBalance(account);
    });

    // ==============
    // get signers
    owner = await ethers.provider.getSigner(OWNER_ADDRESS);
    alice = await ethers.provider.getSigner(ALICE_ADDRESS);
    bob = await ethers.provider.getSigner(BOB_ADDRESS);
    carl = await ethers.provider.getSigner(CARL_ADDRESS);
    spender = await ethers.provider.getSigner(USDCX_SOURCE_ADDRESS);
    const accounts = [owner, alice, bob, carl, spender];

    // ==============
    // Init Superfluid Framework

    sf = new SuperfluidSDK.Framework({
      web3,
      resolverAddress: SF_RESOLVER,
      tokens: ['USDC', 'ETH'],
      version: 'v1',
    });
    await sf.initialize();
    ethx = sf.tokens.ETHx;
    usdcx = sf.tokens.USDCx;

    // ==============
    // Init SF users

    for (let i = 0; i < names.length; i += 1) {
      u[names[i].toLowerCase()] = sf.user({
        address: accounts[i]._address || accounts[i].address,
        token: usdcx.address,
      });
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
    eth = await ERC20.attach(await ethx.getUnderlyingToken());
    usdc = await ERC20.attach(await usdcx.getUnderlyingToken());
    ric = ric.connect(owner);

    const RT = await ethers.getContractFactory("RicochetToken");
    sushix = await RT.attach(SUSHIX_ADDRESS);
    maticx = await RT.attach(MATICX_ADDRESS);
    sushix = sushix.connect(owner)
    maticx = maticx.connect(owner)

  });

  beforeEach(async () => {
    // ==============
    // Deploy Stream Exchange
    owner = await ethers.provider.getSigner(OWNER_ADDRESS);
    const REXSushiFarmMarket = await ethers.getContractFactory('REXSushiFarmMarket', {signer: owner});

    console.log(u.admin.address);
    const registrationKey = await createSFRegistrationKey(sf, u.admin.address);

    console.log('Deploying REXSushiFarmMarket...');

    ERC20 = await ethers.getContractFactory('ERC20');
    slp = await ERC20.attach(USDC_ETH_SLP_ADDRESS);

    console.log(owner.address,
    slp.address,
    ETH_ADDRESS,
    MINICHEF_POOL_ID,
    sf.host.address,
    sf.agreements.cfa.address,
    sf.agreements.ida.address,
    registrationKey)

    app = await REXSushiFarmMarket.deploy(
      OWNER_ADDRESS,
      slp.address,
      sf.host.address,
      sf.agreements.cfa.address,
      sf.agreements.ida.address,
      registrationKey);

    await app.initializeMarket(usdcx.address, RATE_TOLERANCE, TELLOR_ORACLE_ADDRESS, 78);
    await app.initializeSushiFarmMarket(ETH_ADDRESS, 1, MINICHEF_POOL_ID);
    console.log("Deployed REXSushiFarmMarket")

    rexTokenAddress = await app.getRexTokenAddress();
    const RT = await ethers.getContractFactory("RicochetToken");
    slpx = await RT.attach(rexTokenAddress);
    slpx = slpx.connect(owner)

    console.log("SLPX addr", slpx.address)
    console.log("SLPX addr", sushix.address)

    u.app = sf.user({
      address: app.address,
      token: slpx.address,
    });
    u.app.alias = 'App';

    await approveSubscriptions();

    // ==============
    // Get actual price
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    oraclePrice = parseInt(response.data['ethereum'].usd * 1.02 * 1000000).toString();
    console.log('oraclePrice', oraclePrice);
    await tp.submitValue(1, oraclePrice);
    await tp.submitValue(78, oraclePrice);
  });

  async function checkBalance(user) {
    console.log('Balance of ', user.alias);
    console.log('usdcx: ', (await usdcx.balanceOf(user.address)).toString());
    console.log('slpx: ', (await slpx.balanceOf(user.address)).toString());
  }

  async function checkBalances(accounts) {
    for (let i = 0; i < accounts.length; i += 1) {
      await checkBalance(accounts[i]);
    }
  }

  async function upgrade(accounts) {
    for (let i = 0; i < accounts.length; ++i) {
      await web3tx(
        usdcx.upgrade,
        `${accounts[i].alias} upgrades many USDCx`,
      )(toWad(100000000), {
        from: accounts[i].address,
      });
      await web3tx(
        daix.upgrade,
        `${accounts[i].alias} upgrades many DAIx`,
      )(toWad(100000000), {
        from: accounts[i].address,
      });

      await checkBalance(accounts[i]);
    }
  }

  async function logUsers() {
    let string = 'user\t\ttokens\t\tnetflow\n';
    let p = 0;
    for (const [, user] of Object.entries(u)) {
      if (await hasFlows(user)) {
        p++;
        string += `${user.alias}\t\t${wad4human(
          await usdcx.balanceOf(user.address),
        )}\t\t${wad4human((await user.details()).cfa.netFlow)}
            `;
      }
    }
    if (p == 0) return console.warn('no users with flows');
    console.log('User logs:');
    console.log(string);
  }

  async function hasFlows(user) {
    const {
      inFlows,
      outFlows,
    } = (await user.details()).cfa.flows;
    return inFlows.length + outFlows.length > 0;
  }

  async function appStatus() {
    const isApp = await sf.host.isApp(u.app.address);
    const isJailed = await sf.host.isAppJailed(app.address);
    !isApp && console.error('App is not an App');
    isJailed && console.error('app is Jailed');
    await checkBalance(u.app);
    await checkOwner();
  }

  async function checkOwner() {
    const owner = await u.admin.address;
    console.log('Contract Owner: ', aliases[owner], ' = ', owner);
    return owner.toString();
  }

  async function subscribe(user) {
    // Alice approves a subscription to the app
    console.log(sf.host.callAgreement);
    console.log(sf.agreements.ida.address);
    console.log(usdcx.address);
    console.log(app.address);
    await web3tx(
      sf.host.callAgreement,
      'user approves subscription to the app',
    )(
      sf.agreements.ida.address,
      sf.agreements.ida.contract.methods
        .approveSubscription(slpx.address, app.address, 0, '0x')
        .encodeABI(),
      '0x', // user data
      {
        from: user,
      },
    );
  }

  async function delta(account, balances) {
    const len = balances.maticx.length;
    const changeInMaticxToken = balances.maticx[len - 1] - balances.maticx[len - 2];
    const changeInSushixToken = balances.sushix[len - 1] - balances.sushix[len - 2];
    const changeInSlpxToken = balances.slpx[len - 1] - balances.slpx[len - 2];
    const changeInSlpToken = balances.slp[len - 1] - balances.slp[len - 2];
    const changeInInToken = balances.usdcx[len - 1] - balances.usdcx[len - 2];
    console.log();
    console.log('Change in balances for ', account);
    console.log('Maticx:', changeInMaticxToken, 'Bal:', balances.maticx[len - 1]);
    console.log('Sushix:', changeInSushixToken, 'Bal:', balances.sushix[len - 1]);
    console.log('Slpx:', changeInSlpxToken, 'Bal:', balances.slpx[len - 1]);
    console.log('Slp:', changeInSlpToken, 'Bal:', balances.slp[len - 1]);
    console.log('Usdcx:', changeInInToken, 'Bal:', balances.usdcx[len - 1]);
    return {
      maticx: changeInMaticxToken,
      sushix: changeInSushixToken,
      slpx: changeInSlpxToken,
      usdcx: changeInInToken,
      slp: changeInSlpToken
    }
  }

  async function takeMeasurements() {
    appBalances.sushix.push((await sushix.balanceOf(app.address)).toString());
    ownerBalances.sushix.push((await sushix.balanceOf(u.admin.address)).toString());
    aliceBalances.sushix.push((await sushix.balanceOf(u.alice.address)).toString());
    bobBalances.sushix.push((await sushix.balanceOf(u.bob.address)).toString());

    appBalances.maticx.push((await maticx.balanceOf(app.address)).toString());
    ownerBalances.maticx.push((await maticx.balanceOf(u.admin.address)).toString());
    aliceBalances.maticx.push((await maticx.balanceOf(u.alice.address)).toString());
    bobBalances.maticx.push((await maticx.balanceOf(u.bob.address)).toString());

    appBalances.slpx.push((await slpx.balanceOf(app.address)).toString());
    ownerBalances.slpx.push((await slpx.balanceOf(u.admin.address)).toString());
    aliceBalances.slpx.push((await slpx.balanceOf(u.alice.address)).toString());
    bobBalances.slpx.push((await slpx.balanceOf(u.bob.address)).toString());

    appBalances.slp.push((await slp.balanceOf(app.address)).toString());
    ownerBalances.slp.push((await slp.balanceOf(u.admin.address)).toString());
    aliceBalances.slp.push((await slp.balanceOf(u.alice.address)).toString());
    bobBalances.slp.push((await slp.balanceOf(u.bob.address)).toString());

    appBalances.usdcx.push((await usdcx.balanceOf(app.address)).toString());
    ownerBalances.usdcx.push((await usdcx.balanceOf(u.admin.address)).toString());
    aliceBalances.usdcx.push((await usdcx.balanceOf(u.alice.address)).toString());
    bobBalances.usdcx.push((await usdcx.balanceOf(u.bob.address)).toString());

    appBalances.ric.push((await ric.balanceOf(app.address)).toString());
    ownerBalances.ric.push((await ric.balanceOf(u.admin.address)).toString());
    aliceBalances.ric.push((await ric.balanceOf(u.alice.address)).toString());
    bobBalances.ric.push((await ric.balanceOf(u.bob.address)).toString());
  }

  describe('REXSushiFarmMarket', async () => {
    it('should be correctly configured', async () => {
      expect(await app.isAppJailed()).to.equal(false);
      expect(await app.getInputToken()).to.equal(usdcx.address);
      expect(await app.getOuputPool(0)).to.equal(`${slpx.address},20000,0`);
      expect(await app.getOuputPool(1)).to.equal(`${sushix.address},200000,0`);
      expect(await app.getOuputPool(2)).to.equal(`${maticx.address},200000,0`);

      // TODO: Verify these work
      // expect(await app.getOracleInfo(ETH_ADDRESS)).to.equal(`1,${oraclePrice},0`);
      // expect(await app.getOracleInfo(usdcx.address)).to.equal(`78,${},0`);
      // expect(await app.getOracleInfo(matix.address)).to.equal(`6,20000,0`);
      // expect(await app.getOracleInfo(sushix.address)).to.equal(`80,20000,0`);

      expect(await app.getOwner()).to.equal(u.admin.address);
      expect(await app.getTotalInflow()).to.equal(0);
      expect(await app.getRouter()).to.equal(SUSHISWAP_ROUTER_ADDRESS);
      expect(await app.getOracle()).to.equal(TELLOR_ORACLE_ADDRESS);

    });

    xit('should create a stream exchange with the correct parameters', async () => {
      const inflowRate = '77160493827160';
      const inflowRateIDAShares = '77160';

      // await approveSubscriptions([u.admin.address]);

      await u.admin.flow({ flowRate: inflowRate, recipient: u.app });
      // Expect the parameters are correct
      expect(await app.getStreamRate(u.admin.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);
    });

    xit('approval should be unlimited', async () => {
      expect(await usdc.allowance(app.address, SUSHISWAP_ROUTER_ADDRESS))
        .to.be.equal(ethers.constants.MaxUint256);
      expect(await weth.allowance(app.address, SUSHISWAP_ROUTER_ADDRESS))
        .to.be.equal(ethers.constants.MaxUint256);
      expect(await slp.allowance(app.address, slpx.address))
        .to.be.equal(ethers.constants.MaxUint256);
    });

    xit('should let keepers close streams with < 8 hours left', async () => {
      // await approveSubscriptions([u.bob.address]);
      // 1. Initialize a stream exchange
      const bobUsdcxBalance = await usdcx.balanceOf(u.bob.address);
      // When user create stream, SF locks 4 hour deposit called initial deposit
      const initialDeposit = bobUsdcxBalance.div(new BN('13')).mul(new BN('4'));
      const inflowRate = bobUsdcxBalance.sub(initialDeposit).div(new BN(9 * 3600)).toString();
      // 2. Initialize a streamer with 9 hours of balance
      await u.bob.flow({ flowRate: inflowRate, recipient: u.app });
      expect(await app.getStreamRate(u.bob.address)).to.equal(inflowRate);
      // 3. Verfiy closing attempts revert
      await expect(app.closeStream(u.bob.address)).to.revertedWith('!closable');
      // 4. Advance time 1 hour
      await traveler.advanceTimeAndBlock(3600);
      // 5. Verify closing the stream works
      await app.closeStream(u.bob.address);
      expect(await app.getStreamRate(u.bob.address)).to.equal('0');
    });

    xit('should distribute tokens to streamers', async () => {
      // await approveSubscriptions([u.alice.address, u.bob.address]);

      console.log('Transfer alice');
      await usdcx.transfer(u.alice.address, toWad(4000), { from: u.spender.address });
      console.log('Transfer bob');
      await usdcx.transfer(u.bob.address, toWad(4000), { from: u.spender.address });
      console.log('Done');

      // await takeMeasurements();

      const inflowRate = '10000000000000000';
      const inflowRatex2 = '20000000000000000';
      const inflowRateIDAShares = '10000000';
      const inflowRateIDASharesx2 = '20000000';
      await takeMeasurements();

      await u.alice.flow({ flowRate: inflowRate, recipient: u.app });
      await u.bob.flow({ flowRate: inflowRatex2, recipient: u.app });

      console.log("Check flows")
      expect(await app.getStreamRate(u.alice.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);
      expect(await app.getStreamRate(u.bob.address)).to.equal(inflowRatex2);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,${inflowRateIDASharesx2},0`);

      await traveler.advanceTimeAndBlock(3600*6);
      await tp.submitValue(1, oraclePrice);
      await tp.submitValue(78, 1000000);
      await app.updateTokenPrice(ETH_ADDRESS);
      await app.updateTokenPrice(usdcx.address);
      // await tp.submitValue(60, oraclePrice);
      console.log("Distribute")

      let tx = await app.harvest("0x");
      let receipt = await tx.wait();

      tx = await app.distribute("0x");
      receipt = await tx.wait();

      await checkBalances([u.alice, u.bob]);
      await takeMeasurements();

      await traveler.advanceTimeAndBlock(3600);
      await tp.submitValue(1, oraclePrice);
      await tp.submitValue(78, 1000000);
      await app.updateTokenPrice(ETH_ADDRESS);
      await app.updateTokenPrice(usdcx.address);
      console.log("Distribute")

      tx = await app.harvest("0x");
      receipt = await tx.wait();

      tx = await app.distribute("0x");
      receipt = await tx.wait();

      await checkBalances([u.alice, u.bob]);
      await takeMeasurements();

      let deltaAlice = await delta('alice', aliceBalances);
      let deltaBob = await delta('bob', bobBalances);
      let deltaOwner = await delta('owner', ownerBalances);

      // verify
      console.log(deltaOwner)
      console.log(deltaAlice)
      console.log(deltaBob)

      // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
      expect(deltaOwner.sushix / (deltaAlice.sushix + deltaBob.sushix + deltaOwner.sushix)).to.be.within(0.2,0.200001)
      expect(deltaOwner.maticx / (deltaAlice.maticx + deltaBob.maticx + deltaOwner.maticx)).to.be.within(0.2,0.200001)
      expect(deltaOwner.slpx / (deltaAlice.slpx + deltaBob.slpx + deltaOwner.slpx)).to.within(0.02, 0.020001)
      expect(deltaAlice.sushix * 2).to.be.within(deltaBob.sushix * 0.999, deltaBob.sushix * 1.001)
      expect(deltaAlice.maticx * 2).to.be.within(deltaBob.maticx * 0.999, deltaBob.maticx * 1.001)
      // expect(deltaAlice.slpx * 2).to.equal(deltaBob.slpx)


      // Test closure, burns tokens returns SLP
      let totalSupply = await slpx.totalSupply()
      await u.alice.flow({ flowRate: "0", recipient: u.app });
      await takeMeasurements();
      deltaAlice = await delta('alice', aliceBalances);
      deltaBob = await delta('bob', bobBalances);
      deltaOwner = await delta('owner', ownerBalances);

      expect(deltaAlice.slpx).to.equal(deltaAlice.slp * -1);
      expect(totalSupply - parseInt(await slpx.totalSupply())).to.equal(deltaAlice.slp)

    });

    xit('getters and setters should work properly', async () => {
      await app.connect(owner).setFeeRate(30000);
      await app.connect(owner).setHarvestFeeRate(30000);
      await app.connect(owner).setRateTolerance(30000);
      await app.connect(owner).setSubsidyRate('500000000000000000');
      await app.connect(owner).setOracle(OWNER_ADDRESS);
      await app.connect(owner).setRequestId(61);
      await app.connect(owner).transferOwnership(ALICE_ADDRESS);

      expect(await app.getSubsidyRate()).to.equal('500000000000000000');
      expect(await app.getFeeRate()).to.equal(30000);
      expect(await app.getHarvestFeeRate()).to.equal(100000);
      expect(await app.getRateTolerance()).to.equal(30000);
      expect(await app.getTellorOracle()).to.equal(OWNER_ADDRESS);
      expect(await app.getRequestId()).to.equal(61);
      expect(await app.getOwner()).to.equal(ALICE_ADDRESS);
    });

    xit('should correctly emergency drain', async () => {
      // await approveSubscriptions([u.bob.address]);
      const inflowRate = '77160493827160';
      await u.bob.flow({ flowRate: inflowRate, recipient: u.app });
      await traveler.advanceTimeAndBlock(60 * 60 * 12);
      expect((await usdcx.balanceOf(app.address)).toString()).to.not.equal('0');
      await expect(
        app.emergencyDrain(),
      ).to.be.revertedWith('!zeroStreamers');
      await u.bob.flow({ flowRate: '0', recipient: u.app });
      await app.emergencyDrain();
      expect((await usdcx.balanceOf(app.address)).toString()).to.equal('0');
      expect((await wbtcx.balanceOf(app.address)).toString()).to.equal('0');
    });

    xit('should emergency close stream if app jailed', async () => {
      const inflowRate = '100000000'; // ~200 * 1e18 per month
      await u.admin.flow({ flowRate: inflowRate, recipient: u.app });
      expect(await app.getStreamRate(u.admin.address)).to.equal(inflowRate);
      await expect(
        app.emergencyCloseStream(u.admin.address),
      ).to.be.revertedWith('!jailed');

      await impersonateAndSetBalance(sf.agreements.cfa.address);
      await web3tx(
        sf.host.jailApp,
        'CFA jails App',
      )(
        '0x',
        app.address,
        0,
        {
          from: sf.agreements.cfa.address,
        },
      );

      expect(await sf.host.isAppJailed(app.address)).to.equal(true);

      await app.emergencyCloseStream(u.admin.address);

      expect(await app.getStreamRate(u.admin.address)).to.equal('0');
    });

  });
});
