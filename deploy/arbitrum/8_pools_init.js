import TOKEN_ADDRESSES from '../../common/addresses/arbitrum/token_addresses.json';
import hre from "hardhat";
const { ethers } = require("hardhat");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // REPLACE THESE WITH ACTUAL DEPLOYED ADDRESSES
    const WETH_POOL_TUP_ADDRESS = "0x5BFEBc501fC929Aaa152d9EE1196B0A80D8BfdbD";
    const USDC_POOL_TUP_ADDRESS = "0xDD38021d3FB132B644708ee37cbbBfB2269aD3E9";
    
    const WETH_RATES_CALCULATOR_ADDRESS = "0xd00d2b516Dd15F8Ee1A796eB7Ec791099BF09Ced";
    const USDC_RATES_CALCULATOR_ADDRESS = "0x37324842058e8998234006fAB4EeB9D4427cba9A";
    
    const SMART_LOANS_FACTORY_TUP_ADDRESS = "0x97f4C81Be9edD44953Da7A1F289D30d3a47F6E4E";
    
    const WETH_DEPOSIT_INDEX_TUP_ADDRESS = "0x2FE9a14F72986167515b9C88361d1652E2DF415f";
    const WETH_BORROW_INDEX_TUP_ADDRESS = "0x8F0a04FD02b3afba80226c2926cD84b72Bca7890";
    const USDC_DEPOSIT_INDEX_TUP_ADDRESS = "0x097317Eb45eEfe2B789D9DBd58086497E0Ba33a3";
    const USDC_BORROW_INDEX_TUP_ADDRESS = "0x01E113641c0785d4bFF8947e0E7ea6d8074774B8";

    // Pool initialization configurations
    const poolConfigs = [
        {
            name: "WethPool",
            poolAddress: WETH_POOL_TUP_ADDRESS,
            ratesCalculatorAddress: WETH_RATES_CALCULATOR_ADDRESS,
            depositIndexAddress: WETH_DEPOSIT_INDEX_TUP_ADDRESS,
            borrowIndexAddress: WETH_BORROW_INDEX_TUP_ADDRESS,
            tokenAddress: TOKEN_ADDRESSES['ETH']
        },
        {
            name: "UsdcPool",
            poolAddress: USDC_POOL_TUP_ADDRESS,
            ratesCalculatorAddress: USDC_RATES_CALCULATOR_ADDRESS,
            depositIndexAddress: USDC_DEPOSIT_INDEX_TUP_ADDRESS,
            borrowIndexAddress: USDC_BORROW_INDEX_TUP_ADDRESS,
            tokenAddress: TOKEN_ADDRESSES['USDC']
        }
    ];

    // Log initialization parameters for verification
    console.log("\n=== Pool Initialization Parameters ===");
    console.log(`Smart Loans Factory: ${SMART_LOANS_FACTORY_TUP_ADDRESS}`);
    poolConfigs.forEach(config => {
        console.log(`\n${config.name}:`);
        console.log(`  Pool Address: ${config.poolAddress}`);
        console.log(`  Rates Calculator: ${config.ratesCalculatorAddress}`);
        console.log(`  Deposit Index: ${config.depositIndexAddress}`);
        console.log(`  Borrow Index: ${config.borrowIndexAddress}`);
        console.log(`  Token Address: ${config.tokenAddress}`);
    });
    console.log("==========================================\n");

    // Initialize all pools
    console.log("=== Starting Pool Initialization ===");
    for (const config of poolConfigs) {
        await initializePool(config, SMART_LOANS_FACTORY_TUP_ADDRESS);
    }

    console.log("\n=== Initialization Summary ===");
    poolConfigs.forEach(config => {
        console.log(`✅ ${config.name} initialized successfully`);
    });
    console.log("All pools are ready for lending and borrowing operations");
};

async function initializePool(config, smartLoansFactoryAddress) {
    console.log(`\nInitializing ${config.name}...`);
    
    // Get Pool contract factory - use fully qualified name to avoid conflicts
    const poolFactory = await ethers.getContractFactory("contracts/Pool.sol:Pool");
    
    // Initialize the pool through its proxy
    const initializeTx = await poolFactory.attach(config.poolAddress).initialize(
        config.ratesCalculatorAddress,
        smartLoansFactoryAddress,
        config.depositIndexAddress,
        config.borrowIndexAddress,
        config.tokenAddress,
        ZERO_ADDRESS,
        0,
        { gasLimit: 50000000 }
    );

    const receipt = await initializeTx.wait();
    
    console.log(`✅ Initialized ${config.name} (tx: ${initializeTx.hash})`);
    console.log(`   Rates Calculator: ${config.ratesCalculatorAddress}`);
    console.log(`   Borrowers Registry: ${smartLoansFactoryAddress}`);
    console.log(`   Deposit Index: ${config.depositIndexAddress}`);
    console.log(`   Borrow Index: ${config.borrowIndexAddress}`);
    console.log(`   Token Address: ${config.tokenAddress}`);
}

module.exports.tags = ['arbitrum-pools-initialization'];