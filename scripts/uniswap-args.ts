import { Constants } from "../misc/Constants"

console.log("Constants.matic.OWNER_ADDRESS", Constants.matic.OWNER_ADDRESS)
console.log("Constants.maticmum.HOST_SUPERFLUID_ADDRESS", Constants.maticmum.HOST_SUPERFLUID_ADDRESS)
console.log("Constants.maticmum.CFA_SUPERFLUID_ADDRESS", Constants.maticmum.CFA_SUPERFLUID_ADDRESS)
console.log("Constants.maticmum.IDA_SUPERFLUID_ADDRESS", Constants.maticmum.IDA_SUPERFLUID_ADDRESS)
console.log("process.env.SF_REG_KEY", process.env.SF_REG_KEY)
console.log("Constants.maticmum.REX_REFERRAL_ADDRESS", Constants.maticmum.REX_REFERRAL_ADDRESS)

module.exports = [
  Constants.matic.OWNER_ADDRESS,
  Constants.maticmum.HOST_SUPERFLUID_ADDRESS,
  Constants.maticmum.CFA_SUPERFLUID_ADDRESS,
  Constants.maticmum.IDA_SUPERFLUID_ADDRESS,
  '',
  Constants.maticmum.REX_REFERRAL_ADDRESS
];
