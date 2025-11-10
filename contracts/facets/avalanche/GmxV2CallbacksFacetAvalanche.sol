// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: 13fef4e5b2b14d8d4098f00a2800e22c9f6c8846;
pragma solidity 0.8.17;

//This path is updated during deployment
import "../GmxV2CallbacksFacet.sol";

contract GmxV2CallbacksFacetAvalanche is GmxV2CallbacksFacet {
    using TransferHelper for address;

    // https://github.com/gmx-io/gmx-synthetics/blob/main/deployments/avalanche/
    // GMX contracts

    function getGmxV2RoleStore() internal pure override returns (address) {
        return 0xA44F830B6a2B6fa76657a3B92C1fe74fcB7C6AfD;
    }
}
