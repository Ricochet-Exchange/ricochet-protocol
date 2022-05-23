import { ethers } from "hardhat";

async function main() {

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  console.log("Deploying RexReferral")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  let referral = await REXReferral.deploy();
  console.log("Deployed RexReferral at address:", referral.address)

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
