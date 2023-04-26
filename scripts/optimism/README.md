# Scripts for Optimism :o2: 
This is documentation of the Hardhat scripting that was used to do the Optimism Deployment

## Hardhat Configuraiton for Deployment
Confirm that the `hardhat.config.ts` is configured for this network.

## Deployed Contracts
This is a summary of the contracts that were deployed with the scripts in this directory. 

| Contract Name         | Contract Address                           |
|-----------------------|--------------------------------------------|
| Ricochet DAO          | 0x8e38Be5c136B3f7f05aD570c2996e43733418C4a | 
| Ricochet (RIC)        | 0x7abd51A15668308D3b42Cc1F6148Be8bdE939568 | 
| REX Shirt (rexSHIRT)  | 0x0942570634A80bcd096873afC9b112A900492fd7 | 
| REX Hat (rexHAT)      | 0xBaB5fF73925a1C205F8b2565B225AbF55c5D68a9 | 
| REX Launchpad         | 0x5C2E1A331678e1A9c6f8c156b5D48A5cC7e50cDa | 
| REX Referral          | 0xC79255821DA1edf8E1a8870ED5cED9099bf2eAAA |
| REX Market: USDC>>DAI | 0xd16DAc3C32498D231eA80a1D93Aea7A016762b91 | 
| REX Market: DAI>>USDC | 0x5f4919b2ed93b7d0ae686d42aa8a94d372640f78 | 
| REX Market: OP>>USDC  | 0xd139afb20e3c98472c82a992b6b1548280c41d3b |
| REX Market: USDC>>OP  | 0x9e5d41aab1db526ebb74e393a0d3bea25e7583ed |
| REX Market: DAI>>OP   | 0x6Cdd465096dC77E4184003c44b727877Db224a9D |
| REX Market: OP>>DAI   | 0xd245e7d9301d73247939baf954a17fdf49d0d7ff |
| REX Market: USDC>>ETH | 0xbabc9f466f87e1957b6732d333da2209ed80ef79 |
| REX Market: ETH>>USDC | TBD |
| REX Market: DAI>>ETH  | 0x091196943555d3e1513F7775ffA6b5779d3DefE9 |
| REX Market: ETH>>DAI  | TBD |
| REX Market: USDC>>WBTC  | 0x51b398BCe9d0D6619a2c9CFb4C6BbBB97A76eD49 | 
| REX Market: WBTC>>USDC  | 0x151F234140Ca257d3F8751D8982792c0A1576361 | 
| REX Market: DAI>>WBTC   | 0x91562e9163Da2a33241f4d6e2D5924a73D9dB24e | 
| REX Market: WBTC>>DAI   | 0xBd858C9e3a264a66609a7726A87A1DaFA4D4628D |
| REX Market: USDC>>wstETH | 
| WBTCx | 0x9638EC1D29dfA9835fdb7fa74B5B77B14d6Ac77e | 
| wstETHx | 0xAA6db004761858Dcd77CBc4a7bE98aC6a0635C8B |

## Launch Plan
### Phase 1: REX Referral System
The REX Referral System isn't dependant on other contracts so it goes out first. Deploy and verify it using these commands:
```shell
npx hardhat run scripts/optimism/01_referral.ts --network optimism
npx hardhat verify CONTRACT_ADDRESS --network optimism
```

## Phase 2: REX Tokens
There are 3 tokens that get deployed from superfluid-finance/custom-supertokens repo. Take the `02_rextokens.sh` script to that repo to execute it there.

## Phase 3: REX Launchpad
With tokens deployed we're ready to deploy the RIC Launchpad contract:
```shell
npx hardhat run scripts/optimism/03_deploy_launchpad.ts --network optimism
npx hardhat verify LAUNCHPAD_HELPER_LIB_ADDRESS --network optimism
npx hardhat verify LAUNCHPAD_CONTRACT_ADDRESS --network optimism \
--constructor-args ./scripts/optimism/args/03_deploy_launchpad.ts
```

