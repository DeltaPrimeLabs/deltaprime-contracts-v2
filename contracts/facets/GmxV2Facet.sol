// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: ;
pragma solidity 0.8.17;

import "../ReentrancyGuardKeccak.sol";
import "../OnlyOwnerOrInsolvent.sol";
import "../lib/GmxV2FeesHelper.sol";
import {IGmxReader} from "../interfaces/gmx-v2/IGmxReader.sol";

abstract contract GmxV2Facet is ReentrancyGuardKeccak, OnlyOwnerOrInsolvent, GmxV2FeesHelper {

    using TransferHelper for address;

    // GMX contracts
    function getGmxV2Router() internal pure virtual returns (address);

    function getGmxV2ExchangeRouter() internal pure virtual returns (address);

    function getGmxV2DepositVault() internal pure virtual returns (address);

    function getGmxV2WithdrawalVault() internal pure virtual returns (address);

    function _deposit(
        address gmToken,
        address depositedToken,
        uint256 tokenAmount,
        uint256 minGmAmount,
        uint256 executionFee
    ) internal nonReentrant noBorrowInTheSameBlock onlyOwner notInLiquidation {
        if (executionFee != msg.value) revert InvalidExecutionFee();
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();
        if (!tokenManager.isGmxMarketWhitelisted(gmToken)) revert MarketNotWhitelisted();

        tokenAmount = IERC20(depositedToken).balanceOf(address(this)) < tokenAmount
            ? IERC20(depositedToken).balanceOf(address(this))
            : tokenAmount;

        if (_getAvailableBalancePayable(tokenManager.tokenAddressToSymbol(depositedToken)) < tokenAmount) revert InsufficientBalance();
        
        UnifiedGmxTokenPricesAndAddresses memory pricesAndAddresses = _getUnifiedGmxTokenPricesAndAddresses(gmToken);
        GmxTokenPrices memory gmxTokenPrice = GmxTokenPrices({
            gmTokenPrice: pricesAndAddresses.gmTokenPrice,
            longTokenPrice: pricesAndAddresses.longTokenPrice,
            shortTokenPrice: pricesAndAddresses.shortTokenPrice
        });
        
        {    
            DiamondStorageLib.GmxPositionBenchmark memory benchmark = DiamondStorageLib.getGmxPositionBenchmark(gmToken);
            if(benchmark.exists) {
                uint256 collectedFees = _sweepFees(gmToken, gmxTokenPrice);
                if (collectedFees > 0) {
                    emit FeesSweptDuringOperation(gmToken, collectedFees, "deposit", block.timestamp);
                }
            } 
        }
        {
            bytes[] memory data = new bytes[](3);
            data[0] = abi.encodeWithSelector(
                IGmxV2Router.sendWnt.selector,
                getGmxV2DepositVault(),
                executionFee
            );
            data[1] = abi.encodeWithSelector(
                IGmxV2Router.sendTokens.selector,
                depositedToken,
                getGmxV2DepositVault(),
                tokenAmount
            );
            data[2] = abi.encodeWithSelector(
                IDepositUtils.createDeposit.selector,
                IDepositUtils.CreateDepositParams({
                    addresses: IDepositUtils.CreateDepositParamsAddresses({
                        receiver: address(this),
                        callbackContract: address(this),
                        uiFeeReceiver: address(0),
                        market: gmToken,
                        initialLongToken: pricesAndAddresses.longToken,
                        initialShortToken: pricesAndAddresses.shortToken,
                        longTokenSwapPath: new address[](0),
                        shortTokenSwapPath: new address[](0)
                    }),
                    minMarketTokens: minGmAmount,
                    shouldUnwrapNativeToken: false,
                    executionFee: executionFee,
                    callbackGasLimit: 500000,
                    dataList: new bytes32[](0)
                })
            );

            depositedToken.safeApprove(getGmxV2Router(), 0);
            depositedToken.safeApprove(getGmxV2Router(), tokenAmount);
            BasicMulticall(getGmxV2ExchangeRouter()).multicall{value: msg.value}(data);
        }
        
        // Simulate solvency check using already fetched prices
        {
            // depositedToken is always either longToken or shortToken
            uint256 depositedTokenPrice = (depositedToken == pricesAndAddresses.longToken) ? pricesAndAddresses.longTokenPrice : pricesAndAddresses.shortTokenPrice;

            if (!isWithinBounds(
                (depositedTokenPrice * tokenAmount) /
                    10 ** IERC20Metadata(depositedToken).decimals(), // Deposit Amount In USD
                (minGmAmount * pricesAndAddresses.gmTokenPrice) /
                    10 ** IERC20Metadata(gmToken).decimals()
            )) revert InvalidMinOutputValue();
            
            {
                uint256 gmTokensWeightedUsdValue = (pricesAndAddresses.gmTokenPrice *
                    minGmAmount *
                    tokenManager.tieredDebtCoverage(DiamondStorageLib.getPrimeLeverageTier(), gmToken)) /
                    (10 ** IERC20Metadata(gmToken).decimals() * 1e8);
                if ((_getThresholdWeightedValuePayable() + gmTokensWeightedUsdValue) <= _getDebtPayable()) 
                    revert ActionMayCauseInsolvency();
            }
        }

        // update GMX position benchmark, pass already fetched prices and addresses to save gas
        _updatePositionBenchmark(gmToken, pricesAndAddresses);

        // Freeze account
        DiamondStorageLib.freezeAccount(gmToken);

        tokenManager.increasePendingExposure(
            tokenManager.tokenAddressToSymbol(gmToken),
            address(this),
            (minGmAmount * 1e18) / 10 ** IERC20Metadata(gmToken).decimals()
        );

        // Update exposures
        _syncExposure(tokenManager, depositedToken);

        emit DepositInitiated(gmToken, depositedToken, tokenAmount, minGmAmount, executionFee, block.timestamp);
    }

    ///@dev to be called by the bots, sweeps fees and updates the benchmark
    function sweepFeesAndUpdateBenchMark(address gmToken) external nonReentrant onlyWhitelistedLiquidators remainsSolvent returns (uint256 gmTokensInFees) {
        UnifiedGmxTokenPricesAndAddresses memory pricesAndAddresses = _getUnifiedGmxTokenPricesAndAddresses(gmToken);
        GmxTokenPrices memory gmxTokenPrices = GmxTokenPrices({
            gmTokenPrice: pricesAndAddresses.gmTokenPrice,
            longTokenPrice: pricesAndAddresses.longTokenPrice,
            shortTokenPrice: pricesAndAddresses.shortTokenPrice
        });

        gmTokensInFees = _sweepFees(gmToken, gmxTokenPrices);
        _updatePositionBenchmark(gmToken, pricesAndAddresses);
        
        emit FeesSweptAndBenchmarkUpdated(gmToken, gmTokensInFees, msg.sender, false, block.timestamp);
    }

    function _updatePositionBenchmark(address market, UnifiedGmxTokenPricesAndAddresses memory pricesAndAddresses) internal {
        GmxTokenPrices memory gmxTokenPrices = GmxTokenPrices({
            gmTokenPrice: pricesAndAddresses.gmTokenPrice,
            longTokenPrice: pricesAndAddresses.longTokenPrice,
            shortTokenPrice: pricesAndAddresses.shortTokenPrice
        });
        
        (uint256 longTokenAmount, uint256 shortTokenAmount) = _getUnderlyingTokenDetails(market, gmxTokenPrices, pricesAndAddresses.longToken, pricesAndAddresses.shortToken);
        
        GmxPositionDetails memory positionDetails = GmxPositionDetails({
            underlyingLongTokenAmount: longTokenAmount,
            underlyingShortTokenAmount: shortTokenAmount,
            gmTokenPriceUsd: pricesAndAddresses.gmTokenPrice,
            longTokenPriceUsd: pricesAndAddresses.longTokenPrice,
            shortTokenPriceUsd: pricesAndAddresses.shortTokenPrice,
            benchmarkTimeStamp: block.timestamp,
            longTokenAddress: pricesAndAddresses.longToken,
            shortTokenAddress: pricesAndAddresses.shortToken
        });
        _createOrUpdatePositionBenchmark(market, positionDetails);
    }

    function initiateGmxFeesBenchMark(address gmToken) external onlyWhitelistedLiquidators nonReentrant {
        UnifiedGmxTokenPricesAndAddresses memory pricesAndAddresses = _getUnifiedGmxTokenPricesAndAddresses(gmToken);
        GmxTokenPrices memory gmxTokenPrices = GmxTokenPrices({
            gmTokenPrice: pricesAndAddresses.gmTokenPrice,
            longTokenPrice: pricesAndAddresses.longTokenPrice,
            shortTokenPrice: pricesAndAddresses.shortTokenPrice
        });
        
        (uint256 longTokenAmount, uint256 shortTokenAmount) = _getUnderlyingTokenDetails(gmToken, gmxTokenPrices, pricesAndAddresses.longToken, pricesAndAddresses.shortToken);
        
        GmxPositionDetails memory positionDetails = GmxPositionDetails({
            underlyingLongTokenAmount: longTokenAmount,
            underlyingShortTokenAmount: shortTokenAmount,
            gmTokenPriceUsd: pricesAndAddresses.gmTokenPrice,
            longTokenPriceUsd: pricesAndAddresses.longTokenPrice,
            shortTokenPriceUsd: pricesAndAddresses.shortTokenPrice,
            benchmarkTimeStamp: block.timestamp,
            longTokenAddress: pricesAndAddresses.longToken,
            shortTokenAddress: pricesAndAddresses.shortToken
        });
        _createOrUpdatePositionBenchmark(gmToken, positionDetails);
        
        emit BenchmarkInitiated(gmToken, msg.sender, pricesAndAddresses.isPlusMarket, block.timestamp);
    }

    function getGmPerformance(address gmToken) external view returns (uint256) {
        GmxTokenPrices memory gmxTokenPrices = _getGmxTokenPrices(gmToken);
        return _getGmAnnualisedPerformance(gmToken, gmxTokenPrices.gmTokenPrice, gmxTokenPrices.longTokenPrice, gmxTokenPrices.shortTokenPrice);
    }

    function _withdraw(
        address gmToken,
        uint256 gmAmount,
        uint256 minLongTokenAmount,
        uint256 minShortTokenAmount,
        uint256 executionFee
    )
        internal
        nonReentrant
        noBorrowInTheSameBlock
        onlyOwnerNoStaySolventOrInsolventPayable
    {
        if (executionFee != msg.value) revert InvalidExecutionFee();
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();
        if (!tokenManager.isGmxMarketWhitelisted(gmToken)) revert MarketNotWhitelisted();

        gmAmount = IERC20(gmToken).balanceOf(address(this)) < gmAmount
            ? IERC20(gmToken).balanceOf(address(this))
            : gmAmount;

        if (_getAvailableBalancePayable(tokenManager.tokenAddressToSymbol(gmToken)) < gmAmount) revert InsufficientBalance();
        
        UnifiedGmxTokenPricesAndAddresses memory pricesAndAddresses = _getUnifiedGmxTokenPricesAndAddresses(gmToken);
        GmxTokenPrices memory gmxTokenPrice = GmxTokenPrices({
            gmTokenPrice: pricesAndAddresses.gmTokenPrice,
            longTokenPrice: pricesAndAddresses.longTokenPrice,
            shortTokenPrice: pricesAndAddresses.shortTokenPrice
        });
        
        {
            DiamondStorageLib.GmxPositionBenchmark memory benchmark = DiamondStorageLib.getGmxPositionBenchmark(gmToken);
            if(benchmark.exists) {
                uint256 collectedFees = _sweepFees(gmToken, gmxTokenPrice);
                if (collectedFees > 0) {
                    if (gmAmount <= collectedFees) {
                        revert InsufficientBalanceAfterFees();
                    }
                    gmAmount -= collectedFees;
                    emit FeesSweptDuringOperation(gmToken, collectedFees, "withdraw", block.timestamp);
                }
            } 
        }
        
        bytes[] memory data = new bytes[](3);
        data[0] = abi.encodeWithSelector(
            IGmxV2Router.sendWnt.selector,
            getGmxV2WithdrawalVault(),
            executionFee
        );

        data[1] = abi.encodeWithSelector(
            IGmxV2Router.sendTokens.selector,
            gmToken,
            getGmxV2WithdrawalVault(),
            gmAmount
        );

        data[2] = abi.encodeWithSelector(
            IWithdrawalUtils.createWithdrawal.selector,
            IWithdrawalUtils.CreateWithdrawalParams({
                addresses: IWithdrawalUtils.CreateWithdrawalParamsAddresses({
                    receiver: address(this),
                    callbackContract: address(this),
                    uiFeeReceiver: address(0),
                    market: gmToken,
                    longTokenSwapPath: new address[](0),
                    shortTokenSwapPath: new address[](0)
                }),
                minLongTokenAmount: minLongTokenAmount,
                minShortTokenAmount: minShortTokenAmount,
                shouldUnwrapNativeToken: false,
                executionFee: executionFee,
                callbackGasLimit: 500000,
                dataList: new bytes32[](0)
            })
        );

        IERC20(gmToken).approve(getGmxV2Router(), gmAmount);
        BasicMulticall(getGmxV2ExchangeRouter()).multicall{value: msg.value}(data);

        // Simulate solvency check with already fetched prices and addresses
        if (msg.sender == DiamondStorageLib.contractOwner()) {
            // Only owner can call this method or else it's liquidator when the account is already insolvent
            if (!isWithinBounds(
                (pricesAndAddresses.gmTokenPrice * gmAmount) /
                    10 ** IERC20Metadata(gmToken).decimals(), // Deposit Amount In USD
                (pricesAndAddresses.longTokenPrice * minLongTokenAmount) /
                    10 ** IERC20Metadata(pricesAndAddresses.longToken).decimals() +
                    (pricesAndAddresses.shortTokenPrice * minShortTokenAmount) /
                    10 ** IERC20Metadata(pricesAndAddresses.shortToken).decimals()
            )) revert InvalidMinOutputValue();

            uint256 receivedTokensWeightedUsdValue = (((pricesAndAddresses.longTokenPrice *
                minLongTokenAmount *
                tokenManager.tieredDebtCoverage(DiamondStorageLib.getPrimeLeverageTier(), pricesAndAddresses.longToken)) /
                10 ** IERC20Metadata(pricesAndAddresses.longToken).decimals()) +
                ((pricesAndAddresses.shortTokenPrice *
                    minShortTokenAmount *
                    tokenManager.tieredDebtCoverage(DiamondStorageLib.getPrimeLeverageTier(), pricesAndAddresses.shortToken)) /
                    10 ** IERC20Metadata(pricesAndAddresses.shortToken).decimals())) / 1e8;
            if ((_getThresholdWeightedValuePayable() + receivedTokensWeightedUsdValue) <= _getDebtPayable())
                revert ActionMayCauseInsolvency();
        }

        // Freeze account
        DiamondStorageLib.freezeAccount(gmToken);

        // update position benchmark, pass in already fetched prices and addresses to save gas
        _updatePositionBenchmark(gmToken, pricesAndAddresses);

        tokenManager.increasePendingExposure(
            tokenManager.tokenAddressToSymbol(pricesAndAddresses.longToken),
            address(this),
            (minLongTokenAmount * 1e18) / 10 ** IERC20Metadata(pricesAndAddresses.longToken).decimals()
        );
        tokenManager.increasePendingExposure(
            tokenManager.tokenAddressToSymbol(pricesAndAddresses.shortToken),
            address(this),
            (minShortTokenAmount * 1e18) / 10 ** IERC20Metadata(pricesAndAddresses.shortToken).decimals()
        );

        // Update exposures
        _syncExposure(tokenManager, gmToken);

        emit WithdrawalInitiated(
            gmToken,
            gmAmount,
            minLongTokenAmount,
            minShortTokenAmount,
            executionFee,
            block.timestamp
        );
    }

    modifier onlyOwner() {
        DiamondStorageLib.enforceIsContractOwner();
        _;
    }

    event DepositInitiated(
        address indexed gmToken,
        address indexed depositedToken,
        uint256 tokenAmount,
        uint256 minGmAmount,
        uint256 executionFee,
        uint256 timestamp
    );

    event WithdrawalInitiated(
        address indexed gmToken,
        uint256 gmAmount,
        uint256 minLongTokenAmount,
        uint256 minShortTokenAmount,
        uint256 executionFee,
        uint256 timestamp
    );

    event FeesSweptDuringOperation(
        address indexed gmToken,
        uint256 feesCollected,
        string operationType,
        uint256 timestamp
    );

    event FeesSweptAndBenchmarkUpdated(
        address indexed gmToken,
        uint256 feesCollected,
        address indexed initiator,
        bool isPlusMarket,
        uint256 timestamp
    );
}