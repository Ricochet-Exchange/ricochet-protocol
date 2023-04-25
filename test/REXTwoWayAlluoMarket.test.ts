import { waffle, ethers } from 'hardhat'
import { setup, IUser, ISuperToken } from '../misc/setup'
import { common } from '../misc/common'
import { expect } from 'chai'
import { HttpService } from './../misc/HttpService'
import { Framework, SuperToken } from '@superfluid-finance/sdk-core'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { REXTwoWayAlluoMarket, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from '../typechain'
import { increaseTime, impersonateAndSetBalance } from './../misc/helpers'
import { Constants } from '../misc/Constants'
import { AbiCoder, parseUnits } from 'ethers/lib/utils'

const { provider, loadFixture } = waffle
const TEST_TRAVEL_TIME = 3600 * 2 // 2 hours
// Index 1 is for Ether and 0 for USDCx
const USDCX_SUBSCRIPTION_INDEX = 0
const ETHX_SUBSCRIPTION_INDEX = 1
const RIC_SUBSCRIPTION_INDEX = 2

export interface superTokenAndItsIDAIndex {
  token: SuperToken
  IDAIndex: number
}

describe('REXTwoWayAlluoMarket', () => {
  const errorHandler = (err: any) => {
    if (err) throw err
  }

  const overrides = { gasLimit: '6000000' } // Using this to manually limit gas to avoid giga-errors.
  const inflowRateUsdc = '1000000000000000'
  const inflowRateUsdcDeposit = '4000000000000000'
  const inflowRateUsdc10x = '10000000000000000'
  const inflowRateEth = '1000000000000'
  const inflowRateEthHalf = '500000000000'
  const subsidyRate = '10000000000000'

  let rexReferral: REXReferral__factory
  let REXMarketFactory: any
  let referral: any
  let snapshot: any

  let adminSigner: SignerWithAddress
  let aliceSigner: SignerWithAddress
  let bobSigner: SignerWithAddress
  let carlSigner: SignerWithAddress
  let usdcxWhaleSigner: SignerWithAddress
  let ethxWhaleSigner: SignerWithAddress
  let maticxWhaleSigner: SignerWithAddress
  let stIbAlluoUSDWhaleSigner: SignerWithAddress
  let stIbAlluoETHWhaleSigner: SignerWithAddress
  let karenSigner: SignerWithAddress

  let oraclePrice: number

  let appBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [], maticx: [] }
  let ownerBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [], maticx: [] }
  let aliceBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [], maticx: [] }
  let bobBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [], maticx: [] }
  let carlBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [], maticx: [] }
  let karenBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [], maticx: [] }

  let sf: Framework,
    superT: ISuperToken,
    u: { [key: string]: IUser },
    twoWayMarket: REXTwoWayAlluoMarket,
    tokenss: { [key: string]: any },
    sfRegistrationKey: any,
    accountss: SignerWithAddress[],
    constant: { [key: string]: string },
    ERC20: any

  // ************** All the supertokens used in Ricochet are declared **********************
  let stIbAlluoUSD: SuperToken
  let stIbAlluoETH: SuperToken
  let ricochetRIC: SuperToken
  let ricochetETHx: SuperToken
  let ricochetETH: SuperToken
  let ibAlluoUSD: any
  let ibAlluoETH: any
  let weth: any

  let usdcxAndItsIDAIndex: superTokenAndItsIDAIndex
  let ethxAndItsIDAIndex: superTokenAndItsIDAIndex
  let ricAndItsIDAIndex: superTokenAndItsIDAIndex
  let ricAndItsOtherIDAIndex: superTokenAndItsIDAIndex

  // ***************************************************************************************

  async function takeMeasurements(balances: SuperTokensBalances, signer: SignerWithAddress): Promise<void> {
    appBalances.stIbAlluoUSD.push(
      (await superT.stIbAlluoUSD.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString()
    )
    ownerBalances.stIbAlluoUSD.push(
      (await superT.stIbAlluoUSD.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString()
    )
    aliceBalances.stIbAlluoUSD.push(
      (await superT.stIbAlluoUSD.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString()
    )
    carlBalances.stIbAlluoUSD.push(
      (await superT.stIbAlluoUSD.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString()
    )
    karenBalances.stIbAlluoUSD.push(
      (await superT.stIbAlluoUSD.balanceOf({ account: u.karen.address, providerOrSigner: provider })).toString()
    )
    bobBalances.stIbAlluoUSD.push(
      (await superT.stIbAlluoUSD.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString()
    )

    appBalances.stIbAlluoETH.push(
      (await superT.stIbAlluoETH.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString()
    )
    ownerBalances.stIbAlluoETH.push(
      (await superT.stIbAlluoETH.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString()
    )
    aliceBalances.stIbAlluoETH.push(
      (await superT.stIbAlluoETH.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString()
    )
    carlBalances.stIbAlluoETH.push(
      (await superT.stIbAlluoETH.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString()
    )
    karenBalances.stIbAlluoETH.push(
      (await superT.stIbAlluoETH.balanceOf({ account: u.karen.address, providerOrSigner: provider })).toString()
    )
    bobBalances.stIbAlluoETH.push(
      (await superT.stIbAlluoETH.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString()
    )

    appBalances.ric.push(
      (await superT.ric.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString()
    )
    ownerBalances.ric.push(
      (await superT.ric.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString()
    )
    aliceBalances.ric.push(
      (await superT.ric.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString()
    )
    carlBalances.ric.push(
      (await superT.ric.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString()
    )
    karenBalances.ric.push(
      (await superT.ric.balanceOf({ account: u.karen.address, providerOrSigner: provider })).toString()
    )
    bobBalances.ric.push(
      (await superT.ric.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString()
    )
  }

  async function resetMeasurements(): Promise<void> {
    appBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] }
    ownerBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] }
    aliceBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] }
    bobBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] }
    carlBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] }
    karenBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] }
  }

  async function approveSubscriptions(tokensAndIDAIndexes: superTokenAndItsIDAIndex[], signers: SignerWithAddress[]) {
    console.log('  ======== Inside approveSubscriptions ===========')
    let tokenIndex: number
    for (let i = 0; i < signers.length; i++) {
      for (let j = 0; j < tokensAndIDAIndexes.length; j++) {
        tokenIndex = tokensAndIDAIndexes[j].IDAIndex
        await sf.idaV1
          .approveSubscription({
            indexId: tokenIndex.toString(),
            superToken: tokensAndIDAIndexes[j].token.address,
            publisher: twoWayMarket.address,
            userData: '0x',
          })
          .exec(signers[i])
        console.log('====== ', i, ' subscription to token ', j, ' approved =======')
      }
    }
  }

  async function checkBalance(user: SignerWithAddress, name: string) {
    console.log(' checkBalance START ======== Balance of ', name, ' with address: ', user.address, ' ============= ')
    let balanceEthx = await stIbAlluoETH.balanceOf({
      account: user.address,
      providerOrSigner: provider,
    })
    let balanceUsdcx = await stIbAlluoUSD.balanceOf({
      account: user.address,
      providerOrSigner: provider,
    })
    let balanceRic = await ricochetRIC.balanceOf({
      account: user.address,
      providerOrSigner: provider,
    })

    console.log('Balance in stIbAlluoETH: ', balanceEthx)
    console.log('Balance in stIbAlluoUSD: ', balanceUsdcx)
    console.log('Balance in RIC: ', balanceRic)
    console.log(' checkBalance END ====================================================== ')
  }

  async function delta(account: SignerWithAddress, balances: any) {
    const len = balances.stIbAlluoETH.length
    return {
      stIbAlluoETH: balances.stIbAlluoETH[len - 1] - balances.stIbAlluoETH[len - 2],
      stIbAlluoUSD: balances.stIbAlluoUSD[len - 1] - balances.stIbAlluoUSD[len - 2],
      ric: balances.ric[len - 1] - balances.ric[len - 2],
    }
  }

  before(async () => {
    hre.tracer.enable = false
    const { superfluid, users, accounts, tokens, superTokens, contracts, constants } = await setup()
    console.log('============ Right after initSuperfluid() ==================')

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
    carlSigner = accountss[3]
    karenSigner = accountss[4]
    ethxWhaleSigner = accountss[6]
    stIbAlluoUSDWhaleSigner = accountss[8]
    stIbAlluoETHWhaleSigner = accountss[9]

    ricochetRIC = superT.ric
    stIbAlluoUSD = superT.stIbAlluoUSD
    stIbAlluoETH = superT.stIbAlluoETH
    ricochetETHx = superT.ethx

    weth = tokenss.weth
    ibAlluoUSD = tokenss.ibAlluoUSD
    ibAlluoETH = tokenss.ibAlluoETH

    usdcxAndItsIDAIndex = {
      token: stIbAlluoUSD,
      IDAIndex: USDCX_SUBSCRIPTION_INDEX,
    }
    ethxAndItsIDAIndex = {
      token: stIbAlluoETH,
      IDAIndex: ETHX_SUBSCRIPTION_INDEX,
    }
    ricAndItsIDAIndex = {
      token: ricochetRIC,
      IDAIndex: RIC_SUBSCRIPTION_INDEX,
    }
    ricAndItsOtherIDAIndex = {
      token: ricochetRIC,
      IDAIndex: 3,
    }

    console.log('======******** List of addresses =======')
    for (let i = 0; i < accountss.length; i++) {
      console.log('Address number ', i, ': ', accountss[i].address)
    }
    console.log('++++++++++++++ alice address number: ', aliceSigner.address)
    console.log('++++++++++++++ bob address number: ', bobSigner.address)
    console.log('++++++++++++++ carl address number: ', carlSigner.address)

    console.log('======******** List of TOKENS addresses =======')
    console.log("======** stIbAlluoUSD's address: ", stIbAlluoUSD.address)
    console.log("======** stIbAlluoETH's address: ", stIbAlluoETH.address)
    // ==============================================================================

    // Deploy REXReferral
    rexReferral = await ethers.getContractFactory('REXReferral', {
      signer: adminSigner,
    })
    referral = await rexReferral.deploy()
    await referral.deployed()
    console.log('=========== Deployed REXReferral ============')

    // ==============================================================================
    const registrationKey = await sfRegistrationKey(sf, adminSigner.address)
    console.log('============ Right after sfRegistrationKey() ==================')

    // ==============
    // Deploy REX Market
    console.log('Deploying REXTwoWayMarket...')
    REXMarketFactory = await ethers.getContractFactory('REXTwoWayAlluoMarket', adminSigner)
    console.log('admin signer address:', adminSigner.address)
    twoWayMarket = await REXMarketFactory.deploy(
      adminSigner.address,
      sf.settings.config.hostAddress,
      Constants.CFA_SUPERFLUID_ADDRESS,
      Constants.IDA_SUPERFLUID_ADDRESS,
      registrationKey,
      referral.address
    )
    console.log('=========== Deployed REXTwoWayAlluoMarket ============')

    console.log('initializeTwoWayMarket', stIbAlluoUSD.address, stIbAlluoETH.address)
    await twoWayMarket.initializeTwoWayMarket(stIbAlluoUSD.address, 1e7, stIbAlluoETH.address, 1e9, 5000, 20000)
    console.log('=========== Initialized TwoWayMarket ============')

    await twoWayMarket.initializeSubsidies(subsidyRate, ricochetRIC.address)
    console.log('========== Initialized subsidies ===========')

    await checkBalance(stIbAlluoUSDWhaleSigner, 'the stIbAlluoUSD whale')
    await checkBalance(stIbAlluoETHWhaleSigner, 'the stIbAlluoETH whale')
    // send the contract some RIC
    try {
      await ricochetRIC
        .transfer({
          receiver: twoWayMarket.address,
          amount: '1000000000000000000',
        })
        .exec(adminSigner)
    } catch (err: any) {
      console.log('Ricochet - ERROR transferring RICs to the contract: ', err)
    }
    console.log('============ RICs have been sent to the contract =============')
    await checkBalance(adminSigner, 'the contract')

    // Register the market with REXReferral
    await referral.registerApp(twoWayMarket.address)
    referral = await referral.connect(carlSigner)
    await referral.applyForAffiliate('carl', 'carl')
    referral = await referral.connect(adminSigner)
    await referral.verifyAffiliate('carl')
    console.log('                      ============ The affiliate has been veryfied =============')
    console.log('=======================================================================')
    console.log('================ End of "before" block ==============================')
    console.log('=======================================================================')

    // Do all the approvals
    // TODO: Redo how indexes are setup
    await approveSubscriptions(
      [usdcxAndItsIDAIndex, ethxAndItsIDAIndex, ricAndItsIDAIndex, ricAndItsOtherIDAIndex],
      [adminSigner, aliceSigner, bobSigner, karenSigner, carlSigner]
    )

    // Give Alice, Bob, Karen some tokens
    console.log(ethxWhaleSigner.address)

    let initialAmount = ethers.utils.parseUnits('1000', 18).toString()

    await stIbAlluoUSD
      .transfer({
        receiver: aliceSigner.address,
        amount: initialAmount,
      })
      .exec(stIbAlluoUSDWhaleSigner)
    console.log('====== Transferred to alice =======')
    await stIbAlluoETH
      .transfer({
        receiver: bobSigner.address,
        amount: ethers.utils.parseUnits('0.018', 18).toString(),
      })
      .exec(stIbAlluoETHWhaleSigner)
    console.log('ETH')
    await ricochetRIC
      .transfer({
        receiver: bobSigner.address,
        amount: '1000000000000000000000',
      })
      .exec(adminSigner)
    console.log('RIC')

    await stIbAlluoUSD
      .transfer({
        receiver: karenSigner.address,
        amount: initialAmount,
      })
      .exec(stIbAlluoUSDWhaleSigner)
    console.log('====== Transferred to karen =======')

    // Take a snapshot to avoid redoing the setup
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
      expect(await twoWayMarket.isAppJailed()).to.equal(false)

      // Check there's ibToken dust in the contract
      expect(await ibAlluoUSD.balanceOf(twoWayMarket.address)).to.equal(0)
      expect(await ibAlluoETH.balanceOf(twoWayMarket.address)).to.equal(0)

      await resetMeasurements()
    })

    it('#1.1 getters/setters', async () => {
      await twoWayMarket.setRateTolerance(1000)
      expect(await twoWayMarket.getRateTolerance()).to.equal(1000)
      await twoWayMarket.setFeeRate(0, 1000)
      expect(await twoWayMarket.getFeeRate(0)).to.equal(1000)
      await twoWayMarket.setEmissionRate(0, 1000)
      expect(await twoWayMarket.getEmissionRate(0)).to.equal(1000)
      expect((await twoWayMarket.getOutputPool(0)).toString()).to.equal(`${stIbAlluoUSD.address},1000,1000,${1e7}`)
      expect((await twoWayMarket.getLastDistributionAt()).toNumber()).to.be.above(0)
    })

    it('#1.2 before/afterAgreementCreated callbacks', async () => {
      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRateUsdc,
          userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl']),
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Expect share allocations were done correctly
      expect(await twoWayMarket.getStreamRate(aliceSigner.address, stIbAlluoUSD.address)).to.equal(inflowRateUsdc)
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()).to.equal(
        `true,true,995000,0`
      )
      // Admin and Carl split 2% of the shares bc of the 50% referral fee
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()).to.equal(
        `true,true,2500,0`
      )
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()).to.equal(
        `true,true,2500,0`
      )

      // Bob opens a ETH stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: bobSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoETH.address,
          flowRate: inflowRateEth,
          shouldUseCallAgreement: true,
        })
        .exec(bobSigner)
      // Expect share allocations were done correctly
      expect(await twoWayMarket.getStreamRate(bobSigner.address, stIbAlluoETH.address)).to.equal(inflowRateEth)
      expect((await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, bobSigner.address)).toString()).to.equal(
        `true,true,99500,0`
      )
      // Admin gets all of the 2% bc bob was an organic referral
      expect((await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()).to.equal(
        `true,true,500,0`
      )
      expect((await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()).to.equal(
        `true,true,0,0`
      )
    })

    it('#1.3 before/afterAgreementTerminated callbacks', async () => {
      await takeMeasurements()

      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRateUsdc,
          userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl']),
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Bob opens a ETH stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: bobSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoETH.address,
          flowRate: inflowRateEth,
          shouldUseCallAgreement: true,
        })
        .exec(bobSigner)

      await increaseTime(3600)

      // Delete Alices stream before first  distributions
      await sf.cfaV1
        .deleteFlow({
          receiver: twoWayMarket.address,
          sender: aliceSigner.address,
          superToken: stIbAlluoUSD.address,
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Delete Alices stream before first  distributions
      await sf.cfaV1
        .deleteFlow({
          receiver: twoWayMarket.address,
          sender: bobSigner.address,
          superToken: stIbAlluoETH.address,
          shouldUseCallAgreement: true,
        })
        .exec(bobSigner)

      await takeMeasurements()

      // Check balance for alice again
      let aliceDelta = await delta(aliceSigner, aliceBalances)
      let bobDelta = await delta(bobSigner, bobBalances)

      // Expect alice didn't lose anything since she closed stream before distribute
      expect(aliceDelta.stIbAlluoUSD).to.equal(0)

      // TODO: expect(bobDelta.stIbAlluoETH).to.equal(0);

      // Expect share allocations were done correctly
      expect(await twoWayMarket.getStreamRate(aliceSigner.address, stIbAlluoUSD.address)).to.equal('0')
      expect(await twoWayMarket.getStreamRate(bobSigner.address, stIbAlluoETH.address)).to.equal('0')
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()).to.equal(
        `true,true,0,0`
      )
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()).to.equal(
        `true,true,0,0`
      )
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()).to.equal(
        `true,true,0,0`
      )
      expect((await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, bobSigner.address)).toString()).to.equal(
        `true,true,0,0`
      )
      expect((await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()).to.equal(
        `true,true,0,0`
      )
    })

    it('#1.4 one-sided distribution', async () => {
      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRateUsdc,
          userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl']),
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Check balance
      await takeMeasurements()

      // Fast forward an hour and distribute
      await increaseTime(3600)
      await twoWayMarket.distribute('0x')

      // Check balances again
      await takeMeasurements()

      // Compute the delta
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      let deltaCarl = await delta(carlSigner, carlBalances)
      let deltaOwner = await delta(adminSigner, ownerBalances)

      // Expect Alice and Bob got the right output less the 2% fee + 1% slippage
      // console.log("Alice got this much stIbAlluoETH", deltaAlice.stIbAlluoETH);
      // console.log("Alice paid this much stIbAlluoUSD", -1 * deltaAlice.stIbAlluoUSD);
      // console.log("stIbAlluoETH/USD rate", -1*deltaAlice.stIbAlluoUSD/deltaAlice.stIbAlluoETH);
      expect(deltaAlice.stIbAlluoETH).to.be.above((deltaAlice.stIbAlluoUSD / oraclePrice) * 1e6 * -1 * 0.97)

      // Expect Owner and Carl got their fee from Alice
      expect(
        deltaCarl.stIbAlluoETH / (deltaAlice.stIbAlluoETH + deltaCarl.stIbAlluoETH + deltaOwner.stIbAlluoETH)
      ).to.within(0.0025, 0.00251)
      expect(
        deltaOwner.stIbAlluoETH / (deltaAlice.stIbAlluoETH + deltaCarl.stIbAlluoETH + deltaOwner.stIbAlluoETH)
      ).to.within(0.0025, 0.00251)
    })
  })

  context('#2 - existing market with streamers on both sides', async () => {
    before(async () => {
      const success = await provider.send('evm_revert', [snapshot])

      // Bob opens a ETH stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: bobSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoETH.address,
          flowRate: inflowRateEth,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(bobSigner)

      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRateUsdc,
          userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl']),
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

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
      expect(await twoWayMarket.isAppJailed()).to.equal(false)

      // Check there's ibToken dust in the contract
      expect(await ibAlluoUSD.balanceOf(twoWayMarket.address)).to.equal(0)
      expect(await ibAlluoETH.balanceOf(twoWayMarket.address)).to.equal(0)

      await resetMeasurements()
    })

    after(async () => {
      // Close the streams for and leave a clean snapshot for next context
      await sf.cfaV1
        .deleteFlow({
          receiver: twoWayMarket.address,
          sender: aliceSigner.address,
          superToken: stIbAlluoUSD.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Delete Bobs stream
      await sf.cfaV1
        .deleteFlow({
          receiver: twoWayMarket.address,
          sender: bobSigner.address,
          superToken: stIbAlluoETH.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(bobSigner)

      snapshot = await provider.send('evm_snapshot', [])
    })

    it('#2.1 before/afterAgreementCreated callbacks', async () => {
      // Karen opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: karenSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRateUsdc,
          shouldUseCallAgreement: true,
        })
        .exec(karenSigner)

      // Expect share allocations were done correctly
      expect(await twoWayMarket.getStreamRate(karenSigner.address, stIbAlluoUSD.address)).to.equal(inflowRateUsdc)
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()).to.equal(
        `true,true,995000,0`
      )
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, karenSigner.address)).toString()).to.equal(
        `true,true,995000,0`
      )
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()).to.equal(
        `true,true,7500,0`
      )
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()).to.equal(
        `true,true,2500,0`
      )
    })

    it('#2.2 before/afterAgreementUpdated callbacks', async () => {
      await sf.cfaV1
        .updateFlow({
          sender: aliceSigner.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRateUsdc10x,
          receiver: twoWayMarket.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(aliceSigner)

      // Expect share allocations were done correctly
      expect(await twoWayMarket.getStreamRate(aliceSigner.address, stIbAlluoUSD.address)).to.equal(inflowRateUsdc10x)
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()).to.equal(
        `true,true,9950000,0`
      )
      // Admin and Carl split 2% of the shares bc of the 50% referral fee
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()).to.equal(
        `true,true,25000,0`
      )
      expect((await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()).to.equal(
        `true,true,25000,0`
      )
    })

    it('#2.3 two-sided distribution', async () => {
      // Check balance
      await twoWayMarket.distribute('0x')
      await takeMeasurements()

      // Fast forward an hour and distribute
      await increaseTime(3600)
      await twoWayMarket.distribute('0x')

      // Check balances again
      await takeMeasurements()

      // Compute the delta
      let deltaAlice = await delta(aliceSigner, aliceBalances)
      let deltaBob = await delta(bobSigner, bobBalances)
      let deltaCarl = await delta(carlSigner, carlBalances)
      let deltaOwner = await delta(adminSigner, ownerBalances)

      // Expect Alice and Bob got the right output less the 2% fee + 1% slippage + 2% from ibAlluoX to X conversion`
      expect(deltaBob.stIbAlluoUSD).to.be.above(((deltaBob.stIbAlluoETH * oraclePrice) / 1e6) * -1 * 0.95)
      expect(deltaAlice.stIbAlluoETH).to.be.above((deltaAlice.stIbAlluoUSD / oraclePrice) * 1e6 * -1 * 0.95)
      // Expect Owner and Carl got their fee from Alice
      expect(
        deltaCarl.stIbAlluoETH / (deltaAlice.stIbAlluoETH + deltaCarl.stIbAlluoETH + deltaOwner.stIbAlluoETH)
      ).to.within(0.0025, 0.00251)
      expect(
        deltaOwner.stIbAlluoETH / (deltaAlice.stIbAlluoETH + deltaCarl.stIbAlluoETH + deltaOwner.stIbAlluoETH)
      ).to.within(0.0025, 0.00251)
      // Expect Owner got his fee from Bob
      expect(deltaOwner.stIbAlluoUSD / (deltaBob.stIbAlluoUSD + deltaOwner.stIbAlluoUSD)).to.within(
        0.0049999,
        0.0050001
      )
    })
  })

  xcontext('#3 - market is jailed', async () => {
    before(async () => {
      const success = await provider.send('evm_revert', [snapshot])

      await takeMeasurements()

      // Alice opens a USDC stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: aliceSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRateUsdc,
          userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl']),
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)
      // Bob opens a ETH stream to REXMarket
      await sf.cfaV1
        .createFlow({
          sender: bobSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoETH.address,
          flowRate: inflowRateEthHalf,
          shouldUseCallAgreement: true,
        })
        .exec(bobSigner)

      await sf.cfaV1
        .createFlow({
          sender: karenSigner.address,
          receiver: twoWayMarket.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRateUsdc,
          userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl']),
          shouldUseCallAgreement: true,
        })
        .exec(karenSigner)

      await increaseTime(3600)

      // NOTE: This method stopped working because of SF protocol changes
      // // Jail the app
      // await impersonateAndSetBalance(Constants.CFA_SUPERFLUID_ADDRESS);
      // let cfaSigner = await ethers.getSigner(Constants.CFA_SUPERFLUID_ADDRESS)
      // await sf.host.hostContract.connect(cfaSigner).jailApp('0x01', twoWayMarket.address, 0, {gasLimit: '3000000'})

      // NOTE: So instead you will need to modify the
      await sf.cfaV1
        .deleteFlow({
          receiver: twoWayMarket.address,
          sender: karenSigner.address,
          superToken: stIbAlluoUSD.address,
          shouldUseCallAgreement: true,
          overrides,
        })
        .exec(karenSigner)

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
      // await resetMeasurements();
    })

    it('#3.1 emergencyCloseStream', async () => {
      await twoWayMarket.emergencyCloseStream(aliceSigner.address, stIbAlluoUSD.address)
      await twoWayMarket.emergencyCloseStream(bobSigner.address, stIbAlluoETH.address)

      expect(await twoWayMarket.getStreamRate(aliceSigner.address, stIbAlluoUSD.address)).to.equal(0)

      expect(await twoWayMarket.getStreamRate(bobSigner.address, stIbAlluoETH.address)).to.equal(0)
    })

    it('#3.2 should correctly emergency drain', async () => {
      //
      // await expect(
      //     twoWayMarket.emergencyDrain(stIbAlluoETH.address),
      // ).to.be.revertedWith('!zeroStreamers');
      //
      // await expect(
      //     twoWayMarket.emergencyDrain(stIbAlluoUSD.address),
      // ).to.be.revertedWith('!zeroStreamers');

      // Close both flows
      // Delete Alices stream
      await sf.cfaV1
        .deleteFlow({
          receiver: twoWayMarket.address,
          sender: aliceSigner.address,
          superToken: stIbAlluoUSD.address,
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)

      // Delete Bobs stream
      await sf.cfaV1
        .deleteFlow({
          receiver: twoWayMarket.address,
          sender: bobSigner.address,
          superToken: stIbAlluoETH.address,
          shouldUseCallAgreement: true,
        })
        .exec(bobSigner)

      await twoWayMarket.emergencyDrain(stIbAlluoETH.address)
      await twoWayMarket.emergencyDrain(stIbAlluoUSD.address)
      await twoWayMarket.emergencyDrain(ricochetRIC.address)

      expect(
        (
          await stIbAlluoUSD.balanceOf({
            account: twoWayMarket.address,
            providerOrSigner: provider,
          })
        ).toString()
      ).to.equal('0')

      expect(
        (
          await stIbAlluoETH.balanceOf({
            account: twoWayMarket.address,
            providerOrSigner: provider,
          })
        ).toString()
      ).to.equal('0')

      expect(
        (
          await ricochetRIC.balanceOf({
            account: twoWayMarket.address,
            providerOrSigner: provider,
          })
        ).toString()
      ).to.equal('0')

      await takeMeasurements()

      // Check the owner recovers the funds sent in afterwards
      let appDelta = await delta(twoWayMarket, appBalances)
      let ownerDelta = await delta(adminSigner, ownerBalances)
      let aliceDelta = await delta(aliceSigner, aliceBalances)
      let bobDelta = await delta(bobSigner, bobBalances)

      // Expect the owner can recover the locked funds
      expect(ownerDelta.stIbAlluoETH).to.be.within(-1 * bobDelta.stIbAlluoETH * 0.99, -1 * bobDelta.stIbAlluoETH * 1.01)
      expect(ownerDelta.stIbAlluoUSD).to.be.within(
        -1 * aliceDelta.stIbAlluoUSD * 0.99,
        -1 * aliceDelta.stIbAlluoUSD * 1.01
      )
      // Recover the RIC subsidies
      expect(ownerDelta.ric).to.be.within(-1 * appDelta.ric * 0.99999, -1 * appDelta.ric * 1.00001)
    })

    it('#3.3 closeStream', async () => {
      let aliceBalanceUsdcx = await stIbAlluoUSD.balanceOf({
        account: aliceSigner.address,
        providerOrSigner: provider,
      })
      aliceBalanceUsdcx = ethers.BigNumber.from(aliceBalanceUsdcx.toString())
      // When user create stream, SF locks 4 hour deposit called initial deposit
      const initialDeposit = aliceBalanceUsdcx.div(ethers.BigNumber.from('13')).mul(ethers.BigNumber.from('4'))
      const inflowRate = aliceBalanceUsdcx
        .sub(initialDeposit)
        .div(ethers.BigNumber.from(9 * 3600))
        .toString()
      // Initialize a streamer with 9 hours of balance
      await sf.cfaV1
        .updateFlow({
          receiver: twoWayMarket.address,
          superToken: stIbAlluoUSD.address,
          flowRate: inflowRate.toString(),
          shouldUseCallAgreement: true,
        })
        .exec(aliceSigner)
      // Verfiy closing attempts revert
      await expect(twoWayMarket.closeStream(aliceSigner.address, stIbAlluoUSD.address)).to.revertedWith('!closable')
      // Advance time 2 hours
      await increaseTime(2 * 3600)
      // Verify closing the stream works
      aliceBalanceUsdcx = await stIbAlluoUSD.balanceOf({
        account: aliceSigner.address,
        providerOrSigner: provider,
      })
      await twoWayMarket.closeStream(aliceSigner.address, stIbAlluoUSD.address)
      expect(await twoWayMarket.getStreamRate(aliceSigner.address, stIbAlluoUSD.address)).to.equal('0')
    })
  })
})
