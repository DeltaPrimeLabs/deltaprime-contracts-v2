import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers, tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    const MULTISIG_ADMIN_ADDRESS = "0x6855A3cA53cB01646A9a3e6d1BC30696499C0b4a";

    // Embed commit hashes
    embedCommitHash("Pool", "./contracts");
    embedCommitHash("WrappedNativeTokenPool", "./contracts");
    embedCommitHash("WethPool", "./contracts/deployment/arbitrum");
    embedCommitHash("WethPoolTUP", "./contracts/proxies/tup/arbitrum");
    embedCommitHash("UsdcPool", "./contracts/deployment/arbitrum");
    embedCommitHash("UsdcPoolTUP", "./contracts/proxies/tup/arbitrum");

    // Contracts to deploy
    const contractsToDeploy = [
        {
            name: "WethPool",
            contractPath: "contracts/deployment/arbitrum/WethPool.sol:WethPool",
            args: [],
            gasLimit: 50000000
        },
        {
            name: "UsdcPool",
            contractPath: "contracts/deployment/arbitrum/UsdcPool.sol:UsdcPool",
            args: [],
            gasLimit: 50000000
        }
    ];

    const deployedContracts = [];

    // Deploy all pool implementations directly
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
            `${contractConfig.name} pool deployed at address: ${deployedContract.address}`
        );
    }

    // Deploy TUP proxies for each pool
    const tupContracts = [
        {
            name: "WethPoolTUP",
            contractPath: "contracts/proxies/tup/arbitrum/WethPoolTUP.sol:WethPoolTUP",
            poolAddress: deployedContracts.find(c => c.name === "WethPool").address,
            gasLimit: 80000000
        },
        {
            name: "UsdcPoolTUP",
            contractPath: "contracts/proxies/tup/arbitrum/UsdcPoolTUP.sol:UsdcPoolTUP",
            poolAddress: deployedContracts.find(c => c.name === "UsdcPool").address,
            gasLimit: 80000000
        }
    ];

    for (const tupConfig of tupContracts) {
        console.log(`\nDeploying ${tupConfig.name}...`);
        
        let deployedTup = await deploy(tupConfig.name, {
            from: deployer,
            gasLimit: tupConfig.gasLimit,
            args: [tupConfig.poolAddress, MULTISIG_ADMIN_ADDRESS, []],
            contract: tupConfig.contractPath
        });

        deployedContracts.push({
            name: tupConfig.name,
            address: deployedTup.address,
            contractPath: tupConfig.contractPath,
            constructorArguments: [tupConfig.poolAddress, MULTISIG_ADMIN_ADDRESS, []]
        });

        console.log(`${tupConfig.name} deployed at address: ${deployedTup.address}`);
    }

    // Sleep 5 seconds before verification
    console.log("\nWaiting 5 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 5000));

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

module.exports.tags = ["arbitrum-lending-pools"];