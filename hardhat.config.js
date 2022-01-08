require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-web3');
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('hardhat-contract-sizer');
require("hardhat-gas-reporter");
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');
require('dotenv').config();

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.4',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://polygon-mainnet.infura.io/v3/2b9bbe1f8fc742e38062b09a2e40a3e6`,
        accounts: [process.env.POLYGON_PRIVATE_KEY],
        enabled: true 
      },
    },
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/2b9bbe1f8fc742e38062b09a2e40a3e6`,
      accounts: [process.env.POLYGON_PRIVATE_KEY],
      blockGasLimit: 20000000,
      gasPrice: 35000000000 // 35 Gwei
    }
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
};
