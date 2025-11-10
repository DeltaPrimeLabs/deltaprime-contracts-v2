// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import "../TraderJoeV2Facet.sol";

contract TraderJoeV2AvalancheFacet is TraderJoeV2Facet {
    function maxBinsPerPrimeAccount() public pure override returns (uint256) {
        return 80;
    }

    function getWhitelistedTraderJoeV2Pairs() internal pure override returns (ILBPair[] memory pools) {
        pools = new ILBPair[](13);
        // TJLB_WAVAX_USDC
        pools[0] = ILBPair(0xD446eb1660F766d533BeCeEf890Df7A69d26f7d1);
        // TJLB_WETH.e_WAVAX
        pools[1] = ILBPair(0x1901011a39B11271578a1283D620373aBeD66faA);
        // TJLB_BTCb_WAVAX
        pools[2] = ILBPair(0xD9fa522F5BC6cfa40211944F2C8DA785773Ad99D);
        // TJLB_USDt_USDC
        pools[3] = ILBPair(0x2823299af89285fF1a1abF58DB37cE57006FEf5D);
        // TJLB_JOE_WAVAX
        pools[4] = ILBPair(0xEA7309636E7025Fda0Ee2282733Ea248c3898495);

        // TJLB_WAVAX_BTC.b_v2.2
        pools[5] = ILBPair(0x856b38Bf1e2E367F747DD4d3951DDA8a35F1bF60);
        // TJLB_WAVAX_USDC_v2.2
        pools[6] = ILBPair(0x864d4e5Ee7318e97483DB7EB0912E09F161516EA);
        // TJLB_BTC.b_USDC_v2.2
        pools[7] = ILBPair(0x4224f6F4C9280509724Db2DbAc314621e4465C29);
        // TJLB_aUSD_WAVAX_v2.2
        pools[8] = ILBPair(0xe92C7661E51121F167D7b36Ed07D297E3792A95f);

        // TJLB_EURC_USDC_v2.2
        pools[9] = ILBPair(0xcD4f57d6B160B4ef2DFb78Ad1c76Cc4242EDB4CE);
        // TJLB_EURC_WAVAX_v2.2
        pools[10] = ILBPair(0x7b7D06668d4B9b353747B47a22CCd2400F200314);

        // TJLB_aUSD_USDt_v2.2
        pools[11] = ILBPair(0xcEC377285AbF370FDf872625D2742252656d631a);
        // TJLB_aUSD_USDC_v2.2
        pools[12] = ILBPair(0x8573F98175D816d520248B5fACF40D309B1c9ceE);
    }
}
