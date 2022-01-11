import { BigNumberish } from "ethers";
import { network, ethers } from "hardhat";

export const getBigNumber = (num: any) => ethers.BigNumber.from(num);

export const getTimeStamp = (date: number) => Math.floor(date / 1000);

export const getTimeStampNow = () => Math.floor(Date.now() / 1000);

export const getDate = (timestamp: number) => new Date(timestamp * 1000).toDateString();

export const getSeconds = (days: number) => 3600 * 24 * days; // Changes days to seconds

export const impersonateAccounts = async (accounts: string | any[]) => {
    let signers = [];

    for (let i = 0; i < accounts.length; ++i) {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [accounts[i]]
        });

        await network.provider.send("hardhat_setBalance", [
            accounts[i],
            ethers.utils.hexValue(1000),
            // hexValue(parseEther("1000")),
        ]);

        signers[i] = await ethers.getSigner(accounts[i]);
    }

    return signers;
}

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

// Function for converting amount from smaller unit (like wei) to larger unit (like ether)
export function convertFrom(amount: BigNumberish, decimals: number): string {
    return ethers.utils.formatUnits(amount, decimals);  // JR
}
