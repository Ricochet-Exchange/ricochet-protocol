import { network } from "hardhat";

// hardhat function to deal with time
const increaseTime = async (seconds: any) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
};

export { increaseTime };
