import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import { HttpService } from "./../misc/HttpService";
import { Framework } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SuperfluidToken, TellorPlayground, REXTwoWayMarket, ERC20 } from "../typechain";
import { names } from "../misc/setup";

import {
    getSeconds,
    increaseTime,
    // impersonateAccount,
    impersonateAccounts,
    impersonateAndSetBalance,
} from "./../misc/helpers";
import { Constants } from "../misc/Constants";
// const { loadFixture } = waffle;
/* eslint-disable no-await-in-loop */
const {
    web3tx,
    toWad,
    wad4human,
    fromDecimals,
    BN,
} = require("@decentral.ee/web3-helpers");

// names[0] = "sdf";
const { provider, loadFixture } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours

// function sleep(ms) {
//     return new Promise((resolve) => setTimeout(resolve, ms));
// }

describe('REXTwoWayMarket', () => {
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    // const ERC20 = await ethers.getContractFactory("IERC20");
    const names: string[] = ['Admin', 'Alice', 'Bob', 'Carl', 'Karen', 'UsdcSpender', 'EthSpender'];

    // // let usingTellor;
    // // let sr; // Mock Sushi Router
    // // const u = {}; // object with all users
    // let ethSpender; // u: { [key: string]: IUser },
    // let users: SignerWithAddress[] = [alice, bob, carl, karen, admin]; // object with all users
    // interface UserAndAddress {
    //     user: SignerWithAddress;
    //     address: string;
    //     alias?: string;
    // };
    // let usersAddresses: { [user: string]: string } = [        //alice.address, bob.address, carl.address, karen.address, admin.address];
    // let aliceAndAddress: UserAndAddress = {
    //     user: alice, address: alice.address,
    // }
    // let bobAndAddress: UserAndAddress = {
    //     user: bob, address: bob.address,
    // }
    // let carlAndAddress: UserAndAddress = {
    //     user: carl, address: carl.address,
    // }
    // let karenAndAddress: UserAndAddress = {
    //     user: karen, address: karen.address,
    // }
    // let adminAndAddress: UserAndAddress = {
    //     user: admin, address: admin.address,
    // }
    // let usersAndAddresses: UserAndAddress[] = [aliceAndAddress, bobAndAddress, carlAndAddress, karenAndAddress, adminAndAddress];

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

    // before(async () => {
    //     // ==============
    //     // impersonate accounts and set balances
    //     const accountAddrs = [OWNER_ADDRESS, ALICE_ADDRESS, BOB_ADDRESS, CARL_ADDRESS, KAREN_ADDRESS, USDCX_SOURCE_ADDRESS, ETHX_SOURCE_ADDRESS];

    //     accountAddrs.forEach(async (account) => {
    //         await impersonateAndSetBalance(account);
    //     });

    //     // ==============
    //     // get signers
    //     // owner = await ethers.provider.getSigner(OWNER_ADDRESS);
    //     let owner = await ethers.provider.getSigner(OWNER_ADDRESS);
    //     let reporter = await ethers.provider.getSigner(REPORTER_ADDRESS);
    //     let alice = await ethers.provider.getSigner(ALICE_ADDRESS);
    //     let bob = await ethers.provider.getSigner(BOB_ADDRESS);
    //     let carl = await ethers.provider.getSigner(CARL_ADDRESS);
    //     let karen = await ethers.provider.getSigner(KAREN_ADDRESS);
    //     usdcSpender = await ethers.provider.getSigner(USDCX_SOURCE_ADDRESS);
    //     ethSpender = await ethers.provider.getSigner(ETHX_SOURCE_ADDRESS);
    //     const accounts = [owner, alice, bob, carl, karen, usdcSpender, ethSpender];

    //     // ==============
    //     // Init Superfluid Framework

    //     // sf = new SuperfluidSDK.Framework({
    //     //     web3,
    //     //     resolverAddress: SF_RESOLVER,
    //     //     tokens: ['WBTC', 'DAI', 'USDC', 'ETH'],
    //     //     version: 'v1',
    //     // });
    //     // await sf.initialize();
    //     // ethx = sf.tokens.ETHx;
    //     // wbtcx = sf.tokens.WBTCx;
    //     // daix = sf.tokens.DAIx;
    //     // usdcx = sf.tokens.USDCx;
    //     const superfluid = await Framework.create({
    //         provider: provider,  // PROVIDER
    //         resolverAddress: SF_RESOLVER,
    //         networkName: "hardhat",
    //         dataMode: "WEB3_ONLY",
    //         protocolReleaseVersion: "v2"   // TODO It was v1
    //     });


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

    let ethx: any;  //: SuperfluidToken;
    let wbtcx: any; //: SuperfluidToken;
    let usdcx: any; //: SuperfluidToken;
    let ric: any; //: SuperfluidToken;
    let daix: any; //: SuperfluidToken;
    let outputx: any; //: SuperfluidToken;

    let rexReferral: any;

    // let sr; // Mock Sushi Router
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carl: SignerWithAddress;
    let karen: SignerWithAddress;
    let admin: SignerWithAddress;
    let usdcSpender: SignerWithAddress;
    let ethSpender: SignerWithAddress;
    let usdc: ERC20;  //: ERC20;
    let output: any;  //: ERC20;

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
        userAccounts: { [key: string]: SignerWithAddress },
        constant: { [key: string]: string },
        tp: any,
        approveSubscriptions: any,
        ERC20: any;

    // async function funcApproveSubscriptions(
    //     users = [alice.address, bob.address, carl.address, karen.address, admin.address],
    //     tokens = [usdcx.address, ethx.address, ric.address, ric.address],
    // ) {
    //     // Do approvals
    //     // Already approved?
    //     console.log('Approving subscriptions...');

    //     for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    //         for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
    //             await web3tx(
    //                 sf.host.callAgreement,
    //                 `${users[userIndex]} approves subscription to the app ${tokens[tokenIndex]} ${tokenIndex}`,
    //             )(
    //                 sf.agreements.ida.address,
    //                 sf.agreements.ida.contract.methods
    //                     .approveSubscription(tokens[tokenIndex], app.address, tokenIndex, '0x')
    //                     .encodeABI(),
    //                 '0x', // user data
    //                 {
    //                     from: users[userIndex],
    //                 },
    //             );
    //         }
    //     }
    //     console.log('Approved.');
    // }

    async function takeMeasurements(): Promise<void> {
        appBalances.ethx.push((await ethx.balanceOf(app.address)).toString());
        ownerBalances.ethx.push((await ethx.balanceOf(admin.address)).toString());
        aliceBalances.ethx.push((await ethx.balanceOf(alice.address)).toString());
        carlBalances.ethx.push((await ethx.balanceOf(carl.address)).toString());
        karenBalances.ethx.push((await ethx.balanceOf(karen.address)).toString());
        bobBalances.ethx.push((await ethx.balanceOf(bob.address)).toString());

        appBalances.usdcx.push((await usdcx.balanceOf(app.address)).toString());
        ownerBalances.usdcx.push((await usdcx.balanceOf(admin.address)).toString());
        aliceBalances.usdcx.push((await usdcx.balanceOf(alice.address)).toString());
        carlBalances.usdcx.push((await usdcx.balanceOf(carl.address)).toString());
        karenBalances.usdcx.push((await usdcx.balanceOf(karen.address)).toString());
        bobBalances.usdcx.push((await usdcx.balanceOf(bob.address)).toString());

        appBalances.ric.push((await ric.balanceOf(app.address)).toString());
        ownerBalances.ric.push((await ric.balanceOf(admin.address)).toString());
        aliceBalances.ric.push((await ric.balanceOf(alice.address)).toString());
        carlBalances.ric.push((await ric.balanceOf(carl.address)).toString());
        karenBalances.ric.push((await ric.balanceOf(karen.address)).toString());
        bobBalances.ric.push((await ric.balanceOf(bob.address)).toString());
    }
    async function checkBalance(user: SignerWithAddress) {
        console.log('Balance of ', user);
        console.log('usdcx: ', (await usdcx.balanceOf(user.address)).toString());
        console.log('ethx: ', (await ethx.balanceOf(user.address)).toString());
        console.log('ric: ', (await ric.balanceOf(user.address)).toString());
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

        const { createSFRegistrationKey } = await common();

        u = users;
        sf = superfluid;
        superT = superTokens;
        tokenss = tokens;
        userAccounts = accounts;
        sfRegistrationKey = createSFRegistrationKey;
        constant = constants;
        tp = tellor;

        const registrationKey = await sfRegistrationKey(sf, u.admin.address);

        // Deploy REXReferral
        rexReferral = await ethers.getContractFactory("REXReferral", {
            signer: owner,
        });
        let referral = await rexReferral.deploy();
        await referral.deployed();

        // app = await REXTwoWayMarket.deploy(
        //     // u.admin.address,
        //     admin.address,
        //     sf.host.address,
        //     sf.agreements.cfa.address,
        //     sf.agreements.ida.address,
        //     registrationKey,
        //     referral.address);

        // ==============
        // Deploy REX Market
        console.log("Deploying REXTwoWayMarket...");
        const REXMarketFactory = await ethers.getContractFactory(
            "REXTwoWayMarket",
            userAccounts["admin"]
        );
        app = await REXMarketFactory.deploy(
            u.admin.address,
            sf.host.hostContract.address,
            constant.IDA_SUPERFLUID_ADDRESS,
            constant.CFA_SUPERFLUID_ADDRESS,
            registrationKey,
            referral.address
        );
        console.log("Deployed REXTwoWayMarket");

        await app.initializeTwoWayMarket(
            usdcx.address,
            Constants.TELLOR_USDC_REQUEST_ID,
            1e9,
            ethx.address,
            Constants.TELLOR_ETH_REQUEST_ID,
            1e9,
            20000,
            20000
        )

        // const REXTwoWayMarket = await ethers.getContractFactory("REXTwoWayMarket", {
        //     signer: owner,
        // });

        await app.initializeSubsidies(10000000000000);

        // Update the oracles
        // Get actual price
        let httpService = new HttpService();
        const url = "https://api.coingecko.com/api/v3/simple/price?ids=" + Constants.COINGECKO_KEY + "&vs_currencies=usd";
        let response = await httpService.get(url);
        oraclePrice = response.data[Constants.COINGECKO_KEY].usd * 1000000;
        console.log("oraclePrice", oraclePrice.toString());
        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        const url2 = "https://api.coingecko.com/api/v3/simple/price?ids=richochet&vs_currencies=usd";
        response = await httpService.get(url2);
        response.data = "";
        ricOraclePrice = response.data["richochet"].usd * 1000000;
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, 1000000);

        // send the contract some RIC
        await ric.transfer(app.address, "3971239975789381077848")

        // Register the market with REXReferral
        await referral.registerApp(app.address);
        referral = await referral.connect(carl);
        await referral.applyForAffiliate("carl", "carl");
        referral = await referral.connect(owner);
        await referral.verifyAffiliate("carl");

        // u.app = sf.user({
        // app = sf.user({
        //     address: app.address,
        //     token: outputx.address,
        // });
        // u.app.alias = "App";
        // app.alias = "App";    // AM --> what is alias for ?
        // ==============

    }); // End of "before" block

    xit("should not allow two streams", async () => {
        const inflowRateUsdc = "1000000000000000";
        const inflowRateEth = "10000000000000";
        const inflowRateIDASharesUsdc = "1000000";
        const inflowRateIDASharesEth = "10000";

        console.log("Transfer alice");
        await usdcx.connect(usdcSpender).transfer(alice.address, toWad(400));
        console.log("Transfer bob");
        await ethx.connect(ethSpender).transfer(alice.address, toWad(5)); //, { from: u.ethspender.address });
        console.log("Done");

        // await funcApproveSubscriptions([aliceAndAddress.address, bobAndAddress.address]);

        //     const flowRate = getPerSecondFlowRateByMonth("100");
        // try {
        //     framework.cfaV1.createFlow({
        //         flowRate,
        //         receiver: alpha.address + "0",
        //         superToken: superToken.address,
        //     });
        // } catch (err: any) {
        //     expect(err.message).to.eql(
        //         "Invalid Address Error - The address you have entered is not a valid ethereum address."
        //     );
        // }

        const txnResponse = await sf.cfaV1
            .createFlow({
                sender: alice.address,
                flowRate: inflowRateUsdc,
                receiver: u.app.address,
                superToken: usdcx.address
            }).exec(userAccounts["alice"]);
        const txnReceipt = await txnResponse.wait();

        await expect(
            sf.cfaV1.createFlow({
                sender: alice.address,
                flowRate: inflowRateEth,
                receiver: u.app.address,
                superToken: ethx.address
            })
        ).to.be.revertedWith("Already streaming");
    });

    it.only("should make sure subsidy tokens and output tokens are correct", async () => {
        // The token with feeRate != 0 is output token in this case that is ethx 
        // The token with emissionRate != 0 is subsidy token in this case that ric tokens. 
        // 0. Approve subscriptions
        await usdcx.connect(usdcSpender).transfer(alice.address, toWad(400).toString());
        //console.log("transfer?");
        //await ricx.transfer(u.app.address, toWad(400).toString(), { from: u.admin.address });
        //console.log("ric transfer");
        //checkBalance(u.bob);
        //checkBalance(u.alice);
        //checkBalance(u.spender);
        //checkBalance(u.admin);
        //console.log(toWad(10).toString());
        //await ethx.transfer(u.app.address, toWad(10).toString(), { from: u.bob.address });
        //console.log("ethx transfer");
        // await funcApproveSubscriptions();
        await sf.idaV1
            .approveSubscription({
                indexId: "0",
                superToken: superT.ethx.address,
                publisher: u.app.address,
                userData: "0x",
            })
            .exec(userAccounts["admin"]);

        // 1. Check balance for output and subsidy tokens and usdcx
        //await takeMeasurements();
        await checkBalance(alice);
        let myFlowRate = "77160493827160";

        // 2. Create a stream from an account to app to exchange tokens
        // let aliceBeforeBalance = parseInt(await ric.balanceOf(u.alice.address));
        let aliceBeforeBalance = await ric.balanceOf(alice.address);
        console.log(aliceBeforeBalance);   // NOTE: it"s a BigNumber

        const txnResponse = await sf.cfaV1
            .createFlow({
                sender: alice.address,
                flowRate: myFlowRate,
                receiver: u.app.address,
                superToken: ethx.address
            }).exec(userAccounts["admin"]);

        // 3. Increase time by 1 hour
        await increaseTime(60 * 60);
        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        await app.updateTokenPrice(usdcx.address);
        await app.updateTokenPrice(outputx.address);
        // 4. Stop the flow   AM ---> Why is the flow not stopped ?
        //await u.alice.flow({ flowRate: "0", recipient: u.app });
        let deltaAlice = await delta(alice, aliceBalances);
        console.log(deltaAlice);
        // 4. Distribute tokens 
        await checkBalance(alice);
        await app.distribute("0x");
        await checkBalance(alice);
        // 5. Check balance for output and subsidy tokens
        let ricEmissionRate = 10000000000000;
        let expectAliceRicRewards = 60 * 60 * ricEmissionRate;
        let aliceAfterBalance = await ric.balanceOf(alice.address);    // JR --> I removed the conversion to string
        console.log(aliceAfterBalance);
        let aliceBeforeBalanceInNumber: number = aliceBeforeBalance.toNumber();
        expect(aliceAfterBalance).to.within(
            (ethers.BigNumber.from(aliceBeforeBalanceInNumber + (expectAliceRicRewards * 0.999))).toNumber(),
            (ethers.BigNumber.from(aliceBeforeBalanceInNumber + (expectAliceRicRewards * 1.06))).toNumber()
        );
    });

    xit("should create a stream exchange with the correct parameters", async () => {
        const inflowRate = "77160493827160";
        const inflowRateIDAShares = "77160";

        console.log("Transfer alice");
        await usdcx.connect(usdcSpender).transfer(alice.address, toWad(400));
        console.log("Transfer bob");      // AM ---> ethspender or ethSpender 
        await ethx.connect(ethSpender).transfer(bob.address, toWad(5));
        console.log("Done");

        await approveSubscriptions([alice.address, bob.address]);

        // framework.cfaV1.createFlow({ flowRate: inflowRateUsdc, receiver: app, superToken: usdcx.address });
        // framework.cfaV1.createFlow({ flowRate: inflowRate, receiver: app, superToken: usdcx.address });
        const txnResponseAlice = await sf.cfaV1
            .createFlow({
                sender: alice.address,
                flowRate: inflowRate,
                receiver: u.app.address,
                superToken: ethx.address
            }).exec(userAccounts["admin"]);

        // await alice.flow({ flowRate: inflowRate, recipient: u.app });
        const txnResponseBob = await sf.cfaV1
            .createFlow({
                sender: bob.address,
                flowRate: inflowRate,
                receiver: u.app.address,
                superToken: ethx.address
            }).exec(userAccounts["admin"]);

        // await u.bob.flow({ flowRate: inflowRate, recipient: u.app });
        // Expect the parameters are correct       // TODO
        expect(await app.getStreamRate(alice.address, usdcx.address)).to.equal(inflowRate);
        expect((await app.getIDAShares(1, alice.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);
        expect((await app.getIDAShares(0, alice.address)).toString()).to.equal(`true,true,0,0`);
        expect(await app.getStreamRate(bob.address, ethx.address)).to.equal(inflowRate);
        expect((await app.getIDAShares(1, bob.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(0, bob.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);
    });

    xit("approval should be unlimited", async () => {
        // await funcApproveSubscriptions();
        await sf.idaV1
            .approveSubscription({
                indexId: "0",
                superToken: superT.ethx.address,
                publisher: u.app.address,
                userData: "0x",
            })
            .exec(userAccounts["admin"]);
        // TODO
        expect(await output.allowance(app.address, Constants.SUSHISWAP_ROUTER_ADDRESS))
            .to.be.equal(ethers.constants.MaxUint256);
        expect(await usdc.allowance(app.address, Constants.SUSHISWAP_ROUTER_ADDRESS))
            .to.be.equal(ethers.constants.MaxUint256);
        expect(await output.allowance(app.address, ethx.address))
            .to.be.equal(ethers.constants.MaxUint256);
        expect(await usdc.allowance(app.address, usdcx.address))
            .to.be.equal(ethers.constants.MaxUint256);
    });

    it("should distribute tokens to streamers", async () => {
        // await funcApproveSubscriptions([alice.address, bob.address, carl.address, karen.address, admin.address]);
        await sf.idaV1
            .approveSubscription({
                indexId: "0",
                superToken: superT.ethx.address,
                publisher: u.app.address,
                userData: "0x",
            })
            .exec(userAccounts["bob"]);

        await sf.idaV1
            .approveSubscription({
                indexId: "0",
                superToken: superT.ethx.address,
                publisher: u.app.address,
                userData: "0x",
            })
            .exec(userAccounts[""]);    // TODO

        console.log("Transfer alice");
        await usdcx.connect(usdcSpender).transfer(alice.address, toWad(400));
        console.log("Transfer bob");
        await ethx.connect(ethSpender).transfer(bob.address, toWad(5));
        console.log("Done");

        const inflowRateUsdc = "1000000000000000";
        const inflowRateEth = "10000000000000";
        const inflowRateIDASharesUsdc = "1000000";
        const inflowRateIDASharesEth = "10000";

        // 1. Initialize a stream exchange
        // 2. Create 2 streamers, one with 2x the rate of the other
        // await alice.flow({ flowRate: inflowRateUsdc, recipient: app, userData: web3.eth.abi.encodeParameter("string", "carl") });
        const txnResponseAlice = await sf.cfaV1
            .createFlow({
                sender: alice.address,
                flowRate: inflowRateUsdc,
                receiver: u.app.address,
                superToken: superT.usdcx.address
            }).exec(userAccounts["alice"]);
        const txnReceiptAlice = await txnResponseAlice.wait();
        // await bob.flow({ flowRate: inflowRateEth, recipient: app });     
        const txnResponseBob = await sf.cfaV1
            .createFlow({
                sender: bob.address,
                flowRate: inflowRateEth,
                receiver: u.app.address,
                superToken: superT.ethx.address
            }).exec(userAccounts["bob"]);
        const txnReceiptBob = await txnResponseAlice.wait();

        await takeMeasurements();
        // TODO 
        expect(
            await app.getStreamRate(alice.address, superT.usdcx.address)
        ).to.equal(inflowRateUsdc);
        expect(
            (await app.getIDAShares(1, alice.address)).toString()
        ).to.equal(`true,true,980000,0`);
        expect(
            (await app.getIDAShares(1, admin.address)).toString()
        ).to.equal(`true,true,18000,0`);
        expect(
            await app.getStreamRate(bob.address, ethx.address)
        ).to.equal(inflowRateEth);
        expect(
            (await app.getIDAShares(0, bob.address)).toString()
        ).to.equal(`true,true,9800,0`);
        expect(
            (await app.getIDAShares(0, carl.address)).toString()
        ).to.equal(`true,true,0,0`);
        expect(
            (await app.getIDAShares(0, admin.address)).toString()
        ).to.equal(`true,true,200,0`);
        // 3. Advance time 1 hour
        await increaseTime(3600);
        console.log("Fast forward");
        await checkBalance(alice);
        await checkBalance(bob);
        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, 1000000);
        // await app.updateTokenPrices();
        await app.updateTokenPrice(superT.usdcx.address);
        await app.updateTokenPrice(superT.ethx.address);
        // 4. Trigger a distribution
        await app.distribute("0x");
        // This fifth step is commented in OneWay  // TODO
        // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        await takeMeasurements();

        let deltaAlice = await delta(alice, aliceBalances);
        let deltaCarl = await delta(carl, carlBalances);
        let deltaKaren = await delta(karen, karenBalances);
        let deltaBob = await delta(bob, bobBalances);
        let deltaOwner = await delta(owner, ownerBalances);
        // verify
        console.log(deltaOwner)
        console.log(deltaCarl)
        console.log(deltaKaren)
        console.log(deltaAlice)
        console.log(deltaBob)
        // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
        expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.ethx * 0.98, deltaAlice.ethx * 1.06)

        // TODO: Check that there was a sushiswap event with Bobs ETH less alices USD gets Swapped

        // Flip, alice streams more USDC than Bob streams ETH
        expect((await app.getIDAShares(1, carl.address)).toString()).to.equal(`true,true,2000,0`);
        const txnResponseAlice2 = await sf.cfaV1
            .createFlow({
                sender: alice.address,
                flowRate: (parseInt(inflowRateUsdc) * 10).toString(),
                receiver: u.app.address,
                superToken: superT.usdcx.address
            }).exec(userAccounts["alice"]);

        // await alice.flow({ flowRate: (parseInt(inflowRateUsdc) * 10).toString(), recipient: app });

        expect(await app.getStreamRate(alice.address, usdcx.address)).to.equal("10000000000000000");
        expect((await app.getIDAShares(1, alice.address)).toString()).to.equal(`true,true,9800000,0`);
        expect((await app.getIDAShares(1, carl.address)).toString()).to.equal(`true,true,20000,0`);
        expect((await app.getIDAShares(1, admin.address)).toString()).to.equal(`true,true,180000,0`);
        expect(await app.getStreamRate(bob.address, ethx.address)).to.equal(inflowRateEth);
        expect((await app.getIDAShares(0, bob.address)).toString()).to.equal(`true,true,9800,0`);
        expect((await app.getIDAShares(0, carl.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(0, admin.address)).toString()).to.equal(`true,true,200,0`);
        await takeMeasurements();
        await increaseTime(3600);
        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        await app.updateTokenPrices();
        // 4. Trigger a distribution
        await app.distribute("0x");
        // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        await takeMeasurements();

        deltaAlice = await delta(alice, aliceBalances);
        deltaCarl = await delta(carl, carlBalances);
        deltaKaren = await delta(karen, karenBalances);
        deltaBob = await delta(bob, bobBalances);
        deltaOwner = await delta(owner, ownerBalances);
        // verify
        console.log(deltaOwner)
        console.log(deltaCarl)
        console.log(deltaKaren)
        console.log(deltaAlice)
        console.log(deltaBob)
        // Fee taken during harvest, can be a larger % of what"s actually distributed via IDA due to rounding the actual amount
        expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.ethx * 0.98, deltaAlice.ethx * 1.06)

        console.log("Transfer karen");
        await usdcx.connect(usdcSpender).transfer(karen.address, toWad(400));

        // Add another streamer, alice streams more USDC than Bob streams ETH
        const txnResponseAlice3 = await sf.cfaV1
            .createFlow({
                sender: alice.address,
                flowRate: inflowRateUsdc,
                receiver: u.app.address,
                superToken: superT.usdcx.address
            }).exec(userAccounts["alice"]);

        // await karen.flow({ flowRate: inflowRateUsdc, recipient: app });    
        expect(await app.getStreamRate(alice.address, usdcx.address)).to.equal("10000000000000000");
        expect((await app.getIDAShares(1, alice.address)).toString()).to.equal(`true,true,9800000,0`);
        expect((await app.getIDAShares(1, carl.address)).toString()).to.equal(`true,true,20000,0`);
        expect(await app.getStreamRate(bob.address, ethx.address)).to.equal(inflowRateEth);
        expect((await app.getIDAShares(0, bob.address)).toString()).to.equal(`true,true,9800,0`);
        expect((await app.getIDAShares(0, carl.address)).toString()).to.equal(`true,true,0,0`);
        expect((await app.getIDAShares(0, admin.address)).toString()).to.equal(`true,true,200,0`);
        expect(await app.getStreamRate(karen.address, usdcx.address)).to.equal(inflowRateUsdc);
        expect((await app.getIDAShares(1, karen.address)).toString()).to.equal(`true,true,980000,0`);
        expect((await app.getIDAShares(1, admin.address)).toString()).to.equal(`true,true,200000,0`);

        await takeMeasurements();
        await increaseTime(3600);

        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        await app.updateTokenPrices();
        // 4. Trigger a distribution
        await app.distribute("0x");
        // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        await takeMeasurements();

        deltaAlice = await delta(alice, aliceBalances);
        deltaCarl = await delta(carl, carlBalances);
        deltaKaren = await delta(karen, karenBalances);
        deltaBob = await delta(bob, bobBalances);
        deltaOwner = await delta(owner, ownerBalances);
        // verify
        console.log(deltaOwner)
        console.log(deltaCarl)
        console.log(deltaKaren)
        console.log(deltaAlice)
        console.log(deltaBob)
        // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
        expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        expect(deltaAlice.usdcx / oraclePrice * 1e6 * -1).to.within(deltaAlice.ethx * 0.98, deltaAlice.ethx * 1.06)
        expect(deltaKaren.usdcx / oraclePrice * 1e6 * -1).to.within(deltaKaren.ethx * 0.98, deltaKaren.ethx * 1.06)

        let aliceBeforeBalance = await usdcx.balanceOf(alice.address);
        console.log("before", aliceBeforeBalance.toString());
        // await traveler.advanceTimeAndBlock(30);
        // await alice.flow({ flowRate: "0", recipient: app });
        // framework.cfaV1.createFlow({ flowRate: "0", receiver: app, superToken: usdcx.address });   // TODO
        let aliceAfterBalance = await usdcx.balanceOf(alice.address);
        // Need to also account for the four hour fee
        let aliceBeforeBalanceInNumber = aliceBeforeBalance.toNumber();
        let aliceAfterBalanceInNumber = aliceAfterBalance.toNumber();
        aliceAfterBalanceInNumber = aliceAfterBalanceInNumber - 4 * 60 * 60 * parseInt(inflowRateUsdc) * 10;
        expect(aliceBeforeBalance).to.within(aliceAfterBalanceInNumber * 0.999, aliceAfterBalanceInNumber * 1.001);
        expect(await app.getStreamRate(alice.address, usdcx.address)).to.equal(0);
        expect((await app.getIDAShares(1, alice.address)).toString()).to.equal(`true,true,0,0`);

        await takeMeasurements();
        await increaseTime(3600);

        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        await app.updateTokenPrices();
        // 4. Trigger a distributions
        await app.distribute("0x");
        // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        await takeMeasurements();

        deltaAlice = await delta(alice, aliceBalances);
        deltaCarl = await delta(carl, carlBalances);
        deltaKaren = await delta(karen, karenBalances);
        deltaBob = await delta(bob, bobBalances);
        deltaOwner = await delta(owner, ownerBalances);
        // verify
        console.log(deltaOwner)
        console.log(deltaCarl)
        console.log(deltaKaren)
        console.log(deltaAlice)
        console.log(deltaBob)
        // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
        expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        expect(deltaAlice.usdcx).to.equal(0)
        expect(deltaAlice.ethx).to.equal(0)
        expect(deltaKaren.usdcx / oraclePrice * 1e6 * -1).to.within(deltaKaren.ethx * 0.98, deltaKaren.ethx * 1.06)

        // Add another streamer, alice streams more USDC than Bob streams ETH
        // await karen.flow({ flowRate: "0", recipient: app });
        // framework.cfaV1.createFlow({ flowRate: "0", receiver: app, superToken: usdcx.address });   // TODO
        // TODO
        expect(await app.getStreamRate(karen.address, usdcx.address)).to.equal(0);
        expect((await app.getIDAShares(1, karen.address)).toString()).to.equal(`true,true,0,0`);

        await takeMeasurements();
        await increaseTime(3600);

        await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
        await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
        await tp.submitValue(Constants.TELLOR_RIC_REQUEST_ID, ricOraclePrice);
        await app.updateTokenPrices();
        // 4. Trigger a distribution
        await app.distribute("0x");
        // 5. Verify streamer 1 streamed 1/2 streamer 2"s amount and received 1/2 the output
        await takeMeasurements();

        deltaAlice = await delta(alice, aliceBalances);
        deltaCarl = await delta(carl, carlBalances);
        deltaKaren = await delta(karen, karenBalances);
        deltaBob = await delta(bob, bobBalances);
        deltaOwner = await delta(owner, ownerBalances);
        // verify
        console.log(deltaOwner)
        console.log(deltaCarl)
        console.log(deltaKaren)
        console.log(deltaAlice)
        console.log(deltaBob)
        // Fee taken during harvest, can be a larger % of what's actually distributed via IDA due to rounding the actual amount
        expect(deltaBob.ethx * oraclePrice / 1e6 * -1).to.within(deltaBob.usdcx * 0.98, deltaBob.usdcx * 1.06)
        expect(deltaKaren.usdcx).to.equal(0)
        expect(deltaKaren.ethx).to.equal(0)

    });

});
