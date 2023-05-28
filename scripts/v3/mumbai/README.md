# Scripts for Optimism :o2: 
This is documentation of the Hardhat scripting that was used to do the Optimism Deployment

## Hardhat Configuraiton for Deployment
Confirm that the `hardhat.config.ts` is configured for this network.

## Deployed Contracts
This is a summary of the contracts that were deployed with the scripts in this directory. 

| Contract Name | Contract Address | Deployment Script |
|---------------|------------------|-------------------|
| Ricochet DAO | 0x9d7254F07b4De4643B409B5971eE2888E279417F | NA |
| Ricochet (RIC) | 0xDCf9273075A29F0070d5cB4632814367CE4350aE | `./02_rextokens.sh` |
| REX Shirt (rexSHIRT) | 0x3997918224f980FF933f8922d1aCcc26463eD702 | `./02_rextokens.sh` |
| REX Hat (rexHAT) | 0xea3003b77f1c36318Ac50069Fc33D1793Ce416b9 | `./02_rextokens.sh` |
| REX Launchpad | 0xd6cf77c9bc69181ab859b5fc963d769cf2e2c2af | `./03_deploy_launcpad.sh` |
| REX Referral | 0x24239b083143759C8920Ba56d76Be36CD70DE490 | `./01_referral.ts` |
| REX Market: USDC>>DAI | 0xFfE64Adb721D4251e05a14e6F3BbeA83f7478465 | `./04_deploy_usdcdai_market.ts` | 
| REX Market: DAI>>USDC | 0x69a26022DCE8c0d05ede33339FeB23e5292b1cc8 | `./05_deploy_daiusdc_market.ts` |


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

