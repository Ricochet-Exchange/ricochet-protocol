import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

async function main() {

  const [deployer] = await ethers.getSigners();

  // Polygon Mumbai
  const HOST_ADDRESS = Constants.HOST_SUPERFLUID_ADDRESS;
  const CFA_ADDRESS = Constants.CFA_SUPERFLUID_ADDRESS;
  const IDA_ADDRESS = Constants.IDA_SUPERFLUID_ADDRESS;
  const RIC_TREASURY_ADDRESS = Constants.RIC_TREASURY_ADDRESS;
  const OUTPUT_RATE = "1929012345680";
  const FEE_RATE = "20000";
  const REX_REFERRAL_ADDRESS = Constants.REX_REFERRAL_ADDRESS;

  // Fake fUSDCx on Mumbai
  const INPUT_TOKEN_ADDRESS = "0x42bb40bF79730451B11f6De1CbA222F17b87Afd7";
  // Launching Token (i.e. RIC, rexSHIRT, rexHAT, etc.)
  const OUTPUT_TOKEN_ADDRESS = Constants.REX_SHIRT_ADDRESS;

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
