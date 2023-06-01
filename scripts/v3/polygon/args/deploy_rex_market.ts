import { Constants } from "../../../misc/Constants"

// Get the right constants for the network
const config = Constants['polygon'];

// Export the arguments for the deployment
module.exports = [
  config.REX_DEPLOYER_ADDRESS,
  config.HOST_SUPERFLUID_ADDRESS,
  config.CFA_SUPERFLUID_ADDRESS,
  config.IDA_SUPERFLUID_ADDRESS,
  config.SF_REG_KEY,
  config.REX_REFERRAL_ADDRESS,
  config.GELATO_OPS,
  config.REX_DEPLOYER_ADDRESS,
];
