// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../interfaces/joe-v2/IStableJoeStaking.sol";
import "../interfaces/facets/ISJoeFacet.sol";
import {ReentrancyGuardKeccak} from "../ReentrancyGuardKeccak.sol";
import "../OnlyOwnerOrInsolvent.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

contract SJoeFacet is ISJoeFacet, ReentrancyGuardKeccak, OnlyOwnerOrInsolvent {
    using TransferHelper for address;

    address private constant SJOE_ADDRESS = 0x1a731B2299E22FbAC282E7094EdA41046343Cb51;
    address private constant REWARD_TOKEN_ADDRESS = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E; //USDC
    uint256 private constant CLAIMING_FEE = 0.1e18;
    
    function stakeJoe(uint256 amount) public onlyOwner nonReentrant remainsSolvent noBorrowInTheSameBlock notInLiquidation {
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();
        IERC20Metadata rewardToken = IERC20Metadata(REWARD_TOKEN_ADDRESS);

        IERC20Metadata joe = getERC20TokenInstance('JOE', false);
        require(amount <= joe.balanceOf(address(this)), 'Not enough JOE to stake');

        joe.approve(SJOE_ADDRESS, amount);

        uint256 rewardBalanceBefore = rewardToken.balanceOf(address(this));

        IStableJoeStaking(SJOE_ADDRESS).deposit(amount);

        IStakingPositions.StakedPosition memory position = IStakingPositions.StakedPosition({
            asset: SJOE_ADDRESS,
            symbol: 'JOE',
            identifier: 'sJOE',
            balanceSelector: this.joeBalanceInSJoe.selector,
            unstakeSelector: this.unstakeJoe.selector
        });

        DiamondStorageLib.addStakedPosition(position);

        uint256 rewardBalanceAfter = rewardToken.balanceOf(address(this));

        uint256 claimed = rewardBalanceAfter - rewardBalanceBefore;

        if (claimed > 0){
            DiamondStorageLib.addOwnedAsset(tokenManager.tokenAddressToSymbol(REWARD_TOKEN_ADDRESS), REWARD_TOKEN_ADDRESS);

            uint256 totalTransferred = transferFees(claimed);

            claimed -= totalTransferred;
        }

        emit JoeStaked(msg.sender, 'sJOE', SJOE_ADDRESS, amount, block.timestamp);

        emit ClaimedSJoeRewards(msg.sender, REWARD_TOKEN_ADDRESS, claimed, block.timestamp);
    }

    function unstakeJoe(uint256 amount) public onlyOwnerOrInsolvent nonReentrant noBorrowInTheSameBlock {
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();
        IERC20Metadata rewardToken = IERC20Metadata(REWARD_TOKEN_ADDRESS);

        uint256 rewardBalanceBefore = rewardToken.balanceOf(address(this));

        IStableJoeStaking(SJOE_ADDRESS).withdraw(amount);

        uint256 rewardBalanceAfter = rewardToken.balanceOf(address(this));

        uint256 claimed = rewardBalanceAfter - rewardBalanceBefore;

        if (claimed > 0){
            DiamondStorageLib.addOwnedAsset(tokenManager.tokenAddressToSymbol(REWARD_TOKEN_ADDRESS), REWARD_TOKEN_ADDRESS);

            uint256 totalTransferred = transferFees(claimed);

            claimed -= totalTransferred;
        }

        _syncExposure(tokenManager, REWARD_TOKEN_ADDRESS);

        emit JoeUnstaked(msg.sender, 'sJOE', SJOE_ADDRESS, amount, block.timestamp);

        emit ClaimedSJoeRewards(msg.sender, REWARD_TOKEN_ADDRESS, claimed, block.timestamp);
    }

    function claimSJoeRewards() public onlyOwner nonReentrant remainsSolvent noBorrowInTheSameBlock {
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();

        IERC20Metadata rewardToken = IERC20Metadata(REWARD_TOKEN_ADDRESS);

        uint256 rewardBalanceBefore = rewardToken.balanceOf(address(this));

        IStableJoeStaking(SJOE_ADDRESS).withdraw(0);

        uint256 rewardBalanceAfter = rewardToken.balanceOf(address(this));

        uint256 claimed = rewardBalanceAfter - rewardBalanceBefore;

        if (claimed > 0){
            uint256 totalTransferred = transferFees(claimed);

            claimed -= totalTransferred;

            DiamondStorageLib.addOwnedAsset(tokenManager.tokenAddressToSymbol(REWARD_TOKEN_ADDRESS), REWARD_TOKEN_ADDRESS);
        }

        _syncExposure(tokenManager, REWARD_TOKEN_ADDRESS);

        emit ClaimedSJoeRewards(msg.sender, REWARD_TOKEN_ADDRESS, claimed, block.timestamp);
    }

    function joeBalanceInSJoe() public view returns (uint256 joeBalance)  {
        (joeBalance,) = IStableJoeStaking(SJOE_ADDRESS).getUserInfo(address(this), REWARD_TOKEN_ADDRESS);
    }

    function rewardsInSJoe() public view returns (uint256 rewardsBalance)  {
        rewardsBalance = IStableJoeStaking(SJOE_ADDRESS).pendingReward(address(this), REWARD_TOKEN_ADDRESS);
    }

    function transferFees(uint256 claimed) internal returns (uint256 totalTransferred) {
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();
        IERC20Metadata rewardToken = IERC20Metadata(REWARD_TOKEN_ADDRESS);

        uint256 totalTransferred = CLAIMING_FEE * claimed / 1e18;

        uint256 stabilityPoolTransferAmount = totalTransferred / 3;
        uint256 treasuryTransferAmount = totalTransferred - stabilityPoolTransferAmount;

        bytes32 rewardTokenSymbol = tokenManager.tokenAddressToSymbol(REWARD_TOKEN_ADDRESS);

        address(REWARD_TOKEN_ADDRESS).safeTransfer(DeploymentConstants.getStabilityPoolAddress(), stabilityPoolTransferAmount);
        emit SJoeRewardFeeStabilityPoolTransfer(DeploymentConstants.getStabilityPoolAddress(), rewardTokenSymbol, stabilityPoolTransferAmount, block.timestamp);

        address(REWARD_TOKEN_ADDRESS).safeTransfer(DeploymentConstants.getTreasuryAddress(), treasuryTransferAmount);
        emit SJoeRewardFeeTreasuryTransfer(DeploymentConstants.getTreasuryAddress(), rewardTokenSymbol, treasuryTransferAmount, block.timestamp);
    }

    modifier onlyOwner() {
        DiamondStorageLib.enforceIsContractOwner();
        _;
    }
}