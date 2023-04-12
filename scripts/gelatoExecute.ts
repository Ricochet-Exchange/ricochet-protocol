import axios from 'axios';
import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

// Impersonate gelato ops executor and trigger `distribute`

const REXMARKET_CONTRACT_ADDRESS = "0xFfE64Adb721D4251e05a14e6F3BbeA83f7478465"; // The rex market to trigger
// Pulled using Tenderly 
const GELATO_BLOCK_TIMESTAMP = 1680119601; // The block timestamp the contract was deployed at
const GELATO_FEE = "10000000";
const { TENDERLY_USERNAME, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY } = process.env;
const SIMULATE_API = `https://api.tenderly.co/api/v1/account/${TENDERLY_USERNAME}/project/${TENDERLY_PROJECT}/simulate`



async function main() {

  // Get the current network from hardhat
  // const network = await ethers.provider.getNetwork();
  // Get the right constants for the network
  const config = Constants['maticmum'];
  console.log("Using this for config:", config);
  
  // Get the REX Market
  const REXUniswapV3Market = await ethers.getContractFactory("REXUniswapV3Market");
  const rexMarket = await REXUniswapV3Market.attach(REXMARKET_CONTRACT_ADDRESS);

  // Impersonate Gelato Network and Ops
  const gelatoNetwork = await ethers.provider.getSigner(config.GELATO_NETWORK);
  const ops = await ethers.getContractAt("Ops", config.GELATO_OPS);

  // Setup gelato executor exec and module data
  let encodedArgs = ethers.utils.defaultAbiCoder.encode(
      ["uint128", "uint128"],
      [GELATO_BLOCK_TIMESTAMP, 60]
  );
  let execData = rexMarket.interface.encodeFunctionData("distribute", ['0x', false]);
  let moduleData = {
      modules: [1],
      args: [encodedArgs],
  };

  // Build transaction
  const TX_DATA = await ops.populateTransaction["exec"](
    rexMarket.address,
    rexMarket.address,
    execData,
    moduleData,
    GELATO_FEE,
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", 
    false, // true if payed with treasury
    true
  );
  console.log("TX_DATA:", TX_DATA);

  console.log( "Executing Gelato Task",
    rexMarket.address,
    rexMarket.address,
    execData,
    moduleData,
    GELATO_FEE,
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", 
    false, // true if payed with treasury
    true
  )
 
  const transaction = {
    network_id: '80001',
    from: config.GELATO_NETWORK,
    input: TX_DATA.data,
    to: config.GELATO_OPS,
    block_number: null,
    save: true
  }

  console.log("Transaction:", transaction);

  const opts = {
      headers: {
          'X-Access-Key': process.env.TENDERLY_ACCESS_KEY || "",
      }
  }
 await axios.post(SIMULATE_API, transaction, opts)
  .then(function (response) {
    // handle success
    console.log("Success");
  })
  .catch(function (error) {
    // handle error
    console.log("error:", error);
  });

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
