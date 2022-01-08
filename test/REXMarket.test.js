const { ethers, waffle } = require("hardhat");
const { loadFixture } = waffle;
const { parseUnits } = require("@ethersproject/units");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");
const TellorPlayground = require('usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json');
const axios = require('axios').default;
const { web3tx } = require("@decentral.ee/web3-helpers");
const {
    getSeconds,
    increaseTime,
    impersonateAccounts
} = require("../misc/helpers");


describe("RexMarket", function() {
    const names = ['Admin', 'Alice', 'Bob', 'Carl', 'Spender'];

    let sf;
    let dai;
    let daix;
    let ethx;
    let wbtc;
    let wbtcx;
    let usd;
    let usdcx;
    let ric;
    let usdc;
    let eth;
    let weth;
    let app;
    let tp; // Tellor playground
    let usingTellor;
    let sr; // Mock Sushi Router
    let owner;
    let alice;
    let bob;
    let carl;
    let spender;
    const u = {}; // object with all users
    const aliases = {};
    const ricAddress = '0x263026e7e53dbfdce5ae55ade22493f828922965';
    const SF_RESOLVER = '0xE0cc76334405EE8b39213E620587d815967af39C';
    const RIC_TOKEN_ADDRESS = '0x263026E7e53DBFDce5ae55Ade22493f828922965';
    const SUSHISWAP_ROUTER_ADDRESS = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';
    const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
    const TELLOR_REQUEST_ID = 60;

    // random address from polygonscan that have a lot of usdcx
    const USDCX_SOURCE_ADDRESS = '0xA08f80dc1759b12fdC40A4dc64562b322C418E1f';
    const WBTC_SOURCE_ADDRESS = '0x5c2ed810328349100A66B82b78a1791B101C9D61';
    const USDC_SOURCE_ADDRESS = '0x1a13f4ca1d028320a707d99520abfefca3998b7f';

    const CARL_ADDRESS = '0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf';
    const BOB_ADDRESS = '0x00Ce20EC71942B41F50fF566287B811bbef46DC8';
    const ALICE_ADDRESS = '0x9f348cdD00dcD61EE7917695D2157ef6af2d7b9B';
    const OWNER_ADDRESS = '0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA';
    let oraclePrice;

    before(async () => {
        // ==============
        // impersonate accounts, set balances and get signers

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
        // Init SF users

        for (let i = 0; i < names.length; i += 1) {
            u[names[i].toLowerCase()] = sf.user({
                address: accounts[i]._address || accounts[i].address,
                token: usdcx.address,
            });
            u[names[i].toLowerCase()].alias = names[i];
            aliases[u[names[i].toLowerCase()].address] = names[i];
        }

        // ==============
        // NOTE: Assume the oracle is up to date
        // Deploy Tellor Oracle contracts

        tp = await ethers.getContractAt(TellorPlayground.abi, TELLOR_ORACLE_ADDRESS, owner);

        // ==============
        // Setup tokens

        ric = await ethers.getContractAt('ERC20', RIC_TOKEN_ADDRESS, owner);
        weth = await ethers.getContractAt('ERC20', await ethx.getUnderlyingToken());
        wbtc = await ethers.getContractAt('ERC20', await wbtcx.getUnderlyingToken());
        usdc = await ethers.getContractAt('ERC20', await usdcx.getUnderlyingToken());
    });

    // Use this function in a similar way to `beforeEach` function but with waffle fixture
    async function deployContracts() {
        // ==============
        // Deploy REXMarket contract
        
        // Include this in REXMarket deployment constructor code
        const registrationKey = await createSFRegistrationKey(sf, u.admin.address);

        REXMarketFactory = await ethers.getContractFactory('REXMarket', owner);
        app = await REXMarketFactory.deploy(
            owner.address,
            sf.host.address,
            sf.agreements.cfa.address,
            sf.agreements.ida.address
        );

        u.app = sf.user({
            address: app.address,
            token: wbtcx.address,
        });

        u.app.alias = 'App';

        // ==============
        // Get actual price
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=wrapped-bitcoin&vs_currencies=usd');
        oraclePrice = parseInt(response.data['wrapped-bitcoin'].usd * 1.02 * 1000000).toString();
        console.log('oraclePrice', oraclePrice);
        await tp.submitValue(60, oraclePrice);
    }

    it("make sure uninvested sum is streamed back to the streamer / investor / swapper", async () => {
        // Always add the following line of code in all test cases (waffle fixture)
        await loadFixture(deployContracts);

        // start flow of 1000 USDC from admin address
        console.log("balance start", await usdcx.balanceOf(admin.address));

        await web3tx(
            sf.host.batchCall,
            "Admin starting a flow"
        )(createBatchCall("1000", "100", usdcx.address), { from: admin.address });


        await increaseTime(getSeconds(30));
        console.log("balance after 30 seconds", await usdcx.balanceOf(admin.address));

        await sf.cfa.deleteFlow({
            superToken: USDCx.address,
            sender: admin.address,
            receiver: app.address,
            by: admin.address
        });
        console.log("balance afterwards seconds", await usdcx.balanceOf(admin.address));
    });
});