import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers, tenderly } = require("hardhat");

const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

// Helper function to get function selectors from facet
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

    // Check for skip deployment flag
    const SKIP_DEPLOYMENT = process.env.SKIP_DEPLOYMENT === 'true' || process.env.SKIP_DEPLOYMENT === '1';
    
    // Pre-deployed facet addresses (from your previous deployment)
    const preDeployedAddresses = {
        "PrimeLeverageFacet": "0x4d2946ca9452DbE70C226E11A391F1A9f59C7D96",
        "ParaSwapFacet": "0x0aa196A803a1866eC51522ef0e762Bf0aa5986C6",
        "OwnershipFacet": "0x9E8451bD35E5ce3f37387158464E764AC0c36dc7",
        "WithdrawalIntentFacet": "0x5c09b2D5708D8E429A2390b1f16D465d6653cC6d",
        "HealthMeterFacetProd": "0x124b022AD50168E12ED41A87b8559741F333F17f",
        "SmartLoanLiquidationFacet": "0xf5481A987875955adEE06bbF2ECb634B5C7A94A7",
        "SmartLoanViewFacet": "0xae2029E2f6eA0df08D8110b7c1d14a261b6Ef055",
        "SolvencyFacetProdArbitrum": "0x92A7b9cc62c51554482faD5742f7d5c165A8ec1F",
        "GLPFacetArbi": "0x1B8c6Ece5588D21369935A91D3f2459F66F0cbD0",
        "SmartLoanWrappedNativeTokenFacet": "0xa6B4D084448dFAE241929E5F10411bf6D0cBfB09",
        "AssetsOperationsArbitrumFacet": "0xa322e7d160F52e9717EbBBdb8E6Fa4Dc94a4399b",
        "YieldYakSwapArbitrumFacet": "0x85CCd7F149A9b9F400a200017dA752F805De62a5",
        "YieldYakFacetArbi": "0xDB53236D355Aa62ce7b1E349f45cFB4c23c62C7D",
        "BeefyFinanceArbitrumFacet": "0xbc6fF4657e94DfE30704F398f462d6FFf90D2edD",
        "GmxV2FacetArbitrum": "0xaa36D93aDE5B216536CEed1A52d1a2A7De2AD6Ba",
        "GmxV2PlusFacetArbitrum": "0x9709393A0286c28B805cF3f55cd50eb9B0f3a854",
        "GmxV2CallbacksFacetArbitrum": "0xEb1E38d7305b63021B8C4180592226147350e94f",
        "SwapDebtFacet": "0x1B3909F9cc5351302Bbb7f63C66864163422957F",
        "TraderJoeV2ArbitrumFacet": "0x2850261229eC9de391A948987B46629d47f1252D"
    };

    // Facet configurations with their function selectors
    const facetConfigs = [
        // General facets
        {
            name: "PrimeLeverageFacet",
            contractPath: "contracts/facets/PrimeLeverageFacet.sol:PrimeLeverageFacet",
            functions: ['getLeverageTier', 'getLeverageTierFullInfo', 'getPrimeStakedAmount', 'getRequiredPrimeStake', 'deactivatePremiumTier', 'depositPrime', 'liquidatePrimeDebt', 'repayPrimeDebt', 'shouldLiquidatePrimeDebt', 'stakePrimeAndActivatePremium', 'unstakePrime', 'updatePrimeDebt']
        },
        {
            name: "ParaSwapFacet",
            contractPath: "contracts/facets/ParaSwapFacet.sol:ParaSwapFacet",
            functions: ['paraSwapV6', 'paraSwapBeforeLiquidation']
        },
        {
            name: "OwnershipFacet",
            contractPath: "contracts/facets/OwnershipFacet.sol:OwnershipFacet",
            functions: ['proposeOwnershipTransfer', 'acceptOwnership', 'owner', 'proposedOwner', 'pauseAdmin', 'proposedPauseAdmin']
        },
        {
            name: "WithdrawalIntentFacet",
            contractPath: "contracts/facets/WithdrawalIntentFacet.sol:WithdrawalIntentFacet",
            functions: ['createWithdrawalIntent', 'executeWithdrawalIntent', 'cancelWithdrawalIntent', 'clearExpiredIntents', 'getUserIntents', 'getTotalIntentAmount', 'getAvailableBalance', 'getAvailableBalancePayable']
        },
        {
            name: "HealthMeterFacetProd",
            contractPath: "contracts/facets/HealthMeterFacetProd.sol:HealthMeterFacetProd",
            functions: ['getHealthMeter']
        },
        {
            name: "SmartLoanLiquidationFacet",
            contractPath: "contracts/facets/SmartLoanLiquidationFacet.sol:SmartLoanLiquidationFacet",
            functions: ['liquidate', 'snapshotInsolvency', 'whitelistLiquidators', 'delistLiquidators', 'isLiquidatorWhitelisted', 'getLastInsolventTimestamp']
        },
        {
            name: "SmartLoanViewFacet",
            contractPath: "contracts/facets/SmartLoanViewFacet.sol:SmartLoanViewFacet",
            functions: ['initialize', 'getAllAssetsBalances', 'getAllAssetsBalancesDebtCoverages', 'getDebts', 'getPercentagePrecision', 'getAccountFrozenSince', 'getAllAssetsPrices', 'getBalance', 'getSupportedTokensAddresses', 'getAllOwnedAssets', 'getContractOwner', 'getProposedOwner', 'getStakedPositions']
        },
        
        // Arbitrum-specific facets
        {
            name: "SolvencyFacetProdArbitrum",
            contractPath: "contracts/facets/arbitrum/SolvencyFacetProdArbitrum.sol:SolvencyFacetProdArbitrum",
            functions: ['canRepayDebtFully', 'isSolvent', 'getDebtAssets', 'getDebt', 'getDebtPayable', 'getThresholdWeightedValuePayable', 'getPrice', 'getPrices', 'getTotalAssetsValue', 'getThresholdWeightedValue', 'getStakedValue', 'getTotalValue', 'getFullLoanStatus', 'getHealthRatio', 'getTotalTraderJoeV2']
        },
        {
            name: "GLPFacetArbi",
            contractName: "GLPFacetArbi", 
            contractPath: "contracts/facets/arbitrum/GLPFacetArbi.sol:GLPFacetArbi",
            functions: ['claimGLpFees', 'mintAndStakeGlp', 'unstakeAndRedeemGlp']
        },
        {
            name: "SmartLoanWrappedNativeTokenFacet",
            contractPath: "contracts/facets/SmartLoanWrappedNativeTokenFacet.sol:SmartLoanWrappedNativeTokenFacet",
            functions: ['depositNativeToken', 'wrapNativeToken']
        },
        {
            name: "AssetsOperationsArbitrumFacet",
            contractPath: "contracts/facets/arbitrum/AssetsOperationsArbitrumFacet.sol:AssetsOperationsArbitrumFacet",
            functions: ['borrow', 'repay', 'fund', 'fundGLP', 'removeUnsupportedOwnedAsset', 'removeUnsupportedStakedPosition', 'addOwnedAsset', 'withdrawUnsupportedToken', 'unfreezeAccount']
        },
        {
            name: "YieldYakSwapArbitrumFacet",
            contractPath: "contracts/facets/arbitrum/YieldYakSwapArbitrumFacet.sol:YieldYakSwapArbitrumFacet",
            functions: ['yakSwap']
        },
        {
            name: "YieldYakFacetArbi",
            contractPath: "contracts/facets/arbitrum/YieldYakFacetArbi.sol:YieldYakFacetArbi",
            functions: ['stakeGLPYak', 'unstakeGLPYak']
        },
        {
            name: "BeefyFinanceArbitrumFacet",
            contractPath: "contracts/facets/arbitrum/BeefyFinanceArbitrumFacet.sol:BeefyFinanceArbitrumFacet",
            functions: ['stakeGmxBeefy', 'unstakeGmxBeefy']
        },
        {
            name: "GmxV2FacetArbitrum",
            contractPath: "contracts/facets/arbitrum/GmxV2FacetArbitrum.sol:GmxV2FacetArbitrum",
            functions: ['depositEthUsdcGmxV2', 'depositArbUsdcGmxV2', 'depositLinkUsdcGmxV2', 'depositUniUsdcGmxV2', 'depositBtcUsdcGmxV2', 'depositSolUsdcGmxV2', 'depositNearUsdcGmxV2', 'depositAtomUsdcGmxV2', 'depositGmxUsdcGmxV2', 'depositSuiUsdcGmxV2', 'depositSeiUsdcGmxV2', 'withdrawEthUsdcGmxV2', 'withdrawArbUsdcGmxV2', 'withdrawLinkUsdcGmxV2', 'withdrawUniUsdcGmxV2', 'withdrawBtcUsdcGmxV2', 'withdrawSolUsdcGmxV2', 'withdrawNearUsdcGmxV2', 'withdrawAtomUsdcGmxV2', 'withdrawGmxUsdcGmxV2', 'withdrawSuiUsdcGmxV2', 'withdrawSeiUsdcGmxV2']
        },
        {
            name: "GmxV2PlusFacetArbitrum",
            contractPath: "contracts/facets/arbitrum/GmxV2PlusFacetArbitrum.sol:GmxV2PlusFacetArbitrum",
            functions: ['depositBtcGmxV2Plus', 'depositEthGmxV2Plus', 'depositGmxGmxV2Plus', 'withdrawBtcGmxV2Plus', 'withdrawEthGmxV2Plus', 'withdrawGmxGmxV2Plus']
        },
        {
            name: "GmxV2CallbacksFacetArbitrum",
            contractPath: "contracts/facets/arbitrum/GmxV2CallbacksFacetArbitrum.sol:GmxV2CallbacksFacetArbitrum",
            functions: ['afterDepositExecution', 'afterDepositCancellation', 'afterWithdrawalExecution', 'afterWithdrawalCancellation', 'refundExecutionFee']
        },
        {
            name: "SwapDebtFacet",
            contractPath: "contracts/facets/SwapDebtFacet.sol:SwapDebtFacet",
            functions: ['swapDebtParaSwap']
        },
        {
            name: "TraderJoeV2ArbitrumFacet",
            contractPath: "contracts/facets/arbitrum/TraderJoeV2ArbitrumFacet.sol:TraderJoeV2ArbitrumFacet",
            functions: [
                'addLiquidityTraderJoeV2', 
                'removeLiquidityTraderJoeV2', 
                'getOwnedTraderJoeV2Bins',
                'fundLiquidityTraderJoeV2'
            ],
            hardcodedSelectors: ['0x08a766eb', '0xb2af870a']
        }
    ];

    console.log(SKIP_DEPLOYMENT ? "\n🔄 SKIP_DEPLOYMENT mode: Using pre-deployed facets" : "\n🚀 Full deployment mode");

    let deployedContracts = [];

    if (SKIP_DEPLOYMENT) {
        // Use pre-deployed addresses
        console.log("\n=== Using Pre-deployed Facets ===");
        
        for (const config of facetConfigs) {
            const address = preDeployedAddresses[config.name];
            if (!address) {
                throw new Error(`No pre-deployed address found for ${config.name}`);
            }
            
            deployedContracts.push({
                name: config.name,
                address: address,
                contractPath: config.contractPath,
                constructorArguments: [],
                functions: config.functions,
                hardcodedSelectors: config.hardcodedSelectors // Copy hardcoded selectors
            });

            console.log(`${config.name}: ${address} ✓`);
        }
    } else {
        // Full deployment process
        
        // Embed commit hashes for all facets
        console.log("\n=== Embedding Commit Hashes ===");
        facetConfigs.forEach(config => {
            // Extract directory from contract path for embed
            const pathParts = config.contractPath.split('/');
            const directory = pathParts.slice(0, -1).join('/').replace('contracts/', './contracts/');
            
            console.log(`Embedding ${config.name} from ${directory}`);
            embedCommitHash(config.contractName || config.name, directory);
        });

        // Deploy all facet implementations
        console.log("\n=== Deploying Facet Implementations ===");
        for (const config of facetConfigs) {
            console.log(`\nDeploying ${config.name}...`);
            
            const facet = await deploy(config.name, {
                contract: config.contractPath,
                from: deployer,
                args: [],
                gasLimit: 8000000
            });

            deployedContracts.push({
                name: config.name,
                address: facet.address,
                contractPath: config.contractPath,
                constructorArguments: [],
                functions: config.functions,
                hardcodedSelectors: config.hardcodedSelectors // Copy hardcoded selectors
            });

            console.log(`${config.name} deployed: ${facet.address}`);
        }

        // Sleep 5 seconds before verification
        console.log("\nWaiting 5 seconds before verification...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify all deployed facets
        console.log("\n=== Verifying Facets ===");
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
    }

    // Prepare diamond cut operations
    console.log("\n=== Preparing Diamond Cut ===");
    const diamondCut = await ethers.getContractAt('IDiamondCut', DIAMOND_ADDRESS);
    
    // Pause the diamond
    console.log("Pausing diamond...");
    let tx = await diamondCut.pause();
    await tx.wait();
    console.log(`Diamond paused (tx: ${tx.hash})`);

    // Prepare cuts for all facets
    const cuts = [];
    for (const contract of deployedContracts) {
        console.log(`Preparing cut for ${contract.name}...`);
        
        const facetContract = await ethers.getContractAt(contract.name, contract.address);
        let selectors = getSelectorsForFunctions(facetContract, contract.functions);

        // Add hardcoded selectors if they exist
        if (contract.hardcodedSelectors) {
            console.log(`  Adding ${contract.hardcodedSelectors.length} hardcoded selectors for ${contract.name}`);
            selectors = selectors.concat(contract.hardcodedSelectors);
        }

        cuts.push({
            facetAddress: contract.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors
        });
        
        console.log(`  - ${contract.name}: ${selectors.length} selectors prepared`);
    }

    // Execute diamond cut
    console.log(`\nExecuting diamond cut with ${cuts.length} facets...`);
    tx = await diamondCut.diamondCut(cuts, ethers.constants.AddressZero, "0x", {
        gasLimit: 30000000
    });
    console.log(`Diamond cut tx: ${tx.hash}`);
    
    const receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Diamond cut failed: ${tx.hash}`);
    }
    console.log('✅ Diamond cut completed successfully');

    // Unpause diamond
    console.log("\nUnpausing diamond...");
    tx = await diamondCut.unpause();
    await tx.wait();
    console.log(`✅ Diamond unpaused (tx: ${tx.hash})`);

    // Summary
    console.log("\n=== Deployment Summary ===");
    deployedContracts.forEach(contract => {
        console.log(`${contract.name}: ${contract.address} (${contract.functions.length} functions)`);
    });
    
    console.log(`\n=== Diamond Facets Summary ===`);
    console.log(`Diamond Address: ${DIAMOND_ADDRESS}`);
    console.log(`Total Facets Added: ${deployedContracts.length}`);
    console.log(`Total Functions Added: ${deployedContracts.reduce((sum, c) => sum + c.functions.length, 0)}`);
    console.log(`Diamond is unpaused and ready with all production facets`);
    
    console.log(`\n=== Function Distribution ===`);
    deployedContracts.forEach(contract => {
        console.log(`${contract.name}: ${contract.functions.join(', ')}`);
    });
};

module.exports.tags = ["arbitrum-diamond-facets"];