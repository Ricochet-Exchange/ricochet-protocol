async function main() {

  // Requires REXReferral is deployed

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  // Polygon Mainnet
  const HOST_ADDRESS = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
  const CFA_ADDRESS = "0x6EeE6060f715257b970700bc2656De21dEdF074C";
  const IDA_ADDRESS = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";
  const TELLOR_ORACLE_ADDRESS = "0xACC2d27400029904919ea54fFc0b18Bf07C57875";
  const ROUTER_ADDRESS = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";

  USDCX_ADDRESS = "0xCAa7349CEA390F89641fe306D93591f87595dc1F";
  TELLOR_USDC_REQUEST_ID = 78;
  ETHX_ADDRESS = "0x27e1e4E6BC79D93032abef01025811B7E4727e85";
  TELLOR_ETH_REQUEST_ID = 1;

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const REXTwoWayMarket = await ethers.getContractFactory("REXTwoWayMarket");
  console.log("Deploying REXTwoWayMarket")
  const rexTwoWayMarket = await REXTwoWayMarket.deploy(deployer.address,
                                                      HOST_ADDRESS,
                                                      CFA_ADDRESS,
                                                      IDA_ADDRESS,
                                                      process.env.SF_REG_KEY,
                                                      process.env.REX_REFERRAL_ADDRESS
                                                     );


   await rexTwoWayMarket.deployed();
   console.log("Deployed REXTwoWayMarket at address:", rexTwoWayMarket.address);

   await rexTwoWayMarket.initializeTwoWayMarket(
     USDCX_ADDRESS,
     TELLOR_USDC_REQUEST_ID,
     1e9,
     ETHX_ADDRESS,
     TELLOR_ETH_REQUEST_ID,
     1e9,
     20000,
     20000
   );

   await rexTwoWayMarket.initializeSubsidies(1000000000000000); // 1e15/second


  // Register the market with REXReferral
  console.log("Registering with RexReferral system...")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(process.env.REX_REFERRAL_ADDRESS);
  await referral.registerApp(rexTwoWayMarket.address);
  console.log("Registered:", rexTwoWayMarket.address);

  // Affiliates will need to be setup manually
  // referral = await referral.connect(carl);
  // await referral.applyForAffiliate("carl", "carl");
  // referral = await referral.connect(owner);
  // await referral.verifyAffiliate("carl");

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
