require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("@nomicfoundation/hardhat-verify");

const fs = require('fs');

require('dotenv').config({ path: '.env'});
const { INFURA, ETHSKAN } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.26", // Recommended use latest solc & solidity version
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    }
  }
  /*
  networks: {
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA}`,
      accounts: ["0x..."],
      chainId: 11155111
    }
  }, 
  etherscan: {
    apiKey: ETHSKAN,
  },
  */
};