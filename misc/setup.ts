
import { ethers } from "hardhat";
import { impersonateAccounts } from "./helpers";
import SuperfluidSDK  from "@superfluid-finance/js-sdk";
import "@nomiclabs/hardhat-web3";

import SuperfluidGovernanceBase  from '@superfluid-finance/ethereum-contracts/build/contracts/SuperfluidGovernanceII.json';
import TellorPlayground from 'usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json';
import RexMarket from 'path to rexmarket ABI';
import RexOneWayMarket from 'path to rex one way market ABI';
import RexSushiMarket from 'path to sushi market ABI'

// NOTE: It is essential to pass in a Deployer into the contracts for initialization
// This is because when we are testing the emit, the passed in contract expects a
// provider and will throw an error if this doesn't exist.

const OWNER_ADDRESS = "0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA";
const ALICE_ADDRESS = "0x9f348cdD00dcD61EE7917695D2157ef6af2d7b9B";
const BOB_ADDRESS = "0x00Ce20EC71942B41F50fF566287B811bbef46DC8";
const CARL_ADDRESS = "0x8c3bf3EB2639b2326fF937D041292dA2e79aDBbf";

const USDCX_SOURCE_ADDRESS = "0xA08f80dc1759b12fdC40A4dc64562b322C418E1f";
const SF_RESOLVER="0xE0cc76334405EE8b39213E620587d815967af39C";
const RIC_TOKEN_ADDRESS = "0x263026E7e53DBFDce5ae55Ade22493f828922965";

export const setup = async () => {
    const users: any = {};
    const tokens: any = {};
    const superTokens: any = {};
    const contracts: any = {};
    const addresses: any = [OWNER_ADDRESS,ALICE_ADDRESS,CARL_ADDRESS,BOB_ADDRESS, RIC_TOKEN_ADDRESS];

    const accountAddrs = [OWNER_ADDRESS, ALICE_ADDRESS, BOB_ADDRESS, CARL_ADDRESS, USDCX_SOURCE_ADDRESS];
    const accounts = await impersonateAccounts(accountAddrs);
    const names = ['admin', 'alice', 'bob', 'carl', 'spender'];

    // Initialize superfluid sdk
    const superfluid = new SuperfluidSDK.Framework({
        web3,
        resolverAddress: SF_RESOLVER,
        tokens: ['WBTC', 'DAI', 'USDC', 'ETH'],
        version: 'v1',
    });
    await superfluid.initialize();

    // Declare supertokens as ERC 20 contraxts
    superTokens.ethx = superfluid.tokens.ETHx;
    superTokens.wbtcx = superfluid.tokens.WBTCx;
    superTokens.daix = superfluid.tokens.DAIx;
    superTokens.usdcx = superfluid.tokens.USDCx;


    // Declare all users for transactions (usdcx)
    for (let i = 0; i < names.length; i += 1) {
        users[names[i].toLowerCase()] = superfluid.user({
            address: accounts[i].address,
            token: superTokens.usdcx.address,
        });
        users[names[i].toLowerCase()].alias = names[i];
    }
    
    // Decalare ERC 20 tokens
    tokens.ric = await ethers.getContractAt('ERC20', RIC_TOKEN_ADDRESS, users.admin);
    tokens.weth = await ethers.getContractAt('ERC20', await superTokens.ethx.getUnderlyingToken());
    tokens.wbtc = await ethers.getContractAt('ERC20', await superTokens.wbtcx.getUnderlyingToken());
    tokens.usdc = await ethers.getContractAt('ERC20', await superTokens.usdcx.getUnderlyingToken());
    
    function getContract(){

    }

    function deployContracts(contract){
        switch(contract){
            case "REXMarket":
                break;
            
            case ""
        }

    }

    return {
        superfluid,
        users,
        tokens,
        superTokens,
        contracts,
        addresses,
        getContract,
        deployContracts,
    };
};