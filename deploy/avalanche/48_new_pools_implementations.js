import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    // Pool contracts to deploy
    const poolContracts = [
        "WavaxPool",
        "BtcPool", 
        "UsdtPool",
        "UsdcPool",
        "EthPool"
    ];

    const deployedContracts = [];

    // Deploy all pool contracts
    for (const contractName of poolContracts) {
        console.log(`\nDeploying ${contractName}...`);
        
        let poolContract = await deploy(contractName, {
            from: deployer,
            args: [], // No constructor arguments
            contract: `contracts/deployment/avalanche/${contractName}.sol:${contractName}`
        });

        deployedContracts.push({
            name: contractName,
            address: poolContract.address
        });

        console.log(
            `${contractName} deployed at address: ${poolContract.address}`
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
                contract: `contracts/deployment/avalanche/${contract.name}.sol:${contract.name}`,
                constructorArguments: []
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
                name: `contracts/deployment/avalanche/${contract.name}.sol:${contract.name}`,
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

module.exports.tags = ["avalanche-pools-new"];