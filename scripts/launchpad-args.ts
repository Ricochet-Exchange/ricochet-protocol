import { Constants } from "../misc/Constants"

const NETWORK = 'maticmum';

// Get the right constants for the network
const config = Constants[NETWORK];
console.log("Using this for config:", config);

module.exports = [
  config.HOST_SUPERFLUID_ADDRESS,
  config.CFA_SUPERFLUID_ADDRESS,
  config.IDA_SUPERFLUID_ADDRESS,
  config.SF_REG_KEY,
  config.REX_REFERRAL_ADDRESS
];
