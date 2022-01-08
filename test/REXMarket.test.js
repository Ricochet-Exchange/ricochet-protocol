// const { expect } = require("chai");
// const { ethers, waffle } = require("hardhat");
// const { provider, loadFixture } = waffle;
// const { parseUnits } = require("@ethersproject/units");
// const SuperfluidSDK = require("@superfluid-finance/js-sdk");
// const SuperfluidGovernanceBase = require('@superfluid-finance/ethereum-contracts/build/contracts/SuperfluidGovernanceII.json');
// const TellorPlayground = require('usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json');
// const axios = require('axios').default;
// const { web3tx, wad4human } = require("@decentral.ee/web3-helpers");
// const {
//     getBigNumber,
//     getTimeStamp,
//     getTimeStampNow,
//     getDate,
//     getSeconds,
//     increaseTime,
//     impersonateAccounts
// } = require("../misc/helpers");
// const { defaultAbiCoder } = require("ethers/lib/utils");
// const { constants } = require("ethers");
//
// async function createSFRegistrationKey(sf, deployer) {
//     const registrationKey = `testKey-${Date.now()}`;
//     const appKey = web3.utils.sha3(
//         web3.eth.abi.encodeParameters(
//             ['string', 'address', 'string'],
//             [
//                 'org.superfluid-finance.superfluid.appWhiteListing.registrationKey',
//                 deployer,
//                 registrationKey,
//             ],
//         ),
//     );
//
//     const governance = await sf.host.getGovernance.call();
//     console.log(`SF Governance: ${governance}`);
//
//     const sfGovernanceRO = await ethers
//         .getContractAt(SuperfluidGovernanceBase.abi, governance);
//
//     // let govOwner = await sfGovernanceRO.owner();
//     // console.log("Address of govOwner: ", govOwner);
//     const [govOwner] = await impersonateAccounts([await sfGovernanceRO.owner()]);
//     console.log("Address of govOwner: ", govOwner.address);
//
//     const sfGovernance = await ethers
//         .getContractAt(SuperfluidGovernanceBase.abi, governance, govOwner);
//
//     await sfGovernance.whiteListNewApp(sf.host.address, appKey);
//
//     return registrationKey;
// }
//
// describe("RexMarket", function() {
//     const names = ['Admin', 'Alice', 'Bob', 'Carl', 'Spender'];
//
//     let sf;
//     let dai;
//     let daix;
//     let ethx;
//     let wbtc;
//     let wbtcx;
//     let usd;
//     let usdcx;
//     let ric;
//     let usdc;
//     let eth;
//     let weth;
//     let app;
//     let tp; // Tellor playground
//     let usingTellor;
//     let sr; // Mock Sushi Router
//     let owner;
//     let alice;
//     let bob;
//     let carl;
//     let spender;
//     const u = {}; // object with all users
//     const aliases = {};
//     const ricAddress = '0x263026e7e53dbfdce5ae55ade22493f828922965';
//     const SF_RESOLVER = '0xE0cc76334405EE8b39213E620587d815967af39C';
//     const RIC_TOKEN_ADDRESS = '0x263026E7e53DBFDce5ae55Ade22493f828922965';
//     const SUSHISWAP_ROUTER_ADDRESS = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';
//     const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
//     const TELLOR_REQUEST_ID = 60;
//
//     // random address from polygonscan that have a lot of usdcx
//     const USDCX_SOURCE_ADDRESS = '0xA08f80dc1759b12fdC40A4dc64562b322C418E1f';
//     const WBTC_SOURCE_ADDRESS = '0x5c2ed810328349100A66B82b78a1791B101C9D61';
//     const USDC_SOURCE_ADDRESS = '0x1a13f4ca1d028320a707d99520abfefca3998b7f';
//
//     const CARL_ADDRESS = '0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf';
//     const BOB_ADDRESS = '0x00Ce20EC71942B41F50fF566287B811bbef46DC8';
//     const ALICE_ADDRESS = '0x9f348cdD00dcD61EE7917695D2157ef6af2d7b9B';
//     const OWNER_ADDRESS = '0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA';
//     let oraclePrice;
//
//     const appBalances = {
//         ethx: [],
//         wbtcx: [],
//         daix: [],
//         usdcx: [],
//         ric: [],
//     };
//     const ownerBalances = {
//         ethx: [],
//         wbtcx: [],
//         daix: [],
//         usdcx: [],
//         ric: [],
//     };
//     const aliceBalances = {
//         ethx: [],
//         wbtcx: [],
//         daix: [],
//         usdcx: [],
//         ric: [],
//     };
//     const bobBalances = {
//         ethx: [],
//         wbtcx: [],
//         daix: [],
//         usdcx: [],
//         ric: [],
//     };
//
//     async function approveSubscriptions(
//         users = [u.alice.address, u.bob.address, u.admin.address],
//         tokens = [wbtcx.address, ricAddress],
//     ) {
//         // Do approvals
//         // Already approved?
//
//         console.log("admin address", u.admin.address);
//         console.log('Approving subscriptions...');
//
//         for (let tokenIndex = 0; tokenIndex < tokens.length; ++tokenIndex) {
//             for (let userIndex = 0; userIndex < users.length; ++userIndex) {
//                 let index = 0;
//                 if (tokens[tokenIndex] === ricAddress) {
//                     index = 1;
//                 }
//
//                 await web3tx(
//                     sf.host.callAgreement,
//                     `${users[userIndex]} approves subscription to the app ${tokens[tokenIndex]} ${index}`,
//                 )(
//                     sf.agreements.ida.address,
//                     sf.agreements.ida.contract.methods
//                         .approveSubscription(tokens[tokenIndex], app.address, tokenIndex, '0x')
//                         .encodeABI(),
//                     '0x', // user data
//                     {
//                         from: users[userIndex],
//                     },
//                 );
//             }
//         }
//
//         console.log('Approved!');
//     }
//
//     before(async () => {
//         // ==============
//         // impersonate accounts, set balances and get signers
//
//         const accountAddrs = [OWNER_ADDRESS, ALICE_ADDRESS, BOB_ADDRESS, CARL_ADDRESS, USDCX_SOURCE_ADDRESS];
//
//         const accounts = [owner, alice, bob, carl, spender] = await impersonateAccounts(accountAddrs);
//
//         // ==============
//         // Init Superfluid Framework
//
//         sf = new SuperfluidSDK.Framework({
//             web3,
//             resolverAddress: SF_RESOLVER,
//             tokens: ['WBTC', 'DAI', 'USDC', 'ETH'],
//             version: 'v1',
//         });
//
//         await sf.initialize();
//         ethx = sf.tokens.ETHx;
//         wbtcx = sf.tokens.WBTCx;
//         daix = sf.tokens.DAIx;
//         usdcx = sf.tokens.USDCx;
//
//         // ==============
//         // Init SF users
//
//         for (let i = 0; i < names.length; i += 1) {
//             u[names[i].toLowerCase()] = sf.user({
//                 address: accounts[i]._address || accounts[i].address,
//                 token: usdcx.address,
//             });
//             u[names[i].toLowerCase()].alias = names[i];
//             aliases[u[names[i].toLowerCase()].address] = names[i];
//         }
//
//         // ==============
//         // NOTE: Assume the oracle is up to date
//         // Deploy Tellor Oracle contracts
//
//         tp = await ethers.getContractAt(TellorPlayground.abi, TELLOR_ORACLE_ADDRESS, owner);
//
//         // ==============
//         // Setup tokens
//
//         ric = await ethers.getContractAt('ERC20', RIC_TOKEN_ADDRESS, owner);
//         weth = await ethers.getContractAt('ERC20', await ethx.getUnderlyingToken());
//         wbtc = await ethers.getContractAt('ERC20', await wbtcx.getUnderlyingToken());
//         usdc = await ethers.getContractAt('ERC20', await usdcx.getUnderlyingToken());
//     });
//
//     // Use this function in a similar way to `beforeEach` function but with waffle fixture
//     async function deployContracts() {
//         // ==============
//         // Deploy REXMarket contract
//
//         // Include this in REXMarket deployment constructor code
//         const registrationKey = await createSFRegistrationKey(sf, u.admin.address);
//
//         REXMarketFactory = await ethers.getContractFactory('REXMarket', owner);
//         app = await REXMarketFactory.deploy(
//             owner.address,
//             sf.host.address,
//             sf.agreements.cfa.address,
//             sf.agreements.ida.address
//         );
//
//         u.app = sf.user({
//             address: app.address,
//             token: wbtcx.address,
//         });
//
//         u.app.alias = 'App';
//
//         // ==============
//         // Get actual price
//         const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=wrapped-bitcoin&vs_currencies=usd');
//         oraclePrice = parseInt(response.data['wrapped-bitcoin'].usd * 1.02 * 1000000).toString();
//         console.log('oraclePrice', oraclePrice);
//         await tp.submitValue(60, oraclePrice);
//     }
//
//     // async function deployContracts() {
//     //     // ==============
//     //     // Deploy Stream Exchange
//
//     //     const StreamExchangeHelper = await ethers.getContractFactory('StreamExchangeHelper');
//     //     const sed = await StreamExchangeHelper.deploy();
//
//     //     const StreamExchange = await ethers.getContractFactory('StreamExchange', {
//     //         libraries: {
//     //             StreamExchangeHelper: sed.address,
//     //         },
//     //         signer: owner,
//     //     });
//
//     //     const registrationKey = await createSFRegistrationKey(sf, u.admin.address);
//
//     //     // NOTE: To attach to existing SE
//     //     // let se = await StreamExchange.attach(STREAM_EXCHANGE_ADDRESS);
//
//     //     // console.log('Deploy params:');
//     //     // console.log('SF HOST', sf.host.address);
//     //     // console.log('SF CFA', sf.agreements.cfa.address);
//     //     // console.log('SF IDA', sf.agreements.ida.address);
//     //     // console.log('USDCx', usdcx.address);
//     //     // console.log('WBTCx', wbtcx.address);
//     //     // console.log('SF Registration Key', registrationKey);
//
//     //     console.log('Deploying StreamExchange...');
//     //     app = await StreamExchange.deploy(sf.host.address,
//     //         sf.agreements.cfa.address,
//     //         sf.agreements.ida.address,
//     //         usdcx.address,
//     //         wbtcx.address,
//     //         RIC_TOKEN_ADDRESS,
//     //         SUSHISWAP_ROUTER_ADDRESS, // sr.address,
//     //         TELLOR_ORACLE_ADDRESS,
//     //         TELLOR_REQUEST_ID,
//     //         registrationKey);
//
//     //     console.log('Deployed');
//     //     // console.log(await ric.balanceOf(u.admin.address));
//     //     // await ric.transfer(app.address, "1000000000000000000000000")
//
//     //     u.app = sf.user({
//     //         address: app.address,
//     //         token: wbtcx.address,
//     //     });
//
//     //     u.app.alias = 'App';
//
//     //     // ==============
//     //     // Get actual price
//     //     const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=wrapped-bitcoin&vs_currencies=usd');
//     //     oraclePrice = parseInt(response.data['wrapped-bitcoin'].usd * 1.02 * 1000000).toString();
//     //     console.log('oraclePrice', oraclePrice);
//     //     await tp.submitValue(60, oraclePrice);
//     // }
//
//     async function checkBalance(user) {
//         console.log('Balance of ', user.alias);
//         console.log('usdcx: ', (await usdcx.balanceOf(user.address)).toString());
//         console.log('wbtcx: ', (await wbtcx.balanceOf(user.address)).toString());
//     }
//
//     async function checkBalances(accounts) {
//         for (let i = 0; i < accounts.length; ++i) {
//             await checkBalance(accounts[i]);
//         }
//     }
//
//     async function upgrade(accounts) {
//         for (let i = 0; i < accounts.length; ++i) {
//             await web3tx(
//                 usdcx.upgrade,
//                 `${accounts[i].alias} upgrades many USDCx`,
//             )(parseUnits("100000000", 18), {
//                 from: accounts[i].address,
//             });
//             await web3tx(
//                 daix.upgrade,
//                 `${accounts[i].alias} upgrades many DAIx`,
//             )(parseUnits("100000000", 18), {
//                 from: accounts[i].address,
//             });
//
//             await checkBalance(accounts[i]);
//         }
//     }
//
//     async function logUsers() {
//         let string = 'user\t\ttokens\t\tnetflow\n';
//         let p = 0;
//         for (const [, user] of Object.entries(u)) {
//             if (await hasFlows(user)) {
//                 p++;
//                 string += `${user.alias}\t\t${wad4human(
//                     await usdcx.balanceOf(user.address),
//                 )}\t\t${wad4human((await user.details()).cfa.netFlow)}
//                 `;
//             }
//         }
//         if (p == 0) return console.warn('no users with flows');
//         console.log('User logs:');
//         console.log(string);
//     }
//
//     async function hasFlows(user) {
//         const {
//             inFlows,
//             outFlows,
//         } = (await user.details()).cfa.flows;
//         return inFlows.length + outFlows.length > 0;
//     }
//
//     async function appStatus() {
//         const isApp = await sf.host.isApp(u.app.address);
//         const isJailed = await sf.host.isAppJailed(app.address);
//         !isApp && console.error('App is not an App');
//         isJailed && console.error('app is Jailed');
//         await checkBalance(u.app);
//         await checkOwner();
//     }
//
//     async function checkOwner() {
//         const owner = await u.admin.address;
//         console.log('Contract Owner: ', aliases[owner], ' = ', owner);
//         return owner.toString();
//     }
//
//     async function subscribe(user) {
//         // Alice approves a subscription to the app
//         console.log(sf.host.callAgreement);
//         console.log(sf.agreements.ida.address);
//         console.log(usdcx.address);
//         console.log(app.address);
//         await web3tx(
//             sf.host.callAgreement,
//             'user approves subscription to the app',
//         )(
//             sf.agreements.ida.address,
//             sf.agreements.ida.contract.methods
//                 .approveSubscription(ethx.address, app.address, 0, '0x')
//                 .encodeABI(),
//             '0x', // user data
//             {
//                 from: user,
//             },
//         );
//     }
//
//     async function delta(account, balances) {
//         const len = balances.wbtcx.length;
//         const changeInOutToken = balances.wbtcx[len - 1] - balances.wbtcx[len - 2];
//         const changeInInToken = balances.usdcx[len - 1] - balances.usdcx[len - 2];
//         console.log();
//         console.log('Change in balances for ', account);
//         console.log('Usdcx:', changeInInToken, 'Bal:', balances.usdcx[len - 1]);
//         console.log('Wbtcx:', changeInOutToken, 'Bal:', balances.wbtcx[len - 1]);
//         console.log('Exchange Rate:', changeInOutToken / changeInInToken);
//     }
//
//     async function takeMeasurements() {
//         appBalances.ethx.push((await ethx.balanceOf(app.address)).toString());
//         ownerBalances.ethx.push((await ethx.balanceOf(u.admin.address)).toString());
//         aliceBalances.ethx.push((await ethx.balanceOf(u.alice.address)).toString());
//         bobBalances.ethx.push((await ethx.balanceOf(u.bob.address)).toString());
//
//         appBalances.wbtcx.push((await wbtcx.balanceOf(app.address)).toString());
//         ownerBalances.wbtcx.push((await wbtcx.balanceOf(u.admin.address)).toString());
//         aliceBalances.wbtcx.push((await wbtcx.balanceOf(u.alice.address)).toString());
//         bobBalances.wbtcx.push((await wbtcx.balanceOf(u.bob.address)).toString());
//
//         appBalances.usdcx.push((await usdcx.balanceOf(app.address)).toString());
//         ownerBalances.usdcx.push((await usdcx.balanceOf(u.admin.address)).toString());
//         aliceBalances.usdcx.push((await usdcx.balanceOf(u.alice.address)).toString());
//         bobBalances.usdcx.push((await usdcx.balanceOf(u.bob.address)).toString());
//
//         appBalances.ric.push((await ric.balanceOf(app.address)).toString());
//         ownerBalances.ric.push((await ric.balanceOf(u.admin.address)).toString());
//         aliceBalances.ric.push((await ric.balanceOf(u.alice.address)).toString());
//         bobBalances.ric.push((await ric.balanceOf(u.bob.address)).toString());
//     }
//     it("make sure uninvested sum is streamed back to the streamer / investor / swapper", async () => {
//         // Always add the following line of code in all test cases (waffle fixture)
//         await loadFixture(deployContracts);
//
//         // start flow of 1000 USDC from admin address
//         console.log("balance start", (await usdcx.balanceOf(u.admin.address)).toString());
//
//         inflowRate = '2592000000'; // 1000 usdc per month, 1000*24*30*60*60
//         await u.admin.flow({ flowRate: inflowRate, recipient: u.app });
//
//         await increaseTime(getSeconds(30));
//         console.log("balance after 30 days", (await usdcx.balanceOf(u.admin.address)).toString());
//
//         await u.admin.flow({flowRate: "0", recipient: u.app});
//         console.log("balance afterwards days", (await usdcx.balanceOf(u.admin.address)).toString());
//
//     });
// });
