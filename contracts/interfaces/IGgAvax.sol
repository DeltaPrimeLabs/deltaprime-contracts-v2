// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: ;
pragma solidity 0.8.17;

/**
 * @title IGgAvax
 */
interface IGgAvax {
    function depositAVAX() external payable;

    function redeemAVAX(uint256 shares) external returns (uint256 assets);
}
