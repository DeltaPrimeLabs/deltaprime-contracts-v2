// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

interface IGmxReader {
    struct MarketProps {
        address marketToken;
        address indexToken;
        address longToken;
        address shortToken;
    }

    // This matches the getMarket function from the Reader contract
    function getMarket(address dataStore, address key) external view returns (MarketProps memory);
}