import { expect } from "chai";

// // let usingTellor;
// // let sr; // Mock Sushi Router
// // const u = {}; // object with all users
// let ethSpender; // u: { [key: string]: IUser },
// let users: SignerWithAddress[] = [alice, bob, carl, karen, admin]; // object with all users
// interface UserAndAddress {
//     user: SignerWithAddress;
//     address: string;
//     alias?: string;
// };
// let usersAddresses: { [user: string]: string } = [        //alice.address, bob.address, carl.address, karen.address, admin.address];
// let aliceAndAddress: UserAndAddress = {
//     user: alice, address: alice.address,
// }
// let bobAndAddress: UserAndAddress = {
//     user: bob, address: bob.address,
// }
// let carlAndAddress: UserAndAddress = {
//     user: carl, address: carl.address,
// }
// let karenAndAddress: UserAndAddress = {
//     user: karen, address: karen.address,
// }
// let adminAndAddress: UserAndAddress = {
//     user: admin, address: admin.address,
// }
// let usersAndAddresses: UserAndAddress[] = [aliceAndAddress, bobAndAddress, carlAndAddress, karenAndAddress, adminAndAddress];

//     // ==============
//     // Init Superfluid Framework

//     // sf = new SuperfluidSDK.Framework({
//     //     web3,
//     //     resolverAddress: SF_RESOLVER,
//     //     tokens: ['WBTC', 'DAI', 'USDC', 'ETH'],
//     //     version: 'v1',
//     // });
//     // await sf.initialize();
//     // ethx = sf.tokens.ETHx;
//     // wbtcx = sf.tokens.WBTCx;
//     // daix = sf.tokens.DAIx;
//     // usdcx = sf.tokens.USDCx;
//     const superfluid = await Framework.create({
//         provider: provider,  // PROVIDER
//         resolverAddress: SF_RESOLVER,
//         networkName: "hardhat",
//         dataMode: "WEB3_ONLY",
//         protocolReleaseVersion: "v2"   // TODO It was v1
//     });


//     // ==============
//     // Init SF users

//     // for (let i = 0; i < names.length; i += 1) {
//     for (let i = 0; i < usersAndAddresses.length; i += 1) {
//         // Bob will be the ETHx streamer
//         if (usersAndAddresses[i].user == bob) { //}  .toLowerCase() == "bob") {
//             u[names[i].toLowerCase()] = sf.user({
//                 address: accounts[i]._address || accounts[i].address,
//                 token: ethx.address,
//             });
//         } else {
//             u[names[i].toLowerCase()] = sf.user({
//                 address: accounts[i]._address || accounts[i].address,
//                 token: usdcx.address,
//             });
//         }

//         u[names[i].toLowerCase()].alias = names[i];
//         // aliases[u[names[i].toLowerCase()].address] = names[i];
//         // usersAndAddresses[i].alias = usersAndAddresses[i].
//     }

//     // ==============
//     // NOTE: Assume the oracle is up to date
//     // Deploy Tellor Oracle contracts

//     const TellorPlayground = await ethers.getContractFactory('TellorPlayground');
//     tp = await TellorPlayground.attach(TELLOR_ORACLE_ADDRESS);
//     tp = tp.connect(owner);

//     // ==============
//     // Setup tokens

//     const ERC20 = await ethers.getContractFactory('ERC20');
//     let ric = await ERC20.attach(RIC_TOKEN_ADDRESS);
//     let weth = await ERC20.attach(await ethx.getUnderlyingToken());
//     let wbtc = await ERC20.attach(await wbtcx.getUnderlyingToken());
//     usdc = await ERC20.attach(await usdcx.getUnderlyingToken());
//     ric = ric.connect(owner);

//     // Attach alice to the SLP token
//     let outputx = ethx;
//     let output = await ERC20.attach(await outputx.getUnderlyingToken());

// });


