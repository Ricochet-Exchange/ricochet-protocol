import { ethers } from "hardhat";
import { Constants } from "../../misc/Constants"

async function main() {

    // Get the current network from hardhat
    const network = await ethers.provider.getNetwork();
    // Get the right constants for the OP network
    const config = Constants['optimism'];
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
        { gasLimit: 10000000 } // Force deploy even if estimate gas fails
    );
    await market.deployed();
    console.log("REXUniswapV3Market deployed to:", market.address);

    // Initialize WMATIC and MATICx
    let tx: any;
    tx = await market.initializeMATIC(config.WMATIC_ADDRESS, config.MATICX_ADDRESS);
    await tx.wait();
    console.log("Initialized WMATIC and MATICx", tx.hash);

    // Create the Gelato task that will be used to execute the market
    tx = await market.createTask();
    await tx.wait();
    console.log("Created Gelato task", tx.hash);

    // Set up for the USDC>>DAI market initialization
    let inputTokenAddress = config.USDCX_ADDRESS;
    let inputTokenUnderlyingAddress = config.USDC_ADDRESS;
    let outputTokenAddress = config.DAIX_ADDRESS;
    let outputTokenUnderlyingAddress = config.DAI_ADDRESS;

    tx = await market.initializeMarket(
        inputTokenAddress,
        outputTokenAddress,
        config.RIC_ADDRESS,
        config.SHARE_SCALER,
        config.FEE_RATE,
        config.INITIAL_PRICE,
        config.RATE_TOLERANCE,
        { gasLimit: 10000000 }
    );
    await tx.wait();
    console.log("Initialized market", tx.hash);


    // Log the config values for the network we are initialize on this market
    await market.initializeUniswap(
        config.UNISWAP_V3_ROUTER_ADDRESS,
        config.UNISWAP_V3_FACTORY_ADDRESS,
        [inputTokenUnderlyingAddress, outputTokenUnderlyingAddress],
        config.UNISWAP_POOL_FEE,
        { gasLimit: 10000000 }
    );
    await tx.wait();
    console.log("Initialized Uniswap", tx.hash);

    console.log("Registering with RexReferral system...")
    const REXReferral = await ethers.getContractFactory("REXReferral");
    const referral = await REXReferral.attach(config.REX_REFERRAL_ADDRESS);
    tx = await referral.registerApp(market.address);
    await tx.wait();
    console.log("Registered with RexReferral system", tx.hash);

    tx = await market.transferOwnership(config.GNOSIS_SAFE_ADDRESS); // 1e15/second
    await tx.wait();
    console.log("Transferred ownership to Gnosis Safe", tx.hash);

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
