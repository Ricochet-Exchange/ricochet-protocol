import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { web3, ethers } from "hardhat";
import { Constants } from "../misc/Constants"
const CONSTANTS = Constants['polygon'];
const {
  web3tx,
} = require('@decentral.ee/web3-helpers');
const SuperfluidSDK = require('@superfluid-finance/js-sdk');


const RIC_CONTRACT_ADDRESS = CONSTANTS.RIC_TOKEN_ADDRESS;
const SF_RESOLVER = CONSTANTS.SF_RESOLVER;
const REXMARKET_CONTRACT_ADDRESS = "0xF6a03FCf12Cdc8066aFaf12255105CA301E15ba6";


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
    `${deployer.address} approves subscription to the app ${CONSTANTS.ETHX_ADDRESS} 0`,
  )(
    sf.agreements.ida.address,
    sf.agreements.ida.contract.methods
      .approveSubscription(CONSTANTS.ETHX_ADDRESS, REXMARKET_CONTRACT_ADDRESS, 1, '0x')
      .encodeABI(),
    '0x', // user data
    {
      from: deployer.address,
    },
  );
  console.log('Approved ETHx');
  await web3tx(
    sf.host.callAgreement,
    `${deployer.address} approves subscription to the app ${CONSTANTS.RIC_TOKEN_ADDRESS} 0`,
  )(
    sf.agreements.ida.address,
    sf.agreements.ida.contract.methods
      .approveSubscription(CONSTANTS.RIC_TOKEN_ADDRESS, REXMARKET_CONTRACT_ADDRESS, 3, '0x')
      .encodeABI(),
    '0x', // user data
    {
      from: deployer.address,
    },
  );
  console.log('Approved RIC');


}

async function approveSubscriptions(index: number, deployer: SignerWithAddress) {


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
