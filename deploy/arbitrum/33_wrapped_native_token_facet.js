import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

const { ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("SmartLoanWrappedNativeTokenFacet", "./contracts/facets");

    let smartLoanWrappedNativeTokenFacet = await deploy("SmartLoanWrappedNativeTokenFacet", {
        from: deployer,
        contract: "contracts/facets/SmartLoanWrappedNativeTokenFacet.sol:SmartLoanWrappedNativeTokenFacet",
        gasLimit: 50000000,
        args: [],
    });

    console.log(`Deployed SmartLoanWrappedNativeTokenFacet at address: ${smartLoanWrappedNativeTokenFacet.address}`);

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: smartLoanWrappedNativeTokenFacet.address,
            contract: "contracts/facets/SmartLoanWrappedNativeTokenFacet.sol:SmartLoanWrappedNativeTokenFacet",
            constructorArguments: []
        });
        console.log(`✅ Verified SmartLoanWrappedNativeTokenFacet`);
    } catch (error) {
        console.error(`❌ Failed to verify SmartLoanWrappedNativeTokenFacet:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of SmartLoanWrappedNativeTokenFacet at:`, smartLoanWrappedNativeTokenFacet.address);
        await tenderly.verify({
            address: smartLoanWrappedNativeTokenFacet.address,
            name: "contracts/facets/SmartLoanWrappedNativeTokenFacet.sol:SmartLoanWrappedNativeTokenFacet",
        });
        console.log(`✅ Tenderly verified SmartLoanWrappedNativeTokenFacet`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for SmartLoanWrappedNativeTokenFacet:`, error.message);
    }
};

module.exports.tags = ["arbitrum-wrapped-native-token-facet"];