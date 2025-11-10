
// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IStableJoeStaking {
    // Events
    event Deposit(address indexed user, uint256 amount, uint256 fee);
    event DepositFeeChanged(uint256 newFee, uint256 oldFee);
    event Withdraw(address indexed user, uint256 amount);
    event ClaimReward(address indexed user, address indexed rewardToken, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event RewardTokenAdded(address token);
    event RewardTokenRemoved(address token);
    event TokenSwept(address token, address to, uint256 amount);

    function deposit(uint256 _amount) external;

    function withdraw(uint256 _amount) external;

    function emergencyWithdraw() external;

    function getUserInfo(address _user, address _rewardToken)
    external
    view
    returns (uint256, uint256);

    function rewardTokensLength() external view returns (uint256);

    function addRewardToken(address _rewardToken) external;

    function removeRewardToken(address _rewardToken) external;

    function setDepositFeePercent(uint256 _depositFeePercent) external;

    function pendingReward(address _user, address _token)
    external
    view
    returns (uint256);

    function sweep(IERC20Upgradeable _token, address _to) external;
}