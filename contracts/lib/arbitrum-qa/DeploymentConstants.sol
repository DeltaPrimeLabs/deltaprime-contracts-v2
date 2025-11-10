// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: ;
pragma solidity ^0.8.17;

import "../../interfaces/ITokenManager.sol";
import {DiamondStorageLib} from "../../lib/DiamondStorageLib.sol";

/**
 * DeploymentConstants
 * These constants are updated during test and prod deployments using JS scripts. Defined as constants
 * to decrease gas costs. Not meant to be updated unless really necessary.
 * BE CAREFUL WHEN UPDATING. CONSTANTS CAN BE USED AMONG MANY FACETS.
 **/
library DeploymentConstants {

    // Used for LiquidationBonus calculations
    uint256 private constant _PERCENTAGE_PRECISION = 1000;

    bytes32 private constant _NATIVE_TOKEN_SYMBOL = 'ETH';

    address private constant _NATIVE_ADDRESS = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    address private constant _DIAMOND_BEACON_ADDRESS = 0x968f944e9c43FC8AD80F6C1629F10570a46e2651;

    address private constant _SMART_LOANS_FACTORY_ADDRESS = 0x97f4C81Be9edD44953Da7A1F289D30d3a47F6E4E;

    address private constant _TOKEN_MANAGER_ADDRESS = 0x4f032CC36B72D934551bc0395Df17162eF92D8D9;

    address private constant _ADDRESS_PROVIDER = 0x0000000000000000000000000000000000000000;

    address private constant _FEES_TREASURY_ADDREESS = 0x764a9756994f4E6cd9358a6FcD924d566fC2e666;

    address private constant _STABILITY_POOL_ADDREESS = 0x6B9836D18978a2e865A935F12F4f958317DA4619;

    address private constant _GMX_DATA_STORE_ADDRESS = 0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8;
    
    address private constant _GMX_READER_ADDRESS = 0x65A6CC451BAfF7e7B4FDAb4157763aB4b6b44D0E;

    //implementation-specific

    function getPercentagePrecision() internal pure returns (uint256) {
        return _PERCENTAGE_PRECISION;
    }

    function getGmxDataStoreAddress() internal pure returns (address) {
        return _GMX_DATA_STORE_ADDRESS;
    }
    
    function getGmxReaderAddress() internal pure returns (address) {
        return _GMX_READER_ADDRESS;
    }

    //blockchain-specific

    function getNativeTokenSymbol() internal pure returns (bytes32 symbol) {
        return _NATIVE_TOKEN_SYMBOL;
    }

    function getNativeToken() internal pure returns (address payable) {
        return payable(_NATIVE_ADDRESS);
    }

    //deployment-specific

    function getDiamondAddress() internal pure returns (address) {
        return _DIAMOND_BEACON_ADDRESS;
    }

    function getSmartLoansFactoryAddress() internal pure returns (address) {
        return _SMART_LOANS_FACTORY_ADDRESS;
    }

    function getTokenManager() internal pure returns (ITokenManager) {
        return ITokenManager(_TOKEN_MANAGER_ADDRESS);
    }

    function getAddressProvider() internal pure returns (address) {
        return _ADDRESS_PROVIDER;
    }

    function getTreasuryAddress() internal pure returns (address) {
        return _FEES_TREASURY_ADDREESS;
    }

    function getStabilityPoolAddress() internal pure returns (address) {
        return _STABILITY_POOL_ADDREESS;
    }

    /**
    * Returns all owned assets keys
    **/
    function getAllOwnedAssets() internal view returns (bytes32[] memory result) {
        DiamondStorageLib.SmartLoanStorage storage sls = DiamondStorageLib.smartLoanStorage();
        return sls.ownedAssets._inner._keys._inner._values;
    }
}