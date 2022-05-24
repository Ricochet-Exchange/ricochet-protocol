const C = require('../misc/Constants.ts');

async function main() {

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  // Polygon Mainnet
  const HOST_ADDRESS = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
  const CFA_ADDRESS = C.Constants.CFA_SUPERFLUID_ADDRESS;
  const IDA_ADDRESS = C.Constants.IDA_SUPERFLUID_ADDRESS;
  const TELLOR_ORACLE_ADDRESS = C.Constants.TELLOR_ORACLE_ADDRESS;
  const RIC_CONTRACT_ADDRESS = C.Constants.RIC_TOKEN_ADDRESS;
  const ROUTER_ADDRESS = C.Constants.SUSHISWAP_ROUTER_ADDRESS;

  USDCX_ADDRESS = "0xCAa7349CEA390F89641fe306D93591f87595dc1F";
  TELLOR_USDC_REQUEST_ID = 78;
  RIC_ADDRESS = C.Constants.RIC_TOKEN_ADDRESS;
  TELLOR_RIC_REQUEST_ID = 77;

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const REXOneWayMarket = await ethers.getContractFactory("REXOneWayMarket");
  console.log("Deploying REXOneWayMarket")
  const rexOneWayMarket = await REXOneWayMarket.deploy(deployer.address,
                                                      HOST_ADDRESS,
                                                      CFA_ADDRESS,
                                                      IDA_ADDRESS,
                                                      process.env.SF_REG_KEY,
                                                      process.env.REX_REFERRAL_ADDRESS
                                                     );
  await rexOneWayMarket.deployed();
  console.log("Deployed rexOneWayMarket at address:", rexOneWayMarket.address);

  await rexOneWayMarket.initializeOneWayMarket(
    ROUTER_ADDRESS,
    TELLOR_ORACLE_ADDRESS,
    USDCX_ADDRESS,
    20000,
    TELLOR_USDC_REQUEST_ID,
    RIC_ADDRESS,
    20000,
    TELLOR_RIC_REQUEST_ID
  );

  // Register the market with REXReferral
  console.log("Registering with RexReferral system...")
  const RexReferral = await ethers.getContractFactory("RexReferral");
  const referral = await RexReferral.attach(process.env.REX_REFERRAL_ADDRESS);
  await referral.registerApp(rexOneWayMarket.address);
  console.log("Registered:", rexOneWayMarket.address);

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
