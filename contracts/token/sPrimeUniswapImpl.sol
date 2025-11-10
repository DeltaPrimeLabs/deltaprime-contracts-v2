// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: 9f02dab5ae5dd02d0771bb7dedabb0ad6ac8802c;
pragma solidity ^0.8.17;

// Importing necessary libraries and interfaces
import "./sPrimeUniswap.sol";
import "../lib/uniswap-v3/PositionValue.sol";
import "../lib/uniswap-v3/UniswapV3IntegrationHelper.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

// SPrime contract declaration
contract sPrimeUniswapImpl
{
    using PositionValue for INonfungiblePositionManager;
    address public sPrime;

    constructor(address sPrimeUniswap_) {
        sPrime = sPrimeUniswap_;
    }

    function getTokenIDByUser(address user) internal view returns (uint256) {
        return sPrimeUniswap(sPrime).userTokenId(user);
    }

    function getV3Pool() internal view returns (IUniswapV3Pool) {
        return IUniswapV3Pool(sPrimeUniswap(sPrime).pool());
    }

    function getPositionManager() internal view returns (INonfungiblePositionManager) {
        return INonfungiblePositionManager(sPrimeUniswap(sPrime).positionManager());
    }

    function getPrecision() internal view returns (uint256) {
        return sPrimeUniswap(sPrime).PRECISION();
    }

    function getTokenX() internal view returns (IERC20Metadata) {
        return IERC20Metadata(address(sPrimeUniswap(sPrime).tokenX()));
    }

    function getTokenY() internal view returns (IERC20Metadata) {
        return IERC20Metadata(address(sPrimeUniswap(sPrime).tokenY()));
    }

    function tickInRange(uint256 tokenId) public view returns (bool) {
        IUniswapV3Pool pool = getV3Pool();
        INonfungiblePositionManager positionManager = getPositionManager();

        (, int24 tick, , , , , ) = pool.slot0();

        (, , , , , int24 tickLower, int24 tickUpper, , , , , ) = positionManager
            .positions(tokenId);
        return tickLower <= tick && tick <= tickUpper;
    }

    /**
     * @dev Internal helper to convert a scaled price ratio to sqrtPriceX96 format.
     * Mirrors the logic from _convertPriceToSqrtPriceX96 in the main sPrimeUniswap contract.
     * @param scaledPrice0Over1WithPrecision The price of pool.token0() in terms of pool.token1(), 
     * scaled by 10^PRECISION.
     * @return sqrtPriceX96 The square root of the price ratio in Q64.96 format.
     */
    function convertPriceToSqrtPriceX96(uint256 scaledPrice0Over1WithPrecision) internal view returns (uint160) {
        uint256 precision = getPrecision();
        if (precision == 0) revert("Precision cannot be zero"); // Should not happen for a constant

        uint256 sqrtOfScaledRatio = UniswapV3IntegrationHelper.sqrt(scaledPrice0Over1WithPrecision);
        uint256 calculatedSqrtPriceX96 = FullMath.mulDiv(
            sqrtOfScaledRatio,
            2**96,
            10**(precision / 2) 
        );

        if (calculatedSqrtPriceX96 < TickMath.MIN_SQRT_RATIO || calculatedSqrtPriceX96 > TickMath.MAX_SQRT_RATIO) {
            revert("Impl: Calculated SqrtPriceX96 out of bounds");
        }
        return uint160(calculatedSqrtPriceX96);
    }

    /**
     * @dev Struct to hold amounts of tokenX and tokenY from an LP position.
     */
    struct LpAmountsInXAndY {
        uint256 amountX;
        uint256 amountY;
    }

    /**
     * @dev Retrieves LP token amounts and expresses them in terms of contract's tokenX and tokenY.
     * @param tokenId The Uniswap V3 LP token ID.
     * @param sqrtRatioX96 The current sqrtPriceX96 of the pool.
     * @return amounts A struct containing amountX and amountY.
     */
    function getLpAmountsInXAndY(
        uint256 tokenId,
        uint160 sqrtRatioX96
    ) internal view returns (LpAmountsInXAndY memory amounts) {
        INonfungiblePositionManager positionManager = getPositionManager();
        IUniswapV3Pool v3Pool = getV3Pool();
        IERC20Metadata tokenX = getTokenX();
        IERC20Metadata poolToken0 = IERC20Metadata(v3Pool.token0());

        (uint256 amount0AtPrice, uint256 amount1AtPrice) = positionManager.total(
            tokenId,
            sqrtRatioX96
        );

        if (address(tokenX) == address(poolToken0)) {
            amounts.amountX = amount0AtPrice;
            amounts.amountY = amount1AtPrice;
        } else { 
            amounts.amountX = amount1AtPrice;
            amounts.amountY = amount0AtPrice;
        }
    }

    /**
     * @dev Calculates the value of a given amount of tokenX in terms of tokenY.
     * @param amountXToConvert The amount of tokenX to convert.
     * @param poolPriceForP0P1Scaled The oracle price of pool.token0() vs pool.token1(), scaled by 10^PRECISION.
     * @param precision The precision value used for scaling.
     * @return valueInTokenY The equivalent value in tokenY's atomic units.
     */
    function calculateValueXConvertedToY(
        uint256 amountXToConvert,
        uint256 poolPriceForP0P1Scaled,
        uint256 precision
    ) internal view returns (uint256 valueInTokenY) {
        IERC20Metadata tokenX = getTokenX();
        IERC20Metadata tokenY = getTokenY();
        IUniswapV3Pool v3Pool = getV3Pool();
        IERC20Metadata poolToken0 = IERC20Metadata(v3Pool.token0());

        uint256 unscaledPxOverPyNumerator;
        uint256 unscaledPxOverPyDenominator;

        // poolPriceForP0P1Scaled is (P_pool.token0 / P_pool.token1) * 10^precision
        if (address(tokenX) == address(poolToken0)) {
            // P_X/P_Y = P_pool.token0 / P_pool.token1 = poolPriceForP0P1Scaled / 10^precision
            unscaledPxOverPyNumerator = poolPriceForP0P1Scaled;
            unscaledPxOverPyDenominator = 10**precision;
        } else {
            // P_X/P_Y = P_pool.token1 / P_pool.token0 = 1 / (poolPriceForP0P1Scaled / 10^precision)
            // So, P_X/P_Y = 10^precision / poolPriceForP0P1Scaled
            unscaledPxOverPyNumerator = 10**precision;
            unscaledPxOverPyDenominator = poolPriceForP0P1Scaled; 
        }
        
        if (unscaledPxOverPyDenominator == 0) revert("Impl: Denominator for Px/Py is zero in helper");

        uint8 decimalsX = tokenX.decimals();
        uint8 decimalsY = tokenY.decimals();

        uint256 scaledNumerator = unscaledPxOverPyNumerator * (10**uint256(decimalsY));
        uint256 scaledDenominator = unscaledPxOverPyDenominator * (10**uint256(decimalsX));

        if (scaledDenominator == 0) revert("Impl: Scaled denominator for Px/Py conversion is zero in helper");
        
        valueInTokenY = FullMath.mulDiv(
            amountXToConvert,
            scaledNumerator,
            scaledDenominator
        );
    }

    /**
     * @notice Returns the total value of a user's Uniswap V3 LP position in terms of tokenY.
     * @dev This function uses an oracle-derived price for calculations.
     * @param user The address of the user.
     * @param poolPriceInput The oracle price of pool.token0() in terms of pool.token1(), scaled by 10^PRECISION.
     * This is obtained from sPrimeUniswap.getPoolPrice().
     * @return totalValueInTokenY The total value of the user's position, denominated in tokenY's atomic units.
     */
    function getUserValueInTokenY(
        address user,
        uint256 poolPriceInput // This is (P_pool.token0 / P_pool.token1) * 10^PRECISION
    ) public view returns (uint256 totalValueInTokenY) {
        uint256 tokenId = getTokenIDByUser(user);
        if (tokenId == 0) {
            return 0; 
        }

        if (poolPriceInput == 0) revert("Impl: Pool price argument is zero");
        
        uint256 precision = getPrecision();

        uint160 sqrtRatioX96 = convertPriceToSqrtPriceX96(poolPriceInput);

        LpAmountsInXAndY memory lpAmounts = getLpAmountsInXAndY(tokenId, sqrtRatioX96);
        
        uint256 valueOfCurrentXInY = calculateValueXConvertedToY(
            lpAmounts.amountX,
            poolPriceInput,
            precision
        );
        
        totalValueInTokenY = lpAmounts.amountY + valueOfCurrentXInY;

        return totalValueInTokenY;
    }
}
