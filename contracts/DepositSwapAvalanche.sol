// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "./abstract/DepositSwapBase.sol";

contract DepositSwapAvalanche is DepositSwapBase {
    
    // ============ AVALANCHE POOL ADDRESSES ============
    address public constant WAVAX_POOL_TUP = 0xaa39f39802F8C44e48d4cc42E088C09EDF4daad4;
    address public constant USDC_POOL_TUP = 0x8027e004d80274FB320e9b8f882C92196d779CE8;
    address public constant BTC_POOL_TUP = 0x70e80001bDbeC5b9e932cEe2FEcC8F123c98F738;
    address public constant ETH_POOL_TUP = 0x2A84c101F3d45610595050a622684d5412bdf510;
    address public constant USDT_POOL_TUP = 0x1b6D7A6044fB68163D8E249Bce86F3eFbb12368e;

    // ============ AVALANCHE TOKEN ADDRESSES ============
    address public constant WAVAX = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;
    address public constant USDC = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E;
    address public constant ETH = 0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB;
    address public constant BTC = 0x152b9d0FdC40C096757F570A51E494bd4b943E50;
    address public constant USDT = 0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7;

    /**
     * @notice Initialize the contract
     * @param _initialSlippageThreshold Initial slippage threshold in USD (18 decimals)
     */
    function initialize(
        uint256 _initialSlippageThreshold
    ) external initializer {
        __DepositSwapBase_init(_initialSlippageThreshold);
    }

    /**
     * @notice Get the pool address for a given token
     * @param token Token address
     * @return Pool address
     */
    function _getPoolAddress(address token) internal pure override returns (address) {
        if (token == WAVAX) {
            return WAVAX_POOL_TUP;
        } else if (token == USDC) {
            return USDC_POOL_TUP;
        } else if (token == BTC) {
            return BTC_POOL_TUP;
        } else if (token == ETH) {
            return ETH_POOL_TUP;
        } else if (token == USDT) {
            return USDT_POOL_TUP;
        }
        return address(0); // Unsupported token
    }

    /**
     * @notice Check if a token is supported by the contract
     * @param token Address of the token to check
     * @return supported Whether the token is supported
     */
    function _isTokenSupported(address token) internal pure override returns (bool) {
        return (
            token == WAVAX ||
            token == USDC ||
            token == BTC ||
            token == ETH ||
            token == USDT
        );
    }

    /**
     * @notice Convert token address to symbol
     * @param token Token address
     * @return symbol Token symbol as bytes32
     */
    function _tokenAddressToSymbol(address token) internal pure override returns (bytes32) {
        if (token == WAVAX) {
            return "AVAX";
        } else if (token == USDC) {
            return "USDC";
        } else if (token == BTC) {
            return "BTC";
        } else if (token == ETH) {
            return "ETH";
        } else if (token == USDT) {
            return "USDT";
        } else {
            revert UnsupportedToken(token);
        }
    }
}