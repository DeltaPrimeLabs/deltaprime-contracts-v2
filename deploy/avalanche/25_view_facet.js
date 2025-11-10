import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

const { ethers } = require("hardhat");
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("SmartLoanViewFacet", "./contracts/facets");

    let SmartLoanViewFacet = await deploy("SmartLoanViewFacet", {
        from: deployer,
        gasLimit: 15000000,
        args: [],
    });

    console.log(
        `SmartLoanViewFacet implementation deployed at address: ${SmartLoanViewFacet.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: SmartLoanViewFacet.address,
            contract: `contracts/facets/SmartLoanViewFacet.sol:SmartLoanViewFacet`,
            constructorArguments: []
        });
        console.log(`✅ Verified SmartLoanViewFacet`);
    } catch (error) {
        console.error(`❌ Failed to verify SmartLoanViewFacet:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of SmartLoanViewFacet at:`, SmartLoanViewFacet.address);
        await tenderly.verify({
            address: SmartLoanViewFacet.address,
            name: `contracts/facets/SmartLoanViewFacet.sol:SmartLoanViewFacet`,
        });
        console.log(`✅ Tenderly verified SmartLoanViewFacet`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for SmartLoanViewFacet:`, error.message);
    }
};

module.exports.tags = ["avalanche-view-facet"];