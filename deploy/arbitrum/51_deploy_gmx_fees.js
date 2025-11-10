import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
import fs from 'fs';
import path from 'path';
const { ethers, tenderly } = require("hardhat");

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

// Helper function to get specific selectors for a facet
function getSelectorsForFunctions(contract, functionNames) {
    return functionNames.map(name => {
        const fragment = contract.interface.getFunction(name);
        return contract.interface.getSighash(fragment);
    });
}

// Helper function to check if selector exists in diamond and get its current facet address
async function getSelectorInfo(diamondLoupe, selector) {
    try {
        const facetAddress = await diamondLoupe.facetAddress(selector);
        return {
            exists: facetAddress !== ethers.constants.AddressZero,
            currentAddress: facetAddress
        };
    } catch (error) {
        console.log(`Warning: Could not check selector ${selector}, assuming it doesn't exist`);
        return {
            exists: false,
            currentAddress: ethers.constants.AddressZero
        };
    }
}

// Save rollback data to JSON file
function saveRollbackData(rollbackData) {
    const rollbackPath = path.join(__dirname, 'diamond-rollback.json');
    fs.writeFileSync(rollbackPath, JSON.stringify(rollbackData, null, 2));
    console.log(`📋 Rollback data saved to: ${rollbackPath}`);
}

// Load rollback data from JSON file
function loadRollbackData() {
    const rollbackPath = path.join(__dirname, 'diamond-rollback.json');
    if (!fs.existsSync(rollbackPath)) {
        throw new Error(`Rollback file not found: ${rollbackPath}`);
    }
    const data = fs.readFileSync(rollbackPath, 'utf8');
    return JSON.parse(data);
}

// Check if this is a rollback operation
function isRollbackMode() {
    return process.env.ROLLBACK === 'true' || process.argv.includes('--rollback');
}

