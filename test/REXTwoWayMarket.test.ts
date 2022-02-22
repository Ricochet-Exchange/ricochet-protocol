import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import { HttpService } from "./../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TellorPlayground, REXTwoWayMarket, ERC20 } from "../typechain";

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
import { parseUnits } from "ethers/lib/utils";
import { Contract } from "ethers";

const { provider, loadFixture } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours


describe('REXTwoWayMarket', () => {
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    // const ERC20 = await ethers.getContractFactory("IERC20");

    // const names: string[] = ['Admin', 'Alice', 'Bob', 'Carl', 'Karen', 'UsdcSpender', 'EthSpender'];

    // interface SuperTokensBalances {
    //     outputx: string[];
    //     ethx: string[];
    //     wbtcx: string[];
    //     daix: string[];
    //     usdcx: string[];
    //     ric: string[];
    // };

    // let appBalances: SuperTokensBalances;
    // let ownerBalances: SuperTokensBalances;
    // let aliceBalances: SuperTokensBalances;
    // let bobBalances: SuperTokensBalances;
    // let carlBalances: SuperTokensBalances;
    // let karenBalances: SuperTokensBalances;


    //     // ==============
    //     // Init SF users

    //     // for (let i = 0; i < names.length; i += 1) {
    //     for (let i = 0; i < usersAndAddresses.length; i += 1) {
    //         // Bob will be the ETHx streamer
    //         if (usersAndAddresses[i].user == bob) { //}  .toLowerCase() == "bob") {
    //             u[names[i].toLowerCase()] = sf.user({
    //                 address: accounts[i]._address || accounts[i].address,
    //                 token: ethx.address,
    //             });
    //         } else {
    //             u[names[i].toLowerCase()] = sf.user({
    //                 address: accounts[i]._address || accounts[i].address,
    //                 token: usdcx.address,
    //             });
    //         }

    //         u[names[i].toLowerCase()].alias = names[i];
    //         // aliases[u[names[i].toLowerCase()].address] = names[i];
    //         // usersAndAddresses[i].alias = usersAndAddresses[i].
    //     }

    //     // ==============
    //     // NOTE: Assume the oracle is up to date
    //     // Deploy Tellor Oracle contracts

    //     const TellorPlayground = await ethers.getContractFactory('TellorPlayground');
    //     tp = await TellorPlayground.attach(TELLOR_ORACLE_ADDRESS);
    //     tp = tp.connect(owner);

    //     // ==============
    //     // Setup tokens

    //     const ERC20 = await ethers.getContractFactory('ERC20');
    //     let ric = await ERC20.attach(RIC_TOKEN_ADDRESS);
    //     let weth = await ERC20.attach(await ethx.getUnderlyingToken());
    //     let wbtc = await ERC20.attach(await wbtcx.getUnderlyingToken());
    //     usdc = await ERC20.attach(await usdcx.getUnderlyingToken());
    //     ric = ric.connect(owner);

    //     // Attach alice to the SLP token
    //     let outputx = ethx;
    //     let output = await ERC20.attach(await outputx.getUnderlyingToken());

    // });

    // let ethx: SuperToken;
    // let wbtcx: any; //: SuperfluidToken;
    // let usdcx: SuperToken;
    // let ric: SuperToken;
    // let daix: any; //: SuperfluidToken;
    // let outputx: SuperToken;
    // let usdc: ERC20;
    // let output: ERC20;

    let rexReferral: any;

    // let sr; // Mock Sushi Router
    // let owner: SignerWithAddress;
    // let alice: SignerWithAddress;
    // let bob: SignerWithAddress;
    // let carl: SignerWithAddress;
    // let karen: SignerWithAddress;
    // let admin: SignerWithAddress;
    // let usdcSpender: SignerWithAddress;
    // let ethSpender: SignerWithAddress;

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
        approveSubscriptions: any,
        ERC20: any;


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

    async function checkBalance(user: SignerWithAddress) {
        console.log('Balance of ', user.address);
        let balance = await superT.ethx.balanceOf({
            account: user.address, providerOrSigner: provider
        });
        console.log('Balance in usdcx: ', balance);
        // console.log('usdcx: ', (await usdcx.balanceOf(user.address)).toString());
        // console.log('usdcx: ', (await usdcx.balanceOf({
        //     account: user.address,
        //     providerOrSigner: user
        // })));
        // console.log('ethx: ', (await ethx.balanceOf({
        //     account: user.address,
        //     providerOrSigner: user
        // })));
        // console.log('ric: ', (await ric.balanceOf({
        //     account: user.address,
        //     providerOrSigner: user
        // })));
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

    // let idaV1: InstantDistributionAgreementV1;
    // let cfaV1: ConstantFlowAgreementV1;
    // let framework: Framework;
    // let deployer: SignerWithAddress;
    // let user2: SignerWithAddress;
    // let superToken: SuperToken;

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

        const registrationKey = await sfRegistrationKey(sf, u.admin.address);
        console.log("============ Right after sfRegistrationKey() ==================");

        console.log("======******** List of addresses =======");
        for (let i = 0; i < accountss.length; i++) {
            console.log("Address number ", i, ": ", accountss[i].address);
        }
        console.log("++++++++++++++ alice address number ", ": ", u.alice.address);
        console.log("++++++++++++++ bob address number ", ": ", u.bob.address); // accountss[i].address);

        // const registrationKey = await sfRegistrationKey(sf, u.admin.address);
        // const registrationKey = await createSFRegistrationKey(await sf, u.admin.address);

        // Deploy REXReferral
        rexReferral = await ethers.getContractFactory("REXReferral", {
            signer: accountss[0],  // owner,
        });
        let referral = await rexReferral.deploy();
        await referral.deployed();
        console.log("=========== Deployed REXReferral ============");

        // ==============
        // Deploy REX Market
        console.log("Deploying REXTwoWayMarket...");
        const REXMarketFactory = await ethers.getContractFactory(
            "REXTwoWayMarket",
            accountss[0]
        );
        app = await REXMarketFactory.deploy(
            u.admin.address,
            sf.host.hostContract.address,
            Constants.IDA_SUPERFLUID_ADDRESS,
            Constants.CFA_SUPERFLUID_ADDRESS,
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
        // response.data = "";
        ricOraclePrice = await response.data["richochet"].usd * 1000000;
        console.log("RIC oraclePrice: ", ricOraclePrice.toString());
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, 1000000);
        console.log("=========== Updated the oracles ============");
        // IMP. --> the oracles must be updated before calling initializeTwoWayMarket

        await app.initializeTwoWayMarket(
            superT.usdcx.address,
            Constants.TELLOR_USDC_REQUEST_ID,
            1e9,
            superT.ethx.address,
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

        // u.app = sf.user({
        // app = sf.user({
        //     address: app.address,
        //     token: outputx.address,
        // });
        // u.app.alias = "App";
        // app.alias = "App";    // AM --> what is alias for ?
        // ==============

        // await app.addOutputPool(Constants.RIC_TOKEN_ADDRESS, 0, 1000000000, 77);

        await app.initializeSubsidies(10000000000000);
        console.log("========== Initialized subsidies ===========");

        // send the contract some RIC       // I think it causes an "Execute Transaction Error"
        // try {
        //     superT.ric.transfer({
        //         receiver: app.address,
        //         amount: "239975789381077848"   // --->  Error: invalid BigNumber value
        //     }).exec(accountss[0]);
        // } catch (err: any) {
        //     console.log("Ricochet - ERROR transferring RICs to the contract: ", err);
        // }
        // console.log("============ RICs have been sent to the contract =============");

        // Register the market with REXReferral
        // await referral.registerApp(app.address);
        // referral = await referral.connect(carl);
        // await referral.applyForAffiliate("carl", "carl");
        // referral = await referral.connect(owner);
        // await referral.verifyAffiliate("carl");

    }); // End of "before" block

    // You need to call "approve" before calling "transferFrom"
    it("should distribute tokens to streamers", async () => {
        console.log("====== Test Case started ==========================");
        console.log("====== Result is: ", await sf.idaV1.getIndex({
            superToken: superT.ethx.address, publisher: u.app.address, indexId: "1", providerOrSigner: provider
        }));

        // Index 1 is for Ether and 0 for USDCx
        // await funcApproveSubscriptions([alice.address, bob.address, carl.address, karen.address, admin.address]);
        await sf.idaV1
            .approveSubscription({
                indexId: "1",
                superToken: superT.ethx.address,
                publisher: u.app.address,       // With u. !!
                userData: "0x",
            })
            .exec(accountss[1]);
        console.log("====== First subscription approved =======");
        await sf.idaV1
            .approveSubscription({
                indexId: "0",
                superToken: superT.usdcx.address,
                publisher: u.app.address,       // With u. !!
                userData: "0x",
            })
            .exec(accountss[2]);
        console.log("====== Second subscription approved =======");

        // (await sf).idaV1
        //     .approveSubscription({
        //         indexId: "0",
        //         superToken: ethx.address,
        //         publisher: app.address,
        //         userData: "0x",
        //     })
        //     .exec(userAccounts[""]);    // TODO

        const initialAmount = ethers.utils.parseUnits("400", 18).toString();   // 18 is important !!
        // await superT.usdcx
        //     .approve({
        //         receiver: u.alice.address,
        //         amount: initialAmount,     // transferFrom does NOT work !!
        //     }).exec(accountss[4]);
        await superT.usdcx
            .transfer({
                receiver: u.alice.address,
                amount: initialAmount,     // transferFrom does NOT work !!
            }).exec(accountss[4]);
        console.log("Balance of Alice in usdcx ---> ");
        let balance = await superT.ethx.balanceOf({
            account: u.alice.address, providerOrSigner: provider
        });
        console.log(" -----> ", balance);
        // checkBalance(accountss[1]);
        console.log("====== Transferred to alice =======");

        // await expect(      // From the SF docs
        //     daix
        //         .transferFrom({
        //             sender: deployer.address,
        //             receiver: alpha.address,
        //             amount,
        //         })
        //         .exec(deployer)
        // )

        await superT.usdcx
            .transfer({
                receiver: u.bob.address,
                amount: initialAmount   // transferFrom does NOT work !!
            })
            .exec(accountss[4]);
        console.log("====== Transferred to bob =======");

        console.log(" ====== DONE ======= \n",);

        const inflowRateUsdc = "1000000000000000";
        const inflowRateEth = "10000000000000";
        const inflowRateIDASharesUsdc = "1000000";
        const inflowRateIDASharesEth = "10000";
        let inflowRate = parseUnits("30", 18);   // .div(ethers.BigNumber.from(30));  // getBigNumber(getSeconds(30)));
        // 1. Initialize a stream exchange
        // 2. Create 2 streamers, one with 2x the rate of the other
        // await alice.flow({ flowRate: inflowRateUsdc, recipient: app, userData: web3.eth.abi.encodeParameter("string", "carl") });
        let signer22 = await ethers.getSigner(u.alice.address);
        const createFlowOperation = sf.cfaV1
            .createFlow({
                // sender: u.alice.address,    // alice.address,
                receiver: u.app.address,   //u.alice.address,
                superToken: superT.usdcx.address,
                flowRate: inflowRateUsdc,
            });
        const txnResponseAlice = await createFlowOperation.exec(signer22);   // (new ethers.Signer(u.alice.address))    // (accountss[4]);
        // const txnResponseAlice = await createFlowOperation.exec(contr);

        // contract.provider.getSigner('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')

        const txnReceiptAlice = await txnResponseAlice.wait();
        console.log(" ====== Created stream for alice ======= ");

        // await bob.flow({ flowRate: inflowRateEth, recipient: app });     
        const txnResponseBob = await sf.cfaV1
            .createFlow({
                //         sender: u.bob.address,    // bob.address,
                receiver: u.bob.address,
                superToken: superT.ethx.address,
                flowRate: inflowRateEth,
            });
        // .exec(accountss[0]);
        // const txnReceiptBob = (await txnResponseBob).wait();
        console.log(" ====== Created stream for bob ======= \n");
        // // await takeMeasurements();
        // // TODO 
        console.log(" ======***** Alice stream rate: ",
            await app.getStreamRate(u.alice.address, superT.ethx.address), " and for usdcx: ",
            await app.getStreamRate(u.alice.address, superT.usdcx.address));
        expect(
            await app.getStreamRate(u.alice.address, superT.usdcx.address)
        ).to.equal(inflowRateUsdc);
        // expect(
        //     (await app.getIDAShares(1, alice.address)).toString()
        // ).to.equal(`true,true,980000,0`);
        // expect(
        //     (await app.getIDAShares(1, admin.address)).toString()
        // ).to.equal(`true,true,18000,0`);
        // expect(
        //     await app.getStreamRate(bob.address, ethx.address)
        // ).to.equal(inflowRateEth);
        // expect(
        //     (await app.getIDAShares(0, bob.address)).toString()
        // ).to.equal(`true,true,9800,0`);
        // expect(
        //     (await app.getIDAShares(0, carl.address)).toString()
        // ).to.equal(`true,true,0,0`);
        // expect(
        //     (await app.getIDAShares(0, admin.address)).toString()
        // ).to.equal(`true,true,200,0`);
        // // 3. Advance time 1 hour
        // await increaseTime(3600);
        // console.log("Fast forward");
        // await checkBalance(alice);
        // await checkBalance(bob);
        // await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        // await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        // await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, 1000000);
        // // await app.updateTokenPrices();
        // await app.updateTokenPrice(usdcx.address);
        // await app.updateTokenPrice(ethx.address);
        // // 4. Trigger a distribution
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
