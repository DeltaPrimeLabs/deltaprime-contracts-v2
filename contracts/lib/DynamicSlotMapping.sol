// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

library DynamicSlotMapping {
    // ----- address key, uint256 value -----
    function getUint256WithAddress(bytes32 slot, address key) internal view returns (uint256 value) {
        bytes32 loc = keccak256(abi.encode(key, slot));
        assembly { value := sload(loc) }
    }

    function setUint256WithAddress(bytes32 slot, address key, uint256 value) internal {
        bytes32 loc = keccak256(abi.encode(key, slot));
        assembly { sstore(loc, value) }
    }

    // ----- uint256 key, uint256 value -----
    function getUint256(bytes32 slot, uint256 key) internal view returns (uint256 value) {
        bytes32 loc = keccak256(abi.encode(key, slot));
        assembly { value := sload(loc) }
    }

    function setUint256(bytes32 slot, uint256 key, uint256 value) internal {
        bytes32 loc = keccak256(abi.encode(key, slot));
        assembly { sstore(loc, value) }
    }

    // -----address key, bool value -----
    function getBool(bytes32 slot, address key) internal view returns (bool value) {
        bytes32 loc = keccak256(abi.encode(key, slot));
        uint256 result;
        assembly { result := sload(loc) }
        value = result != 0;
    }

    function setBool(bytes32 slot, address key, bool value) internal {
        bytes32 loc = keccak256(abi.encode(key, slot));
        assembly { sstore(loc, value) }
    }

     // ----- bytes32 key, uint256 value -----
    function getUint256WithBytes32(bytes32 slot, bytes32 key) internal view returns (uint256 value) {
        bytes32 loc = keccak256(abi.encode(key, slot));
        assembly { value := sload(loc) }
    }

    function setUint256WithBytes32(bytes32 slot, bytes32 key, uint256 value) internal {
        bytes32 loc = keccak256(abi.encode(key, slot));
        assembly { sstore(loc, value) }
    }
}