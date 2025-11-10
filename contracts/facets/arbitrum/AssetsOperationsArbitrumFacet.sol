// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: 13fef4e5b2b14d8d4098f00a2800e22c9f6c8846;
pragma solidity 0.8.17;

import "../AssetsOperationsFacet.sol";

contract AssetsOperationsArbitrumFacet is AssetsOperationsFacet {
    using TransferHelper for address payable;
    using TransferHelper for address;
    
    /**
    * Funds the loan with a specified amount of a GLP
    * @dev Requires approval for stakedGLP token on frontend side
    * @param _amount to be funded
    **/
    function fundGLP(uint256 _amount) public override noBorrowInTheSameBlock nonReentrant{
        IERC20Metadata stakedGlpToken = IERC20Metadata(0x5402B5F40310bDED796c7D0F3FF6683f5C0cFfdf);
        _amount = Math.min(_amount, stakedGlpToken.balanceOf(msg.sender));
        address(stakedGlpToken).safeTransferFrom(msg.sender, address(this), _amount);
        if (stakedGlpToken.balanceOf(address(this)) > 0) {
            DiamondStorageLib.addOwnedAsset("GLP", address(stakedGlpToken));
        }

        ITokenManager tokenManager = DeploymentConstants.getTokenManager();

        _syncExposure(tokenManager, address(stakedGlpToken));

        emit Funded(msg.sender, "GLP", _amount, block.timestamp);
    }
}
