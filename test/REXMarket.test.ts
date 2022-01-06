import { ethers } from "hardhat";
import web3 from "web3";
import web3tx from "@decentral.ee/web3-helpers";
import { loadFixture } from "ethereum-waffle";
import { Framework } from "@superfluid-finance/sdk-core";
import SuperfluidGovernanceBase from "@superfluid-finance/ethereum-contracts/build/contracts/SuperfluidGovernanceII.json";
import { TellorPlayground, ISuperToken } from "../typechain"
// import TellorPlayground from "usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json";
// import { web3tx, wad4human } from "@decentral.ee/web3-helpers";
import { getSeconds, impersonateAccounts, increaseTime } from "./helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import HttpService from "./HttpService";
// const { defaultAbiCoder } = require("ethers/lib/utils");

// Source: https://github.com/superfluid-finance/protocol-monorepo/tree/dev/packages/sdk-core
// ethers.js + hardhat provider initialization (in testing environment w/ hardhat-ethers)
async function createSFFramework() {
    const RESOLVER_ADDRESS = `testKey-${Date.now()}`;
    const [deployer] = await ethers.getSigners();
    const ethersProvider = deployer.provider;
    const ethersjsSf = await Framework.create({
        networkName: "matic",
        dataMode: "WEB3_ONLY",
        resolverAddress: RESOLVER_ADDRESS,
        protocolReleaseVersion: "test",
        provider: ethers.getDefaultProvider(),
    });
}

async function createSFRegistrationKey(sf: any, deployer: any) {
    const registrationKey = `testKey-${Date.now()}`;
    // const appKey = ethers.utils.solidityKeccak256(["string"], ["KEEPER_ROLE"]);
    const appKey = web3.utils.sha3(
        web3.eth.abi.encodeParameters(
            ['string', 'address', 'string'],
            [
                'org.superfluid-finance.superfluid.appWhiteListing.registrationKey',
                deployer,
                registrationKey,
            ],
        ),
    );

    const governance = await sf.host.getGovernance.call();
    console.log(`SF Governance: ${governance}`);

    const sfGovernanceRO = await ethers
        .getContractAt(SuperfluidGovernanceBase.abi, governance);

    // let govOwner = await sfGovernanceRO.owner();
    // console.log("Address of govOwner: ", govOwner);
    const [govOwner] = await impersonateAccounts([await sfGovernanceRO.owner()]);
    console.log("Address of govOwner: ", govOwner.address);

    const sfGovernance = await ethers
        .getContractAt(SuperfluidGovernanceBase.abi, governance, govOwner);

    await sfGovernance.whiteListNewApp(sf.host.address, appKey);

    return registrationKey;
}

