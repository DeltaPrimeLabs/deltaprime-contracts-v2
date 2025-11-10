pragma solidity ^0.8.17;

interface ISmartLoanLiquidationFacet {
  function snapshotInsolvency() external;
  function liquidate(bool emergency) external;
  function clearInsolvencySnapshot() external;
  function getLastInsolventTimestamp() external view returns (uint256);
  function whitelistLiquidators(address[] memory _liquidators) external;
  function delistLiquidators(address[] memory _liquidators) external;
  function isLiquidatorWhitelisted(address _liquidator) view external returns(bool);

    /**
     * @dev emitted after taking an insolvency snapshot
     * @param liquidator the address that initiated the snapshot
     * @param healthRatio the health ratio at the time of snapshot
     * @param timestamp a time of the snapshot
     **/
    event InsolvencySnapshot(address indexed liquidator, uint256 healthRatio, uint256 timestamp);

    /**
     * @dev emitted after clearing an insolvency snapshot
     * @param liquidator the address that initiated the clearing
     * @param timestamp a time of the clearing
     **/
    event InsolvencySnapshotCleared(address indexed liquidator, uint256 timestamp);

    /**
     * @dev emitted after a successful liquidation operation
     * @param liquidator the address that initiated the liquidation operation
     * @param timestamp a time of the liquidation
     **/
    event Liquidated(address indexed liquidator, uint256 timestamp);

    /**
     * @dev emitted when funds are repaid to the pool during a liquidation
     * @param liquidator the address initiating repayment
     * @param asset asset repaid by a liquidator
     * @param amount of repaid funds
     * @param timestamp of the repayment
     **/
    event LiquidationRepay(address indexed liquidator, bytes32 indexed asset, uint256 amount, uint256 timestamp);

    /**
     * @dev emitted when funds are sent to liquidator during liquidation
     * @param treasury the address of stability pool
     * @param asset token sent to a liquidator
     * @param amount of sent funds
     * @param timestamp of the transfer
     **/
    event LiquidationTransfer(address indexed treasury, bytes32 indexed asset, uint256 amount, uint256 timestamp);

    /**
     * @dev emitted when funds are sent to fees treasury during liquidation
     * @param treasury the address of fees treasury
     * @param asset token sent to a treasury
     * @param amount of sent funds
     * @param timestamp of the transfer
     **/
    event LiquidationFeesTransfer(address indexed treasury, bytes32 indexed asset, uint256 amount, uint256 timestamp);

    /**
     * @dev emitted when a new liquidator gets whitelisted
     * @param liquidator the address being whitelisted
     * @param performer the address initiating whitelisting
     * @param timestamp of the whitelisting
     **/
    event LiquidatorWhitelisted(address indexed liquidator, address performer, uint256 timestamp);

    /**
     * @dev emitted when a liquidator gets delisted
     * @param liquidator the address being delisted
     * @param performer the address initiating delisting
     * @param timestamp of the delisting
     **/
    event LiquidatorDelisted(address indexed liquidator, address performer, uint256 timestamp);
}
