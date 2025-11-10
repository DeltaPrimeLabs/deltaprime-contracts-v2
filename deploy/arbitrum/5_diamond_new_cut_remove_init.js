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

    // REPLACE THIS WITH THE ACTUAL DIAMOND ADDRESS FROM FIRST DEPLOYMENT
    const DIAMOND_ADDRESS = "0x968f944e9c43FC8AD80F6C1629F10570a46e2651";

    // Embed commit hash for the new DiamondCutFacet
    embedCommitHash("DiamondCutFacet", "./contracts/facets");

    const contractsToDeploy = [];

    // Deploy new DiamondCutFacet (now with hardcoded diamond address check)
    console.log("\nDeploying new DiamondCutFacet with hardcoded diamond address...");
    const newDiamondCutFacet = await deploy("DiamondCutFacetSecured", {
        contract: "contracts/facets/DiamondCutFacet.sol:DiamondCutFacet",
        from: deployer,
        args: [],
        gasLimit: 8000000
    });

    contractsToDeploy.push({
        name: "DiamondCutFacetSecured",
        address: newDiamondCutFacet.address,
        contractPath: "contracts/facets/DiamondCutFacet.sol:DiamondCutFacet",
        constructorArguments: []
    });

    console.log(`New DiamondCutFacet deployed: ${newDiamondCutFacet.address}`);

    // Sleep 5 seconds before verification
    console.log("\nWaiting 5 seconds before verification...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify new DiamondCutFacet
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

    // Now perform the upgrade
    console.log(`\nStarting DiamondCutFacet upgrade process...`);
    
    // Get the diamond contract
    const diamondCut = await ethers.getContractAt('IDiamondCut', DIAMOND_ADDRESS);
    
    // Pause the diamond
    console.log("Pausing diamond...");
    let tx = await diamondCut.pause();
    let receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Diamond pause failed: ${tx.hash}`);
    }
    console.log(`Diamond paused (tx: ${tx.hash})`);

    // Prepare the cut to replace DiamondCutFacet AND remove DiamondInit
    const newDiamondCutFacetContract = await ethers.getContractAt("DiamondCutFacet", newDiamondCutFacet.address);
    
    // Get DiamondInit selectors to remove them
    const diamondInitContract = await ethers.getContractAt("DiamondInit", ethers.constants.AddressZero);
    const diamondInitSelectors = getSelectors(diamondInitContract);
    
    const cut = [
        // Replace DiamondCutFacet with secured version
        {
            facetAddress: newDiamondCutFacet.address,
            action: FacetCutAction.Replace,
            functionSelectors: getSelectors(newDiamondCutFacetContract)
        },
        // Remove DiamondInit facet selectors
        {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: diamondInitSelectors
        }
    ];

    // Execute diamond cut to replace DiamondCutFacet and remove DiamondInit
    console.log("Replacing DiamondCutFacet with secured version and removing DiamondInit...");
    tx = await diamondCut.diamondCut(cut, ethers.constants.AddressZero, "0x", {
        gasLimit: 20000000
    });
    console.log(`Diamond upgrade tx: ${tx.hash}`);
    
    receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    console.log('Completed DiamondCutFacet upgrade and DiamondInit removal');

    // Unpause diamond
    console.log("Unpausing diamond...");
    tx = await diamondCut.unpause();
    receipt = await tx.wait();
    if (!receipt.status) {
        throw Error(`Diamond unpause failed: ${tx.hash}`);
    }
    console.log(`Diamond unpaused (tx: ${tx.hash})`);

    console.log("\n=== Upgrade Summary ===");
    contractsToDeploy.forEach(contract => {
        console.log(`${contract.name}: ${contract.address}`);
    });
    
    console.log(`\n=== Upgrade Complete ===`);
    console.log(`Diamond Address: ${DIAMOND_ADDRESS}`);
    console.log(`Old DiamondCutFacet replaced with secured version at: ${newDiamondCutFacet.address}`);
    console.log(`DiamondInit facet selectors removed for security (no longer callable)`);
    console.log(`Diamond now has hardcoded address security check enabled`);
    console.log(`Diamond is unpaused and ready for use`);
};

module.exports.tags = ["arbitrum-diamond-cut-upgrade"];