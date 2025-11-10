// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: 13fef4e5b2b14d8d4098f00a2800e22c9f6c8846;
pragma solidity 0.8.17;

//This path is updated during deployment
import "../GmxV2PlusFacet.sol";

contract GmxV2PlusFacetArbitrum is GmxV2PlusFacet {
    using TransferHelper for address;

    // https://github.com/gmx-io/gmx-synthetics/blob/main/deployments/arbitrum/
    // GMX contracts
    function getGmxV2Router() internal pure override returns (address) {
        return 0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6;
    }

    function getGmxV2ExchangeRouter() internal pure override returns (address) {
        return 0x87d66368cD08a7Ca42252f5ab44B2fb6d1Fb8d15;
    }

    function getGmxV2DepositVault() internal pure override returns (address) {
        return 0xF89e77e8Dc11691C9e8757e84aaFbCD8A67d7A55;
    }

    function getGmxV2WithdrawalVault() internal pure override returns (address) {
        return 0x0628D46b5D145f183AdB6Ef1f2c97eD1C4701C55;
    }

    // Markets
    address constant GM_ETH_WETH = 0x450bb6774Dd8a756274E0ab4107953259d2ac541;
    address constant GM_BTC_WBTC = 0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77;
    address constant GM_GMX_GMX = 0xbD48149673724f9cAeE647bb4e9D9dDaF896Efeb;

    // Tokens
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address constant WBTC = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
    address constant GMX = 0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a;

    // DEPOSIT
    function depositEthGmxV2Plus(
        uint256 tokenAmount,
        uint256 minGmAmount,
        uint256 executionFee
    ) external payable {
        _deposit(GM_ETH_WETH, tokenAmount, minGmAmount, executionFee);
    }

    function depositBtcGmxV2Plus(
        uint256 tokenAmount,
        uint256 minGmAmount,
        uint256 executionFee
    ) external payable {
        _deposit(GM_BTC_WBTC, tokenAmount, minGmAmount, executionFee);
    }

    function depositGmxGmxV2Plus(
        uint256 tokenAmount,
        uint256 minGmAmount,
        uint256 executionFee
    ) external payable {
        _deposit(GM_GMX_GMX, tokenAmount, minGmAmount, executionFee);
    }

    // WITHDRAW
    function withdrawEthGmxV2Plus(
        uint256 gmAmount,
        uint256 minLongTokenAmount,
        uint256 minShortTokenAmount,
        uint256 executionFee
    ) external payable {
        _withdraw(
            GM_ETH_WETH,
            gmAmount,
            minLongTokenAmount,
            minShortTokenAmount,
            executionFee
        );
    }

    function withdrawBtcGmxV2Plus(
        uint256 gmAmount,
        uint256 minLongTokenAmount,
        uint256 minShortTokenAmount,
        uint256 executionFee
    ) external payable {
        _withdraw(
            GM_BTC_WBTC,
            gmAmount,
            minLongTokenAmount,
            minShortTokenAmount,
            executionFee
        );
    }

    function withdrawGmxGmxV2Plus(
        uint256 gmAmount,
        uint256 minLongTokenAmount,
        uint256 minShortTokenAmount,
        uint256 executionFee
    ) external payable {
        _withdraw(
            GM_GMX_GMX,
            gmAmount,
            minLongTokenAmount,
            minShortTokenAmount,
            executionFee
        );
    }
}
