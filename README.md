# Ricochet Exchange Protocol
![Ricochet Exchange](images/ricochet-exchange.gif)
**_Effortless Real-time Crypto Investing_**

Ricochet puts power in the hands of passive investors

* **Streaming** - Stream your money into a variety of crypto assets, from ETH and BTC to yield-bearing LP positions. Using Superfluid, it just takes one transaction to set off a perpetual Ricochet investment stream.

* **Non-custodial** - As long as your stream token's balance is above zero, your investment stream carries on. This means you're free to do other cool crypto stuff with your money all while your investment stream runs.

* **Responsible** - Why buy at a couple prices when you can buy at every price. Ricochet lets you take on price risk gradually instead of in lumps. Kick back, relax, and forget about the FOMO and overtrading

## Developer Quickstart
1. Set required environment variables for Hardhat in a `.env` file:
```
cp env.example .env
vi .env
```
2. Run a contract `REXTwoWayMarket.test.js`
```
npx hardhat test test/REXTwoWayMarket.test.js
```
The test uses mainnet forking to test against the current Polygon mainnet state. This can take a while depending on your RPC provider.
3. If tests pass, use `scripts/deploy-rextwowaymarket.js` to deploy:
```
npx hardhat run scripts/deploy-rextwowaymarket.js --network polygon
```
Edit the inputs in `scripts/deploy-rextwowaymarket.js` based on the type of REX Market you want to deploy.
4. Verify the contract on Polygonscan:
```
npx hardhat verify 0xAAAA....AAAA --network polygon --constructor-args scripts/arguments.js
