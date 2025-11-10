import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
import web3Abi from "web3-eth-abi";
const { ethers, tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    // REPLACE THESE WITH ACTUAL DEPLOYED ADDRESSES
    const DIAMOND_ADDRESS = "0x968f944e9c43FC8AD80F6C1629F10570a46e2651";
    const TOKEN_MANAGER_ADDRESS = "0x4f032CC36B72D934551bc0395Df17162eF92D8D9";

    const MULTISIG_ADMIN_ADDRESS = "0x6855A3cA53cB01646A9a3e6d1BC30696499C0b4a";

    // Embed commit hashes
    embedCommitHash("SmartLoansFactory");
    embedCommitHash("SmartLoansFactoryTUP", "./contracts/proxies/tup");

    // Initialize interface for factory initialization
    const initializeInterface = {
        inputs: [
            {
                internalType: "address payable",
                name: "_smartLoanDiamond",
                type: "address",
            },
            {
                internalType: "address",
                name: "_tokenManager",
                type: "address",
            },
        ],
        name: "initialize",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
    };

    // Contracts to deploy
    const contractsToDeploy = [];

    // Deploy SmartLoansFactory implementation
    console.log("\nDeploying SmartLoansFactory...");
    const smartLoansFactory = await deploy("SmartLoansFactory", {
        from: deployer,
        gasLimit: 50000000,
        args: [],
    });

    contractsToDeploy.push({
        name: "SmartLoansFactory",
        address: smartLoansFactory.address,
        contractPath: "contracts/SmartLoansFactory.sol:SmartLoansFactory",
        constructorArguments: []
    });

    console.log(`SmartLoansFactory deployed: ${smartLoansFactory.address}`);

    // Prepare initialization calldata
    const calldata = web3Abi.encodeFunctionCall(initializeInterface, [
        DIAMOND_ADDRESS,
        TOKEN_MANAGER_ADDRESS,
    ]);

    // Deploy SmartLoansFactoryTUP
    console.log("\nDeploying SmartLoansFactoryTUP...");
    const resultTup = await deploy("SmartLoansFactoryTUP", {
        from: deployer,
        gasLimit: 50000000,
        args: [smartLoansFactory.address, MULTISIG_ADMIN_ADDRESS, calldata],
    });

    contractsToDeploy.push({
        name: "SmartLoansFactoryTUP",
        address: resultTup.address,
        contractPath: "contracts/proxies/tup/SmartLoansFactoryTUP.sol:SmartLoansFactoryTUP",
        constructorArguments: [smartLoansFactory.address, MULTISIG_ADMIN_ADDRESS, calldata]
    });

    console.log(`SmartLoansFactoryTUP deployed: ${resultTup.address}`);

    // Log initialization parameters for verification
    console.log("\n=== Initialization Parameters ===");
    console.log(`Smart Loan Diamond Address: ${DIAMOND_ADDRESS}`);
    console.log(`Token Manager Address: ${TOKEN_MANAGER_ADDRESS}`);
    console.log(`Factory Implementation: ${smartLoansFactory.address}`);
    console.log(`MULTISIG_ADMIN_ADDRESS: ${MULTISIG_ADMIN_ADDRESS}`);
    console.log("=====================================\n");

    // Sleep 5 seconds before verification
    console.log("\nWaiting 5 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify all deployed contracts
    for (const contract of contractsToDeploy) {
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
    contractsToDeploy.forEach(contract => {
        console.log(`${contract.name}: ${contract.address}`);
    });

    console.log(`\n=== Factory Summary ===`);
    console.log(`SmartLoansFactory Implementation: ${smartLoansFactory.address}`);
    console.log(`SmartLoansFactoryTUP (Proxy): ${resultTup.address}`);
    console.log(`Factory initialized with Diamond: ${DIAMOND_ADDRESS}`);
    console.log(`Factory initialized with TokenManager: ${TOKEN_MANAGER_ADDRESS}`);
    console.log(`Factory is ready to create SmartLoan instances`);
};

module.exports.tags = ["arbitrum-factory"];