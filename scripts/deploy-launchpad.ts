import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

async function main() {

  // Parameters for the launchpad
  const EMISSION_RATE = "38580246913600000"; // ~100K RIC/year
  const FEE_RATE = "100000";  // 0.1

  // Get the current network from hardhat
  const network = await ethers.provider.getNetwork();
  // Get the right constants for the network
  const config = Constants[network.name];
  console.log("Using this for config:", config);
  
  // Get the deployer for this deployment, first hardhat signer
  const [deployer] = await ethers.getSigners();
  // Log deployer facts information
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
  const ricochetLaunchpad = await RicochetLaunchpad.deploy(config.HOST_SUPERFLUID_ADDRESS,
    config.CFA_SUPERFLUID_ADDRESS,
    config.IDA_SUPERFLUID_ADDRESS,
    config.SF_REG_KEY,
    config.REX_REFERRAL_ADDRESS);
  await ricochetLaunchpad.deployed();


  console.log("Deployed app, initializing...")

  const INPUT_TOKEN_ADDRESS = config.USDCX_ADDRESS;
  const OUTPUT_TOKEN_ADDRESS = config.RIC_ADDRESS;

  await ricochetLaunchpad.initialize(
    INPUT_TOKEN_ADDRESS,
    OUTPUT_TOKEN_ADDRESS,
    deployer.address,
    config.DAO_ADDRESS,
    EMISSION_RATE,
    FEE_RATE);
  console.log("Deployed RicochetLaunchpad at address:", ricochetLaunchpad.address);

  // Allowlist this launchpad with REX Referral system
  console.log("Allowlisting RicochetLaunchpad with REX Referral system")
  const rexReferral = await ethers.getContractAt("RexReferral", config.REX_REFERRAL_ADDRESS);
  await rexReferral.registerApp(ricochetLaunchpad.address);
  console.log("Allowlisted RicochetLaunchpad with REX Referral system")

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
