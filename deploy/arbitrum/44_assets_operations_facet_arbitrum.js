import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

const { ethers } = require("hardhat");
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("AssetsOperationsArbitrumFacet", "./contracts/facets/arbitrum");

    let AssetsOperationsArbitrumFacet = await deploy("AssetsOperationsArbitrumFacet", {
        from: deployer,
        args: [],
    });

    console.log(
        `AssetsOperationsArbitrumFacet implementation deployed at address: ${AssetsOperationsArbitrumFacet.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: AssetsOperationsArbitrumFacet.address,
            contract: `contracts/facets/arbitrum/AssetsOperationsArbitrumFacet.sol:AssetsOperationsArbitrumFacet`,
            constructorArguments: []
        });
        console.log(`✅ Verified AssetsOperationsArbitrumFacet`);
    } catch (error) {
        console.error(`❌ Failed to verify AssetsOperationsArbitrumFacet:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of AssetsOperationsArbitrumFacet at:`, AssetsOperationsArbitrumFacet.address);
        await tenderly.verify({
            address: AssetsOperationsArbitrumFacet.address,
            name: `contracts/facets/arbitrum/AssetsOperationsArbitrumFacet.sol:AssetsOperationsArbitrumFacet`,
        });
        console.log(`✅ Tenderly verified AssetsOperationsArbitrumFacet`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for AssetsOperationsArbitrumFacet:`, error.message);
    }
};

module.exports.tags = ["arbitrum-assets-operations-facet"];