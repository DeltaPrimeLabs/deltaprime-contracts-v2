import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers, tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    // Embed commit hash for ParaSwapFacet
    embedCommitHash("ParaSwapFacet", "./contracts/facets");

    // Contracts to deploy
    const contractsToDeploy = [
        {
            name: "ParaSwapFacet",
            contractPath: "contracts/facets/ParaSwapFacet.sol:ParaSwapFacet",
            args: []
        }
    ];

    const deployedContracts = [];

    // Deploy all contracts
    for (const contractConfig of contractsToDeploy) {
        console.log(`\nDeploying ${contractConfig.name}...`);
        
        let deployedContract = await deploy(contractConfig.name, {
            from: deployer,
            gasLimit: contractConfig.gasLimit,
            args: contractConfig.args,
            contract: contractConfig.contractPath
        });

        deployedContracts.push({
            name: contractConfig.name,
            address: deployedContract.address,
            contractPath: contractConfig.contractPath,
            constructorArguments: contractConfig.args
        });

        console.log(
            `${contractConfig.name} implementation deployed at address: ${deployedContract.address}`
        );
    }

    // Sleep 10 seconds before verification
    console.log("\nWaiting 10 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify all deployed contracts
    for (const contract of deployedContracts) {
        console.log(`\nVerifying ${contract.name}...`);
        
        try {
            await verifyContract(hre, {
                address: contract.address,
                contract: contract.contractPath,
                constructorArguments: contract.constructorArguments
            });
            console.log(`✅ Verified ${contract.name}`);
        } catch (error) {
            console.error(`❌ Failed to verify ${contract.name}:`, error.message);
        }

        // Tenderly verification
        try {
            console.log(`Tenderly verification of ${contract.name} at:`, contract.address);
            await tenderly.verify({
                address: contract.address,
                name: contract.contractPath,
            });
            console.log(`✅ Tenderly verified ${contract.name}`);
        } catch (error) {
            console.error(`❌ Failed Tenderly verification for ${contract.name}:`, error.message);
        }
    }

    console.log("\n=== Deployment Summary ===");
    deployedContracts.forEach(contract => {
        console.log(`${contract.name}: ${contract.address}`);
    });
};

module.exports.tags = ["avalanche-paraswap"];