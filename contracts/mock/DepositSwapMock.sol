// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../abstract/DepositSwapBase.sol";

/**
 * @title DepositSwapMock
 * @dev Mock DepositSwap contract for testing purposes
 * Allows setting token and pool addresses dynamically for flexible testing
 * This contract is initializable
 */
contract DepositSwapMock is DepositSwapBase {
    
    // ============ CONFIGURABLE ADDRESSES ============
    address public WAVAX;
    address public USDC;
    address public ETH;
    address public BTC;
    address public USDT;
    
    address public WAVAX_POOL_TUP;
    address public USDC_POOL_TUP;
    address public ETH_POOL_TUP;
    address public BTC_POOL_TUP;
    address public USDT_POOL_TUP;

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
     * @notice Set token addresses (only owner)
     * @param _wavax WAVAX token address
     * @param _usdc USDC token address
     * @param _eth ETH token address
     * @param _btc BTC token address
     * @param _usdt USDT token address
     */
    function setTokenAddresses(
        address _wavax,
        address _usdc,
        address _eth,
        address _btc,
        address _usdt
    ) external onlyOwner {
        WAVAX = _wavax;
        USDC = _usdc;
        ETH = _eth;
        BTC = _btc;
        USDT = _usdt;
        
        emit TokenAddressesUpdated(_wavax, _usdc, _eth, _btc, _usdt);
    }

    /**
     * @notice Set pool addresses (only owner)
     * @param _wavaxPool WAVAX pool address
     * @param _usdcPool USDC pool address
     * @param _ethPool ETH pool address
     * @param _btcPool BTC pool address
     * @param _usdtPool USDT pool address
     */
    function setPoolAddresses(
        address _wavaxPool,
        address _usdcPool,
        address _ethPool,
        address _btcPool,
        address _usdtPool
    ) external onlyOwner {
        WAVAX_POOL_TUP = _wavaxPool;
        USDC_POOL_TUP = _usdcPool;
        ETH_POOL_TUP = _ethPool;
        BTC_POOL_TUP = _btcPool;
        USDT_POOL_TUP = _usdtPool;
        
        emit PoolAddressesUpdated(_wavaxPool, _usdcPool, _ethPool, _btcPool, _usdtPool);
    }

    /**
     * @notice Get the pool address for a given token
     * @param token Token address
     * @return Pool address
     */
    function _getPoolAddress(address token) internal view override returns (address) {
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
    function _isTokenSupported(address token) internal view override returns (bool) {
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
    function _tokenAddressToSymbol(address token) internal view override returns (bytes32) {
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

    // ============ EVENTS ============
    
    /**
     * @dev Emitted when token addresses are updated
     */
    event TokenAddressesUpdated(
        address indexed wavax,
        address indexed usdc,
        address indexed eth,
        address btc,
        address usdt
    );
    
    /**
     * @dev Emitted when pool addresses are updated
     */
    event PoolAddressesUpdated(
        address indexed wavaxPool,
        address indexed usdcPool,
        address indexed ethPool,
        address btcPool,
        address usdtPool
    );
}