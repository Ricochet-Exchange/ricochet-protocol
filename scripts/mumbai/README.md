# Scripts for Mumbai 
This is documentation of the Hardhat scripting that was used to do the Mumbai Deployment

## Hardhat Configuraiton for Deployment
Confirm that the `hardhat.config.ts` is configured for this network.

## Using Tenderly RPC
Rather than deploy the contracts to Mumbai, it's recommended to fork the network using Tenderly. This will allow you to test the deployment scripts without spending any real testnet MATIC. Also gives us the ability to adjust our wallets MATIC balance (no need for facuets).

## Deployed Contracts
This is a summary of the contracts that were deployed with the scripts in this directory. 

| Contract Name | Contract Address | Deployment Script |
|---------------|------------------|-------------------|
| Ricochet DAO | 0x9d7254F07b4De4643B409B5971eE2888E279417F | NA |
| Ricochet (RIC) | 0xDCf9273075A29F0070d5cB4632814367CE4350aE | NA |
| REX Market: fUSDC>>fDAI |  | `./deploy_rex_market.ts` | 
| REX Market: fDAI>>fUSDC |  | `./deploy_rex_market.ts` |


## Deployment Workflow
Begin with deploying a stablecoin-stablecoin pairing for easy benchmarking:
### fUSDC>>fDAI
```shell
INPUT_TOKEN=0x42bb40bF79730451B11f6De1CbA222F17b87Afd7 \
INPUT_TOKEN_UNDERLYING=0xbe49ac1EadAc65dccf204D4Df81d650B50122aB2 \
OUTPUT_TOKEN=0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f \
OUTPUT_TOKEN_UNDERLYING=0x15F0Ca26781C3852f8166eD2ebce5D18265cceb7 \
PRICE_FEED=0x0000000000000000000000000000000000000000 \
UNISWAP_POOL_FEE=100 \
npx hardhat run scripts/mumbai/deploy_rex_market.ts --network tenderly
```
### fDAI>>fUSDC
```shell
INPUT_TOKEN=0x42bb40bF79730451B11f6De1CbA222F17b87Afd7 \
INPUT_TOKEN_UNDERLYING=0xbe49ac1EadAc65dccf204D4Df81d650B50122aB2 \
OUTPUT_TOKEN=0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f \
OUTPUT_TOKEN_UNDERLYING=0x15F0Ca26781C3852f8166eD2ebce5D18265cceb7 \
PRICE_FEED=0x0000000000000000000000000000000000000000 \
UNISWAP_POOL_FEE=100 \
npx hardhat run scripts/mumbai/deploy_rex_market.ts --network tenderly
```