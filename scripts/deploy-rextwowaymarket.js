import { Constants } from '../misc/Constants';

async function main() {

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Requires REXReferral is deployed

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  // Polygon Mainnet
  const HOST_ADDRESS = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
  const CFA_ADDRESS = Constants.CFA_SUPERFLUID_ADDRESS;
  const IDA_ADDRESS = Constants.IDA_SUPERFLUID_ADDRESS;
  const TELLOR_ORACLE_ADDRESS = Constants.TELLOR_ORACLE_ADDRESS;

  const DAIX_ADDRESS = "0x1305F6B6Df9Dc47159D12Eb7aC2804d4A33173c2";
  const USDCX_ADDRESS = "0xCAa7349CEA390F89641fe306D93591f87595dc1F";
  const TELLOR_USDC_REQUEST_ID = 78;
  const ETHX_ADDRESS = "0x27e1e4E6BC79D93032abef01025811B7E4727e85";
  const TELLOR_ETH_REQUEST_ID = 1;
  const WBTCX_ADDRESS = "0x4086eBf75233e8492F1BCDa41C7f2A8288c2fB92";
  const TELLOR_WBTC_REQUEST_ID = 60;
  const REX_REFERRAL_ADDRESS = '0xA0eC9E1542485700110688b3e6FbebBDf23cd901';
  const RIC_ADDRESS = "0x263026E7e53DBFDce5ae55Ade22493f828922965";

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const REXTwoWayMarket = await ethers.getContractFactory("REXTwoWayMarket");
  // const rexTwoWayMarket = await REXTwoWayMarket.attach("0x6d346Dc10529232505f2A7195d4AA01257b37167");

  console.log("Deploying REXTwoWayMarket")
  const rexTwoWayMarket = await REXTwoWayMarket.deploy(deployer.address,
                                                      HOST_ADDRESS,
                                                      CFA_ADDRESS,
                                                      IDA_ADDRESS,
                                                      process.env.SF_REG_KEY,
                                                      REX_REFERRAL_ADDRESS
                                                     );


   await rexTwoWayMarket.deployed();
   console.log("Deployed REXTwoWayMarket at address:", rexTwoWayMarket.address);

  await rexTwoWayMarket.initializeTwoWayMarket(
    USDCX_ADDRESS,
    TELLOR_USDC_REQUEST_ID,
    1e7,
    ETHX_ADDRESS,
    TELLOR_ETH_REQUEST_ID,
    1e9,
    20000,
    20000,
    {gasLimit: 2000000}
  );
  console.log("Initialized twoway market.")

  await sleep(5000);

  await rexTwoWayMarket.initializeSubsidies(0, RIC_ADDRESS); // 1e15/second
  console.log("Initialized subsidy.")

  console.log("Registering with RexReferral system...")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(REX_REFERRAL_ADDRESS);
  await referral.registerApp(rexTwoWayMarket.address);
  console.log("Registered:", rexTwoWayMarket.address);
  //
  // // Affiliates will need to be setup manually
  // // referral = await referral.connect(carl);
  // // await referral.applyForAffiliate("carl", "carl");
  // // referral = await referral.connect(owner);
  // // await referral.verifyAffiliate("carl");
  //
  await rexTwoWayMarket.transferOwnership("0x9C6B5FdC145912dfe6eE13A667aF3C5Eb07CbB89"); // 1e15/second


}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
