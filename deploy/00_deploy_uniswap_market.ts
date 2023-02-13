import { Constants } from "../misc/Constants";

// Deployment for REXUniswapV3Market, includes REXReferral deployment as well

// Constants for Optimism Network
const HOST_SUPERFLUID_ADDRESS = "0x567c4B141ED61923967cA25Ef4906C8781069a10";
const CFA_SUPERFLUID_ADDRESS = "0x204C6f131bb7F258b2Ea1593f5309911d8E458eD";
const IDA_SUPERFLUID_ADDRESS = "0xc4ce5118C3B20950ee288f086cb7FC166d222D4c";
const USDCX_ADDRESS = "0x8430f084b939208e2eded1584889c9a66b90562f";
const ETHX_ADDRESS = "0x4ac8bd1bdae47beef2d1c6aa62229509b962aa0d";
// DAIx will be used for RIC on the Optimism network for testing
const DAIX_ADDRESS = "0x7d342726b69c28d942ad8bfe6ac81b972349d524";
// Gelato Automate Contract Address
const GELATO_OPS = "0x340759c8346A1E6Ed92035FB8B6ec57cE1D82c2c";
const UNISWAP_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
// Uniswap SwapRouter02
const UNISWAP_V3_ROUTER_ADDRESS = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy, execute} = deployments;
  const {deployer} = await getNamedAccounts();

  console.log("Deploying with account:", deployer);
  console.log("Deployer address:", );

  // Get the network we're using and log it
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name);

  //// Deployments
  let deployment: any;

  // REXReferral
  deployment = await deploy('REXReferral', {
    from: deployer,
    log: true,
  });
  // Get the contract object just deployed
  const referralContract = await ethers.getContractAt('REXReferral', deployment.address);
  console.log("Deployed RexReferral ("+ deployment.address +") with txn:", deployment.receipt.transactionHash);
  
  // REXUniswapV3Market
  deployment = await deploy('REXUniswapV3Market', {
    from: deployer,
    args: [
      deployer.toString(),
      Constants.HOST_SUPERFLUID_ADDRESS,
      Constants.CFA_SUPERFLUID_ADDRESS,
      Constants.IDA_SUPERFLUID_ADDRESS,
      Constants.SF_REG_KEY,
      Constants.REX_REFERRAL_ADDRESS,
      Constants.GELATO_OPS,
      deployer.toString()
    ],
    log: true,
    gasLimit: 10000000,
  });
  // Get the contract object just deployed
  const marketContract = await ethers.getContractAt('REXUniswapV3Market', deployment.address);
  console.log("Deployed REXUniswapV3Market ("+ deployment.address +") with txn:", deployment.receipt.transactionHash);

  //// Setup Transactions
  let tx: any;

  // Initialize the market using execute 
  tx = await execute(
    'REXUniswapV3Market',
    {from: deployer, log: true},
    'initializeMarket',
    Constants.USDCX_ADDRESS,
    Constants.ETHX_ADDRESS,
    Constants.RIC_TOKEN_ADDRESS,
    10000,
    20000,
    "1500000000000000000000", // Initial price pulled from coingecko manually
    20000
  );

  // Create task using execute
  tx = await execute(
    'REXUniswapV3Market',
    {from: deployer, log: true},
    'createTask'
  );

  // Initialize Uniswap V3
  tx = await execute(
    'REXUniswapV3Market',
    {from: deployer, log: true},
    'initializeUniswap',
    Constants.UNISWAP_V3_ROUTER_ADDRESS, 
    Constants.UNISWAP_V3_FACTORY_ADDRESS,
    [Constants.USDC_ADDRESS, Constants.ETH_ADDRESS],
    [500]
  );

  // Register market with referral with execute
  tx = await execute(
    'REXReferral',
    {from: deployer, log: true},
    'registerApp',
    marketContract.address
  );
  
  // TODO: Create affiliate 
  // Affiliates will need to be setup manually
  // referral = await referral.connect(carl);
  // await referral.applyForAffiliate("carl", "carl");
  // referral = await referral.connect(owner);
  // await referral.verifyAffiliate("carl");
  
  // Transfer ownership with execute
  tx = await execute(
    'REXUniswapV3Market',
    {from: deployer, log: true},
    'transferOwnership',
    Constants.GNOSIS_SAFE_ADDRESS
  );

};
module.exports.tags = ['MyContract'];