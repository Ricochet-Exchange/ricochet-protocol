import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import { HttpService } from "./../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TellorPlayground, REXTwoWayAlluoUsdcxMarket, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from "../typechain";
import { increaseTime, impersonateAndSetBalance } from "./../misc/helpers";
import { Constants } from "../misc/Constants";
import { AbiCoder, parseUnits } from "ethers/lib/utils";

const { provider, loadFixture } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours
// Index 1 is for Ether and 0 for USDCx
const USDCX_SUBSCRIPTION_INDEX = 0;
const IBALLUOUSD_SUBSCRIPTION_INDEX = 1;
const RIC_SUBSCRIPTION_INDEX = 2;
const ORACLE_PRECISION_DIGITS = 1000000;    // A six-digit precision is required by the Tellor oracle

export interface superTokenAndItsIDAIndex {
    token: SuperToken;
    IDAIndex: number;
}

describe('REXTwoWayAlluoUsdcxMarket', () => {
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    const overrides = { gasLimit: '6000000' }; // Using this to manually limit gas to avoid giga-errors.
    const inflowRateUsdc = "1000000000000000";
    const inflowRateUsdcDeposit = "4000000000000000"
    const inflowRateUsdc10x = "10000000000000000";
    const inflowRateEth = "1000000000000";
    const inflowRateEthHalf = "500000000000";
    const subsidyRate = "10000000000000";

    let rexReferral: REXReferral__factory;
    let REXMarketFactory: any;
    let referral: any;
    let snapshot: any;

    let adminSigner: SignerWithAddress;
    let aliceSigner: SignerWithAddress;
    let bobSigner: SignerWithAddress;
    let carlSigner: SignerWithAddress;
    let usdcxWhaleSigner: SignerWithAddress;
    let ethxWhaleSigner: SignerWithAddress;
    let maticxWhaleSigner: SignerWithAddress;
    let ibAlluoUSDWhaleSigner: SignerWithAddress;
    let ibAlluoETHWhaleSigner: SignerWithAddress;
    let karenSigner: SignerWithAddress;

    let oraclePrice: number;

    let appBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [], maticx: [] };
    let ownerBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [], maticx: [] };
    let aliceBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [], maticx: [] };
    let bobBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [], maticx: [] };
    let carlBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [], maticx: [] };
    let karenBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [], maticx: [] };

    let sf: Framework,
        superT: ISuperToken,
        u: { [key: string]: IUser },
        twoWayMarket: REXTwoWayAlluoUsdcxMarket,
        tokenss: { [key: string]: any },
        sfRegistrationKey: any,
        accountss: SignerWithAddress[],
        constant: { [key: string]: string },
        tp: TellorPlayground,
        ERC20: any;

    // ************** All the supertokens used in Ricochet are declared **********************
    let ibAlluoUSD: SuperToken;
    let ibAlluoETH: SuperToken;
    let ricochetRIC: SuperToken;
    let ricochetUSDCx: SuperToken;
    let ricochetUSDC: SuperToken;
    let weth: any;

    let usdcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ibAlluoUSDAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ricAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ricAndItsOtherIDAIndex: superTokenAndItsIDAIndex;

    // ***************************************************************************************
    async function takeMeasurements(balances: SuperTokensBalances, signer: SignerWithAddress): Promise<void> {

        appBalances.ibAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString());
        ownerBalances.ibAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ibAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ibAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        karenBalances.ibAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ibAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.ricochetUSDCx.push((await ricochetUSDCx.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString());
        ownerBalances.ricochetUSDCx.push((await ricochetUSDCx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ricochetUSDCx.push((await ricochetUSDCx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ricochetUSDCx.push((await ricochetUSDCx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        karenBalances.ricochetUSDCx.push((await ricochetUSDCx.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ricochetUSDCx.push((await ricochetUSDCx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.ric.push((await superT.ric.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString());
        ownerBalances.ric.push((await superT.ric.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ric.push((await superT.ric.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ric.push((await superT.ric.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        karenBalances.ric.push((await superT.ric.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ric.push((await superT.ric.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());
    }

    async function resetMeasurements(): Promise<void> {
        appBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [] };
        ownerBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [] };
        aliceBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [] };
        bobBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [] };
        carlBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [] };
        karenBalances = { ibAlluoUSD: [], ricochetUSDCx: [], ric: [] };
    }

    async function approveSubscriptions(tokensAndIDAIndexes: superTokenAndItsIDAIndex[], signers: SignerWithAddress[]) {
        console.log("  ======== Inside approveSubscriptions ===========");
        let tokenIndex: number;
        for (let i = 0; i < signers.length; i++) {
            for (let j = 0; j < tokensAndIDAIndexes.length; j++) {
                tokenIndex = tokensAndIDAIndexes[j].IDAIndex;
                await sf.idaV1
                    .approveSubscription({
                        indexId: tokenIndex.toString(),
                        superToken: tokensAndIDAIndexes[j].token.address,
                        publisher: twoWayMarket.address,
                        userData: "0x",
                    })
                    .exec(signers[i]);
                console.log("====== ", i, " subscription to token ", j, " approved =======");
            }
        }
    }

    async function checkBalance(user: SignerWithAddress, name: string) {
        console.log(" checkBalance START ======== Balance of ", name, " with address: ", user.address, " ============= ");
        let balanceUsdcx = await ricochetUSDCx.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let balanceIballuoUSD = await ibAlluoUSD.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let balanceRic = await ricochetRIC.balanceOf({
            account: user.address, providerOrSigner: provider
        });

        console.log("Balance in USDCx: ", balanceUsdcx);
        console.log("Balance in ibAlluoUSD: ", balanceIballuoUSD);
        console.log("Balance in RIC: ", balanceRic);
        console.log(" checkBalance END ====================================================== ");
    }

    async function delta(account: SignerWithAddress, balances: any) {
        const len = balances.ricochetUSDCx.length;
        return {
            ricochetUSDCx: balances.ricochetUSDCx[len - 1] - balances.ricochetUSDCx[len - 2],
            ibAlluoUSD: balances.ibAlluoUSD[len - 1] - balances.ibAlluoUSD[len - 2],
            ric: balances.ric[len - 1] - balances.ric[len - 2],
        }
    }

    before(async () => {
      hre.tracer.enable = false;
        const {
            superfluid,
            users,
            accounts,
            tokens,
            superTokens,
            contracts,
            constants,
            tellor,
        } = await setup();
        console.log("============ Right after initSuperfluid() ==================");

        const { createSFRegistrationKey } = await common();

        u = users;
        sf = superfluid;
        superT = superTokens;
        tokenss = tokens;
        accountss = accounts;
        sfRegistrationKey = createSFRegistrationKey;
        constant = constants;
        tp = tellor;

        // This order is established in misc/setup.ts
        adminSigner = accountss[0];
        aliceSigner = accountss[1];
        bobSigner = accountss[2];
        carlSigner = accountss[3];
        karenSigner = accountss[4];
        usdcxWhaleSigner = accountss[5];
        ibAlluoUSDWhaleSigner = accountss[8];

        ricochetRIC = superT.ric;
        ricochetUSDCx = superT.usdcx;
        ibAlluoUSD = superT.stIbAlluoUSD;
        weth = tokenss.weth

        // TODO: Please refactor this
        ibAlluoUSDAndItsIDAIndex = {
            token: ibAlluoUSD,
            IDAIndex: 0,
        }
        ricAndItsIDAIndex = {
            token: ricochetRIC,
            IDAIndex: 1,
        }


        console.log("======******** List of addresses =======");
        for (let i = 0; i < accountss.length; i++) {
            console.log("Address number ", i, ": ", accountss[i].address);
        }
        console.log("++++++++++++++ alice address number: ", aliceSigner.address);
        console.log("++++++++++++++ bob address number: ", bobSigner.address);
        console.log("++++++++++++++ carl address number: ", carlSigner.address);

        console.log("======******** List of TOKENS addresses =======");
        console.log("======** ibAlluoUSD's address: ", ibAlluoUSD.address);
        console.log("======** USDCx's address: ", ricochetUSDCx.address);
        // ==============================================================================

        // Deploy REXReferral
        rexReferral = await ethers.getContractFactory("REXReferral", {
            signer: adminSigner,
        });
        referral = await rexReferral.deploy();
        await referral.deployed();
        console.log("=========== Deployed REXReferral ============");

        // ==============================================================================
        const registrationKey = await sfRegistrationKey(sf, adminSigner.address);
        console.log("============ Right after sfRegistrationKey() ==================");

        // ==============
        // Deploy REX Market
        console.log("Deploying REXTwoWayAlluoUsdcxMarket...");
        REXMarketFactory = await ethers.getContractFactory(
            "REXTwoWayAlluoUsdcxMarket",
            adminSigner
        );
        console.log("admin signer address:", adminSigner.address);
        twoWayMarket = await REXMarketFactory.deploy(
            adminSigner.address,
            sf.settings.config.hostAddress,
            Constants.CFA_SUPERFLUID_ADDRESS,
            Constants.IDA_SUPERFLUID_ADDRESS,
            registrationKey,
            referral.address
        );
        console.log("=========== Deployed REXTwoWayAlluoUsdcxMarket ============");

        console.log("initializeTwoWayMarket", ibAlluoUSD.address, ricochetUSDCx.address);
        await twoWayMarket.initializeTwoWayMarket(
            ricochetUSDCx.address,
            Constants.TELLOR_USDC_REQUEST_ID,
            1,
            ibAlluoUSD.address,
            Constants.TELLOR_USDC_REQUEST_ID,
            1,
            0,
            20000
        );
        console.log("=========== Initialized TwoWayMarket ============");

        await twoWayMarket.initializeSubsidies(subsidyRate, ricochetRIC.address);
        console.log("========== Initialized subsidies ===========");

        await checkBalance(ibAlluoUSDWhaleSigner, "the ibAlluoUSD whale");
        await checkBalance(usdcxWhaleSigner, "the USDCx whale");
        // send the contract some RIC
        try {
            await ricochetRIC.transfer({
                receiver: twoWayMarket.address,
                amount: "1000000000000000000"
            }).exec(adminSigner);
        } catch (err: any) {
            console.log("Ricochet - ERROR transferring RICs to the contract: ", err);
        }
        console.log("============ RICs have been sent to the contract =============");
        await checkBalance(adminSigner, "the contract");

        // Register the market with REXReferral
        await referral.registerApp(twoWayMarket.address);
        referral = await referral.connect(carlSigner);
        await referral.applyForAffiliate("carl", "carl");
        referral = await referral.connect(adminSigner);
        await referral.verifyAffiliate("carl");
        console.log("                      ============ The affiliate has been veryfied =============");
        console.log("=======================================================================");
        console.log("================ End of \"before\" block ==============================");
        console.log("=======================================================================");


        // Do all the approvals
        // TODO: Redo how indexes are setup
        await approveSubscriptions([ibAlluoUSDAndItsIDAIndex, ricAndItsIDAIndex],
            [adminSigner, aliceSigner, bobSigner, karenSigner, carlSigner]);

        // Give Alice, Bob, Karen some tokens
        let initialAmount = ethers.utils.parseUnits("1000", 18).toString();
        await ricochetUSDCx
            .transfer({
                receiver: aliceSigner.address,
                amount: initialAmount,
            }).exec(usdcxWhaleSigner);
        console.log("====== Transferred USDCx to alice =======");
        await ricochetUSDCx
            .transfer({
                receiver: bobSigner.address,
                amount: initialAmount,
            }).exec(usdcxWhaleSigner);
        console.log("====== Transferred USDCx to bob =======");

        await ibAlluoUSD
            .transfer({
                receiver: bobSigner.address,
                amount: initialAmount,
            }).exec(ibAlluoUSDWhaleSigner);
        console.log("====== Transferred USDCx to bob =======");

        await ricochetUSDCx
            .transfer({
                receiver: karenSigner.address,
                amount: initialAmount,
            }).exec(usdcxWhaleSigner);
        console.log("====== Transferred USDCx to karen =======");
        await ricochetRIC
            .transfer({
                receiver: bobSigner.address,
                amount: '1000000000000000000000',
            }).exec(adminSigner);
            console.log("RIC")

        // Take a snapshot to avoid redoing the setup
        snapshot = await provider.send('evm_snapshot', []);

    });

    context.only("#1 - new rexmarket with no streamers", async () => {

        beforeEach(async () => {
            // Revert to the point REXMarket was just deployed
            const success = await provider.send('evm_revert', [
                snapshot
            ]);
            // Take another snapshot to be able to revert again next time
            snapshot = await provider.send('evm_snapshot', []);
            expect(success).to.equal(true);
        });

        afterEach(async () => {
            // Check the app isn't jailed
            expect(await twoWayMarket.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        it("#1.1 getters/setters", async () => {

            await twoWayMarket.setRateTolerance(1000);
            expect(await twoWayMarket.getRateTolerance()).to.equal(1000);
            await twoWayMarket.setFeeRate(0, 1000);
            expect(await twoWayMarket.getFeeRate(0)).to.equal(1000);
            await twoWayMarket.setEmissionRate(0, 1000);
            expect(await twoWayMarket.getEmissionRate(0)).to.equal(1000);
            expect((await twoWayMarket.getOutputPool(0)).toString()).to.equal(`${ibAlluoUSD.address},1000,1000,1`);
            expect((await twoWayMarket.getLastDistributionAt()).toNumber()).to.be.above(0)


        });

        it("#1.2 before/afterAgreementCreated callbacks", async () => {

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);
            console.log("Create flow alice");
            // Expect share allocations were done correctly
            expect(
                await twoWayMarket.getStreamRate(aliceSigner.address, ricochetUSDCx.address)
            ).to.equal(inflowRateUsdc);
            expect(
                (await twoWayMarket.getIDAShares(IBALLUOUSD_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,true,1000000000000000,0`);
            // No fees

            // Bob opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);
            console.log("Create flow bob");
            // Expect share allocations were done correctly
            expect(
                await twoWayMarket.getStreamRate(bobSigner.address, ricochetUSDCx.address)
            ).to.equal(inflowRateUsdc);
            expect(
                (await twoWayMarket.getIDAShares(IBALLUOUSD_SUBSCRIPTION_INDEX, bobSigner.address)).toString()
            ).to.equal(`true,true,1000000000000000,0`);

        });

        // TODO: before/afterAgreementUpdated

        it("#1.3 before/afterAgreementTerminated callbacks", async () => {

            await takeMeasurements();

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Bob opens a ETH stream to REXMarket
            // await sf.cfaV1.createFlow({
            //     sender: bobSigner.address,
            //     receiver: twoWayMarket.address,
            //     superToken: ricochetUSDCx.address,
            //     flowRate: inflowRateUsdc10x,
            // }).exec(bobSigner);

            await increaseTime(3600)

            // Delete Alices stream before first  distributions
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: aliceSigner.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Delete Alices stream before first  distributions
            // await sf.cfaV1.deleteFlow({
            //     receiver: twoWayMarket.address,
            //     sender: bobSigner.address,
            //     superToken: ricochetUSDCx.address
            // }).exec(bobSigner);

            await takeMeasurements();

            // Check balance for alice again
            let aliceDelta = await delta(aliceSigner, aliceBalances);
            let bobDelta = await delta(bobSigner, bobBalances);

            console.log("babBalances", bobBalances)
            console.log("aliceBalances", aliceBalances)

            // Expect alice didn't lose anything since she closed stream before distribute
            expect(aliceDelta.ricochetUSDCx).to.equal(0);
            expect(aliceDelta.ricochetUSDCx).to.equal(0);

            // TODO: expect(bobDelta.ibAlluoETH).to.equal(0);

            // Expect share allocations were done correctly
            expect(
                await twoWayMarket.getStreamRate(aliceSigner.address, ricochetUSDCx.address)
            ).to.equal('0');
            expect(
                await twoWayMarket.getStreamRate(bobSigner.address, ricochetUSDCx.address)
            ).to.equal('0');
            expect(
                (await twoWayMarket.getIDAShares(IBALLUOUSD_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await twoWayMarket.getIDAShares(IBALLUOUSD_SUBSCRIPTION_INDEX, bobSigner.address)).toString()
            ).to.equal(`true,true,0,0`);


        });

        it("#1.4 one-sided distribution USDCx > ibAlluoUSD", async () => {
            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc10x,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);

            // Check balance
            await takeMeasurements();

            // Fast forward an hour and distribute
            await increaseTime(3600);
            await twoWayMarket.distribute("0x");

            // Check balances again
            await takeMeasurements();

            // Compute the delta
            let deltaAlice = await delta(aliceSigner, aliceBalances);
            let deltaBob = await delta(bobSigner, bobBalances);

            // NOTE: Pulled manually from the forked block number
            let realGrowingRatio = 1.031139986258114078;

            // Expect Alice and Bob got the right output
            console.log("Alice got this much ibAlluoUSD", deltaAlice.ibAlluoUSD);
            console.log("Alice paid this much USDCx", -1 * deltaAlice.ricochetUSDCx);
            console.log("ibAlluoETH/USD rate", -1*deltaAlice.ricochetUSDCx/deltaAlice.ibAlluoUSD);
            console.log("actual growing ratio", realGrowingRatio);
            console.log("loss", (-1*deltaAlice.ricochetUSDCx/deltaAlice.ibAlluoUSD - realGrowingRatio) / realGrowingRatio);

            // Expect Alice and Bob got the right output less the 2% fee + 1% slippage
            console.log("Bob got this much ibAlluoUSD", deltaBob.ibAlluoUSD);
            console.log("Bob paid this much USDCx", -1 * deltaBob.ricochetUSDCx);
            console.log("ibAlluoETH/USD rate", -1*deltaBob.ricochetUSDCx/deltaBob.ibAlluoUSD);
            console.log("actual growing ratio", realGrowingRatio);
            console.log("loss", (-1*deltaBob.ricochetUSDCx/deltaBob.ibAlluoUSD - realGrowingRatio) / realGrowingRatio);


            // console.log("Bob got this much USDCx", deltaBob.ricochetUSDCx);
            // console.log("Bob paid this much ibAlluoUSD", -1 * deltaBob.ibAlluoUSD);
            // console.log("ibAlluoETH/USD rate", -1*deltaBob.ibAlluoUSD/deltaAlice.ricochetUSDCx);
            // console.log("actual growing ratio", realGrowingRatio);
            // console.log("loss", (-1*deltaBob.ibAlluoUSD/deltaAlice.ricochetUSDCx - realGrowingRatio) / realGrowingRatio);


            // Expect the growing ratio
            // NOTE: There's a bit of loss in the rate due to a remainder from division in the IDA distribution
            // Check here that that loss is less than 0.03%
            expect((-1*deltaAlice.ricochetUSDCx/deltaAlice.ibAlluoUSD - realGrowingRatio) / realGrowingRatio).to.be.below(0.0003);
            expect((-1*deltaBob.ricochetUSDCx/deltaBob.ibAlluoUSD - realGrowingRatio) / realGrowingRatio).to.be.below(0.0003);

        });

    });

    xcontext("#3 - market is jailed", async () => {

        before(async () => {
            const success = await provider.send('evm_revert', [
                snapshot
            ]);

            await takeMeasurements();

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);
            // Bob opens a ETH stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateEthHalf,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);

            await sf.cfaV1.createFlow({
                sender: karenSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(karenSigner);

            await increaseTime(3600);

            // NOTE: This method stopped working because of SF protocol changes
            // // Jail the app
            // await impersonateAndSetBalance(Constants.CFA_SUPERFLUID_ADDRESS);
            // let cfaSigner = await ethers.getSigner(Constants.CFA_SUPERFLUID_ADDRESS)
            // await sf.host.hostContract.connect(cfaSigner).jailApp('0x01', twoWayMarket.address, 0, {gasLimit: '3000000'})

            // NOTE: So instead you will need to modify the
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: karenSigner.address,
                superToken: ibAlluoUSD.address,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(karenSigner);

            // Take a snapshot
            snapshot = await provider.send('evm_snapshot', []);

        });

        beforeEach(async () => {
            // Revert to the point REXMarket was just deployed
            const success = await provider.send('evm_revert', [
                snapshot
            ]);
            // Take another snapshot to be able to revert again next time
            snapshot = await provider.send('evm_snapshot', []);
            expect(success).to.equal(true);
        });

        afterEach(async () => {
            // Check the app isn't jailed
            // await resetMeasurements();
        });

        it("#3.1 emergencyCloseStream", async () => {

            await twoWayMarket.emergencyCloseStream(aliceSigner.address, ibAlluoUSD.address);
            await twoWayMarket.emergencyCloseStream(bobSigner.address, ibAlluoETH.address);

            expect(
                await twoWayMarket.getStreamRate(aliceSigner.address, ibAlluoUSD.address)
            ).to.equal(0);

            expect(
                await twoWayMarket.getStreamRate(bobSigner.address, ibAlluoETH.address)
            ).to.equal(0);

        });

        it("#3.2 should correctly emergency drain", async () => {
            //
            // await expect(
            //     twoWayMarket.emergencyDrain(ibAlluoETH.address),
            // ).to.be.revertedWith('!zeroStreamers');
            //
            // await expect(
            //     twoWayMarket.emergencyDrain(ibAlluoUSD.address),
            // ).to.be.revertedWith('!zeroStreamers');

            // Close both flows
            // Delete Alices stream
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: aliceSigner.address,
                superToken: ibAlluoUSD.address,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Delete Bobs stream
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: bobSigner.address,
                superToken: ibAlluoETH.address,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);

            await twoWayMarket.emergencyDrain(ibAlluoETH.address);
            await twoWayMarket.emergencyDrain(ibAlluoUSD.address);
            await twoWayMarket.emergencyDrain(ricochetRIC.address);

            expect((await ibAlluoUSD.balanceOf({
                account: twoWayMarket.address, providerOrSigner: provider
            })).toString()).to.equal('0');

            expect((await ibAlluoETH.balanceOf({
                account: twoWayMarket.address, providerOrSigner: provider
            })).toString()).to.equal('0');

            expect((await ricochetRIC.balanceOf({
                account: twoWayMarket.address, providerOrSigner: provider
            })).toString()).to.equal('0');

            await takeMeasurements();

            // Check the owner recovers the funds sent in afterwards
            let appDelta = await delta(twoWayMarket, appBalances);
            let ownerDelta = await delta(adminSigner, ownerBalances);
            let aliceDelta = await delta(aliceSigner, aliceBalances);
            let bobDelta = await delta(bobSigner, bobBalances);

            // Expect the owner can recover the locked funds
            expect(ownerDelta.ibAlluoETH).to.be.within(-1 * bobDelta.ibAlluoETH * 0.99, -1 * bobDelta.ibAlluoETH * 1.01);
            expect(ownerDelta.ibAlluoUSD).to.be.within(-1 * aliceDelta.ibAlluoUSD * 0.99, -1 * aliceDelta.ibAlluoUSD * 1.01);
            // Recover the RIC subsidies
            expect(ownerDelta.ric).to.be.within(-1 * appDelta.ric * 0.99999, -1 * appDelta.ric * 1.00001);


        });

        it("#3.3 closeStream", async () => {

            let aliceBalanceUsdcx = await ibAlluoUSD.balanceOf({
                account: aliceSigner.address, providerOrSigner: provider
            });
            aliceBalanceUsdcx = ethers.BigNumber.from(aliceBalanceUsdcx.toString())
            // When user create stream, SF locks 4 hour deposit called initial deposit
            const initialDeposit = aliceBalanceUsdcx.div(ethers.BigNumber.from('13')).mul(ethers.BigNumber.from('4'));
            const inflowRate = aliceBalanceUsdcx.sub(initialDeposit).div(ethers.BigNumber.from(9 * 3600)).toString();
            // Initialize a streamer with 9 hours of balance
            await sf.cfaV1.updateFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ibAlluoUSD.address,
                flowRate: inflowRate.toString(),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);
            // Verfiy closing attempts revert
            await expect(twoWayMarket.closeStream(aliceSigner.address, ibAlluoUSD.address)).to.revertedWith('!closable');
            // Advance time 2 hours
            await increaseTime(2 * 3600);
            // Verify closing the stream works
            aliceBalanceUsdcx = await ibAlluoUSD.balanceOf({
                account: aliceSigner.address, providerOrSigner: provider
            });
            await twoWayMarket.closeStream(aliceSigner.address, ibAlluoUSD.address);
            expect(await twoWayMarket.getStreamRate(aliceSigner.address, ibAlluoUSD.address)).to.equal('0');

        });

    });

});
