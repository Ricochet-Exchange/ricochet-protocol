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
  const INPUT_TOKEN_ADDRESS = Constants.RIC_TOKEN_ADDRESS;
  // Launching Token (i.e. RIC, rexSHIRT, rexHAT, etc.)
  const OUTPUT_TOKEN_ADDRESS = Constants.REX_SHIRT_ADDRESS;

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  console.log("Deploying RicochetLaunchpadHelper")
  const RicochetLaunchpadHelper = await ethers.getContractFactory("RicochetLaunchpadHelper");
  let ricochetLaunchpadHelpder = await RicochetLaunchpadHelper.deploy();
  console.log("Deployed RicochetLaunchpadHelper ")
  console.log("Deployed RicochetLaunchpadHelper at address:", ricochetLaunchpadHelpder.address);


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
                                                      process.env.SF_REG_KEY,
                                                      REX_REFERRAL_ADDRESS, { gasLimit: 5000000 });
  await ricochetLaunchpad.deployed();
  console.log("Deployed RicochetLaunchpad at address:", ricochetLaunchpad.address);
  console.log("Initializing...")
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
  console.log("Initialized");

  console.log("Registering with RexReferral system...")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(Constants.REX_REFERRAL_ADDRESS);
  await referral.registerApp(ricochetLaunchpad.address);
  console.log("Registered:", ricochetLaunchpad.address);
  console.log("Transferring ownership to the DAO");
  await ricochetLaunchpad.transferOwnership("0x9C6B5FdC145912dfe6eE13A667aF3C5Eb07CbB89"); // 1e15/second
  console.log("Ownership transferred.");

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
