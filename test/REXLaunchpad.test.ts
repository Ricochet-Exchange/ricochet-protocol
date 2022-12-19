import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import { HttpService } from "./../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TellorPlayground, REXTwoWayMarket, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1, RicochetLaunchpad } from "../typechain";
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

describe('REXLaunchpad', () => {
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    const inflowRateUsdc = "1000000000000";
    const inflowRateUsdcDeposit = "4000000000000000"
    const inflowRateUsdc10x = "10000000000000000";
    const inflowRateEth = "10000000000000";
    const subsidyRate = "10000000000000";

    let rexReferral: REXReferral__factory;
    let RicochetLaunchpad: any;
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
        twoWayMarket: REXTwoWayMarket,
        launchpad: RicochetLaunchpad,
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
        appBalances.ethx.push((await superT.ethx.balanceOf({ account: launchpad.address, providerOrSigner: provider })).toString());
        ownerBalances.ethx.push((await superT.ethx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ethx.push((await superT.ethx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ethx.push((await superT.ethx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.ethx.push((await superT.ethx.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ethx.push((await superT.ethx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.usdcx.push((await superT.usdcx.balanceOf({ account: launchpad.address, providerOrSigner: provider })).toString());
        ownerBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.usdcx.push((await superT.usdcx.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.ric.push((await superT.ric.balanceOf({ account: launchpad.address, providerOrSigner: provider })).toString());
        ownerBalances.ric.push((await superT.ric.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ric.push((await superT.ric.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ric.push((await superT.ric.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.ric.push((await superT.ric.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ric.push((await superT.ric.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.maticx.push((await superT.maticx.balanceOf({ account: launchpad.address, providerOrSigner: provider })).toString());
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
                        publisher: launchpad.address,
                        userData: "0x",
                    })
                    .exec(signers[i])
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
        // Deploy REX Launchpad
        console.log("Deploying RicochetLaunchpadHelper")
        const RicochetLaunchpadHelper = await ethers.getContractFactory("RicochetLaunchpadHelper");
        let ricochetLaunchpadHelper = await RicochetLaunchpadHelper.deploy();

        console.log("Deploying RicochetLaunchpad...");
        RicochetLaunchpad = await ethers.getContractFactory("RicochetLaunchpad", {
            signer: adminSigner,
            libraries: {
              RicochetLaunchpadHelper: ricochetLaunchpadHelper.address,
            },
        });

        launchpad = await RicochetLaunchpad.deploy(
            sf.host.contract.address,
            Constants.CFA_SUPERFLUID_ADDRESS,
            Constants.IDA_SUPERFLUID_ADDRESS,
            registrationKey,
            referral.address
        );
        console.log("=========== Deployed RicochetLaunchpad ============");

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

        await launchpad.initialize(
          ricochetUSDCx.address,
          ricochetRIC.address,
          adminSigner.address, // originator
          adminSigner.address, // beneficiary
          1000, //output rate
          12 // fee rate
        )
        console.log("=========== Initialized Launchpad ============");

        // await twoWayMarket.initializeSubsidies(subsidyRate, ricochetRIC.address);
        // console.log("========== Initialized subsidies ===========");

        await checkBalance(ethxWhaleSigner, "the ETHX whale");
        await checkBalance(maticxWhaleSigner, "the MATICx whale");
        // send the contract some RIC
        try {
            await ricochetRIC.transfer({
                receiver: launchpad.address,
                amount: "1000000000000000000"
            }).exec(adminSigner);
        } catch (err: any) {
            console.log("Ricochet - ERROR transferring RICs to the contract: ", err);
        }
        console.log("============ RICs have been sent to the contract =============");
        await checkBalance(adminSigner, "the contract");

        // Register the market with REXReferral
        await referral.registerApp(launchpad.address);
        referral = await referral.connect(bobSigner);
        await referral.applyForAffiliate("bob", "bob");
        referral = await referral.connect(adminSigner);
        await referral.verifyAffiliate("bob");
        console.log("                      ============ The affiliate has been veryfied =============");
        console.log("=======================================================================");
        console.log("================ End of \"before\" block ==============================");
        console.log("=======================================================================");


        // Do all the approvals
        // TODO: Redo how indexes are setup
        // await approveSubscriptions([usdcxAndItsIDAIndex, ethxAndItsIDAIndex, ricAndItsIDAIndex],
        //     [adminSigner, aliceSigner, bobSigner, karenSigner, carlSigner]);

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

        // Take a snapshot to avoid redoing the setup
        snapshot = await provider.send('evm_snapshot', []);

    });

    context("#1 - rex launchpad check referral", async () => {

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
            expect(await launchpad.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });


        it("#1.1 Check referral shares are correct", async () => {

            // Alice opens a USDC stream to launchoad
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: launchpad.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                userData: ethers.utils.defaultAbiCoder.encode(["string"], ["bob"]),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Alice gets 98% because of referral fee
            expect(
                (await launchpad.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,false,980,0`);
            // Admin and Bob split 2% of the shares bc of the 50% referral fee
            expect(
                (await launchpad.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
            ).to.equal(`true,false,10,0`);
            expect(
                (await launchpad.getIDAShares(ETHX_SUBSCRIPTION_INDEX, bobSigner.address)).toString()
            ).to.equal(`true,false,10,0`);

            await sf.cfaV1.deleteFlow({
                receiver: launchpad.address,
                sender: aliceSigner.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            expect(
                (await launchpad.getIDAShares(ETHX_SUBSCRIPTION_INDEX, bobSigner.address)).toString()
            ).to.equal(`true,false,0,0`);

        });

        it("#1.2 DAO gets all shares if there is no affiliate", async () => {
            // Alice opens a USDC stream to launchoad
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: launchpad.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            // Alice gets 100% as there are no affiliates
            expect(
                (await launchpad.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,false,1000,0`);  

        });

    });

    context("#2 - test getters and setters", async () => {

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
            expect(await launchpad.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        it("#2.1 getters/setters", async () => {
            // Alice opens a USDC stream to launchoad
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: launchpad.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            const feeRate = 1000;
            await launchpad.setFeeRate(feeRate);
            expect(await launchpad.getFeeRate()).to.equal(feeRate);

            const sharePrice = await launchpad.getSharePrice();
            console.log('get share price - ', sharePrice);
            // at 0 what should it be?
            expect(sharePrice).to.equal(0);

            const inputToken = await launchpad.getInputToken();
            expect(inputToken).to.equal("0xCAa7349CEA390F89641fe306D93591f87595dc1F");

            const outputToken = await launchpad.getOutputToken();
            expect(outputToken).to.equal("0x263026E7e53DBFDce5ae55Ade22493f828922965");

            const outputIndexId = await launchpad.getOutputIndexId();
            console.log('output index id - ', outputIndexId);
            // at 0 what should it be?
            expect(outputIndexId).to.equal(0);

            const outputRate = await launchpad.getOutputRate();
            expect(outputRate).to.equal(1000);

            const getInflow = await launchpad.getTotalInflow();
            expect(getInflow).to.equal(1000000000000);

            const getLastDistributionAt = await launchpad.getLastDistributionAt();
            expect((getLastDistributionAt.toNumber())).to.be.above(0);

            const getOwner = await launchpad.getOwner();
            expect(getOwner).to.equal("0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA");

            const getStreamRate = await launchpad.getStreamRate(aliceSigner.address);
            expect(getStreamRate).to.equal(1000000000000);

        });

        it("#2.2 transfers ownership", async () => {
            // transfer ownership and check owner
            await launchpad.transferOwnership(aliceSigner.address);
            const getOwner = await launchpad.getOwner();
            expect(getOwner).to.equal(aliceSigner.address);
        });
    });

    context("#3 - rex launchpad open / close stream", async () => {
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
            expect(await launchpad.isAppJailed()).to.equal(false);
            await resetMeasurements();
        });

        it("#3.1 open and close stream", async () => {
            // open and close stream and check share amount is correct
            await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: launchpad.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            expect(
                (await launchpad.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,false,1000,0`); 

            await sf.cfaV1.deleteFlow({
                receiver: launchpad.address,
                sender: aliceSigner.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            expect(
                (await launchpad.getIDAShares(ETHX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()
            ).to.equal(`true,false,0,0`);
        });
    });

    // No longer possible to jail apps
    xcontext("#4 - rex launchpad is jailed", async () => {
        before(async () => {
            const success = await provider.send('evm_revert', [
                snapshot
            ]);

            await takeMeasurements();
 
           await sf.cfaV1.createFlow({
                sender: aliceSigner.address,
                receiver: launchpad.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRateUsdc,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);
            

            await increaseTime(3600);

            // Jail the app
            await impersonateAndSetBalance(Constants.CFA_SUPERFLUID_ADDRESS);
            let cfaSigner = await ethers.getSigner(Constants.CFA_SUPERFLUID_ADDRESS)
            await sf.host.contract.connect(cfaSigner).jailApp('0x', launchpad.address, 0) //.exec(cfaSigner);


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
            // expect(await launchpad.isAppJailed()).to.equal(false);
            // await resetMeasurements();
        });

        it("#4.1 app is jailed", async () => {
            expect(await launchpad.isAppJailed()).to.equal(true);   
        });

        it("#4.2 emergencyCloseStream", async () => {
            await launchpad.emergencyCloseStream(aliceSigner.address);
            
            expect(
                await launchpad.getStreamRate(aliceSigner.address)
            ).to.equal(0);
        });

        it("#4.3 should correctly emergency drain", async () => {

            await expect(
                launchpad.emergencyDrain(),
            ).to.be.revertedWith('!zeroStreamers');

            // Delete Alices stream
            await sf.cfaV1.deleteFlow({
                receiver: launchpad.address,
                sender: aliceSigner.address,
                superToken: ricochetUSDCx.address,
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);

            await launchpad.emergencyDrain();

            expect((await ricochetUSDCx.balanceOf({
                account: launchpad.address, providerOrSigner: provider
            })).toString()).to.equal('0');

            await takeMeasurements();

            // Check the owner recovers the funds sent in afterwards
            let appDelta = await delta(launchpad, appBalances);
            let ownerDelta = await delta(adminSigner, ownerBalances);
            let aliceDelta = await delta(aliceSigner, aliceBalances);
    
            // Expect the owner can recover the locked funds
            expect(ownerDelta.usdcx).to.be.within(-1 * aliceDelta.usdcx * 0.99999, -1 * aliceDelta.usdcx * 1.00001);
            // Recover the RIC subsidies
            expect(ownerDelta.ric).to.be.within(-1 * appDelta.ric * 0.99999, -1 * appDelta.ric * 1.00001);

        });

        it("4.4 closeStream", async () => {

            let aliceBalanceUsdcx = await ricochetUSDCx.balanceOf({
                account: aliceSigner.address, providerOrSigner: provider
            });
            aliceBalanceUsdcx = ethers.BigNumber.from(aliceBalanceUsdcx.toString())
            // When user create stream, SF locks 4 hour deposit called initial deposit
            const initialDeposit = aliceBalanceUsdcx.div(ethers.BigNumber.from('13')).mul(ethers.BigNumber.from('4'));
            const inflowRate = aliceBalanceUsdcx.sub(initialDeposit).div(ethers.BigNumber.from(9 * 3600)).toString();
            // Initialize a streamer with 9 hours of balance
            await sf.cfaV1.updateFlow({
                sender: aliceSigner.address,
                receiver: launchpad.address,
                superToken: ricochetUSDCx.address,
                flowRate: inflowRate.toString(),
                shouldUseCallAgreement: true,
            }).exec(aliceSigner);
            // Verfiy closing attempts revert
            await expect(launchpad.closeStream(aliceSigner.address)).to.revertedWith('!closable');
            // Advance time 2 hours
            await increaseTime(2 * 3600);
            // Verify closing the stream works
            aliceBalanceUsdcx = await ricochetUSDCx.balanceOf({
                account: aliceSigner.address, providerOrSigner: provider
            });
            await launchpad.closeStream(aliceSigner.address);
            expect(await launchpad.getStreamRate(aliceSigner.address)).to.equal('0');

        });
    });

});
