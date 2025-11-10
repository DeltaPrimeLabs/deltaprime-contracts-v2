const { ethers } = require('ethers');

// Contract address
const CONTRACT_ADDRESS = '0xDee388A00bacC746197F6ac64Dc99D4017522349';

// Market addresses
const MARKETS = {
    'GM_ETH_WETH_USDC': '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
    // 'GM_ARB_ARB_USDC': '0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407',
    // 'GM_LINK_LINK_USDC': '0x7f1fa204bb700853D36994DA19F830b6Ad18455C',
    // 'GM_UNI_UNI_USDC': '0xc7Abb2C5f3BF3CEB389dF0Eecd6120D451170B50',
    // 'GM_BTC_WBTC_USDC': '0x47c031236e19d024b42f8AE6780E44A573170703',
    // 'GM_SOL_SOL_USDC': '0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9',
    // 'GM_NEAR_WETH_USDC': '0x63Dc80EE90F26363B3FCD609007CC9e14c8991BE',
    // 'GM_ATOM_WETH_USDC': '0x248C35760068cE009a13076D573ed3497A47bCD4',
    // 'GM_GMX_GMX_USDC': '0x55391D178Ce46e7AC8eaAEa50A72D1A5a8A622Da',
    // 'GM_SUI_WETH_USDC': '0x6Ecf2133E2C9751cAAdCb6958b9654baE198a797',
    // 'GM_SEI_WETH_USDC': '0xB489711B1cB86afDA48924730084e23310EB4883',
    'GM_ETH_WETH': '0x450bb6774Dd8a756274E0ab4107953259d2ac541',
    // 'GM_BTC_WBTC': '0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77',
    // 'GM_GMX_GMX': '0xbD48149673724f9cAeE647bb4e9D9dDaF896Efeb'
};

// Contract ABI for the specific method
const CONTRACT_ABI = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "market",
                "type": "address"
            }
        ],
        "name": "getGmxPositionBenchmark",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "uint256",
                        "name": "benchmarkValueUsd",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "underlyingLongTokenAmount",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "underlyingShortTokenAmount",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "benchmarkTimeStamp",
                        "type": "uint256"
                    },
                    {
                        "internalType": "address",
                        "name": "longTokenAddress",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "shortTokenAddress",
                        "type": "address"
                    },
                    {
                        "internalType": "bool",
                        "name": "exists",
                        "type": "bool"
                    }
                ],
                "internalType": "struct DiamondStorageLib.GmxPositionBenchmark",
                "name": "benchmark",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

// Helper function to format large numbers
function formatNumber(value, decimals = 18) {
    const formatted = ethers.utils.formatUnits(value, decimals);
    return parseFloat(formatted).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6
    });
}

// Helper function to format timestamp
function formatTimestamp(timestamp) {
    if (timestamp.toString() === '0') return 'Not set';
    return new Date(timestamp * 1000).toLocaleString();
}

// Helper function to truncate address
function truncateAddress(address) {
    if (address === ethers.constants.AddressZero) return 'Zero Address';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function main() {
    try {
        console.log('🚀 Starting GMX Position Benchmark Query on Arbitrum\n');
        
        // Connect to Arbitrum network
        const provider = new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
        
        // Test connection
        const network = await provider.getNetwork();
        console.log(`📡 Connected to ${network.name} (Chain ID: ${network.chainId})\n`);
        
        // Create contract instance
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        
        console.log(`📋 Querying contract: ${CONTRACT_ADDRESS}\n`);
        console.log('='.repeat(80));
        
        // Query each market
        for (const [marketName, marketAddress] of Object.entries(MARKETS)) {
            try {
                console.log(`\n🔍 Querying ${marketName}`);
                console.log(`   Market Address: ${marketAddress}`);
                
                const benchmark = await contract.getGmxPositionBenchmark(marketAddress);
                
                console.log(`   ✅ Results:`);
                console.log(`      📊 Benchmark Value USD: $${formatNumber(benchmark.benchmarkValueUsd, 18)}`);
                console.log(`      🔹 Long Token Amount: ${formatNumber(benchmark.underlyingLongTokenAmount)}`);
                console.log(`      🔸 Short Token Amount: ${formatNumber(benchmark.underlyingShortTokenAmount, 6)}`);
                console.log(`      ⏰ Timestamp: ${formatTimestamp(benchmark.benchmarkTimeStamp)}`);
                console.log(`      🎯 Long Token: ${truncateAddress(benchmark.longTokenAddress)}`);
                console.log(`      🎯 Short Token: ${truncateAddress(benchmark.shortTokenAddress)}`);
                console.log(`      ✨ Exists: ${benchmark.exists ? '✅ Yes' : '❌ No'}`);
                
                if (!benchmark.exists) {
                    console.log(`      ⚠️  No benchmark data found for this market`);
                }
                
            } catch (error) {
                console.log(`   ❌ Error querying ${marketName}: ${error.message}`);
            }
            
            console.log('-'.repeat(60));
        }
        
        console.log('\n🎉 Query completed successfully!');
        
    } catch (error) {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main();
}

module.exports = { main };