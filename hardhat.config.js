require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-web3');
require('@nomiclabs/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('hardhat-contract-sizer');
require('@nomiclabs/hardhat-etherscan');
require('solidity-coverage');
require('dotenv').config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.3',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  mocha: {
    timeout: 1e6,
  },
  networks: {
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      accounts: [process.env.MATIC_PRIVATE_KEY],
      gas: 2000000,
      gasPrice: 50000000000,
    },
    // kovan: {
    //   url: "https://kovan.infura.io/v3/" + process.env.INFURA_KEY,
    //   accounts: [process.env.PRIVATE_KEY],
    //   gas: 2000000,
    //   gasPrice: 2000000000
    // },
    hardhat: {
      forking: {
        url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
        accounts: [process.env.MATIC_PRIVATE_KEY],
        // blockNumber: 19403280
      },
    },
  },
  etherscan: {
    // Your API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.POLYSCAN_API_KEY,
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
};
