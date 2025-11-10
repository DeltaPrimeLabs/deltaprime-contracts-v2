import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("PrimeLeverageFacet", "./contracts/facets");

    let PrimeLeverageFacet = await deploy("PrimeLeverageFacet", {
        from: deployer,
        args: [],
    });

    console.log(
        `PrimeLeverageFacet implementation deployed at address: ${PrimeLeverageFacet.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: PrimeLeverageFacet.address,
            contract: `contracts/facets/PrimeLeverageFacet.sol:PrimeLeverageFacet`,
            constructorArguments: []
        });
        console.log(`✅ Verified PrimeLeverageFacet`);
    } catch (error) {
        console.error(`❌ Failed to verify PrimeLeverageFacet:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of PrimeLeverageFacet at:`, PrimeLeverageFacet.address);
        await tenderly.verify({
            address: PrimeLeverageFacet.address,
            name: `contracts/facets/PrimeLeverageFacet.sol:PrimeLeverageFacet`,
        });
        console.log(`✅ Tenderly verified PrimeLeverageFacet`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for PrimeLeverageFacet:`, error.message);
    }
};

module.exports.tags = ["arbitrum-prime-leverage-facet"];