import { BigNumberish } from 'ethers'
import { network, ethers } from 'hardhat'
// import { network } from "hardhat";

export const getBigNumber = (num: any) => ethers.BigNumber.from(num)

export const getTimeStamp = (date: number) => Math.floor(date / 1000)

export const getTimeStampNow = () => Math.floor(Date.now() / 1000)

export const getDate = (timestamp: number) => new Date(timestamp * 1000).toDateString()

export const getSeconds = (days: number) => 3600 * 24 * days // Changes days to seconds

export const impersonateAccount = async (account: string | any) => {
  // export const impersonateAccount = async (account: string) => {
  await network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: account,
  })
}

export const setBalance = async (account: string, balance: number) => {
  const hexBalance = numberToHex(toWad(balance))
  await network.provider.request({
    method: 'hardhat_setBalance',
    params: [account, hexBalance],
  })
}

export const impersonateAndSetBalance = async (account: string) => {
  await impersonateAccount(account)
  await setBalance(account, 10000)
}

// signers[i] = await ethers.getSigner(accounts[i]);
// }

export const currentBlockTimestamp = async () => {
  const currentBlockNumber = await ethers.provider.getBlockNumber()
  return (await ethers.provider.getBlock(currentBlockNumber)).timestamp
}

export const increaseTime = async (seconds: any) => {
  await network.provider.send('evm_increaseTime', [seconds])
  await network.provider.send('evm_mine')
}

export const setNextBlockTimestamp = async (timestamp: any) => {
  await network.provider.send('evm_setNextBlockTimestamp', [timestamp])
  await network.provider.send('evm_mine')
}

// Function for converting amount from larger unit (like eth) to smaller unit (like wei)
export function convertTo(amount: BigNumberish, decimals: number): string {
  return ethers.utils.formatUnits(amount, decimals) // JR
}
// Function for converting amoun
export function convertFrom(amount: BigNumberish, decimals: number): string {
  return ethers.utils.formatUnits(amount, decimals) // JR
}
