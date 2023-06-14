import { ethers } from "hardhat";
import { Constants } from "../../misc/Constants"

async function main() {

    // Get the right constants for the network we are deploying on
    const config = Constants['polygon'];

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
    const INVERTED_PRICE_FEED = process.env.INVERTED_PRICE_FEED;

    // Log all the config values for the network we are initialize on this market
    console.log("HOST_SUPERFLUID_ADDRESS:", config.HOST_SUPERFLUID_ADDRESS);
    console.log("CFA_SUPERFLUID_ADDRESS:", config.CFA_SUPERFLUID_ADDRESS);
    console.log("IDA_SUPERFLUID_ADDRESS:", config.IDA_SUPERFLUID_ADDRESS);
    console.log("SF_REG_KEY:", config.SF_REG_KEY);
    console.log("GELATO_OPS:", config.GELATO_OPS);

    // Prompt the user to continue after checking the config
    console.log("Verify these parameters. Then press any key to continue the deployment...");
    await new Promise(resolve => process.stdin.once("data", resolve));

    // Deploy REXMarketV4
    console.log("Deploying REXMarketV4")
    const REXMarketV4 = await ethers.getContractFactory("REXMarketV4");

    // Get the contract at 0x3704F394Ba325b1CF739851410ef309e8EE7Ac4f
    const market = await REXMarketV4.attach("0x3704F394Ba325b1CF739851410ef309e8EE7Ac4f");

    // const market = await REXMarketV4.deploy(
    //     config.HOST_SUPERFLUID_ADDRESS,
    //     config.CFA_SUPERFLUID_ADDRESS,
    //     config.IDA_SUPERFLUID_ADDRESS,
    //     config.SF_REG_KEY,
    //     config.GELATO_OPS,
    //     // { gasLimit: 10000000 } // Force deploy even if estimate gas fails
    // );
    // await market.deployed();
    // console.log("REXMarketV4 deployed to:", market.address);

    // // Log the config values for the network we are initializeMATIC
    // // TODO: This varies on MATIC network
    // console.log("WMATIC_ADDRESS:", config.WMATIC_ADDRESS);
    // console.log("MATICX_ADDRESS:", config.MATICX_ADDRESS);

    // // Prompt the user to continue after checking the config
    // console.log("Verify these parameters. Then press any key to continue the deployment...");
    // await new Promise(resolve => process.stdin.once("data", resolve));

    // // Initialize WMATIC and MATICx
    // let tx: any;
    // tx = await market.initializeMATIC(config.WMATIC_ADDRESS, config.MATICX_ADDRESS);
    // await tx.wait();
    // console.log("Initialized WMATIC and MATICx", tx.hash);

    // // Create the Gelato task that will be used to execute the market
    // tx = await market.createTask();
    // await tx.wait();
    // console.log("Created Gelato task (does not have any input parameters)", tx.hash);

    // // Log the config values for the network we are initialize on this market
    // console.log("INPUT_TOKEN:", INPUT_TOKEN);
    // console.log("OUTPUT_TOKEN:", OUTPUT_TOKEN);

    // // Prompt the user to continue after checking the config
    // console.log("Verify these parameters. Then press any key to continue the deployment...");
    // await new Promise(resolve => process.stdin.once("data", resolve));

    // // Set up for the USDC>>DAI market initialization
    // tx = await market.initializeMarket(
    //     INPUT_TOKEN,
    //     OUTPUT_TOKEN,
    //     { gasLimit: 10000000 }
    // );
    // await tx.wait();
    // console.log("Initialized market", tx.hash);

    // // Log the config values for the network we are initialize on this market
    // console.log("UNISWAP_V3_ROUTER_ADDRESS:", config.UNISWAP_V3_ROUTER_ADDRESS);
    // console.log("UNISWAP_V3_FACTORY_ADDRESS:", config.UNISWAP_V3_FACTORY_ADDRESS);
    // console.log("UNISWAP_POOL_FEE:", UNISWAP_POOL_FEE);
    // console.log("INPUT_TOKEN_UNDERLYING:", INPUT_TOKEN_UNDERLYING);
    // console.log("OUTPUT_TOKEN_UNDERLYING:", OUTPUT_TOKEN_UNDERLYING);

    // await market.initializeUniswap(
    //     config.UNISWAP_V3_ROUTER_ADDRESS,
    //     config.UNISWAP_V3_FACTORY_ADDRESS,
    //     [INPUT_TOKEN_UNDERLYING, config.REX_TOKEN_ADDRESS, OUTPUT_TOKEN_UNDERLYING],
    //     [UNISWAP_POOL_FEE,UNISWAP_POOL_FEE],
    //     { gasLimit: 10000000 }
    // );
    // await tx.wait();
    // console.log("Initialized Uniswap", tx.hash);

    // Initialize the price feed
    let tx = await market.initializePriceFeed(PRICE_FEED, false);
    await tx.wait();
    console.log("Initialized price feed", tx.hash);

    // Save the artifacts to tenderly for further inspection, monitoring, and debugging
    await hre.tenderly.persistArtifacts({
        name: "REXMarketV4",
        address: market.address,
    });

}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