// Rollback function
async function executeRollback({ getNamedAccounts }) {
    const { deployer } = await getNamedAccounts();
    
    console.log("\n🔄 Diamond Rollback Operation Starting");
    
    const rollbackData = loadRollbackData();
    console.log(`📋 Loaded rollback data from: ${rollbackData.timestamp}`);
    console.log(`Diamond Address: ${rollbackData.diamondAddress}`);
    
    // Get diamond contracts
    const diamondCut = await ethers.getContractAt('IDiamondCut', rollbackData.diamondAddress);
    
    console.log(`\n--- Preparing Rollback Cuts ---`);
    const rollbackCuts = [];
    
    for (const operation of rollbackData.operations) {
        if (operation.type === 'REPLACE') {
            // For rollback, we replace back to the previous addresses
            rollbackCuts.push({
                facetAddress: operation.previousAddress,
                action: FacetCutAction.Replace,
                functionSelectors: operation.selectors
            });
            console.log(`ROLLBACK REPLACE: ${operation.selectors.length} selectors back to ${operation.previousAddress}`);
        } else if (operation.type === 'ADD') {
            // For rollback, we remove the functions that were added
            rollbackCuts.push({
                facetAddress: ethers.constants.AddressZero,
                action: FacetCutAction.Remove,
                functionSelectors: operation.selectors
            });
            console.log(`ROLLBACK REMOVE: ${operation.selectors.length} selectors (were added)`);
        }
    }
    
    if (rollbackCuts.length === 0) {
        console.log(`\n⚠️  No rollback operations needed.`);
        return;
    }
    
    console.log(`\nTotal rollback operations: ${rollbackCuts.length}`);
    
    // Pause the diamond
    console.log("\n--- Pausing Diamond for Rollback ---");
    let tx = await diamondCut.pause();
    await tx.wait();
    console.log(`✅ Diamond paused (tx: ${tx.hash})`);
    
    // Execute rollback
    console.log(`\n--- Executing Rollback Diamond Cut ---`);
    tx = await diamondCut.diamondCut(rollbackCuts, ethers.constants.AddressZero, "0x", {
        gasLimit: 15000000
    });
    console.log(`Rollback tx: ${tx.hash}`);
    
    const receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Rollback failed: ${tx.hash}`);
    }
    console.log('✅ Rollback completed successfully');
    
    // Unpause diamond
    console.log("\n--- Unpausing Diamond ---");
    tx = await diamondCut.unpause();
    await tx.wait();
    console.log(`✅ Diamond unpaused (tx: ${tx.hash})`);
    
    console.log(`\n🎉 Rollback completed successfully!`);
    console.log(`Diamond has been reverted to its previous state.`);
}

module.exports = async ({ getNamedAccounts, deployments }) => {
    // Check if this is a rollback operation
    if (isRollbackMode()) {
        return executeRollback({ getNamedAccounts });
    }

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // REPLACE THIS WITH ACTUAL DIAMOND ADDRESS
    const DIAMOND_ADDRESS = "0x968f944e9c43FC8AD80F6C1629F10570a46e2651";

    // Facet configurations
    const facetConfigs = [
        {
            name: "GmxV2PlusFacetArbitrum",
            contractPath: "contracts/facets/arbitrum/GmxV2PlusFacetArbitrum.sol:GmxV2PlusFacetArbitrum",
            directory: "./contracts/facets/arbitrum",
            functions: [
                'depositEthGmxV2Plus',
                'depositBtcGmxV2Plus',
                'depositGmxGmxV2Plus',
                'withdrawEthGmxV2Plus',
                'withdrawBtcGmxV2Plus',
                'withdrawGmxGmxV2Plus'
            ]
        },
        {
            name: "GmxV2FacetArbitrum",
            contractPath: "contracts/facets/arbitrum/GmxV2FacetArbitrum.sol:GmxV2FacetArbitrum",
            directory: "./contracts/facets/arbitrum",
            functions: [
                'depositSuiUsdcGmxV2',
                'depositSeiUsdcGmxV2',
                'depositEthUsdcGmxV2',
                'depositArbUsdcGmxV2',
                'depositLinkUsdcGmxV2',
                'depositUniUsdcGmxV2',
                'depositBtcUsdcGmxV2',
                'depositSolUsdcGmxV2',
                'depositNearUsdcGmxV2',
                'depositAtomUsdcGmxV2',
                'depositGmxUsdcGmxV2',
                'withdrawSuiUsdcGmxV2',
                'withdrawSeiUsdcGmxV2',
                'withdrawEthUsdcGmxV2',
                'withdrawArbUsdcGmxV2',
                'withdrawLinkUsdcGmxV2',
                'withdrawUniUsdcGmxV2',
                'withdrawBtcUsdcGmxV2',
                'withdrawSolUsdcGmxV2',
                'withdrawNearUsdcGmxV2',
                'withdrawAtomUsdcGmxV2',
                'withdrawGmxUsdcGmxV2'
            ]
        },
        {
            name: "GmxV2CallbacksFacetArbitrum",
            contractPath: "contracts/facets/arbitrum/GmxV2CallbacksFacetArbitrum.sol:GmxV2CallbacksFacetArbitrum",
            directory: "./contracts/facets/arbitrum",
            functions: [
                'afterDepositExecution',
                'afterDepositCancellation',
                'afterWithdrawalExecution',
                'afterWithdrawalCancellation',
                'refundExecutionFee'
            ]
        },
        {
            name: "AssetsOperationsArbitrumFacet",
            contractPath: "contracts/facets/arbitrum/AssetsOperationsArbitrumFacet.sol:AssetsOperationsArbitrumFacet",
            directory: "./contracts/facets/arbitrum",
            functions: [
                'removeUnsupportedOwnedAsset',
                'removeUnsupportedStakedPosition',
                'fund',
                'addOwnedAsset',
                'fundGLP',
                'borrow',
                'repay',
                'unfreezeAccount'
            ]
        },
        {
            name: "SmartLoanViewFacet",
            contractPath: "contracts/facets/SmartLoanViewFacet.sol:SmartLoanViewFacet",
            directory: "./contracts/facets",
            functions: [
                'initialize',
                'getAllOwnedAssets',
                'getSupportedTokensAddresses',
                'getAllAssetsBalancesDebtCoverages',
                'getAllAssetsBalances',
                'getGmTokenBalanceAfterFees',
                'getDebts',
                'getAllAssetsPrices',
                'getContractOwner',
                'getProposedOwner',
                'getStakedPositions',
                'getGmxPositionBenchmark'
            ]
        },
        {
            name: "WithdrawalIntentFacet",
            contractPath: "contracts/facets/WithdrawalIntentFacet.sol:WithdrawalIntentFacet",
            directory: "./contracts/facets",
            functions: [
                'createWithdrawalIntent',
                'executeWithdrawalIntent',
                'cancelWithdrawalIntent',
                'clearExpiredIntents',
                'getUserIntents',
                'getTotalIntentAmount',
                'getAvailableBalance',
                'getAvailableBalancePayable'
            ]
        }
    ];

    console.log("\n🔄 Multi-Facet Diamond Deployment Starting");
    console.log(`Diamond Address: ${DIAMOND_ADDRESS}`);
    console.log(`Facets to deploy: ${facetConfigs.length}`);

    // Initialize rollback data
    const rollbackData = {
        timestamp: new Date().toISOString(),
        diamondAddress: DIAMOND_ADDRESS,
        operations: []
    };

    // Phase 1: Deploy all facets
    console.log("\n" + "=".repeat(50));
    console.log("PHASE 1: DEPLOYING ALL FACETS");
    console.log("=".repeat(50));

    const deployedContracts = [];

    for (const config of facetConfigs) {
        console.log(`\n--- Deploying ${config.name} ---`);
        
        // Embed commit hash
        console.log(`Embedding commit hash for ${config.name}`);
        embedCommitHash(config.name, config.directory);

        // Deploy the facet implementation
        console.log(`Deploying ${config.name}...`);
        const facet = await deploy(config.name, {
            contract: config.contractPath,
            from: deployer,
            args: [],
            gasLimit: 8000000
        });

        const deployedContract = {
            name: config.name,
            address: facet.address,
            contractPath: config.contractPath,
            constructorArguments: [],
            functions: config.functions
        };

        deployedContracts.push(deployedContract);
        console.log(`✅ ${config.name} deployed: ${facet.address}`);

        // Sleep 2 seconds between deployments
        console.log("Waiting 2 seconds...");
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Phase 2: Verify all contracts
    console.log("\n" + "=".repeat(50));
    console.log("PHASE 2: VERIFYING ALL CONTRACTS");
    console.log("=".repeat(50));

    for (const deployedContract of deployedContracts) {
        console.log(`\n--- Verifying ${deployedContract.name} ---`);
        
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
            console.log(`Tenderly verification of ${deployedContract.name}...`);
            await tenderly.verify({
                address: deployedContract.address,
                name: deployedContract.contractPath,
            });
            console.log(`✅ Tenderly verified ${deployedContract.name}`);
        } catch (error) {
            console.error(`❌ Failed Tenderly verification for ${deployedContract.name}:`, error.message);
        }

        // Sleep 3 seconds between verifications
        console.log("Waiting 3 seconds...");
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Phase 3: Prepare Diamond Cuts (BEFORE pausing)
    console.log("\n" + "=".repeat(50));
    console.log("PHASE 3: PREPARING DIAMOND CUTS");
    console.log("=".repeat(50));

    // Get diamond contracts
    const diamondCut = await ethers.getContractAt('IDiamondCut', DIAMOND_ADDRESS);
    const diamondLoupe = await ethers.getContractAt('IDiamondLoupe', DIAMOND_ADDRESS);

    // Prepare all cuts with automatic Add/Replace detection BEFORE pausing
    console.log("\n--- Analyzing Current Diamond State ---");
    const allCuts = [];

    for (const deployedContract of deployedContracts) {
        console.log(`\nProcessing ${deployedContract.name}...`);
        
        const facetContract = await ethers.getContractAt(deployedContract.name, deployedContract.address);
        const selectors = getSelectorsForFunctions(facetContract, deployedContract.functions);
        
        console.log(`  Functions: ${deployedContract.functions.length}`);
        console.log(`  Selectors: ${selectors.length}`);
        console.log(`  New Facet Address: ${deployedContract.address}`);

        // Check each selector to determine Add/Replace/Skip
        const selectorsToAdd = [];
        const selectorsToReplace = [];
        const selectorsSkipped = [];
        const replacementInfo = []; // For rollback data

        for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];
            const functionName = deployedContract.functions[i];
            
            // Get current selector info BEFORE pausing the diamond
            const selectorInfo = await getSelectorInfo(diamondLoupe, selector);
            
            if (!selectorInfo.exists) {
                // Function doesn't exist -> Add
                selectorsToAdd.push(selector);
                console.log(`    ${functionName} (${selector}): ADD (new function)`);
            } else if (selectorInfo.currentAddress.toLowerCase() === deployedContract.address.toLowerCase()) {
                // Function exists and points to the same address -> Skip
                selectorsSkipped.push(selector);
                console.log(`    ${functionName} (${selector}): SKIP (same address: ${selectorInfo.currentAddress})`);
            } else {
                // Function exists but points to different address -> Replace
                selectorsToReplace.push(selector);
                replacementInfo.push({
                    selector: selector,
                    functionName: functionName,
                    previousAddress: selectorInfo.currentAddress,
                    newAddress: deployedContract.address
                });
                console.log(`    ${functionName} (${selector}): REPLACE (${selectorInfo.currentAddress} -> ${deployedContract.address})`);
            }
        }

        // Store rollback information for this facet
        if (selectorsToAdd.length > 0) {
            rollbackData.operations.push({
                facetName: deployedContract.name,
                type: 'ADD',
                selectors: selectorsToAdd,
                newAddress: deployedContract.address,
                functionNames: deployedContract.functions.filter((_, i) => selectorsToAdd.includes(selectors[i]))
            });
        }

        if (selectorsToReplace.length > 0) {
            rollbackData.operations.push({
                facetName: deployedContract.name,
                type: 'REPLACE',
                selectors: selectorsToReplace,
                newAddress: deployedContract.address,
                previousAddress: replacementInfo[0].previousAddress, // All selectors in this facet should have same previous address
                functionNames: replacementInfo.map(info => info.functionName),
                replacementDetails: replacementInfo
            });
        }

        // Create cuts for Add and Replace separately (skip the skipped ones)
        if (selectorsToAdd.length > 0) {
            allCuts.push({
                facetAddress: deployedContract.address,
                action: FacetCutAction.Add,
                functionSelectors: selectorsToAdd
            });
        }

        if (selectorsToReplace.length > 0) {
            allCuts.push({
                facetAddress: deployedContract.address,
                action: FacetCutAction.Replace,
                functionSelectors: selectorsToReplace
            });
        }

        console.log(`  Operations: ${selectorsToAdd.length} Add, ${selectorsToReplace.length} Replace, ${selectorsSkipped.length} Skip`);
        
        if (selectorsSkipped.length > 0) {
            console.log(`  ⚠️  Skipped functions (already pointing to same address): ${selectorsSkipped.length}`);
        }
    }

    console.log(`\nTotal cut operations prepared: ${allCuts.length}`);

    if (allCuts.length === 0) {
        console.log(`\n⚠️  No diamond cuts needed - all functions are already up to date!`);
        console.log(`🎉 Deployment completed - no changes required.`);
        
        // Save empty rollback data
        rollbackData.operations = [];
        saveRollbackData(rollbackData);
        return;
    }

    // Save rollback data before executing cuts
    saveRollbackData(rollbackData);

    // Phase 4: Diamond operations (NOW we can pause safely)
    console.log("\n" + "=".repeat(50));
    console.log("PHASE 4: DIAMOND OPERATIONS");
    console.log("=".repeat(50));

    // Pause the diamond
    console.log("\n--- Pausing Diamond ---");
    let tx = await diamondCut.pause();
    await tx.wait();
    console.log(`✅ Diamond paused (tx: ${tx.hash})`);

    // Execute all diamond cuts in one transaction
    console.log(`\n--- Executing Diamond Cut ---`);
    console.log(`Total cut operations: ${allCuts.length}`);
    
    tx = await diamondCut.diamondCut(allCuts, ethers.constants.AddressZero, "0x", {
        gasLimit: 15000000
    });
    console.log(`Diamond cut tx: ${tx.hash}`);
    
    const receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Diamond cut failed: ${tx.hash}`);
    }
    console.log('✅ Diamond cut completed successfully');

    // Unpause diamond
    console.log("\n--- Unpausing Diamond ---");
    tx = await diamondCut.unpause();
    await tx.wait();
    console.log(`✅ Diamond unpaused (tx: ${tx.hash})`);

    // Phase 5: Summary
    console.log("\n" + "=".repeat(50));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    
    console.log(`\nDiamond Address: ${DIAMOND_ADDRESS}`);
    console.log(`Total Facets Deployed: ${deployedContracts.length}`);
    console.log(`Total Cut Operations: ${allCuts.length}`);
    
    console.log(`\n--- Deployed Facets ---`);
    for (const contract of deployedContracts) {
        console.log(`${contract.name}:`);
        console.log(`  Address: ${contract.address}`);
        console.log(`  Functions: ${contract.functions.length}`);
        console.log(`  Methods: ${contract.functions.join(', ')}`);
        console.log('');
    }

    console.log(`\n--- Cut Operations Summary ---`);
    let totalAdded = 0;
    let totalReplaced = 0;
    
    for (const cut of allCuts) {
        const actionName = cut.action === FacetCutAction.Add ? 'ADD' : 'REPLACE';
        console.log(`${actionName}: ${cut.functionSelectors.length} selectors at ${cut.facetAddress}`);
        
        if (cut.action === FacetCutAction.Add) {
            totalAdded += cut.functionSelectors.length;
        } else {
            totalReplaced += cut.functionSelectors.length;
        }
    }
    
    console.log(`\nTotal Functions Added: ${totalAdded}`);
    console.log(`Total Functions Replaced: ${totalReplaced}`);
    console.log(`\n📋 Rollback data saved - use 'ROLLBACK=true' or '--rollback' to revert this upgrade`);
    console.log(`\n🎉 Multi-facet deployment completed successfully!`);
    console.log(`Diamond is unpaused and ready with all updated facets.`);
};

module.exports.tags = ["deploy-multi-facets-gmx-fees"];