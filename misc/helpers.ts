// import hre from "hardhat";
const {
    web3tx,
    toWad,
    wad4human,
    fromDecimals,
} = require("@decentral.ee/web3-helpers");

import { parseEther } from "@ethersproject/units";
import { hexValue } from "@ethersproject/bytes";
import { network, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { names } from "../misc/setup";
import { Framework } from "@superfluid-finance/sdk-core";

import SuperfluidGovernanceBase from "../test/artifacts/superfluid/SuperfluidGovernanceII.json";

export const getBigNumber = (number: number) => ethers.BigNumber.from(number);

export const getTimeStamp = (date: number) => Math.floor(date / 1000);

export const getTimeStampNow = () => Math.floor(Date.now() / 1000);

export const getDate = (timestamp: number) => new Date(timestamp * 1000).toDateString();

export const getSeconds = (days: number) => 3600 * 24 * days; // Changes days to seconds

export async function impersonateAccounts(accounts: { [key: string]: string }): Promise<{ [key: string]: SignerWithAddress }> {

    let signers: { [key: string]: SignerWithAddress } = {};

    for (let i = 0; i < names.length; ++i) {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [accounts[names[i]]]
        });

        await network.provider.send("hardhat_setBalance", [
            accounts[names[i]],
            hexValue(parseEther("1000")),
        ]);

        signers[names[i]] = await ethers.getSigner(accounts[names[i]]);
        console.log("AAAAAAAA - accounts[names[i]: " + accounts[names[i]] + " BBBB - : getSigner(accounts[names[i]]): " + signers[names[i]]);
    }

    return signers;
}

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
export async function createSFRegistrationKey(sf: Framework, deployer: SignerWithAddress): Promise<string> {
    const registrationKey = `testKey-${Date.now()}`;
    const appKey = ethers.utils.solidityKeccak256(
        ['string', 'address', 'string'],
        [
            'org.superfluid-finance.superfluid.appWhiteListing.registrationKey',
            deployer,
            registrationKey,
        ],
    );

    const governance = await sf.host.hostContract.getGovernance.call();
    console.log(`SF Governance: ${governance}`);

    const sfGovernanceRO = await ethers
        .getContractAt(SuperfluidGovernanceBase.abi, governance);

    const govOwner = await sfGovernanceRO.owner();
    await impersonateAndSetBalance(govOwner);

    const sfGovernance = await ethers
        .getContractAt(SuperfluidGovernanceBase.abi, governance, await ethers.getSigner(govOwner));

    // await sfGovernance.whiteListNewApp(sf.host.address, appKey);
    await sfGovernance.whiteListNewApp(sf.host.hostContract.address, appKey);

    return registrationKey;
}
