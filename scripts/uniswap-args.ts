import { Constants } from "../misc/Constants"

console.log("Constants.matic.OWNER_ADDRESS", Constants.matic.OWNER_ADDRESS)
console.log("Constants.maticmum.HOST_SUPERFLUID_ADDRESS", Constants.matic.HOST_SUPERFLUID_ADDRESS)
console.log("Constants.maticmum.CFA_SUPERFLUID_ADDRESS", Constants.matic.CFA_SUPERFLUID_ADDRESS)
console.log("Constants.maticmum.IDA_SUPERFLUID_ADDRESS", Constants.matic.IDA_SUPERFLUID_ADDRESS)
console.log("process.env.SF_REG_KEY", process.env.SF_REG_KEY)
console.log("Constants.maticmum.REX_REFERRAL_ADDRESS", Constants.matic.REX_REFERRAL_ADDRESS)

module.exports = [
  Constants.matic.OWNER_ADDRESS,
  Constants.matic.HOST_SUPERFLUID_ADDRESS,
  Constants.matic.CFA_SUPERFLUID_ADDRESS,
  Constants.matic.IDA_SUPERFLUID_ADDRESS,
  process.env.SF_REG_KEY,
  Constants.matic.REX_REFERRAL_ADDRESS
];
