import { ethers } from "hardhat";
import { Constants } from "../../misc/Constants"

async function main() {

  // Parameters for the launchpad
  const EMISSION_RATE = "38580246913600000"; // ~100K RIC/year
  const FEE_RATE = "0";  // No Fee

  // Get the current network from hardhat
  const network = await ethers.provider.getNetwork();
  // Get the right constants for the network
  const config = Constants['optimism'];
  // Get the deployer for this deployment, first hardhat signer
  const [deployer] = await ethers.getSigners();
  // Log deployer facts information
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy the RicochetLaunchpadHelper
  const RicochetLaunchpadHelper = await ethers.getContractFactory("RicochetLaunchpadHelper");
  let ricochetLaunchpadHelpder = await RicochetLaunchpadHelper.deploy();
  await ricochetLaunchpadHelpder.deployed();
  console.log("Deployed RicochetLaunchpadHelper:", ricochetLaunchpadHelpder.address)

  // Deploy the RicochetLaunchpad
  const RicochetLaunchpad = await ethers.getContractFactory("RicochetLaunchpad", {
    libraries: {
      RicochetLaunchpadHelper: ricochetLaunchpadHelpder.address,
    },
  });
  const ricochetLaunchpad = await RicochetLaunchpad.deploy(config.HOST_SUPERFLUID_ADDRESS,
    config.CFA_SUPERFLUID_ADDRESS,
    config.IDA_SUPERFLUID_ADDRESS,
    config.SF_REG_KEY,
    config.REX_REFERRAL_ADDRESS);
  await ricochetLaunchpad.deployed();
  console.log("Deployed RicochetLaunchpad:", ricochetLaunchpad.address)

  const INPUT_TOKEN_ADDRESS = config.USDCX_ADDRESS;
  const OUTPUT_TOKEN_ADDRESS = config.RIC_ADDRESS;

  let tx = await ricochetLaunchpad.initialize(
    INPUT_TOKEN_ADDRESS,
    OUTPUT_TOKEN_ADDRESS,
    deployer.address,
    config.DAO_ADDRESS,
    EMISSION_RATE,
    FEE_RATE,
    { gasLimit: 10000000 });
  await tx.wait();
  console.log("Initialized RicochetLaunchpad", tx.hash)

  // Transfer ownership to the DAO
  tx = await ricochetLaunchpad.transferOwnership(config.DAO_ADDRESS); 
  await tx.wait();
  console.log("Transferred ownership to Gnosis Safe", tx.hash);
  console.log("Deployed RicochetLaunchpadHelper at address:", ricochetLaunchpadHelpder.address);
  console.log("Deployed RicochetLaunchpad at address:", ricochetLaunchpad.address);

  // Export the artifacts to tenderly for further inspection, monitoring, and debugging
  await hre.tenderly.persistArtifacts({
    name: "RicochetLaunchpadHelper",
    address: ricochetLaunchpadHelpder.address,
  });
  await hre.tenderly.persistArtifacts({
    name: "RicochetLaunchpad",
    address: ricochetLaunchpad.address,
    libraries: {
        RicochetLaunchpadHelper: ricochetLaunchpadHelpder.address,
    }
  });

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
