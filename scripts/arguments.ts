import { Constants } from "../misc/Constants"

// Get the current network from hardhat
const network = await ethers.provider.getNetwork();
// Get the right constants for the network
const config = Constants[network.name];
console.log("Using this for config:", config);

  // Get the deployer for this deployment, first hardhat signer
  const [deployer] = await ethers.getSigners();

module.exports = [
  deployer.address,
  config.HOST_SUPERFLUID_ADDRESS,
  config.CFA_SUPERFLUID_ADDRESS,
  config.IDA_SUPERFLUID_ADDRESS,
  config.RIC_TOKEN_ADDRESS,
  config.SF_REG_KEY,
  config.REX_REFERRAL_ADDRESS
];
