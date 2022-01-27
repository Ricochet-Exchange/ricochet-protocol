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

describe('REXOneWayMarket', () => {
  const errorHandler = (err) => {
    if (err) throw err;
  };

  const names = ['Admin', 'Alice', 'Bob', 'Carl', 'Spender'];

  let sf;
  let dai;
  let daix;
  let ethx;
  let wbtc;
  let wbtcx;
  let usd;
  let usdcx;
  let ric;
  let usdc;
  let eth;
  let weth;
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
  let spender;
  const SF_RESOLVER = '0xE0cc76334405EE8b39213E620587d815967af39C';
  const RIC_TOKEN_ADDRESS = '0x263026E7e53DBFDce5ae55Ade22493f828922965';
  const SUSHISWAP_ROUTER_ADDRESS = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
  const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
  const TELLOR_ETH_REQUEST_ID = 77;
  const TELLOR_USDC_REQUEST_ID = 78;
  const COINGECKO_KEY = 'richochet';

  // random address from polygonscan that have a lot of usdcx
  const USDCX_SOURCE_ADDRESS = '0x81ea02098336435d5e92e032c029aab850304f5d';
  const WBTC_SOURCE_ADDRESS = '0x5c2ed810328349100A66B82b78a1791B101C9D61';
  const USDC_SOURCE_ADDRESS = '0x1a13f4ca1d028320a707d99520abfefca3998b7f';
  const OUTPUT_TOKEN_ADDRESS = '0xB63E38D21B31719e6dF314D3d2c351dF0D4a9162'; // IDLE


  const CARL_ADDRESS = '0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf';
  const BOB_ADDRESS = '0x00Ce20EC71942B41F50fF566287B811bbef46DC8';
  const ALICE_ADDRESS = '0x9f348cdD00dcD61EE7917695D2157ef6af2d7b9B';
  const OWNER_ADDRESS = '0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA';
  const REPORTER_ADDRESS = '0xeA74b2093280bD1E6ff887b8f2fE604892EBc89f';
  let oraclePrice;

  const appBalances = {
    outputx: [],
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const ownerBalances = {
    outputx: [],
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const carlBalances = {
    outputx: [],
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const aliceBalances = {
    outputx: [],
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };
  const bobBalances = {
    outputx: [],
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
  };

  async function approveSubscriptions(
    users = [u.alice.address, u.bob.address, u.admin.address],
    tokens = [ricAddress],
  ) {
    // Do approvals
    // Already approved?
    console.log('Approving subscriptions...');

    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
        let index = 0;
        // if (tokens[tokenIndex] === ricAddress) {
        //   index = 1;
        // }

        await web3tx(
          sf.host.callAgreement,
          `${users[userIndex]} approves subscription to the app ${tokens[tokenIndex]} ${index}`,
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

    const accountAddrs = [OWNER_ADDRESS, ALICE_ADDRESS, BOB_ADDRESS, CARL_ADDRESS, USDCX_SOURCE_ADDRESS];

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
    spender = await ethers.provider.getSigner(USDCX_SOURCE_ADDRESS);
    const accounts = [owner, alice, bob, carl, spender];

    // ==============
    // Init Superfluid Framework

    sf = new SuperfluidSDK.Framework({
      web3,
      resolverAddress: SF_RESOLVER,
      tokens: ['WBTC', 'DAI', 'USDC', 'ETH'],
      version: 'v1',
    });
    await sf.initialize();
    ethx = sf.tokens.ETHx;
    wbtcx = sf.tokens.WBTCx;
    daix = sf.tokens.DAIx;
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
    weth = await ERC20.attach(await ethx.getUnderlyingToken());
    wbtc = await ERC20.attach(await wbtcx.getUnderlyingToken());
    usdc = await ERC20.attach(await usdcx.getUnderlyingToken());
    ric = ric.connect(owner);

    // Attach alice to the SLP token
    outputx = ric;
    // output = await ERC20.attach(await outputx.getUnderlyingToken());


  });

  beforeEach(async () => {

    // Deploy REXReferral
    RexReferral = await ethers.getContractFactory("REXReferral", {
      signer: owner,
    });
    referral = await RexReferral.deploy();
    await referral.deployed();


    // ==============
    // Deploy REX Market

    const REXOneWayMarket = await ethers.getContractFactory('REXOneWayMarket', {
      signer: owner,
    });

    const registrationKey = await createSFRegistrationKey(sf, u.admin.address);

    console.log('Deploying REXOneWayMarket...');
    app = await REXOneWayMarket.deploy(
      u.admin.address,
      sf.host.address,
      sf.agreements.cfa.address,
      sf.agreements.ida.address,
      registrationKey,
      referral.address);

    console.log('Deployed REXOneWayMarket');

    await app.initializeOneWayMarket(
      SUSHISWAP_ROUTER_ADDRESS,
      TELLOR_ORACLE_ADDRESS,
      usdcx.address,
      30000,
      TELLOR_USDC_REQUEST_ID,
      outputx.address,
      20000,
      TELLOR_ETH_REQUEST_ID
    )

    // Add subsidy pool
    // await app.addOutputPool(RIC_TOKEN_ADDRESS, 0, 1000000000, 77);

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
    // Get actual price
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids='+COINGECKO_KEY+'&vs_currencies=usd');
    oraclePrice = parseInt(response.data[COINGECKO_KEY].usd * 1.01 * 1000000).toString();
    console.log('oraclePrice', oraclePrice);
    await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
    await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);

  });

  async function checkBalance(user) {
    console.log('Balance of ', user.alias);
    console.log('usdcx: ', (await usdcx.balanceOf(user.address)).toString());
    console.log('outputx: ', (await outputx.balanceOf(user.address)).toString());
  }

  async function delta(account, balances) {
    const len = balances.outputx.length;
    const changeInOutToken = balances.outputx[len - 1] - balances.outputx[len - 2];
    const changeInInToken = balances.usdcx[len - 1] - balances.usdcx[len - 2];
    console.log();
    console.log('Change in balances for ', account);
    console.log('Outputx:', changeInOutToken, 'Bal:', balances.outputx[len - 1]);
    console.log('Usdcx:', changeInInToken, 'Bal:', balances.usdcx[len - 1]);
    return {
      outputx: changeInOutToken,
      usdcx: changeInInToken,
    }
  }

  async function takeMeasurements() {

    appBalances.outputx.push((await outputx.balanceOf(app.address)).toString());
    ownerBalances.outputx.push((await outputx.balanceOf(u.admin.address)).toString());
    aliceBalances.outputx.push((await outputx.balanceOf(u.alice.address)).toString());
    bobBalances.outputx.push((await outputx.balanceOf(u.bob.address)).toString());
    carlBalances.outputx.push((await outputx.balanceOf(u.carl.address)).toString());

    appBalances.usdcx.push((await usdcx.balanceOf(app.address)).toString());
    ownerBalances.usdcx.push((await usdcx.balanceOf(u.admin.address)).toString());
    aliceBalances.usdcx.push((await usdcx.balanceOf(u.alice.address)).toString());
    bobBalances.usdcx.push((await usdcx.balanceOf(u.bob.address)).toString());
    carlBalances.usdcx.push((await usdcx.balanceOf(u.carl.address)).toString());

    appBalances.ric.push((await ric.balanceOf(app.address)).toString());
    ownerBalances.ric.push((await ric.balanceOf(u.admin.address)).toString());
    aliceBalances.ric.push((await ric.balanceOf(u.alice.address)).toString());
    bobBalances.ric.push((await ric.balanceOf(u.bob.address)).toString());
    carlBalances.ric.push((await ric.balanceOf(u.carl.address)).toString());
  }

  describe('Stream Exchange', async () => {
    xit('should be correctly configured', async () => {
      expect(await app.isAppJailed()).to.equal(false);
      expect(await app.getInputToken()).to.equal(usdcx.address);
      expect(await app.getOuputToken()).to.equal(outputx.address);
      expect(await app.getOuputIndexId()).to.equal(0);
      expect(await app.getSubsidyToken()).to.equal(ric.address);
      expect(await app.getSubsidyIndexId()).to.equal(1);
      expect(await app.getSubsidyRate()).to.equal('400000000000000000');
      expect(await app.getTotalInflow()).to.equal(0);
      expect(await app.getSushiRouter()).to.equal(SUSHISWAP_ROUTER_ADDRESS);
      expect(await app.getTellorOracle()).to.equal(TELLOR_ORACLE_ADDRESS);
      expect(await app.getRequestId()).to.equal(TELLOR_REQUEST_ID);
      expect(await app.getOwner()).to.equal(u.admin.address);
      expect(await app.getFeeRate()).to.equal(20000);
    });

    xit('should create a stream exchange with the correct parameters', async () => {
      const inflowRate = '77160493827160';
      const inflowRateIDAShares = '77160';

      await approveSubscriptions([u.admin.address]);

      await u.admin.flow({ flowRate: inflowRate, recipient: u.app });
      // Expect the parameters are correct
      expect(await app.getStreamRate(u.admin.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);
    });

    xit('approval should be unlimited', async () => {
      await approveSubscriptions();
      expect(await output.allowance(app.address, SUSHISWAP_ROUTER_ADDRESS))
        .to.be.equal(ethers.constants.MaxUint256);
      expect(await usdc.allowance(app.address, SUSHISWAP_ROUTER_ADDRESS))
        .to.be.equal(ethers.constants.MaxUint256);
      expect(await output.allowance(app.address, outputx.address))
        .to.be.equal(ethers.constants.MaxUint256);
      expect(await usdc.allowance(app.address, usdcx.address))
        .to.be.equal(ethers.constants.MaxUint256);
    });

    xit('should let keepers close streams with < 8 hours left', async () => {
      await approveSubscriptions([u.bob.address]);
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

    it('should distribute tokens to streamers', async () => {
      await approveSubscriptions([u.alice.address, u.bob.address]);

      console.log('Transfer alice');
      await usdcx.transfer(u.alice.address, toWad(400), { from: u.spender.address });
      console.log('Transfer bob');
      await usdcx.transfer(u.bob.address, toWad(400), { from: u.spender.address });
      console.log('Done');
      const inflowRate = '1000000000000000';
      const inflowRatex2 = '2000000000000000';
      const inflowRateIDAShares = '1000000';
      const inflowRateIDASharesx2 = '2000000';

      // Start Alices flow and confirm the IDA shares are done right: check owner and carl
      await u.alice.flow({ flowRate: inflowRate, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl')});
      await approveSubscriptions([u.admin.address, u.carl.address]);

      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(`true,true,980000,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,18000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,2000,0`);



      // Start Bobs flow and do the same check
      await u.bob.flow({ flowRate: inflowRatex2, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', '')});
      expect(await app.getStreamRate(u.bob.address, usdcx.address)).to.equal(inflowRatex2);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,1960000,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,58000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,2000,0`);

      // Advance time 1 hour
      await takeMeasurements();
      await traveler.advanceTimeAndBlock(3600);
      await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(outputx.address);
      // 4. Trigger a distribution
      await app.distribute('0x');
      // 4. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      let deltaAlice = await delta('alice', aliceBalances);
      let deltaBob = await delta('bob', bobBalances);
      let deltaOwner = await delta('owner', ownerBalances);
      let deltaCarl = await delta('carl', carlBalances);

      // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
      expect((deltaOwner.outputx + deltaCarl.outputx) / (deltaAlice.outputx + deltaBob.outputx + deltaOwner.outputx + deltaCarl.outputx)).to.within(0.01999, 0.020001)
      expect(deltaAlice.outputx * 2).to.be.within(deltaBob.outputx * 0.998, deltaBob.outputx * 1.008)
      expect(deltaBob.usdcx / oraclePrice * 1e6 * -1 ).to.within(deltaBob.outputx * 0.98, deltaBob.outputx * 1.05)
      expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.outputx * 0.98, deltaAlice.outputx * 1.05)
      //
      // Test increasing a flow rate
      await u.alice.flow({ flowRate: inflowRatex2, recipient: u.app });
      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal(inflowRatex2);
      expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(`true,true,1960000,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,76000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,4000,0`);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,1960000,0`);
      // 3. Advance time 1 hour
      await takeMeasurements();
      await traveler.advanceTimeAndBlock(3600);
      await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(outputx.address);
      // 4. Trigger a distribution
      await app.distribute('0x');
      // 4. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      deltaAlice = await delta('alice', aliceBalances);
      deltaBob = await delta('bob', bobBalances);
      deltaOwner = await delta('owner', ownerBalances);
      deltaCarl = await delta('carl', carlBalances);

      expect((deltaOwner.outputx + deltaCarl.outputx) / (deltaAlice.outputx + deltaBob.outputx + deltaOwner.outputx + deltaCarl.outputx)).to.within(0.01999, 0.020001)
      expect(deltaAlice.outputx).to.be.within(deltaBob.outputx * 0.9999, deltaBob.outputx * 1.0001)
      expect(deltaBob.usdcx / oraclePrice * 1e6 * -1 ).to.within(deltaBob.outputx * 0.98, deltaBob.outputx * 1.05)
      expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.outputx * 0.98, deltaAlice.outputx * 1.05)
      //
      //
      // Test decreasing a flow rate
      await u.bob.flow({ flowRate: inflowRate, recipient: u.app });

      expect(await app.getStreamRate(u.bob.address, usdcx.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(`true,true,1960000,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,56000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,4000,0`);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,980000,0`);


      // 3. Advance time 1 hour
      await takeMeasurements();
      await traveler.advanceTimeAndBlock(3600);
      await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(outputx.address);
      // 4. Trigger a distribution
      await app.distribute('0x');
      // 4. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      deltaAlice = await delta('alice', aliceBalances);
      deltaBob = await delta('bob', bobBalances);
      deltaOwner = await delta('owner', ownerBalances);
      deltaCarl = await delta('carl', carlBalances);

      expect((deltaOwner.outputx + deltaCarl.outputx) / (deltaAlice.outputx + deltaBob.outputx + deltaOwner.outputx + deltaCarl.outputx)).to.within(0.01999, 0.020001)
      expect(deltaBob.outputx * 2).to.be.within(deltaAlice.outputx * 0.9999, deltaAlice.outputx * 1.0001)
      expect(deltaBob.usdcx / oraclePrice * 1e6 * -1 ).to.within(deltaBob.outputx * 0.98, deltaBob.outputx * 1.05)
      expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.outputx * 0.98, deltaAlice.outputx * 1.05)
      //
      //
      // Test deleting a flow
      await u.alice.flow({ flowRate: '0', recipient: u.app });

      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal(0);
      expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,20000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,0,0`);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,980000,0`);


      // 3. Advance time 1 hour
      await takeMeasurements();
      await traveler.advanceTimeAndBlock(3600);
      await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(outputx.address);
      // 4. Trigger a distribution
      await app.distribute('0x');
      // 4. Verify streamer 1 streamed 1/2 streamer 2's amount and received 1/2 the output
      await takeMeasurements();

      deltaAlice = await delta('alice', aliceBalances);
      deltaBob = await delta('bob', bobBalances);
      deltaOwner = await delta('owner', ownerBalances);
      deltaCarl = await delta('carl', carlBalances);

      expect(deltaOwner.outputx / (deltaAlice.outputx + deltaBob.outputx + deltaOwner.outputx)).to.within(0.01999, 0.02001)
      expect(deltaAlice.usdcx).to.equal(0)
      expect(deltaAlice.outputx).to.equal(0)
      expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.outputx * 0.98, deltaAlice.outputx * 1.05)

      // Some light tests of the referral mechanism

      // Test reregistering alice with a different affiliate
      await u.alice.flow({ flowRate: inflowRate, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'karen') });

      expect(await app.getStreamRate(u.alice.address, usdcx.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(`true,true,980000,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,38000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,2000,0`);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,980000,0`);


      // Test reregistering bob with an affiliate,
      await u.bob.flow({ flowRate: '0', recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl')});

      await u.bob.flow({ flowRate: inflowRate, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') });
      expect(await app.getStreamRate(u.bob.address, usdcx.address)).to.equal(inflowRate);
      expect((await app.getIDAShares(0, u.alice.address)).toString()).to.equal(`true,true,980000,0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,38000,0`);
      expect((await app.getIDAShares(0, u.carl.address)).toString()).to.equal(`true,true,2000,0`);
      expect((await app.getIDAShares(0, u.bob.address)).toString()).to.equal(`true,true,980000,0`);



    });
   it("should check subsidy and output tokens distributions", async () => {
      // The token with feeRate != 0 is output token in this case that is ethx 
      // The token with emissionRate != 0 is subsisdy token in this case that ric tokens. 
      // 0. Approve subscriptions
      await approveSubscriptions([u.admin.address, u.bob.address]);

      // 1. Check balance for output and subsidy tokens and usdcx
      await takeMeasurements();
      await checkBalance(u.admin);

      // 2. Create a stream from an account to app to excahnge tokens
      const inflowRate = '77160493827160';
      await u.admin.flow({ flowRate: inflowRate, recipient: u.app });

      // 3. Increase time by 1 hour
      await traveler.advanceTimeAndBlock(3600);
      await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(outputx.address);

      let deltaOwner = await delta('owner', ownerBalances);
      console.log(deltaOwner);
      // 4. Distribute tokens 
      await app.distribute('0x');
      await checkBalance(u.admin);
      // 5. Check balance for output and subsidy tokens
      await takeMeasurements();


  });


    xit('getters and setters should work properly', async () => {
      await app.connect(owner).setFeeRate(30000);
      await app.connect(owner).setRateTolerance(30000);
      await app.connect(owner).setSubsidyRate('500000000000000000');
      await app.connect(owner).setOracle(OWNER_ADDRESS);
      await app.connect(owner).setRequestId(61);
      await app.connect(owner).transferOwnership(ALICE_ADDRESS);

      expect(await app.getSubsidyRate()).to.equal('500000000000000000');
      expect(await app.getFeeRate()).to.equal(30000);
      expect(await app.getRateTolerance()).to.equal(30000);
      expect(await app.getTellorOracle()).to.equal(OWNER_ADDRESS);
      expect(await app.getRequestId()).to.equal(61);
      expect(await app.getOwner()).to.equal(ALICE_ADDRESS);
    });

    xit('should correctly emergency drain', async () => {
      await approveSubscriptions([u.bob.address]);
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
      expect((await outputx.balanceOf(app.address)).toString()).to.equal('0');
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

    xit('should distribute tokens to streamers correctly', async () => {
      const inflowRate1 = '77160493827160'; // ~200 * 1e18 per month
      const inflowRate2 = '964506172839506'; // ~2500 per month
      const inflowRate3 = '38580246913580'; // ~100 per month
      const inflowRateIDAShares1 = '77160';
      const inflowRateIDAShares2 = '964506';
      const inflowRateIDAShares3 = '38580';

      await approveSubscriptions();

      console.log('Transfer bob');
      await usdcx.transfer(u.bob.address, toWad(400), { from: u.spender.address });
      console.log('Transfer alice');
      await usdcx.transfer(u.alice.address, toWad(400), { from: u.spender.address });
      console.log('Transfer admin');
      await usdcx.transfer(u.admin.address, toWad(400), { from: u.spender.address });
      console.log('Done');

      await takeMeasurements();

      // Test `closeStream`
      // Try close stream and expect revert
      await expect(
        u.admin.flow({ flowRate: toWad(10000), recipient: u.app }),
      ).to.be.revertedWith('!enoughTokens');

      await u.admin.flow({ flowRate: inflowRate1, recipient: u.app });
      // Expect the parameters are correct
      expect(await app.getStreamRate(u.admin.address)).to.equal(inflowRate1);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,${inflowRateIDAShares1},0`);
      await traveler.advanceTimeAndBlock(60 * 60 * 12);
      await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(ethx.address);
      await app.distribute();
      console.log('Distribution.');
      await traveler.advanceTimeAndBlock(60 * 60 * 1);
      await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(ethx.address);

      // Connect Admin and Bob
      await u.admin.flow({ flowRate: inflowRate2, recipient: u.app });
      // Expect the parameters are correct
      expect(await app.getStreamRate(u.admin.address)).to.equal(inflowRate2);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,${inflowRateIDAShares2},0`);
      expect((await app.getIDAShares(0, u.admin.address)).toString()).to.equal(`true,true,${inflowRateIDAShares2},0`);
      await traveler.advanceTimeAndBlock(60 * 60 * 2);
      await tp.submitValue(TELLOR_ETH_REQUEST_ID, oraclePrice);
      await tp.submitValue(TELLOR_USDC_REQUEST_ID, 1000000);
      await app.updateTokenPrice(usdcx.address);
      await app.updateTokenPrice(ethx.address);
      await app.distribute();
      console.log('Distribution.');

    });
  });
});
