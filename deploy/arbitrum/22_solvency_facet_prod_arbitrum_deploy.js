import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

const { ethers } = require("hardhat");
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("SolvencyFacetProdArbitrum", "./contracts/facets/arbitrum");

    let SolvencyFacetProdArbitrum = await deploy("SolvencyFacetProdArbitrum", {
        from: deployer,
        gasLimit: 50000000,
        args: [],
    });

    console.log(
        `SolvencyFacetProdArbitrum implementation deployed at address: ${SolvencyFacetProdArbitrum.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: SolvencyFacetProdArbitrum.address,
            contract: `contracts/facets/arbitrum/SolvencyFacetProdArbitrum.sol:SolvencyFacetProdArbitrum`,
            constructorArguments: []
        });
        console.log(`✅ Verified SolvencyFacetProdArbitrum`);
    } catch (error) {
        console.error(`❌ Failed to verify SolvencyFacetProdArbitrum:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of SolvencyFacetProdArbitrum at:`, SolvencyFacetProdArbitrum.address);
        await tenderly.verify({
            address: SolvencyFacetProdArbitrum.address,
            name: `contracts/facets/arbitrum/SolvencyFacetProdArbitrum.sol:SolvencyFacetProdArbitrum`,
        });
        console.log(`✅ Tenderly verified SolvencyFacetProdArbitrum`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for SolvencyFacetProdArbitrum:`, error.message);
    }
};

module.exports.tags = ["arbitrum-solvency-facet"];