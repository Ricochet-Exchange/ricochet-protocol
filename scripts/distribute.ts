import { ethers } from "hardhat";

// const {
//   web3tx,
// } = require('@decentral.ee/web3-helpers');
// const SuperfluidSDK = require('@superfluid-finance/js-sdk');

const REXMARKET_CONTRACT_ADDRESS = "0x1cb1E93a485f6dd87a835B68A504173AaEC9Ab52";

async function main() {

  const REXUniswapV3Market = await ethers.getContractFactory("REXUniswapV3Market");
  const rexMarket = await REXUniswapV3Market.attach(REXMARKET_CONTRACT_ADDRESS);


  const [deployer] = await ethers.getSigners();

  console.log("Address:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // console.log("Update Prices...")
  // let tx = await rexMarket.updateTokenPrices();
  // consol.log(tx);
  // console.log("Updated Prices")

  console.log('Distributing...');
  let tx = await rexMarket.distribute("0x", true, {gasLimit: 10000000});
  console.log(tx)
  console.log('Distributed');

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