xit("should not allow two streams", async () => {
    const inflowRateUsdc = "1000000000000000";
    const inflowRateEth = "10000000000000";
    const inflowRateIDASharesUsdc = "1000000";
    const inflowRateIDASharesEth = "10000";

    console.log("Transfer alice");
    await usdcx.connect(usdcSpender).transfer(alice.address, toWad(400));
    console.log("Transfer bob");
    await ethx.connect(ethSpender).transfer(alice.address, toWad(5)); //, { from: u.ethspender.address });
    console.log("Done");

    // await funcApproveSubscriptions([aliceAndAddress.address, bobAndAddress.address]);

    //     const flowRate = getPerSecondFlowRateByMonth("100");
    // try {
    //     framework.cfaV1.createFlow({
    //         flowRate,
    //         receiver: alpha.address + "0",
    //         superToken: superToken.address,
    //     });
    // } catch (err: any) {
    //     expect(err.message).to.eql(
    //         "Invalid Address Error - The address you have entered is not a valid ethereum address."
    //     );
    // }

    const txnResponse = (await sf).cfaV1
        .createFlow({
            sender: alice.address,
            flowRate: inflowRateUsdc,
            // receiver: u.app.address,
            receiver: app.address,
            superToken: usdcx.address
        }).exec(admin);  // (userAccounts["alice"]);
    const txnReceipt = (await txnResponse).wait();

    await expect(
        sf.cfaV1.createFlow({
            sender: alice.address,
            flowRate: inflowRateEth,
            receiver: u.app.address,
            superToken: ethx.address
        })
    ).to.be.revertedWith("Already streaming");
});

xit("should make sure subsidy tokens and output tokens are correct", async () => {
    // The token with feeRate != 0 is output token in this case that is ethx 
    // The token with emissionRate != 0 is subsidy token in this case that ric tokens. 
    // 0. Approve subscriptions
    await usdcx.connect(usdcSpender).transfer(alice.address, toWad(400).toString());
    //console.log("transfer?");
    //await ricx.transfer(u.app.address, toWad(400).toString(), { from: u.admin.address });
    //console.log("ric transfer");
    //checkBalance(u.bob);
    //checkBalance(u.alice);
    //checkBalance(u.spender);
    //checkBalance(u.admin);
    //console.log(toWad(10).toString());
    //await ethx.transfer(u.app.address, toWad(10).toString(), { from: u.bob.address });
    //console.log("ethx transfer");
    // await funcApproveSubscriptions();
    await (await sf).idaV1
        .approveSubscription({
            indexId: "0",
            superToken: superT.ethx.address,
            publisher: u.app.address,
            userData: "0x",
        })
        .exec(userAccounts["admin"]);

    // 1. Check balance for output and subsidy tokens and usdcx
    //await takeMeasurements();
    await checkBalance(alice);
    let myFlowRate = "77160493827160";

    // 2. Create a stream from an account to app to exchange tokens
    // let aliceBeforeBalance = parseInt(await ric.balanceOf(u.alice.address));
    let aliceBeforeBalance = await ric.balanceOf(alice.address);
    console.log(aliceBeforeBalance);   // NOTE: it"s a BigNumber

    const txnResponse = await sf.cfaV1
        .createFlow({
            sender: alice.address,
            flowRate: myFlowRate,
            receiver: u.app.address,
            superToken: ethx.address
        }).exec(userAccounts["admin"]);

    // 3. Increase time by 1 hour
    await increaseTime(60 * 60);
    await tp.submitValue(Constants.TELLOR_ETH_REQUEST_ID, oraclePrice);
    await tp.submitValue(Constants.TELLOR_USDC_REQUEST_ID, 1000000);
    await app.updateTokenPrice(usdcx.address);
    await app.updateTokenPrice(outputx.address);
    // 4. Stop the flow   AM ---> Why is the flow not stopped ?
    //await u.alice.flow({ flowRate: "0", recipient: u.app });
    let deltaAlice = await delta(alice, aliceBalances);
    console.log(deltaAlice);
    // 4. Distribute tokens 
    await checkBalance(alice);
    await app.distribute("0x");
    await checkBalance(alice);
    // 5. Check balance for output and subsidy tokens
    let ricEmissionRate = 10000000000000;
    let expectAliceRicRewards = 60 * 60 * ricEmissionRate;
    let aliceAfterBalance = await ric.balanceOf(alice.address);    // JR --> I removed the conversion to string
    console.log(aliceAfterBalance);
    let aliceBeforeBalanceInNumber: number = aliceBeforeBalance.toNumber();
    expect(aliceAfterBalance).to.within(
        (ethers.BigNumber.from(aliceBeforeBalanceInNumber + (expectAliceRicRewards * 0.999))).toNumber(),
        (ethers.BigNumber.from(aliceBeforeBalanceInNumber + (expectAliceRicRewards * 1.06))).toNumber()
    );
});

