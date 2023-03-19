import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

async function main() {

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get the current network from hardhat
  const network = await ethers.provider.getNetwork();
  console.log("network:", network);

  // Get the right constants for the network
  const config = Constants[network.name];
  console.log("config:", config);

  return;


  // Get the deployer for this deployment, first hardhat signer
  const [deployer] = await ethers.getSigners();
  // Log deployer facts information
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deloy REXUniswapV3Market
  console.log("Deploying REXUniswapV3Market")
  const REXUniswapV3Market = await ethers.getContractFactory("REXUniswapV3Market");

  // Log the config values for the network we are deploying to
  console.log("deployer.address:", deployer.address);
  console.log("Constants.HOST_SUPERFLUID_ADDRESS:", config.HOST_SUPERFLUID_ADDRESS);
  console.log("Constants.CFA_SUPERFLUID_ADDRESS:", config.CFA_SUPERFLUID_ADDRESS);
  console.log("Constants.IDA_SUPERFLUID_ADDRESS:", config.IDA_SUPERFLUID_ADDRESS);
  console.log("Constants.REG_KEY:", config.SF_REG_KEY);
  console.log("Constants.REX_REFERRAL_ADDRESS:", config.REX_REFERRAL_ADDRESS);
  console.log("Constants.GELATO_OPS:", config.GELATO_OPS);  
  console.log("deployer.address:", deployer.address);


  console.log("Constants.UNISWAP_V3_ROUTER_ADDRESS:", config.UNISWAP_V3_ROUTER_ADDRESS);
  console.log("Constants.UNISWAP_V3_FACTORY_ADDRESS:", config.UNISWAP_V3_FACTORY_ADDRESS);



  const market = await REXUniswapV3Market.deploy(
    deployer.address,
    Constants.HOST_SUPERFLUID_ADDRESS,
    Constants.CFA_SUPERFLUID_ADDRESS,
    Constants.IDA_SUPERFLUID_ADDRESS,
    Constants.SF_REG_KEY,
    Constants.REX_REFERRAL_ADDRESS,
    Constants.GELATO_OPS,
    deployer.address,
    {gasLimit: 10000000}
  );
  await market.deployed();
  console.log("REXUniswapV3Market deployed to:", market.address);

  // Create the Gelato task that will be used to execute the market
  await market.createTask();
  console.log("Created Gelato task:", await market.taskId());

  // Initialize the market
  // Log the config values for the network we are initialize on this market
  console.log("Constants.USDCX_ADDRESS:", config.USDCX_ADDRESS);
  console.log("Constants.REXMATICX_ADDRESS:", config.REXMATICX_ADDRESS);
  console.log("Constants.RIC_TOKEN_ADDRESS:", config.RIC_TOKEN_ADDRESS);
  console.log("Constants.SHARE_SCALER:", config.SHARE_SCALER);
  console.log("Constants.FEE_RATE:", config.FEE_RATE);
  console.log("Constants.INITIAL_PRICE:", config.INITIAL_PRICE);
  console.log("Constants.RATE_TOLERANCE:", config.RATE_TOLERANCE);

  await market.initializeMarket(
    Constants.USDCX_ADDRESS,
    Constants.REXMATICX_ADDRESS,
    Constants.RIC_TOKEN_ADDRESS,
    config.SHARE_SCALER,
    config.FEE_RATE,
    config.INITIAL_PRICE,
    config.RATE_TOLERANCE,
    {gasLimit: 10000000}
  );

  console.log("Initialized market");

  // Initialize Uniswap
  console.log("Initializing Uniswap");
  // Log the config values for the network we are initialize on this market
  console.log("Constants.UNISWAP_V3_ROUTER_ADDRESS:", config.UNISWAP_V3_ROUTER_ADDRESS);
  console.log("Constants.UNISWAP_V3_FACTORY_ADDRESS:", config.UNISWAP_V3_FACTORY_ADDRESS);
  console.log("Constants.USDC_ADDRESS:", config.USDC_ADDRESS);
  console.log("Constants.MATICX_ADDRESS:", config.MATICX_ADDRESS);
  console.log("Constants.UNISWAP_V3_ROUTER_ADDRESS:", config.UNISWAP_V3_ROUTER_ADDRESS);
  console.log("Constants.UNISWAP_POOL_FEE:", config.UNISWAP_POOL_FEE);
  await market.initializeUniswap(
    config.UNISWAP_V3_ROUTER_ADDRESS, 
    config.UNISWAP_V3_FACTORY_ADDRESS,
    [config.USDC_ADDRESS, config.MATICX_ADDRESS],
    config.UNISWAP_POOL_FEE,
    {gasLimit: 10000000}
  );
  console.log("========== Initialized Uniswap ===========");

  await sleep(5000);

  console.log("Registering with RexReferral system...")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(Constants.REX_REFERRAL_ADDRESS);
  await referral.registerApp(market.address);
  console.log("Registered:", market.address);

  // Retain ownership of market for test purposes, but transfer to Gnosis Safe in production
  // await market.transferOwnership(Constants.GNOSIS_SAFE_ADDRESS); // 1e15/second

  await hre.tenderly.persistArtifacts({
    name: "REXUniswapV3Market",
    address: market.address,
  });


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
