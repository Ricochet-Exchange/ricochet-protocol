import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

async function main() {

  // Figure out what network were using
  let constants: any;
  const network = await ethers.provider.getNetwork();
  console.log("network", network.name);
  constants = Constants[network.name];
  console.log("Constants", constants);

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Requires REXReferral is deployed

  const [deployer] = await ethers.getSigners();
  console.log(process.argv);

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  const REXUniswapV3Market = await ethers.getContractFactory("REXUniswapV3Market");
  // const market = await REXUniswapV3Market.attach("0x6d346Dc10529232505f2A7195d4AA01257b37167");

  console.log("Deploying REXUniswapV3Market")
  const REG_KEY = process.env.SF_REG_KEY !== undefined ? process.env.SF_REG_KEY : "";

  console.log("Deploying market...");
  console.log("constants.HOST_SUPERFLUID_ADDRESS", constants.HOST_SUPERFLUID_ADDRESS);
  console.log("constants.CFA_SUPERFLUID_ADDRESS", constants.CFA_SUPERFLUID_ADDRESS);
  console.log("constants.IDA_SUPERFLUID_ADDRESS", constants.IDA_SUPERFLUID_ADDRESS);
  console.log("REG_KEY", REG_KEY);
  console.log("constants.REX_REFERRAL_ADDRESS", constants.REX_REFERRAL_ADDRESS);

  const market = await REXUniswapV3Market.deploy(deployer.address,
    constants.HOST_SUPERFLUID_ADDRESS,
    constants.CFA_SUPERFLUID_ADDRESS,
    constants.IDA_SUPERFLUID_ADDRESS,
    REG_KEY,
    constants.REX_REFERRAL_ADDRESS,
  );


  await market.deployed();
  console.log("Deployed REXUniswapV3Market at address:", market.address);
  
  console.log("Initializing market...");
  console.log("constants.USDCX_ADDRESS", constants.USDCX_ADDRESS);
  console.log("constants.WBTCX_ADDRESS", constants.WBTCX_ADDRESS);
  console.log("constants.RIC_ADDRESS", constants.RIC_ADDRESS);

  await market.initializeMarket(
    constants.USDCX_ADDRESS,
    constants.WBTCX_ADDRESS,
    constants.RIC_ADDRESS,
    10000, 
    20000,
    "1000000000000000000", // Initial price pulled from coingecko manually
    20000,
    { gasLimit: 2000000 }
  );
  console.log("Initialized market.");

  console.log("Initializing Uniswap...");
  console.log("constants.UNISWAP_V3_ROUTER_ADDRESS", constants.UNISWAP_V3_ROUTER_ADDRESS);
  console.log("constants.UNISWAP_V3_FACTORY_ADDRESS", constants.UNISWAP_V3_FACTORY_ADDRESS);
  console.log("constants.USDC_ADDRESS", constants.USDC_ADDRESS);
  console.log("constants.WBTC_ADDRESS", constants.WBTC_ADDRESS);

  await market.initializeUniswap(
      constants.UNISWAP_V3_ROUTER_ADDRESS, 
      constants.UNISWAP_V3_FACTORY_ADDRESS,
      [constants.USDC_ADDRESS, constants.WBTC_ADDRESS],
      [500],
      { gasLimit: 2000000 }
  );
  console.log("Initialized Uniswap.");

  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(constants.REX_REFERRAL_ADDRESS);
  await referral.registerApp(market.address);
  console.log("Registered with REX Referral:", market.address);

  await market.transferOwnership(constants.DAO_ADDRESS);
  console.log("Transferred ownership to DAO:", constants.DAO_ADDRESS);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