xit("should create a stream exchange with the correct parameters", async () => {
    const inflowRate = "77160493827160";
    const inflowRateIDAShares = "77160";

    console.log("Transfer alice");
    await usdcx.connect(usdcSpender).transfer(alice.address, toWad(400));
    console.log("Transfer bob");      // AM ---> ethspender or ethSpender 
    await ethx.connect(ethSpender).transfer(bob.address, toWad(5));
    console.log("Done");

    await approveSubscriptions([alice.address, bob.address]);

    // framework.cfaV1.createFlow({ flowRate: inflowRateUsdc, receiver: app, superToken: usdcx.address });
    // framework.cfaV1.createFlow({ flowRate: inflowRate, receiver: app, superToken: usdcx.address });
    const txnResponseAlice = await sf.cfaV1
        .createFlow({
            sender: alice.address,
            flowRate: inflowRate,
            receiver: u.app.address,
            superToken: ethx.address
        }).exec(userAccounts["admin"]);

    // await alice.flow({ flowRate: inflowRate, recipient: u.app });
    const txnResponseBob = await sf.cfaV1
        .createFlow({
            sender: bob.address,
            flowRate: inflowRate,
            receiver: u.app.address,
            superToken: ethx.address
        }).exec(userAccounts["admin"]);

    // await u.bob.flow({ flowRate: inflowRate, recipient: u.app });
    // Expect the parameters are correct       // TODO
    expect(await app.getStreamRate(alice.address, usdcx.address)).to.equal(inflowRate);
    expect((await app.getIDAShares(1, alice.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);
    expect((await app.getIDAShares(0, alice.address)).toString()).to.equal(`true,true,0,0`);
    expect(await app.getStreamRate(bob.address, ethx.address)).to.equal(inflowRate);
    expect((await app.getIDAShares(1, bob.address)).toString()).to.equal(`true,true,0,0`);
    expect((await app.getIDAShares(0, bob.address)).toString()).to.equal(`true,true,${inflowRateIDAShares},0`);
});

xit("approval should be unlimited", async () => {
    // await funcApproveSubscriptions();
    await sf.idaV1
        .approveSubscription({
            indexId: "0",
            superToken: superT.ethx.address,
            publisher: u.app.address,
            userData: "0x",
        })
        .exec(userAccounts["admin"]);
    // TODO
    expect(await output.allowance(app.address, Constants.SUSHISWAP_ROUTER_ADDRESS))
        .to.be.equal(ethers.constants.MaxUint256);
    expect(await usdc.allowance(app.address, Constants.SUSHISWAP_ROUTER_ADDRESS))
        .to.be.equal(ethers.constants.MaxUint256);
    expect(await output.allowance(app.address, ethx.address))
        .to.be.equal(ethers.constants.MaxUint256);
    expect(await usdc.allowance(app.address, usdcx.address))
        .to.be.equal(ethers.constants.MaxUint256);
});
