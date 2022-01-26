import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-ethers";    // JR
import "@openzeppelin/hardhat-upgrades";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

dotenv.config();


// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

let ricochetPrice = "/coins/{ polygon-pos}/contract/{ 0x263026e7e53dbfdce5ae55ade22493f828922965 }";
// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  // About the gas reporter options ---> https://github.com/cgewecke/eth-gas-reporter/blob/master/README.md
  gasReporter: {
    currency: "USD",
    // gasPrice: 100,
    gasPrice: 100,
    token: "MATIC",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || undefined,
    gasPriceApi:
      "https://api.polygonscan.com/api?module=proxy&action=eth_gasPrice",
    // onlyCalledMethods: false,
    // noColors: true,
    rst: true,      // Output with a reStructured text code-block directive
    rstTitle: true, // "Gas Usage",
    showTimeSpent: true,
    excludeContracts: ["CollateralToken", "DebtToken"],
    // proxyResolver: "EtherRouter",   // Custom method to resolve identity of methods managed by a proxy contract.
    // codechecks: true,
    // showMethodSig: true   // Display complete method signatures. Useful when you have overloaded methods you can't tell apart.
    // enabled: process.env.REPORT_GAS ? true : false,
  },
  networks: {
    hardhat: {
       forking: {
         url: process.env.POLYGON_NODE_URL || '',
         //accounts: [process.env.POLYGON_PRIVATE_KEY],
         enabled: true,
       },
    },
    // polygon: {
    //   url: process.env.POLYGON_NODE_URL,
    //   accounts: [process.env.POLYGON_PRIVATE_KEY],
    //   blockGasLimit: 20000000,
    //   gasPrice: 35000000000 // 35 Gwei
    // }
  },
  mocha: {
    timeout: 0,
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.POLYGONSCAN_API_KEY,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },

  // Configuration from the old Rex-Bank repository
  // networks: {
  //   hardhat: {
      // forking: {
      //   url: `https://green-nameless-water.matic.quiknode.pro/${process.env.QUICKNODE_ENDPOINT}/`,
      // accounts: [process.env.MATIC_PRIVATE_KEY],
      // blockNumber: parseInt(`${process.env.FORK_BLOCK_NUMBER}`),
      // gasPrice: 50000000000,
      // network_id: 137,
  //   },
  // }
};

export default config;

