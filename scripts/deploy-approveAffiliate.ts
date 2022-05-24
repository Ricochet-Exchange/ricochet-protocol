import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import { REX_REFERRAL_ADDRESS } from "../misc/setup";

dotenv.config();

async function main() {

  // Requires REXReferral is deployed

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  // Register the market with REXReferral
  console.log("Registering with RexReferral system...")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(REX_REFERRAL_ADDRESS);
  // await referral.registerApp(rexTwoWayMarket.address);
  // console.log("Registered:", rexTwoWayMarket.address);

  // Affiliates will need to be setup manually
  // referral = await referral.connect(carl);
  // await referral.applyForAffiliate("carl", "carl");
  // referral = await referral.connect(owner);
  let tx = await referral.verifyAffiliate("mikeghen");
  console.log("Approve mikeghen as affiliate");


}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
