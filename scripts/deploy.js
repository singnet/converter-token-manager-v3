import { network } from "hardhat";

async function main() {
  const { ethers } = await network.getOrCreate();
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const tokenAddress = "Put the token's address here";

  const TokenConversionManager = await ethers.getContractFactory("TokenConversionManagerV3");

  const tokenConversionManager = await TokenConversionManager.deploy(
    tokenAddress
  );

  console.log("Contract deployed", await tokenConversionManager.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
      console.error(error);
      process.exit(1);
  });