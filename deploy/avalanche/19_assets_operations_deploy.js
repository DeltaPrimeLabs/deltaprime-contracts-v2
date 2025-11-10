import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("AssetsOperationsAvalancheFacet", "./contracts/facets/avalanche");

    let AssetsOperationsAvalancheFacet = await deploy("AssetsOperationsAvalancheFacet", {
        from: deployer,
        args: [],
    });

    console.log(
        `AssetsOperationsAvalancheFacet implementation deployed at address: ${AssetsOperationsAvalancheFacet.address}`
    );

    // sleep 10 seconds
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: AssetsOperationsAvalancheFacet.address,
            contract: `contracts/facets/avalanche/AssetsOperationsAvalancheFacet.sol:AssetsOperationsAvalancheFacet`,
            constructorArguments: []
        });
        console.log(`✅ Verified AssetsOperationsAvalancheFacet`);
    } catch (error) {
        console.error(`❌ Failed to verify AssetsOperationsAvalancheFacet:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of AssetsOperationsAvalancheFacet at:`, AssetsOperationsAvalancheFacet.address);
        await tenderly.verify({
            address: AssetsOperationsAvalancheFacet.address,
            name: `contracts/facets/avalanche/AssetsOperationsAvalancheFacet.sol:AssetsOperationsAvalancheFacet`,
        });
        console.log(`✅ Tenderly verified AssetsOperationsAvalancheFacet`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for AssetsOperationsAvalancheFacet:`, error.message);
    }
};

module.exports.tags = ["avalanche-operations-facet"];