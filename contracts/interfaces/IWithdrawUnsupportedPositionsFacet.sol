// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

/**
 * @title IWithdrawUnsupportedPositionsFacet
 * @notice Interface for withdrawing unsupported asset positions from the contract
 */
interface IWithdrawUnsupportedPositionsFacet {
    // CUSTOM ERRORS
    
    /**
     * @dev Thrown when the owner's balance is incorrect after a transfer
     * @param expected The expected balance after transfer
     * @param actual The actual balance after transfer
     */
    error InvalidOwnerBalanceAfterTransfer(uint256 expected, uint256 actual);
    
    /**
     * @dev Thrown when the contract's balance is not zero after a transfer
     * @param remaining The remaining balance in the contract
     */
    error InvalidContractBalanceAfterTransfer(uint256 remaining);
    
    /**
     * @dev Thrown when attempting to use this method with the PRIME token
     * @param attemptedAsset The address of the PRIME token that was attempted
     */
    error CannotWithdrawPrimeToken(address attemptedAsset);
    
    /**
     * @dev Thrown when the asset is still active in TokenManager
     * @param asset The address of the asset that is still active
     */
    error AssetStillActive(address asset);
    
    /**
     * @dev Thrown when the asset still has a symbol mapping
     * @param asset The address of the asset with symbol mapping
     * @param symbol The symbol that still exists
     */
    error AssetHasSymbolMapping(address asset, bytes32 symbol);
    
    /**
     * @dev Thrown when the asset still has debt coverage
     * @param asset The address of the asset with debt coverage
     * @param coverage The remaining debt coverage value
     */
    error AssetHasDebtCoverage(address asset, uint256 coverage);
    
    /**
     * @dev Thrown when the asset still has tiered debt coverage for BASIC tier
     * @param asset The address of the asset with BASIC tier debt coverage
     * @param coverage The remaining BASIC tier debt coverage value
     */
    error AssetHasBasicTierDebtCoverage(address asset, uint256 coverage);
    
    /**
     * @dev Thrown when the asset still has tiered debt coverage for PREMIUM tier
     * @param asset The address of the asset with PREMIUM tier debt coverage
     * @param coverage The remaining PREMIUM tier debt coverage value
     */
    error AssetHasPremiumTierDebtCoverage(address asset, uint256 coverage);

    // FUNCTIONS
    
    /**
     * @notice Checks if the contract holds any unsupported assets
     * @dev Used by UI to determine whether to display withdrawal options
     * @return True if any unsupported assets exist, false otherwise
     */
    function hasUnsupportedAssets() external view returns (bool);

    /**
     * @notice Withdraws all unsupported asset positions from the contract
     * @dev Gets asset list dynamically from TokenManager - no more hardcoded addresses
     */
    function withdrawUnsupportedPositions() external;

    // EVENTS

    /**
     * @dev Emitted when an unsupported asset is withdrawn
     * @param owner The address of the contract owner performing the withdrawal
     * @param asset The address of the asset token withdrawn
     * @param amount The amount of tokens withdrawn
     * @param timestamp The block timestamp of the withdrawal
     */
    event UnsupportedAssetWithdrawn(
        address indexed owner,
        address indexed asset,
        uint256 amount,
        uint256 timestamp
    );

    /**
     * @dev Emitted when the entire withdrawal process completes
     * @param owner The address of the contract owner who initiated the withdrawal
     * @param totalAssetsWithdrawn The total number of assets withdrawn
     * @param timestamp The block timestamp when the withdrawal completed
     */
    event WithdrawalCompleted(
        address indexed owner,
        uint256 totalAssetsWithdrawn,
        uint256 timestamp
    );
}
