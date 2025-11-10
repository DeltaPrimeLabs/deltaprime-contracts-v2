import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
const web3Abi  = require('web3-eth-abi');
const { ethers } = require("hardhat");
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("GmxV2FacetAvalanche", "./contracts/facets/avalanche");
    embedCommitHash("GmxV2PlusFacetAvalanche", "./contracts/facets/avalanche");
    embedCommitHash("GmxV2CallbacksFacetAvalanche", "./contracts/facets/avalanche");

    let GmxV2FacetAvalanche = await deploy("GmxV2FacetAvalanche", {
        from: deployer,
        args: [],
    });

    console.log(
        `GmxV2FacetAvalanche implementation deployed at address: ${GmxV2FacetAvalanche.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: GmxV2FacetAvalanche.address,
            contract: `contracts/facets/avalanche/GmxV2FacetAvalanche.sol:GmxV2FacetAvalanche`,
            constructorArguments: []
        });
        console.log(`✅ Verified GmxV2FacetAvalanche`);
    } catch (error) {
        console.error(`❌ Failed to verify GmxV2FacetAvalanche:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of GmxV2FacetAvalanche at:`, GmxV2FacetAvalanche.address);
        await tenderly.verify({
            address: GmxV2FacetAvalanche.address,
            name: `contracts/facets/avalanche/GmxV2FacetAvalanche.sol:GmxV2FacetAvalanche`,
        });
        console.log(`✅ Tenderly verified GmxV2FacetAvalanche`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for GmxV2FacetAvalanche:`, error.message);
    }

    let GmxV2PlusFacetAvalanche = await deploy("GmxV2PlusFacetAvalanche", {
        from: deployer,
        args: [],
    });

    console.log(
        `GmxV2PlusFacetAvalanche implementation deployed at address: ${GmxV2PlusFacetAvalanche.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: GmxV2PlusFacetAvalanche.address,
            contract: `contracts/facets/avalanche/GmxV2PlusFacetAvalanche.sol:GmxV2PlusFacetAvalanche`,
            constructorArguments: []
        });
        console.log(`✅ Verified GmxV2PlusFacetAvalanche`);
    } catch (error) {
        console.error(`❌ Failed to verify GmxV2PlusFacetAvalanche:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of GmxV2PlusFacetAvalanche at:`, GmxV2PlusFacetAvalanche.address);
        await tenderly.verify({
            address: GmxV2PlusFacetAvalanche.address,
            name: `contracts/facets/avalanche/GmxV2PlusFacetAvalanche.sol:GmxV2PlusFacetAvalanche`,
        });
        console.log(`✅ Tenderly verified GmxV2PlusFacetAvalanche`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for GmxV2PlusFacetAvalanche:`, error.message);
    }

    let GmxV2CallbacksFacetAvalanche = await deploy("GmxV2CallbacksFacetAvalanche", {
        from: deployer,
        args: [],
    });

    console.log(
        `GmxV2CallbacksFacetAvalanche implementation deployed at address: ${GmxV2CallbacksFacetAvalanche.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: GmxV2CallbacksFacetAvalanche.address,
            contract: `contracts/facets/avalanche/GmxV2CallbacksFacetAvalanche.sol:GmxV2CallbacksFacetAvalanche`,
            constructorArguments: []
        });
        console.log(`✅ Verified GmxV2CallbacksFacetAvalanche`);
    } catch (error) {
        console.error(`❌ Failed to verify GmxV2CallbacksFacetAvalanche:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of GmxV2CallbacksFacetAvalanche at:`, GmxV2CallbacksFacetAvalanche.address);
        await tenderly.verify({
            address: GmxV2CallbacksFacetAvalanche.address,
            name: `contracts/facets/avalanche/GmxV2CallbacksFacetAvalanche.sol:GmxV2CallbacksFacetAvalanche`,
        });
        console.log(`✅ Tenderly verified GmxV2CallbacksFacetAvalanche`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for GmxV2CallbacksFacetAvalanche:`, error.message);
    }
};

module.exports.tags = ["avax-gmx-v2-redeploy"];