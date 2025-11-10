import { embedCommitHash } from "../../tools/scripts/embed-commit-hash";

const { ethers } = require("hardhat");
import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer, admin } = await getNamedAccounts();

    embedCommitHash("HealthMeterFacetProd", "./contracts/facets");

    let HealthMeterFacetProd = await deploy("HealthMeterFacetProd", {
        from: deployer,
        gasLimit: 100000000,
        args: [],
    });

    console.log(
        `HealthMeterFacetProd implementation deployed at address: ${HealthMeterFacetProd.address}`
    );

    // sleep for 10 seconds to wait for the tx to be confirmed
    await new Promise(r => setTimeout(r, 10000));

    // Regular contract verification
    try {
        await verifyContract(hre, {
            address: HealthMeterFacetProd.address,
            contract: `contracts/facets/HealthMeterFacetProd.sol:HealthMeterFacetProd`,
            constructorArguments: []
        });
        console.log(`✅ Verified HealthMeterFacetProd`);
    } catch (error) {
        console.error(`❌ Failed to verify HealthMeterFacetProd:`, error.message);
    }

    // Tenderly verification
    try {
        console.log(`Tenderly verification of HealthMeterFacetProd at:`, HealthMeterFacetProd.address);
        await tenderly.verify({
            address: HealthMeterFacetProd.address,
            name: `contracts/facets/HealthMeterFacetProd.sol:HealthMeterFacetProd`,
        });
        console.log(`✅ Tenderly verified HealthMeterFacetProd`);
    } catch (error) {
        console.error(`❌ Failed Tenderly verification for HealthMeterFacetProd:`, error.message);
    }
};

module.exports.tags = ["arbitrum-health-meter"];