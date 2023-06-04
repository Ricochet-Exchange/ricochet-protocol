import { waffle, ethers } from 'hardhat'
import { setup, IUser, ISuperToken } from '../misc/setup'
import { common } from '../misc/common'
import { expect } from 'chai'
import { Framework, SuperToken } from '@superfluid-finance/sdk-core'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { REXUniswapV3Market, REXReferral__factory } from '../typechain'
import { increaseTime, impersonateAndSetBalance } from '../misc/helpers'
import { Constants } from '../misc/Constants'
import { HttpService } from '../misc/HttpService'

const { provider } = waffle
const TEST_TRAVEL_TIME = 3600 * 2 // 2 hours
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const config = Constants['polygon']

export interface superTokenIDAIndex {
  token: SuperToken
  IDAIndex: number
}

describe('REXUniswapV3Market', () => {
  const errorHandler = (err: any) => {
    if (err) throw err
  }

  const overrides = { gasLimit: '10000000' } // Using this to manually limit gas to avoid giga-errors.
  const inflowRateUsdc = '1000000000000000'
  const inflowRateUsdc10x = '10000000000000000'
  const inflowRateEth = '10000000000000'

  let rexReferral: REXReferral__factory
  let REXMarketFactory: any
  let referral: any
  let snapshot: any

  let adminSigner: SignerWithAddress
  let aliceSigner: SignerWithAddress
  let bobSigner: SignerWithAddress
  let usdcxWhaleSigner: SignerWithAddress
  let maticxWhaleSigner: SignerWithAddress
  let ricWhaleSigner: SignerWithAddress

  let oraclePrice: number
  let maticOraclePrice: number

  let appBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] }
  let aliceBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] }
  let bobBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] }

  let sf: Framework,
    superT: ISuperToken,
    u: { [key: string]: IUser },
    market: REXUniswapV3Market,
    tokenss: { [key: string]: any },
    sfRegistrationKey: any,
    accountss: SignerWithAddress[],
    constant: { [key: string]: string },
    ERC20: any

  // ************** All the supertokens used in Ricochet are declared **********************
  let ricochetMATICx: SuperToken
  let ricochetUSDCx: SuperToken
  let ricochetETHx: SuperToken
  let ricochetRIC: SuperToken
  let ricochetRexSHIRT: SuperToken

  let usdcxIDAIndex: superTokenIDAIndex
  let ethxIDAIndex: superTokenIDAIndex
  let ricIDAIndex: superTokenIDAIndex
  let rexshirtIDAIndex: superTokenIDAIndex
  let maticxIDAIndex: superTokenIDAIndex

  // ***************************************************************************************

  let gelatoBlock: any
  let intializeMarketBlock: any

  async function takeMeasurements(): Promise<void> {
    // TODO: Refactor this to use a loop
    appBalances.ethx.push(
      (await superT.ethx.balanceOf({ account: market.address, providerOrSigner: provider })).toString()
    )
    aliceBalances.ethx.push(
      (await superT.ethx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString()
    )
    bobBalances.ethx.push(
      (await superT.ethx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString()
    )

    appBalances.usdcx.push(
      (await superT.usdcx.balanceOf({ account: market.address, providerOrSigner: provider })).toString()
    )
    aliceBalances.usdcx.push(
      (await superT.usdcx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString()
    )
    bobBalances.usdcx.push(
      (await superT.usdcx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString()
    )

    appBalances.ric.push(
      (await superT.ric.balanceOf({ account: market.address, providerOrSigner: provider })).toString()
    )
    aliceBalances.ric.push(
      (await superT.ric.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString()
    )
    bobBalances.ric.push(
      (await superT.ric.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString()
    )

    appBalances.rexshirt.push(
      (await superT.rexshirt.balanceOf({ account: market.address, providerOrSigner: provider })).toString()
    )
    aliceBalances.rexshirt.push(
      (await superT.rexshirt.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString()
    )
    bobBalances.rexshirt.push(
      (await superT.rexshirt.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString()
    )

    appBalances.maticx.push(
      (await superT.maticx.balanceOf({ account: market.address, providerOrSigner: provider })).toString()
    )
    aliceBalances.maticx.push(
      (await superT.maticx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString()
    )
    bobBalances.maticx.push(
      (await superT.maticx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString()
    )
  }

  async function resetMeasurements(): Promise<void> {
    appBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] }
    aliceBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] }
    bobBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] }
  }

  async function approveSubscriptions(tokensAndIDAIndexes: superTokenIDAIndex[], signers: SignerWithAddress[]) {
    let tokenIndex: number
    for (let i = 0; i < signers.length; i++) {
      for (let j = 0; j < tokensAndIDAIndexes.length; j++) {
        tokenIndex = tokensAndIDAIndexes[j].IDAIndex
        await sf.idaV1
          .approveSubscription({
            indexId: tokenIndex.toString(),
            superToken: tokensAndIDAIndexes[j].token.address,
            publisher: market.address,
            userData: '0x',
          })
          .exec(signers[i])
      }
    }
  }

  async function delta(account: SignerWithAddress, balances: any) {
    const len = balances.ethx.length
    return {
      ethx: balances.ethx[len - 1] - balances.ethx[len - 2],
      usdcx: balances.usdcx[len - 1] - balances.usdcx[len - 2],
      ric: balances.ric[len - 1] - balances.ric[len - 2],
      maticx: balances.maticx[len - 1] - balances.maticx[len - 2],
      rexshirt: balances.rexshirt[len - 1] - balances.rexshirt[len - 2],
    }
  }

  before(async () => {
    const { superfluid, users, accounts, tokens, superTokens, constants } = await setup()

    const { createSFRegistrationKey } = await common()

    u = users
    sf = superfluid
    superT = superTokens
    tokenss = tokens
    accountss = accounts
    sfRegistrationKey = createSFRegistrationKey
    constant = constants

    // This order is established in misc/setup.ts
    adminSigner = accountss[0]
    aliceSigner = accountss[1]
    bobSigner = accountss[2]
    usdcxWhaleSigner = accountss[5]
    maticxWhaleSigner = accountss[7]
    ricWhaleSigner = accountss[10]

    ricochetMATICx = superT.maticx
    ricochetUSDCx = superT.usdcx
    ricochetETHx = superT.ethx
    ricochetRIC = superT.ric
    ricochetRexSHIRT = superT.rexshirt

    ethxIDAIndex = {
      token: ricochetETHx,
      IDAIndex: 0,
    }

    // Impersonate Superfluid Governance and make a registration key
    const registrationKey = await sfRegistrationKey(sf, adminSigner.address)

    // Deploy REX Market
    REXMarketFactory = await ethers.getContractFactory('REXUniswapV3Market', adminSigner)

    // Deploy the REXUniswapV3Market
    market = await REXMarketFactory.deploy(
      config.HOST_SUPERFLUID_ADDRESS,
      config.CFA_SUPERFLUID_ADDRESS,
      config.IDA_SUPERFLUID_ADDRESS,
      registrationKey,
      config.GELATO_OPS,
      adminSigner.address
    )
    console.log('REXUniswapV3Market deployed to:', market.address)

    // Initialize MATIC
    await market.initializeMATIC(config.WMATIC_ADDRESS, config.MATICX_ADDRESS)
    console.log('MATIC initialized')

    // Create the task for Gelato
    await market.createTask()
    gelatoBlock = await ethers.provider.getBlock('latest')
    console.log('Gelato task created')

    // Initialize the market
    await market.initializeMarket(
      ricochetUSDCx.address,
      ricochetETHx.address
    )
    console.log('Market initialized')

    // Save this block number for expectations below
    intializeMarketBlock = await ethers.provider.getBlock('latest')

    await market.initializeUniswap(
      config.UNISWAP_V3_ROUTER_ADDRESS,
      config.UNISWAP_V3_FACTORY_ADDRESS,
      [config.USDC_ADDRESS, config.DAI_ADDRESS, config.ETH_ADDRESS],
      [100, 3000]
    )
    console.log('Uniswap initialized')

    // Initialize Price Feed
    await market.initializePriceFeed(config.CHAINLINK_ETH_USDC_PRICE_FEED, false)
    console.log('Price feed initialized')

    // Give Alice, Bob, Karen some tokens
    const initialAmount = ethers.utils.parseUnits('1000', 18).toString()

    // USDCx for Alice
    await ricochetUSDCx
      .transfer({
        receiver: aliceSigner.address,
        amount: initialAmount,
      })
      .exec(usdcxWhaleSigner)
    console.log('Alice USDCx transfer')

    // USDCx for Bob
    await ricochetUSDCx
      .transfer({
        receiver: bobSigner.address,
        amount: initialAmount,
      })
      .exec(usdcxWhaleSigner)
    console.log('Bob USDCx transfer')

    // MATICx for Alice
    await ricochetMATICx
      .transfer({
        receiver: aliceSigner.address,
        amount: '10000000000000000000',
      })
      .exec(maticxWhaleSigner)
    console.log('Alice MATICx transfer')

    // MATICx for Bob
    await ricochetMATICx
      .transfer({
        receiver: bobSigner.address,
        amount: '10000000000000000000',
      })
      .exec(maticxWhaleSigner)
    console.log('Bob MATICx transfer')

    // Do all the approvals
    await approveSubscriptions([ethxIDAIndex], [adminSigner, aliceSigner, bobSigner]) // karenSigner

    // Take a snapshot to avoid redoing the setup, this saves some time later in the testing scripts
    snapshot = await provider.send('evm_snapshot', [])
  })

  context('#1 - new rexmarket with no streamers', async () => {
    beforeEach(async () => {
      // Revert to the point REXMarket was just deployed
      const success = await provider.send('evm_revert', [snapshot])
      // Take another snapshot to be able to revert again next time
      snapshot = await provider.send('evm_snapshot', [])
      expect(success).to.equal(true)
    })

    afterEach(async () => {
      // Check the app isn't jailed
      // expect(await market.isAppJailed()).to.equal(false);
      await resetMeasurements()
    })

    after(async () => {})

    it('#1.1 contract variables were set correctly', async () => {
      expect(await market.lastDistributedAt()).to.equal(intializeMarketBlock.timestamp)
      expect(await market.gelatoFeeShare()).to.equal(config.GELATO_FEE)
      expect(await market.inputToken()).to.equal(ricochetUSDCx.address)
      expect(await market.outputToken()).to.equal(ricochetETHx.address)
      expect(await market.underlyingInputToken()).to.equal(config.USDC_ADDRESS)
      expect(await market.underlyingOutputToken()).to.equal(config.ETH_ADDRESS)
      expect(await market.wmatic()).to.equal(config.WMATIC_ADDRESS)
      expect(await market.maticx()).to.equal(config.MATICX_ADDRESS)

      // Make sure REXTrade was created correctly
      expect(await market.rexTrade()).to.not.equal(ZERO_ADDRESS)
    })

    it('#1.3 before/afterAgreementCreated callbacks', async () => {
      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Verify a REXTrade was created for alice
      let aliceInitialRexTrade = await market.getLatestTrade(aliceSigner.address);
      let startTime = (await ethers.provider.getBlock('latest')).timestamp;
      let startIdaIndex = 0;
      // Expect share allocations were done correctly
      let units = ethers.BigNumber.from(inflowRateUsdc).div(
        ethers.BigNumber.from(await config.SHARE_SCALER)
      )
      expect(aliceInitialRexTrade.startTime).to.equal(startTime);
      expect(aliceInitialRexTrade.endTime).to.equal(0);
      expect(aliceInitialRexTrade.flowRate).to.equal(inflowRateUsdc);
      expect(aliceInitialRexTrade.startIdaIndex).to.equal(startIdaIndex); // No distributions on the index have happened yet
      expect(aliceInitialRexTrade.endIdaIndex).to.equal(0); // No distributions on the index have happened yet
      expect(aliceInitialRexTrade.units).to.equal(units);

      
      expect((await market.getIDAShares(aliceSigner.address)).toString()).to.equal(`true,true,${units},0`)

      // Check balances
      await takeMeasurements()

      // Give it a minute...
      await increaseTime(TEST_TRAVEL_TIME)

      // A distritbution happens when Bob starts his stream
      await sf.cfaV1
        .createFlow({
          sender: bobSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(bobSigner)

      // Verify a REXTrade was created for bob
      let bobInitialRexTrade = await market.getLatestTrade(bobSigner.address);
      startTime = (await ethers.provider.getBlock('latest')).timestamp;
      startIdaIndex = await market.getIDAIndexValue();
      expect(bobInitialRexTrade.startTime).to.equal(startTime);
      expect(bobInitialRexTrade.endTime).to.equal(0);
      expect(bobInitialRexTrade.flowRate).to.equal(inflowRateUsdc);
      expect(bobInitialRexTrade.startIdaIndex).to.equal(startIdaIndex); // One distribution occured
      expect(bobInitialRexTrade.endIdaIndex).to.equal(0); // No distributions on the index have happened yet
      expect(bobInitialRexTrade.units).to.equal(units);

      // Expect Alice wait distributed fairly
      // Check balances again
      await takeMeasurements()

      // Check oracle
      oraclePrice = await market.getLatestPrice()

      // Compute the delta of ETHx and USDCx for alice
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      let deltaBob = await delta(bobSigner, bobBalances)

      // Expect alice got within 2.0% of the oracle price
      expect(deltaAlice.ethx).to.be.above((deltaAlice.usdcx / oraclePrice) * 1e8 * -1 * 0.98)

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Alice exchange rate:', (deltaAlice.usdcx / deltaAlice.ethx) * -1)
      // Show the delte between the oracle price
      console.log(
        'Alice oracle delta (%):',
        (100 * ((deltaAlice.usdcx / deltaAlice.ethx) * -1 * 1e8 - oraclePrice)) / oraclePrice
      )

      // Expect Bob's share allocations were done correctly
      expect((await market.getIDAShares(bobSigner.address)).toString()).to.equal(`true,true,${units},0`)

      // Close the streams and clean up from the test
      // TODO: Move to afterEach method
      await sf.cfaV1
        .deleteFlow({
          receiver: market.address,
          sender: aliceSigner.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Verify the REXTrade was updated for alice
      let aliceFinalRexTrade = await market.getLatestTrade(aliceSigner.address);
      expect(aliceFinalRexTrade.startTime).to.equal(aliceInitialRexTrade.startTime);
      expect(aliceFinalRexTrade.endTime).to.equal((await ethers.provider.getBlock('latest')).timestamp);
      expect(aliceFinalRexTrade.flowRate).to.equal(aliceInitialRexTrade.flowRate);
      expect(aliceFinalRexTrade.startIdaIndex).to.equal(aliceInitialRexTrade.startIdaIndex);
      expect(aliceFinalRexTrade.endIdaIndex).to.equal(await market.getIDAIndexValue());
      expect(aliceFinalRexTrade.units).to.equal(aliceInitialRexTrade.units);

      // Make sure the input amount can be calculate correctly for alice
      let calculatedInputAmount = (aliceFinalRexTrade.endTime - aliceFinalRexTrade.startTime) * aliceFinalRexTrade.flowRate;

      // Make sure the output amount can be calculate correctly for alice
      let calculatedOutputAmount = (aliceFinalRexTrade.endIdaIndex - aliceFinalRexTrade.startIdaIndex) * aliceFinalRexTrade.units;
      expect(deltaAlice.ethx).to.equal(calculatedOutputAmount);


      await sf.cfaV1
        .deleteFlow({
          receiver: market.address,
          sender: bobSigner.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
        })
        .exec(bobSigner)
      
      // Verify the REXTrade was updated for bob
      let bobFinalRexTrade = await market.getLatestTrade(bobSigner.address);
      expect(bobFinalRexTrade.startTime).to.equal(bobInitialRexTrade.startTime);
      expect(bobFinalRexTrade.endTime).to.equal((await ethers.provider.getBlock('latest')).timestamp);
      expect(bobFinalRexTrade.flowRate).to.equal(bobInitialRexTrade.flowRate);
      expect(bobFinalRexTrade.startIdaIndex).to.equal(bobInitialRexTrade.startIdaIndex);
      expect(bobFinalRexTrade.endIdaIndex).to.equal(await market.getIDAIndexValue());
      expect(bobFinalRexTrade.units).to.equal(bobInitialRexTrade.units);

      // Make sure the input amount can be calculate correctly for bob
      calculatedInputAmount = (bobFinalRexTrade.endTime - bobFinalRexTrade.startTime) * bobFinalRexTrade.flowRate;

      // Make sure the output amount can be calculate correctly for bob
      calculatedOutputAmount = (bobFinalRexTrade.endIdaIndex - bobFinalRexTrade.startIdaIndex) * bobFinalRexTrade.units;
      expect(deltaBob.ethx).to.equal(calculatedOutputAmount);

    })

    it('#1.4 before/afterAgreementUpdated callbacks', async () => {
      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Give some time...
      await increaseTime(TEST_TRAVEL_TIME)

      // A distritbution happens when Bob starts his stream
      await sf.cfaV1
        .createFlow({
          sender: bobSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateEth,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(bobSigner)

      // Check balances
      await takeMeasurements()
      // Give it some time...
      await increaseTime(TEST_TRAVEL_TIME)

      // A distritbution happens when Alice updates her stream
      await sf.cfaV1
        .updateFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Expect Alice wait distributed fairly

      // Check balances again
      await takeMeasurements()

      // Check oracle
      oraclePrice = await market.getLatestPrice()

      // Compute the delta
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      let deltaBob = await delta(bobSigner, bobBalances)

      // Expect alice got within 1.0% of the oracle price (TODO: move to 0.75?)
      expect(deltaAlice.ethx).to.be.above((deltaAlice.usdcx / oraclePrice) * 1e8 * -1 * 0.98)

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Alice exchange rate:', (deltaAlice.usdcx / deltaAlice.ethx) * -1)
      // Show the delta between the oracle price
      console.log(
        'Alice oracle delta (%):',
        (100 * ((deltaAlice.usdcx / deltaAlice.ethx) * -1 * 1e8 - oraclePrice)) / oraclePrice
      )

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Bob exchange rate:', (deltaBob.usdcx / deltaBob.ethx) * -1)
      // Show the delta between the oracle price
      console.log(
        'Bob oracle delta (%):',
        (100 * ((deltaBob.usdcx / deltaBob.ethx) * -1 * 1e8 - oraclePrice)) / oraclePrice
      )

      // Delete Alices stream before first  distributions
      await sf.cfaV1
        .deleteFlow({
          receiver: market.address,
          sender: aliceSigner.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Delete Alices stream before first  distributions
      await sf.cfaV1
        .deleteFlow({
          receiver: market.address,
          sender: bobSigner.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
        })
        .exec(bobSigner)
    })

    it('#1.5 before/afterAgreementTerminated callbacks', async () => {
      await takeMeasurements()

      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      await increaseTime(3600)

      // Delete Alices stream before first  distributions
      await sf.cfaV1
        .deleteFlow({
          receiver: market.address,
          sender: aliceSigner.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      await takeMeasurements()

      // Check balance for alice again
      let aliceDelta = await delta(aliceSigner, aliceBalances)

      // Expect alice didn't lose anything since she closed stream before distribute
      // expect(aliceDelta.usdcx).to.equal(0);
      expect(aliceDelta.usdcx).to.equal(0)
      expect((await market.getIDAShares(aliceSigner.address)).toString()).to.equal(`true,true,0,0`)
      expect((await market.getIDAShares(adminSigner.address)).toString()).to.equal(`true,true,0,0`)
    })

    it('#1.6 manual distribution', async () => {
      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Check balance
      await takeMeasurements()

      // Fast forward an hour and distribute
      await increaseTime(TEST_TRAVEL_TIME)
      // Expect this call to distribute emits a RexSwap event
      await expect(market.distribute('0x', true)).to.emit(market, 'RexSwap')

      // Do two more distributions before checking balances
      await increaseTime(TEST_TRAVEL_TIME)
      await market.distribute('0x', true)

      await increaseTime(TEST_TRAVEL_TIME)
      await market.distribute('0x', true)

      // Check balances again
      await takeMeasurements()

      // Check oracle
      oraclePrice = await market.getLatestPrice()

      // Compute the delta
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      expect(deltaAlice.ethx).to.be.above((deltaAlice.usdcx / oraclePrice) * 1e8 * -1 * 0.98)

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Alice exchange rate:', (deltaAlice.usdcx / deltaAlice.ethx) * -1)
      // Show the delte between the oracle price
      console.log(
        'Alice oracle delta (%):',
        (100 * ((deltaAlice.usdcx / deltaAlice.ethx) * -1 * 1e8 - oraclePrice)) / oraclePrice
      )

      // Delete alice and bobs flow
      await sf.cfaV1
        .deleteFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)
    })

    it('#1.7 gelato distribution', async () => {
      const config = Constants['polygon']

      // Impersonate gelato network and set balance
      await impersonateAndSetBalance(config.GELATO_NETWORK)
      const gelatoNetwork = await ethers.provider.getSigner(config.GELATO_NETWORK)
      const ops = await ethers.getContractAt('Ops', config.GELATO_OPS)

      // Setup gelato executor exec and module data
      let encodedArgs = ethers.utils.defaultAbiCoder.encode(['uint128', 'uint128'], [gelatoBlock.timestamp, 60])
      let execData = market.interface.encodeFunctionData('distribute', ['0x', false])
      let moduleData = {
        modules: [1],
        args: [encodedArgs],
      }

      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc10x, // Increase rate 10x to make sure gelato can be paid
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      await takeMeasurements()
      await increaseTime(TEST_TRAVEL_TIME * 2)

      // Submit task to gelato
      await ops.connect(gelatoNetwork).exec(
        market.address,
        market.address,
        execData,
        moduleData,
        config.GELATO_FEE,
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        false, // true if payed with treasury
        true
      )
      await increaseTime(TEST_TRAVEL_TIME * 2)

      // Submit task to gelato
      await ops.connect(gelatoNetwork).exec(
        market.address,
        market.address,
        execData,
        moduleData,
        config.GELATO_FEE,
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        false, // true if payed with treasury
        true
      )

      // Check balances again
      await takeMeasurements()

      // Check oracle
      oraclePrice = await market.getLatestPrice()

      // Compute the delta
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      expect(deltaAlice.ethx).to.be.above((deltaAlice.usdcx / oraclePrice) * 1e8 * -1 * 0.98) // TODO: use config.RATE_TOLERANCE

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Alice exchange rate:', (deltaAlice.usdcx / deltaAlice.ethx) * -1)
      // Show the delte between the oracle price
      console.log(
        'Alice oracle delta (%):',
        (100 * ((deltaAlice.usdcx / deltaAlice.ethx) * -1 * 1e8 - oraclePrice)) / oraclePrice
      )

      // Delete alice and bobs flow
      // TODO: Move these deletes into afterEach()
      await sf.cfaV1
        .deleteFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)
    })

    it('#1.9 revert when inputToken is not USDCx', async () => {
      // Expect revert createFlow with ETHx by Alice
      await expect(
        sf.cfaV1
          .createFlow({
            sender: aliceSigner.address,
            receiver: market.address,
            superToken: ricochetMATICx.address,
            flowRate: '1000',
            shouldUseCallAgreement: true,
            overrides,
          })
          .exec(aliceSigner)
      ).to.be.revertedWith('!token')
    })

    it('#1.10 decrease/increase the gelato fee share correctly', async () => {
      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc10x, // Increase rate 10x to make sure gelato can be paid
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Trigger a market distribution
      await market.distribute('0x', true)

      // Check the initial gelatoFeeShare
      let gelatoFeeShare = await market.gelatoFeeShare()

      // Wait 2 hours
      await increaseTime(TEST_TRAVEL_TIME)

      // Trigger another distribution
      await market.distribute('0x', true)

      // Check the final gelatoFeeShare
      let gelatoFeeShare2 = await market.gelatoFeeShare()

      // Expect the gelatoFeeShare has decreased by 1
      expect(gelatoFeeShare2).to.equal(gelatoFeeShare.sub(1))

      // Wait 6 hours
      await increaseTime(TEST_TRAVEL_TIME * 3)

      // Trigger another distribution
      await market.distribute('0x', false)

      // Check the final gelatoFeeShare
      let gelatoFeeShare3 = await market.gelatoFeeShare()

      // Expect the gelatoFeeShare has increased by 1
      console.log('gelatoFeeShare2', gelatoFeeShare2.toString())
      console.log('gelatoFeeShare3', gelatoFeeShare3.toString())
      expect(gelatoFeeShare3).to.equal(gelatoFeeShare2.add(1))

      // Alice closes a stream to rex market
      await sf.cfaV1
        .deleteFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)
    })
  })

  context('#2 - native supertoken outputToken with two streamers', async () => {
    // Uses the USDC/rexSHIRT Uniswap LPs where rexSHIRT is the supertoken outputToken

    before(async () => {
      // const success = await provider.send('evm_revert', [
      //     snapshot
      // ]);

      // Deploy RIC-USDC Rex Market
      const registrationKey = await sfRegistrationKey(sf, adminSigner.address)

      market = await REXMarketFactory.deploy(
        sf.settings.config.hostAddress,
        config.CFA_SUPERFLUID_ADDRESS,
        config.IDA_SUPERFLUID_ADDRESS,
        registrationKey,
        config.GELATO_OPS,
        adminSigner.address
      )

      // Initialize MATIC
      await market.initializeMATIC(config.WMATIC_ADDRESS, config.MATICX_ADDRESS)

      await market.initializeMarket(ricochetUSDCx.address, ricochetRexSHIRT.address)
      await market.createTask()
      gelatoBlock = await ethers.provider.getBlock('latest')

      // Initialize the twoway market's uniswap
      // token0 is USDC, token1 is rexSHIRT (supertokens)
      await market.initializeUniswap(
        config.UNISWAP_V3_ROUTER_ADDRESS,
        config.UNISWAP_V3_FACTORY_ADDRESS,
        [config.USDC_ADDRESS, config.RIC_ADDRESS, config.REXSHIRT_ADDRESS],
        [500, 10000]
      )

      // Initialize Price Feed
      // No pricefeed available for rexSHIRT
      // await market.initializePriceFeed(
      //     config.CHAINLINK_MATIC_USDC_PRICE_FEED
      // );

      rexshirtIDAIndex = {
        token: ricochetRexSHIRT,
        IDAIndex: 0,
      }

      await approveSubscriptions([rexshirtIDAIndex], [adminSigner, aliceSigner]) // bobSigner

      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      console.log('Alice USDCx stream created')

      // Advance time to allow for some tokens to accumulate in the market
      await increaseTime(TEST_TRAVEL_TIME)

      // Take a snapshot
      snapshot = await provider.send('evm_snapshot', [])
    })

    beforeEach(async () => {
      // Revert to the point REXMarket was just deployed
      const success = await provider.send('evm_revert', [snapshot])
      // Take another snapshot to be able to revert again next time
      snapshot = await provider.send('evm_snapshot', [])
      expect(success).to.equal(true)
    })

    afterEach(async () => {
      // Check the app isn't jailed
      // expect(await market.isAppJailed()).to.equal(false);
      await resetMeasurements()
    })

    after(async () => {})

    it('#2.1 manual distribution', async () => {
      // First try swap of RIC to USDC

      // Check balance
      await takeMeasurements()

      // Fast forward an hour and distribute
      await increaseTime(TEST_TRAVEL_TIME)
      await market.distribute('0x', false)
      // Fast forward an hour and distribute
      await increaseTime(TEST_TRAVEL_TIME)
      await market.distribute('0x', false)
      // Fast forward an hour and distribute
      await increaseTime(TEST_TRAVEL_TIME)
      await market.distribute('0x', false)

      // Check balances again
      await takeMeasurements()

      // get the price from the oracle to use in the test
      let rexShirtOraclePrice = await market.getLatestPrice()

      // Compute the delta
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      // let deltaBob = await delta(bobSigner, bobBalances)

      // Log the exchange rate and delta for visual inspection by the test engineers
      console.log('Alice exchange rate:', (deltaAlice.usdcx / deltaAlice.rexshirt) * -1)

      // Update Alices stream
      await sf.cfaV1
        .updateFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          flowRate: inflowRateUsdc10x,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Check balance
      await takeMeasurements()
      // Fast forward an hour and distribute
      await increaseTime(60)
      await market.distribute('0x', false)
      await increaseTime(60)
      await market.distribute('0x', false)
      await increaseTime(60)
      await market.distribute('0x', false)

      // Check balances again
      await takeMeasurements()

      rexShirtOraclePrice = await market.getLatestPrice()

      // Compute the delta
      deltaAlice = await delta(aliceSigner, aliceBalances)

      // Log the exchange rate and delta for visual inspection by the test engineers
      console.log('Alice exchange rate:', (deltaAlice.usdcx / deltaAlice.rexshirt) * -1)

      // Delete alice and bobs flow
      await sf.cfaV1
        .deleteFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)
    })
  })

  context('#3 - matic supertoken market with two streamers', async () => {
    before(async () => {
      // Deploy RIC-USDC Rex Market
      const registrationKey = await sfRegistrationKey(sf, adminSigner.address)

      market = await REXMarketFactory.deploy(
        sf.settings.config.hostAddress,
        config.CFA_SUPERFLUID_ADDRESS,
        config.IDA_SUPERFLUID_ADDRESS,
        registrationKey,
        config.GELATO_OPS,
        adminSigner.address
      )
      await market.initializeMATIC(config.WMATIC_ADDRESS, config.MATICX_ADDRESS)
      await market.createTask()
      await market.initializeMarket(
        ricochetUSDCx.address,
        ricochetMATICx.address
      )
      // Initialize the twoway market's uniswap
      // token0 is USDC, token1 is rexSHIRT (supertokens)
      await market.initializeUniswap(
        config.UNISWAP_V3_ROUTER_ADDRESS,
        config.UNISWAP_V3_FACTORY_ADDRESS,
        [config.USDC_ADDRESS, config.DAI_ADDRESS, config.WMATIC_ADDRESS],
        [500, 3000],
      )

      // Initialize Price Feed
      await market.initializePriceFeed(config.CHAINLINK_MATIC_USDC_PRICE_FEED, false)

      maticxIDAIndex = {
        token: ricochetMATICx,
        IDAIndex: 0,
      }

      await approveSubscriptions([maticxIDAIndex], [adminSigner, aliceSigner, bobSigner])

      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Fast forward 1 minute
      await increaseTime(TEST_TRAVEL_TIME)

      await sf.cfaV1
        .createFlow({
          sender: bobSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(bobSigner)

      // Take a snapshot
      snapshot = await provider.send('evm_snapshot', [])
    })

    beforeEach(async () => {
      // Revert to the point REXMarket was just deployed
      const success = await provider.send('evm_revert', [snapshot])
      // Take another snapshot to be able to revert again next time
      snapshot = await provider.send('evm_snapshot', [])
      expect(success).to.equal(true)
    })

    afterEach(async () => {
      await resetMeasurements()
    })

    after(async () => {})

    it('#3.1 distribution', async () => {
      // Check balance
      await takeMeasurements()

      // Fast forward an hour and distribute
      await increaseTime(TEST_TRAVEL_TIME)
      await market.distribute('0x', false)
      await increaseTime(TEST_TRAVEL_TIME)
      await market.distribute('0x', false)
      await increaseTime(TEST_TRAVEL_TIME)
      await market.distribute('0x', false)
      // Check balances again
      await takeMeasurements()

      // get the price of matic from the oracle
      maticOraclePrice = await market.getLatestPrice()
      console.log('MATIC Oracle Price: ', maticOraclePrice.toString())

      // Compute the delta
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      let deltaBob = await delta(bobSigner, bobBalances)

      // Expect Alice and Bob got the right output less fee + slippage
      expect(deltaBob.maticx).to.be.above((deltaBob.usdcx / maticOraclePrice) * 1e8 * -1 * 0.98)
      expect(deltaAlice.maticx).to.be.above((deltaAlice.usdcx / maticOraclePrice) * 1e8 * -1 * 0.98)

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Alice exchange rate:', (deltaAlice.usdcx / deltaAlice.maticx) * -1)
      // Show the delte between the oracle price
      console.log(
        'Alice oracle delta (%):',
        (100 * ((deltaAlice.usdcx / deltaAlice.maticx) * -1 * 1e8 - maticOraclePrice)) / maticOraclePrice
      )

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Bob exchange rate:', (deltaBob.usdcx / deltaBob.maticx) * -1)
      // Show the delte between the oracle price
      console.log(
        'Bob oracle delta (%):',
        (100 * ((deltaBob.usdcx / deltaBob.maticx) * -1 * 1e8 - maticOraclePrice)) / maticOraclePrice
      )

      // Delete Alice's flow
      // TODO: Move to afterEach()
      await sf.cfaV1
        .deleteFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Delete Bob's flow
      await sf.cfaV1
        .deleteFlow({
          sender: bobSigner.address,
          receiver: market.address,
          superToken: ricochetUSDCx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(bobSigner)
    })
  })

  context('#4 - stablecoin output market with invertedPrice', async () => {
    before(async () => {
      // Deploy RIC-USDC Rex Market
      const registrationKey = await sfRegistrationKey(sf, adminSigner.address)

      market = await REXMarketFactory.deploy(
        sf.settings.config.hostAddress,
        config.CFA_SUPERFLUID_ADDRESS,
        config.IDA_SUPERFLUID_ADDRESS,
        registrationKey,
        config.GELATO_OPS,
        adminSigner.address
      )
      await market.initializeMATIC(config.WMATIC_ADDRESS, config.MATICX_ADDRESS)
      await market.createTask()
      await market.initializeMarket(
        ricochetMATICx.address,
        ricochetUSDCx.address,
      )
      // Initialize the twoway market's uniswap
      // token0 is USDC, token1 is rexSHIRT (supertokens)
      await market.initializeUniswap(
        config.UNISWAP_V3_ROUTER_ADDRESS,
        config.UNISWAP_V3_FACTORY_ADDRESS,
        [config.WMATIC_ADDRESS, config.DAI_ADDRESS, config.USDC_ADDRESS],
        [3000, 100],
      )

      // Initialize Price Feed
      await market.initializePriceFeed(config.CHAINLINK_MATIC_USDC_PRICE_FEED, true)

      usdcxIDAIndex = {
        token: ricochetUSDCx,
        IDAIndex: 0,
      }

      await approveSubscriptions([usdcxIDAIndex], [adminSigner, aliceSigner, bobSigner])

      // Alice opens a MATICx stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetMATICx.address,
          flowRate: '1000000000',
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Fast forward time to allow the stream to start
      await increaseTime(TEST_TRAVEL_TIME)

      await sf.cfaV1
        .createFlow({
          sender: bobSigner.address,
          receiver: market.address,
          superToken: ricochetMATICx.address,
          flowRate: '1000000000',
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(bobSigner)

      // Take a snapshot
      snapshot = await provider.send('evm_snapshot', [])
    })

    beforeEach(async () => {
      // Revert to the point REXMarket was just deployed
      const success = await provider.send('evm_revert', [snapshot])
      // Take another snapshot to be able to revert again next time
      snapshot = await provider.send('evm_snapshot', [])
      expect(success).to.equal(true)
    })

    afterEach(async () => {
      await resetMeasurements()
    })

    after(async () => {})

    it('#4.1 distribution', async () => {
      // Check balance
      await takeMeasurements()

      // Fast forward and distribute
      await market.distribute('0x', true)
      await increaseTime(TEST_TRAVEL_TIME * 100)
      await market.distribute('0x', true)
      await increaseTime(TEST_TRAVEL_TIME * 100)
      await market.distribute('0x', true)
      // Check balances again
      await takeMeasurements()

      // get the price of matic from the oracle
      maticOraclePrice = await market.getLatestPrice()
      console.log('MATIC Oracle Price: ', maticOraclePrice.toString())

      // Compute the delta
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      let deltaBob = await delta(bobSigner, bobBalances)

      // Expect Alice and Bob got the right output less fee + slippage
      expect(deltaBob.usdcx).to.be.above(((deltaBob.maticx * maticOraclePrice) / 1e8) * -1 * 0.98)
      expect(deltaAlice.usdcx).to.be.above(((deltaAlice.maticx * maticOraclePrice) / 1e8) * -1 * 0.98)

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Alice exchange rate:', (deltaAlice.usdcx / deltaAlice.maticx) * -1)
      // Show the delte between the oracle price
      console.log(
        'Alice oracle delta (%):',
        (100 * ((deltaAlice.usdcx / deltaAlice.maticx) * -1 * 1e8 - maticOraclePrice)) / maticOraclePrice
      )

      // Display exchange rates and deltas for visual inspection by the test engineers
      console.log('Bob exchange rate:', (deltaBob.usdcx / deltaBob.maticx) * -1)
      // Show the delte between the oracle price
      console.log(
        'Bob oracle delta (%):',
        (100 * ((deltaBob.usdcx / deltaBob.maticx) * -1 * 1e8 - maticOraclePrice)) / maticOraclePrice
      )

      // Delete Alice's flow
      // TODO: Move to afterEach()
      await sf.cfaV1
        .deleteFlow({
          sender: aliceSigner.address,
          receiver: market.address,
          superToken: ricochetMATICx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Delete Bob's flow
      await sf.cfaV1
        .deleteFlow({
          sender: bobSigner.address,
          receiver: market.address,
          superToken: ricochetMATICx.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(bobSigner)
    })

    it('#4.2 Should return the correct next distribution time', async () => {
      const gasPrice = 3200 // 3200 GWEI
      const gasLimit = 120000
      const tokenToMaticRate = 10 ** 9 // 1 matic = 1 usd
      const lastDistributedAt = await market.lastDistributedAt()

      const netFlowRate = await sf.cfaV1.getNetFlow({
        superToken: ricochetMATICx.address,
        account: market.address,
        providerOrSigner: adminSigner,
      })
      console.log('Market input token NetFlowRate:', netFlowRate.toString())
      console.log('Last Distribution time:', lastDistributedAt.toString())

      const actualDistributionTime = await market.getNextDistributionTime(gasPrice, gasLimit, tokenToMaticRate)

      const calculatedDistributionTime =
        parseInt(lastDistributedAt) +
        Math.floor(
          Math.floor((gasPrice * gasLimit * tokenToMaticRate) / 10 ** 9) / Math.floor(parseInt(netFlowRate) / 10 ** 9)
        )

      expect(actualDistributionTime).to.equal(calculatedDistributionTime)
    })
  })
})
