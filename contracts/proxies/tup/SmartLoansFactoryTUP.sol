// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: dd5107fccb52b03325a440fcf9823a3b56ce81e1;
pragma solidity 0.8.17;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract SmartLoansFactoryTUP is TransparentUpgradeableProxy {
    constructor(address _logic, address admin_, bytes memory _data) TransparentUpgradeableProxy(_logic, admin_, _data) {}
}
