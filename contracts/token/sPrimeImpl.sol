// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: aca0d66772607a851d7017b5cb3e6f38ee11f918;

pragma solidity ^0.8.17;

// Importing necessary libraries and interfaces
import "../interfaces/ISPrimeTraderJoe.sol";
import "../interfaces/IPositionManager.sol";
import "../lib/joe-v2/math/SafeCast.sol";
import "../lib/uniswap-v3/FullMath.sol";
import "../lib/joe-v2/math/Uint256x256Math.sol";
import "../lib/joe-v2/PriceHelper.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

// SPrime contract declaration
contract SPrimeImpl {
    using SafeCast for uint256; // Using SafeCast for uint256 for safe type casting
    using Uint256x256Math for uint256;

    address public sPrime;

    constructor(address sPrime_) {
        sPrime = sPrime_;
    }

    /**
     * @dev Check if the active id is in the user position range
     * @param tokenId Token Id.
     * @return status bin status
     */
    function binInRange(uint256 tokenId) public view returns(bool) {
        IPositionManager positionManager = ISPrimeTraderJoe(sPrime).positionManager();
        ILBPair lbPair = ISPrimeTraderJoe(sPrime).getLBPair();

        IPositionManager.DepositConfig memory depositConfig = positionManager.getDepositConfigFromTokenId(tokenId);

        uint256[] memory depositIds = depositConfig.depositIds;
        uint256 activeId = lbPair.getActiveId();
        if (depositIds[0] <= activeId && depositIds[depositIds.length - 1] >= activeId) {
            return true;
        }
        return false;
    }

    /**
    * @notice Returns the amounts of tokenX and tokenY for a given set of LP bins and liquidity amounts,
    * at a price point derived from the oracle.
    * @dev This function is called by SPrime.getUserValueInTokenY().
    * @param depositIds Array of bin IDs for the LP position.
    * @param liquidityMinted Array of liquidity amounts for each corresponding bin ID.
    * @param priceXOverYScaledForPriceHelper Price of contract's tokenX in terms of contract's tokenY,
    * scaled by 10**(tokenY.decimals - tokenX.decimals + 18). This is the format
    * expected by PriceHelper.convertDecimalPriceTo128x128().
    * @return amountXTotal Total amount of contract's tokenX in atomic units.
    * @return amountYTotal Total amount of contract's tokenY in atomic units.
    */
    function getLiquidityTokenAmounts(
        uint256[] memory depositIds, 
        uint256[] memory liquidityMinted, 
        uint256 priceXOverYScaledForPriceHelper // (P_X_atomic / P_Y_atomic) * 10^(dY - dX + 18)
    ) public view returns(uint256 amountXTotal, uint256 amountYTotal) {        
        ILBPair lbPair = ISPrimeTraderJoe(sPrime).getLBPair();

        uint256 price128x128 = PriceHelper.convertDecimalPriceTo128x128(priceXOverYScaledForPriceHelper);
        uint24 oracleBinId = lbPair.getIdFromPrice(price128x128);

        for (uint256 i = 0; i < depositIds.length; ++i) {
            uint24 currentBinId = depositIds[i].safe24();
            uint256 liquidityInBin = liquidityMinted[i];

            if (liquidityInBin == 0) {
                continue;
            }

            (uint256 binReserveX, uint256 binReserveY) = lbPair.getBin(currentBinId);
            uint256 binTotalSupply = lbPair.totalSupply(currentBinId);

            if (binTotalSupply == 0) {
                continue;
            }
            
            uint256 xAmountInBin = liquidityInBin.mulDivRoundDown(binReserveX, binTotalSupply);
            uint256 yAmountInBin = liquidityInBin.mulDivRoundDown(binReserveY, binTotalSupply);

            if(oracleBinId > currentBinId) { 
                // Current bin is for tokenX (LBPair's tokenX). All its value is in tokenX.
                // Convert this tokenX to LBPair's tokenY using the bin's price.
                uint256 binPrice128x128 = lbPair.getPriceFromId(currentBinId);
                // PriceHelper.convert128x128PriceToDecimal gives P_LBPairX_atomic / P_LBPairY_atomic, scaled by 1e18
                uint256 binPriceDecimalScaled18 = PriceHelper.convert128x128PriceToDecimal(binPrice128x128);

                yAmountInBin = yAmountInBin + FullMath.mulDiv(xAmountInBin, binPriceDecimalScaled18, 10**18);
                xAmountInBin = 0;
            } else if(oracleBinId < currentBinId) {
                // Current bin is for tokenY (LBPair's tokenY). All its value is in tokenY.
                // Convert this tokenY to LBPair's tokenX using the bin's price.
                uint256 binPrice128x128 = lbPair.getPriceFromId(currentBinId);
                uint256 binPriceDecimalScaled18 = PriceHelper.convert128x128PriceToDecimal(binPrice128x128);
                if (binPriceDecimalScaled18 == 0) revert("Impl: Bin price is zero, cannot convert Y to X");

                xAmountInBin = xAmountInBin + FullMath.mulDiv(yAmountInBin, 10**18, binPriceDecimalScaled18);
                yAmountInBin = 0;
            } 

            // If oracleBinId == currentBinId, the bin contains both X and Y, amounts are taken as is.
            amountXTotal += xAmountInBin;
            amountYTotal += yAmountInBin;
        }
    }
}