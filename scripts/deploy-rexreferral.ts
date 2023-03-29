import { ethers } from "hardhat";

async function main() {

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  console.log("Deploying RexReferral")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  let referral = await REXReferral.deploy();
  console.log("Deployed RexReferral at address:", referral.address);

  // This is not immediately transferred to the config.DAO_ADDRESS
  // The deployer will register the app with the REXReferral contract
  // After apps have been registered, the deployer can transfer the ownership to the DAO

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
