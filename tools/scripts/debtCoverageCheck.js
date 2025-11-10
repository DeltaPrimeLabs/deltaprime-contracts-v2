#!/usr/bin/env node

const { ethers } = require('ethers');
const fs = require('fs');

// Configuration
const CONFIG = {
  AVALANCHE_RPC_URL: 'https://arb1.arbitrum.io/rpc',
  FACTORY_ADDRESS: '0xFf5e3dDaefF411a1dC6CcE00014e4Bca39265c20',
  TOKEN_MANAGER_ADDRESS: '0x0a0D954d4b0F0b47a5990C0abd179A90fF74E255', // Update this
  BATCH_SIZE: 100,
  IDENTIFIERS_FILE: 'staking_identifiers.json',
  KNOWN_IDENTIFIERS: [
    'AVAX',
    'sAVAX',
    'ggAVAX',
  ]
};

// ABIs
const FACTORY_ABI = [
  "function getAllLoans() view returns (address[] memory accounts)"
];

const ACCOUNT_ABI = [
  "function getStakedPositions() external view returns (tuple(address asset, bytes32 symbol, bytes32 identifier, bytes4 balanceSelector, bytes4 unstakeSelector)[] memory _positions)"
];

const TOKEN_MANAGER_ABI = [
  "function getAllTokenAssets() view returns (bytes32[] memory)",
  "function getAssetAddress(bytes32 _asset, bool allowInactive) view returns (address)",
  "function debtCoverage(address) view returns (uint256)",
  "function debtCoverageStaked(bytes32) view returns (uint256)",
  "function tokenAddressToSymbol(address) view returns (bytes32)",
  "function tieredDebtCoverage(uint8 tier, address tokenAddress) view returns (uint256)",
  "function tieredDebtCoverageStaked(uint8 tier, bytes32 stakedAsset) view returns (uint256)",
  "function setTieredDebtCoverage(uint8 tier, address tokenAddress, uint256 debtCoverageValue)",
  "function setTieredDebtCoverageStaked(uint8 tier, bytes32 stakedAsset, uint256 debtCoverageValue)"
];

