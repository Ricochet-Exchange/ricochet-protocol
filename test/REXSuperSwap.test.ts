import { waffle, ethers } from "hardhat";
import { setup, IUser, ISuperToken } from "../misc/setup";
import { common } from "../misc/common";
import { expect } from "chai";
import { HttpService } from "./../misc/HttpService";
import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TellorPlayground, REXTwoWayMarket, REXReferral, ERC20, REXReferral__factory, IConstantFlowAgreementV1 } from "../typechain";
import { increaseTime, impersonateAndSetBalance } from "./../misc/helpers";
import { Constants } from "../misc/Constants";
import { AbiCoder, parseUnits } from "ethers/lib/utils";

const { provider, loadFixture } = waffle;
const TEST_TRAVEL_TIME = 3600 * 2; // 2 hours
// Index 1 is for Ether and 0 for USDCx
const USDCX_SUBSCRIPTION_INDEX = 0;
const ETHX_SUBSCRIPTION_INDEX = 1;
const RIC_SUBSCRIPTION_INDEX = 2;
const ORACLE_PRECISION_DIGITS = 1000000;    // A six-digit precision is required by the Tellor oracle

export interface superTokenAndItsIDAIndex {
    token: SuperToken;
    IDAIndex: number;
}

describe('REXSuperSwap', () => {
 
    const errorHandler = (err: any) => {
        if (err) throw err;
    };

    
    const subsidyRate = "10000000000000";

    let rexSuperSwap: any;
    let REXMarketFactory: any;
    let superSwap: any;
    let snapshot: any;

    let adminSigner: SignerWithAddress;
    let aliceSigner: SignerWithAddress;
    let bobSigner: SignerWithAddress;
    let carlSigner: SignerWithAddress;
    let usdcxWhaleSigner: SignerWithAddress;
    let ethxWhaleSigner: SignerWithAddress;
    let maticxWhaleSigner: SignerWithAddress;
    let karenSigner: SignerWithAddress;

    let oraclePrice: number;
    let ricOraclePrice: number;
    let maticOraclePrice: number;

    let sf: Framework,
        superT: ISuperToken,
        u: { [key: string]: IUser },
        tokenss: { [key: string]: any },
        sfRegistrationKey: any,
        accountss: SignerWithAddress[],
        constant: { [key: string]: string },
        tp: TellorPlayground,
        ERC20: any;

    // ************** All the supertokens used in Ricochet are declared **********************
    let ricochetMATICx: SuperToken;
    let ricochetUSDCx: SuperToken;
    let ricochetETHx: SuperToken;
    let ricochetWBTCx: SuperToken;
    let ricochetRIC: SuperToken;

    let usdcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ethxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let ricAndItsIDAIndex: superTokenAndItsIDAIndex;
    let wbtcxAndItsIDAIndex: superTokenAndItsIDAIndex;
    let maticxAndItsIDAIndex: superTokenAndItsIDAIndex;

  before(async () => {
    const {
        superfluid,
        users,
        accounts,
        tokens,
        superTokens,
        contracts,
        constants,
        tellor,
    } = await setup();
    console.log("============ Right after initSuperfluid() ==================");

    const { createSFRegistrationKey } = await common();

    u = users;
    sf = superfluid;
    superT = superTokens;
    tokenss = tokens;
    accountss = accounts;
    sfRegistrationKey = createSFRegistrationKey;
    constant = constants;
    tp = tellor;

    // This order is established in misc/setup.ts
    adminSigner = accountss[0];
    aliceSigner = accountss[1];
    bobSigner = accountss[2];
    carlSigner = accountss[3];
    karenSigner = accountss[4];
    usdcxWhaleSigner = accountss[5];
    ethxWhaleSigner = accountss[6];
    maticxWhaleSigner = accountss[7];

    ricochetMATICx = superT.maticx;
    ricochetUSDCx = superT.usdcx;
    ricochetETHx = superT.ethx;
    ricochetWBTCx = superT.wbtcx;
    ricochetRIC = superT.ric;

    usdcxAndItsIDAIndex = {
        token: ricochetUSDCx,
        IDAIndex: USDCX_SUBSCRIPTION_INDEX,
    }
    ethxAndItsIDAIndex = {
        token: ricochetETHx,
        IDAIndex: ETHX_SUBSCRIPTION_INDEX,
    }
    ricAndItsIDAIndex = {
        token: ricochetRIC,
        IDAIndex: RIC_SUBSCRIPTION_INDEX,
    }

    // ==============================================================================
    const registrationKey = await sfRegistrationKey(sf, adminSigner.address);
    console.log("============ Right after sfRegistrationKey() ==================");

    console.log("======******** List of addresses =======");
    for (let i = 0; i < accountss.length; i++) {
        console.log("Address number ", i, ": ", accountss[i].address);
    }
    console.log("++++++++++++++ alice address number: ", aliceSigner.address);
    console.log("++++++++++++++ bob address number: ", bobSigner.address);
    console.log("++++++++++++++ carl address number: ", carlSigner.address);

    console.log("======******** List of TOKENS addresses =======");
    console.log("======** usdc's address: ", ricochetUSDCx.address);
    // ==============================================================================
    let whaleEthxBalance = await ricochetETHx.balanceOf({
        account: Constants.ETHX_SOURCE_ADDRESS, providerOrSigner: provider
    });
    console.log("WHALE's Balance in ETHX: ", whaleEthxBalance);

    // ==============================================================================

    // Deploy REXSuperSwap
    console.log("Deploying REXSuperSwap...");
    rexSuperSwap = await ethers.getContractFactory("RexSuperSwap", {
        signer: adminSigner,
    });
    superSwap = await rexSuperSwap.deploy("0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45");
    await superSwap.deployed();
    console.log("=========== Deployed REXSuperSwap ============");
    console.log("RexSuperSwap deployed to:", superSwap.address);

    // // send the contract some RIC
    // try {
    //     await ricochetRIC.transfer({
    //         receiver: twoWayMarket.address,
    //         amount: "1000000000000000000"
    //     }).exec(adminSigner);
    // } catch (err: any) {
    //     console.log("Ricochet - ERROR transferring RICs to the contract: ", err);
    // }
    // console.log("============ RICs have been sent to the contract =============");
    // await checkBalance(adminSigner, "the contract");

    console.log("=======================================================================");
    console.log("================ End of \"before\" block ==============================");
    console.log("=======================================================================");

    // Give Alice, Bob, Karen some tokens
    const initialAmount = ethers.utils.parseUnits("1000", 18).toString();
    await ricochetUSDCx
        .transfer({
            receiver: aliceSigner.address,
            amount: initialAmount,
        }).exec(usdcxWhaleSigner);
    console.log("====== Transferred to alice =======");
    await ricochetETHx
        .transfer({
            receiver: bobSigner.address,
            amount: ethers.utils.parseUnits("0.5", 18).toString(),
        }).exec(ethxWhaleSigner);
        console.log("ETH")
    await ricochetRIC
        .transfer({
            receiver: bobSigner.address,
            amount: '1000000000000000000000',
        }).exec(adminSigner);
        console.log("RIC")
    await ricochetMATICx
        .transfer({
            receiver: bobSigner.address,
            amount: '1754897259852523432',
        }).exec(maticxWhaleSigner);
        console.log("MATIC")
    console.log("====== Transferred to bob =======");
    await ricochetUSDCx
        .transfer({
            receiver: karenSigner.address,
            amount: initialAmount,
        }).exec(usdcxWhaleSigner);
    console.log("====== Transferred to karen =======");

    // Take a snapshot to avoid redoing the setup
    snapshot = await provider.send('evm_snapshot', []);

});


context("#1 Test swap functionality", async () => {

  it("#1.1 User can swap token", async () => {
      // Test swap functionality here

    });
  });

})