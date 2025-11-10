import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

const { ethers } = require("hardhat");
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("WithdrawalIntentFacet", "./contracts/facets");

    let withdrawalIntentFacet = await deploy("WithdrawalIntentFacet", {
        from: deployer,
        args: [],
    });

    console.log(
        `WithdrawalIntentFacet implementation deployed at address: ${withdrawalIntentFacet.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: withdrawalIntentFacet.address,
            contract: `contracts/facets/WithdrawalIntentFacet.sol:WithdrawalIntentFacet`,
            constructorArguments: []
        });
        console.log(`✅ Verified WithdrawalIntentFacet`);
    } catch (error) {
        console.error(`❌ Failed to verify WithdrawalIntentFacet:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of WithdrawalIntentFacet at:`, withdrawalIntentFacet.address);
        await tenderly.verify({
            address: withdrawalIntentFacet.address,
            name: `contracts/facets/WithdrawalIntentFacet.sol:WithdrawalIntentFacet`,
        });
        console.log(`✅ Tenderly verified WithdrawalIntentFacet`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for WithdrawalIntentFacet:`, error.message);
    }
};

module.exports.tags = ["avalanche-withdrawal-intents-pas"];