describe("RexMarket", function () {
    let sf: any;
    let dai: ISuperToken;
    let daix: ISuperToken;
    let ethx: ISuperToken;
    let wbtc: ISuperToken;
    let wbtcx: ISuperToken;
    let usd: ISuperToken;
    let usdcx: ISuperToken;
    let ric: ISuperToken;
    let usdc: ISuperToken;
    let eth: ISuperToken;
    let weth: ISuperToken;
    let app: any;
    let tp: any;
    let tpInstance: TellorPlayground;
    let usingTellor;
    let sr; // Mock Sushi Router
    let admin: SignerWithAddress;
    let owner: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let carl: SignerWithAddress;
    let spender: SignerWithAddress;

    const ricAddress = '0x263026e7e53dbfdce5ae55ade22493f828922965';
    const SF_RESOLVER = '0xE0cc76334405EE8b39213E620587d815967af39C';
    const RIC_TOKEN_ADDRESS = '0x263026E7e53DBFDce5ae55Ade22493f828922965';
    const SUSHISWAP_ROUTER_ADDRESS = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';
    const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
    const TELLOR_REQUEST_ID = 60;

    // random addresses from polygonscan that have a lot of usdcx
    const USDCX_SOURCE_ADDRESS = '0xA08f80dc1759b12fdC40A4dc64562b322C418E1f';
    const WBTC_SOURCE_ADDRESS = '0x5c2ed810328349100A66B82b78a1791B101C9D61';
    const USDC_SOURCE_ADDRESS = '0x1a13f4ca1d028320a707d99520abfefca3998b7f';

    const CARL_ADDRESS = '0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf';
    const BOB_ADDRESS = '0x00Ce20EC71942B41F50fF566287B811bbef46DC8';
    const ALICE_ADDRESS = '0x9f348cdD00dcD61EE7917695D2157ef6af2d7b9B';
    const OWNER_ADDRESS = '0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA';
    let oraclePrice: number;

    const appBalances = {
        ethx: [""],
        wbtcx: [""],
        usdcx: [""],
        ric: [""],
    };
    const ownerBalances = {
        ethx: [""],
        wbtcx: [""],
        daix: [""],
        usdcx: [""],
        ric: [""],
    };
    const aliceBalances = {
        ethx: [""],
        wbtcx: [""],
        daix: [""],
        usdcx: [""],
        ric: [""],
    };
    const bobBalances = {
        ethx: [""],
        wbtcx: [""],
        daix: [""],
        usdcx: [""],
        ric: [""],
    };

    async function approveSubscriptions(
        users = [alice.address, bob.address, admin.address],
        tokens = [wbtcx.address, ricAddress],
    ) {
        // Do approvals
        // Already approved?

        console.log("admin address", admin.address);
        console.log('Approving subscriptions...');

        for (let tokenIndex = 0; tokenIndex < tokens.length; ++tokenIndex) {
            for (let userIndex = 0; userIndex < users.length; ++userIndex) {
                let index = 0;
                if (tokens[tokenIndex] === ricAddress) {
                    index = 1;
                }

                await web3tx(
                    sf.host.callAgreement,
                    `${users[userIndex]} approves subscription to the app ${tokens[tokenIndex]} ${index}`,
                )(
                    sf.agreements.ida.address,
                    sf.agreements.ida.contract.methods
                        .approveSubscription(tokens[tokenIndex], app.address, tokenIndex, '0x')
                        .encodeABI(),
                    '0x', // user data
                    {
                        from: users[userIndex],
                    },
                );
            }
        }

        console.log('Approved!');
    }

    before(async () => {
        // ==============
        // impersonate accounts, set balances and get signers

        [admin, owner, alice, bob, carl, spender] = await ethers.getSigners();

        const accountAddrs = [OWNER_ADDRESS, ALICE_ADDRESS, BOB_ADDRESS, CARL_ADDRESS, USDCX_SOURCE_ADDRESS];

        const accounts = [owner, alice, bob, carl, spender] = await impersonateAccounts(accountAddrs);

        // ==============
        // Init Superfluid Framework

        sf = new SuperfluidSDK.Framework({
            web3,
            resolverAddress: SF_RESOLVER,
            tokens: ['WBTC', 'DAI', 'USDC', 'ETH'],
            version: 'v1',
        });

        await sf.initialize();
        ethx = sf.tokens.ETHx;
        wbtcx = sf.tokens.WBTCx;
        daix = sf.tokens.DAIx;
        usdcx = sf.tokens.USDCx;

        // ==============
        // Init SF users    // JR --> I think this init section is not needed
        /*
                for (let i = 0; i < users.length; i += 1) {
                    users[i].toLowerCase() = sf.user({
                        address: accounts[i]._address || accounts[i].address,
                        token: usdcx.address,
                    });
                    users[i].toLowerCase() = names[i];
                    aliases[u[names[i].toLowerCase()].address] = names[i];
                }
        */
        // ==============
        // NOTE: Assume the oracle is up to date
        // Deploy Tellor Oracle contracts

        tp = await ethers.getContractFactory(""); // getContractAt(tp.abi, TELLOR_ORACLE_ADDRESS, owner);
        tpInstance = await tp.deploy();
        await tpInstance.deployed();

        // ==============
        // Setup tokens

        ric = await ethers.getContractAt("ISuperToken", RIC_TOKEN_ADDRESS, owner);
        weth = await ethers.getContractAt("ISuperToken", await ethx.getUnderlyingToken());
        wbtc = await ethers.getContractAt("ISuperToken", await wbtcx.getUnderlyingToken());
        usdc = await ethers.getContractAt("ISuperToken", await usdcx.getUnderlyingToken());
    });

    // Use this function in a similar way to `beforeEach` function but with waffle fixture
    async function deployContracts() {
        // ==============
        // Deploy REXMarket contract

        // Include this in REXMarket deployment constructor code
        const registrationKey = await createSFRegistrationKey(sf, admin.address);

        let REXMarketFactory = await ethers.getContractFactory("REXMarket", owner);
        app = await REXMarketFactory.deploy(
            owner.address,
            sf.host.address,
            sf.agreements.cfa.address,
            sf.agreements.ida.address
        );

        app = sf.user({
            address: app.address,
            token: wbtcx.address,
        });

        app.alias = 'App';

        // ==============
        // Get actual price
        // this endpoint returns a number    // JR
        const url = "https://api.coingecko.com/api/v3/simple/price?ids=wrapped-bitcoin&vs_currencies=usd";
        let httpService = new HttpService();
        const response = await httpService.get(url);
        oraclePrice = response.data['wrapped-bitcoin'].usd * 1.02 * 1000000;
        console.log('=== oraclePrice: ' + oraclePrice.toString());
        await tp.submitValue(60, ethers.BigNumber.from(oraclePrice));
    }

    // async function deployContracts() {
    //     // ==============
    //     // Deploy Stream Exchange

    //     const StreamExchangeHelper = await ethers.getContractFactory('StreamExchangeHelper');
    //     const sed = await StreamExchangeHelper.deploy();

    //     const StreamExchange = await ethers.getContractFactory('StreamExchange', {
    //         libraries: {
    //             StreamExchangeHelper: sed.address,
    //         },
    //         signer: owner,
    //     });

    //     const registrationKey = await createSFRegistrationKey(sf, u.admin.address);

    //     // NOTE: To attach to existing SE
    //     // let se = await StreamExchange.attach(STREAM_EXCHANGE_ADDRESS);

    //     // console.log('Deploy params:');
    //     // console.log('SF HOST', sf.host.address);
    //     // console.log('SF CFA', sf.agreements.cfa.address);
    //     // console.log('SF IDA', sf.agreements.ida.address);
    //     // console.log('USDCx', usdcx.address);
    //     // console.log('WBTCx', wbtcx.address);
    //     // console.log('SF Registration Key', registrationKey);

    //     console.log('Deploying StreamExchange...');
    //     app = await StreamExchange.deploy(sf.host.address,
    //         sf.agreements.cfa.address,
    //         sf.agreements.ida.address,
    //         usdcx.address,
    //         wbtcx.address,
    //         RIC_TOKEN_ADDRESS,
    //         SUSHISWAP_ROUTER_ADDRESS, // sr.address,
    //         TELLOR_ORACLE_ADDRESS,
    //         TELLOR_REQUEST_ID,
    //         registrationKey);

    //     console.log('Deployed');
    //     // console.log(await ric.balanceOf(u.admin.address));
    //     // await ric.transfer(app.address, "1000000000000000000000000")

    //     u.app = sf.user({
    //         address: app.address,
    //         token: wbtcx.address,
    //     });

    //     u.app.alias = 'App';

    //     // ==============
    //     // Get actual price
    //     const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=wrapped-bitcoin&vs_currencies=usd');
    //     oraclePrice = parseInt(response.data['wrapped-bitcoin'].usd * 1.02 * 1000000).toString();
    //     console.log('oraclePrice', oraclePrice);
    //     await tp.submitValue(60, oraclePrice);
    // }

    async function checkBalance(user: SignerWithAddress) {
        console.log('Balance of ', user);
        console.log('usdcx: ', (await usdcx.balanceOf(user.address)).toString());
        console.log('wbtcx: ', (await wbtcx.balanceOf(user.address)).toString());
    }

    async function checkBalances(accounts: any[]) {
        for (let i = 0; i < accounts.length; ++i) {
            await checkBalance(accounts[i]);
        }
    }

    async function upgrade(accounts: any[]) {
        for (let i = 0; i < accounts.length; ++i) {
            await web3tx(
                usdcx.upgrade,
                `${accounts[i].alias} upgrades many USDCx`,
            )(parseUnits("100000000", 18), {
                from: accounts[i].address,
            });
            await web3tx(
                daix.upgrade,
                `${accounts[i].alias} upgrades many DAIx`,
            )(parseUnits("100000000", 18), {
                from: accounts[i].address,
            });

            await checkBalance(accounts[i]);
        }
    }

    async function logUsers() {
        let string = 'user\t\ttokens\t\tnetflow\n';
        let p = 0;
        let [, user] = await ethers.getSigners();
        // for (const [, user] of Object.entries(u)) {
        if (await hasFlows(user)) {
            p++;
            string += `${user}\t\t${wad4human(
                await usdcx.balanceOf(user.address),
            )}\t\t${wad4human((await user.details()).cfa.netFlow)}
                `;
        }
        // }
        if (p == 0) return console.warn('no users with flows');
        console.log('User logs:');
        console.log(string);
    }

    async function hasFlows(user: any) {
        const {
            inFlows,
            outFlows,
        } = (await user.details()).cfa.flows;
        return inFlows.length + outFlows.length > 0;
    }

    async function appStatus() {
        const isApp = await sf.host.isApp(app.address);
        const isJailed = await sf.host.isAppJailed(app.address);
        !isApp && console.error('App is not an App');
        isJailed && console.error('app is Jailed');
        await checkBalance(app);
        await checkOwner();
    }

    async function checkOwner() {
        const owner = admin.address;
        console.log('Contract Owner: ', owner);
        return owner.toString();
    }

    async function subscribe(user: SignerWithAddress) {
        // Alice approves a subscription to the app
        console.log(sf.host.callAgreement);
        console.log(sf.agreements.ida.address);
        console.log(usdcx.address);
        console.log(app.address);
        await web3tx(
            sf.host.callAgreement,
            'user approves subscription to the app',
        )(
            sf.agreements.ida.address,
            sf.agreements.ida.contract.methods
                .approveSubscription(ethx.address, app.address, 0, '0x')
                .encodeABI(),
            '0x', // user data
            {
                from: user,
            },
        );
    }

    async function delta(account: any, balances: any) {
        const len = balances.wbtcx.length;
        const changeInOutToken = balances.wbtcx[len - 1] - balances.wbtcx[len - 2];
        const changeInInToken = balances.usdcx[len - 1] - balances.usdcx[len - 2];
        console.log();
        console.log('Change in balances for ', account);
        console.log('Usdcx:', changeInInToken, 'Bal:', balances.usdcx[len - 1]);
        console.log('Wbtcx:', changeInOutToken, 'Bal:', balances.wbtcx[len - 1]);
        console.log('Exchange Rate:', changeInOutToken / changeInInToken);
    }

    async function takeMeasurements() {
        appBalances.ethx.push((await ethx.balanceOf(app.address)).toString());
        ownerBalances.ethx.push((await ethx.balanceOf(admin.address)).toString());
        aliceBalances.ethx.push((await ethx.balanceOf(alice.address)).toString());
        bobBalances.ethx.push((await ethx.balanceOf(bob.address)).toString());

        appBalances.wbtcx.push((await wbtcx.balanceOf(app.address)).toString());
        ownerBalances.wbtcx.push((await wbtcx.balanceOf(admin.address)).toString());
        aliceBalances.wbtcx.push((await wbtcx.balanceOf(alice.address)).toString());
        bobBalances.wbtcx.push((await wbtcx.balanceOf(bob.address)).toString());

        appBalances.usdcx.push((await usdcx.balanceOf(app.address)).toString());
        ownerBalances.usdcx.push((await usdcx.balanceOf(admin.address)).toString());
        aliceBalances.usdcx.push((await usdcx.balanceOf(alice.address)).toString());
        bobBalances.usdcx.push((await usdcx.balanceOf(bob.address)).toString());

        appBalances.ric.push((await ric.balanceOf(app.address)).toString());
        ownerBalances.ric.push((await ric.balanceOf(admin.address)).toString());
        aliceBalances.ric.push((await ric.balanceOf(alice.address)).toString());
        bobBalances.ric.push((await ric.balanceOf(bob.address)).toString());
    }
    it("make sure uninvested sum is streamed back to the streamer / investor / swapper", async () => {
        // Always add the following line of code in all test cases (waffle fixture)
        await loadFixture(deployContracts);

        // start flow of 1000 USDC from admin address
        console.log("balance start", (await usdcx.balanceOf(admin.address)).toString());

        let inflowRate = "2592000000"; // 1000 usdc per month, 1000*24*30*60*60
        await admin.flow({ flowRate: inflowRate, recipient: app });
        
        await increaseTime(getSeconds(30));
        console.log("balance after 30 days", (await usdcx.balanceOf(admin.address)).toString());

        await admin.flow({flowRate: "0", recipient: app});
        console.log("balance afterwards days", (await usdcx.balanceOf(admin.address)).toString());

    });
});
