import { BigNumberish } from "ethers";
import { waffle, network, ethers } from "hardhat";
// import { network } from "hardhat";

import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { REXUniswapV3Market, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from "../typechain";
import { setup, IUser, ISuperToken } from "../misc/setup";


export const getBigNumber = (num: any) => ethers.BigNumber.from(num);

export const getTimeStamp = (date: number) => Math.floor(date / 1000);

export const getTimeStampNow = () => Math.floor(Date.now() / 1000);

export const getDate = (timestamp: number) => new Date(timestamp * 1000).toDateString();

export const getSeconds = (days: number) => 3600 * 24 * days; // Changes days to seconds

export const impersonateAccount = async (account: string | any) => {
    // export const impersonateAccount = async (account: string) => {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: account
    });
}

export const setBalance = async (account: string, balance: number) => {
    const hexBalance = numberToHex(toWad(balance));
    await network.provider.request({
        method: "hardhat_setBalance",
        params: [account, hexBalance],
    });
}

export const impersonateAndSetBalance = async (account: string) => {
    await impersonateAccount(account);
    await setBalance(account, 10000);
}

// signers[i] = await ethers.getSigner(accounts[i]);
// }

export const currentBlockTimestamp = async () => {
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    return (await ethers.provider.getBlock(currentBlockNumber)).timestamp;
};

export const increaseTime = async (seconds: any) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
};

export const setNextBlockTimestamp = async (timestamp: any) => {
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp])
    await network.provider.send("evm_mine")
};

// Function for converting amount from larger unit (like eth) to smaller unit (like wei)
export function convertTo(amount: BigNumberish, decimals: number): string {
    return ethers.utils.formatUnits(amount, decimals);  // JR
}
// Function for converting amoun
export function convertFrom(amount: BigNumberish, decimals: number): string {
    return ethers.utils.formatUnits(amount, decimals);  // JR
}

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
        

export const takeMeasurements = async (balances: SuperTokensBalances, signer: SignerWithAddress): Promise<void> => {

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


export const resetMeasurements = async (): Promise<void> => {
    appBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    ownerBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    aliceBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    bobBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    carlBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
    karenBalances = { ethx: [], usdcx: [], ric: [], maticx: [], rexshirt: [] };
}


export const approveSubscriptions = async (tokensAndIDAIndexes: superTokenIDAIndex[], signers: SignerWithAddress[]) => {
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

export const checkBalance = async (user: SignerWithAddress, name: string) => {
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

export const delta = async (account: SignerWithAddress, balances: any) => {
    const len = balances.ethx.length;
    return {
        ethx: balances.ethx[len - 1] - balances.ethx[len - 2],
        usdcx: balances.usdcx[len - 1] - balances.usdcx[len - 2],
        ric: balances.ric[len - 1] - balances.ric[len - 2],
        maticx: balances.maticx[len - 1] - balances.maticx[len - 2],
        rexshirt: balances.rexshirt[len - 1] - balances.rexshirt[len - 2]
    }
}