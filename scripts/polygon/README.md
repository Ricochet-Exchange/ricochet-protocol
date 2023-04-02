# Scripts for Optimism :o2: 
This is documentation of the Hardhat scripting that was used to do the Optimism Deployment

## Hardhat Configuraiton for Deployment
Confirm that the `hardhat.config.ts` is configured for this network.

## Deployed Contracts
This is a summary of the contracts that were deployed with the scripts in this directory. 

| Contract Name           | Contract Address                           |
|-------------------------|--------------------------------------------|
| Ricochet DAO            | 0x9C6B5FdC145912dfe6eE13A667aF3C5Eb07CbB89 | 
| Ricochet (RIC)          | 0x263026e7e53dbfdce5ae55ade22493f828922965 | 
| REX Shirt (rexSHIRT)    | 0x19ca69c66768b487d28226c0a60ab2b2aa8e5c5c | 
| REX Hat (rexHAT)        | 0xe91d640fcaea9602cf94c0d48a251a7f6d946953 | 
| REX Launchpad           | 0x98d463A3F29F259E67176482eB15107F364c7E18 | 
| REX Referral            | 0xA0eC9E1542485700110688b3e6FbebBDf23cd901 |
| REX Market: USDC>>DAI   | TBD | 
| REX Market: DAI>>USDC   | TBD | 
| REX Market: USDC>>ETH   | TBD | 
| REX Market: ETH>>USDC   | TBD | 
| REX Market: USDC>>MATIC | TBD | 
| REX Market: MATIC>>USDC | TBD | 
| REX Market: USDC>>WBTC  | TBD | 
| REX Market: WBTC>>USDC  | TBD | 


## REX Market Launch
- [ ] Run through this plan using a Tenderly fork of Polygon. 
- [ ] Verify that the Rex Pro and Rex Lite apps work as expected using the fork's RPC
- [ ] Deploy the contracts to Polygon
- [ ] Verify the contracts on Polygon

### Phase 1: Deploy USDC<>DAI markets
Use the deploy script to deploy a USDC>>DAI and DAI>>USDC market

USDC>>DAI:
```shell
    INPUT_TOKEN=0xCAa7349CEA390F89641fe306D93591f87595dc1F \
    INPUT_TOKEN_UNDERLYING=0x2791bca1f2de4661ed88a30c99a7a9449aa84174 \
    OUTPUT_TOKEN=0x1305F6B6Df9Dc47159D12Eb7aC2804d4A33173c2 \
    OUTPUT_TOKEN_UNDERLYING=0x8f3cf7ad23cd3cadbd9735aff958023239c6a063 \
    PRICE_FEED=0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7 \
    UNISWAP_POOL_FEE=500 \
    npx hardhat run scripts/polygon/deploy_rex_market.ts --network tenderly
```

DAI>>USDC:
```shell
    INPUT_TOKEN=0x1305F6B6Df9Dc47159D12Eb7aC2804d4A33173c2 \
    INPUT_TOKEN_UNDERLYING=0x8f3cf7ad23cd3cadbd9735aff958023239c6a063 \
    OUTPUT_TOKEN=0xCAa7349CEA390F89641fe306D93591f87595dc1F \
    OUTPUT_TOKEN_UNDERLYING=0x2791bca1f2de4661ed88a30c99a7a9449aa84174 \
    PRICE_FEED=0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D \
    UNISWAP_POOL_FEE=500 \
    npx hardhat run scripts/polygon/deploy_rex_market.ts --network tenderly
```

## Phase 2: Deploy USDC<>ETH/MATIC/WBTC markets
...

## Phase 3: Deploy USDC<>RIC markets
...

## Phase 4: REX Market
Begin with deploying a stablecoin stablecoin pairing for easy benchmarking:
```shell    
npx hardhat run scripts/optimism/04_deploy_usdcdai_market.ts --network optimism
npx hardhat verify CONTRACT_ADDRESS --network optimism \
--constructor-args ./scripts/optimism/args/04_deploy_usdcdai_market.ts
```

## Phase 5: Additional Markets and Launchpads
Additional markets and launchpads can be deployed as needed. The `05_deploy_usdc_market.ts` script can be used as a template for other markets. Launchpads can be deployed using the `03_deploy_launchpad.ts` script.

