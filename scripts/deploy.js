// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
  const [ deployer ] = await ethers.getSigners();
  console.log('deployer:', deployer.address);

  // testnet
  const minStakedValue = ethers.utils.parseUnits('0.1');
  const minRetireDelay = 2 * 3600;

  // mainnet
  // const minStakedValue = ethers.utils.parseUnits('1.0');
  // const minRetireDelay = 48 * 3600;

  const HTLC = await ethers.getContractFactory("AtomicSwapEther");
  const htlc = await HTLC.deploy(minStakedValue, minRetireDelay);
  await htlc.deployed();
  console.log(`HTLC deployed to ${htlc.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
