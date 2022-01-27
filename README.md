# Rex Markets

This project has all the smart contracts used by the [ricochet exchange application](https://app.ricochet.exchange). 

## Tasks

- Compile the Solidity code 
```
npx hardhat compile
```

- Run all the test cases included in a file
```
npx hardhat test test/bankFactory.ts
```

- Run all the test cases included in a file and reports the code coverage on a web page inside the *coverage* directory
```
npx hardhat coverage --testfiles test/bankFactory.ts
```
Coverage runs tests a little more slowly, **distorts gas consumption** and contracts are compiled **without optimization**.
More info [here](https://github.com/sc-forks/solidity-coverage/).

- Other tasks
```
npx eslint '**/*.js'
npx eslint '**/*.js' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

# Etherscan verification

To try out Etherscan verification, you first need to deploy a contract to an Ethereum network that's supported by Etherscan, such as Ropsten.

In this project, copy the .env.example file to a file named .env, and then edit it to fill in the details. Enter your Etherscan API key, your Ropsten node URL (eg from Alchemy), and the private key of the account which will send the deployment transaction. With a valid .env file in place, first deploy your contract:

```shell
hardhat run --network ropsten scripts/deploy.js
```

Then, copy the deployment address and paste it in to replace `DEPLOYED_CONTRACT_ADDRESS` in this command:

```shell
npx hardhat verify --network ropsten DEPLOYED_CONTRACT_ADDRESS "Hello, Hardhat!"
```

# Rex-bank

This is Ricochet project for managing fixed-rate collateral-backed lending on Ethereum. This repository contains the core smart contracts and the tests written in *Typescript* using the framework *hardhat* and the *ethers* library.
A role-based access is now used in the Rex Bank.
The modifiers in the *reserveDeposit* and *reserveWithdrawCollateral* functions have been commented, because the old tests were written when the access was simple (admin and users).

The linter points out some code improvements:
- some error messages are too long.
- *block.timestamp* and related functions should not be used to make time calculations.
- Mark visibility of state variables in *BankStorage.sol*.

#### Current state of the code

Two test cases are failing:
- *should not allow user to withdraw collateral from vault if undercollateralized* 
- *should add origination fee to a vault's borrowed amount*

Both with the same message error: 
*Error: VM Exception while processing transaction: reverted with reason string 'NOT ENOUGH COLLATERAL'*

The 'should calculate correct collateralization ratio for a user\'s vault' and 'should liquidate undercollateralized vault' test cases are commented, because they interact with the oracle and it has to be mocked. 
However, the code has been rewritten in ethers, except for the *web3.eth.sendTransaction* function. 

## Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).


## Design Considerations

- **Transparency:** The contract code is simple enough to understand by anyone familiar with Solidity

- **Flexibility:** The type of collateral, debt, and rates can all be configured

- **Easy of Use:** Deployment and configuration is simple enough for anyone familiar with Ethereum and web programming

# Smart Contract Summary
On deployment, the bank _owner_ specifies the following parameters:

* **Debt Token:** This is the token users borrow from the bank (i.e. USDC)
* **Collateral Token:** This is the token the bank accepts as collateral (i.e. TRB)
* **Interest Rate:** The annual interest rate the bank charges borrowers
* **Origination Fee:** The fixed fee charged to borrowers
* **Collateralization Ratio:** The loan-to-value amount borrowers must maintain to avoid a liquidation
* **Liquidation Penalty:** The fixed fee charged to borrowers who get liquidated
* **Period:** The period for calculating interest in seconds

Once deployed, the bank owner must deposit some debt tokens into the bank's reserve. After depositing debt tokens, users can deposit collateral tokens and borrow the bank's debt tokens. During the borrow, the borrower is charged an origination fee and then interest will accumulate until they repay what they've borrowed plus interest and fees. If at anytime the price of the collateral falls, then the bank owner will liquidate the borrowers collateral to repay their debt.

## Local Development 
As of December 2021, the project was migrated from Truffle to *hardhat version 2.8.0.* and *waffle*
Solidity version changed from 0.5.0 to >=0.8.4.

Tools used for testing
- node version 16.6.1 and npm version 7.2.0.3. 
- All the tests are written in *Typescript* 4.5.2. 
- *ethers* version 5.5.2 and Chai matchers. 

### Compiling
```
npx hardhat compile
```
### Testing
```
npx hardhat test
```
### Generating the json files
```
npm run build
```


## Deployment
For deployment on localhost, testnet or mainnet, edit the parameters you're interested in using. An example configuration:
```
let daiAddress = "0x5592EC0cfb4dbc12D3aB100b257153436a1f0FEa";
let trbAddress = "0xfe41cb708cd98c5b20423433309e55b53f79134a";
let tellorOracleAddress = "0xFe41Cb708CD98C5B20423433309E55b53F79134a";
let interestRate = 12;
let originationFee = 1;
let collateralizationRatio = 150;
let liquidationPenalty = 20;
let period = 86400;
let trbusdRequestId = 50;
let daiusdRequestId = 39;
let initialPrice = 1000000;
let priceGranularity = 1000000;

await deployer.deploy(Bank, interestRate, originationFee, collateralizationRatio, liquidationPenalty, period,
                      trbAddress, trbusdRequestId, initialPrice, priceGranularity,
                      daiAddress, daiusdRequestId, initialPrice, priceGranularity,
                      tellorOracleAddress);
```
Replace the values with those you wish to use for your bank deployment and visit the `Bank.sol` constructor for more details about these parameters.


## Local Development (deprecated)
First, `truffle migrate` the contract to deploy to Ganache, then setup the contract using `truffle console`.

From the console, approve and deposit debt tokens (i.e. `USDToken`) into the bank's reserve.
```
let bank = await Bank.deployed()
let dt = await USDToken.deployed()
let accounts = await web3.eth.getAccounts()
await dt.approve(bank.address, web3.utils.toWei("1000", "ether"), {from: accounts[0]})
await bank.reserveDeposit(web3.utils.toWei("1000", "ether"), {from: accounts[0]})
```

## Running the DApp (deprecated)
You can start the DApp using npm:
```
export PORT=3000
npm run dev
```

## Working with the Tellor Oracle on Localhost (deprecated)
Initialize the oracle objects and get accounts:
```
let oracle = await TellorMaster.deployed()
let oracleAddress = (web3.utils.toChecksumAddress(oracle.address))
let oracle2 = await new web3.eth.Contract(Tellor.abi, oracleAddress)
let accounts = await web3.eth.getAccounts()
```
Then make a request to the oracle:
```
await web3.eth.sendTransaction({to: oracleAddress, from: accounts[0], gas: 4000000, data: oracle2.methods.requestData("USDT","USDT/USD",1000,0).encodeABI()})
```
Next, submit 5 values through mining:
```
await web3.eth.sendTransaction({to: oracle.address, from: accounts[1],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
await web3.eth.sendTransaction({to: oracle.address, from: accounts[2],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
await web3.eth.sendTransaction({to: oracle.address, from: accounts[3],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
await web3.eth.sendTransaction({to: oracle.address, from: accounts[4],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
await web3.eth.sendTransaction({to: oracle.address, from: accounts[5],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
```
Because the Bank contract is UsingTellor, you can get the current data from the oracle using:
```
let vars = await bank.getCurrentValue.call(1)
```
And the price will be contained in `vars[1]`.

And you can update the price with:
```
await bank.updatePrice({from: accounts[0]})
```

## Testing (deprecated)
There are unit tests for the smart contract functionality which you can run using:
```
truffle test
```
## Smoke Testing After Deployment
In addition to the unit tests, you can run these tests manually after the contract has been deployed to confirm everything works correctly through the DApp:

- [ ] Update the debt and collateral token prices
- [ ] As the owner, deposit debt tokens
- [ ] As a borrower, deposit collateral and withdraw some debt
- [ ] - Borrow and repay debt
- [ ] - Add and remove collateral
- [ ] - Repay all the debt and withdraw all collateral
- [ ] With a borrower undercollateralized, liquidate the borrower
- [ ] As the owner, withdraw collateral and debt

