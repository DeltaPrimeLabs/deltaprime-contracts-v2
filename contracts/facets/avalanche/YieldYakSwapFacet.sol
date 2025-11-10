// SPDX-License-Identifier: BUSL-1.1
// Last deployed from commit: 3f18be6969cfcf20cc641b51da287b780b070a86;
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "../../interfaces/facets/IYieldYakRouter.sol";
import "../../ReentrancyGuardKeccak.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import {DiamondStorageLib} from "../../lib/DiamondStorageLib.sol";
import "../../lib/SolvencyMethods.sol";
import "../../interfaces/ITokenManager.sol";

//This path is updated during deployment
import "../../lib/local/DeploymentConstants.sol";

contract YieldYakSwapFacet is ReentrancyGuardKeccak, SolvencyMethods {
    using TransferHelper for address;

    struct SwapTokensDetails {
        bytes32 tokenSoldSymbol;
        bytes32 tokenBoughtSymbol;
        IERC20Metadata soldToken;
        IERC20Metadata boughtToken;
        uint256 initialSoldTokenBalance;
        uint256 initialBoughtTokenBalance;
    }

    function getInitialTokensDetails(address _soldTokenAddress, address _boughtTokenAddress) internal returns (SwapTokensDetails memory){
        ITokenManager tokenManager = DeploymentConstants.getTokenManager();

        if (_boughtTokenAddress == 0xaE64d55a6f09E4263421737397D1fdFA71896a69) {
            _boughtTokenAddress = 0x9e295B5B976a184B14aD8cd72413aD846C299660;
        }

        if (_soldTokenAddress == 0x9e295B5B976a184B14aD8cd72413aD846C299660) {
            _soldTokenAddress = 0xaE64d55a6f09E4263421737397D1fdFA71896a69;
        }

        bytes32 _tokenSoldSymbol = tokenManager.tokenAddressToSymbol(_soldTokenAddress);
        bytes32 _tokenBoughtSymbol = tokenManager.tokenAddressToSymbol(_boughtTokenAddress);

        require(tokenManager.isTokenAssetActive(_boughtTokenAddress), "Asset not supported.");

        IERC20Metadata _soldToken = IERC20Metadata(_soldTokenAddress);
        IERC20Metadata _boughtToken = IERC20Metadata(_boughtTokenAddress);

        return SwapTokensDetails({
            tokenSoldSymbol: _tokenSoldSymbol,
            tokenBoughtSymbol: _tokenBoughtSymbol,
            soldToken: _soldToken,
            boughtToken: _boughtToken,
            initialSoldTokenBalance: _soldToken.balanceOf(address(this)),
            initialBoughtTokenBalance: _boughtToken.balanceOf(address(this))
        });
    }

    function isWhitelistedAdapterOptimized(address adapter) public virtual pure returns (bool) {
        if (adapter == 0xDB66686Ac8bEA67400CF9E5DD6c8849575B90148) return true;  // UnilikeAdapter
        if (adapter == 0x3614657EDc3cb90BA420E5f4F61679777e4974E3) return true;  // UnilikeAdapter
        if (adapter == 0x3f314530a4964acCA1f20dad2D35275C23Ed7F5d) return true;  // UnilikeAdapter
        if (adapter == 0x564C35a1647ED40850325eBf23e484bB56E75aB2) return true;  // VelodromeAdapter
        if (adapter == 0x3EeA1f1fFCA00c69bA5a99E362D9A7d4e3902B3c) return true;  // CurvePlainAdapter
        if (adapter == 0x29deCcD2f4Fdb046D24585d01B1DcDFb902ACAcD) return true;  // UniswapV3Adapter
        if (adapter == 0xb94187369171f12ae28e08424BBD01424f13c659) return true;  // LB2Adapter
        if (adapter == 0xf9F824576F06fF92765f2Af700a5A9923526261e) return true;  // LB2Adapter
        if (adapter == 0x4efB1880Dc9B01c833a6E2824C8EadeA83E428B0) return true;  // WoofiV2Adapter
        if (adapter == 0x2F6ca0a98CF8f7D407E98993fD576f70F0FAA80B) return true;  // SAvaxAdapter
        if (adapter == 0x5C4d23fd18Fc4128f77426F42237acFcE618D0b1) return true;  // WAvaxAdapter
        if (adapter == 0x7De32C76309aeB1025CBA3384caBe36326603046) return true;  // WombatAdapter
        if (adapter == 0x97d26D7fc0895e3456b2146585848b466cfbb1cf) return true;  // RamsesV2Adapter
        if (adapter == 0x79632b8194a1Ce048e5d9b0e282E9eE2d4579c20) return true;  // GGAvaxAdapter
        if (adapter == 0x214617987145Ef7c5462870362FdCAe9cacdf3C8) return true;  // TokenMillAdapter
        if (adapter == 0xDfd22ef6D509a982F4e6883CBf00d56d5d0D87F3) return true;  // UniswapV2Adapter
        if (adapter == 0x123577a1560004D4432DC5e31F97363d0cD8A651) return true;  // BlackholeAdapter
        if (adapter == 0xE3D2c10C2122e6f02C702064015554D468B24D6D) return true;  // AlgebraIntegralAdapter
        if (adapter == 0x526C75aef80D3c5D19F1B9fC38e3f7EF591eaAA2) return true;  // PangolinV3Adapter
        if (adapter == 0xA2b61cD3e656e22A41a290092eBe9a2f81ED39c5) return true;  // ApexAdapter        
        return false;
    }

    function yakSwap(
        uint256 _amountIn,
        uint256 _amountOut,
        address[] calldata _path,
        address[] calldata _adapters
    ) external nonReentrant onlyOwner noBorrowInTheSameBlock remainsSolvent notInLiquidation {
        IYieldYakRouter router = IYieldYakRouter(YY_ROUTER());

        // Check if all adapters are whitelisted in router
        for (uint256 i = 0; i < _adapters.length; i++) {
            require(isWhitelistedAdapterOptimized(_adapters[i]), "YakSwap: Adapter not whitelisted in router");
        }

        SwapTokensDetails memory swapTokensDetails = getInitialTokensDetails(_path[0], _path[_path.length - 1]);

        _amountIn = Math.min(_getAvailableBalance(swapTokensDetails.tokenSoldSymbol), _amountIn);
        require(_amountIn > 0, "Amount of tokens to sell has to be greater than 0 / Insufficient balance");
        

        address(swapTokensDetails.soldToken).safeApprove(YY_ROUTER(), 0);
        address(swapTokensDetails.soldToken).safeApprove(YY_ROUTER(), _amountIn);

        IYieldYakRouter.Trade memory trade = IYieldYakRouter.Trade({
            amountIn: _amountIn,
            amountOut: _amountOut,
            path: _path,
            adapters: _adapters
        });

        router.swapNoSplit(trade, address(this), 0);

        uint256 boughtTokenFinalAmount = swapTokensDetails.boughtToken.balanceOf(address(this)) - swapTokensDetails.initialBoughtTokenBalance;
        require(boughtTokenFinalAmount >= _amountOut, "Insufficient output amount");

        uint256 soldTokenFinalAmount = swapTokensDetails.initialSoldTokenBalance - swapTokensDetails.soldToken.balanceOf(address(this));

        ITokenManager tokenManager = DeploymentConstants.getTokenManager();
        _syncExposure(tokenManager, address(swapTokensDetails.boughtToken));
        _syncExposure(tokenManager, address(swapTokensDetails.soldToken));

        // revoke unused approval
        address(swapTokensDetails.soldToken).safeApprove(YY_ROUTER(), 0);

        emit Swap(
            msg.sender,
            swapTokensDetails.tokenSoldSymbol,
            swapTokensDetails.tokenBoughtSymbol,
            soldTokenFinalAmount,
            boughtTokenFinalAmount,
            block.timestamp
        );
    }

    function YY_ROUTER() internal virtual pure returns (address) {
        return 0xC4729E56b831d74bBc18797e0e17A295fA77488c;
    }

    modifier onlyOwner() {
        DiamondStorageLib.enforceIsContractOwner();
        _;
    }

    /**
     * @dev emitted after a swap of assets
     * @param user the address of user making the purchase
     * @param soldAsset sold by the user
     * @param boughtAsset bought by the user
     * @param amountSold amount of tokens sold
     * @param amountBought amount of tokens bought
     * @param timestamp time of the swap
     **/
    event Swap(address indexed user, bytes32 indexed soldAsset, bytes32 indexed boughtAsset, uint256 amountSold, uint256 amountBought, uint256 timestamp);
}
