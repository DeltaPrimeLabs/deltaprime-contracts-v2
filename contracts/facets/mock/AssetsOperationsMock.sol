// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../AssetsOperationsFacet.sol";

contract AssetsOperationsMock is AssetsOperationsFacet {
    using TransferHelper for address payable;
    using TransferHelper for address;

    function withdraw(bytes32 _withdrawnAsset, uint256 _amount) public onlyOwner nonReentrant  remainsSolvent {
       IERC20Metadata token = getERC20TokenInstance(_withdrawnAsset, true);
       _amount = Math.min(_amount, token.balanceOf(address(this)));

       address(token).safeTransfer(msg.sender, _amount);

       ITokenManager tokenManager = DeploymentConstants.getTokenManager();

       _syncExposure(tokenManager, address(token));
       emit Withdrawn(msg.sender, _withdrawnAsset, _amount, block.timestamp);
    }
}
