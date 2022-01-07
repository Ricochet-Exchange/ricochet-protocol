import { ethers } from "hardhat";
import { impersonateAccounts } from "./helpers";
import SuperfluidSDK  from "@superfluid-finance/js-sdk";
import "@nomiclabs/hardhat-web3";



 const appBalances = {
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
};
const ownerBalances = {
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
};
const aliceBalances = {
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
};
const bobBalances = {
    ethx: [],
    wbtcx: [],
    daix: [],
    usdcx: [],
    ric: [],
};

async function checkBalance(users) {
    for (let i = 0; i < users.length; ++i) {
    console.log('Balance of ', users[i].alias);
    console.log('usdcx: ', (await usdcx.balanceOf(users[i].address)).toString());
    console.log('wbtcx: ', (await wbtcx.balanceOf(users[i].address)).toString());
    }
}

async function upgrade(accounts) {
    for (let i = 0; i < accounts.length; ++i) {
        await web3tx(
            usdcx.upgrade,
            `${accounts[i].alias} upgrades many USDCx`,
        )(parseUnits("100000000", 18), {
            from: accounts[i].address,
        });
        await web3tx(
            daix.upgrade,
            `${accounts[i].alias} upgrades many DAIx`,
        )(parseUnits("100000000", 18), {
            from: accounts[i].address,
        });

        await checkBalance(accounts[i]);
    }
}

// add downgrade function as well 

async function logUsers() {
    let string = 'user\t\ttokens\t\tnetflow\n';
    let p = 0;
    for (const [, user] of Object.entries(u)) {
        if (await hasFlows(user)) {
            p++;
            string += `${user.alias}\t\t${wad4human(
                await usdcx.balanceOf(user.address),
            )}\t\t${wad4human((await user.details()).cfa.netFlow)}
            `;
        }
    }
    if (p == 0) return console.warn('no users with flows');
    console.log('User logs:');
    console.log(string);
}

async function hasFlows(user) {
    const {
        inFlows,
        outFlows,
    } = (await user.details()).cfa.flows;
    return inFlows.length + outFlows.length > 0;
}


async function subscribe(user) {
    // Alice approves a subscription to the app
    console.log(sf.host.callAgreement);
    console.log(sf.agreements.ida.address);
    console.log(usdcx.address);
    console.log(app.address);
    await web3tx(
        sf.host.callAgreement,
        'user approves subscription to the app',
    )(
        sf.agreements.ida.address,
        sf.agreements.ida.contract.methods
            .approveSubscription(ethx.address, app.address, 0, '0x')
            .encodeABI(),
        '0x', // user data
        {
            from: user,
        },
    );
}

async function updateBalances() {
    appBalances.ethx.push((await ethx.balanceOf(app.address)).toString());
    ownerBalances.ethx.push((await ethx.balanceOf(u.admin.address)).toString());
    aliceBalances.ethx.push((await ethx.balanceOf(u.alice.address)).toString());
    bobBalances.ethx.push((await ethx.balanceOf(u.bob.address)).toString());

    appBalances.wbtcx.push((await wbtcx.balanceOf(app.address)).toString());
    ownerBalances.wbtcx.push((await wbtcx.balanceOf(u.admin.address)).toString());
    aliceBalances.wbtcx.push((await wbtcx.balanceOf(u.alice.address)).toString());
    bobBalances.wbtcx.push((await wbtcx.balanceOf(u.bob.address)).toString());

    appBalances.usdcx.push((await usdcx.balanceOf(app.address)).toString());
    ownerBalances.usdcx.push((await usdcx.balanceOf(u.admin.address)).toString());
    aliceBalances.usdcx.push((await usdcx.balanceOf(u.alice.address)).toString());
    bobBalances.usdcx.push((await usdcx.balanceOf(u.bob.address)).toString());

    appBalances.ric.push((await ric.balanceOf(app.address)).toString());
    ownerBalances.ric.push((await ric.balanceOf(u.admin.address)).toString());
    aliceBalances.ric.push((await ric.balanceOf(u.alice.address)).toString());
    bobBalances.ric.push((await ric.balanceOf(u.bob.address)).toString());
}