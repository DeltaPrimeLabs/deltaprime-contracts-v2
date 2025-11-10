import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
const web3Abi  = require('web3-eth-abi');
const { ethers } = require("hardhat");
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("GmxV2FacetArbitrum", "./contracts/facets/arbitrum");
    embedCommitHash("GmxV2PlusFacetArbitrum", "./contracts/facets/arbitrum");
    embedCommitHash("GmxV2CallbacksFacetArbitrum", "./contracts/facets/arbitrum");

    let GmxV2CallbacksFacetArbitrum = await deploy("GmxV2CallbacksFacetArbitrum", {
        from: deployer,
        args: [],
    });
    
    
    console.log(
        `GmxV2CallbacksFacetArbitrum implementation deployed at address: ${GmxV2CallbacksFacetArbitrum.address}`
    );
    
    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));
    
    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: GmxV2CallbacksFacetArbitrum.address,
            contract: `contracts/facets/arbitrum/GmxV2CallbacksFacetArbitrum.sol:GmxV2CallbacksFacetArbitrum`,
            constructorArguments: []
        });
        console.log(`✅ Verified GmxV2CallbacksFacetArbitrum`);
    } catch (error) {
        console.error(`❌ Failed to verify GmxV2CallbacksFacetArbitrum:`, error.message);
    }
    
    // Tenderly verification
    try {
        console.log(`Tenderly verification of GmxV2CallbacksFacetArbitrum at:`, GmxV2CallbacksFacetArbitrum.address);
        await tenderly.verify({
            address: GmxV2CallbacksFacetArbitrum.address,
            name: `contracts/facets/arbitrum/GmxV2CallbacksFacetArbitrum.sol:GmxV2CallbacksFacetArbitrum`,
        });
        console.log(`✅ Tenderly verified GmxV2CallbacksFacetArbitrum`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for GmxV2CallbacksFacetArbitrum:`, error.message);
    }

    let GmxV2PlusFacetArbitrum = await deploy("GmxV2PlusFacetArbitrum", {
        from: deployer,
        args: [],
    });

    console.log(
        `GmxV2PlusFacetArbitrum implementation deployed at address: ${GmxV2PlusFacetArbitrum.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: GmxV2PlusFacetArbitrum.address,
            contract: `contracts/facets/arbitrum/GmxV2PlusFacetArbitrum.sol:GmxV2PlusFacetArbitrum`,
            constructorArguments: []
        });
        console.log(`✅ Verified GmxV2PlusFacetArbitrum`);
    } catch (error) {
        console.error(`❌ Failed to verify GmxV2PlusFacetArbitrum:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of GmxV2PlusFacetArbitrum at:`, GmxV2PlusFacetArbitrum.address);
        await tenderly.verify({
            address: GmxV2PlusFacetArbitrum.address,
            name: `contracts/facets/arbitrum/GmxV2PlusFacetArbitrum.sol:GmxV2PlusFacetArbitrum`,
        });
        console.log(`✅ Tenderly verified GmxV2PlusFacetArbitrum`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for GmxV2PlusFacetArbitrum:`, error.message);
    }

    let GmxV2FacetArbitrum = await deploy("GmxV2FacetArbitrum", {
        from: deployer,
        args: [],
    });

    console.log(
        `GmxV2FacetArbitrum implementation deployed at address: ${GmxV2FacetArbitrum.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: GmxV2FacetArbitrum.address,
            contract: `contracts/facets/arbitrum/GmxV2FacetArbitrum.sol:GmxV2FacetArbitrum`,
            constructorArguments: []
        });
        console.log(`✅ Verified GmxV2FacetArbitrum`);
    } catch (error) {
        console.error(`❌ Failed to verify GmxV2FacetArbitrum:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of GmxV2FacetArbitrum at:`, GmxV2FacetArbitrum.address);
        await tenderly.verify({
            address: GmxV2FacetArbitrum.address,
            name: `contracts/facets/arbitrum/GmxV2FacetArbitrum.sol:GmxV2FacetArbitrum`,
        });
        console.log(`✅ Tenderly verified GmxV2FacetArbitrum`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for GmxV2FacetArbitrum:`, error.message);
    }
};

module.exports.tags = ["arbi-gmx-v2"];