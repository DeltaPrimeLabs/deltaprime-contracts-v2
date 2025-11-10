// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "./abstract/DepositSwapBase.sol";

contract DepositSwapArbitrum is DepositSwapBase {
    
    // ============ ARBITRUM POOL ADDRESSES ============
    address public constant BTC_POOL_TUP = 0x0ed7B42B74F039eda928E1AE6F44Eed5EF195Fb5;
    address public constant DAI_POOL_TUP = 0xFA354E4289db87bEB81034A3ABD6D465328378f1;
    address public constant WETH_POOL_TUP = 0x788A8324943beb1a7A47B76959E6C1e6B87eD360;
    address public constant USDC_POOL_TUP = 0x8Ac9Dc27a6174a1CC30873B367A60AcdFAb965cc;
    address public constant ARB_POOL_TUP = 0xC629E8889350F1BBBf6eD1955095C2198dDC41c2;

    // ============ ARBITRUM TOKEN ADDRESSES ============
    address public constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address public constant DAI = 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1;
    address public constant BTC = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
    address public constant ARB = 0x912CE59144191C1204E64559FE8253a0e49E6548;

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
        if (token == WETH) {
            return WETH_POOL_TUP;
        } else if (token == USDC) {
            return USDC_POOL_TUP;
        } else if (token == BTC) {
            return BTC_POOL_TUP;
        } else if (token == DAI) {
            return DAI_POOL_TUP;
        } else if (token == ARB) {
            return ARB_POOL_TUP;
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
            token == WETH ||
            token == USDC ||
            token == BTC ||
            token == DAI ||
            token == ARB
        );
    }

    /**
     * @notice Convert token address to symbol
     * @param token Token address
     * @return symbol Token symbol as bytes32
     */
    function _tokenAddressToSymbol(address token) internal pure override returns (bytes32) {
        if (token == WETH) {
            return "ETH";
        } else if (token == USDC) {
            return "USDC";
        } else if (token == BTC) {
            return "BTC";
        } else if (token == DAI) {
            return "DAI";
        } else if (token == ARB) {
            return "ARB";
        } else {
            revert UnsupportedToken(token);
        }
    }
}