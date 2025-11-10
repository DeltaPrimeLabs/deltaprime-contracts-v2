const { ethers } = require('ethers');
require('dotenv').config();

// Contract addresses
const PROD_TOKEN_MANAGER = '0x0a0D954d4b0F0b47a5990C0abd179A90fF74E255';
const QA_TOKEN_MANAGER = '0x4f032CC36B72D934551bc0395Df17162eF92D8D9';

// Arbitrum RPC URL - you may need to update this with your preferred RPC
const ARBITRUM_RPC = 'https://1rpc.io/arb';

// TokenManager ABI (minimal ABI with required functions)
const TOKEN_MANAGER_ABI = [
  'function getSupportedTokensAddresses() view returns (address[])',
  'function tokenAddressToSymbol(address) view returns (bytes32)',
  'function tieredDebtCoverage(uint8, address) view returns (uint256)',
  'function addTokenAssets((bytes32,address,uint256)[])',
  'function setTieredDebtCoverage(uint8, address, uint256)',
  'function getAssetAddress(bytes32, bool) view returns (address)',
  'function getAllTokenAssets() view returns (bytes32[])'
];

// Leverage Tiers
const LEVERAGE_TIERS = {
  BASIC: 0,
  PREMIUM: 1
};

async function main() {
  try {
    console.log('🚀 Starting TokenManager synchronization...\n');

    // Setup provider
    const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC);
    
    // Setup wallet for QA operations
    const privateKey = process.env.DP_DEPLOYER_KEY;
    if (!privateKey) {
      throw new Error('DP_DEPLOYER_KEY environment variable not set');
    }
    
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`📋 Using wallet: ${wallet.address}\n`);

    // Setup contract instances
    const prodTokenManager = new ethers.Contract(PROD_TOKEN_MANAGER, TOKEN_MANAGER_ABI, provider);
    const qaTokenManager = new ethers.Contract(QA_TOKEN_MANAGER, TOKEN_MANAGER_ABI, wallet);

    // Step 1: Read from production
    console.log('📖 Reading from production TokenManager...');
    const supportedTokens = await prodTokenManager.getSupportedTokensAddresses();
    console.log(`Found ${supportedTokens.length} supported tokens in production\n`);

    const prodTokenData = [];
    
    for (let i = 0; i < supportedTokens.length; i++) {
      const tokenAddress = supportedTokens[i];
      console.log(`Processing token ${i + 1}/${supportedTokens.length}: ${tokenAddress}`);
      
      try {
        // Get symbol
        const symbol = await prodTokenManager.tokenAddressToSymbol(tokenAddress);
        
        // Get tiered debt coverage for both tiers
        const basicTierCoverage = await prodTokenManager.tieredDebtCoverage(LEVERAGE_TIERS.BASIC, tokenAddress);
        const premiumTierCoverage = await prodTokenManager.tieredDebtCoverage(LEVERAGE_TIERS.PREMIUM, tokenAddress);
        
        const tokenData = {
          address: tokenAddress,
          symbol: symbol,
          basicTierCoverage: basicTierCoverage.toString(),
          premiumTierCoverage: premiumTierCoverage.toString()
        };
        
        prodTokenData.push(tokenData);
        
        console.log(`  Symbol: ${ethers.utils.parseBytes32String(symbol)}`);
        console.log(`  Basic Tier Coverage: ${ethers.utils.formatEther(basicTierCoverage)}`);
        console.log(`  Premium Tier Coverage: ${ethers.utils.formatEther(premiumTierCoverage)}\n`);
        
      } catch (error) {
        console.error(`  ❌ Error processing token ${tokenAddress}:`, error.message);
        continue;
      }
    }

    // Step 2: Check QA environment
    console.log('🔍 Checking QA TokenManager...');
    let qaTokens = [];
    try {
      qaTokens = await qaTokenManager.getSupportedTokensAddresses();
      console.log(`Found ${qaTokens.length} tokens in QA environment\n`);
    } catch (error) {
      console.log('QA environment appears to be empty or inaccessible\n');
    }

    // Step 3: Identify missing tokens
    const missingTokens = prodTokenData.filter(prodToken => 
      !qaTokens.some(qaToken => qaToken.toLowerCase() === prodToken.address.toLowerCase())
    );

    console.log(`📊 Analysis: ${missingTokens.length} tokens need to be added to QA\n`);

    // Step 4: Add missing tokens
    if (missingTokens.length > 0) {
      console.log('➕ Adding missing tokens to QA...');
      
      // Prepare asset structs for batch addition
      const assetsToAdd = missingTokens.map(token => ([
        token.symbol,
        token.address,
        token.basicTierCoverage // Using basic tier as default debt coverage
      ]));

      try {
        console.log('Sending addTokenAssets transaction...');
        const addTx = await qaTokenManager.addTokenAssets(assetsToAdd);
        console.log(`Transaction hash: ${addTx.hash}`);
        
        console.log('Waiting for confirmation...');
        await addTx.wait();
        console.log('✅ Tokens added successfully\n');
        
      } catch (error) {
        console.error('❌ Error adding tokens:', error);
        return;
      }
    }

    // Step 5: Check and set tiered debt coverage only where needed
    console.log('⚙️  Checking and updating tiered debt coverage...');
    
    let coverageUpdates = 0;
    let coverageSkipped = 0;
    
    for (const tokenData of prodTokenData) {
      console.log(`Checking coverage for ${ethers.utils.parseBytes32String(tokenData.symbol)} (${tokenData.address})`);
      
      try {
        // Get current QA coverage for both tiers
        const qaBasicCoverage = await qaTokenManager.tieredDebtCoverage(LEVERAGE_TIERS.BASIC, tokenData.address);
        const qaPremiumCoverage = await qaTokenManager.tieredDebtCoverage(LEVERAGE_TIERS.PREMIUM, tokenData.address);
        
        // Check Basic tier coverage
        if (qaBasicCoverage.toString() !== tokenData.basicTierCoverage) {
          console.log(`  🔄 Basic tier mismatch - Prod: ${ethers.utils.formatEther(tokenData.basicTierCoverage)}, QA: ${ethers.utils.formatEther(qaBasicCoverage)}`);
          console.log(`  Setting Basic tier coverage: ${ethers.utils.formatEther(tokenData.basicTierCoverage)}`);
          
          const basicTx = await qaTokenManager.setTieredDebtCoverage(
            LEVERAGE_TIERS.BASIC, 
            tokenData.address, 
            tokenData.basicTierCoverage
          );
          await basicTx.wait();
          console.log(`  ✅ Basic tier updated`);
          coverageUpdates++;
        } else {
          console.log(`  ✓ Basic tier already matches: ${ethers.utils.formatEther(tokenData.basicTierCoverage)}`);
          coverageSkipped++;
        }

        // Check Premium tier coverage
        if (qaPremiumCoverage.toString() !== tokenData.premiumTierCoverage) {
          console.log(`  🔄 Premium tier mismatch - Prod: ${ethers.utils.formatEther(tokenData.premiumTierCoverage)}, QA: ${ethers.utils.formatEther(qaPremiumCoverage)}`);
          console.log(`  Setting Premium tier coverage: ${ethers.utils.formatEther(tokenData.premiumTierCoverage)}`);
          
          const premiumTx = await qaTokenManager.setTieredDebtCoverage(
            LEVERAGE_TIERS.PREMIUM, 
            tokenData.address, 
            tokenData.premiumTierCoverage
          );
          await premiumTx.wait();
          console.log(`  ✅ Premium tier updated`);
          coverageUpdates++;
        } else {
          console.log(`  ✓ Premium tier already matches: ${ethers.utils.formatEther(tokenData.premiumTierCoverage)}`);
          coverageSkipped++;
        }

        console.log('');
        
      } catch (error) {
        console.error(`  ❌ Error checking/setting coverage for ${tokenData.address}:`, error.message);
        continue;
      }
    }

    console.log(`📈 Coverage update summary: ${coverageUpdates} updates made, ${coverageSkipped} already matched\n`);

    // Step 6: Verification
    console.log('🔐 Verification: Checking QA configuration...');
    const finalQaTokens = await qaTokenManager.getSupportedTokensAddresses();
    console.log(`QA now has ${finalQaTokens.length} supported tokens`);

    let verificationErrors = 0;
    for (const tokenData of prodTokenData) {
      try {
        const qaBasicCoverage = await qaTokenManager.tieredDebtCoverage(LEVERAGE_TIERS.BASIC, tokenData.address);
        const qaPremiumCoverage = await qaTokenManager.tieredDebtCoverage(LEVERAGE_TIERS.PREMIUM, tokenData.address);
        
        const basicMatch = qaBasicCoverage.toString() === tokenData.basicTierCoverage;
        const premiumMatch = qaPremiumCoverage.toString() === tokenData.premiumTierCoverage;
        
        if (!basicMatch || !premiumMatch) {
          console.log(`❌ Mismatch for ${ethers.utils.parseBytes32String(tokenData.symbol)}:`);
          console.log(`  Basic - Prod: ${ethers.utils.formatEther(tokenData.basicTierCoverage)}, QA: ${ethers.utils.formatEther(qaBasicCoverage)}`);
          console.log(`  Premium - Prod: ${ethers.utils.formatEther(tokenData.premiumTierCoverage)}, QA: ${ethers.utils.formatEther(qaPremiumCoverage)}`);
          verificationErrors++;
        }
      } catch (error) {
        console.log(`❌ Verification error for ${tokenData.address}: ${error.message}`);
        verificationErrors++;
      }
    }

    if (verificationErrors === 0) {
      console.log('✅ All tokens successfully synchronized!\n');
    } else {
      console.log(`⚠️  Synchronization completed with ${verificationErrors} verification errors\n`);
    }

    // Summary
    console.log('📋 Summary:');
    console.log(`  • Production tokens: ${supportedTokens.length}`);
    console.log(`  • Valid production tokens: ${prodTokenData.length}`);
    console.log(`  • Tokens added to QA: ${missingTokens.length}`);
    console.log(`  • Coverage updates made: ${coverageUpdates}`);
    console.log(`  • Coverage values already matched: ${coverageSkipped}`);
    console.log(`  • QA tokens after sync: ${finalQaTokens.length}`);
    console.log(`  • Verification errors: ${verificationErrors}`);
    
    console.log('\n🎉 Synchronization process completed!');

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { main };