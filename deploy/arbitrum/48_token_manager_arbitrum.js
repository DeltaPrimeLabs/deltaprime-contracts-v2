import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

const { ethers } = require("hardhat");
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("TokenManager", "./contracts");

    let TokenManager = await deploy("TokenManager", {
        from: deployer,
        gasLimit: 15000000,
        args: [],
    });

    console.log(
        `TokenManager implementation deployed at address: ${TokenManager.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: TokenManager.address,
            contract: `contracts/TokenManager.sol:TokenManager`,
            constructorArguments: []
        });
        console.log(`✅ Verified TokenManager`);
    } catch (error) {
        console.error(`❌ Failed to verify TokenManager:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of TokenManager at:`, TokenManager.address);
        await tenderly.verify({
            address: TokenManager.address,
            name: `contracts/TokenManager.sol:TokenManager`,
        });
        console.log(`✅ Tenderly verified TokenManager`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for TokenManager:`, error.message);
    }
};

module.exports.tags = ["arbitrum-token-manager-2"];