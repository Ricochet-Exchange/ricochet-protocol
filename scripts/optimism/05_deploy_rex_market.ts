import { ethers } from "hardhat";
import { Constants } from "../../misc/Constants"

/*

This script will deploy a REX Market for any input/output token pair that has a Chainlink price feed:

    INPUT_TOKEN=0xAAAA \
    INPUT_TOKEN_UNDERLYING=0xBBBB \
    OUTPUT_TOKEN=0xCCCC \
    OUTPUT_TOKEN_UNDERLYING=0xDDDD \
    PRICE_FEED=0xFFFF \
    UNISWAP_POOL_FEE=500 \
    npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly

    Example: DAI>USDC market on Optimism with Chainlinnk DAI/USD price feed

    INPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
    INPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
    OUTPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
    OUTPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
    PRICE_FEED=0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6 \
    UNISWAP_POOL_FEE=500 \
    npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly


Where:

    INPUT_TOKEN: The address of the input supertoken (e.g. USDCx)
    INPUT_TOKEN_UNDERLYING: The address of the underlying token (e.g. USDC)
    OUTPUT_TOKEN: The address of the output supertoken (e.g. DAIx)
    OUTPUT_TOKEN_UNDERLYING: The address of the underlying token (e.g. DAI)
    PRICE_FEED: The address of the Chainlink price feed for the input/output pair 
    UNISWAP_POOL_FEE: The fee for the Uniswap pool for the input/output token pair (e.g. 500/ 0.05%)

*/

