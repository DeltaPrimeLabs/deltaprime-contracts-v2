import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("SolvencyFacetProdAvalanche", "./contracts/facets/avalanche");

    let SolvencyFacetProdAvalanche = await deploy("SolvencyFacetProdAvalanche", {
        from: deployer,
        args: [],
    });

    console.log(
        `SolvencyFacetProdAvalanche implementation deployed at address: ${SolvencyFacetProdAvalanche.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: SolvencyFacetProdAvalanche.address,
            contract: `contracts/facets/avalanche/SolvencyFacetProdAvalanche.sol:SolvencyFacetProdAvalanche`,
            constructorArguments: []
        });
        console.log(`✅ Verified SolvencyFacetProdAvalanche`);
    } catch (error) {
        console.error(`❌ Failed to verify SolvencyFacetProdAvalanche:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of SolvencyFacetProdAvalanche at:`, SolvencyFacetProdAvalanche.address);
        await tenderly.verify({
            address: SolvencyFacetProdAvalanche.address,
            name: `contracts/facets/avalanche/SolvencyFacetProdAvalanche.sol:SolvencyFacetProdAvalanche`,
        });
        console.log(`✅ Tenderly verified SolvencyFacetProdAvalanche`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for SolvencyFacetProdAvalanche:`, error.message);
    }
};

module.exports.tags = ["avalanche-solvency-facet"];