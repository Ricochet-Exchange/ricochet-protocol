import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import axios from "axios";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Constants } from "../misc/Constants";


const { provider, loadFixture } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours
// Index 1 is for Ether and 0 for USDCx
const USDCX_SUBSCRIPTION_INDEX = 0;
const ETHX_SUBSCRIPTION_INDEX = 1;
const RIC_SUBSCRIPTION_INDEX = 2;
const COINGECKO_KEY = 'matic-network';

export interface superTokenAndItsIDAIndex {
    token: SuperToken;
    IDAIndex: number;
}

describe('REXSuperSwap', () => {
 
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    const subsidyRate = "10000000000000";

    let rexSuperSwap: any;
    let superSwap: any;
    let snapshot: any;

    let adminSigner: SignerWithAddress;
    let aliceSigner: SignerWithAddress;
    let bobSigner: SignerWithAddress;
    let carlSigner: SignerWithAddress;
    let usdcxWhaleSigner: SignerWithAddress;
    let ethxWhaleSigner: SignerWithAddress;
    let maticxWhaleSigner: SignerWithAddress;

    let sf: Framework,
        superT: ISuperToken,
        u: { [key: string]: IUser },
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
    let ricochetDAIX: SuperToken;

    let usdcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ethxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ricAndItsIDAIndex: superTokenAndItsIDAIndex;
    let wbtcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let maticxAndItsIDAIndex: superTokenAndItsIDAIndex;

    let appBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let ownerBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let aliceBalances = { ethx: [], usdcx: [], ric: [], maticx: [], daix: [], wbtcx: [] };
    let bobBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let carlBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };
    let karenBalances = { ethx: [], usdcx: [], ric: [], maticx: [] };

    async function takeMeasurements(balances: SuperTokensBalances, signer: SignerWithAddress): Promise<void> {
        appBalances.ethx.push((await superT.ethx.balanceOf({ account: superSwap.address, providerOrSigner: provider })).toString());
        ownerBalances.ethx.push((await superT.ethx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ethx.push((await superT.ethx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ethx.push((await superT.ethx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.ethx.push((await superT.ethx.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ethx.push((await superT.ethx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.usdcx.push((await superT.usdcx.balanceOf({ account: superSwap.address, providerOrSigner: provider })).toString());
        ownerBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.usdcx.push((await superT.usdcx.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.usdcx.push((await superT.usdcx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.ric.push((await superT.ric.balanceOf({ account: superSwap.address, providerOrSigner: provider })).toString());
        ownerBalances.ric.push((await superT.ric.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.ric.push((await superT.ric.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.ric.push((await superT.ric.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.ric.push((await superT.ric.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.ric.push((await superT.ric.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        appBalances.maticx.push((await superT.maticx.balanceOf({ account: superSwap.address, providerOrSigner: provider })).toString());
        ownerBalances.maticx.push((await superT.maticx.balanceOf({ account: u.admin.address, providerOrSigner: provider })).toString());
        aliceBalances.maticx.push((await superT.maticx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        carlBalances.maticx.push((await superT.maticx.balanceOf({ account: u.carl.address, providerOrSigner: provider })).toString());
        // karenBalances.ric.push((await superT.ric.balanceOf({account: u.karen.address, providerOrSigner: provider})).toString());
        bobBalances.maticx.push((await superT.maticx.balanceOf({ account: u.bob.address, providerOrSigner: provider })).toString());

        aliceBalances.daix.push((await superT.daix.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
        aliceBalances.wbtcx.push((await superT.wbtcx.balanceOf({ account: u.alice.address, providerOrSigner: provider })).toString());
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
    // karenSigner = accountss[4];
    usdcxWhaleSigner = accountss[5];
    ethxWhaleSigner = accountss[6];
    maticxWhaleSigner = accountss[7];

    ricochetMATICx = superT.maticx;
    ricochetUSDCx = superT.usdcx;
    ricochetETHx = superT.ethx;
    ricochetWBTCx = superT.wbtcx;
    ricochetRIC = superT.ric;
    ricochetDAIX = superT.daix;

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

    // Deploy REXSuperSwap
    console.log("Deploying REXSuperSwap...");
    rexSuperSwap = await ethers.getContractFactory("RexSuperSwap", {
        signer: adminSigner,
    });
    
    const swapRouterAddress = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
    const maticAddress = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3";

    superSwap = await rexSuperSwap.deploy(swapRouterAddress, maticAddress);
    await superSwap.deployed();
    console.log("=========== Deployed REXSuperSwap ============");
    console.log("RexSuperSwap deployed to:", superSwap.address);

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
            receiver: aliceSigner.address,
            amount: ethers.utils.parseUnits("0.046", 18).toString(),
        }).exec(ethxWhaleSigner);
        console.log("ETH")
    await ricochetRIC
        .transfer({
            receiver: aliceSigner.address,
            amount: '1000000000000000000000',
        }).exec(adminSigner);
        console.log("RIC")
    await ricochetMATICx
        .transfer({
            receiver: aliceSigner.address,
            amount: '1754897259852523432',
        }).exec(maticxWhaleSigner);
        console.log("MATIC")
    console.log("====== Transferred to bob =======");
    await ricochetUSDCx
        .transfer({
            receiver: aliceSigner.address,
            amount: initialAmount,
        }).exec(usdcxWhaleSigner);
    console.log("====== Transferred to karen =======");

    // Take a snapshot to avoid redoing the setup
    snapshot = await provider.send('evm_snapshot', []);

});


  context("#1 Test swap functionality", async () => {

    it("#1.1 User can swap token maticx -> usdcx", async () => {
        const from =  ricochetMATICx.address
        const to = ricochetUSDCx.address
        const amountIn = ethers.utils.parseUnits("35", 18)
        
        // we should use coingecko to check the minimum amount
        // const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids='+COINGECKO_KEY+'&vs_currencies=usd');
        // const exchangeRate = response.data[COINGECKO_KEY].usd;
      
        const amountToSwap = 35 * 0.79;
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)

        const maticxAddress = superT.maticx.underlyingToken.address;
        const usdcx = superT.usdcx.underlyingToken.address
        const path = [maticxAddress, usdcx]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        // approve token to be transferred to superSwap
        await ricochetMATICx
        .approve({
            receiver: superSwap.address,
            amount: '35000000000000000000'
        }).exec(aliceSigner);

        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          amountOutMin,
          path,
          poolFees,
          true,
          true 
        )

        const receipt = await swapTx.wait()
        let swapComplete;

        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete  = event.args;
            }
        }
   
        console.log("swap function returns amount swapped as - ", swapComplete);
        
        const amountSwapped = swapComplete[0] / 1e6;
        expect(amountSwapped).to.be.greaterThan(amountOutMin);

        await takeMeasurements();
        console.log("aliceBalances after swap2 - ", aliceBalances);
        
    });

    it("#1.2 User can swap token ethx -> usdcx", async () => {
        const from =  ricochetETHx.address
        const to = ricochetUSDCx.address
        const amountIn = ethers.utils.parseUnits("0.04", 18)
        
        // we should use coingecko to check the minimum amount
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids='+'ethereum'+'&vs_currencies=usd');
        const exchangeRate = response.data['ethereum'].usd;
      
        const amountToSwap = 0.04 * exchangeRate;
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)

        const ethxAddress = superT.ethx.underlyingToken.address;
        const usdcx = superT.usdcx.underlyingToken.address
        const path = [ethxAddress, usdcx]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        // approve token to be transferred to superSwap
        await ricochetETHx
        .approve({
            receiver: superSwap.address,
            amount: '40000000000000000'
        }).exec(aliceSigner);


        await takeMeasurements();
        console.log("aliceBalances before swap ethx - usdcx - ", aliceBalances);
        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          amountOutMin,
          path,
          poolFees,
          true,
          true 
        )

        const receipt = await swapTx.wait()
        let swapComplete;

        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete  = event.args;
            }
        }
        
        console.log("swap function returns amount swapped as - ", swapComplete);
        
        const amountSwapped = swapComplete[0] / 1e6;
        expect(amountSwapped).to.be.greaterThan(amountOutMin);

        await takeMeasurements();
        console.log("aliceBalances after swap ethx - usdcx- ", aliceBalances);
        
    });

    it("#1.3 User can swap native token RIC -> daix", async () => {
        const from = ricochetRIC.address
        const to  =  ricochetDAIX.address
        const amountIn = ethers.utils.parseUnits("170", 18)
              
        // hardcoding for now
        const amountToSwap = 170 * 0.0000053; // how to get current exchange rate?
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)

        const ricAddress =   superT.ric.address
        const daix = superT.daix.underlyingToken.address
        const path = [ricAddress, daix]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        // approve token to be transferred to superSwap
        await ricochetRIC
        .approve({
            receiver: superSwap.address,
            amount: '170000000000000000000'
        }).exec(aliceSigner);

        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          0,
          path,
          poolFees,
          false,
          true
        )

        const receipt = await swapTx.wait()
        let swapComplete;

        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete = event.args;
            } 
        }
    
        console.log("swap function returns amount swapped as - ", swapComplete);
        
        const amountSwapped = swapComplete[0] / 1e18;
        expect(amountSwapped).to.be.greaterThan(amountOutMin);

        await takeMeasurements();
        console.log("aliceBalances after swap2 ric - daix - ", aliceBalances);
        
    });

    it("#1.4 User can swap token MATICX -> WBTCX checking decimal issue", async () => {
        const from =  ricochetMATICx.address
        const to  =  ricochetWBTCx.address
        const amountIn = ethers.utils.parseUnits("35", 18)
          
        // hardcoding for now
        const amountToSwap = 35 * 0.0000382;
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)
  
        const maticxAddress = superT.maticx.underlyingToken.address;
        const wbtcx = superT.wbtcx.underlyingToken.address;

        const path = [maticxAddress, wbtcx]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        // approve token to be transferred to superSwap
        await ricochetMATICx
        .approve({
            receiver: superSwap.address,
            amount: '35000000000000000000'
        }).exec(aliceSigner);

        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          amountOutMin,
          path,
          poolFees,
          true,
          true
        )

        const receipt = await swapTx.wait()
        let swapComplete;
    
        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete = event.args;
            } 
        }

        
        console.log("swap function returns amount swapped as - ", swapComplete);
        
        const amountSwapped = swapComplete[0] / 1e8;
        console.log("amount btcx after maticx - btcx swap - ", amountSwapped);
        expect(amountSwapped).to.be.greaterThan(amountOutMin);

        await takeMeasurements();
        console.log("aliceBalances after swap2 maticx - btcx - ", aliceBalances);
        
    });

    it("#1.5 User can swap native token RIC -> maticx", async () => {
        const from = ricochetRIC.address
        const to  =  ricochetMATICx.address
        const amountIn = ethers.utils.parseUnits("170", 18)
        
        // hardcoding for now
        const amountToSwap = 170 * 0.0000053; // how to get current exchange rate?
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)

        const ricAddress =   superT.ric.address
        console.log("ric address check - ", ricAddress)
        const maticxAddress = superT.maticx.underlyingToken.address;
        const path = [ricAddress, maticxAddress]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        await takeMeasurements();
        console.log("aliceBalances before swap2 ric - maticx - ", aliceBalances);

        // approve token to be transferred to superSwap
        await ricochetRIC
        .approve({
            receiver: superSwap.address,
            amount: '170000000000000000000'
        }).exec(aliceSigner);

        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          0,
          path,
          poolFees,
          false,
          true
        )

        const receipt = await swapTx.wait()
        let swapComplete;

        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete = event.args;
            } 
        }
   
        console.log("swap function returns amount swapped as - ", swapComplete);
        
        const amountSwapped = swapComplete[0] / 1e18;
        expect(amountSwapped).to.be.greaterThan(amountOutMin);

        await takeMeasurements();
        console.log("aliceBalances after swap2 ric - maticx - ", aliceBalances);
        
    });

    it("#1.6 User can swap large amount of token USDCX -> WBTCX", async () => {
        const from = ricochetUSDCx.address
        const to = ricochetWBTCx.address
        const amountIn = ethers.utils.parseUnits("200", 18)
        console.log("Amount in for USDCX - ", amountIn)
        // hardcoding for now
        const amountToSwap = 200 * 0.000050;
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)
  
        const wbtcx = superT.wbtcx.underlyingToken.address;
        const usdcx = superT.usdcx.underlyingToken.address

        const path = [usdcx, wbtcx]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        // approve token to be transferred to superSwap
        await ricochetUSDCx
        .approve({
            receiver: superSwap.address,
            amount: '200000000000000000000'
        }).exec(aliceSigner);

        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          amountOutMin,
          path,
          poolFees,
          true,
          true
        )

        const receipt = await swapTx.wait()
        let swapComplete;

        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete = event.args;
            } 
        }
        
        console.log("swap function returns amount swapped as - ", swapComplete);
        
        const amountSwapped = swapComplete[0] / 1e8;
        expect(amountSwapped).to.be.greaterThan(amountOutMin);

        await takeMeasurements();
        console.log("aliceBalances after swap2 usdcx - wbtcx - ", aliceBalances);
        
    });

    it("#1.7 User can swap small amount of token WBTCX -> USDCX", async () => {
        const from = ricochetWBTCx.address
        const to = ricochetUSDCx.address
        const amountIn = ethers.utils.parseUnits("0.01", 18)
        console.log("Amount in for wbtcx - ", amountIn)
        // hardcoding for now
        const amountToSwap = 0.01 * 19939.61;
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)
  
        const wbtcx = superT.wbtcx.underlyingToken.address;
        const usdcx = superT.usdcx.underlyingToken.address

        const path = [wbtcx, usdcx]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        // approve token to be transferred to superSwap
        await ricochetWBTCx
        .approve({
            receiver: superSwap.address,
            amount: '10000000000000000'
        }).exec(aliceSigner);

        await takeMeasurements();
        console.log("aliceBalances before swap2 wbtcx - usdcx - ", aliceBalances);

        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          amountOutMin,
          path,
          poolFees,
          true,
          true
        )

        const receipt = await swapTx.wait()
        let swapComplete;

        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete = event.args;
            } 
        }
        
        const amountSwapped = swapComplete[0] / 1e6;
        expect(amountSwapped).to.be.greaterThan(amountOutMin);

        await takeMeasurements();
        console.log("aliceBalances after swap2 wbtcx - usdcx - ", aliceBalances);
        
    });

    it("#1.8 User can swap USDCX -> MATICX", async () => {
        const from = ricochetUSDCx.address
        const to  =  ricochetMATICx.address
        const amountIn = ethers.utils.parseUnits("1", 18)
        console.log("Amount in for USDCX - ", amountIn)
        // hardcoding for now
        const amountToSwap = 1 * 1.19;
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)
  
        const usdcx = superT.usdcx.underlyingToken.address
        const maticxAddress = superT.maticx.underlyingToken.address;

        const path = [usdcx, maticxAddress]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        // approve token to be transferred to superSwap
        await ricochetUSDCx
        .approve({
            receiver: superSwap.address,
            amount: '1000000000000000000'
        }).exec(aliceSigner);

        await takeMeasurements();
        console.log("Checking if RIC was refunded when swap fails - ", aliceBalances);

        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          amountOutMin,
          path,
          poolFees,
          true,
          true
        )

        const receipt = await swapTx.wait()
        let swapComplete;

        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete = event.args;
            } 
        }

        console.log("swap function returns amount swapped as - ", swapComplete);
        await takeMeasurements();
        console.log("aliceBalances after swap usdcx - wbtcx - ", aliceBalances);
   
        const amountSwapped = swapComplete[0] / 1e8;
        expect(amountSwapped).to.be.greaterThan(amountOutMin);
  
    });

    it("#1.1 User can swap token maticx -> usdcx (small amount)", async () => {
        const from =  ricochetMATICx.address
        const to = ricochetUSDCx.address
        const amountIn = ethers.utils.parseUnits("1.3", 18)
        
        // we should use coingecko to check the minimum amount
        // const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids='+COINGECKO_KEY+'&vs_currencies=usd');
        // const exchangeRate = response.data[COINGECKO_KEY].usd;
      
        const amountToSwap = 1.3 * 0.79;
        const percentage = amountToSwap / 100 * 3;
        const amount = amountToSwap - percentage;
        const amountOutMin = Math.round(amount)

        const maticxAddress = superT.maticx.underlyingToken.address;
        const usdcx = superT.usdcx.underlyingToken.address
        const path = [maticxAddress, usdcx]
        const poolFees = [500] // There is a uniswap USDC/WETH pool with 0.05% fees

        // approve token to be transferred to superSwap
        await ricochetMATICx
        .approve({
            receiver: superSwap.address,
            amount: '1300000000000000000'
        }).exec(aliceSigner);

        // call swap function
        const swapTx = await superSwap.connect(aliceSigner).swap(
          from,
          to,
          amountIn,
          amountOutMin,
          path,
          poolFees,
          true,
          true 
        )

        const receipt = await swapTx.wait()
        let swapComplete;

        for (const event of receipt.events) {
            if(event.event === "SuperSwapComplete"){
                swapComplete  = event.args;
            }
        }
   
        console.log("swap function returns amount swapped as - ", swapComplete);
        
        const amountSwapped = swapComplete[0] / 1e6;
        expect(amountSwapped).to.be.greaterThan(amountOutMin);

        await takeMeasurements();
        console.log("aliceBalances after swap2 - ", aliceBalances);
        
    });

  });

})