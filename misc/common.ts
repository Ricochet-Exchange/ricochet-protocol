import { ethers } from "hardhat";
import { parseUnits } from "@ethersproject/units";

import { setup, IUser, ISuperToken } from "./setup";
import { impersonateAccounts } from "./helpers";
import { type } from "os";
import { constants } from "buffer";
const { defaultAbiCoder, keccak256 } = require("ethers/lib/utils");

const { web3tx, wad4human } = require("@decentral.ee/web3-helpers");
const SuperfluidGovernanceBase = require("../test/artifacts/superfluid/SuperfluidGovernanceII.json");

export const common = async () => {
  const { superfluid, users, tokens, superTokens, contracts } = await setup();

  const hostABI = [
    "function getGovernance() external view returns (address)",
    "function getSuperTokenFactory() external view returns(address)",
  ];

  async function createSFRegistrationKey(sf: any, deployerAddr: any) {
    console.log("address", deployerAddr);
    const host = await ethers.getContractAt(
      hostABI,
      sf.host.hostContract.address
    );
    const registrationKey = `testKey-${Date.now()}`;
    console.log("resigration ?? key", registrationKey);

    const encodedKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["string", "address", "string"],
        [
          "org.superfluid-finance.superfluid.appWhiteListing.registrationKey",
          deployerAddr,
          registrationKey,
        ]
      )
    );
    const governance: string = await host.getGovernance();
    const sfGovernanceRO = await ethers.getContractAt(
      SuperfluidGovernanceBase.abi,
      governance
    );
    const govOwner = await sfGovernanceRO.owner();
    const [govOwnerSigner] = await impersonateAccounts([govOwner]);
    const sfGovernance = await ethers.getContractAt(
      SuperfluidGovernanceBase.abi,
      governance,
      govOwnerSigner
    );
    //console.log("sf governance", sfGovernance.whiteListNewApp);
    await sfGovernance.whiteListNewApp(
      sf.host.hostContract.address,
      encodedKey
    );

    return registrationKey;
  }

  return { createSFRegistrationKey };
};