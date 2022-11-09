import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

async function main() {

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const REXTwoWayAlluoMarket = await ethers.getContractFactory("REXTwoWayAlluoMarket");
  // const rexTwoWayAlluoMarket = await REXTwoWayAlluoMarket.attach("0xA46B49168f77977b36813C863984BC4c38997324");

  console.log("Deploying REXTwoWayAlluoMarket")
  const REG_KEY = process.env.SF_REG_KEY !== undefined ? process.env.SF_REG_KEY : "";
  console.log("REG_KEY", REG_KEY);
  const rexTwoWayAlluoMarket = await REXTwoWayAlluoMarket.deploy(deployer.address,
    Constants.HOST_SUPERFLUID_ADDRESS,
    Constants.CFA_SUPERFLUID_ADDRESS,
    Constants.IDA_SUPERFLUID_ADDRESS,
    REG_KEY,
    Constants.REX_REFERRAL_ADDRESS
  );


  await rexTwoWayAlluoMarket.deployed();
  console.log("Deployed REXTwoWayAlluoMarket at address:", rexTwoWayAlluoMarket.address);

  // !! NOTE: The underlying tokens for ibAlluoUSD/ETH/WBTC need to be coded
  //          into the REXTwoWayAlluoMarket.sol contract
  await rexTwoWayAlluoMarket.initializeTwoWayMarket(
    Constants.IBALLUOUSD_ADDRESS,
    Constants.TELLOR_USDC_REQUEST_ID,
    1e6,
    // Constants.IBALLUOETH_ADDRESS,
    // Constants.TELLOR_ETH_REQUEST_ID,
    Constants.IBALLUOBTC_ADDRESS,
    Constants.TELLOR_WBTC_REQUEST_ID,
    1e9,
    5000,
    20000,
    { gasLimit: 2000000 }
  );
  console.log("Initialized market.")

  await sleep(10000);

  // let ricAdress =
  await rexTwoWayAlluoMarket.initializeSubsidies(0, Constants.RIC_TOKEN_ADDRESS, { gasLimit: 2000000 }); // 1e15/second
  console.log("Initialized subsidies.")

  console.log("Registering with RexReferral system...")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(Constants.REX_REFERRAL_ADDRESS);
  await referral.registerApp(rexTwoWayAlluoMarket.address);
  console.log("Registered:", rexTwoWayAlluoMarket.address);
  //
  // // Affiliates will need to be setup manually
  // // referral = await referral.connect(carl);
  // // await referral.applyForAffiliate("carl", "carl");
  // // referral = await referral.connect(owner);
  // // await referral.verifyAffiliate("carl");
  //
  console.log("Transferring ownership to the DAO");
  await rexTwoWayAlluoMarket.transferOwnership("0x9C6B5FdC145912dfe6eE13A667aF3C5Eb07CbB89"); // 1e15/second
  console.log("Ownership transferred.");

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
