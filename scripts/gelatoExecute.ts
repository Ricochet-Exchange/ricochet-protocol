import axios from 'axios';
import { ethers } from "hardhat";
import { Constants } from "../misc/Constants"

// Impersonate gelato ops executor and trigger `distribute`

const REXMARKET_CONTRACT_ADDRESS = "0xb2301310f630EfBcD68a1FA4c49F9CF658db888E"; // The rex market to trigger
// Pulled using Tenderly 
const GELATO_BLOCK_TIMESTAMP = 1678325685; // The block timestamp the contract was deployed at
const GELATO_FEE = 100000;
const { TENDERLY_USERNAME, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY } = process.env;
const SIMULATE_API = `https://api.tenderly.co/api/v1/account/${TENDERLY_USERNAME}/project/${TENDERLY_PROJECT}/simulate`



async function main() {

  // Get the REX Market
  const REXUniswapV3Market = await ethers.getContractFactory("REXUniswapV3Market");
  const rexMarket = await REXUniswapV3Market.attach(REXMARKET_CONTRACT_ADDRESS);

  // Impersonate Gelato Network and Ops
  const gelatoNetwork = await ethers.provider.getSigner(Constants.GELATO_NETWORK);
  const ops = await ethers.getContractAt("Ops", Constants.GELATO_OPS);

  // Setup gelato executor exec and module data
  let encodedArgs = ethers.utils.defaultAbiCoder.encode(
      ["uint128", "uint128"],
      [GELATO_BLOCK_TIMESTAMP, 60]
  );
  let execData = rexMarket.interface.encodeFunctionData("distribute", ["0x"]);
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
 
  const transaction = {
    network_id: '1',
    from: '0x7598e84B2E114AB62CAB288CE5f7d5f6bad35BbA',
    input: '0xad558ab9000000000000000000000000b2301310f630efbcd68a1fa4c49f9cf658db888e000000000000000000000000b2301310f630efbcd68a1fa4c49f9cf658db888e0000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000186a0000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000044c12fc38b0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000640937b5000000000000000000000000000000000000000000000000000000000000003c',
    to: '0x527a819db1eb0e34426297b03bae11F2f8B3A19E',
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
    console.log("response:", response);
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
