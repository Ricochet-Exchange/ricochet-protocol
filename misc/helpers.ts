import { parseEther } from "@ethersproject/units";
import { hexValue } from "@ethersproject/bytes";
import { network, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { names } from "../misc/setup";

export const getBigNumber = (number: number) => ethers.BigNumber.from(number);

export const getTimeStamp = (date: number) => Math.floor(date / 1000);

export const getTimeStampNow = () => Math.floor(Date.now() / 1000);

export const getDate = (timestamp: number) => new Date(timestamp * 1000).toDateString();

export const getSeconds = (days: number) => 3600 * 24 * days; // Changes days to seconds

// export const impersonateAccounts = async (accounts: AccountsWithUserKey[]) => {
// export const impersonateAccounts = async (accounts: { [key: string]: string }) => {
export async function impersonateAccounts(accounts: { [key: string]: string }): Promise<{ [key: string]: SignerWithAddress }> {

    let signers: { [key: string]: SignerWithAddress };

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

export const impersonateAndSetBalance = async (account: any) => {
    let signer: SignerWithAddress;

    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: account
    });

    await network.provider.send("hardhat_setBalance", [
        account,
        hexValue(parseEther("1000")),
    ]);

    signer = await ethers.getSigner(account);
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
