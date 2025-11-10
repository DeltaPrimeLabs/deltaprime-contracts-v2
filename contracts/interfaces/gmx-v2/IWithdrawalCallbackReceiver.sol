// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./EventUtils.sol";
import "./WithdrawalV2.sol";

// @title IWithdrawalCallbackReceiver
// @dev interface for a withdrawal callback contract
interface IWithdrawalCallbackReceiver {
    // @dev called after a withdrawal execution
    // @param key the key of the withdrawal
    // @param withdrawal the withdrawal that was executed
    // function afterWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal, EventUtils.EventLogData memory eventData) external;

    // // @dev called after a withdrawal cancellation
    // // @param key the key of the withdrawal
    // // @param withdrawal the withdrawal that was cancelled
    // function afterWithdrawalCancellation(bytes32 key, Withdrawal.Props memory withdrawal, EventUtils.EventLogData memory eventData) external;
    
    ////////////////////////////////////
    //// New Signatures for V2.2 ///////
    ////////////////////////////////////

    // @dev called after a withdrawal execution (new format)
    // @param key the key of the withdrawal
    // @param withdrawalData the withdrawal data in EventUtils format
    function afterWithdrawalExecution(bytes32 key, EventUtils.EventLogData memory withdrawalData, EventUtils.EventLogData memory eventData) external;

    // @dev called after a withdrawal cancellation (new format)
    // @param key the key of the withdrawal
    // @param withdrawalData the withdrawal data in EventUtils format
    function afterWithdrawalCancellation(bytes32 key, EventUtils.EventLogData memory withdrawalData, EventUtils.EventLogData memory eventData) external;


}
