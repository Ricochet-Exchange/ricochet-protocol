import { ethers } from "hardhat";

async function main() {
  // Deploy REXSuperSwap
  console.log("Deploying REXSuperSwap...");
  let rexSuperSwap: any;
  let superSwap: any;

  rexSuperSwap = await ethers.getContractFactory("RexSuperSwap");

  const swapRouterAddress = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
  const maticAddress = "0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3"

  superSwap = await rexSuperSwap.deploy(swapRouterAddress, maticAddress);
  await superSwap.deployed();
  
  console.log("=========== Deployed REXSuperSwap ============");
  console.log("RexSuperSwap deployed to:", superSwap.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });