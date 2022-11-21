import { Constants } from "../misc/Constants"
// Polygon Mainnet
const HOST_ADDRESS = Constants.HOST_SUPERFLUID_ADDRESS;
const CFA_ADDRESS = Constants.CFA_SUPERFLUID_ADDRESS;
const IDA_ADDRESS = Constants.IDA_SUPERFLUID_ADDRESS;
const REX_REFERRAL_ADDRESS = Constants.REX_REFERRAL_ADDRESS;

module.exports = [
  HOST_ADDRESS,
  CFA_ADDRESS,
  IDA_ADDRESS,
  process.env.SF_REG_KEY,
  REX_REFERRAL_ADDRESS
];
