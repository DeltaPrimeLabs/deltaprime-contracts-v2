import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers, tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    // Embed commit hash for TokenManager
    embedCommitHash("TokenManager", "./contracts");

    // Contract to deploy
    const contractConfig = {
        name: "TokenManager",
        contractPath: "contracts/TokenManager.sol:TokenManager",
        args: [],
    };

    console.log(`\nDeploying ${contractConfig.name} implementation...`);
    
    let deployedTokenManager = await deploy(contractConfig.name, {
        from: deployer,
        gasLimit: contractConfig.gasLimit,
        args: contractConfig.args,
        contract: contractConfig.contractPath
    });

    const deployedContract = {
        name: contractConfig.name,
        address: deployedTokenManager.address,
        contractPath: contractConfig.contractPath,
        constructorArguments: contractConfig.args
    };

    console.log(`Deployed ${contractConfig.name} implementation at address: ${deployedTokenManager.address}`);

    // Sleep 5 seconds before verification
    console.log("\nWaiting 5 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Standard contract verification
    console.log(`\nVerifying ${deployedContract.name}...`);
    
    try {
        await verifyContract(hre, {
            address: deployedContract.address,
            contract: deployedContract.contractPath,
            constructorArguments: deployedContract.constructorArguments
        });
        console.log(`✅ Verified ${deployedContract.name}`);
    } catch (error) {
        console.error(`❌ Failed to verify ${deployedContract.name}:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of ${deployedContract.name} at:`, deployedContract.address);
        await tenderly.verify({
            address: deployedContract.address,
            name: deployedContract.contractPath,
        });
        console.log(`✅ Tenderly verified ${deployedContract.name}`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for ${deployedContract.name}:`, error.message);
    }

    console.log("\n=== Deployment Summary ===");
    console.log(`${deployedContract.name}: ${deployedContract.address}`);
};

module.exports.tags = ["arbitrum-token-manager-implementation"];