const {
  web3tx,
} = require('@decentral.ee/web3-helpers');
const SuperfluidSDK = require('@superfluid-finance/js-sdk');


const REXMARKET_CONTRACT_ADDRESS = "0x58Db2937B08713214014d2a579C3088db826Fad1";


async function main() {

  const REXOneWayMarket = await ethers.getContractFactory("REXOneWayMarket");
  const rexMarket = await REXOneWayMarket.attach(REXMARKET_CONTRACT_ADDRESS);


  const [deployer] = await ethers.getSigners();

  console.log("Address:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  console.log('Distributing...');
  await rexMarket.distribute("0x");
  console.log('Distributed');

}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
