import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"
const CONSTANTS = Constants['polygon'];

async function main() {

  const [deployer] = await ethers.getSigners();

  // Polygon Mainnet


  const CFA_ADDRESS = CONSTANTS.CFA_SUPERFLUID_ADDRESS;
  const IDA_ADDRESS = CONSTANTS.IDA_SUPERFLUID_ADDRESS;
  const RIC_TREASURY_ADDRESS = "0x9C6B5FdC145912dfe6eE13A667aF3C5Eb07CbB89";
  const OUTPUT_RATE = "32000000000000000"; // ~1M RIC/year
  const FEE_RATE = "100000";  // 1
  const INPUT_TOKEN_ADDRESS = "0xCAa7349CEA390F89641fe306D93591f87595dc1F";
  const OUTPUT_TOKEN_ADDRESS = CONSTANTS.RIC_TOKEN_ADDRESS; //RIC

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  console.log("Deploying RicochetLaunchpadHelper")
  const RicochetLaunchpadHelper = await ethers.getContractFactory("RicochetLaunchpadHelper");
  let ricochetLaunchpadHelpder = await RicochetLaunchpadHelper.deploy();
  console.log("Deployed RicochetLaunchpadHelper ")

  const RicochetLaunchpad = await ethers.getContractFactory("RicochetLaunchpad", {
    libraries: {
      RicochetLaunchpadHelper: ricochetLaunchpadHelpder.address,
    },
  });

  console.log("Deploying RicochetLaunchpad with params")
  console.log("\tHOST_ADDRESS", CONSTANTS.HOST_SUPERFLUID_ADDRESS);
  console.log("\tCFA_ADDRESS", CONSTANTS.CFA_SUPERFLUID_ADDRESS);
  console.log("\tIDA_ADDRESS", CONSTANTS.IDA_SUPERFLUID_ADDRESS);
  console.log("\tINPUT_TOKEN", CONSTANTS.USDCX_ADDRESS);
  console.log("\tOUTPUT_TOKEN", CONSTANTS.ETHX_ADDRESS);
  console.log("\tSF_REG_KEY", CONSTANTS.SF_REG_KEY);

  const ricochetLaunchpad = await RicochetLaunchpad.deploy(CONSTANTS.HOST_SUPERFLUID_ADDRESS,
    CFA_ADDRESS,
    IDA_ADDRESS,
    process.env.SF_REG_KEY);

  console.log("Deployed app, initializing...")
  await ricochetLaunchpad.initialize(INPUT_TOKEN_ADDRESS,
    OUTPUT_TOKEN_ADDRESS,
    deployer.address,
    RIC_TREASURY_ADDRESS,
    OUTPUT_RATE,
    FEE_RATE);
  await ricochetLaunchpad.deployed();
  console.log("Deployed RicochetLaunchpadHelper at address:", ricochetLaunchpadHelpder.address);
  console.log("Deployed RicochetLaunchpad at address:", ricochetLaunchpad.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
