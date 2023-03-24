import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
// This adds support for typescript paths mappings
// import "tsconfig-paths/register";

import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import "@nomiclabs/hardhat-ethers";
// import "@openzeppelin/hardhat-upgrades";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "solidity-coverage";
require("hardhat-tracer");
dotenv.config();

import * as tdly from "@tenderly/hardhat-tenderly";
tdly.setup();

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.13",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  // // About the gas reporter options ---> https://github.com/cgewecke/eth-gas-reporter/blob/master/README.md
  // gasReporter: {
  //   currency: "USD",
  //   token: "MATIC",
  //   gasPriceApi:
  //     "https://api.polygonscan.com/api?module=proxy&action=eth_gasPrice",
  //   rst: true,      // Output with a reStructured text code-block directive
  //   rstTitle: true, // "Gas Usage",
  //   showTimeSpent: true,
  // },
  networks: {
    hardhat: {
      forking: {
        url: process.env.POLYGON_NODE_URL || "",
        accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
        enabled: true, 
        chainId: 10,
      },
    },
    polygon: {
      url: process.env.POLYGON_NODE_URL,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      blockGasLimit: 20000000,
    },
    maticmum: {
      url: process.env.MUMBAI_NODE_URL,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      blockGasLimit: 20000000,
    },
    localhost: {
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      url: 'http://127.0.0.1:8545/'
    },
    tenderly: {
      chainId: 80001,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      url: process.env.TENDERLY_NODE_URL,
    },
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
  tenderly: {
    username: process.env.TENDERLY_USERNAME, 
    project: "ricochet",
    forkNetwork: "137", 
    privateVerification: false,
  },
  plugins: ["solidity-coverage"],
  namedAccounts: {
    deployer: {
        default: "0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA", // here this will by default take the first account as deployer
        "localhost": '0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA', // but for rinkeby it will be a specific address
    },
    // TODO: Alice, Bob, Carl, Karen
  }
};

export default config;
