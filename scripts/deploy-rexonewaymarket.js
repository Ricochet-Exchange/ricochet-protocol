async function main() {

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  // Polygon Mainnet
  const HOST_ADDRESS = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
  const CFA_ADDRESS = "0x6EeE6060f715257b970700bc2656De21dEdF074C";
  const IDA_ADDRESS = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";
  const TELLOR_ORACLE_ADDRESS = "0xACC2d27400029904919ea54fFc0b18Bf07C57875";
  const RIC_CONTRACT_ADDRESS = "0x263026e7e53dbfdce5ae55ade22493f828922965";
  const ROUTER_ADDRESS = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";

  USDCX_ADDRESS = "0xCAa7349CEA390F89641fe306D93591f87595dc1F";
  TELLOR_USDC_REQUEST_ID = 78;
  RIC_ADDRESS = "0x263026E7e53DBFDce5ae55Ade22493f828922965";
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

  // TODO: addOutputPool to add RIC subsidies (currently not tested)

  // Register the market with REXReferral
  await referral.registerApp(rexOneWayMarket.address);

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
