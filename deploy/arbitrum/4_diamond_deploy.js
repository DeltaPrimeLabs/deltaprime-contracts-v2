import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers, tenderly } = require("hardhat");

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

// Helper function to get function selectors
function getSelectors(contract) {
    const signatures = Object.keys(contract.interface.functions);
    const selectors = signatures.reduce((acc, val) => {
        if (val !== 'init(bytes)') {
            acc.push(contract.interface.getSighash(val));
        }
        return acc;
    }, []);
    return selectors;
}

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // Embed commit hashes for diamond-related contracts only
    embedCommitHash("SmartLoanDiamondBeacon");
    embedCommitHash("DiamondStorageLib", "contracts/lib");

    // Contracts to deploy
    const contractsToDeploy = [];

    // Deploy DiamondCutFacet
    console.log("\nDeploying DiamondCutFacet...");
    const diamondCutFacet = await deploy("DiamondCutFacet", {
        from: deployer,
        args: [],
        gasLimit: 8000000
    });

    contractsToDeploy.push({
        name: "DiamondCutFacet",
        address: diamondCutFacet.address,
        contractPath: "contracts/facets/DiamondCutFacet.sol:DiamondCutFacet",
        constructorArguments: []
    });

    console.log(`DiamondCutFacet deployed: ${diamondCutFacet.address}`);

    // Deploy Diamond
    console.log("\nDeploying SmartLoanDiamondBeacon...");
    const diamond = await deploy("SmartLoanDiamondBeacon", {
        from: deployer,
        args: [deployer, diamondCutFacet.address],
        gasLimit: 8000000
    });

    contractsToDeploy.push({
        name: "SmartLoanDiamondBeacon",
        address: diamond.address,
        contractPath: "contracts/SmartLoanDiamondBeacon.sol:SmartLoanDiamondBeacon",
        constructorArguments: [deployer, diamondCutFacet.address]
    });

    console.log(`SmartLoanDiamondBeacon deployed: ${diamond.address}`);

    // Deploy DiamondInit
    console.log("\nDeploying DiamondInit...");
    const diamondInit = await deploy("DiamondInit", {
        from: deployer,
        args: [],
        gasLimit: 8000000
    });

    contractsToDeploy.push({
        name: "DiamondInit",
        address: diamondInit.address,
        contractPath: "contracts/facets/DiamondInit.sol:DiamondInit",
        constructorArguments: []
    });

    console.log(`DiamondInit deployed: ${diamondInit.address}`);

    // Deploy DiamondLoupeFacet
    console.log("\nDeploying DiamondLoupeFacet...");
    const diamondLoupeFacet = await deploy("DiamondLoupeFacet", {
        from: deployer,
        args: [],
        gasLimit: 8000000
    });

    contractsToDeploy.push({
        name: "DiamondLoupeFacet",
        address: diamondLoupeFacet.address,
        contractPath: "contracts/facets/DiamondLoupeFacet.sol:DiamondLoupeFacet",
        constructorArguments: []
    });

    console.log(`DiamondLoupeFacet deployed: ${diamondLoupeFacet.address}`);

    // Perform diamond cut to add facets
    console.log("\nPerforming diamond cut...");
    const cut = [];

    // Add DiamondInit facet
    const diamondInitContract = await ethers.getContractAt("DiamondInit", diamondInit.address);
    cut.push({
        facetAddress: diamondInit.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(diamondInitContract)
    });

    // Add DiamondLoupeFacet
    const diamondLoupeFacetContract = await ethers.getContractAt("DiamondLoupeFacet", diamondLoupeFacet.address);
    cut.push({
        facetAddress: diamondLoupeFacet.address,
        action: FacetCutAction.Add,
        functionSelectors: getSelectors(diamondLoupeFacetContract)
    });

    // Execute diamond cut
    const diamondCut = await ethers.getContractAt('IDiamondCut', diamond.address);
    const functionCall = diamondInitContract.interface.encodeFunctionData('init');

    let tx = await diamondCut.diamondCut(cut, diamondInit.address, functionCall, {
        gasLimit: 20000000
    });
    console.log(`Diamond cut tx: ${tx.hash}`);
    
    let receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    console.log('Completed diamond cut');

    // Unpause diamond
    tx = await diamondCut.unpause();
    receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Diamond unpausing failed: ${tx.hash}`);
    }
    console.log(`Completed diamond unpause (tx: ${tx.hash})`);

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
    
    console.log(`\n=== Diamond Summary ===`);
    console.log(`Diamond Address: ${diamond.address}`);
    console.log(`Diamond includes: DiamondCutFacet, DiamondInit, DiamondLoupeFacet`);
    console.log(`Diamond is unpaused and ready for additional facet deployments`);
    
    console.log(`\n⚠️  IMPORTANT NEXT STEPS:`);
    console.log(`1. Update DiamondCutFacet.sol with hardcoded diamond address: ${diamond.address}`);
    console.log(`2. Run the diamond upgrade script to replace DiamondCutFacet with the secured version`);
};

module.exports.tags = ["arbitrum-diamond"];