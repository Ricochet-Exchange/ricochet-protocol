import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect, should } from "chai";
import { HttpService } from "../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { REXAlluoMarket, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from "../typechain";
import { increaseTime, impersonateAndSetBalance } from "../misc/helpers";
import { Constants } from "../misc/Constants";
import { AbiCoder, parseUnits } from "ethers/lib/utils";
import { time } from "console";

const { provider, loadFixture } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours
// Index 1 is for Ether and 0 for USDCx
const USDCX_SUBSCRIPTION_INDEX = 0;
const ETHX_SUBSCRIPTION_INDEX = 1;
const RIC_SUBSCRIPTION_INDEX = 2;

export interface superTokenIDAIndex {
    token: SuperToken;
    IDAIndex: number;
}

describe('REXAlluoMarket', () => {
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    const overrides = { gasLimit: '6000000' }; // Using this to manually limit gas to avoid giga-errors.
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
    let ricWhaleSigner: SignerWithAddress;
    let karenSigner: SignerWithAddress;
    let stIbAlluoUSDSigner: SignerWithAddress;

    let oraclePrice: number;

    interface SuperTokensBalances {
        stIbAlluoUSD: any[], 
        stIbAlluoETH: any[], 
        ric: any[]
    };

    let appBalances: SuperTokensBalances; // = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
    let ownerBalances: SuperTokensBalances; // = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
    let aliceBalances:SuperTokensBalances; // = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
    let bobBalances: SuperTokensBalances; // = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
    let carlBalances: SuperTokensBalances; //  = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
    let karenBalances: SuperTokensBalances; // = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };

    let sf: Framework,
        superT: ISuperToken,
        u: { [key: string]: IUser },
        market: REXAlluoMarket,
        tokenss: { [key: string]: any },
        sfRegistrationKey: any,
        accountss: SignerWithAddress[],
        constant: { [key: string]: string },
        ERC20: any;

    // ************** All the supertokens used in Ricochet are declared **********************
    let ricochetRIC: SuperToken;
    let stIbAlluoETH: SuperToken;
    let stIbAlluoUSD: SuperToken;

    let stIbAlluoETHIDAIndex: superTokenIDAIndex;
    let ricIDAIndex: superTokenIDAIndex;


    // ***************************************************************************************

    async function takeMeasurements(): Promise<void> {

        appBalances.stIbAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: market.address, providerOrSigner: provider })).toString());
        ownerBalances.stIbAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.stIbAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.stIbAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        karenBalances.stIbAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.stIbAlluoUSD.push((await superT.stIbAlluoUSD.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.stIbAlluoETH.push((await superT.stIbAlluoETH.balanceOf({ account: market.address, providerOrSigner: provider })).toString());
        ownerBalances.stIbAlluoETH.push((await superT.stIbAlluoETH.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.stIbAlluoETH.push((await superT.stIbAlluoETH.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.stIbAlluoETH.push((await superT.stIbAlluoETH.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        karenBalances.stIbAlluoETH.push((await superT.stIbAlluoETH.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.stIbAlluoETH.push((await superT.stIbAlluoETH.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.ric.push((await superT.ric.balanceOf({ account: market.address, providerOrSigner: provider })).toString());
        ownerBalances.ric.push((await superT.ric.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ric.push((await superT.ric.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ric.push((await superT.ric.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        karenBalances.ric.push((await superT.ric.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ric.push((await superT.ric.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());
    }

    async function resetMeasurements(): Promise<void> {
        appBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
        ownerBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
        aliceBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
        bobBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
        carlBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
        karenBalances = { stIbAlluoUSD: [], stIbAlluoETH: [], ric: [] };
    }

    async function approveSubscriptions(tokensAndIDAIndexes: superTokenIDAIndex[], signers: SignerWithAddress[]) {
        console.log("  ======== Inside approveSubscriptions ===========");
        let tokenIndex: number;
        for (let i = 0; i < signers.length; i++) {
            for (let j = 0; j < tokensAndIDAIndexes.length; j++) {
                tokenIndex = tokensAndIDAIndexes[j].IDAIndex;
                await sf.idaV1
                    .approveSubscription({
                        indexId: tokenIndex.toString(),
                        superToken: tokensAndIDAIndexes[j].token.address,
                        publisher: market.address,
                        userData: "0x",
                    })
                    .exec(signers[i]);
                console.log("====== ", i, " subscription to token ", j, " approved =======");
            }
        }
    }

    async function checkBalance(user: SignerWithAddress, name: string) {
        console.log(" checkBalance START ======== Balance of ", name, " with address: ", user.address, " ============= ");
        let stIbAlluoETHBal = await stIbAlluoETH.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let ibAlluoBal = await stIbAlluoUSD.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let balanceRic = await ricochetRIC.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        console.log("Balance in ETHX: ", stIbAlluoETHBal);
        console.log("Balance in stIbAlluoUSD: ", ibAlluoBal);
        console.log("Balance in RIC: ", balanceRic);
        console.log(" checkBalance END ====================================================== ");
    }

    async function delta(account: SignerWithAddress, balances: any) {
        const len = balances.ethx.length;
        return {
            ethx: balances.ethx[len - 1] - balances.ethx[len - 2],
            usdcx: balances.usdcx[len - 1] - balances.usdcx[len - 2],
            ric: balances.ric[len - 1] - balances.ric[len - 2],
            maticx: balances.maticx[len - 1] - balances.maticx[len - 2],
            rexshirt: balances.rexshirt[len - 1] - balances.rexshirt[len - 2]
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

        // This order is established in misc/setup.ts
        adminSigner = accountss[0];
        aliceSigner = accountss[1];
        bobSigner = accountss[2];
        carlSigner = accountss[3];
        karenSigner = accountss[4];
        stIbAlluoUSDSigner = accountss[8];
        ricWhaleSigner = accountss[10];

        ricochetRIC = superT.ric;
        stIbAlluoUSD = superT.stIbAlluoUSD; 
        stIbAlluoETH = superT.stIbAlluoETH;

        stIbAlluoETHIDAIndex = {
            token: stIbAlluoETH,
            IDAIndex: 0,
        }
        ricIDAIndex = {
            token: ricochetRIC,
            IDAIndex: 1,
        }

        const registrationKey = await sfRegistrationKey(sf, adminSigner.address);

        // Deploy REXReferral
        rexReferral = await ethers.getContractFactory("REXReferral", {
            signer: adminSigner,
        });
        referral = await rexReferral.deploy();
        await referral.deployed();
        console.log("=========== Deployed REXReferral ============");

        // ==============
        // Deploy REX Market
        console.log("Deploying REXAlluoMarket...");
        REXMarketFactory = await ethers.getContractFactory(
            "REXAlluoMarket",
            adminSigner
        );
        market = await REXMarketFactory.deploy(
            adminSigner.address,
            sf.settings.config.hostAddress,
            Constants.matic.CFA_SUPERFLUID_ADDRESS,
            Constants.matic.IDA_SUPERFLUID_ADDRESS,
            registrationKey,
            referral.address
        );
        console.log("=========== Deployed REXAlluoMarket ============");

        await market.initializeMarket(
            stIbAlluoUSD.address,
            stIbAlluoETH.address,
            ricochetRIC.address,
            10000, 
            20000,
            "1500000000000000000000", // Initial price pulled from coingecko manually
            20000
        );
        console.log("=========== Initialized TwoWayMarket ============");

        console.log("========== Initializing Uniswap ===========");
        await market.initializeUniswap(
            Constants.matic.UNISWAP_V3_ROUTER_ADDRESS, 
            Constants.matic.UNISWAP_V3_FACTORY_ADDRESS,
            [Constants.matic.USDC_ADDRESS, Constants.matic.ETH_ADDRESS],
            [500]
        );
        console.log("========== Initialized Uniswap ===========");

        await ricochetRIC.transfer({
            receiver: market.address,
            amount: "1000000000000000000"
        }).exec(ricWhaleSigner);

        console.log("============ RICs have been sent to the contract =============");

        // Register the market with REXReferral
        await referral.registerApp(market.address);
        referral = await referral.connect(carlSigner);
        await referral.applyForAffiliate("carl", "carl");
        referral = await referral.connect(adminSigner);
        await referral.verifyAffiliate("carl");
        console.log("============ The affiliate has been veryfied =============");
   
        // Give Alice, Bob, Karen some tokens
        const initialAmount = ethers.utils.parseUnits("1000", 18).toString();
        await stIbAlluoUSD
            .transfer({
                receiver: aliceSigner.address,
                amount: initialAmount,
            }).exec(stIbAlluoUSDSigner);
        console.log("====== Transferred USDCx to alice =======");
        await stIbAlluoUSD
            .transfer({
                receiver: bobSigner.address,
                amount: initialAmount,
            }).exec(stIbAlluoUSDSigner);
        console.log("====== Transferred USDCx to bob =======");

        // TODO: Redo how indexes are setup
        await approveSubscriptions([stIbAlluoETHIDAIndex, ricIDAIndex],
            [adminSigner, aliceSigner, bobSigner, carlSigner]); // , karenSigner, carlSigner]);

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
        });

        afterEach(async () => {
            // Check the app isn't jailed
            // expect(await market.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        after(async () => { });


        xit("#1.1 getters/setters", async () => {

            // await market.setRateTolerance(1000);
            expect(await market.getRateTolerance()).to.equal(1000);
            await market.setFeeRate(0, 1000);
            expect(await market.getFeeRate(0)).to.equal(1000);
            await market.setEmissionRate(0, 1000);
            expect(await market.getEmissionRate(0)).to.equal(1000);
            expect((await market.getOutputPool(0)).toString()).to.equal(`${stIbAlluoETH.address},1000,1000,${1e7}`);
            // TODO: use block timestamp be more percise 
            expect((await market.getLastDistributionAt()).toNumber()).to.be.above(0)

        });

        it("#1.2 before/afterAgreementCreated callbacks", async () => {

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: stIbAlluoUSD.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Expect share allocations were done correctly
            expect(
                (await market.getIDAShares(0, aliceSigner.address)).toString()
            ).to.equal(`true,true,98000000000,0`);
            // Admin and Carl split 2% of the shares bc of the 50% referral fee
            expect(
                (await market.getIDAShares(0, adminSigner.address)).toString()
            ).to.equal(`true,true,1000000000,0`);
            expect(
                (await market.getIDAShares(0, carlSigner.address)).toString()
            ).to.equal(`true,true,1000000000,0`);

            await increaseTime(3600);

            // Bob opens a ETH stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: market.address,
                superToken: stIbAlluoUSD.address,
                flowRate: inflowRateEth,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);

            // Expect share allocations were done correctly
            expect(
                (await market.getIDAShares(0, bobSigner.address)).toString()
            ).to.equal(`true,true,980000000,0`);
            // Admin gets all of the 2% bc bob was an organic referral
            expect(
                (await market.getIDAShares(0, adminSigner.address)).toString()
            ).to.equal(`true,true,1020000000,0`); 

            // Delete Alices stream before first  distributions
            await sf.cfaV1.deleteFlow({
                receiver: market.address,
                sender: aliceSigner.address,
                superToken: stIbAlluoUSD.address,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Delete Alices stream before first  distributions
            await sf.cfaV1.deleteFlow({
                receiver: market.address,
                sender: bobSigner.address,
                superToken: stIbAlluoUSD.address,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);

        });

        it("#1.3 before/afterAgreementTerminated callbacks", async () => {

            await takeMeasurements();

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: stIbAlluoUSD.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);


            await increaseTime(3600)

            // Delete Alices stream before first  distributions
            await sf.cfaV1.deleteFlow({
                receiver: market.address,
                sender: aliceSigner.address,
                superToken: stIbAlluoUSD.address,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);


            await takeMeasurements();

            // Check balance for alice again
            let aliceDelta = await delta(aliceSigner, aliceBalances);

            // Expect alice didn't lose anything since she closed stream before distribute
            // expect(aliceDelta.usdcx).to.equal(0);
            expect(aliceDelta.usdcx).to.equal(0);
            expect(
                (await market.getIDAShares(0, aliceSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await market.getIDAShares(0, adminSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await market.getIDAShares(0, carlSigner.address)).toString()
            ).to.equal(`true,true,0,0`);

        });

        it("#1.4 distribution", async () => {
        

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: stIbAlluoUSD.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Check balance
            await takeMeasurements();

            // Fast forward an hour and distribute
            await increaseTime(60);
            await market.distribute("0x");
            await increaseTime(60);
            await market.distribute("0x");
            await increaseTime(60);
            await market.distribute("0x");

            // Check balances again
            await takeMeasurements();

            // Check oracle
            oraclePrice = await market.getTwap();

            // Compute the delta
            let deltaAlice = await delta(aliceSigner, aliceBalances);
            let deltaCarl = await delta(carlSigner, carlBalances);
            let deltaOwner = await delta(adminSigner, ownerBalances);

            // Expect Owner and Carl got their fee from Alice
            let totalOutput = deltaAlice.ethx + deltaCarl.ethx + deltaOwner.ethx;
            expect(deltaCarl.ethx / totalOutput).to.within(0.00999, 0.0101)
            expect(deltaOwner.ethx / totalOutput).to.within(0.00999, 0.0101)
            expect(deltaAlice.ethx).to.be.above(deltaAlice.usdcx / oraclePrice * 1e18 * -1 * 0.97)

            // Delete alice and bobs flow
            await sf.cfaV1.deleteFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: stIbAlluoUSD.address,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(aliceSigner);

        });

    });

});
