// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./EventUtils.sol";
import "./DepositV2.sol";

// @title IDepositCallbackReceiver
// @dev interface for a deposit callback contract
interface IDepositCallbackReceiver {
    // @dev called after a deposit execution
    // @param key the key of the deposit
    // @param deposit the deposit that was executed
    // function afterDepositExecution(bytes32 key, Deposit.Props memory deposit, EventUtils.EventLogData memory eventData) external;

    // // @dev called after a deposit cancellation
    // // @param key the key of the deposit
    // // @param deposit the deposit that was cancelled
    // function afterDepositCancellation(bytes32 key, Deposit.Props memory deposit, EventUtils.EventLogData memory eventData) external;

    ////////////////////////////////////
    //// New Signatures for V2.2 ///////
    ////////////////////////////////////

    // @dev called after a deposit execution (new format)
    // @param key the key of the deposit
    // @param depositData the deposit data in EventUtils format
    function afterDepositExecution(bytes32 key, EventUtils.EventLogData memory depositData, EventUtils.EventLogData memory eventData) external;

    // @dev called after a deposit cancellation (new format)
    // @param key the key of the deposit
    // @param depositData the deposit data in EventUtils format
    function afterDepositCancellation(bytes32 key, EventUtils.EventLogData memory depositData, EventUtils.EventLogData memory eventData) external;
}
