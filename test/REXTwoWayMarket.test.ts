import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import { HttpService } from "./../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TellorPlayground, REXTwoWayMarket, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from "../typechain";

import {
    getSeconds,
    increaseTime,
    // impersonateAccount,
    impersonateAccounts,
    impersonateAndSetBalance,
    initSuperfluid,
    createSFRegistrationKey,
} from "./../misc/helpers";
import { Constants } from "../misc/Constants";
import { AbiCoder, parseUnits } from "ethers/lib/utils";
import { Contract } from "ethers";
import { Abi } from "@truffle/abi-utils/dist/lib/arbitrary";

const { provider, loadFixture } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours
// Index 1 is for Ether and 0 for USDCx
const USDCX_SUBSCRIPTION_INDEX = 0;
const ETHX_SUBSCRIPTION_INDEX = 1;
const RIC_SUBSCRIPTION_INDEX = 2;

export interface superTokenAndItsIDAIndex {
    token: SuperToken;
    IDAIndex: number;
}

describe('REXTwoWayMarket', () => {
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    let cfaV1: IConstantFlowAgreementV1;

    let rexReferral: REXReferral__factory;

    let adminSigner: SignerWithAddress;
    let aliceSigner: SignerWithAddress;
    let bobSigner: SignerWithAddress;
    let carlSigner: SignerWithAddress;
    let usdcxWhaleSigner: SignerWithAddress;
    let ethxWhaleSigner: SignerWithAddress;
    let karenSigner: SignerWithAddress;

    let oraclePrice: number;
    let ricOraclePrice: number;

    interface SuperTokensBalances {
        outputx: string[];
        ethx: string[];
        wbtcx: string[];
        daix: string[];
        usdcx: string[];
        ric: string[];
    };

    let appBalances: SuperTokensBalances;
    let ownerBalances: SuperTokensBalances;
    let aliceBalances: SuperTokensBalances;
    let bobBalances: SuperTokensBalances;
    let carlBalances: SuperTokensBalances;
    let karenBalances: SuperTokensBalances;

    let sf: Framework,
        superT: ISuperToken,
        u: { [key: string]: IUser },
        app: REXTwoWayMarket,
        tokenss: { [key: string]: any },
        sfRegistrationKey: any,
        accountss: SignerWithAddress[],
        constant: { [key: string]: string },
        tp: TellorPlayground,
        ERC20: any;

    // ************** All the supertokens used in Ricochet are declared **********************
    let ricochetUSDCx: SuperToken;
    let ricochetETHx: SuperToken;
    let ricochetWBTCx: SuperToken;
    let ricochetRIC: SuperToken;

    let usdcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ethxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ricAndItsIDAIndex: superTokenAndItsIDAIndex;
    let wbtcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    // ***************************************************************************************

    async function takeMeasurements(): Promise<void> {
        appBalances.ethx.push((await superT.ethx.balanceOf({
            account: u.app.address, providerOrSigner: provider
        })));
        //     ownerBalances.ethx.push((await ethx.balanceOf(admin.address)).toString());
        //     aliceBalances.ethx.push((await ethx.balanceOf(alice.address)).toString());
        //     carlBalances.ethx.push((await ethx.balanceOf(carl.address)).toString());
        //     karenBalances.ethx.push((await ethx.balanceOf(karen.address)).toString());
        //     bobBalances.ethx.push((await ethx.balanceOf(bob.address)).toString());

        //     appBalances.usdcx.push((await usdcx.balanceOf(app.address)).toString());
        //     ownerBalances.usdcx.push((await usdcx.balanceOf(admin.address)).toString());
        //     aliceBalances.usdcx.push((await usdcx.balanceOf(alice.address)).toString());
        //     carlBalances.usdcx.push((await usdcx.balanceOf(carl.address)).toString());
        //     karenBalances.usdcx.push((await usdcx.balanceOf(karen.address)).toString());
        //     bobBalances.usdcx.push((await usdcx.balanceOf(bob.address)).toString());

        //     appBalances.ric.push((await ric.balanceOf(app.address)).toString());
        //     ownerBalances.ric.push((await ric.balanceOf(admin.address)).toString());
        //     aliceBalances.ric.push((await ric.balanceOf(alice.address)).toString());
        //     carlBalances.ric.push((await ric.balanceOf(carl.address)).toString());
        //     karenBalances.ric.push((await ric.balanceOf(karen.address)).toString());
        //     bobBalances.ric.push((await ric.balanceOf(bob.address)).toString());
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
                        publisher: u.app.address,
                        userData: "0x",
                    })
                    .exec(signers[i]);
                console.log("====== ", i, " subscription to token ", j, " approved =======");
            }
        }
    }

    async function checkBalance(user: SignerWithAddress, name: string) {
        console.log(" ======== Balance of ", name, " ", user.address, " ============= ");
        let balanceEthx = await ricochetETHx.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let balanceUsdcx = await ricochetUSDCx.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        let balanceRic = await ricochetRIC.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        console.log("Balance in ETHX: ", balanceEthx);
        console.log("Balance in USDCX: ", balanceUsdcx);
        console.log("Balance in RIC: ", balanceRic);
        console.log(" =============================================================== ");
    }

    async function delta(account: SignerWithAddress, balances: any) {  // : SuperTokensBalances) {
        const len = balances.ethx.length;
        const changeInOutToken = balances.ethx[len - 1] - balances.ethx[len - 2];
        const changeInInToken = balances.usdcx[len - 1] - balances.usdcx[len - 2];
        const changeInSubsidyToken = balances.ric[len - 1] - balances.ric[len - 2];
        console.log();
        console.log('Change in balances for ', account.address);
        console.log('Ethx:', changeInOutToken, 'Bal:', balances.ethx[len - 1]);
        console.log('Usdcx:', changeInInToken, 'Bal:', balances.usdcx[len - 1]);
        console.log('Ric:', changeInSubsidyToken, 'Bal:', balances.ric[len - 1]);
        return {
            ethx: changeInOutToken,
            usdcx: changeInInToken,
            ric: changeInSubsidyToken
        }
    }

    beforeEach(async () => {
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
        usdcxWhaleSigner = accountss[4];
        ethxWhaleSigner = accountss[5];

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
        console.log("++++++++++++++ alice address number: ", u.alice.address);
        console.log("++++++++++++++ aliceSigner address ", aliceSigner.address);
        console.log("++++++++++++++ bob address number: ", u.bob.address);
        console.log("++++++++++++++ carl address number: ", u.carl.address);

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
        let referral = await rexReferral.deploy();
        await referral.deployed();
        console.log("=========== Deployed REXReferral ============");

        // ==============
        // Deploy REX Market
        console.log("Deploying REXTwoWayMarket...");
        const REXMarketFactory = await ethers.getContractFactory(
            "REXTwoWayMarket",
            adminSigner
        );
        app = await REXMarketFactory.deploy(
            adminSigner.address,
            sf.host.hostContract.address,
            Constants.CFA_SUPERFLUID_ADDRESS,
            Constants.IDA_SUPERFLUID_ADDRESS,
            registrationKey,
            referral.address
        );
        console.log("=========== Deployed REXTwoWayMarket ============");

        // Update the oracles
        let httpService = new HttpService();
        const url = "https://api.coingecko.com/api/v3/simple/price?ids=" + Constants.COINGECKO_KEY + "&vs_currencies=usd";
        let response = await httpService.get(url);
        oraclePrice = response.data[Constants.COINGECKO_KEY].usd * 1000000;
        console.log("oraclePrice: ", oraclePrice.toString());
        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        const url2 = "https://api.coingecko.com/api/v3/simple/price?ids=richochet&vs_currencies=usd";
        response = await httpService.get(url2);
        ricOraclePrice = await response.data["richochet"].usd * 1000000;
        console.log("RIC oraclePrice: ", ricOraclePrice.toString());
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, 1000000);
        console.log("=========== Updated the oracles ============");
        // IMP. --> the oracles must be updated before calling initializeTwoWayMarket

        await app.initializeTwoWayMarket(
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

        u.app = {
            address: app.address,
            token: superT.wbtcx.address,
            alias: "App",
        };

        await app.initializeSubsidies(10000000000000);
        console.log("========== Initialized subsidies ===========");

        checkBalance(ethxWhaleSigner, "the ETHX whale");
        // send the contract some RIC       
        try {
            await ricochetRIC.transfer({
                receiver: u.app.address,
                amount: "239975789381077848"
            }).exec(adminSigner);
        } catch (err: any) {
            console.log("Ricochet - ERROR transferring RICs to the contract: ", err);
        }
        console.log("============ RICs have been sent to the contract =============");
        checkBalance(adminSigner, "the contract");

        // Register the market with REXReferral
        await referral.registerApp(u.app.address);
        referral = await referral.connect(carlSigner);
        await referral.applyForAffiliate("carl", "carl");
        referral = await referral.connect(adminSigner);
        await referral.verifyAffiliate("carl");
        console.log("                      ============ The affiliate has been veryfied =============");
    });                 // End of "before" block

    it("should not allow small streams", async () => {

        // Lower bound on a stream is shareScaler * 1e3
        const inflowRateMin = '1000000000000';
        const inflowRatePrime = '13000000000000';
        const inflowRateTooLow = '100000000000';
        const inflowRateNot10 = '1000000000001';

        const inflowRateMinETH = '10000000000';
        const inflowRatePrimeETH = '130000000000';
        const inflowRateTooLowETH = '1000000000';
        const inflowRateNot10ETH = '10000000001';

        console.log('==== Small streams ==== Transfer alice USDCx');
        // await usdcx.transfer(u.alice.address, toWad(400), { from: u.usdcspender.address });
        await ricochetUSDCx
            .transfer({
                receiver: aliceSigner.address,
                amount: ethers.utils.parseUnits("400", 18).toString(),
            }).exec(usdcxWhaleSigner);
        console.log("====== AAAAAA - Transferred to alice =======");

        // await ethx.transfer(u.bob.address, toWad(1), { from: u.ethspender.address });
        await ricochetETHx
            .transfer({
                receiver: bobSigner.address,
                amount: ethers.utils.parseUnits("0.5", 18).toString(),
            }).exec(ethxWhaleSigner);
        console.log("====== AAAAAAA - Transferred to bob =======");

        console.log('Done');

        await approveSubscriptions([usdcxAndItsIDAIndex, ethxAndItsIDAIndex, ricAndItsIDAIndex],
            [adminSigner, aliceSigner, bobSigner, carlSigner]);

        // Make sure it reverts not scalable values
        let operation = sf.cfaV1.createFlow({
            sender: aliceSigner.address,
            receiver: u.app.address,
            superToken: ricochetUSDCx.address,
            flowRate: inflowRateTooLow,
            userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl'])
        });
        // u.alice.flow({ flowRate: inflowRateTooLow, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') })
        await expect(operation.exec(aliceSigner))
            .to.be.revertedWith("notScalable");

        console.log("      ============= Till here");

        operation = sf.cfaV1.createFlow({
            sender: aliceSigner.address,
            receiver: u.app.address,
            superToken: ricochetUSDCx.address,
            flowRate: inflowRateNot10,
            userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl'])
        });
        // u.alice.flow({ flowRate: inflowRateNot10, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') })
        await expect(operation.exec(aliceSigner))
            .to.be.revertedWith("notScalable");

        // Make sure it works with scalable, prime flow rates
        operation = sf.cfaV1.createFlow({
            sender: aliceSigner.address,
            receiver: u.app.address,
            superToken: ricochetUSDCx.address,
            flowRate: inflowRatePrime,
            userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl'])
        });
        await expect(operation.exec(aliceSigner))
            .to.emit(cfaV1, "FlowUpdated")
        // .withArgs(
        //     superToken.address,
        //     deployer.address,
        //     alpha.address,
        //     Number(flowRate),
        //     Number(flowRate) * -1,
        //     Number(flowRate),
        //     "0x"
        // );

        // Confirm speed limit allocates shares correctly
        expect((await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()).to.equal(`true,true,12740,0`);
        expect((await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()).to.equal(`true,true,234,0`);
        expect((await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()).to.equal(`true,true,26,0`);

        // Stop the flow
        await sf.cfaV1.deleteFlow({
            sender: aliceSigner.address,
            receiver: u.app.address,
            superToken: ricochetUSDCx.address,
        }).exec(aliceSigner)

        // await u.alice.flow({
        //     flowRate: '0',
        //     recipient: u.app
        // });

        // Confirm speed limit allocates shares correctly
        expect((await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, aliceSigner.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()).to.equal(`true,true,0,0`);

        // Test minimum flow rate
        await sf.cfaV1.createFlow({
            sender: aliceSigner.address,
            receiver: u.app.address,
            superToken: ricochetUSDCx.address,
            flowRate: inflowRateMin,
            userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl'])
        }).exec(aliceSigner)

        // await u.alice.flow({
        //     flowRate: inflowRateMin,
        //     recipient: u.app,
        //     userData: web3.eth.abi.encodeParameter('string', 'carl')
        // });

        // Confirm speed limit allocates shares correctly
        expect((await app.getIDAShares(1, aliceSigner.address)).toString()).to.equal(`true,true,980,0`);
        expect((await app.getIDAShares(1, adminSigner.address)).toString()).to.equal(`true,true,18,0`);
        expect((await app.getIDAShares(1, carlSigner.address)).toString()).to.equal(`true,true,2,0`);

        // Stop the flow
        await sf.cfaV1.deleteFlow({
            sender: aliceSigner.address,
            receiver: u.app.address,
            superToken: ricochetUSDCx.address,
            userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl'])
        }).exec(aliceSigner)

        // await u.alice.flow({
        //     flowRate: '0',
        //     recipient: u.app,
        //     userData: web3.eth.abi.encodeParameter('string', 'carl')
        // });

        // Confirm speed limit allocates shares correctly
        expect((await app.getIDAShares(1, aliceSigner.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(1, adminSigner.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(1, carlSigner.address)).toString()).to.equal(`true,true,0,0`);

        // TEST ETH SIDE

        // Make sure it reverts not scalable values
        await expect(
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: u.app.address,
                superToken: ricochetETHx.address,
                flowRate: inflowRateTooLowETH,
                userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl'])
            }).exec(bobSigner)
            // u.bob.flow({ flowRate: inflowRateTooLowETH, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') })
        ).to.be.revertedWith("notScalable");

        await expect(
            await sf.cfaV1.createFlow({
                sender: bobSigner.address,
                receiver: u.app.address,
                superToken: ricochetETHx.address,
                flowRate: inflowRateNot10ETH,
                userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl'])
            }).exec(bobSigner)
            // u.bob.flow({ flowRate: inflowRateNot10ETH, recipient: u.app, userData: web3.eth.abi.encodeParameter('string', 'carl') })
        ).to.be.revertedWith("notScalable");

        // Make sure it works with scalable, prime flow rates
        await sf.cfaV1.createFlow({
            sender: bobSigner.address,
            receiver: u.app.address,
            superToken: ricochetETHx.address,
            flowRate: inflowRatePrimeETH,
            userData: ethers.utils.defaultAbiCoder.encode(['string'], ['carl'])
        }).exec(bobSigner)

        // Confirm speed limit allocates shares correctly
        expect((await app.getIDAShares(0, bobSigner.address)).toString()).to.equal(`true,true,12740,0`);
        expect((await app.getIDAShares(0, adminSigner.address)).toString()).to.equal(`true,true,234,0`);
        expect((await app.getIDAShares(0, carlSigner.address)).toString()).to.equal(`true,true,26,0`);

        // Stop the flow
        await u.bob.flow({
            flowRate: '0',
            recipient: u.app
        });

        // Confirm speed limit allocates shares correctly
        expect((await app.getIDAShares(0, bobSigner.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(0, adminSigner.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(0, carlSigner.address)).toString()).to.equal(`true,true,0,0`);

        // Test minimum flow rate
        await u.bob.flow({
            flowRate: inflowRateMinETH,
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
        expect((await app.getIDAShares(0, bobSigner.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(0, adminSigner.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(0, carlSigner.address)).toString()).to.equal(`true,true,0,0`);
    });

    // "approve" must be called before calling "transferFrom"
    xit("should distribute tokens to streamers", async () => {
        console.log("====== Test Case started ==========================");

        await approveSubscriptions([usdcxAndItsIDAIndex, ethxAndItsIDAIndex, ricAndItsIDAIndex],
            [adminSigner, aliceSigner, bobSigner, carlSigner]);  // , karenSigner]); 

        const initialAmount = ethers.utils.parseUnits("400", 18).toString();   // 18 is important !!
        // await superT.usdcx
        await ricochetUSDCx
            .transfer({
                receiver: aliceSigner.address,
                amount: initialAmount,     // transferFrom does NOT work !!
            }).exec(usdcxWhaleSigner);
        console.log("====== Transferred to alice =======");
        // checkBalance(aliceSigner, "Alice");   

        // await ethx.transfer(u.bob.address, toWad(1), { from: u.ethspender.address });
        await ricochetETHx
            .transfer({
                receiver: bobSigner.address,
                amount: ethers.utils.parseUnits("0.5", 18).toString(),  // initialAmount
            }).exec(ethxWhaleSigner);
        console.log("====== Transferred to bob =======");

        console.log(" ====== DONE ======= \n",);

        const inflowRateUsdc = "1000000000000000";  // ethers.BigNumber.from(10);
        const inflowRateEth = "10000000000000";
        const inflowRateIDASharesUsdc = "1000000";
        const inflowRateIDASharesEth = "10000";
        let inflowRate = parseUnits("30", 18);   // .div(ethers.BigNumber.from(30));  // getBigNumber(getSeconds(30)));
        // 1. Initialize a stream exchange
        // 2. Create 2 streamers, one with 2x the rate of the other
        // await alice.flow({ flowRate: inflowRateUsdc, recipient: app, userData: web3.eth.abi.encodeParameter("string", "carl") });

        console.log(" ====== Create alice flow ======= ");
        console.log("address: ", aliceSigner.address, "receiver: ", u.app.address,
            "supertoken: ", ricochetUSDCx.address, "flowRate: ", inflowRateUsdc);

        await sf.cfaV1.createFlow({
            sender: aliceSigner.address,
            receiver: u.app.address,
            superToken: ricochetUSDCx.address,
            flowRate: inflowRateUsdc,
            // userData: ethers.utils.solidityKeccak256(["string"], ["carl"]),   // Not sure
        }).exec(aliceSigner);
        console.log(" ====== Created stream for alice ======= ");
        console.log(" ======***** Alice stream rate: ",
            await app.getStreamRate(aliceSigner.address, ricochetETHx.address), " and for usdcx: ",
            await app.getStreamRate(aliceSigner.address, ricochetUSDCx.address));

        // let baseNonce = provider.getTransactionCount(wallet.getAddress());
        // let nonceOffset = 0;
        // function getNonce() {
        //     return baseNonce.then((nonce) => (nonce + (nonceOffset++)));
        // }
        // let tx0 = { to: a0, value: v0, nonce: getNonce() };
        // wallet.sendTransaction(tx0);
        // let tx1 = { to: a1, value: v1, nonce: getNonce() };
        // wallet.sendTransaction(tx1);
        // setTimeout(() => {
        //     console.log('hi');
        // }, 500);
        // ethers.utils NonceManager.incrementTransactionCount();

        console.log(" ====== Create bob flow ======= ");
        console.log("address: ", bobSigner.address, "receiver: ", u.app.address,
            "supertoken: ", ricochetETHx.address, "flowRate: ", inflowRateEth);

        await sf.cfaV1.createFlow({
            sender: bobSigner.address,
            receiver: u.app.address,
            superToken: ricochetETHx.address,
            flowRate: inflowRateEth,
        }).exec(bobSigner);

        console.log("                      ====== Created stream for bob ======= \n");
        console.log(" ======***** Bob stream rate: ", await app.getStreamRate(bobSigner.address, ricochetETHx.address), " for ethx.");

        // // await takeMeasurements();
        // // TODO 
        // expect(
        //     await app.getStreamRate(u.alice.address, superT.usdcx.address)
        // ).to.equal(inflowRateUsdc);
        // expect(
        //     (await app.getIDAShares(ETHX_SUBSCRIPTION_INDEX, u.alice.address)).toString()
        // ).to.equal(`true,true,980000,0`);
        expect(
            (await app.getIDAShares(ETHX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
        ).to.equal(`true,true,20000,0`);     // It's 18,000 if a referral is registered
        expect(
            (await app.getIDAShares(ETHX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()
        ).to.equal(`true,true,0,0`);     // It's 2,000 if a referral is registered
        expect(
            await app.getStreamRate(bobSigner.address, ricochetETHx.address)
        ).to.equal(inflowRateEth);
        expect(
            (await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, bobSigner.address)).toString()
        ).to.equal(`true,true,980000,0`);
        expect(
            (await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, carlSigner.address)).toString()
        ).to.equal(`true,true,0,0`);
        expect(
            (await app.getIDAShares(USDCX_SUBSCRIPTION_INDEX, adminSigner.address)).toString()
        ).to.equal(`true,true,20000,0`);
        // 3. Advance time 1 hour
        await increaseTime(3600);
        console.log("Fast forward");    // So far so good
        await checkBalance(aliceSigner, "alice");
        await checkBalance(bobSigner, "bob");
        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, 1000000);
        // await app.updateTokenPrices();      // TODO
        // 4. Trigger a distribution
        // await app.distribute("0x");
        // // This fifth step is commented in OneWay  // TODO
        // // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        // // await takeMeasurements();

        // let deltaAlice = await delta(alice, aliceBalances);
        // let deltaCarl = await delta(carl, carlBalances);
        // let deltaKaren = await delta(karen, karenBalances);
        // let deltaBob = await delta(bob, bobBalances);
        // let deltaOwner = await delta(owner, ownerBalances);
        // // verify
        // console.log(deltaOwner)
        // console.log(deltaCarl)
        // console.log(deltaKaren)
        // console.log(deltaAlice)
        // console.log(deltaBob)
        // // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
        // expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        // expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.ethx * 0.98, deltaAlice.ethx * 1.06)

        // // TODO: Check that there was a sushiswap event with Bobs ETH less alices USD gets Swapped

        // // Flip, alice streams more USDC than Bob streams ETH
        // expect((await app.getIDAShares(1, carl.address)).toString()).to.equal(`true,true,2000,0`);
        // const txnResponseAlice2 = (await sf).cfaV1
        //     .createFlow({
        //         sender: alice.address,
        //         flowRate: (parseInt(inflowRateUsdc) * 10).toString(),
        //         receiver: app.address,
        //         superToken: usdcx.address
        //     }).exec(alice);

        // // await alice.flow({ flowRate: (parseInt(inflowRateUsdc) * 10).toString(), recipient: app });

        // expect(await app.getStreamRate(alice.address, usdcx.address)).to.equal("10000000000000000");
        // expect((await app.getIDAShares(1, alice.address)).toString()).to.equal(`true,true,9800000,0`);
        // expect((await app.getIDAShares(1, carl.address)).toString()).to.equal(`true,true,20000,0`);
        // expect((await app.getIDAShares(1, admin.address)).toString()).to.equal(`true,true,180000,0`);
        // expect(await app.getStreamRate(bob.address, ethx.address)).to.equal(inflowRateEth);
        // expect((await app.getIDAShares(0, bob.address)).toString()).to.equal(`true,true,9800,0`);
        // expect((await app.getIDAShares(0, carl.address)).toString()).to.equal(`true,true,0,0`);
        // expect((await app.getIDAShares(0, admin.address)).toString()).to.equal(`true,true,200,0`);
        // // await takeMeasurements();
        // await increaseTime(3600);
        // await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        // await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        // await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        // await app.updateTokenPrices();
        // // 4. Trigger a distribution
        // await app.distribute("0x");
        // // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        // // await takeMeasurements();

        // deltaAlice = await delta(alice, aliceBalances);
        // deltaCarl = await delta(carl, carlBalances);
        // deltaKaren = await delta(karen, karenBalances);
        // deltaBob = await delta(bob, bobBalances);
        // deltaOwner = await delta(owner, ownerBalances);
        // // verify
        // console.log(deltaOwner)
        // console.log(deltaCarl)
        // console.log(deltaKaren)
        // console.log(deltaAlice)
        // console.log(deltaBob)
        // // Fee taken during harvest, can be a larger % of what"s actually distributed via IDA due to rounding the actual amount
        // expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        // expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.ethx * 0.98, deltaAlice.ethx * 1.06)

        // console.log("Transfer karen");
        // usdcx.transferFrom({
        //     sender: usdcSpender.address,
        //     receiver: karen.address,
        //     amount: toWad(400)
        // });
        // // await usdcx.connect(usdcSpender).transfer(karen.address, toWad(400));

        // // Add another streamer, alice streams more USDC than Bob streams ETH
        // const txnResponseAlice3 = (await sf).cfaV1
        //     .createFlow({
        //         sender: alice.address,
        //         flowRate: inflowRateUsdc,
        //         receiver: app.address,
        //         superToken: usdcx.address
        //     }).exec(alice);

        // // await karen.flow({ flowRate: inflowRateUsdc, recipient: app });    
        // expect(await app.getStreamRate(alice.address, usdcx.address)).to.equal("10000000000000000");
        // expect((await app.getIDAShares(1, alice.address)).toString()).to.equal(`true,true,9800000,0`);
        // expect((await app.getIDAShares(1, carl.address)).toString()).to.equal(`true,true,20000,0`);
        // expect(await app.getStreamRate(bob.address, ethx.address)).to.equal(inflowRateEth);
        // expect((await app.getIDAShares(0, bob.address)).toString()).to.equal(`true,true,9800,0`);
        // expect((await app.getIDAShares(0, carl.address)).toString()).to.equal(`true,true,0,0`);
        // expect((await app.getIDAShares(0, admin.address)).toString()).to.equal(`true,true,200,0`);
        // expect(await app.getStreamRate(karen.address, usdcx.address)).to.equal(inflowRateUsdc);
        // expect((await app.getIDAShares(1, karen.address)).toString()).to.equal(`true,true,980000,0`);
        // expect((await app.getIDAShares(1, admin.address)).toString()).to.equal(`true,true,200000,0`);

        // // await takeMeasurements();
        // await increaseTime(3600);

        // await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        // await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        // await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        // await app.updateTokenPrices();
        // // 4. Trigger a distribution
        // await app.distribute("0x");
        // // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        // // await takeMeasurements();

        // deltaAlice = await delta(alice, aliceBalances);
        // deltaCarl = await delta(carl, carlBalances);
        // deltaKaren = await delta(karen, karenBalances);
        // deltaBob = await delta(bob, bobBalances);
        // deltaOwner = await delta(owner, ownerBalances);
        // // verify
        // console.log(deltaOwner)
        // console.log(deltaCarl)
        // console.log(deltaKaren)
        // console.log(deltaAlice)
        // console.log(deltaBob)
        // // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
        // expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        // expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.ethx * 0.98, deltaAlice.ethx * 1.06)
        // expect(deltaKaren.usdcx / oraclePrice * 1e6 * -1).to.within(deltaKaren.ethx * 0.98, deltaKaren.ethx * 1.06)

        // let aliceBeforeBalance = await usdcx.balanceOf({
        //     account: alice.address,
        //     providerOrSigner: alice
        // });
        // console.log("before", aliceBeforeBalance);
        // // await traveler.advanceTimeAndBlock(30);
        // // await alice.flow({ flowRate: "0", recipient: app });
        // // framework.cfaV1.createFlow({ flowRate: "0", receiver: app, superToken: usdcx.address });   // TODO
        // let aliceAfterBalance = await usdcx.balanceOf({
        //     account: alice.address,
        //     providerOrSigner: alice
        // });
        // // let aliceAfterBalance = await usdcx.balanceOf(alice.address);
        // // Need to also account for the four hour fee
        // let aliceBeforeBalanceInNumber = parseInt(aliceBeforeBalance);
        // let aliceAfterBalanceInNumber = parseInt(aliceAfterBalance);
        // aliceAfterBalanceInNumber = aliceAfterBalanceInNumber - 4 * 60 * 60 * parseInt(inflowRateUsdc) * 10;
        // expect(aliceBeforeBalance).to.within(aliceAfterBalanceInNumber * 0.999, aliceAfterBalanceInNumber * 1.001);
        // expect(await app.getStreamRate(alice.address, usdcx.address)).to.equal(0);
        // expect((await app.getIDAShares(1, alice.address)).toString()).to.equal(`true,true,0,0`);

        // // await takeMeasurements();
        // await increaseTime(3600);

        // await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        // await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        // await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        // await app.updateTokenPrices();
        // // 4. Trigger a distributions
        // await app.distribute("0x");
        // // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        // // await takeMeasurements();

        // deltaAlice = await delta(alice, aliceBalances);
        // deltaCarl = await delta(carl, carlBalances);
        // deltaKaren = await delta(karen, karenBalances);
        // deltaBob = await delta(bob, bobBalances);
        // deltaOwner = await delta(owner, ownerBalances);
        // // verify
        // console.log(deltaOwner)
        // console.log(deltaCarl)
        // console.log(deltaKaren)
        // console.log(deltaAlice)
        // console.log(deltaBob)
        // // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
        // expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        // expect(deltaAlice.usdcx).to.equal(0)
        // expect(deltaAlice.ethx).to.equal(0)
        // expect(deltaKaren.usdcx / oraclePrice * 1e6 * -1).to.within(deltaKaren.ethx * 0.98, deltaKaren.ethx * 1.06)

        // // Add another streamer, alice streams more USDC than Bob streams ETH
        // // await karen.flow({ flowRate: "0", recipient: app });
        // // framework.cfaV1.createFlow({ flowRate: "0", receiver: app, superToken: usdcx.address });   // TODO
        // // TODO
        // expect(await app.getStreamRate(karen.address, usdcx.address)).to.equal(0);
        // expect((await app.getIDAShares(1, karen.address)).toString()).to.equal(`true,true,0,0`);

        // // await takeMeasurements();
        // await increaseTime(3600);

        // await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        // await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        // await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        // await app.updateTokenPrices();
        // // 4. Trigger a distribution
        // await app.distribute("0x");
        // // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        // // await takeMeasurements();

        // deltaAlice = await delta(alice, aliceBalances);
        // deltaCarl = await delta(carl, carlBalances);
        // deltaKaren = await delta(karen, karenBalances);
        // deltaBob = await delta(bob, bobBalances);
        // deltaOwner = await delta(owner, ownerBalances);
        // // verify
        // console.log(deltaOwner)
        // console.log(deltaCarl)
        // console.log(deltaKaren)
        // console.log(deltaAlice)
        // console.log(deltaBob)
        // // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
        // expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        // expect(deltaKaren.usdcx).to.equal(0)
        // expect(deltaKaren.ethx).to.equal(0)

    });
});


