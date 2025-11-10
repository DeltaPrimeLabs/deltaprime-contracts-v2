// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../../lib/LeverageTierLib.sol";

/**
 * @title IPrimeLeverageFacet
 * @dev Interface for the Prime Leverage Facet contract
 */
interface IPrimeLeverageFacet {
    
    // ============ EVENTS ============
    
    /**
     * @dev Emitted when a user's leverage tier changes
     * @param user The user whose tier changed
     * @param oldTier The previous leverage tier
     * @param newTier The new leverage tier
     * @param timestamp When the change occurred
     */
    event LeverageTierChanged(
        address indexed user, 
        LeverageTierLib.LeverageTier indexed oldTier, 
        LeverageTierLib.LeverageTier indexed newTier, 
        uint256 timestamp
    );
    
    /**
     * @dev Emitted when PRIME tokens are staked
     * @param user The user who staked
     * @param amount The amount staked
     * @param totalStaked The total amount staked after this operation
     * @param timestamp When the staking occurred
     */
    event PrimeStaked(
        address indexed user, 
        uint256 amount, 
        uint256 totalStaked, 
        uint256 timestamp
    );
    
    /**
     * @dev Emitted when PRIME tokens are unstaked
     * @param user The user who unstaked
     * @param amount The amount unstaked
     * @param totalStaked The total amount staked after this operation
     * @param timestamp When the unstaking occurred
     */
    event PrimeUnstaked(
        address indexed user, 
        uint256 amount, 
        uint256 totalStaked, 
        uint256 timestamp
    );
    
    /**
     * @dev Emitted when PRIME debt is repaid
     * @param user The user who repaid debt
     * @param amount The amount repaid
     * @param remainingDebt The remaining debt after repayment
     * @param timestamp When the repayment occurred
     */
    event PrimeDebtRepaid(
        address indexed user, 
        uint256 amount, 
        uint256 remainingDebt, 
        uint256 timestamp
    );
    
    /**
     * @dev Emitted when PRIME debt is liquidated
     * @param user The user whose debt was liquidated
     * @param amount The amount liquidated
     * @param timestamp When the liquidation occurred
     */
    event PrimeLiquidated(
        address indexed user, 
        uint256 amount, 
        uint256 timestamp
    );
    

    
    // ============ FUNCTIONS ============


    /**
    * @dev Deposits PRIME tokens to fund a loan, an alternative to AssetsOperationsFacet:fund()
    * @param _amount The amount of PRIME to deposit
    * @notice This function allows users to fund their loans with PRIME tokens.
    * It updates the user's exposure in the TokenManager and emits a Funded event.
     */
    function depositPrime( uint256 _amount) external;
    
    
    
    /**
     * @dev Stakes PRIME and activates PREMIUM tier in one transaction
     */
    function stakePrimeAndActivatePremium() external;
    
    /**
     * @dev Deactivates PREMIUM tier back to BASIC tier
     * @param withdrawStake Whether to withdraw excess staked PRIME
     */
    function deactivatePremiumTier(bool withdrawStake) external;
    
    
    /**
     * @dev Returns the amount of PRIME currently staked
     * @return The staked PRIME amount
     */
    function getPrimeStakedAmount() external view returns (uint256);
    
    /**
     * @dev Unstakes PRIME tokens (if requirements are still met)
     * @param amount Amount of PRIME to unstake
     */
    function unstakePrime(uint256 amount) external;
    
    /**
     * @dev Updates the recorded Prime debt with accrued amount
     */
    function updatePrimeDebt() external;
    
    /**
     * @dev Repays Prime debt using PRIME tokens
     * @param amount Amount of PRIME to use for debt repayment
     */
    function repayPrimeDebt(uint256 amount) external;
    
    /**
     * @dev Returns required Prime stake for a specific tier and borrowed amount
     * @param tier The leverage tier
     * @param borrowedValue The total borrowed value in USD
     * @return The required PRIME stake amount
     */
    function getRequiredPrimeStake(
        LeverageTierLib.LeverageTier tier, 
        uint256 borrowedValue
    ) external view returns (uint256);
    
    /**
     * @dev Returns current leverage tier
     * @return The current leverage tier
     */
    function getLeverageTier() external view returns (LeverageTierLib.LeverageTier);
    
    /**
     * @dev Returns leverage tier information for UI display
     * @return currentTier The current leverage tier
     * @return stakedPrime Amount of PRIME currently staked
     * @return recordedDebt Recorded PRIME debt amount
     */
    function getLeverageTierFullInfo() external view returns (
        LeverageTierLib.LeverageTier currentTier,
        uint256 stakedPrime,
        uint256 recordedDebt
    );
    
    /**
     * @dev Checks if Prime liquidation should trigger
     * @return Whether liquidation should be triggered
     */
    function shouldLiquidatePrimeDebt() external returns (bool);
    
    /**
     * @dev Emergency liquidation of Prime debt (only callable by whitelisted liquidators)
     */
    function liquidatePrimeDebt() external;
}