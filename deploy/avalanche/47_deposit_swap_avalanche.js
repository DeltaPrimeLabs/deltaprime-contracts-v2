import verifyContract from "../../tools/scripts/verify-contract";
import hre from "hardhat";
const { ethers } = hre;
const { tenderly } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // 1. Deploy the implementation contract with no constructor arguments
    console.log("Deploying DepositSwapAvalanche implementation...");
    const depositSwapImpl = await deploy("DepositSwapAvalanche", {
        from: deployer,
        args: [], // The implementation now has no constructor args
        log: true,
    });

    console.log(
        `DepositSwapAvalanche implementation deployed at address: ${depositSwapImpl.address}`
    );

    // Wait for 10 seconds for the contract to be propagated on the network
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify the implementation contract
    await verifyContract(hre, {
        address: depositSwapImpl.address,
        contract: `contracts/DepositSwapAvalanche.sol:DepositSwapAvalanche`,
        constructorArguments: [], // No constructor arguments
    });
    console.log(`Verified DepositSwapAvalanche implementation`);

    await tenderly.verify({
        address: depositSwapImpl.address,
        name: "DepositSwapAvalanche",
    });
    console.log("Tenderly verification of DepositSwapAvalanche implementation complete.");


    // 2. Deploy the TUP (proxy) and call initialize
    console.log("\nDeploying DepositSwapAvalancheTUP (proxy)...");
    const timelockAddress = "0x5C31bF6E2E9565B854E7222742A9a8e3f78ff358";
    
    // To call the initializer function, we need to encode the function call
    const depositSwapInterface = new ethers.utils.Interface(depositSwapImpl.abi);
    const initializeData = depositSwapInterface.encodeFunctionData("initialize", ["10000000000000000000000"]);

    // These are the arguments for the TUP proxy's constructor
    const proxyConstructorArgs = [
        depositSwapImpl.address, // The address of the logic/implementation contract
        timelockAddress,         // The address of the admin (Timelock)
        initializeData           // The encoded call to the initialize function
    ];

    const depositSwapProxy = await deploy("DepositSwapAvalancheTUP", {
        from: deployer,
        contract: "contracts/proxies/tup/avalanche/DepositSwapAvalancheTUP.sol:DepositSwapAvalancheTUP",
        args: proxyConstructorArgs,
        log: true,
    });

    console.log(
        `DepositSwapAvalancheTUP proxy deployed at address: ${depositSwapProxy.address}`
    );
    
    // Wait for 10 seconds for the contract to be propagated on the network
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Verify the proxy contract
    await verifyContract(hre, {
        address: depositSwapProxy.address,
        contract: `contracts/proxies/tup/avalanche/DepositSwapAvalancheTUP.sol:DepositSwapAvalancheTUP`,
        constructorArguments: proxyConstructorArgs,
    });
    console.log(`Verified DepositSwapAvalancheTUP proxy`);

    await tenderly.verify({
        address: depositSwapProxy.address,
        name: "DepositSwapAvalancheTUP",
    });
    console.log("Tenderly verification of DepositSwapAvalancheTUP proxy complete.");
};

module.exports.tags = ["avalanche-deposit-swap"];
