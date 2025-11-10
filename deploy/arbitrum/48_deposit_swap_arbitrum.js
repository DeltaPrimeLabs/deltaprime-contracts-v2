import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers } = hre;
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // 1. Deploy the implementation contract with no constructor arguments
    console.log("Deploying DepositSwapArbitrum implementation...");
    const depositSwapImpl = await deploy("DepositSwapArbitrum", {
        from: deployer,
        args: [], // The implementation now has no constructor args
        log: true,
    });

    console.log(
        `DepositSwapArbitrum implementation deployed at address: ${depositSwapImpl.address}`
    );

    // Wait for 10 seconds for the contract to be propagated on the network
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify the implementation contract
    await verifyContract(hre, {
        address: depositSwapImpl.address,
        contract: `contracts/DepositSwapArbitrum.sol:DepositSwapArbitrum`,
        constructorArguments: [], // No constructor arguments
    });
    console.log(`Verified DepositSwapArbitrum implementation`);

    await tenderly.verify({
        address: depositSwapImpl.address,
        name: "DepositSwapArbitrum",
    });
    console.log("Tenderly verification of DepositSwapArbitrum implementation complete.");


    // 2. Deploy the TUP (proxy) and call initialize
    console.log("\nDeploying DepositSwapArbitrumTUP (proxy)...");
    const timelockAddress = "0x43D9A211BDdC5a925fA2b19910D44C51D5c9aa93";
    
    // To call the initializer function, we need to encode the function call
    const depositSwapInterface = new ethers.utils.Interface(depositSwapImpl.abi);
    const initializeData = depositSwapInterface.encodeFunctionData("initialize", ["10000000000000000000000"]);

    // These are the arguments for the TUP proxy's constructor
    const proxyConstructorArgs = [
        depositSwapImpl.address, // The address of the logic/implementation contract
        timelockAddress,         // The address of the admin (Timelock)
        initializeData           // The encoded call to the initialize function
    ];

    const depositSwapProxy = await deploy("DepositSwapArbitrumTUP", {
        from: deployer,
        contract: "contracts/proxies/tup/arbitrum/DepositSwapArbitrumTUP.sol:DepositSwapArbitrumTUP",
        args: proxyConstructorArgs,
        log: true,
    });

    console.log(
        `DepositSwapArbitrumTUP proxy deployed at address: ${depositSwapProxy.address}`
    );
    
    // Wait for 10 seconds for the contract to be propagated on the network
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify the proxy contract
    await verifyContract(hre, {
        address: depositSwapProxy.address,
        contract: `contracts/proxies/tup/arbitrum/DepositSwapArbitrumTUP.sol:DepositSwapArbitrumTUP`,
        constructorArguments: proxyConstructorArgs,
    });
    console.log(`Verified DepositSwapArbitrumTUP proxy`);

    await tenderly.verify({
        address: depositSwapProxy.address,
        name: "DepositSwapArbitrumTUP",
    });
    console.log("Tenderly verification of DepositSwapArbitrumTUP proxy complete.");
};

module.exports.tags = ["arbitrum-deposit-swap"];
