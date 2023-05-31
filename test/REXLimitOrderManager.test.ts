import { waffle, ethers } from 'hardhat'
import { Signer } from 'ethers'
import { expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { setup, IUser, ISuperToken } from '../misc/setup'
import { Framework, SuperToken } from '@superfluid-finance/sdk-core'
import { REXUniswapV3Market, REXReferral__factory, REXUniswapV3Market__factory } from '../typechain-types'
import { Constants } from '../misc/Constants'
import { timeStamp } from 'console'

const { deployMockContract, provider } = waffle
const config = Constants['polygon']

describe('REXLimitOrderManager', function () {
    let adminSigner: SignerWithAddress
    let aliceSigner: SignerWithAddress
    let bobSigner: SignerWithAddress
    let usdcxWhaleSigner: SignerWithAddress
    let ethxWhaleSigner: SignerWithAddress
    let rexLimitOrderManager: any

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
        accountss = accounts

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

        const REXLimitOrderManager = await ethers.getContractFactory('REXLimitOrderManager')
        rexLimitOrderManager = await REXLimitOrderManager.deploy(config.GELATO_OPS, adminSigner.address)

        await rexLimitOrderManager.deployed()
    })

    describe('createLimitOrder', function () {
        it('should create a new limit order', async function () {
            const mockedREXMarket = await deployMockContract(adminSigner, REXUniswapV3Market__factory.abi)
            await mockedREXMarket.mock.inputToken.returns(ricochetUSDCx.address)

            await ricochetUSDCx
                .authorizeFlowOperatorWithFullControl({
                    flowOperator: rexLimitOrderManager.address,
                })
                .exec(aliceSigner)

            await rexLimitOrderManager
                .connect(aliceSigner)
                .createLimitOrder(mockedREXMarket.address, false, 1000, 2000, 1795170912)
            const limitOrder = await rexLimitOrderManager.limitOrders(aliceSigner.address, mockedREXMarket.address)

            expect(limitOrder.isInverted).to.be.false
            expect(limitOrder.streamRate).to.equal(1000)
            expect(limitOrder.price).to.equal(2000)
            expect(limitOrder.executed).to.be.false
            expect(limitOrder.ttl).to.equal(1795170912)
        })

        it('should revert if not operator for the user', async function () {
            const mockedREXMarket = await deployMockContract(adminSigner, REXUniswapV3Market__factory.abi)
            await mockedREXMarket.mock.inputToken.returns(ricochetUSDCx.address)

            await expect(
                rexLimitOrderManager.connect(aliceSigner).createLimitOrder(mockedREXMarket.address, true, 1000, 2000, 3600)
            ).to.be.revertedWith('ACL')
        })
    })

    describe("cancelLimitOrder", function () {
        it("should cancel a limit order", async function () {

            const mockedREXMarket = await deployMockContract(adminSigner, REXUniswapV3Market__factory.abi)
            await mockedREXMarket.mock.inputToken.returns(ricochetUSDCx.address)

            await ricochetUSDCx
                .authorizeFlowOperatorWithFullControl({
                    flowOperator: rexLimitOrderManager.address,
                })
                .exec(aliceSigner)

            await rexLimitOrderManager
                .connect(aliceSigner)
                .createLimitOrder(mockedREXMarket.address, false, 1000, 2000, 1795170912)
            const limitOrder = await rexLimitOrderManager.limitOrders(aliceSigner.address, mockedREXMarket.address)


            await rexLimitOrderManager.connect(aliceSigner).cancelLimitOrder(mockedREXMarket.address);

            const limitOrderCancelled = await rexLimitOrderManager.limitOrders(aliceSigner.address, mockedREXMarket.address);

            expect(limitOrder.streamRate).to.equal(1000)
            expect(limitOrder.price).to.equal(2000)
            expect(limitOrderCancelled.streamRate).to.equal("0");
            expect(limitOrderCancelled.price).to.equal("0");
            expect(limitOrderCancelled.taskId).to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
        });
    });

      describe("updateUserStream", function () {
          it("should start the user's stream", async function () {
            const mockedREXMarket = await deployMockContract(adminSigner, REXUniswapV3Market__factory.abi)
            await mockedREXMarket.mock.inputToken.returns(ricochetUSDCx.address)
            await mockedREXMarket.mock.getLatestPrice.returns(180078594776) // 1800.78594776 USDC / ETH

            await ricochetUSDCx.transfer({ receiver: aliceSigner.address, amount: "1000000000000000000" }).exec(usdcxWhaleSigner);

            await ricochetUSDCx
                .authorizeFlowOperatorWithFullControl({
                    flowOperator: rexLimitOrderManager.address,
                })
                .exec(aliceSigner)

            let timeStamp = 1785460337; // time in 2026

            await rexLimitOrderManager
                .connect(aliceSigner)
                .createLimitOrder(mockedREXMarket.address, false, 10000, 190078594776, timeStamp)
            
            const checker = await rexLimitOrderManager.connect(aliceSigner).checker(aliceSigner.address, mockedREXMarket.address);
            await rexLimitOrderManager.connect(adminSigner).updateUserStream(aliceSigner.address, mockedREXMarket.address); 
            const limitOrder = await rexLimitOrderManager.limitOrders(aliceSigner.address, mockedREXMarket.address)

            const aliceNetFlow = await ricochetUSDCx.cfaV1.getFlow({ superToken: ricochetUSDCx.address, sender: aliceSigner.address, receiver: mockedREXMarket.address, providerOrSigner: aliceSigner });

            expect(limitOrder.streamRate).to.equal(10000)
            expect(checker[0]).to.equal(true)
            expect(limitOrder.executed).to.equal(true)
            expect(aliceNetFlow.flowRate).to.equal("10000")

          });

          it ("should stop the users stream if price is greater", async function () {
            const mockedREXMarket = await deployMockContract(adminSigner, REXUniswapV3Market__factory.abi)
            await mockedREXMarket.mock.inputToken.returns(ricochetUSDCx.address)
            await mockedREXMarket.mock.getLatestPrice.returns(180078594776) // 1800.78594776 USDC / ETH

            await ricochetUSDCx.transfer({ receiver: aliceSigner.address, amount: "1000000000000000000" }).exec(usdcxWhaleSigner);

            await ricochetUSDCx
                .authorizeFlowOperatorWithFullControl({
                    flowOperator: rexLimitOrderManager.address,
                })
                .exec(aliceSigner)

            let timeStamp = 1785460337; // time in 2026

            await rexLimitOrderManager
                .connect(aliceSigner)
                .createLimitOrder(mockedREXMarket.address, false, 10000, 190078594776, timeStamp)
            
            const checker = await rexLimitOrderManager.connect(aliceSigner).checker(aliceSigner.address, mockedREXMarket.address);
            await rexLimitOrderManager.connect(adminSigner).updateUserStream(aliceSigner.address, mockedREXMarket.address); 
            const limitOrder = await rexLimitOrderManager.limitOrders(aliceSigner.address, mockedREXMarket.address)

            const aliceNetFlow = await ricochetUSDCx.cfaV1.getFlow({ superToken: ricochetUSDCx.address, sender: aliceSigner.address, receiver: mockedREXMarket.address, providerOrSigner: aliceSigner });

            expect(limitOrder.streamRate).to.equal(10000)
            expect(checker[0]).to.equal(true)
            expect(limitOrder.executed).to.equal(true)
            expect(aliceNetFlow.flowRate).to.equal("10000")

            await mockedREXMarket.mock.getLatestPrice.returns(200078594776) // 2000.78594776 USDC / ETH

            const checkerAfter = await rexLimitOrderManager.connect(aliceSigner).checker(aliceSigner.address, mockedREXMarket.address);
            expect(checkerAfter[0]).to.equal(true)
            await rexLimitOrderManager.connect(adminSigner).updateUserStream(aliceSigner.address, mockedREXMarket.address);

            const aliceNetFlowAfter = await ricochetUSDCx.cfaV1.getFlow({ superToken: ricochetUSDCx.address, sender: aliceSigner.address, receiver: mockedREXMarket.address, providerOrSigner: aliceSigner });

            expect(aliceNetFlowAfter.flowRate).to.equal("0")

          });
      });
})
