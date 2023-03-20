import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

async function main() {

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get the current network from hardhat
  const network = await ethers.provider.getNetwork();
  // Get the right constants for the network
  const config = Constants[network.name];
  console.log("Using this for config:", config);


  // Get the deployer for this deployment, first hardhat signer
  const [deployer] = await ethers.getSigners();
  // Log deployer facts information
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deloy REXUniswapV3Market
  console.log("Deploying REXUniswapV3Market")
  const REXUniswapV3Market = await ethers.getContractFactory("REXUniswapV3Market");

  const market = await REXUniswapV3Market.deploy(
    deployer.address,
    config.HOST_SUPERFLUID_ADDRESS,
    config.CFA_SUPERFLUID_ADDRESS,
    config.IDA_SUPERFLUID_ADDRESS,
    config.SF_REG_KEY,
    config.REX_REFERRAL_ADDRESS,
    config.GELATO_OPS,
    deployer.address,
    {gasLimit: 10000000}
  );
  await market.deployed();
  console.log("REXUniswapV3Market deployed to:", market.address);

  // Create the Gelato task that will be used to execute the market
  await market.createTask();
  console.log("Created Gelato task");

  // Get the input and output token based on the network, or use these defaults
  let inputTokenAddress = config.USDCX_ADDRESS;
  let inputTokenUnderlyingAddress = config.USDC_ADDRESS;
  
  let outputTokenAddress = config.REXMATICX_ADDRESS;
  let outputTokenUnderlyingAddress = config.MATIC_ADDRESS;

  if (network.name == "polygon") {
    inputTokenAddress = config.USDCX_ADDRESS;
    inputTokenUnderlyingAddress = config.USDC_ADDRESS;
    outputTokenAddress = config.REXMATICX_ADDRESS;
    outputTokenUnderlyingAddress = config.MATIC_ADDRESS;
  } else if (network.name == "maticmum") {
    inputTokenAddress = config.USDCX_ADDRESS;
    inputTokenUnderlyingAddress = config.USDC_ADDRESS;
    outputTokenAddress = config.DAIX_ADDRESS;
    outputTokenUnderlyingAddress = config.DAI_ADDRESS;
  }


  await market.initializeMarket(
    inputTokenAddress,
    outputTokenAddress,
    config.RIC_ADDRESS,
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
  await market.initializeUniswap(
    config.UNISWAP_V3_ROUTER_ADDRESS, 
    config.UNISWAP_V3_FACTORY_ADDRESS,
    [inputTokenUnderlyingAddress, outputTokenUnderlyingAddress],
    config.UNISWAP_POOL_FEE,
    {gasLimit: 10000000}
  );
  console.log("========== Initialized Uniswap ===========");

  await sleep(5000);

  console.log("Registering with RexReferral system...")
  const REXReferral = await ethers.getContractFactory("REXReferral");
  const referral = await REXReferral.attach(config.REX_REFERRAL_ADDRESS);
  await referral.registerApp(market.address);
  console.log("Registered:", market.address);

  // Retain ownership of market for test purposes, but transfer to Gnosis Safe in production
  // await market.transferOwnership(config.GNOSIS_SAFE_ADDRESS); // 1e15/second

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
