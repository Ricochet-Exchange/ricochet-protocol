import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import { HttpService } from "./../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TellorPlayground, REXTwoWayUniswapMarket, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from "../typechain";
import { increaseTime, impersonateAndSetBalance } from "./../misc/helpers";
import { Constants } from "../misc/Constants";
import { AbiCoder, parseUnits } from "ethers/lib/utils";

const { provider, loadFixture } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours
// Index 1 is for Ether and 0 for USDCx
const USDCX_SUBSCRIPTION_INDEX = 0;
const ETHX_SUBSCRIPTION_INDEX = 1;
const RIC_SUBSCRIPTION_INDEX = 2;
const ORACLE_PRECISION_DIGITS = 1000000;    // A six-digit precision is required by the Tellor oracle

export interface superTokenAndItsIDAIndex {
    token: SuperToken;
    IDAIndex: number;
}

describe('REXUniswapTwoWayMarket', () => {
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    const inflowRateUsdc = "1000000000000000";
    const inflowRateUsdcDeposit = "4000000000000000"
    const inflowRateUsdc10x = "10000000000000000";
    const inflowRateEth = "10000000000000";
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
    let karenSigner: SignerWithAddress;

    let oraclePrice: number;
    let ricOraclePrice: number;
    let maticOraclePrice: number;

    // interface SuperTokensBalances {
    //     outputx: string[];
    //     ethx: string[];
    //     wbtcx: string[];
    //     daix: string[];
    //     usdcx: string[];
    //     ric: string[];
    // };

    let appBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let ownerBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let aliceBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let bobBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let carlBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let karenBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };

    let sf: Framework,
        superT: ISuperToken,
        u: { [key: string]: IUser },
        twoWayMarket: REXTwoWayUniswapMarket,
        tokenss: { [key: string]: any },
        sfRegistrationKey: any,
        accountss: SignerWithAddress[],
        constant: { [key: string]: string },
        tp: TellorPlayground,
        ERC20: any;

    // ************** All the supertokens used in Ricochet are declared **********************
    let ricochetMATICx: SuperToken;
    let ricochetUSDCx: SuperToken;
    let ricochetETHx: SuperToken;
    let ricochetWBTCx: SuperToken;
    let ricochetRIC: SuperToken;

    let usdcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ethxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ricAndItsIDAIndex: superTokenAndItsIDAIndex;
    let wbtcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let maticxAndItsIDAIndex: superTokenAndItsIDAIndex;

    // ***************************************************************************************

    async function takeMeasurements(balances: SuperTokensBalances, signer: SignerWithAddress): Promise<void> {
        appBalances.ethx.push((await superT.ethx.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString());
        ownerBalances.ethx.push((await superT.ethx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ethx.push((await superT.ethx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ethx.push((await superT.ethx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.ethx.push((await superT.ethx.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ethx.push((await superT.ethx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.usdcx.push((await superT.usdcx.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString());
        ownerBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.usdcx.push((await superT.usdcx.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.ric.push((await superT.ric.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString());
        ownerBalances.ric.push((await superT.ric.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ric.push((await superT.ric.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ric.push((await superT.ric.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.ric.push((await superT.ric.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ric.push((await superT.ric.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.maticx.push((await superT.maticx.balanceOf({ account: twoWayMarket.address, providerOrSigner: provider })).toString());
        ownerBalances.maticx.push((await superT.maticx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.maticx.push((await superT.maticx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.maticx.push((await superT.maticx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.ric.push((await superT.ric.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.maticx.push((await superT.maticx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());
    }

    async function resetMeasurements(): Promise<void> {
        appBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
        ownerBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
        aliceBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
        bobBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
        carlBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
        karenBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
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
        let balanceEthx = await ricochetETHx.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let balanceUsdcx = await ricochetUSDCx.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let balanceRic = await ricochetRIC.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let balanceMatic = await ricochetMATICx.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        console.log("Balance in ETHX: ", balanceEthx);
        console.log("Balance in USDCX: ", balanceUsdcx);
        console.log("Balance in RIC: ", balanceRic);
        console.log("Balance in MATICx: ", balanceMatic);
        console.log(" checkBalance END ====================================================== ");
    }

    async function delta(account: SignerWithAddress, balances: any) {
        const len = balances.ethx.length;
        return {
            ethx: balances.ethx[len - 1] - balances.ethx[len - 2],
            usdcx: balances.usdcx[len - 1] - balances.usdcx[len - 2],
            ric: balances.ric[len - 1] - balances.ric[len - 2],
            maticx: balances.maticx[len - 1] - balances.maticx[len - 2]
        }
    }

    before(async () => {
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
        ethxWhaleSigner = accountss[6];
        maticxWhaleSigner = accountss[7];

        ricochetMATICx = superT.maticx;
        ricochetUSDCx = superT.usdcx;
        ricochetETHx = superT.ethx;
        ricochetWBTCx = superT.wbtcx;
        ricochetRIC = superT.ric;

        usdcxAndItsIDAIndex = {
            token: ricochetUSDCx,
            IDAIndex: USDCX_SUBSCRIPTION_INDEX,
        }
        ethxAndItsIDAIndex = {
            token: ricochetETHx,
            IDAIndex: ETHX_SUBSCRIPTION_INDEX,
        }
        ricAndItsIDAIndex = {
            token: ricochetRIC,
            IDAIndex: RIC_SUBSCRIPTION_INDEX,
        }

        // ==============================================================================
        const registrationKey = await sfRegistrationKey(sf, adminSigner.address);
        console.log("============ Right after sfRegistrationKey() ==================");

        console.log("======******** List of addresses =======");
        for (let i = 0; i < accountss.length; i++) {
            console.log("Address number ", i, ": ", accountss[i].address);
        }
        console.log("++++++++++++++ alice address number: ", aliceSigner.address);
        console.log("++++++++++++++ bob address number: ", bobSigner.address);
        console.log("++++++++++++++ carl address number: ", carlSigner.address);

        console.log("======******** List of TOKENS addresses =======");
        console.log("======** usdc's address: ", ricochetUSDCx.address);
        // ==============================================================================
        let whaleEthxBalance = await ricochetETHx.balanceOf({
            account: Constants.ETHX_SOURCE_ADDRESS, providerOrSigner: provider
        });
        console.log("WHALE's Balance in ETHX: ", whaleEthxBalance);

        // ==============================================================================

        // Deploy REXReferral
        rexReferral = await ethers.getContractFactory("REXReferral", {
            signer: adminSigner,
        });
        referral = await rexReferral.deploy();
        await referral.deployed();
        console.log("=========== Deployed REXReferral ============");

        // ==============
        // Deploy REX Market
        console.log("Deploying REXTwoWayMarket...");
        REXMarketFactory = await ethers.getContractFactory(
            "REXTwoWayUniswapMarket",
            adminSigner
        );
        twoWayMarket = await REXMarketFactory.deploy(
            adminSigner.address,
            sf.settings.config.hostAddress,
            Constants.CFA_SUPERFLUID_ADDRESS,
            Constants.IDA_SUPERFLUID_ADDRESS,
            registrationKey,
            referral.address
        );
        console.log("=========== Deployed REXUniswapTwoWayMarket ============");

        // Update the oracles
        let httpService = new HttpService();
        // const url = "https://api.coingecko.com/api/v3/simple/price?ids=" + Constants.COINGECKO_KEY + "&vs_currencies=usd";
        // let response = await httpService.get(url);
        // oraclePrice = parseInt(response.data[Constants.COINGECKO_KEY].usd) * ORACLE_PRECISION_DIGITS;
        oraclePrice = 4110000000; // close price on block 22877930
        console.log("oraclePrice: ", oraclePrice.toString());
        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
        ricOraclePrice = 1710000;
        console.log("RIC oraclePrice: ", ricOraclePrice.toString());
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        maticOraclePrice = 2680000;
        console.log("MATIC oraclePrice: ", maticOraclePrice.toString());
        await tp.submitValue(Constants.TELLOR_MATIC_REQUEST_ID, maticOraclePrice);
        console.log("=========== Updated the oracles ============");
        // IMPORTANT --> the oracles must be updated before calling initializeTwoWayMarket

        await twoWayMarket.initializeTwoWayMarket(
            ricochetUSDCx.address,
            Constants.TELLOR_USDC_REQUEST_ID,
            1e7,
            ricochetETHx.address,
            Constants.TELLOR_ETH_REQUEST_ID,
            1e9,
            20000,
            20000
        );
        console.log("=========== Initialized TwoWayMarket ============");

        // Initialize the Superswap
        await twoWayMarket.initializeSuperSwap(
            true,
            true,
            [3000],
            "0x2995702816a86086Baa799F44F76c33111094498"
        );
        console.log("=========== Initialized Superswap ============");

        await twoWayMarket.initializeSubsidies(subsidyRate, ricochetRIC.address);
        console.log("========== Initialized subsidies ===========");

        await checkBalance(ethxWhaleSigner, "the ETHX whale");
        await checkBalance(maticxWhaleSigner, "the MATICx whale");
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
        console.log("                      ============ The affiliate has been verified =============");
        console.log("=======================================================================");
        console.log("================ End of \"before\" block ==============================");
        console.log("=======================================================================");

        // Give Alice, Bob, Karen some tokens
        const initialAmount = ethers.utils.parseUnits("1000", 18).toString();
        await ricochetUSDCx
            .transfer({
                receiver: aliceSigner.address,
                amount: initialAmount,
            }).exec(usdcxWhaleSigner);
        console.log("====== Transferred to alice =======");
        await ricochetETHx
            .transfer({
                receiver: bobSigner.address,
                amount: ethers.utils.parseUnits("0.5", 18).toString(),
            }).exec(ethxWhaleSigner);
            console.log("ETH")
        await ricochetRIC
            .transfer({
                receiver: bobSigner.address,
                amount: '1000000000000000000000',
            }).exec(adminSigner);
            console.log("RIC")
        await ricochetMATICx
            .transfer({
                receiver: bobSigner.address,
                amount: '1754897259852523432',
            }).exec(maticxWhaleSigner);
            console.log("MATIC")
        console.log("====== Transferred to bob =======");
        await ricochetUSDCx
            .transfer({
                receiver: karenSigner.address,
                amount: initialAmount,
            }).exec(usdcxWhaleSigner);
        console.log("====== Transferred to karen =======");

        // Do all the approvals
        // TODO: Redo how indexes are setup
        await approveSubscriptions([usdcxAndItsIDAIndex, ethxAndItsIDAIndex, ricAndItsIDAIndex],
            [adminSigner, aliceSigner, bobSigner, karenSigner, carlSigner]);


        // Take a snapshot to avoid redoing the setup
        snapshot = await provider.send('evm_snapshot', []);

    });

    context("#1 - new rexmarket with no streamers", async () => {

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
            expect((await twoWayMarket.getOutputPool(0)).toString()).to.equal(`${ricochetUSDCx.address},1000,1000,${1e7}`);
            expect((await twoWayMarket.getLastDistributionAt()).toNumber()).to.be.above(0)


        });

        it.only("#1.2 before/afterAgreementCreated callbacks", async () => {

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Expect share allocations were done correctly
            expect(
                await twoWayMarket.getStreamRate(aliceSigner.address, ricochetUSDCx.address)
            ).to.equal(inflowRateUsdc);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,true,980000,0`);
            // Admin and Carl split 2% of the shares bc of the 50% referral fee
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
            ).to.equal(`true,true,10000,0`);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()
            ).to.equal(`true,true,10000,0`);

            // Bob opens a ETH stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetETHx.address,
                flowRate: inflowRateEth,
            }).exec(bobSigner);

            // Expect share allocations were done correctly
            expect(
                await twoWayMarket.getStreamRate(bobSigner.address, ricochetETHx.address)
            ).to.equal(inflowRateEth);
            expect(
                (await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, bobSigner.address)).toString()
            ).to.equal(`true,true,980000,0`);
            // Admin gets all of the 2% bc bob was an organic referral
            expect(
                (await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
            ).to.equal(`true,true,20000,0`);
            expect(
                (await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()
            ).to.equal(`true,true,0,0`);

        });

        it("#1.3 before/afterAgreementTerminated callbacks", async () => {

            await takeMeasurements();

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
            }).exec(aliceSigner);

            // Bob opens a ETH stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetETHx.address,
                flowRate: inflowRateEth,
            }).exec(bobSigner);

            await increaseTime(3600)

            // Delete Alices stream before first  distributions
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: aliceSigner.address,
                superToken: ricochetUSDCx.address
            }).exec(aliceSigner);

            // Delete Alices stream before first  distributions
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: bobSigner.address,
                superToken: ricochetETHx.address
            }).exec(bobSigner);

            await takeMeasurements();

            // Check balance for alice again
            let aliceDelta = await delta(aliceSigner, aliceBalances);
            let bobDelta = await delta(bobSigner, bobBalances);

            // Expect alice didn't lose anything since she closed stream before distribute
            expect(aliceDelta.usdcx).to.equal(0);
            expect(bobDelta.ethx).to.equal(0);
            // Expect share allocations were done correctly
            expect(
                await twoWayMarket.getStreamRate(aliceSigner.address, ricochetUSDCx.address)
            ).to.equal('0');
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, bobSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await twoWayMarket.getIDAShares(USDCX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
            ).to.equal(`true,true,0,0`);

        });

        it("#1.4 one-sided distribution", async () => {
            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
            }).exec(aliceSigner);

            // Check balance
            await takeMeasurements();

            // Fast forward an hour and distribute
            await increaseTime(3600);
            await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
            await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await twoWayMarket.updateTokenPrices();
            await twoWayMarket.distribute("0x");

            // Check balances again
            await takeMeasurements();

            // Compute the delta
            let deltaAlice = await delta(aliceSigner, aliceBalances);
            let deltaCarl = await delta(carlSigner, carlBalances);
            let deltaOwner = await delta(adminSigner, ownerBalances);

            // Expect Alice and Bob got the right output less the 2% fee + 1% slippage
            expect(deltaAlice.ethx).to.be.above(deltaAlice.usdcx / oraclePrice * 1e6 * -1 * 0.97)
            // Expect Owner and Carl got their fee from Alice
            expect(deltaCarl.ethx / (deltaAlice.ethx + deltaCarl.ethx + deltaOwner.ethx)).to.within(0.00999, 0.01)
            expect(deltaOwner.ethx / (deltaAlice.ethx + deltaCarl.ethx + deltaOwner.ethx)).to.within(0.00999, 0.01)
        });

    });

    context("#2 - existing market with streamers on both sides", async () => {

        before(async () => {
            const success = await provider.send('evm_revert', [
                snapshot
            ]);

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
            }).exec(aliceSigner);
            // Bob opens a ETH stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetETHx.address,
                flowRate: inflowRateEth,
            }).exec(bobSigner);

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
            expect(await twoWayMarket.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        after(async () => {
            // Close the streams for and leave a clean snapshot for next context
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: aliceSigner.address,
                superToken: ricochetUSDCx.address
            }).exec(aliceSigner);

            // Delete Bobs stream
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: bobSigner.address,
                superToken: ricochetETHx.address
            }).exec(bobSigner);

            snapshot = await provider.send('evm_snapshot', []);

        })

        it("#2.1 before/afterAgreementCreated callbacks", async () => {

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: karenSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
            }).exec(karenSigner);

            // Expect share allocations were done correctly
            expect(
                await twoWayMarket.getStreamRate(karenSigner.address, ricochetUSDCx.address)
            ).to.equal(inflowRateUsdc);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,true,980000,0`);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, karenSigner.address)).toString()
            ).to.equal(`true,true,980000,0`);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
            ).to.equal(`true,true,30000,0`);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()
            ).to.equal(`true,true,10000,0`);

        });

        it("#2.2 before/afterAgreementUpdated callbacks", async () => {

            // Update Alices stream
            await sf.cfaV1.updateFlow({
                receiver: twoWayMarket.address,
                flowRate: inflowRateUsdc10x,
                superToken: ricochetUSDCx.address
            }).exec(aliceSigner);

            // Expect share allocations were done correctly
            expect(
                await twoWayMarket.getStreamRate(aliceSigner.address, ricochetUSDCx.address)
            ).to.equal(inflowRateUsdc10x);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,true,9800000,0`);
            // Admin and Carl split 2% of the shares bc of the 50% referral fee
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
            ).to.equal(`true,true,100000,0`);
            expect(
                (await twoWayMarket.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()
            ).to.equal(`true,true,100000,0`);

        });

        it("#2.3 two-sided distribution", async () => {

            // Check balance
            await takeMeasurements();

            // Fast forward an hour and distribute
            await increaseTime(3600);
            await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
            await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await twoWayMarket.updateTokenPrices();
            await twoWayMarket.distribute("0x");

            // Check balances again
            await takeMeasurements();

            // Compute the delta
            let deltaAlice = await delta(aliceSigner, aliceBalances);
            let deltaBob = await delta(bobSigner, bobBalances);
            let deltaCarl = await delta(carlSigner, carlBalances);
            let deltaOwner = await delta(adminSigner, ownerBalances);

            // Expect Alice and Bob got the right output less the 2% fee + 1% slippage
            expect(deltaBob.usdcx).to.be.above(deltaBob.ethx * oraclePrice / 1e6 * -1 * 0.97)
            expect(deltaAlice.ethx).to.be.above(deltaAlice.usdcx / oraclePrice * 1e6 * -1 * 0.97)
            // Expect Owner and Carl got their fee from Alice
            expect(deltaCarl.ethx / (deltaAlice.ethx + deltaCarl.ethx + deltaOwner.ethx)).to.within(0.00999, 0.01)
            expect(deltaOwner.ethx / (deltaAlice.ethx + deltaCarl.ethx + deltaOwner.ethx)).to.within(0.00999, 0.01)
            // Expect Owner got his fee from Bob
            expect(deltaOwner.usdcx / (deltaBob.usdcx + deltaOwner.usdcx)).to.within(0.01999, 0.02001)

        });

    });

    context("#3 - market is jailed", async () => {

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
            }).exec(aliceSigner);
            // Bob opens a ETH stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetETHx.address,
                flowRate: inflowRateEth,
            }).exec(bobSigner);

            await increaseTime(3600);

            // Jail the app
            await impersonateAndSetBalance(Constants.CFA_SUPERFLUID_ADDRESS);
            let cfaSigner = await ethers.getSigner(Constants.CFA_SUPERFLUID_ADDRESS)
            await sf.host.hostContract.connect(cfaSigner).jailApp('0x', twoWayMarket.address, 0) //.exec(cfaSigner);


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

            await twoWayMarket.emergencyCloseStream(aliceSigner.address, ricochetUSDCx.address);
            await twoWayMarket.emergencyCloseStream(bobSigner.address, ricochetETHx.address);

            expect(
                await twoWayMarket.getStreamRate(aliceSigner.address, ricochetUSDCx.address)
            ).to.equal(0);

            expect(
                await twoWayMarket.getStreamRate(bobSigner.address, ricochetETHx.address)
            ).to.equal(0);

        });

        it("#3.2 should correctly emergency drain", async () => {

            await expect(
                twoWayMarket.emergencyDrain(ricochetETHx.address),
            ).to.be.revertedWith('!zeroStreamers');

            await expect(
                twoWayMarket.emergencyDrain(ricochetUSDCx.address),
            ).to.be.revertedWith('!zeroStreamers');

            // Close both flows
            // Delete Alices stream
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: aliceSigner.address,
                superToken: ricochetUSDCx.address
            }).exec(aliceSigner);

            // Delete Bobs stream
            await sf.cfaV1.deleteFlow({
                receiver: twoWayMarket.address,
                sender: bobSigner.address,
                superToken: ricochetETHx.address
            }).exec(bobSigner);

            await twoWayMarket.emergencyDrain(ricochetETHx.address);
            await twoWayMarket.emergencyDrain(ricochetUSDCx.address);
            await twoWayMarket.emergencyDrain(ricochetRIC.address);

            expect((await ricochetUSDCx.balanceOf({
                account: twoWayMarket.address, providerOrSigner: provider
            })).toString()).to.equal('0');

            expect((await ricochetETHx.balanceOf({
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
            expect(ownerDelta.ethx).to.be.within(-1 * bobDelta.ethx * 0.99999, -1 * bobDelta.ethx * 1.00001);
            expect(ownerDelta.usdcx).to.be.within(-1 * aliceDelta.usdcx * 0.99999, -1 * aliceDelta.usdcx * 1.00001);
            // Recover the RIC subsidies
            expect(ownerDelta.ric).to.be.within(-1 * appDelta.ric * 0.99999, -1 * appDelta.ric * 1.00001);


        });

        it("3.3 closeStream", async () => {

            let aliceBalanceUsdcx = await ricochetUSDCx.balanceOf({
                account: aliceSigner.address, providerOrSigner: provider
            });
            aliceBalanceUsdcx = ethers.BigNumber.from(aliceBalanceUsdcx.toString())
            // When user create stream, SF locks 4 hour deposit called initial deposit
            const initialDeposit = aliceBalanceUsdcx.div(ethers.BigNumber.from('13')).mul(ethers.BigNumber.from('4'));
            const inflowRate = aliceBalanceUsdcx.sub(initialDeposit).div(ethers.BigNumber.from(9 * 3600)).toString();
            // Initialize a streamer with 9 hours of balance
            await sf.cfaV1.updateFlow({
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRate.toString(),
            }).exec(aliceSigner);
            // Verfiy closing attempts revert
            await expect(twoWayMarket.closeStream(aliceSigner.address, ricochetUSDCx.address)).to.revertedWith('!closable');
            // Advance time 2 hours
            await increaseTime(2 * 3600);
            // Verify closing the stream works
            aliceBalanceUsdcx = await ricochetUSDCx.balanceOf({
                account: aliceSigner.address, providerOrSigner: provider
            });
            await twoWayMarket.closeStream(aliceSigner.address, ricochetUSDCx.address);
            expect(await twoWayMarket.getStreamRate(aliceSigner.address, ricochetUSDCx.address)).to.equal('0');

        });

    });

    xcontext("#4 - native supertoken market with streamers on both sides", async () => {

        before(async () => {
            const success = await provider.send('evm_revert', [
                snapshot
            ]);

            await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
            await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
            await twoWayMarket.updateTokenPrices();

            // Deploy RIC-USDC Rex Market
            const registrationKey = await sfRegistrationKey(sf, adminSigner.address);

            twoWayMarket = await REXMarketFactory.deploy(
                adminSigner.address,
                sf.settings.config.hostAddress,
                Constants.CFA_SUPERFLUID_ADDRESS,
                Constants.IDA_SUPERFLUID_ADDRESS,
                registrationKey,
                referral.address
            );
            console.log("=========== Deployed REXTwoWayMarket ============");
            await twoWayMarket.initializeTwoWayMarket(
                ricochetRIC.address,
                Constants.TELLOR_RIC_REQUEST_ID,
                1e9,
                ricochetUSDCx.address,
                Constants.TELLOR_USDC_REQUEST_ID,
                1e9,
                20000,
                20000
            );
            console.log("=========== Initialized TwoWayMarket ============");
            await twoWayMarket.initializeSubsidies(subsidyRate, ricochetETHx.address);
            console.log("========== Initialized subsidies ===========");
            // Register the market with REXReferral
            await referral.registerApp(twoWayMarket.address);

            usdcxAndItsIDAIndex = {
                token: ricochetUSDCx,
                IDAIndex: 1,
            }
            ricAndItsIDAIndex = {
                token: ricochetRIC,
                IDAIndex: 0,
            }

            await approveSubscriptions([usdcxAndItsIDAIndex, ricAndItsIDAIndex],
                [adminSigner, aliceSigner, bobSigner, carlSigner]);

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc10x,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
            }).exec(aliceSigner);
            console.log("alice")
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetRIC.address,
                flowRate: inflowRateUsdc,
            }).exec(bobSigner);
            console.log("bob")


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
            expect(await twoWayMarket.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        it("#4.1 two-sided distribution", async () => {

            // First try swap of RIC to USDC

            // Check balance
            await takeMeasurements();

            // Fast forward an hour and distribute
            await increaseTime(3600);
            await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
            await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
            await twoWayMarket.updateTokenPrices();
            await twoWayMarket.distribute("0x");

            // Check balances again
            await takeMeasurements();

            // Compute the delta
            let deltaAlice = await delta(aliceSigner, aliceBalances);
            let deltaBob = await delta(bobSigner, bobBalances);
            let deltaCarl = await delta(carlSigner, carlBalances);
            let deltaOwner = await delta(adminSigner, ownerBalances);

            console.log(deltaBob);
            console.log(deltaAlice);

            // Expect Alice and Bob got the right output less the 2% fee + 2% slippage (thin marketf)
            expect(deltaBob.usdcx).to.be.above(deltaBob.ric * ricOraclePrice / 1e6 * -1 * 0.95)
            expect(deltaAlice.ric).to.be.above(deltaAlice.usdcx / ricOraclePrice * 1e6 * -1 * 0.95)
            // Expect Owner and Carl got their fee from Alice
            expect(deltaCarl.ric / (deltaAlice.ric + deltaCarl.ric + deltaOwner.ric)).to.within(0.00999, 0.01001)
            expect(deltaOwner.ric / (deltaAlice.ric + deltaCarl.ric + deltaOwner.ric)).to.within(0.00999, 0.01001)
            // Expect Owner got his fee from Bob
            expect(deltaOwner.usdcx / (deltaBob.usdcx + deltaOwner.usdcx)).to.within(0.01999, 0.02001)

            // Update Alices stream
            await sf.cfaV1.updateFlow({
                receiver: twoWayMarket.address,
                flowRate: inflowRateUsdc10x,
                superToken: ricochetUSDCx.address,
                gasLimit: 3500000,
            }).exec(aliceSigner);

            // Check balance
            await takeMeasurements();
            // Fast forward an hour and distribute
            await increaseTime(3600);
            await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
            await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
            await twoWayMarket.updateTokenPrices();
            await twoWayMarket.distribute("0x");

            // Check balances again
            await takeMeasurements();

            // Compute the delta
            deltaAlice = await delta(aliceSigner, aliceBalances);
            deltaBob = await delta(bobSigner, bobBalances);
            deltaCarl = await delta(carlSigner, carlBalances);
            deltaOwner = await delta(adminSigner, ownerBalances);

            // Expect Alice and Bob got the right output less the 2% fee + 1% slippage
            expect(deltaBob.usdcx).to.be.above(deltaBob.ric * ricOraclePrice / 1e6 * -1 * 0.97)
            expect(deltaAlice.ric).to.be.above(deltaAlice.usdcx / ricOraclePrice * 1e6 * -1 * 0.97)
            // Expect Owner and Carl got their fee from Alice
            expect(deltaCarl.ric / (deltaAlice.ric + deltaCarl.ric + deltaOwner.ric)).to.within(0.00999, 0.01001)
            expect(deltaOwner.ric / (deltaAlice.ric + deltaCarl.ric + deltaOwner.ric)).to.within(0.00999, 0.01001)
            // Expect Owner got his fee from Bob
            expect(deltaOwner.usdcx / (deltaBob.usdcx + deltaOwner.usdcx)).to.within(0.01999, 0.02001)



        });

    });

    xcontext("#5 - matic supertoken market with streamers on both sides", async () => {

        before(async () => {
            const success = await provider.send('evm_revert', [
                snapshot
            ]);

            await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
            await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await tp.submitValue(Constants.TELLOR_MATIC_REQUEST_ID, maticOraclePrice);

            // Deploy RIC-USDC Rex Market
            const registrationKey = await sfRegistrationKey(sf, adminSigner.address);

            twoWayMarket = await REXMarketFactory.deploy(
                adminSigner.address,
                sf.settings.config.hostAddress,
                Constants.CFA_SUPERFLUID_ADDRESS,
                Constants.IDA_SUPERFLUID_ADDRESS,
                registrationKey,
                referral.address
            );
            console.log("=========== Deployed REXTwoWayMarket ============");
            await twoWayMarket.initializeTwoWayMarket(
                ricochetMATICx.address,
                Constants.TELLOR_MATIC_REQUEST_ID,
                1e9,
                ricochetUSDCx.address,
                Constants.TELLOR_USDC_REQUEST_ID,
                1e9,
                20000,
                20000
            );
            console.log("=========== Initialized TwoWayMarket ============");
            await twoWayMarket.initializeSubsidies(subsidyRate, ricochetRIC.address);
            console.log("========== Initialized subsidies ===========");
            // Register the market with REXReferral
            await referral.registerApp(twoWayMarket.address);

            usdcxAndItsIDAIndex = {
                token: ricochetUSDCx,
                IDAIndex: 1,
            }
            maticxAndItsIDAIndex = {
                token: ricochetMATICx,
                IDAIndex: 0,
            }

            await approveSubscriptions([usdcxAndItsIDAIndex, maticxAndItsIDAIndex],
                [adminSigner, aliceSigner, bobSigner, carlSigner]);

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
            }).exec(aliceSigner);
            console.log("alice")
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: twoWayMarket.address,
                superToken: ricochetMATICx.address,
                flowRate: "1000000000000",
            }).exec(bobSigner);
            console.log("bob")


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
            expect(await twoWayMarket.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        it("#5.1 two-sided distribution", async () => {

            // First try swap of RIC to USDC

            // Check balance
            await takeMeasurements();

            // Fast forward an hour and distribute
            await increaseTime(3600);
            await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
            await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await tp.submitValue(Constants.TELLOR_MATIC_REQUEST_ID, maticOraclePrice);
            await twoWayMarket.updateTokenPrices();
            await twoWayMarket.distribute("0x");
            // Check balances again
            await takeMeasurements();

            // Compute the delta
            let deltaAlice = await delta(aliceSigner, aliceBalances);
            let deltaBob = await delta(bobSigner, bobBalances);
            let deltaCarl = await delta(carlSigner, carlBalances);
            let deltaOwner = await delta(adminSigner, ownerBalances);

            // Expect Alice and Bob got the right output less the 2% fee + 2% slippage (thin marketf)
            expect(deltaBob.usdcx).to.be.above(deltaBob.maticx * maticOraclePrice / 1e6 * -1 * 0.95)
            expect(deltaAlice.maticx).to.be.above(deltaAlice.usdcx / maticOraclePrice * 1e6 * -1 * 0.95)
            // Expect Owner and Carl got their fee from Alice
            expect(deltaCarl.maticx / (deltaAlice.maticx + deltaCarl.maticx + deltaOwner.maticx)).to.within(0.00999, 0.01001)
            expect(deltaOwner.maticx / (deltaAlice.maticx + deltaCarl.maticx + deltaOwner.maticx)).to.within(0.00999, 0.01001)
            // Expect Owner got his fee from Bob
            expect(deltaOwner.usdcx / (deltaBob.usdcx + deltaOwner.usdcx)).to.within(0.01999, 0.02001)

            // Update Alices stream
            await sf.cfaV1.updateFlow({
                receiver: twoWayMarket.address,
                flowRate: inflowRateUsdc10x,
                superToken: ricochetUSDCx.address,
                gasLimit: 3500000,
            }).exec(aliceSigner);

            // Check balance
            await takeMeasurements();
            // Fast forward an hour and distribute
            await increaseTime(3600);
            await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
            await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, ORACLE_PRECISION_DIGITS);
            await tp.submitValue(Constants.TELLOR_MATIC_REQUEST_ID, maticOraclePrice);
            await twoWayMarket.updateTokenPrices();
            await twoWayMarket.distribute("0x");

            // Check balances again
            await takeMeasurements();

            // Compute the delta
            deltaAlice = await delta(aliceSigner, aliceBalances);
            deltaBob = await delta(bobSigner, bobBalances);
            deltaCarl = await delta(carlSigner, carlBalances);
            deltaOwner = await delta(adminSigner, ownerBalances);

            // Expect Alice and Bob got the right output less the 2% fee + 1% slippage
            expect(deltaBob.usdcx).to.be.above(deltaBob.maticx * maticOraclePrice / 1e6 * -1 * 0.97)
            expect(deltaAlice.maticx).to.be.above(deltaAlice.usdcx / maticOraclePrice * 1e6 * -1 * 0.97)
            // Expect Owner and Carl got their fee from Alice
            expect(deltaCarl.maticx / (deltaAlice.maticx + deltaCarl.maticx + deltaOwner.maticx)).to.within(0.00999, 0.01001)
            expect(deltaOwner.maticx / (deltaAlice.maticx + deltaCarl.maticx + deltaOwner.maticx)).to.within(0.00999, 0.01001)
            // Expect Owner got his fee from Bob
            expect(deltaOwner.usdcx / (deltaBob.usdcx + deltaOwner.usdcx)).to.within(0.01999, 0.02001)



        });

    });

});
