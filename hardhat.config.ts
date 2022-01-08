import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-web3';
import '@nomiclabs/hardhat-ethers';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-contract-sizer';
import "hardhat-gas-reporter";
import '@nomiclabs/hardhat-etherscan';
import 'solidity-coverage';
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
        url: process.env.POLYGON_NODE_URL,
        accounts: [process.env.POLYGON_PRIVATE_KEY],
        enabled: true,
        blockNumber: 22877930
      },
    },
    polygon: {
      url: process.env.POLYGON_NODE_URL,
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