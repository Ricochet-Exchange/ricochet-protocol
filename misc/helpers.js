const { network, ethers } = require("hardhat");
const { hexValue } = require("@ethersproject/bytes");
const { parseEther } = require("@ethersproject/units");


const getBigNumber = (number) => ethers.BigNumber.from(number);

const getTimeStamp = (date) => Math.floor(date / 1000);

const getTimeStampNow = () => Math.floor(Date.now() / 1000);

const getDate = (timestamp) => new Date(timestamp * 1000).toDateString();

const getSeconds = (days) => 3600 * 24 * days; // Changes days to seconds

const impersonateAccounts = async (accounts) => {
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

const currentBlockTimestamp = async () => {
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    return (await ethers.provider.getBlock(currentBlockNumber)).timestamp;
};

const increaseTime = async (seconds) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
};

const setNextBlockTimestamp = async (timestamp) => {
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp])
    await network.provider.send("evm_mine")
};

// Function for converting amount from larger unit (like eth) to smaller unit (like wei)
function convertTo(amount, decimals) {
    return new BigNumber(amount)
        .times('1e' + decimals)
        .integerValue()
        .toString(10);
}

// Function for converting amount from smaller unit (like wei) to larger unit (like ether)
function convertFrom(amount, decimals) {
    return new BigNumber(amount)
        .div('1e' + decimals)
        .toString(10);
}

module.exports = {
    getBigNumber,
    getTimeStamp,
    getTimeStampNow,
    getDate,
    getSeconds,
    increaseTime,
    currentBlockTimestamp,
    setNextBlockTimestamp,
    convertTo,
    convertFrom,
    impersonateAccounts
}