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
| REX Market: DAI>>USDC | TBD | 


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
Additional markets and launchpads can be deployed as needed. The `05_deploy_usdc_market.ts` script can be used as a template for other markets. Launchpads can be deployed using the `03_deploy_launchpad.ts` script.

