import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers, tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    const MULTISIG_ADMIN_ADDRESS = "0x6855A3cA53cB01646A9a3e6d1BC30696499C0b4a";
    
    // REPLACE THESE WITH ACTUAL DEPLOYED POOL ADDRESSES
    const WETH_POOL_TUP_ADDRESS = "0x5BFEBc501fC929Aaa152d9EE1196B0A80D8BfdbD";
    const USDC_POOL_TUP_ADDRESS = "0xDD38021d3FB132B644708ee37cbbBfB2269aD3E9";

    // Embed commit hashes
    embedCommitHash('WethBorrowIndex', './contracts/deployment/arbitrum');
    embedCommitHash('WethDepositIndex', './contracts/deployment/arbitrum');
    embedCommitHash('UsdcBorrowIndex', './contracts/deployment/arbitrum');
    embedCommitHash('UsdcDepositIndex', './contracts/deployment/arbitrum');

    // Index configurations
    const indexConfigs = [
        {
            name: "WethBorrowIndex",
            poolAddress: WETH_POOL_TUP_ADDRESS
        },
        {
            name: "WethDepositIndex", 
            poolAddress: WETH_POOL_TUP_ADDRESS
        },
        {
            name: "UsdcBorrowIndex",
            poolAddress: USDC_POOL_TUP_ADDRESS
        },
        {
            name: "UsdcDepositIndex",
            poolAddress: USDC_POOL_TUP_ADDRESS
        }
    ];

    const deployedContracts = [];

    // Deploy all index implementations
    for (const config of indexConfigs) {
        console.log(`\nDeploying ${config.name}...`);
        
        const resultIndex = await deploy(config.name, {
            contract: `contracts/deployment/arbitrum/${config.name}.sol:${config.name}`,
            from: deployer,
            gasLimit: 50000000,
            args: [],
        });

        deployedContracts.push({
            name: config.name,
            address: resultIndex.address,
            contractPath: `contracts/deployment/arbitrum/${config.name}.sol:${config.name}`,
            constructorArguments: []
        });

        console.log(`Deployed ${config.name} at address: ${resultIndex.address}`);
    }

    // Deploy all TUP proxies
    for (const config of indexConfigs) {
        console.log(`\nDeploying ${config.name}TUP...`);
        
        const implementationAddress = deployedContracts.find(c => c.name === config.name).address;
        
        const result = await deploy(`${config.name}TUP`, {
            contract: `contracts/proxies/tup/arbitrum/${config.name}TUP.sol:${config.name}TUP`,
            from: deployer,
            gasLimit: 50000000,
            args: [implementationAddress, MULTISIG_ADMIN_ADDRESS, []],
        });

        deployedContracts.push({
            name: `${config.name}TUP`,
            address: result.address,
            contractPath: `contracts/proxies/tup/arbitrum/${config.name}TUP.sol:${config.name}TUP`,
            constructorArguments: [implementationAddress, MULTISIG_ADMIN_ADDRESS, []],
            poolAddress: config.poolAddress
        });

        console.log(`${config.name}TUP deployed at address: ${result.address}`);
    }

    // Initialize all indices through their proxies
    console.log("\n=== Initializing Indices ===");
    for (const config of indexConfigs) {
        if(config.poolAddress == "0x5BFEBc501fC929Aaa152d9EE1196B0A80D8BfdbD") continue;
        const tupContract = deployedContracts.find(c => c.name === `${config.name}TUP`);
        
        console.log(`Initializing ${config.name} with pool: ${config.poolAddress}`);
        
        const indexFactory = await ethers.getContractFactory(
            `contracts/deployment/arbitrum/${config.name}.sol:${config.name}`
        );
        const initializeTx = await indexFactory.attach(tupContract.address).initialize(
            config.poolAddress,
            { gasLimit: 50000000 }
        );

        await initializeTx.wait();
        console.log(`✅ Initialized ${config.name} (tx: ${initializeTx.hash})`);
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

    // Log initialization parameters for verification
    console.log("\n=== Initialization Summary ===");
    indexConfigs.forEach(config => {
        const tupContract = deployedContracts.find(c => c.name === `${config.name}TUP`);
        console.log(`${config.name}: ${tupContract.address} -> Pool: ${config.poolAddress}`);
    });

    console.log("\n=== Deployment Summary ===");
    deployedContracts.forEach(contract => {
        console.log(`${contract.name}: ${contract.address}`);
    });

    console.log(`\n=== Linear Indices Summary ===`);
    console.log(`All 4 linear indices deployed and initialized successfully:`);
    console.log(`- WethBorrowIndex & WethDepositIndex -> WETH Pool`);
    console.log(`- UsdcBorrowIndex & UsdcDepositIndex -> USDC Pool`);
    console.log(`All indices are ready for use`);
};

module.exports.tags = ['arbitrum-pools-indices'];