const {
  web3tx,
} = require('@decentral.ee/web3-helpers');
const SuperfluidSDK = require('@superfluid-finance/js-sdk');


const HOST_ADDRESS = "0x3E14dC1b13c488a8d5D310918780c983bD5982E7";
const CFA_ADDRESS = "0x6EeE6060f715257b970700bc2656De21dEdF074C";
const IDA_ADDRESS = "0xB0aABBA4B2783A72C52956CDEF62d438ecA2d7a1";
const RIC_CONTRACT_ADDRESS = "0x263026e7e53dbfdce5ae55ade22493f828922965";
const REXMARKET_CONTRACT_ADDRESS = "0x58Db2937B08713214014d2a579C3088db826Fad1";
const SF_RESOLVER = '0xE0cc76334405EE8b39213E620587d815967af39C';


async function main() {
  const sf = new SuperfluidSDK.Framework({
    web3,
    resolverAddress: SF_RESOLVER,
    tokens: ['USDC'],
    version: 'v1',
  });
  await sf.initialize();

  const [deployer] = await ethers.getSigners();

  console.log("Address:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  console.log('Approving subscriptions...');

  await web3tx(
    sf.host.callAgreement,
    `${deployer.address} approves subscription to the app ${RIC_CONTRACT_ADDRESS} 0`,
  )(
    sf.agreements.ida.address,
    sf.agreements.ida.contract.methods
      .approveSubscription(RIC_CONTRACT_ADDRESS, REXMARKET_CONTRACT_ADDRESS, 0, '0x')
      .encodeABI(),
    '0x', // user data
    {
      from: deployer.address,
    },
  );
  console.log('Approved.');

}

async function approveSubscriptions(index, deployer) {


}

main()
.then(() => process.exit(0))
.catch(error => {
    console.error(error);
    process.exit(1);
});
