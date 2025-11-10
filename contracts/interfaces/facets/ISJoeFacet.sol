// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

interface ISJoeFacet {
    // Functions
    function stakeJoe(uint256 amount) external;

    function unstakeJoe(uint256 amount) external;

    function claimSJoeRewards() external;

    function joeBalanceInSJoe() external view returns (uint256 joeBalance);

    function rewardsInSJoe() external view returns (uint256 rewardsBalance);

    // Events
    event ClaimedSJoeRewards(address indexed user, address indexed rewardToken, uint256 indexed amount, uint256 timestamp);

    event SJoeRewardFeeStabilityPoolTransfer(address indexed treasury, bytes32 indexed asset, uint256 amount, uint256 timestamp);

    event SJoeRewardFeeTreasuryTransfer(address indexed treasury, bytes32 indexed asset, uint256 amount, uint256 timestamp);

    event JoeStaked(address indexed user, bytes32 indexed asset, address indexed vault, uint256 amount, uint256 timestamp);

    event JoeUnstaked(address indexed user, bytes32 indexed asset, address indexed vault, uint256 amount, uint256 timestamp);

}