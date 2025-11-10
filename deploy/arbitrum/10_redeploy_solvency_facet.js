import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers, tenderly } = require("hardhat");

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

// Helper function to get specific selectors for a facet
function getSelectorsForFunctions(contract, functionNames) {
    return functionNames.map(name => {
        const fragment = contract.interface.getFunction(name);
        return contract.interface.getSighash(fragment);
    });
}

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // REPLACE THIS WITH ACTUAL DIAMOND ADDRESS
    const DIAMOND_ADDRESS = "0x968f944e9c43FC8AD80F6C1629F10570a46e2651";

    // SolvencyFacetProdArbitrum configuration
    const solvencyConfig = {
        name: "SolvencyFacetProdArbitrum",
        contractPath: "contracts/facets/arbitrum/SolvencyFacetProdArbitrum.sol:SolvencyFacetProdArbitrum",
        functions: [
            'canRepayDebtFully', 
            'isSolvent', 
            'getDebtAssets', 
            'getDebt', 
            'getDebtPayable', 
            'getThresholdWeightedValuePayable', 
            'getPrice', 
            'getPrices', 
            'getTotalAssetsValue', 
            'getThresholdWeightedValue', 
            'getStakedValue', 
            'getTotalValue', 
            'getFullLoanStatus', 
            'getHealthRatio', 
            'getTotalTraderJoeV2'
        ]
    };

    console.log("\n🔄 Re-deploying SolvencyFacetProdArbitrum");

    // Embed commit hash
    console.log("\n=== Embedding Commit Hash ===");
    const directory = "./contracts/facets/arbitrum";
    console.log(`Embedding ${solvencyConfig.name} from ${directory}`);
    embedCommitHash(solvencyConfig.name, directory);

    // Deploy the facet implementation
    console.log("\n=== Deploying SolvencyFacetProdArbitrum ===");
    console.log(`\nDeploying ${solvencyConfig.name}...`);
    
    const facet = await deploy(solvencyConfig.name, {
        contract: solvencyConfig.contractPath,
        from: deployer,
        args: [],
        gasLimit: 8000000
    });

    const deployedContract = {
        name: solvencyConfig.name,
        address: facet.address,
        contractPath: solvencyConfig.contractPath,
        constructorArguments: [],
        functions: solvencyConfig.functions
    };

    console.log(`${solvencyConfig.name} deployed: ${facet.address}`);

    // Sleep 5 seconds before verification
    console.log("\nWaiting 5 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify the deployed facet
    console.log("\n=== Verifying SolvencyFacetProdArbitrum ===");
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

    // Prepare diamond cut operations
    console.log("\n=== Preparing Diamond Cut ===");
    const diamondCut = await ethers.getContractAt('IDiamondCut', DIAMOND_ADDRESS);
    
    // Pause the diamond
    console.log("Pausing diamond...");
    let tx = await diamondCut.pause();
    await tx.wait();
    console.log(`Diamond paused (tx: ${tx.hash})`);

    // Prepare cut for SolvencyFacetProdArbitrum replacement
    console.log(`Preparing replacement cut for ${deployedContract.name}...`);
    
    const facetContract = await ethers.getContractAt(deployedContract.name, deployedContract.address);
    const selectors = getSelectorsForFunctions(facetContract, deployedContract.functions);

    const cuts = [{
        facetAddress: deployedContract.address,
        action: FacetCutAction.Replace, // Using Replace instead of Add
        functionSelectors: selectors
    }];
    
    console.log(`  - ${deployedContract.name}: ${selectors.length} selectors prepared for replacement`);
    console.log(`  - Function selectors:`, selectors);

    // Execute diamond cut
    console.log(`\nExecuting diamond cut to replace SolvencyFacetProdArbitrum...`);
    tx = await diamondCut.diamondCut(cuts, ethers.constants.AddressZero, "0x", {
        gasLimit: 10000000
    });
    console.log(`Diamond cut tx: ${tx.hash}`);
    
    const receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Diamond cut failed: ${tx.hash}`);
    }
    console.log('✅ Diamond cut completed successfully - SolvencyFacetProdArbitrum replaced');

    // Unpause diamond
    console.log("\nUnpausing diamond...");
    tx = await diamondCut.unpause();
    await tx.wait();
    console.log(`✅ Diamond unpaused (tx: ${tx.hash})`);

    // Summary
    console.log("\n=== Deployment Summary ===");
    console.log(`${deployedContract.name}: ${deployedContract.address} (${deployedContract.functions.length} functions)`);
    
    console.log(`\n=== Diamond Update Summary ===`);
    console.log(`Diamond Address: ${DIAMOND_ADDRESS}`);
    console.log(`Facet Replaced: SolvencyFacetProdArbitrum`);
    console.log(`New Facet Address: ${deployedContract.address}`);
    console.log(`Functions Replaced: ${deployedContract.functions.length}`);
    console.log(`Diamond is unpaused and ready with updated SolvencyFacetProdArbitrum`);
    
    console.log(`\n=== Replaced Functions ===`);
    console.log(`SolvencyFacetProdArbitrum: ${deployedContract.functions.join(', ')}`);
};

module.exports.tags = ["redeploy-solvency-facet"];