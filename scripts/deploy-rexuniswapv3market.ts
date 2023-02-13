import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

async function main() {

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Requires REXReferral is deployed

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  // Log deployment information
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());


  console.log("Deploying REXUniswapV3Market")
  const REG_KEY = process.env.SF_REG_KEY !== undefined ? process.env.SF_REG_KEY : "";

  // Deploy REX Market
  const REXUniswapV3Market = await ethers.getContractFactory("REXUniswapV3Market");
  // const rexTwoWayMarket = await REXUniswapV3Market.attach("0x6d346Dc10529232505f2A7195d4AA01257b37167");
  console.log("Deploying REXUniswapV3Market...");
  console.log("deployer.address:", deployer.address);
  console.log("Constants.HOST_SUPERFLUID_ADDRESS:", Constants.HOST_SUPERFLUID_ADDRESS);
  console.log("Constants.CFA_SUPERFLUID_ADDRESS:", Constants.CFA_SUPERFLUID_ADDRESS);
  console.log("Constants.IDA_SUPERFLUID_ADDRESS:", Constants.IDA_SUPERFLUID_ADDRESS);
  console.log("REG_KEY:", REG_KEY);
  console.log("Constants.REX_REFERRAL_ADDRESS:", Constants.REX_REFERRAL_ADDRESS);
  console.log("Constants.GELATO_OPS:", Constants.GELATO_OPS);

  const market = await REXUniswapV3Market.deploy(
    deployer.address,
    Constants.HOST_SUPERFLUID_ADDRESS,
    Constants.CFA_SUPERFLUID_ADDRESS,
    Constants.IDA_SUPERFLUID_ADDRESS,
    REG_KEY,
    Constants.REX_REFERRAL_ADDRESS,
    Constants.GELATO_OPS,
    deployer.address
  );
  console.log("=========== Deployed REXUniswapV3Market ============");

  await market.createTask();

  console.log("========== Created Task ===========");

  await market.initializeMarket(
    Constants.USDCX_ADDRESS,
    Constants.ETHX_ADDRESS,
    Constants.RIC_TOKEN_ADDRESS,
    10000, 
    20000,
    "1500000000000000000000", // Initial price pulled from coingecko manually
    20000,
  );
  console.log("=========== Initialized TwoWayMarket ============");

  console.log("========== Initializing Uniswap ===========");
  await market.initializeUniswap(
    Constants.UNISWAP_V3_ROUTER_ADDRESS, 
    Constants.UNISWAP_V3_FACTORY_ADDRESS,
    [Constants.USDC_ADDRESS, Constants.ETH_ADDRESS],
    [500]
  );
  console.log("========== Initialized Uniswap ===========");

  await sleep(5000);

  console.log("Registering with RexReferral system...")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(Constants.REX_REFERRAL_ADDRESS);
  await referral.registerApp(market.address);
  console.log("Registered:", market.address);
  //
  // // Affiliates will need to be setup manually
  // // referral = await referral.connect(carl);
  // // await referral.applyForAffiliate("carl", "carl");
  // // referral = await referral.connect(owner);
  // // await referral.verifyAffiliate("carl");
  //
  await market.transferOwnership(Constants.GNOSIS_SAFE_ADDRESS); // 1e15/second

  await hre.tenderly.persistArtifacts({
    name: "REXUniswapV3Market",
    address: market.address,
})


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