## Phase 4: REX Market
Begin with deploying a stablecoin stablecoin pairing for easy benchmarking:
```shell    
npx hardhat run scripts/optimism/04_deploy_usdcdai_market.ts --network optimism
npx hardhat verify CONTRACT_ADDRESS --network optimism \
--constructor-args ./scripts/optimism/args/04_deploy_usdcdai_market.ts
```

## Phase 5: Additional Markets and Launchpads
Additional markets and launchpads can be deployed as needed. Use `05_deploy_rex_market.ts`:
```shell
    INPUT_TOKEN=0xAAAA \
    INPUT_TOKEN_UNDERLYING=0xBBBB \
    OUTPUT_TOKEN=0xCCCC \
    OUTPUT_TOKEN_UNDERLYING=0xDDDD \
    PRICE_FEED=0xFFFF \
    UNISWAP_POOL_FEE=500 \
    npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```
Then verify the markets:
```shell
npx hardhat verify CONTRACT_ADDRESS \
--constructor-args ./scripts/optimism/args/05_deploy_rex_market.ts \
--network optimism
```
Market should automatically be verified after you verify the first contract. 

# Rex Market Deploy Commands:
These commands were used to deploy the markets to Optimism.

## Stablecoin Pairs

### USDC>DAI:
```shell
INPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
INPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
OUTPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
OUTPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
PRICE_FEED=0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6 \
UNISWAP_POOL_FEE=500 \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### DAI>USDC:
```shell
INPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
INPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
OUTPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
OUTPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
PRICE_FEED=0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6 \
UNISWAP_POOL_FEE=500 \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

## Optimism (OP) Pairs

### USDC>OP:
```shell
INPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
INPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
OUTPUT_TOKEN=0x1828Bff08BD244F7990edDCd9B19cc654b33cDB4 \
OUTPUT_TOKEN_UNDERLYING=0x4200000000000000000000000000000000000042 \
PRICE_FEED=0x0D276FC14719f9292D5C1eA2198673d1f4269246 \
UNISWAP_POOL_FEE=500 \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### OP>USDC:
```shell
INPUT_TOKEN=0x1828Bff08BD244F7990edDCd9B19cc654b33cDB4 \
INPUT_TOKEN_UNDERLYING=0x4200000000000000000000000000000000000042 \
OUTPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
OUTPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
PRICE_FEED=0x0D276FC14719f9292D5C1eA2198673d1f4269246 \
UNISWAP_POOL_FEE=500 \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### DAI>OP:
```shell
INPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
INPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
OUTPUT_TOKEN=0x1828Bff08BD244F7990edDCd9B19cc654b33cDB4 \
OUTPUT_TOKEN_UNDERLYING=0x4200000000000000000000000000000000000042 \
PRICE_FEED=0x0D276FC14719f9292D5C1eA2198673d1f4269246 \
UNISWAP_POOL_FEE=500 \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### OP>DAI:
```shell
INPUT_TOKEN=0x1828Bff08BD244F7990edDCd9B19cc654b33cDB4  \
INPUT_TOKEN_UNDERLYING=0x4200000000000000000000000000000000000042 \
OUTPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
OUTPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
PRICE_FEED=0x0D276FC14719f9292D5C1eA2198673d1f4269246 \
UNISWAP_POOL_FEE=500 \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

