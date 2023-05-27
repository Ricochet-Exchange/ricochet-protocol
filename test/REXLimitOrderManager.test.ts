import { waffle, ethers } from 'hardhat'
import { Signer } from "ethers";
import { expect } from "chai";
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { setup, IUser, ISuperToken } from '../misc/setup'
import { Framework, SuperToken } from '@superfluid-finance/sdk-core'
import { REXUniswapV3Market, REXReferral__factory, REXUniswapV3Market__factory } from '../typechain-types'
import { Constants } from '../misc/Constants'
import { timeStamp } from 'console';


const { deployMockContract, provider } = waffle
const config = Constants['polygon']

describe("REXLimitOrderManager", function () {
    let adminSigner: SignerWithAddress
    let aliceSigner: SignerWithAddress
    let bobSigner: SignerWithAddress
    let usdcxWhaleSigner: SignerWithAddress
    let ethxWhaleSigner: SignerWithAddress
    let rexLimitOrderManager: any;

    let ricochetUSDCx: SuperToken
    let ricochetETHx: SuperToken
    let ricochetWBTCx: SuperToken
    let ricochetRIC: SuperToken
    let ricochetRexSHIRT: SuperToken

    let sf: Framework,
        superT: ISuperToken,
        u: { [key: string]: IUser },
        market: REXUniswapV3Market,
        tokenss: { [key: string]: any },
        sfRegistrationKey: any,
        accountss: SignerWithAddress[],
        constant: { [key: string]: string },
        ERC20: any

    beforeEach(async function () {
        const { superfluid, users, accounts, tokens, superTokens, contracts, constants } = await setup()
        accountss = accounts;

        u = users
        sf = superfluid
        superT = superTokens
        tokenss = tokens
        accountss = accounts
        constant = constants

        adminSigner = accountss[0]
        aliceSigner = accountss[1]
        bobSigner = accountss[2]
        usdcxWhaleSigner = accountss[5]
        ethxWhaleSigner = accountss[6]

        ricochetUSDCx = superT.usdcx
        ricochetETHx = superT.ethx
        ricochetWBTCx = superT.wbtcx
        ricochetRIC = superT.ric

        const REXLimitOrderManager = await ethers.getContractFactory("REXLimitOrderManager");
        rexLimitOrderManager = await REXLimitOrderManager.deploy(config.GELATO_OPS, adminSigner.address);

        await rexLimitOrderManager.deployed();
        
    });
    
    describe("createLimitOrder", function () {
        
        it("should create a new limit order", async function () {
            const mockedREXMarket = await deployMockContract(adminSigner, REXUniswapV3Market__factory.abi);
            await mockedREXMarket.mock.inputToken.returns(ricochetUSDCx.address);
            
            await ricochetUSDCx.authorizeFlowOperatorWithFullControl({
                flowOperator: rexLimitOrderManager.address,
            }).exec(aliceSigner);

            const data = await ricochetUSDCx.getFlowOperatorData({
                sender: aliceSigner.address,
                flowOperator: rexLimitOrderManager.address,
                providerOrSigner: aliceSigner,
            });
            
            console.log("Data :", data);

            await rexLimitOrderManager.connect(aliceSigner).createLimitOrder(mockedREXMarket.address, false, 1000, 2000, 1795170912);
            const limitOrder = await rexLimitOrderManager.limitOrders(aliceSigner.address, mockedREXMarket.address);

            expect(limitOrder.isInverted).to.be.false;
            expect(limitOrder.streamRate).to.equal(1000);
            expect(limitOrder.price).to.equal(2000);
            expect(limitOrder.executed).to.be.false;
            expect(limitOrder.ttl).to.equal(1795170912);
        });

        it("should revert if not operator for the user", async function () {
            const mockedREXMarket = await deployMockContract(adminSigner, REXUniswapV3Market__factory.abi);
            await mockedREXMarket.mock.inputToken.returns(ricochetUSDCx.address);

            await expect(rexLimitOrderManager.connect(aliceSigner).createLimitOrder(mockedREXMarket.address, true, 1000, 2000, 3600))
                .to.be.revertedWith("ACL");
        });
    });

    // describe("cancelLimitOrder", function () {
    //     it("should cancel a limit order", async function () {

    //         await rexLimitOrderManager.createLimitOrder(marketAddress, true, 1000, 2000, 3600);

    //         await rexLimitOrderManager.cancelLimitOrder(marketAddress);

    //         const limitOrder = await rexLimitOrderManager.limitOrders(user1.address, marketAddress);

    //         expect(limitOrder.taskId).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
    //     });
    // });

    // describe("updateUserStream", function () {
    //     it("should update the user's stream", async function () {
    //         const marketAddress = await getMarketAddress(); // Replace with your own logic to get the market address

    //         await rexLimitOrderManager.createLimitOrder(marketAddress, true, 1000, 2000, 3600);

    //         await rexLimitOrderManager.updateUserStream(user1.address, marketAddress);

    //         const limitOrder = await rexLimitOrderManager.limitOrders(user1.address, marketAddress);

    //         expect(limitOrder.executed).to.be.true;
    //     });
    // });

});
