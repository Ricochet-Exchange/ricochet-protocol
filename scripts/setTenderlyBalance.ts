async function main() {
  const WALLETS = ['0x3226C9EaC0379F04Ba2b1E1e1fcD52ac26309aeA']

  const result = await ethers.provider.send('tenderly_setBalance', [
    WALLETS,
    // amount in wei will be set for all wallets
    ethers.utils.hexValue(ethers.utils.parseUnits('10000', 'ether').toHexString()),
  ])

  // Check the balance of the first wallet
  const balance = await ethers.provider.getBalance(WALLETS[0])
  console.log('Balance:', ethers.utils.formatEther(balance))
  console.log('Result:', result)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