## Ethereum (ETH) Pairs
### USDC>ETH:
```shell
INPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
INPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
OUTPUT_TOKEN=0x4ac8bD1bDaE47beeF2D1c6Aa62229509b962Aa0d \
OUTPUT_TOKEN_UNDERLYING=0x4200000000000000000000000000000000000006 \
PRICE_FEED=0x13e3Ee699D1909E989722E753853AE30b17e08c5 \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=false \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### ETH>USDC:
```shell
INPUT_TOKEN=0x4ac8bD1bDaE47beeF2D1c6Aa62229509b962Aa0d \
INPUT_TOKEN_UNDERLYING=0x4200000000000000000000000000000000000006 \
OUTPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
OUTPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
PRICE_FEED=0x13e3Ee699D1909E989722E753853AE30b17e08c5 \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=true \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### DAI>ETH:
```shell
INPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
INPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
OUTPUT_TOKEN=0x4ac8bD1bDaE47beeF2D1c6Aa62229509b962Aa0d \
OUTPUT_TOKEN_UNDERLYING=0x4200000000000000000000000000000000000006 \
PRICE_FEED=0x13e3Ee699D1909E989722E753853AE30b17e08c5 \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=false \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### ETH>DAI:
```shell
INPUT_TOKEN=0x4ac8bD1bDaE47beeF2D1c6Aa62229509b962Aa0d  \
INPUT_TOKEN_UNDERLYING=0x4200000000000000000000000000000000000006 \
OUTPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
OUTPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
PRICE_FEED=0x13e3Ee699D1909E989722E753853AE30b17e08c5 \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=true \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

## Wrapped Bitcoin (WBTC) Pairs
### USDC>WBTC:
```shell
INPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
INPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
OUTPUT_TOKEN=0x9638EC1D29dfA9835fdb7fa74B5B77B14d6Ac77e \
OUTPUT_TOKEN_UNDERLYING=0x68f180fcCe6836688e9084f035309E29Bf0A2095 \
PRICE_FEED=0x718A5788b89454aAE3A028AE9c111A29Be6c2a6F \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=false \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### WBTC>USDC:
```shell
INPUT_TOKEN=0x9638EC1D29dfA9835fdb7fa74B5B77B14d6Ac77e \
INPUT_TOKEN_UNDERLYING=0x68f180fcCe6836688e9084f035309E29Bf0A2095 \
OUTPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
OUTPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
PRICE_FEED=0x718A5788b89454aAE3A028AE9c111A29Be6c2a6F \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=true \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### DAI>WBTC:
```shell
INPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
INPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
OUTPUT_TOKEN=0x9638EC1D29dfA9835fdb7fa74B5B77B14d6Ac77e \
OUTPUT_TOKEN_UNDERLYING=0x68f180fcCe6836688e9084f035309E29Bf0A2095 \
PRICE_FEED=0x718A5788b89454aAE3A028AE9c111A29Be6c2a6F \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=false \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### WBTC>DAI:
```shell
INPUT_TOKEN=0x9638EC1D29dfA9835fdb7fa74B5B77B14d6Ac77e  \
INPUT_TOKEN_UNDERLYING=0x68f180fcCe6836688e9084f035309E29Bf0A2095 \
OUTPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
OUTPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
PRICE_FEED=0x718A5788b89454aAE3A028AE9c111A29Be6c2a6F \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=true \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

## Wrapped Lido Staked ETH (wstETH) Pair
### USDC>wstETH:
```shell
INPUT_TOKEN=0x8430f084b939208e2eded1584889c9a66b90562f \
INPUT_TOKEN_UNDERLYING=0x7F5c764cBc14f9669B88837ca1490cCa17c31607 \
OUTPUT_TOKEN=0xAA6db004761858Dcd77CBc4a7bE98aC6a0635C8B \
OUTPUT_TOKEN_UNDERLYING=0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb \
PRICE_FEED=0x718A5788b89454aAE3A028AE9c111A29Be6c2a6F \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=false \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```

### DAI>>wstETH
```shell
INPUT_TOKEN=0x7d342726b69c28d942ad8bfe6ac81b972349d524 \
INPUT_TOKEN_UNDERLYING=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
OUTPUT_TOKEN=0xAA6db004761858Dcd77CBc4a7bE98aC6a0635C8B \
OUTPUT_TOKEN_UNDERLYING=0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb \
PRICE_FEED=0x718A5788b89454aAE3A028AE9c111A29Be6c2a6F \
UNISWAP_POOL_FEE=500 \
INVERTED_PRICE_FEED=false \
npx hardhat run scripts/optimism/05_deploy_rex_market.ts --network tenderly
```