class DebtCoverageAnalyzer {
  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(CONFIG.AVALANCHE_RPC_URL);
    this.factory = new ethers.Contract(CONFIG.FACTORY_ADDRESS, FACTORY_ABI, this.provider);
    this.tokenManager = new ethers.Contract(CONFIG.TOKEN_MANAGER_ADDRESS, TOKEN_MANAGER_ABI, this.provider);
  }

  async analyzeDebtCoverages() {
    console.log('🔍 DEBT COVERAGE ANALYSIS');
    console.log('='.repeat(60));
    
    try {
      await this.analyzeRegularDebtCoverages();
      await this.analyzeStakedDebtCoverages();
    } catch (error) {
      console.error('❌ Error analyzing debt coverages:', error.message);
      process.exit(1);
    }
  }

  async analyzeRegularDebtCoverages() {
    console.log('\n📊 REGULAR TOKEN DEBT COVERAGES:');
    console.log('-'.repeat(60));
    
    try {
      const tokenAssets = await this.tokenManager.getAllTokenAssets();
      console.log(`Found ${tokenAssets.length} token assets\n`);
      
      const results = [];
      
      for (const assetBytes32 of tokenAssets) {
        try {
          const tokenAddress = await this.tokenManager.getAssetAddress(assetBytes32, true);
          const debtCoverage = await this.tokenManager.debtCoverage(tokenAddress);
          
          const symbolString = this.bytes32ToString(assetBytes32);
          const coveragePercentage = debtCoverage.mul(100).div(ethers.utils.parseEther('1')).toString();
          
          results.push({
            symbol: symbolString,
            address: tokenAddress,
            coverage: coveragePercentage,
            rawCoverage: debtCoverage.toString()
          });
          
          console.log(`${symbolString.padEnd(12)} | ${tokenAddress} | ${coveragePercentage}%`);
          
        } catch (error) {
          const symbolString = this.bytes32ToString(assetBytes32);
          console.error(`❌ Error processing token asset ${symbolString}:`, error.message);
        }
      }
      
      console.log(`\n✅ Processed ${results.length} regular tokens`);
      return results;
      
    } catch (error) {
      console.error('❌ Error fetching regular debt coverages:', error.message);
      throw error;
    }
  }

  async analyzeStakedDebtCoverages() {
    console.log('\n📊 STAKED ASSET DEBT COVERAGES:');
    console.log('-'.repeat(60));
    
    try {
      const allIdentifiers = this.getAllStakingIdentifiers();
      console.log(`Found ${allIdentifiers.length} staking identifiers to check\n`);
      
      const results = [];
      
      for (const identifier of allIdentifiers) {
        try {
          const identifierBytes32 = ethers.utils.formatBytes32String(identifier);
          const debtCoverageStaked = await this.tokenManager.debtCoverageStaked(identifierBytes32);
          
          const coveragePercentage = debtCoverageStaked.mul(100).div(ethers.utils.parseEther('1')).toString();
          
          results.push({
            identifier: identifier,
            coverage: coveragePercentage,
            rawCoverage: debtCoverageStaked.toString()
          });
          
          if (!debtCoverageStaked.isZero()) {
            console.log(`${identifier.padEnd(12)} | ${coveragePercentage}%`);
          } else {
            console.log(`${identifier.padEnd(12)} | NOT SET (0%)`);
          }
          
        } catch (error) {
          console.error(`❌ Error processing staked identifier ${identifier}:`, error.message);
        }
      }
      
      const nonZeroResults = results.filter(r => r.rawCoverage !== '0');
      console.log(`\n✅ Processed ${results.length} staked identifiers (${nonZeroResults.length} with non-zero coverage)`);
      
      return results;
      
    } catch (error) {
      console.error('❌ Error fetching staked debt coverages:', error.message);
      throw error;
    }
  }

  async fetchStakingIdentifiers() {
    console.log('🔄 FETCHING STAKING IDENTIFIERS FROM ALL ACCOUNTS');
    console.log('='.repeat(60));
    
    try {
      console.log('📋 Fetching all loan accounts...');
      const allAccounts = await this.factory.getAllLoans();
      console.log(`Found ${allAccounts.length} loan accounts\n`);
      
      const allIdentifiers = new Set();
      const batchCount = Math.ceil(allAccounts.length / CONFIG.BATCH_SIZE);
      
      for (let i = 0; i < batchCount; i++) {
        const batchStart = i * CONFIG.BATCH_SIZE;
        const batchEnd = Math.min(batchStart + CONFIG.BATCH_SIZE, allAccounts.length);
        const batch = allAccounts.slice(batchStart, batchEnd);
        
        console.log(`🔄 Processing batch ${i + 1}/${batchCount} (accounts ${batchStart + 1}-${batchEnd})...`);
        
        const batchIdentifiers = await this.processBatch(batch);
        batchIdentifiers.forEach(id => allIdentifiers.add(id));
        
        console.log(`   Found ${batchIdentifiers.length} identifiers in this batch`);
        await this.delay(100);
      }
      
      const uniqueIdentifiers = Array.from(allIdentifiers).sort();
      console.log(`\n✅ Found ${uniqueIdentifiers.length} unique staking identifiers total`);
      
      this.saveIdentifiersToFile(uniqueIdentifiers);
      
      console.log('\n📊 DISCOVERED STAKING IDENTIFIERS:');
      console.log('-'.repeat(40));
      uniqueIdentifiers.forEach((identifier, index) => {
        console.log(`${(index + 1).toString().padStart(3)}. ${identifier}`);
      });
      
      return uniqueIdentifiers;
      
    } catch (error) {
      console.error('❌ Error fetching staking identifiers:', error.message);
      throw error;
    }
  }

  async processBatch(accounts) {
    const identifiers = new Set();
    
    const promises = accounts.map(async (accountAddress) => {
      try {
        const account = new ethers.Contract(accountAddress, ACCOUNT_ABI, this.provider);
        const stakedPositions = await account.getStakedPositions();
        
        return stakedPositions.map(position => {
          const identifier = this.bytes32ToString(position.identifier);
          return identifier;
        }).filter(id => id && id !== '');
        
      } catch (error) {
        return [];
      }
    });
    
    const results = await Promise.allSettled(promises);
    
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        result.value.forEach(id => identifiers.add(id));
      }
    });
    
    return Array.from(identifiers);
  }

  async calculateTierCoverages() {
    console.log('🧮 CALCULATING TIERED DEBT COVERAGES');
    console.log('='.repeat(60));
    
    try {
      console.log('📊 Reading current debt coverages...');
      const regularCoverages = await this.analyzeRegularDebtCoverages();
      const stakedCoverages = await this.analyzeStakedDebtCoverages();
      
      const basicTier = { regular: {}, staked: {} };
      const premiumTier = { regular: {}, staked: {} };
      
      console.log('\n📊 REGULAR TOKEN LEVERAGE CALCULATIONS:');
      console.log('-'.repeat(60));
      
      for (const token of regularCoverages) {
        if (token.rawCoverage !== '0') {
          const currentCoverage = ethers.BigNumber.from(token.rawCoverage);
          const leverage = this.debtCoverageToLeverage(currentCoverage);
          
          basicTier.regular[token.address] = {
            symbol: token.symbol,
            leverage: leverage.toFixed(2),
            debtCoverage: currentCoverage.toString(),
            debtCoverageFormatted: (currentCoverage.mul(100).div(ethers.utils.parseEther('1')).toString()) + '%'
          };
          
          const premiumLeverage = leverage * 2;
          const premiumCoverage = this.leverageToDebtCoverage(premiumLeverage);
          
          premiumTier.regular[token.address] = {
            symbol: token.symbol,
            leverage: premiumLeverage.toFixed(2),
            debtCoverage: premiumCoverage.toString(),
            debtCoverageFormatted: (premiumCoverage.mul(100).div(ethers.utils.parseEther('1')).toString()) + '%'
          };
          
          console.log(`${token.symbol.padEnd(12)} | Current: ${leverage.toFixed(2)}x → BASIC: ${leverage.toFixed(2)}x, PREMIUM: ${premiumLeverage.toFixed(2)}x`);
        }
      }
      
      console.log('\n📊 STAKED ASSET LEVERAGE CALCULATIONS:');
      console.log('-'.repeat(60));
      
      for (const staked of stakedCoverages) {
        if (staked.rawCoverage !== '0') {
          const currentCoverage = ethers.BigNumber.from(staked.rawCoverage);
          const leverage = this.debtCoverageToLeverage(currentCoverage);
          
          const identifierBytes32 = ethers.utils.formatBytes32String(staked.identifier);
          
          basicTier.staked[identifierBytes32] = {
            identifier: staked.identifier,
            leverage: leverage.toFixed(2),
            debtCoverage: currentCoverage.toString(),
            debtCoverageFormatted: (currentCoverage.mul(100).div(ethers.utils.parseEther('1')).toString()) + '%'
          };
          
          const premiumLeverage = leverage * 2;
          const premiumCoverage = this.leverageToDebtCoverage(premiumLeverage);
          
          premiumTier.staked[identifierBytes32] = {
            identifier: staked.identifier,
            leverage: premiumLeverage.toFixed(2),
            debtCoverage: premiumCoverage.toString(),
            debtCoverageFormatted: (premiumCoverage.mul(100).div(ethers.utils.parseEther('1')).toString()) + '%'
          };
          
          console.log(`${staked.identifier.padEnd(12)} | Current: ${leverage.toFixed(2)}x → BASIC: ${leverage.toFixed(2)}x, PREMIUM: ${premiumLeverage.toFixed(2)}x`);
        }
      }
      
      fs.writeFileSync('basic_tier_coverages.json', JSON.stringify(basicTier, null, 2));
      fs.writeFileSync('premium_tier_coverages.json', JSON.stringify(premiumTier, null, 2));
      
      console.log('\n✅ Tier calculations completed!');
      console.log('💾 Saved BASIC tier to: basic_tier_coverages.json');
      console.log('💾 Saved PREMIUM tier to: premium_tier_coverages.json');
      
      return { basicTier, premiumTier };
      
    } catch (error) {
      console.error('❌ Error calculating tier coverages:', error.message);
      throw error;
    }
  }

  async generateMultisigCalldata() {
    console.log('🔧 GENERATING MULTISIG CALLDATA');
    console.log('='.repeat(60));
    
    if (CONFIG.TOKEN_MANAGER_ADDRESS === 'YOUR_TOKEN_MANAGER_ADDRESS_HERE') {
      console.error('❌ TOKEN_MANAGER_ADDRESS must be set in CONFIG before generating calldata');
      return;
    }
    
    try {
      const tiers = [
        { name: 'BASIC', file: 'basic_tier_coverages.json', enum: 0 },
        { name: 'PREMIUM', file: 'premium_tier_coverages.json', enum: 1 }
      ];
      
      for (const tier of tiers) {
        console.log(`\n📋 Processing ${tier.name} tier...`);
        
        if (!fs.existsSync(tier.file)) {
          console.error(`❌ ${tier.file} not found. Run 'calculate' command first.`);
          continue;
        }
        
        const tierData = JSON.parse(fs.readFileSync(tier.file, 'utf8'));
        const transactions = [];
        
        // Generate transactions for regular tokens
        for (const [tokenAddress, data] of Object.entries(tierData.regular)) {
          const calldata = this.tokenManager.interface.encodeFunctionData('setTieredDebtCoverage', [
            tier.enum,
            tokenAddress,
            data.debtCoverage
          ]);
          
          transactions.push({
            to: CONFIG.TOKEN_MANAGER_ADDRESS,
            value: "0",
            data: calldata,
            contractMethod: {
              inputs: [
                { name: "tier", type: "uint8", internalType: "enum LeverageTierLib.LeverageTier" },
                { name: "tokenAddress", type: "address", internalType: "address" },
                { name: "debtCoverageValue", type: "uint256", internalType: "uint256" }
              ],
              name: "setTieredDebtCoverage",
              payable: false
            },
            contractInputsValues: {
              tier: tier.enum.toString(),
              tokenAddress: tokenAddress,
              debtCoverageValue: data.debtCoverage
            }
          });
        }
        
        // Generate transactions for staked assets
        for (const [identifierBytes32, data] of Object.entries(tierData.staked)) {
          const calldata = this.tokenManager.interface.encodeFunctionData('setTieredDebtCoverageStaked', [
            tier.enum,
            identifierBytes32,
            data.debtCoverage
          ]);
          
          transactions.push({
            to: CONFIG.TOKEN_MANAGER_ADDRESS,
            value: "0",
            data: calldata,
            contractMethod: {
              inputs: [
                { name: "tier", type: "uint8", internalType: "enum LeverageTierLib.LeverageTier" },
                { name: "stakedAsset", type: "bytes32", internalType: "bytes32" },
                { name: "debtCoverageValue", type: "uint256", internalType: "uint256" }
              ],
              name: "setTieredDebtCoverageStaked",
              payable: false
            },
            contractInputsValues: {
              tier: tier.enum.toString(),
              stakedAsset: identifierBytes32,
              debtCoverageValue: data.debtCoverage
            }
          });
        }
        
        // Create Gnosis Safe transaction builder format
        const gnosisSafeBatch = {
          version: "1.0",
          chainId: "42161", // Avalanche C-Chain
          createdAt: Date.now(),
          meta: {
            name: `${tier.name} Tier Debt Coverage Settings`,
            description: `Set ${tier.name} tier debt coverage values for tokens and staked assets`,
            txBuilderVersion: "1.17.1",
            createdFromSafeAddress: "",
            createdFromOwnerAddress: "",
            checksum: ""
          },
          transactions: transactions
        };
        
        // Save files
        const gnosisSafeFile = `${tier.name.toLowerCase()}_tier_gnosis_safe.json`;
        fs.writeFileSync(gnosisSafeFile, JSON.stringify(gnosisSafeBatch, null, 2));
        
        console.log(`📝 Generated ${transactions.length} transactions for ${tier.name} tier`);
        console.log(`💾 Saved Gnosis Safe format to: ${gnosisSafeFile}`);
      }
      
      console.log('\n✅ Multisig calldata generation completed!');
      
    } catch (error) {
      console.error('❌ Error generating multisig calldata:', error.message);
      throw error;
    }
  }

  async verifyTierCoverages() {
    console.log('🔍 VERIFYING ON-CHAIN TIER COVERAGES');
    console.log('='.repeat(60));
    
    try {
      const tiers = [
        { name: 'BASIC', file: 'basic_tier_coverages.json', enum: 0 },
        { name: 'PREMIUM', file: 'premium_tier_coverages.json', enum: 1 }
      ];
      
      const verificationResults = {
        totalChecked: 0,
        totalMatches: 0,
        totalMismatches: 0,
        details: []
      };
      
      for (const tier of tiers) {
        console.log(`\n📊 VERIFYING ${tier.name} TIER:`);
        console.log('-'.repeat(50));
        
        if (!fs.existsSync(tier.file)) {
          console.error(`❌ ${tier.file} not found. Run 'calculate' command first.`);
          continue;
        }
        
        const tierData = JSON.parse(fs.readFileSync(tier.file, 'utf8'));
        let tierMatches = 0;
        let tierMismatches = 0;
        
        // Verify regular tokens
        console.log(`\n🔹 Regular Tokens:`);
        for (const [tokenAddress, expectedData] of Object.entries(tierData.regular)) {
          try {
            const onChainValue = await this.tokenManager.tieredDebtCoverage(tier.enum, tokenAddress);
            const expected = ethers.BigNumber.from(expectedData.debtCoverage);
            const matches = onChainValue.eq(expected);
            
            verificationResults.totalChecked++;
            
            if (matches) {
              tierMatches++;
              verificationResults.totalMatches++;
              console.log(`✅ ${expectedData.symbol.padEnd(12)} | Expected: ${expectedData.debtCoverageFormatted} | On-chain: ${onChainValue.mul(100).div(ethers.utils.parseEther('1')).toString()}% | MATCH`);
            } else {
              tierMismatches++;
              verificationResults.totalMismatches++;
              console.log(`❌ ${expectedData.symbol.padEnd(12)} | Expected: ${expectedData.debtCoverageFormatted} | On-chain: ${onChainValue.mul(100).div(ethers.utils.parseEther('1')).toString()}% | MISMATCH`);
              
              verificationResults.details.push({
                tier: tier.name,
                type: 'token',
                asset: expectedData.symbol,
                address: tokenAddress,
                expected: expectedData.debtCoverage,
                onChain: onChainValue.toString(),
                matches: false
              });
            }
            
          } catch (error) {
            console.error(`❌ Error checking ${expectedData.symbol}: ${error.message}`);
          }
        }
        
        // Verify staked assets
        console.log(`\n🔹 Staked Assets:`);
        for (const [identifierBytes32, expectedData] of Object.entries(tierData.staked)) {
          try {
            const onChainValue = await this.tokenManager.tieredDebtCoverageStaked(tier.enum, identifierBytes32);
            const expected = ethers.BigNumber.from(expectedData.debtCoverage);
            const matches = onChainValue.eq(expected);
            
            verificationResults.totalChecked++;
            
            if (matches) {
              tierMatches++;
              verificationResults.totalMatches++;
              console.log(`✅ ${expectedData.identifier.padEnd(12)} | Expected: ${expectedData.debtCoverageFormatted} | On-chain: ${onChainValue.mul(100).div(ethers.utils.parseEther('1')).toString()}% | MATCH`);
            } else {
              tierMismatches++;
              verificationResults.totalMismatches++;
              console.log(`❌ ${expectedData.identifier.padEnd(12)} | Expected: ${expectedData.debtCoverageFormatted} | On-chain: ${onChainValue.mul(100).div(ethers.utils.parseEther('1')).toString()}% | MISMATCH`);
              
              verificationResults.details.push({
                tier: tier.name,
                type: 'staked',
                asset: expectedData.identifier,
                identifier: identifierBytes32,
                expected: expectedData.debtCoverage,
                onChain: onChainValue.toString(),
                matches: false
              });
            }
            
          } catch (error) {
            console.error(`❌ Error checking ${expectedData.identifier}: ${error.message}`);
          }
        }
        
        console.log(`\n📊 ${tier.name} Tier Summary: ${tierMatches} matches, ${tierMismatches} mismatches`);
      }
      
      // Overall summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 VERIFICATION SUMMARY:');
      console.log('='.repeat(60));
      console.log(`Total checked: ${verificationResults.totalChecked}`);
      console.log(`✅ Matches: ${verificationResults.totalMatches}`);
      console.log(`❌ Mismatches: ${verificationResults.totalMismatches}`);
      
      if (verificationResults.totalMismatches === 0) {
        console.log('\n🎉 ALL VERIFICATIONS PASSED! On-chain values match expected values.');
      } else {
        console.log('\n⚠️  VERIFICATION ISSUES FOUND:');
        console.log('\nMismatched assets:');
        verificationResults.details.forEach(detail => {
          if (!detail.matches) {
            console.log(`   • ${detail.tier} ${detail.type}: ${detail.asset}`);
            console.log(`     Expected: ${detail.expected}, On-chain: ${detail.onChain}`);
          }
        });
      }
      
      // Save verification report
      const reportFile = 'verification_report.json';
      fs.writeFileSync(reportFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
          totalChecked: verificationResults.totalChecked,
          totalMatches: verificationResults.totalMatches,
          totalMismatches: verificationResults.totalMismatches,
          successRate: ((verificationResults.totalMatches / verificationResults.totalChecked) * 100).toFixed(2) + '%'
        },
        details: verificationResults.details
      }, null, 2));
      
      console.log(`\n💾 Verification report saved to: ${reportFile}`);
      
      return verificationResults;
      
    } catch (error) {
      console.error('❌ Error verifying tier coverages:', error.message);
      throw error;
    }
  }

  getAllStakingIdentifiers() {
    const knownIdentifiers = CONFIG.KNOWN_IDENTIFIERS;
    const savedIdentifiers = this.loadIdentifiersFromFile();
    
    const allIdentifiers = new Set([...knownIdentifiers, ...savedIdentifiers]);
    return Array.from(allIdentifiers).sort();
  }

  loadIdentifiersFromFile() {
    try {
      if (fs.existsSync(CONFIG.IDENTIFIERS_FILE)) {
        const data = fs.readFileSync(CONFIG.IDENTIFIERS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.warn(`⚠️ Warning: Could not load identifiers from ${CONFIG.IDENTIFIERS_FILE}`);
    }
    return [];
  }

  saveIdentifiersToFile(identifiers) {
    try {
      fs.writeFileSync(CONFIG.IDENTIFIERS_FILE, JSON.stringify(identifiers, null, 2));
      console.log(`💾 Saved ${identifiers.length} identifiers to ${CONFIG.IDENTIFIERS_FILE}`);
    } catch (error) {
      console.error('❌ Error saving identifiers to file:', error.message);
    }
  }

  bytes32ToString(bytes32Value) {
    try {
      if (!bytes32Value || bytes32Value === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return '';
      }
      return ethers.utils.parseBytes32String(bytes32Value);
    } catch {
      return bytes32Value;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  debtCoverageToLeverage(debtCoverage) {
    const debtCoverageFloat = parseFloat(ethers.utils.formatEther(debtCoverage));
    return debtCoverageFloat / (1 - debtCoverageFloat);
  }

  leverageToDebtCoverage(leverage) {
    const exactValues = {
      4: '800000000000000000',
      5: '833333333333333333',
      8: '888888888888888888',
      10: '909090909090909090'
    };
    
    const leverageInt = Math.round(leverage);
    if (exactValues[leverageInt] && Math.abs(leverage - leverageInt) < 0.01) {
      return ethers.BigNumber.from(exactValues[leverageInt]);
    }
    
    const debtCoverageFloat = leverage / (leverage + 1);
    return ethers.utils.parseEther(debtCoverageFloat.toString());
  }
}

function printUsage() {
  console.log('📖 USAGE:');
  console.log('  node debt-coverage-analyzer.js [mode]');
  console.log('');
  console.log('📋 MODES:');
  console.log('  analyze   (default) - Analyze all debt coverages');
  console.log('  fetch               - Fetch staking identifiers from accounts');
  console.log('  calculate           - Calculate BASIC and PREMIUM tier debt coverages');
  console.log('  multisig            - Generate multisig calldata for setting tier coverages');
  console.log('  verify              - Verify on-chain tier coverages match generated values');
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'analyze';
  
  if (CONFIG.TOKEN_MANAGER_ADDRESS === 'YOUR_TOKEN_MANAGER_ADDRESS_HERE') {
    console.error('❌ Please update TOKEN_MANAGER_ADDRESS in the script configuration');
    process.exit(1);
  }
  
  const analyzer = new DebtCoverageAnalyzer();
  
  console.log('🚀 DEBT COVERAGE ANALYZER');
  console.log(`📍 Mode: ${mode}`);
  console.log('');
  
  try {
    switch (mode) {
      case 'analyze':
        await analyzer.analyzeDebtCoverages();
        break;
      case 'fetch':
        await analyzer.fetchStakingIdentifiers();
        break;
      case 'calculate':
        await analyzer.calculateTierCoverages();
        break;
      case 'multisig':
        await analyzer.generateMultisigCalldata();
        break;
      case 'verify':
        await analyzer.verifyTierCoverages();
        break;
      default:
        console.error(`❌ Unknown mode: ${mode}`);
        printUsage();
        process.exit(1);
    }
    
    console.log('\n✅ Operation completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Operation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DebtCoverageAnalyzer, CONFIG };