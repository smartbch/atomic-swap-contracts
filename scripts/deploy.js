// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
  // console.log('config:', hre.network.config);

  const [ deployer ] = await ethers.getSigners();
  console.log('deployer:', deployer.address);

  const minStakedValue = ethers.utils.parseUnits(hre.network.config.minStakedValue);
  const minRetireDelay = hre.network.config.minRetireDelay;
  console.log('minStakedValue:', minStakedValue);
  console.log('minRetireDelay:', minRetireDelay);

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
