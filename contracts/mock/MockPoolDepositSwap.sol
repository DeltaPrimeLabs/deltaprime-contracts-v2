// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../Pool.sol";

/**
 * @title MockPoolDepositSwap
 * @dev Mock Pool contract that allows setting the deposit swap address for testing purposes
 * This contract IS a Pool with a configurable deposit swap address
 */
contract MockPoolDepositSwap is Pool {
    
    // The deposit swap address that can be updated for testing
    address private depositSwapAddress;
    
    /**
     * @notice Set the deposit swap address (only owner)
     * @param _depositSwapAddress The address of the deposit swap contract
     */
    function setDepositSwapAddress(address _depositSwapAddress) external onlyOwner {
        depositSwapAddress = _depositSwapAddress;
        emit DepositSwapAddressUpdated(depositSwapAddress, _depositSwapAddress);
    }
    
    /**
     * @notice Override the deposit swap address to return the stored address
     * @dev This allows the withdrawInstant function to be called from the stored address
     * @return The stored deposit swap contract address
     */
    function getDepositSwapAddress() internal view override returns (address) {
        return depositSwapAddress;
    }
    
    /**
     * @notice Public getter for the deposit swap address (for testing purposes)
     * @return The current deposit swap address
     */
    function getDepositSwapAddressPublic() external view returns (address) {
        return getDepositSwapAddress();
    }
    
    /**
     * @dev Emitted when the deposit swap address is updated
     * @param oldAddress The previous deposit swap address
     * @param newAddress The new deposit swap address
     */
    event DepositSwapAddressUpdated(address indexed oldAddress, address indexed newAddress);
}
