// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "./local/DeploymentConstants.sol";
import "./DiamondStorageLib.sol";
import "../interfaces/ITokenManager.sol";
import {IGmxReader} from "../interfaces/gmx-v2/IGmxReader.sol";
import "./SolvencyMethods.sol";

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/gmx-v2/EventUtils.sol";
import "../interfaces/gmx-v2/IDepositUtils.sol";
import "../interfaces/gmx-v2/IWithdrawalUtils.sol";
import "../interfaces/gmx-v2/IGmxV2Router.sol";
import "../interfaces/gmx-v2/BasicMulticall.sol";

abstract contract GmxV2FeesHelper is SolvencyMethods {

    uint256 public constant FEE_PERCENTAGE = 1e17; // 10% (in 1e18 format)

    // Custom Errors
    error InsufficientBalanceAfterFees();
    error InsufficientBalance();
    error InvalidMinOutputValue();
    error ActionMayCauseInsolvency();
    error GmxPlusMarketTokenNotFound();
    error GmxMarketTokensNotFound();
    error InvalidExecutionFee();
    error MarketNotWhitelisted();


    struct GmxPositionDetails {
        uint256 gmTokenPriceUsd; // in 1e8 format
        uint256 underlyingLongTokenAmount; // in longTokenDecimals format
        uint256 underlyingShortTokenAmount; // in shortTokenDecimals format
        uint256 longTokenPriceUsd; // in 1e8 format
        uint256 shortTokenPriceUsd; // in 1e8 format
        uint256 benchmarkTimeStamp; // timestamp of when the benchmark was set
        address longTokenAddress;
        address shortTokenAddress;
    }

    // Unified struct that works for both regular and Plus markets
    struct UnifiedGmxTokenPricesAndAddresses {
        uint256 gmTokenPrice;
        uint256 longTokenPrice;
        uint256 shortTokenPrice; // Always 0 for Plus markets
        address longToken;
        address shortToken; // Same as longToken for Plus markets
        bool isPlusMarket;
    }

    struct FeeCalculationData {
        uint256 currentBalance;
        uint256 currentValueUsd;
        uint256 longTokenValueUsd;
        uint256 shortTokenValueUsd;
        uint256 gmPerformanceUsd;
    }

    struct TokenSupplyData {
        uint256 totalGmSupply;
        uint256 totalLongTokens;
        uint256 totalShortTokens;
    }

    ///@notice GmxTokenPrices struct containing current prices of GM, long, and short tokens in USD (1e8 format)
    struct GmxTokenPrices {
        uint256 gmTokenPrice;
        uint256 longTokenPrice;
        uint256 shortTokenPrice;
    }

    // EVENTS
    event BenchmarkCreated(
        address indexed gmMarket,
        uint256 indexed benchmarkValueUsd,
        uint256 longTokenAmount,
        uint256 shortTokenAmount,
        address longTokenAddress,
        address shortTokenAddress,
        uint256 gmTokenPriceUsd,
        uint256 longTokenPriceUsd,
        uint256 shortTokenPriceUsd,
        uint256 timestamp
    );

    event BenchmarkUpdated(
        address indexed gmMarket,
        uint256 indexed newBenchmarkValueUsd,
        uint256 newLongTokenAmount,
        uint256 newShortTokenAmount,
        uint256 gmTokenPriceUsd,
        uint256 longTokenPriceUsd,
        uint256 shortTokenPriceUsd,
        uint256 timestamp
    );

    event FeesCollected(
        address indexed gmMarket,
        uint256 indexed feeInGmTokens,
        uint256 performanceUsd,
        uint256 currentBalance,
        uint256 timestamp
    );

    event BenchmarkInitiated(
        address indexed gmMarket,
        address indexed initiator,
        bool isPlusMarket,
        uint256 timestamp
    );

    // Unified function that replaces both _getGmxTokenPricesAndAddresses and _getGmxPlusTokenPricesAndAddresses
    function _getUnifiedGmxTokenPricesAndAddresses(address gmMarket) internal view returns (UnifiedGmxTokenPricesAndAddresses memory) {
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();
        bool isPlusMarket = tokenManager.isGmxPlusMarket(gmMarket);
        
        address gmxReader = DeploymentConstants.getGmxReaderAddress();
        address dataStore = DeploymentConstants.getGmxDataStoreAddress();
        IGmxReader.MarketProps memory marketProps = IGmxReader(gmxReader).getMarket(dataStore, gmMarket);
        
        address longToken;
        address shortToken;
        
        if (isPlusMarket) {
            // Plus markets: both long and short are the same token
            longToken = marketProps.longToken;
            shortToken = longToken; // Same token for both
            if (longToken == address(0)) revert GmxPlusMarketTokenNotFound();
        } else {
            // Regular GM markets: different long and short tokens
            longToken = marketProps.longToken;
            shortToken = marketProps.shortToken;
            if (longToken == address(0) || shortToken == address(0)) revert GmxMarketTokensNotFound();
        }
        
        // Get prices - only request unique symbols to avoid duplicate price requests for Plus markets
        bytes32[] memory symbols;
        if (isPlusMarket) {
            symbols = new bytes32[](2); // Only need GM token and the single underlying token
            symbols[0] = tokenManager.tokenAddressToSymbol(gmMarket);
            symbols[1] = tokenManager.tokenAddressToSymbol(longToken);
        } else {
            symbols = new bytes32[](3); // Need GM token, long token, and short token
            symbols[0] = tokenManager.tokenAddressToSymbol(gmMarket);
            symbols[1] = tokenManager.tokenAddressToSymbol(longToken);
            symbols[2] = tokenManager.tokenAddressToSymbol(shortToken);
        }
        
        uint256[] memory prices = getPrices(symbols);
        
        return UnifiedGmxTokenPricesAndAddresses({
            gmTokenPrice: prices[0],
            longTokenPrice: prices[1],
            shortTokenPrice: isPlusMarket ? 0 : prices[2], // 0 for Plus markets to avoid double counting
            longToken: longToken,
            shortToken: shortToken,
            isPlusMarket: isPlusMarket
        });
    }

    // Backward compatibility function that returns only addresses
    function _getMarketTokenAddresses(address gmMarket) internal view returns (address longToken, address shortToken) {
        UnifiedGmxTokenPricesAndAddresses memory unified = _getUnifiedGmxTokenPricesAndAddresses(gmMarket);
        return (unified.longToken, unified.shortToken);
    }

    // Backward compatibility function that returns only prices
    function _getGmxTokenPrices(address gmMarket) internal view returns (GmxTokenPrices memory) {
        UnifiedGmxTokenPricesAndAddresses memory unified = _getUnifiedGmxTokenPricesAndAddresses(gmMarket);
        return GmxTokenPrices({
            gmTokenPrice: unified.gmTokenPrice,
            longTokenPrice: unified.longTokenPrice,
            shortTokenPrice: unified.shortTokenPrice
        });
    }

    function _getUnderlyingTokenDetails(address gmMarket, GmxTokenPrices memory gmTokenPrices, address longToken, address shortToken) internal view returns (uint256 longTokenAmount, uint256 shortTokenAmount) {
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();

        uint256 totalGmSupply = IERC20Metadata(gmMarket).totalSupply();
        uint256 gmTokenAmount = IERC20Metadata(gmMarket).balanceOf(address(this));

        // The GM market contract is the owner of the underlying tokens
        uint256 totalLongTokens = IERC20Metadata(longToken).balanceOf(gmMarket);
        uint256 totalShortTokens;
        if(tokenManager.isGmxPlusMarket(gmMarket)) {
            ///@dev totalShortTokens set to zero for plus markets, which snowballs into shortTokenAmount being zero. 
            ///@dev less code duplication this way: second addition in totalUnderlyingWorth calculation will also be zero
            totalShortTokens = 0;   
        } else {
            totalShortTokens = IERC20Metadata(shortToken).balanceOf(gmMarket);
        }

        uint256 totalGmWorth = totalGmSupply * gmTokenPrices.gmTokenPrice / 1e8;
        uint256 totalUnderlyingWorth = totalLongTokens * gmTokenPrices.longTokenPrice / 1e8 * 1e18 / 10 ** IERC20Metadata(longToken).decimals()
            + totalShortTokens * gmTokenPrices.shortTokenPrice / 1e8 * 1e18 / 10 ** IERC20Metadata(shortToken).decimals();

        uint256 ratio = totalGmWorth * 1e18 / totalUnderlyingWorth;

        // Calculate this position's pro-rata share of the underlying tokens
        longTokenAmount = ratio * gmTokenAmount / 1e18 * totalLongTokens / totalGmSupply;
        shortTokenAmount = ratio * gmTokenAmount / 1e18 * totalShortTokens / totalGmSupply;
    }

    function _createOrUpdatePositionBenchmark(address gmMarket, GmxPositionDetails memory positionDetails) internal {
        uint256 currentBalance = IERC20(gmMarket).balanceOf(address(this));
        uint256 benchmarkValueUsd = (currentBalance * positionDetails.gmTokenPriceUsd) / 1e8; 
        
        DiamondStorageLib.GmxPositionBenchmark memory existingBenchmark = DiamondStorageLib.getGmxPositionBenchmark(gmMarket);
        bool isCreation = !existingBenchmark.exists;
        
        DiamondStorageLib.setGmxPositionBenchmark(
            DiamondStorageLib.GmxPositionBenchmarkParams({
                market: gmMarket,
                benchmarkValueUsd: benchmarkValueUsd,
                longTokenAmount: positionDetails.underlyingLongTokenAmount,
                shortTokenAmount: positionDetails.underlyingShortTokenAmount,
                longToken: positionDetails.longTokenAddress,
                shortToken: positionDetails.shortTokenAddress,
                timestamp: block.timestamp,
                gmTokenPriceUsd: positionDetails.gmTokenPriceUsd,
                longTokenPriceUsd: positionDetails.longTokenPriceUsd,
                shortTokenPriceUsd: positionDetails.shortTokenPriceUsd
            })
        );

        if (isCreation) {
            emit BenchmarkCreated(
                gmMarket,
                benchmarkValueUsd,
                positionDetails.underlyingLongTokenAmount,
                positionDetails.underlyingShortTokenAmount,
                positionDetails.longTokenAddress,
                positionDetails.shortTokenAddress,
                positionDetails.gmTokenPriceUsd,
                positionDetails.longTokenPriceUsd,
                positionDetails.shortTokenPriceUsd,
                block.timestamp
            );
        } else {
            emit BenchmarkUpdated(
                gmMarket,
                benchmarkValueUsd,
                positionDetails.underlyingLongTokenAmount,
                positionDetails.underlyingShortTokenAmount,
                positionDetails.gmTokenPriceUsd,
                positionDetails.longTokenPriceUsd,
                positionDetails.shortTokenPriceUsd,
                block.timestamp
            );
        }
    }

    function _updateBenchmark(
        address gmMarket,
        uint256 gmTokenPriceUsd,
        uint256 longTokenPrice,
        uint256 shortTokenPrice
    ) internal {
        DiamondStorageLib.GmxPositionBenchmark memory benchmark = DiamondStorageLib.getGmxPositionBenchmark(gmMarket);
        TokenSupplyData memory supplyData;
        supplyData.totalGmSupply = IERC20(gmMarket).totalSupply();
        supplyData.totalLongTokens = IERC20(benchmark.longTokenAddress).balanceOf(gmMarket);
        supplyData.totalShortTokens = IERC20(benchmark.shortTokenAddress).balanceOf(gmMarket);
        
        // Check for zero supply to avoid division by zero
        if (supplyData.totalGmSupply == 0) {
            return;
        }
        
        uint256 currentBalance = IERC20(gmMarket).balanceOf(address(this));
        uint256 benchmarkValueUsd = (currentBalance * gmTokenPriceUsd) / 1e8; // currentBalance in 1e18 format
        
        uint256 newUnderlyingLongTokenAmount = (currentBalance * supplyData.totalLongTokens) / supplyData.totalGmSupply;
        uint256 newUnderlyingShortTokenAmount = (currentBalance * supplyData.totalShortTokens) / supplyData.totalGmSupply;
        
        DiamondStorageLib.setGmxPositionBenchmark(
            DiamondStorageLib.GmxPositionBenchmarkParams({
                market: gmMarket,
                benchmarkValueUsd: benchmarkValueUsd,
                longTokenAmount: newUnderlyingLongTokenAmount,
                shortTokenAmount: newUnderlyingShortTokenAmount,
                longToken: benchmark.longTokenAddress,
                shortToken: benchmark.shortTokenAddress,
                timestamp: block.timestamp,
                gmTokenPriceUsd: gmTokenPriceUsd,
                longTokenPriceUsd: longTokenPrice,
                shortTokenPriceUsd: shortTokenPrice
            })
        );

        emit BenchmarkUpdated(
            gmMarket,
            benchmarkValueUsd,
            newUnderlyingLongTokenAmount,
            newUnderlyingShortTokenAmount,
            gmTokenPriceUsd,
            longTokenPrice,
            shortTokenPrice,
            block.timestamp
        );
    }

    /**
     * @dev Sweeps accumulated fees from GM token position and transfers them to treasury
     * @param gmMarket The GM market address
     * @param tokenPrices GmxTokenPrices struct containing current prices of GM, long, and short tokens in USD (1e8 format)
     
     * @return feeInGmTokens The amount of GM tokens collected as fees
     */
    function _sweepFees(
        address gmMarket, 
        GmxTokenPrices memory tokenPrices
    ) internal returns (uint256 feeInGmTokens) {
        DiamondStorageLib.GmxPositionBenchmark memory benchmark = DiamondStorageLib.getGmxPositionBenchmark(gmMarket);
        
        if (!benchmark.exists) {
            return 0;
        }

        if (tokenPrices.gmTokenPrice == 0 || tokenPrices.longTokenPrice == 0) { ///@dev shortTokenPrice can be 0 for GMX Plus markets
            return 0; 
        }
        
        FeeCalculationData memory feeData = _calculateFeeData(
            gmMarket, 
            tokenPrices.gmTokenPrice, 
            tokenPrices.longTokenPrice, 
            tokenPrices.shortTokenPrice, 
            benchmark
        );
        
        if (feeData.currentValueUsd > feeData.longTokenValueUsd + feeData.shortTokenValueUsd) {
            feeInGmTokens = _processFeeCollection(gmMarket, tokenPrices.gmTokenPrice, feeData, benchmark);
        }
    }

    function _getGmAnnualisedPerformance(address gmMarket, uint256 gmTokenPriceUsd, uint256 longTokenPriceUsd, uint256 shortTokenPriceUsd) internal view returns (uint256 gmAnnualPerformance) {
        DiamondStorageLib.GmxPositionBenchmark memory benchmark = DiamondStorageLib.getGmxPositionBenchmark(gmMarket);

        if (!benchmark.exists || benchmark.benchmarkTimeStamp == 0 || block.timestamp <= benchmark.benchmarkTimeStamp) {
            return 0;
        }

        // Current balance and its USD value
        uint256 currentBalance = IERC20(gmMarket).balanceOf(address(this));
        uint256 currentValueUsd = (currentBalance * gmTokenPriceUsd) / 1e8;

        // Calculate USD values with proper decimal handling
        uint256 longTokenValueUsd = _calculateTokenValueUsd(
            benchmark.underlyingLongTokenAmount, 
            longTokenPriceUsd, 
            benchmark.longTokenAddress
        );
        uint256 shortTokenValueUsd = _calculateTokenValueUsd(
            benchmark.underlyingShortTokenAmount, 
            shortTokenPriceUsd, 
            benchmark.shortTokenAddress
        );

        uint256 totalUnderlyingValueUsd = longTokenValueUsd + shortTokenValueUsd;

        // Check for negative performance (no underflow)
        if (currentValueUsd <= totalUnderlyingValueUsd) {
            return 0;
        }

        uint256 gmPerformanceUsd = currentValueUsd - totalUnderlyingValueUsd;
        uint256 timeElapsed = block.timestamp - benchmark.benchmarkTimeStamp;

        // Avoid division precision loss by scaling up first
        // Annual performance = (performance * 365 days) / timeElapsed
        // Annual performance %, scaled to 1e18 = (performance * 1e18 * 365 days) / timeElapsed / currentValue
        gmAnnualPerformance = (gmPerformanceUsd * 1e18 * 365 days) / timeElapsed / currentValueUsd;
    }

    function _getDeductibleFeesInGmTokens(address gmMarket, uint256 gmTokenPriceUsd, uint256 longTokenPriceUsd, uint256 shortTokenPriceUsd) internal view returns (uint256 feeInGmTokens) {
        DiamondStorageLib.GmxPositionBenchmark memory benchmark = DiamondStorageLib.getGmxPositionBenchmark(gmMarket);

        if (!benchmark.exists || gmTokenPriceUsd == 0) {
            return 0;
        }
         
        // Current balance and its USD value
        uint256 currentBalance = IERC20(gmMarket).balanceOf(address(this));
        uint256 currentValueUsd = (currentBalance * gmTokenPriceUsd) / 1e8; // currentBalance in 1e18 format

        // Calculate USD values with proper decimal handling
        uint256 longTokenValueUsd = _calculateTokenValueUsd(
            benchmark.underlyingLongTokenAmount, 
            longTokenPriceUsd, 
            benchmark.longTokenAddress
        );
        uint256 shortTokenValueUsd = _calculateTokenValueUsd(
            benchmark.underlyingShortTokenAmount, 
            shortTokenPriceUsd, 
            benchmark.shortTokenAddress
        );
        
        uint256 totalUnderlyingValueUsd = longTokenValueUsd + shortTokenValueUsd;
        
        // Check for negative performance (no underflow)
        if (currentValueUsd <= totalUnderlyingValueUsd) {
            return 0;
        }

        uint256 gmPerformanceUsd = currentValueUsd - totalUnderlyingValueUsd;

        if (gmPerformanceUsd > 0) {
            uint256 gmPerformanceFeeUsd = (gmPerformanceUsd * FEE_PERCENTAGE) / 1e18;
            // Convert fee in USD back to GM tokens
            feeInGmTokens = (gmPerformanceFeeUsd * 1e8) / gmTokenPriceUsd;
        }
    }

    /**
     * @dev Calculate token value in USD with proper decimal handling
     * @param tokenAmount The token amount (with original token decimals)
     * @param tokenPriceUsd The token price in USD (1e8 format)
     * @param tokenAddress The token contract address
     * @return valueUsd The USD value with 18 decimals
     */
    function _calculateTokenValueUsd(
        uint256 tokenAmount, 
        uint256 tokenPriceUsd, 
        address tokenAddress
    ) private view returns (uint256 valueUsd) {
        if (tokenAmount == 0 || tokenPriceUsd == 0) {
            return 0;
        }

        uint8 decimals = IERC20Metadata(tokenAddress).decimals();
        
        // tokenAmount is stored in native token decimals, but USD calculations 
        // work with 18 decimals, so we need to normalize to 18 decimals
        if (decimals != 18) {
            if (decimals < 18) {
                // Scale UP for tokens with fewer decimals
                tokenAmount = tokenAmount * (10 ** (18 - decimals));
            } else {
                // Scale DOWN for tokens with more decimals
                tokenAmount = tokenAmount / (10 ** (decimals - 18));
            }
        }

        valueUsd = (tokenAmount * tokenPriceUsd) / 1e8;
    }

    function _calculateFeeData(
        address gmMarket,
        uint256 gmTokenPriceUsd,
        uint256 longTokenPriceUsd,
        uint256 shortTokenPriceUsd,
        DiamondStorageLib.GmxPositionBenchmark memory benchmark
    ) private view returns (FeeCalculationData memory feeData) {
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();
        
        feeData.currentBalance = IERC20(gmMarket).balanceOf(address(this));
        feeData.currentValueUsd = (feeData.currentBalance * gmTokenPriceUsd) / 1e8;
        
        // Calculate USD values with proper decimal handling
        feeData.longTokenValueUsd = _calculateTokenValueUsd(
            benchmark.underlyingLongTokenAmount, 
            longTokenPriceUsd, 
            benchmark.longTokenAddress
        );
        feeData.shortTokenValueUsd = _calculateTokenValueUsd(
            benchmark.underlyingShortTokenAmount, 
            shortTokenPriceUsd, 
            benchmark.shortTokenAddress
        );
        
        uint256 totalUnderlyingValueUsd = feeData.longTokenValueUsd + feeData.shortTokenValueUsd;

        // Check for negative performance (no underflow)
        if (feeData.currentValueUsd > totalUnderlyingValueUsd) {
            feeData.gmPerformanceUsd = feeData.currentValueUsd - totalUnderlyingValueUsd;
        } else {
            feeData.gmPerformanceUsd = 0;
        }
    }

    function _processFeeCollection(
        address gmMarket,
        uint256 gmTokenPriceUsd,
        FeeCalculationData memory feeData,
        DiamondStorageLib.GmxPositionBenchmark memory benchmark
    ) private returns (uint256 feeInGmTokens) {
        uint256 gmPerformanceFeeUsd = (feeData.gmPerformanceUsd * FEE_PERCENTAGE) / 1e18;
        
        if (gmPerformanceFeeUsd == 0) {
            return 0;
        }
        
        feeInGmTokens = (gmPerformanceFeeUsd * 1e8) / gmTokenPriceUsd;
        
        // Only process fees if amount is >= 3 wei (to allow proper 1/3, 2/3 split)
        if (feeInGmTokens >= 3 && feeInGmTokens <= feeData.currentBalance) {
            uint256 stabilityPoolFee = feeInGmTokens / 3;
            uint256 treasuryFee = feeInGmTokens - stabilityPoolFee;
            
            IERC20(gmMarket).transfer(DeploymentConstants.getStabilityPoolAddress(), stabilityPoolFee);
            IERC20(gmMarket).transfer(DeploymentConstants.getTreasuryAddress(), treasuryFee);
            
            emit FeesCollected(
                gmMarket,
                feeInGmTokens,
                feeData.gmPerformanceUsd,
                feeData.currentBalance,
                block.timestamp
            );
        } else {
            // If feeInGmTokens < 3, we can't split properly, so return 0
            feeInGmTokens = 0;
        }
    }
}