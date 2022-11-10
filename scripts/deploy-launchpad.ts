import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

async function main() {

  const [deployer] = await ethers.getSigners();

  // Polygon Mumbai
  const HOST_ADDRESS = "0xEB796bdb90fFA0f28255275e16936D25d3418603";
  const CFA_ADDRESS = "0x49e565Ed1bdc17F3d220f72DF0857C26FA83F873";
  const IDA_ADDRESS = "0x804348D4960a61f2d5F9ce9103027A3E849E09b8";
  const RIC_TREASURY_ADDRESS = "0xaf6cA9aD94D23127D75ab5f672592760D8A52b32"; // rexSHIRT DAO on Mumbai
  const OUTPUT_RATE = "1929012345680"; // ~1M RIC/year
  const FEE_RATE = "30000";  // 1
  const REX_REFERRAL_ADDRESS = "0x5C2E1A331678e1A9c6f8c156b5D48A5cC7e50cDa"; // Mumbai polygon

  // Fake fUSDCx on Mumbai
  const INPUT_TOKEN_ADDRESS = "0x42bb40bF79730451B11f6De1CbA222F17b87Afd7";
  // Launching Token (i.e. RIC, rexSHIRT, rexHAT, etc.)
  const OUTPUT_TOKEN_ADDRESS = "0x759B618fa2C28Ff964978Dc1b3fF4a5C8140E0D8"; //mumbai rexSHIRT

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
  console.log("\tHOST_ADDRESS", HOST_ADDRESS)
  console.log("\tCFA_ADDRESS", CFA_ADDRESS)
  console.log("\tIDA_ADDRESS", IDA_ADDRESS)
  console.log("\tINPUT_TOKEN", INPUT_TOKEN_ADDRESS)
  console.log("\tOUTPUT_TOKEN", OUTPUT_TOKEN_ADDRESS)
  console.log("\tSF_REG_KEY", process.env.SF_REG_KEY)



  const ricochetLaunchpad = await RicochetLaunchpad.deploy( HOST_ADDRESS,
                                                      CFA_ADDRESS,
                                                      IDA_ADDRESS,
                                                      '0x',
                                                      REX_REFERRAL_ADDRESS);
  console.log("Deployed app, initializing...")
  console.log(INPUT_TOKEN_ADDRESS,
             OUTPUT_TOKEN_ADDRESS,
             deployer.address,
             RIC_TREASURY_ADDRESS,
             OUTPUT_RATE,
             FEE_RATE)
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