async function main() {

    // Get the right constants for the network we are deploying on
    const config = Constants['optimism'];

    // Get the deployer for this deployment, first hardhat signer
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    // Get the input/output token addresses from the environment
    const INPUT_TOKEN = process.env.INPUT_TOKEN;
    const INPUT_TOKEN_UNDERLYING = process.env.INPUT_TOKEN_UNDERLYING;
    const OUTPUT_TOKEN = process.env.OUTPUT_TOKEN;
    const OUTPUT_TOKEN_UNDERLYING = process.env.OUTPUT_TOKEN_UNDERLYING;
    const PRICE_FEED = process.env.PRICE_FEED;
    const UNISWAP_POOL_FEE = process.env.UNISWAP_POOL_FEE;


    // Log all the config values for the network we are initialize on this market
    console.log("HOST_SUPERFLUID_ADDRESS:", config.HOST_SUPERFLUID_ADDRESS);
    console.log("CFA_SUPERFLUID_ADDRESS:", config.CFA_SUPERFLUID_ADDRESS);
    console.log("IDA_SUPERFLUID_ADDRESS:", config.IDA_SUPERFLUID_ADDRESS);
    console.log("SF_REG_KEY:", config.SF_REG_KEY);
    console.log("REX_REFERRAL_ADDRESS:", config.REX_REFERRAL_ADDRESS);
    console.log("GELATO_OPS:", config.GELATO_OPS);

    // Prompt the user to continue after checking the config
    console.log("Verify these parameters. Then press any key to continue the deployment...");
    await new Promise(resolve => process.stdin.once("data", resolve));

    // Deploy REXUniswapV3Market
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
        // { gasLimit: 10000000 } // Force deploy even if estimate gas fails
    );
    await market.deployed();
    console.log("REXUniswapV3Market deployed to:", market.address);

    // Log the config values for the network we are initializeMATIC
    // TODO: This varies on MATIC network
    console.log("ETH_ADDRESS:", config.ETH_ADDRESS);
    console.log("ETHX_ADDRESS:", config.ETHX_ADDRESS);

    // Prompt the user to continue after checking the config
    console.log("Verify these parameters. Then press any key to continue the deployment...");
    await new Promise(resolve => process.stdin.once("data", resolve));

    // Initialize WMATIC and MATICx
    let tx: any;
    tx = await market.initializeMATIC(config.ETH_ADDRESS, config.ETHX_ADDRESS);
    await tx.wait();
    console.log("Initialized WETH and WETHx", tx.hash);

    // Create the Gelato task that will be used to execute the market
    tx = await market.createTask();
    await tx.wait();
    console.log("Created Gelato task (does not have any input parameters)", tx.hash);

    // Log the config values for the network we are initialize on this market
    console.log("INPUT_TOKEN:", INPUT_TOKEN);
    console.log("OUTPUT_TOKEN:", OUTPUT_TOKEN);
    console.log("RIC_ADDRESS:", config.RIC_ADDRESS);
    console.log("SHARE_SCALER:", config.SHARE_SCALER);
    console.log("FEE_RATE:", config.FEE_RATE);
    console.log("AFFILAITE_FEE:", config.AFFILAITE_FEE);
    console.log("RATE_TOLERANCE:", config.RATE_TOLERANCE);

    // Prompt the user to continue after checking the config
    console.log("Verify these parameters. Then press any key to continue the deployment...");
    await new Promise(resolve => process.stdin.once("data", resolve));

    // Set up for the USDC>>DAI market initialization
    tx = await market.initializeMarket(
        INPUT_TOKEN,
        OUTPUT_TOKEN,
        config.RIC_ADDRESS,
        config.SHARE_SCALER,
        config.FEE_RATE,
        config.AFFILAITE_FEE,
        config.RATE_TOLERANCE,
        { gasLimit: 10000000 }
    );
    await tx.wait();
    console.log("Initialized market", tx.hash);

    // Log the config values for the network we are initialize on this market
    console.log("UNISWAP_V3_ROUTER_ADDRESS:", config.UNISWAP_V3_ROUTER_ADDRESS);
    console.log("UNISWAP_V3_FACTORY_ADDRESS:", config.UNISWAP_V3_FACTORY_ADDRESS);
    console.log("UNISWAP_POOL_FEE:", UNISWAP_POOL_FEE);
    console.log("INPUT_TOKEN_UNDERLYING:", INPUT_TOKEN_UNDERLYING);
    console.log("OUTPUT_TOKEN_UNDERLYING:", OUTPUT_TOKEN_UNDERLYING);

    await market.initializeUniswap(
        config.UNISWAP_V3_ROUTER_ADDRESS,
        config.UNISWAP_V3_FACTORY_ADDRESS,
        [INPUT_TOKEN_UNDERLYING, OUTPUT_TOKEN_UNDERLYING],
        UNISWAP_POOL_FEE,
        { gasLimit: 10000000 }
    );
    await tx.wait();
    console.log("Initialized Uniswap", tx.hash);

    // Log the config values for the network we are initialize on this market
    console.log("PRICE_FEED:", PRICE_FEED);

    // Prompt the user to continue after checking the config
    console.log("Verify these parameters. Then press any key to continue the deployment...");
    await new Promise(resolve => process.stdin.once("data", resolve));

    // Initialize the price feed
    tx = await market.initializePriceFeed(PRICE_FEED, true);
    await tx.wait();
    console.log("Initialized price feed", tx.hash);

    // Log the config values for the network we are initialize on this market
    console.log("REX_REFERRAL_ADDRESS:", config.REX_REFERRAL_ADDRESS);

    // Prompt the user to continue after checking the config
    console.log("Verify these parameters. Then press any key to continue the deployment...");
    await new Promise(resolve => process.stdin.once("data", resolve));

    console.log("Registering with RexReferral system...");
    const REXReferral = await ethers.getContractFactory("REXReferral");
    const referral = await REXReferral.attach(config.REX_REFERRAL_ADDRESS);
    tx = await referral.registerApp(market.address);
    await tx.wait();
    console.log("Registered with RexReferral system", tx.hash);

    // Log the config values for the network we are initialize on this market
    console.log("DAO_ADDRESS:", config.DAO_ADDRESS);

    // Prompt the user to continue after checking the config
    console.log("Verify these parameters. Then press any key to continue the deployment...");
    await new Promise(resolve => process.stdin.once("data", resolve));

    tx = await market.transferOwnership(config.DAO_ADDRESS);
    await tx.wait();
    console.log("Transferred ownership to DAO", tx.hash);

    // Save the artifacts to tenderly for further inspection, monitoring, and debugging
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
