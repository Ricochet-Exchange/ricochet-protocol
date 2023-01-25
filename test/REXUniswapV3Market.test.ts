import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect, should } from "chai";
import { HttpService } from "../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { REXUniswapV3Market, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from "../typechain";
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

describe('REXUniswapV3Market', () => {
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

    let oraclePrice = 1550000000;
    let ricOraclePrice = 30000000;
    let maticOraclePrice: number;

    // interface SuperTokensBalances {
    //     outputx: string[];
    //     ethx: string[];
    //     wbtcx: string[];
    //     daix: string[];
    //     usdcx: string[];
    //     ric: string[];
    // };

    let appBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    let ownerBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    let aliceBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    let bobBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    let carlBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    let karenBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };

    let sf: Framework,
        superT: ISuperToken,
        u: { [key: string]: IUser },
        market: REXUniswapV3Market,
        tokenss: { [key: string]: any },
        sfRegistrationKey: any,
        accountss: SignerWithAddress[],
        constant: { [key: string]: string },
        ERC20: any;

    // ************** All the supertokens used in Ricochet are declared **********************
    let ricochetMATICx: SuperToken;
    let ricochetUSDCx: SuperToken;
    let ricochetETHx: SuperToken;
    let ricochetWBTCx: SuperToken;
    let ricochetRIC: SuperToken;
    let ricochetRexSHIRT: SuperToken;

    let usdcxIDAIndex: superTokenIDAIndex;
    let ethxIDAIndex: superTokenIDAIndex;
    let ricIDAIndex: superTokenIDAIndex;
    let rexshirtIDAIndex: superTokenIDAIndex;
    let wbtcxIDAIndex: superTokenIDAIndex;
    let maticxIDAIndex: superTokenIDAIndex;

    // ***************************************************************************************

    async function takeMeasurements(balances: SuperTokensBalances, signer: SignerWithAddress): Promise<void> {

        // TODO: Please 
        appBalances.ethx.push((await superT.ethx.balanceOf({ account: market.address, providerOrSigner: provider })).toString());
        ownerBalances.ethx.push((await superT.ethx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ethx.push((await superT.ethx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ethx.push((await superT.ethx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        bobBalances.ethx.push((await superT.ethx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.usdcx.push((await superT.usdcx.balanceOf({ account: market.address, providerOrSigner: provider })).toString());
        ownerBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        bobBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.ric.push((await superT.ric.balanceOf({ account: market.address, providerOrSigner: provider })).toString());
        ownerBalances.ric.push((await superT.ric.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ric.push((await superT.ric.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ric.push((await superT.ric.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        bobBalances.ric.push((await superT.ric.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.rexshirt.push((await superT.rexshirt.balanceOf({ account: market.address, providerOrSigner: provider })).toString());
        ownerBalances.rexshirt.push((await superT.rexshirt.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.rexshirt.push((await superT.rexshirt.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.rexshirt.push((await superT.rexshirt.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        bobBalances.rexshirt.push((await superT.rexshirt.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.maticx.push((await superT.maticx.balanceOf({ account: market.address, providerOrSigner: provider })).toString());
        ownerBalances.maticx.push((await superT.maticx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.maticx.push((await superT.maticx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.maticx.push((await superT.maticx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        bobBalances.maticx.push((await superT.maticx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());
    }

    async function resetMeasurements(): Promise<void> {
        appBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
        ownerBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
        aliceBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
        bobBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
        carlBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
        karenBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
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
        usdcxWhaleSigner = accountss[5];
        ethxWhaleSigner = accountss[6];
        maticxWhaleSigner = accountss[7];
        ricWhaleSigner = accountss[10];

        ricochetMATICx = superT.maticx;
        ricochetUSDCx = superT.usdcx;
        ricochetETHx = superT.ethx;
        ricochetWBTCx = superT.wbtcx;
        ricochetRIC = superT.ric;
        ricochetRexSHIRT = superT.rexshirt;

        ethxIDAIndex = {
            token: ricochetETHx,
            IDAIndex: 0,
        }
        ricIDAIndex = {
            token: ricochetRIC,
            IDAIndex: 1,
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
        console.log("Deploying REXUniswapV3Market...");
        REXMarketFactory = await ethers.getContractFactory(
            "REXUniswapV3Market",
            adminSigner
        );
        market = await REXMarketFactory.deploy(
            adminSigner.address,
            sf.settings.config.hostAddress,
            Constants.CFA_SUPERFLUID_ADDRESS,
            Constants.IDA_SUPERFLUID_ADDRESS,
            registrationKey,
            referral.address
        );
        console.log("=========== Deployed REXUniswapV3Market ============");
        \)

        await market.initializeMarket(
            ricochetUSDCx.address,
            ricochetETHx.address,
            ricochetRIC.address,
            10000, 
            20000,
            "1550000000000000000000", // Initial price pulled from coingecko manually
            20000
        );
        console.log("=========== Initialized TwoWayMarket ============");

        console.log("========== Initializing Uniswap ===========");
        await market.initializeUniswap(
            Constants.UNISWAP_V3_ROUTER_ADDRESS, 
            Constants.UNISWAP_V3_FACTORY_ADDRESS,
            [Constants.USDC_ADDRESS, Constants.ETH_ADDRESS],
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
        await ricochetRIC
            .transfer({
                receiver: bobSigner.address,
                amount: '1000000000000000000000',
            }).exec(ricWhaleSigner);
        console.log("====== Transferred RIC to bob =======");
        await ricochetMATICx
            .transfer({
                receiver: bobSigner.address,
                amount: '1754897259852523432',
            }).exec(maticxWhaleSigner);
        console.log("====== Transferred MATICx to bob =======");
        await ricochetUSDCx
            .transfer({
                receiver: karenSigner.address,
                amount: initialAmount,
            }).exec(usdcxWhaleSigner);
        console.log("====== Transferred USDCx to karen =======");

        // Do all the approvals
        // TODO: Redo how indexes are setup
        await approveSubscriptions([ethxIDAIndex, ricIDAIndex],
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
            expect(success).to.equal(true);
        });

        afterEach(async () => {
            // Check the app isn't jailed
            // expect(await market.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        after(async () => {




        });


        xit("#1.1 getters/setters", async () => {

            // await market.setRateTolerance(1000);
            expect(await market.getRateTolerance()).to.equal(1000);
            await market.setFeeRate(0, 1000);
            expect(await market.getFeeRate(0)).to.equal(1000);
            await market.setEmissionRate(0, 1000);
            expect(await market.getEmissionRate(0)).to.equal(1000);
            expect((await market.getOutputPool(0)).toString()).to.equal(`${ricochetUSDCx.address},1000,1000,${1e7}`);
            expect((await market.getLastDistributionAt()).toNumber()).to.be.above(0)

        });

        it("#1.2 before/afterAgreementCreated callbacks", async () => {

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Expect share allocations were done correctly
            expect(
                await market.getStreamRate(aliceSigner.address, ricochetUSDCx.address)
            ).to.equal(inflowRateUsdc);
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
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateEth,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);

            // Expect share allocations were done correctly
            expect(
                await market.getStreamRate(bobSigner.address, ricochetUSDCx.address)
            ).to.equal(inflowRateEth);
            expect(
                (await market.getIDAShares(0, bobSigner.address)).toString()
            ).to.equal(`true,true,980000000,0`);
            // Admin gets all of the 2% bc bob was an organic referral
            expect(
                (await market.getIDAShares(0, adminSigner.address)).toString()
            ).to.equal(`true,true,1020000000,0`); 

        });

        it("#1.3 before/afterAgreementTerminated callbacks", async () => {

            await takeMeasurements();

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Bob opens a USDCx stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateEth,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);

            await increaseTime(3600)

            // Delete Alices stream before first  distributions
            await sf.cfaV1.deleteFlow({
                receiver: market.address,
                sender: aliceSigner.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Delete Alices stream before first  distributions
            await sf.cfaV1.deleteFlow({
                receiver: market.address,
                sender: bobSigner.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
            }).exec(bobSigner);

            await takeMeasurements();

            // Check balance for alice again
            let aliceDelta = await delta(aliceSigner, aliceBalances);
            let bobDelta = await delta(bobSigner, bobBalances);

            // Expect alice didn't lose anything since she closed stream before distribute
            // expect(aliceDelta.usdcx).to.equal(0);
            expect(bobDelta.usdcx).to.equal(0);
            // Expect share allocations were done correctly
            expect(
                await market.getStreamRate(aliceSigner.address, ricochetUSDCx.address)
            ).to.equal('0');
            expect(
                await market.getStreamRate(bobSigner.address, ricochetUSDCx.address)
            ).to.equal('0');
            expect(
                (await market.getIDAShares(0, aliceSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await market.getIDAShares(0, adminSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await market.getIDAShares(0, carlSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await market.getIDAShares(0, bobSigner.address)).toString()
            ).to.equal(`true,true,0,0`);
            expect(
                (await market.getIDAShares(0, adminSigner.address)).toString()
            ).to.equal(`true,true,0,0`);

        });

        it("#1.4 distribution", async () => {
        

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
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
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(aliceSigner);

        });

    });

    context("#2 - native supertoken outputToken with two streamers", async () => {

        // Uses the USDC/rexSHIRT Uniswap LPs where rexSHIRT is the supertoken outputToken

        before(async () => {
            // const success = await provider.send('evm_revert', [
            //     snapshot
            // ]);

            // Deploy RIC-USDC Rex Market
            const registrationKey = await sfRegistrationKey(sf, adminSigner.address);

            market = await REXMarketFactory.deploy(
                adminSigner.address,
                sf.settings.config.hostAddress,
                Constants.CFA_SUPERFLUID_ADDRESS,
                Constants.IDA_SUPERFLUID_ADDRESS,
                registrationKey,
                referral.address
            );
            console.log("=========== Deployed REXUniswapV3Market ============");
            await market.initializeMarket(
                ricochetUSDCx.address,
                ricochetRexSHIRT.address,
                ricochetRIC.address,
                10000,
                20000,
                "28593660946038398000", // 28.5 USDC/rexSHIRT pulled the rate on Uniswap
                5000,
            );
            console.log("========== Initialized market ===========");
            // Initialize the twoway market's uniswap
            // token0 is USDC, token1 is rexSHIRT (supertokens)
            await market.initializeUniswap(
                Constants.UNISWAP_V3_ROUTER_ADDRESS, 
                Constants.UNISWAP_V3_FACTORY_ADDRESS,
                [Constants.USDC_ADDRESS, Constants.REXSHIRT_ADDRESS],
                [10000]
            );
            console.log("========== Initialized uniswap ===========");

            // Register the market with REXReferral
            await referral.registerApp(market.address);
            console.log("========== Registered market with REXReferral ===========");

            rexshirtIDAIndex = {
                token: ricochetRexSHIRT,
                IDAIndex: 0,
            }
            ricIDAIndex = {
                token: ricochetRIC,
                IDAIndex: 1,
            }

            await approveSubscriptions([rexshirtIDAIndex, ricIDAIndex],
                [adminSigner, aliceSigner, bobSigner, carlSigner]);

            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
                overrides,
            }).exec(aliceSigner);
            console.log("========== Alice opened a USDC stream to REXMarket ===========");

            // Bob opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(bobSigner);
            console.log("========== Bob opened a RIC stream to REXMarket ===========");

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
            // expect(await market.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        after(async () => {
        });


        it("#2.1 distribution", async () => {

            // First try swap of RIC to USDC

            // Check balance
            await takeMeasurements();

            // Fast forward an hour and distribute
            await increaseTime(60);
            await market.distribute("0x");
            // Fast forward an hour and distribute
            await increaseTime(60);
            await market.distribute("0x");
            // Fast forward an hour and distribute
            await increaseTime(60);
            await market.distribute("0x");


            // Check balances again
            await takeMeasurements();

            // get the price from the oracle to use in the test
            let rexShirtOraclePrice = await market.getTwap();

            // Compute the delta
            let deltaAlice = await delta(aliceSigner, aliceBalances);
            let deltaBob = await delta(bobSigner, bobBalances);
            let deltaCarl = await delta(carlSigner, carlBalances);
            let deltaOwner = await delta(adminSigner, ownerBalances);

            // Log the exchange rate between USDC and rexSHIRT for alice and bob
            // console.log("alice rexshirt exchange rate: " + deltaAlice.usdcx / deltaAlice.rexshirt * -1);
            // console.log("bob rexshirt exchange rate: " + deltaBob.usdcx / deltaBob.rexshirt * -1);

            // // Expect Alice and Bob got the right output less the 2% fee + 2% slippage (thin market)
            expect(deltaAlice.rexshirt).to.be.above(deltaAlice.usdcx / rexShirtOraclePrice * 1e18 * -1 * 0.95)
            expect(deltaBob.rexshirt).to.be.above(deltaBob.usdcx / rexShirtOraclePrice * 1e18 * -1 * 0.95)
            
            // // Expect Owner and Carl got their fee from Alice
            let totalOutput = deltaAlice.rexshirt + deltaCarl.rexshirt + deltaBob.rexshirt + deltaOwner.rexshirt;
            expect(deltaCarl.rexshirt / totalOutput).to.within(0.00491, 0.0501)
            expect(deltaOwner.rexshirt / totalOutput).to.within(0.00149, 0.01501)

            // Update Alices stream
            await sf.cfaV1.updateFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                flowRate: inflowRateUsdc10x,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
                overrides,
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

            rexShirtOraclePrice = await market.getTwap();

            // Compute the delta
            deltaAlice = await delta(aliceSigner, aliceBalances);
            deltaBob = await delta(bobSigner, bobBalances);
            deltaCarl = await delta(carlSigner, carlBalances);
            deltaOwner = await delta(adminSigner, ownerBalances);

            // Log the exchange rate between USDC and rexSHIRT for alice and bob
            // console.log("alice rexshirt exchange rate: " + deltaAlice.usdcx / deltaAlice.rexshirt * -1);
            // console.log("bob rexshirt exchange rate: " + deltaBob.usdcx / deltaBob.rexshirt * -1);

            // Expect Alice and Bob got the right output less the 2% fee + 1% slippage
            expect(deltaBob.rexshirt).to.be.above(deltaBob.usdcx / rexShirtOraclePrice * 1e18 * -1 * 0.97)
            expect(deltaAlice.rexshirt).to.be.above(deltaAlice.usdcx / rexShirtOraclePrice * 1e18 * -1 * 0.97)
            // Expect Owner and Carl got their fee from Alice
            totalOutput = deltaAlice.rexshirt + deltaCarl.rexshirt + deltaBob.rexshirt + deltaOwner.rexshirt;
            expect(deltaCarl.rexshirt / totalOutput).to.within(0.00491, 0.0501);
            expect(deltaOwner.rexshirt / totalOutput).to.within(0.001499, 0.01501);

            // Delete alice and bobs flow
            await sf.cfaV1.deleteFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(aliceSigner);
            // Delete Bob's flow
            await sf.cfaV1.deleteFlow({
                sender: bobSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(bobSigner);

            console.log("========== Alice and Bob closed their RIC streams to REXMarket ===========");
        });

    });

    context("#3 - matic supertoken market with two", async () => {

        before(async () => {
            // Deploy RIC-USDC Rex Market
            const registrationKey = await sfRegistrationKey(sf, adminSigner.address);

            market = await REXMarketFactory.deploy(
                adminSigner.address,
                sf.settings.config.hostAddress,
                Constants.CFA_SUPERFLUID_ADDRESS,
                Constants.IDA_SUPERFLUID_ADDRESS,
                registrationKey,
                referral.address
            );
            console.log("=========== Deployed REXUniswapV3Market ============");
            await market.initializeMarket(
                ricochetUSDCx.address,
                ricochetMATICx.address,
                ricochetRIC.address,
                10000,
                20000,
                "1000000000000000000", // 1 USDC/MATICx pulled the rate on Uniswap
                5000,
            );
            console.log("========== Initialized market ===========");
            // Initialize the twoway market's uniswap
            // token0 is USDC, token1 is rexSHIRT (supertokens)
            await market.initializeUniswap(
                Constants.UNISWAP_V3_ROUTER_ADDRESS, 
                Constants.UNISWAP_V3_FACTORY_ADDRESS,
                [Constants.USDC_ADDRESS, Constants.REXSHIRT_ADDRESS],
                [10000]
            );
            console.log("========== Initialized uniswap ===========");

            // Register the market with REXReferral
            await referral.registerApp(market.address);
            console.log("========== Registered market with REXReferral ===========");

            maticxIDAIndex = {
                token: ricochetMATICx,
                IDAIndex: 0,
            };

            ricIDAIndex = {
                token: ricochetRIC,
                IDAIndex: 1,
            };

            await approveSubscriptions([maticxIDAIndex, ricIDAIndex],
                [adminSigner, aliceSigner, bobSigner, carlSigner]);


            // Alice opens a USDC stream to REXMarket
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["carl"]),
                shouldUseCallAgreement: true,
                overrides,
            }).exec(aliceSigner);
            console.log("========== Alice opened a USDC stream to REXMarket ===========");
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(bobSigner);
            console.log("========== Bob opened a RIC stream to REXMarket ===========");


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
            await resetMeasurements();
        });
        
        after(async () => {

        });

        it("#3.1 distribution", async () => {

            // First try swap of RIC to USDC

            // Check balance
            await takeMeasurements();

            // Fast forward an hour and distribute
            await increaseTime(3600);
            await market.distribute("0x");
            await increaseTime(3600);
            await market.distribute("0x");
            await increaseTime(3600);
            await market.distribute("0x");
            // Check balances again
            await takeMeasurements();

            // get the price of matic from the oracle
            maticOraclePrice = await market.getTwap();

            // Compute the delta
            let deltaAlice = await delta(aliceSigner, aliceBalances);
            let deltaBob = await delta(bobSigner, bobBalances);
            let deltaCarl = await delta(carlSigner, carlBalances);
            let deltaOwner = await delta(adminSigner, ownerBalances);

            // Expect Alice and Bob got the right output less fees
            // expect(deltaBob.maticx).to.be.above(deltaBob.usdcx / maticOraclePrice * 1e18 * -1 * 0.97)
            expect(deltaAlice.maticx).to.be.above(deltaAlice.usdcx / maticOraclePrice * 1e18 * -1 * 0.97)
            // Expect Owner and Carl got their fee from Alice
            expect(deltaCarl.maticx / (deltaAlice.maticx + deltaBob.maticx + deltaCarl.maticx + deltaOwner.maticx)).to.within(0.00499, 0.00501)
            expect(deltaOwner.maticx / (deltaAlice.maticx + deltaBob.maticx + deltaCarl.maticx + deltaOwner.maticx)).to.within(0.01499, 0.01501)

            // Delete alice and bobs flow
            await sf.cfaV1.deleteFlow({
                sender: aliceSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(aliceSigner);
            // Delete Bob's flow
            await sf.cfaV1.deleteFlow({
                sender: bobSigner.address,
                receiver: market.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
                overrides,
            }).exec(bobSigner);


        });

    });

});
