require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sbch_testnet: {
      // url: 'https://rpc-testnet.smartbch.org',
      url: 'http://13.214.162.63:8545',
      accounts: [
        process.env.KEY0 || '019232d3f45e911d71cd607c3b74be35f297a52b00e5d7134d15814456f02ce6', // deployer
        process.env.KEY1 || 'd248df3c728282a66521c94a4852c2d4c7b3c3612ba5ce0baf43e64b2ecc49fb', // bot1
        process.env.KEY2 || '5cf5f6c787232a2b0f79c56e0ce4cc4c02c67f9e586c705f9168c29db4ca922a', // user1
        process.env.KEY3 || 'c81da8d6ab29533fc530ee67af1a352da3b7c3b125fa7ab0a9e2c5dece3ea98f', // user2
      ],
      minStakedValue: '0.1',
      minRetireDelay: 2 * 3600,
    },
    sbch_mainnet: {
      url: 'https://rpc.smartbch.org',
      accounts: [process.env.KEY || '0000000000000000000000000000000000000000000000000000000000000000'],
      minStakedValue: '1.0',
      minRetireDelay: 24 * 3600,
    },
  }
};
