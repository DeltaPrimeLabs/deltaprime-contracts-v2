import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import { pool, toWei } from "../../test/_helpers";
import web3Abi from "web3-eth-abi";
import TokenManagerArtifact from "../../artifacts/contracts/TokenManager.sol/TokenManager.json";
import { supportedAssetsArb } from "../../common/addresses/arbitrum/arbitrum_supported_assets";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers, tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    const MULTISIG_ADMIN_ADDRESS = "0x6855A3cA53cB01646A9a3e6d1BC30696499C0b4a";

    // Embed commit hash for TokenManager
    embedCommitHash("TokenManager");

    // Hardcoded TUP addresses - replace with actual deployed addresses
    const WETH_POOL_TUP_ADDRESS = "0x5BFEBc501fC929Aaa152d9EE1196B0A80D8BfdbD"; // Replace with actual WethPoolTUP address
    const USDC_POOL_TUP_ADDRESS = "0xDD38021d3FB132B644708ee37cbbBfB2269aD3E9"; // Replace with actual UsdcPoolTUP address

    let lendingPools = [
        pool("ETH", WETH_POOL_TUP_ADDRESS),
        pool("USDC", USDC_POOL_TUP_ADDRESS),
    ];

    // Log initialization parameters for verification
    console.log("\n=== Initialization Parameters ===");
    console.log("Supported Assets:");
    supportedAssetsArb.forEach((asset, index) => {
        console.log(`  [${index}] Symbol: ${asset.symbol}, Address: ${asset.asset}, Decimals: ${asset.decimals}`);
    });
    
    console.log("\nLending Pools:");
    lendingPools.forEach((pool, index) => {
        console.log(`  [${index}] Symbol: ${pool.symbol}, Address: ${pool.poolAddress}`);
    });
    console.log("=====================================\n");

    // Contracts to deploy
    const contractsToDeploy = [
        {
            name: "TokenManager",
            contractPath: "contracts/TokenManager.sol:TokenManager",
            args: [],
            gasLimit: 50000000
        }
    ];

    const deployedContracts = [];

    // Deploy TokenManager implementation
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

        console.log(`Deployed ${contractConfig.name} at address: ${deployedContract.address}`);
    }

    // Prepare initialization calldata
    const calldata = web3Abi.encodeFunctionCall(
        TokenManagerArtifact.abi.find((method) => method.name === "initialize"),
        [supportedAssetsArb, lendingPools]
    );

    // Deploy TokenManagerTUP
    console.log("\nDeploying TokenManagerTUP...");
    let deployedTokenManagerTUP = await deploy("TokenManagerTUP", {
        from: deployer,
        gasLimit: 50000000,
        args: [deployedContracts[0].address, MULTISIG_ADMIN_ADDRESS, calldata],
    });

    deployedContracts.push({
        name: "TokenManagerTUP",
        address: deployedTokenManagerTUP.address,
        contractPath: "contracts/proxies/tup/TokenManagerTUP.sol:TokenManagerTUP",
        constructorArguments: [deployedContracts[0].address, MULTISIG_ADMIN_ADDRESS, calldata]
    });

    console.log(`Deployed TokenManagerTUP at address: ${deployedTokenManagerTUP.address}`);

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

    console.log("\n=== Initialization Summary ===");
    console.log(`TokenManager proxy initialized with:`);
    console.log(`- ${supportedAssetsArb.length} supported assets`);
    console.log(`- ${lendingPools.length} lending pools`);
    console.log(`- Admin: ${MULTISIG_ADMIN_ADDRESS}`);
};

module.exports.tags = ["arbitrum-token-manager"];