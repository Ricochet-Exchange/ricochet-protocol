// import hre from "hardhat";
// const {
//     web3tx,
//     toWad,
//     wad4human,
//     fromDecimals,
// } = require("@decentral.ee/web3-helpers");

import { parseEther } from "@ethersproject/units";
import { hexValue } from "@ethersproject/bytes";
import { network, ethers, waffle, hardhatArguments } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { names } from "../misc/setup";
import { Framework } from "@superfluid-finance/sdk-core";

import SuperfluidGovernanceBase from "../test/artifacts/superfluid/SuperfluidGovernanceII.json";
import { ISuperToken } from "../typechain";
// import Operation = require("@superfluid-finance/sdk-core/dist/module/Operation");
import { IInstantDistributionAgreementV1 } from "@superfluid-finance/sdk-core/dist/module/typechain";
import { abi as IInstantDistributionAgreementV1ABI } from "@superfluid-finance/sdk-core/dist/module/abi/IInstantDistributionAgreementV1.json";
import { PopulatedTransaction } from "ethers";
import { Constants } from "./Constants";
// import Operation from "@superfluid-finance/sdk-core/dist/module/Operation";
const idaInterface = new ethers.utils.Interface(IInstantDistributionAgreementV1ABI);
const { provider, loadFixture } = waffle;
const PROVIDER = provider;

export const getBigNumber = (number: number) => ethers.BigNumber.from(number);

export const getTimeStamp = (date: number) => Math.floor(date / 1000);

export const getTimeStampNow = () => Math.floor(Date.now() / 1000);

export const getDate = (timestamp: number) => new Date(timestamp * 1000).toDateString();

export const getSeconds = (days: number) => 3600 * 24 * days; // Changes days to seconds

export const impersonateAccounts = async (accounts: any) => {
    let signers = [];

    for (let i = 0; i < accounts.length; ++i) {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [accounts[i]]
        });

        await network.provider.send("hardhat_setBalance", [
            accounts[i],
            hexValue(parseEther("1000")),
        ]);

        signers[i] = await ethers.getSigner(accounts[i]);
    }

    return signers;
}

// export async function impersonateAccounts(accounts: { [key: string]: string }) {  //}: Promise<{ [key: string]: SignerWithAddress }> {

//     let signers: { [key: string]: SignerWithAddress } = {};

//     for (let i = 0; i < names.length; ++i) {
//         await network.provider.request({
//             method: "hardhat_impersonateAccount",
//             params: [accounts[names[i]]]
//         });

//         await network.provider.send("hardhat_setBalance", [
//             accounts[names[i]],
//             hexValue(parseEther("1000")),
//         ]);

//         signers[names[i]] = await ethers.getSigner(accounts[names[i]]);
//         console.log("AAAAAAAA - accounts[names[i]: " + accounts[names[i]] + " BBBB - : getSigner(accounts[names[i]]): " + signers[names[i]]);
//     }

//     return signers;
// }

export async function impersonateAccount(account: { [key: string]: string }): Promise<void> {
    await network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [account],
    });
}

export async function setBalance(account: { [key: string]: string }, balance: number) {
    let signer: SignerWithAddress;
    // const hexBalance = numberToHex(toWad(balance));
    // await hre.network.provider.request({
    //     method: 'hardhat_setBalance',
    //     params: [
    //         account,
    //         hexBalance,
    //     ],
    // });
    await network.provider.send("hardhat_setBalance", [
        account,
        hexValue(parseEther("1000")),
    ]);
    // signer = await ethers.getSigner(account);
}

export const impersonateAndSetBalance = async (account: any) => {
    await impersonateAccount(account);
    await setBalance(account, 10000);
}

export const currentBlockTimestamp = async () => {
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    return (await ethers.provider.getBlock(currentBlockNumber)).timestamp;
};

export const increaseTime = async (seconds: number) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
};

export const setNextBlockTimestamp = async (timestamp: number) => {
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp])
    await network.provider.send("evm_mine")
};

// // Function for converting amount from larger unit (like eth) to smaller unit (like wei)
// export function convertTo(amount: string, decimals: string) {
//     return new BigNumber(amount)
//         .times('1e' + decimals)
//         .integerValue()
//         .toString(10);
// }

// // Function for converting amount from smaller unit (like wei) to larger unit (like ether)
// export function convertFrom(amount: string, decimals: string) {
//     return new BigNumber(amount)
//         .div('1e' + decimals)
//         .toString(10);
// }

/*******************************
Superfluid specific Functions
********************************/
// Initialize superfluid sdk
export async function initSuperfluid(): Promise<Framework> {
    const sf = await Framework.create({
        provider: PROVIDER,
        resolverAddress: Constants.SF_RESOLVER,
        networkName: "hardhat",
        dataMode: "WEB3_ONLY",
        protocolReleaseVersion: "test" // "v1"
    });
    return sf;
}

// export async function approveSubscriptions(
//     // users = [u.alice.address, u.bob.address, u.carl.address, u.karen.address, u.admin.address],
//     framework: Framework, users: SignerWithAddress[], tokens: ISuperToken[]
//     // tokens = [usdcx.address, ethx.address, ric.address, ric.address],
// ) {
//     // Do approvals
//     // Already approved?
//     console.log('Approving subscriptions...');
//     let idaV1: IInstantDistributionAgreementV1;
//     let operation: Operation;
//     let callData: any;
//     let txn: Promise<PopulatedTransaction>;
//     for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
//         for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
//             callData = idaInterface.encodeFunctionData("approveSubscription", [
//                 "0",
//                 tokens[tokenIndex].address,
//                 app.address,
//                 "0x"
//             ]);
//             txn = framework.host.hostContract.populateTransaction.callAgreement(
//                 "", callData, "0x"
//             );
//             operation = new Operation(txn, "SUPERFLUID_CALL_AGREEMENT");
//             try {
//                 await operation.exec(users[userIndex]);
//             } catch (err: any) {
//                 console.log("Ricochet - ERROR executing the transaction");
//             }
//             // await web3tx(
//             //     framework.host.hostContract.callAgreement, // .host.callAgreement,
//             //     `${users[userIndex]} approves subscription to the app ${tokens[tokenIndex]} ${tokenIndex}`,
//             // )(

//             // framework.idaV1.approveSubscription({  // Correct
//             //     indexId: "0",
//             //     superToken: tokens[tokenIndex].address,
//             //     publisher: app.address,
//             //     userData: "0x"
//             // })

//             // agreements.ida.address,
//             // sf.agreements.ida.contract.methods
//             //     .approveSubscription(tokens[tokenIndex], app.address, tokenIndex, '0x')
//             //     .encodeABI(),
//             // '0x', // user data
//             // {
//             //     from: users[userIndex],
//             // },
//             // );
//         }
//     }
//     console.log("Approved.");
// }
