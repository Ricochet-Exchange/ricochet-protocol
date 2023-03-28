import { Constants } from "../../../misc/Constants"

// Get the right constants for the network
const config = Constants['optimism'];

// Export the arguments for the deployment
module.exports = [
  config.HOST_SUPERFLUID_ADDRESS,
  config.CFA_SUPERFLUID_ADDRESS,
  config.IDA_SUPERFLUID_ADDRESS,
  config.SF_REG_KEY,
  config.REX_REFERRAL_ADDRESS
];
