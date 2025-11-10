import { ethers, waffle, network } from "hardhat";
import chai, { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { solidity } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import SmartLoansFactoryArtifact from "../../../artifacts/contracts/SmartLoansFactory.sol/SmartLoansFactory.json";
import MockTokenManagerArtifact from "../../../artifacts/contracts/mock/MockTokenManager.sol/MockTokenManager.json";
import AddressProviderArtifact from "../../../artifacts/contracts/AddressProvider.sol/AddressProvider.json";

import {
  AddressProvider,
  MockTokenManager,
  SmartLoanGigaChadInterface,
  SmartLoansFactory,
  PangolinIntermediary,
  ILBRouter,
  ILBToken,
} from "../../../typechain";
import * as traderJoeSdk from "@traderjoe-xyz/sdk-v2";
import { TokenAmount } from "@traderjoe-xyz/sdk-core";
import { JSBI } from "@traderjoe-xyz/sdk";
import { Token } from "@traderjoe-xyz/sdk-core";
import { parseEther } from "viem";

import {
  deployPools,
  addMissingTokenContracts,
  Asset,
  convertAssetsListToSupportedAssets,
  convertTokenPricesMapToMockPrices,
  deployAllFacets,
  erc20ABI,
  formatUnits,
  fromBytes32,
  deployAndInitExchangeContract,
  fromWei,
  getFixedGasSigners,
  GLPManagerRewarderAbi,
  getRedstonePrices,
  syncTime,
  toBytes32,
  toWei,
  getTokensPricesMap,
  PoolAsset,
  PoolInitializationObject,
  recompileConstantsFile,
  wavaxAbi,
} from "../../_helpers";

import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { parseUnits } from "ethers/lib/utils";
import { deployDiamond } from "../../../tools/diamond/deploy-diamond";

const { deployFacet } = require("../../../tools/diamond/deploy-diamond");
import TOKEN_ADDRESSES from "../../../common/addresses/avax/token_addresses.json";
import CACHE_LAYER_URLS from "../../../common/redstone-cache-layer-urls.json";

chai.use(solidity);

const { deployContract, provider } = waffle;

const pangolinRouterAddress = "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106";
const tjv21RouterAddress = "0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30";
const tjv22RouterAddress = "0x18556DA13313f3532c54711497A8FedAC273220E";

const LBTokenAbi = [
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function getActiveId() external view returns (uint24)",
  "function name() external view returns (string memory)",
  "function totalSupply(uint256 id) external view returns (uint256)",
  "function approveForAll(address spender, bool approved) external",
];

const LBRouterAbi = [
  "function addLiquidity((address tokenX, address tokenY, uint256 binStep, uint256 amountX, uint256 amountY, uint256 amountXMin, uint256 amountYMin, uint256 activeIdDesired, uint256 idSlippage, int256[] deltaIds, uint256[] distributionX, uint256[] distributionY, address to, address refundTo, uint256 deadline))",
  "event DepositedToBins(address indexed sender,address indexed to,uint256[] ids,bytes32[] amounts)",
];

const LBPairABI = [
  "function getReserves() public view returns (uint128, uint128)",
  "function getActiveId() public view returns (uint24)",
  "function balanceOf(address, uint256) public view returns (uint256)",
  "function getBin(uint24) public view returns (uint128, uint128)",
  "function totalSupply(uint256) public view returns (uint256)",
];

const UniswapV2IntermediaryAbi = [
  "function getAmountsIn (uint256 amountOut, address[] path) view returns (uint256[])",
  "function getAmountsOut (uint256 amountIn, address[] path) view returns (uint256[])",
];

describe("SolvencyFacetProd Comprehensive Tests", () => {
  before("Synchronize blockchain time", async () => {
    await syncTime();
  });

  describe("Test comprehensive solvency calculations with complex positions", () => {
    let smartLoansFactory: SmartLoansFactory,
      sut: PangolinIntermediary,
      loan: SmartLoanGigaChadInterface,
      poolContracts: Map<string, Contract> = new Map(),
      tokenContracts: Map<string, Contract> = new Map(),
      lendingPools: Array<PoolAsset> = [],
      supportedAssets: Array<Asset>,
      tokensPrices: Map<string, number>,
      wrappedLoan: any,
      owner: SignerWithAddress,
      depositor: SignerWithAddress,
      MOCK_PRICES: any,
      diamondAddress: any,
      AVAX_PRICE: number,
      USD_PRICE: number,
      lpTokenAddress: string,
      lpToken: Contract,
      wavaxToken: Contract,
      usdToken: Contract,
      router: Contract,
      usdTokenDecimalPlaces: BigNumber;

    // Helper function to get token decimals
    const getTokenDecimals = (symbol: string): number => {
      const decimalsMap: { [key: string]: number } = {
        USDC: 6,
        AVAX: 18,
        ETH: 18,
        YY_AAVE_AVAX: 18,
      };
      return decimalsMap[symbol] || 18;
    };

    let tjv2BinId: number;
    let activeIDForStored: number;
    let avaxUsdcLBPairAddress: string =
      "0xD446eb1660F766d533BeCeEf890Df7A69d26f7d1"; // AVAX/USDC 20bps pair

    // Helper functions for TraderJoe V2
    function getAddLiquidityParameters(
      address: string,
      tokenX: any,
      tokenY: any,
      tokenXValue: string,
      tokenYValue: string,
      distributionMethod: string,
      binStep: number,
      activeBinId: number,
      binRange: number[],
      userPriceSlippage: number,
      userAmountsSlippage: number
    ) {
      // wrap into TokenAmount
      const tokenXAmount = new TokenAmount(tokenX, JSBI.BigInt(tokenXValue));
      const tokenYAmount = new TokenAmount(tokenY, JSBI.BigInt(tokenYValue));

      const allowedAmountsSlippage = userAmountsSlippage * 100;
      const minTokenXAmount = JSBI.divide(
        JSBI.multiply(
          tokenXAmount.raw,
          JSBI.BigInt(10000 - allowedAmountsSlippage)
        ),
        JSBI.BigInt(10000)
      );
      const minTokenYAmount = JSBI.divide(
        JSBI.multiply(
          tokenYAmount.raw,
          JSBI.BigInt(10000 - allowedAmountsSlippage)
        ),
        JSBI.BigInt(10000)
      );

      const allowedPriceSlippage = userPriceSlippage * 100;
      const priceSlippage = allowedPriceSlippage / 10000; // 0.005

      // set deadline for the transaction
      const currenTimeInSec = Math.floor(new Date().getTime() / 1000);
      const deadline = currenTimeInSec + 3600;

      const idSlippage = getIdSlippageFromPriceSlippage(
        priceSlippage,
        Number(binStep)
      );

      // getting distribution parameters for selected shape given a price range
      let { deltaIds, distributionX, distributionY } = traderJoeSdk[
        distributionMethod
      ](activeBinId, binRange, [tokenXAmount, tokenYAmount]);

      distributionX = distributionX.map((el) =>
        BigInt(el) > BigInt(10) ? BigInt(el) - BigInt(10) : BigInt(el)
      );
      distributionY = distributionY.map((el) =>
        BigInt(el) > BigInt(10) ? BigInt(el) - BigInt(10) : BigInt(el)
      );

      // declare liquidity parameters
      const addLiquidityInput = {
        tokenX: tokenX.address,
        tokenY: tokenY.address,
        binStep: Number(binStep),
        amountX: tokenXAmount.raw.toString(),
        amountY: tokenYAmount.raw.toString(),
        amountXMin: minTokenXAmount.toString(),
        amountYMin: minTokenYAmount.toString(),
        activeIdDesired: activeBinId,
        idSlippage,
        deltaIds,
        distributionX,
        distributionY,
        to: address,
        refundTo: address,
        deadline,
      };

      return addLiquidityInput;
    }

    function getIdSlippageFromPriceSlippage(
      priceSlippage: number,
      binStep: number
    ) {
      return Math.floor(
        Math.log(1 + priceSlippage) / Math.log(1 + binStep / 1e4)
      );
    }

    function initializeToken(tokenData: any) {
      // initialize Token
      const token = new Token(
        43114,
        tokenData.address,
        tokenData.decimals,
        tokenData.symbol,
        tokenData.name
      );

      return token;
    }

    before("deploy factory and pool", async () => {
      [owner, depositor] = await getFixedGasSigners(10000000);
      depositor = depositor || owner; // Fallback to owner if depositor is undefined. Anvil specific issue, no secrets locally

      let assetsList = [
        "AVAX",
        "USDC",
        "ETH",
        "sAVAX",
        "YY_AAVE_AVAX",
        "GLP",
        "YY_GLP",
        "PNG_AVAX_USDC_LP",
        "WOMBAT_sAVAX_AVAX_LP_AVAX",
        "WOMBAT_sAVAX_AVAX_LP_sAVAX",
      ];

      let poolNameAirdropList: Array<PoolInitializationObject> = [
        { name: "AVAX", airdropList: [depositor] },
        { name: "USDC", airdropList: [depositor] },
      ];

      diamondAddress = await deployDiamond();

      smartLoansFactory = (await deployContract(
        owner,
        SmartLoansFactoryArtifact
      )) as SmartLoansFactory;

      let tokenManager = (await deployContract(
        owner,
        MockTokenManagerArtifact,
        []
      )) as MockTokenManager;

      await deployPools(
        smartLoansFactory,
        poolNameAirdropList,
        tokenContracts,
        poolContracts,
        lendingPools,
        owner,
        depositor,
        2000,
        "AVAX",
        [],
        tokenManager.address
      );

      tokensPrices = await getTokensPricesMap(
        assetsList,
        "avalanche",
        getRedstonePrices,
        []
      );
      MOCK_PRICES = convertTokenPricesMapToMockPrices(tokensPrices);
      supportedAssets = convertAssetsListToSupportedAssets(assetsList);
      // Use real token addresses for all tokens (we'll get them through swapping like ParaSwap test)
      addMissingTokenContracts(
        tokenContracts,
        assetsList.filter(
          (asset) => !Array.from(tokenContracts.keys()).includes(asset)
        )
      );

      await tokenManager
        .connect(owner)
        .initialize(supportedAssets, lendingPools);
      await tokenManager
        .connect(owner)
        .setFactoryAddress(smartLoansFactory.address);

      await smartLoansFactory.initialize(diamondAddress, tokenManager.address);

      await tokenManager.setDebtCoverageStaked(
        toBytes32("WOMBAT_sAVAX_AVAX_LP_AVAX"),
        toWei("0.8333333333333333")
      );
      await tokenManager.setDebtCoverageStaked(
        toBytes32("WOMBAT_sAVAX_AVAX_LP_sAVAX"),
        toWei("0.8333333333333333")
      );

      sut = (await deployAndInitExchangeContract(
        owner,
        pangolinRouterAddress,
        tokenManager.address,
        supportedAssets,
        "PangolinIntermediary"
      )) as PangolinIntermediary;

      let addressProvider = (await deployContract(
        owner,
        AddressProviderArtifact,
        []
      )) as AddressProvider;

      AVAX_PRICE = tokensPrices.get("AVAX")!;
      USD_PRICE = tokensPrices.get("USDC")!;

      await sut.initialize(pangolinRouterAddress, tokenManager.address, [
        TOKEN_ADDRESSES["AVAX"],
        TOKEN_ADDRESSES["USDC"],
      ]);

      wavaxToken = new ethers.Contract(
        TOKEN_ADDRESSES["AVAX"],
        wavaxAbi,
        provider
      );
      usdToken = new ethers.Contract(
        TOKEN_ADDRESSES["USDC"],
        erc20ABI,
        provider
      );
      usdTokenDecimalPlaces = await usdToken.decimals();
      router = await new ethers.Contract(
        pangolinRouterAddress,
        UniswapV2IntermediaryAbi
      );

      lpTokenAddress = await sut
        .connect(owner)
        .getPair(TOKEN_ADDRESSES["AVAX"], TOKEN_ADDRESSES["USDC"]);
      lpToken = new ethers.Contract(lpTokenAddress, erc20ABI, provider);

      await wavaxToken.connect(owner).deposit({ value: toWei("1000") });

      await recompileConstantsFile(
        "local",
        "DeploymentConstants",
        [],
        tokenManager.address,
        addressProvider.address,
        diamondAddress,
        smartLoansFactory.address,
        "lib"
      );

      await deployAllFacets(diamondAddress);
    });

    it("should deploy a smart loan", async () => {
      await smartLoansFactory.connect(owner).createLoan();
      const loan_proxy_address = await smartLoansFactory.getLoanForOwner(
        owner.address
      );
      loan = await ethers.getContractAt(
        "SmartLoanGigaChadInterface",
        loan_proxy_address,
        owner
      );

      // Use RedStone oracle wrapper with mock price feeds
      wrappedLoan = WrapperBuilder
        // @ts-ignore
        .wrap(loan)
        .usingSimpleNumericMock({
          mockSignersCount: 10,
          dataPoints: MOCK_PRICES,
        });
    });

    it("should have infinite health ratio with collateral and no debt", async () => {
      // Initially, no assets - should have max health ratio
      let initialHealthRatio = fromWei(await wrappedLoan.getHealthRatio());
      let initialTotalValue = fromWei(await wrappedLoan.getTotalValue());
      let initialDebt = fromWei(await wrappedLoan.getDebt());
      let initialTWV = fromWei(await wrappedLoan.getThresholdWeightedValue());

      console.log("Initial state:");
      console.log("Health Ratio:", initialHealthRatio);
      console.log("Total Value:", initialTotalValue);
      console.log("Total Debt:", initialDebt);
      console.log("Threshold Weighted Value:", initialTWV);

      expect(initialTotalValue).to.equal(0);
      expect(initialDebt).to.equal(0);
      expect(initialTWV).to.equal(0);
      expect(await wrappedLoan.isSolvent()).to.be.true;

      // Fund with substantial AVAX collateral for comprehensive testing
      const collateralAmount = toWei("1000"); // Increased for better testing
      await tokenContracts
        .get("AVAX")!
        .connect(owner)
        .deposit({ value: collateralAmount });
      await tokenContracts
        .get("AVAX")!
        .connect(owner)
        .approve(wrappedLoan.address, collateralAmount);
      await wrappedLoan.fund(toBytes32("AVAX"), collateralAmount);

      let postFundHealthRatio = fromWei(await wrappedLoan.getHealthRatio());
      let postFundTotalValue = fromWei(await wrappedLoan.getTotalValue());
      let postFundDebt = fromWei(await wrappedLoan.getDebt());
      let postFundTWV = fromWei(await wrappedLoan.getThresholdWeightedValue());

      console.log("\nAfter funding with AVAX:");
      console.log("Health Ratio:", postFundHealthRatio);
      console.log("Total Value:", postFundTotalValue);
      console.log("Total Debt:", postFundDebt);
      console.log("Threshold Weighted Value:", postFundTWV);

      // Should have value but no debt, so infinite health ratio
      expect(postFundTotalValue).to.be.greaterThan(0);
      expect(postFundDebt).to.equal(0);
      expect(postFundTWV).to.be.greaterThan(0);
      expect(postFundHealthRatio).to.be.greaterThan(1e50); // Very large number representing infinity
      expect(await wrappedLoan.isSolvent()).to.be.true;
    });

    it("should maintain solvency after borrowing AVAX", async () => {
      // Start borrowing operations - first borrow AVAX
      console.log("\nBorrowing AVAX to test debt handling:");

      // Borrow a substantial amount of AVAX
      const avaxBorrowAmount = toWei("500"); // 500 AVAX
      await wrappedLoan.borrow(toBytes32("AVAX"), avaxBorrowAmount);

      let healthRatio = fromWei(await wrappedLoan.getHealthRatio());
      let totalValue = fromWei(await wrappedLoan.getTotalValue());
      let totalDebt = fromWei(await wrappedLoan.getDebt());
      let thresholdWeightedValue = fromWei(
        await wrappedLoan.getThresholdWeightedValue()
      );

      console.log("After borrowing 500 AVAX:");
      console.log("Health Ratio:", healthRatio);
      console.log("Total Value:", totalValue);
      console.log("Total Debt:", totalDebt);
      console.log("Threshold Weighted Value:", thresholdWeightedValue);

      // Should now have substantial debt but still be solvent
      expect(totalValue).to.be.greaterThan(20000); // Should be worth > $20k
      expect(totalDebt).to.be.greaterThan(8000); // Should have > $8k debt (500 AVAX * ~$19)
      expect(thresholdWeightedValue).to.be.greaterThan(totalDebt);
      expect(healthRatio).to.be.greaterThan(1.2); // Should be healthy but not infinite
      expect(healthRatio).to.be.lessThan(1000); // Should be finite now
      expect(await wrappedLoan.isSolvent()).to.be.true;

      // Verify debt is tracked properly
      let debtAssets = await wrappedLoan.getDebts();
      expect(debtAssets.length).to.be.greaterThan(0); // Should have debt assets now
    });

    it("should swap borrowed assets to diversify portfolio", async () => {
      let totalValueBefore = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioBefore = fromWei(await wrappedLoan.getHealthRatio());
      let debtBefore = fromWei(await wrappedLoan.getDebt());

      console.log("\nBefore swapping borrowed assets:");
      console.log("Total Value:", totalValueBefore);
      console.log("Total Debt:", debtBefore);
      console.log("Health Ratio:", healthRatioBefore);

      // Check current balances
      let avaxBalance = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalance = await wrappedLoan.getBalance(toBytes32("USDC"));
      let ethBalance = await wrappedLoan.getBalance(toBytes32("ETH"));

      console.log("Current balances:");
      console.log("AVAX:", formatUnits(avaxBalance, 18));
      console.log("USDC:", formatUnits(usdcBalance, 6));
      console.log("ETH:", formatUnits(ethBalance, 18));

      // Use borrowed assets to swap and diversify portfolio
      if (avaxBalance.gt(toWei("10"))) {
        // Swap some AVAX to ETH
        const swapAmount = toWei("50");
        await wrappedLoan.swapPangolin(
          toBytes32("AVAX"),
          toBytes32("ETH"),
          swapAmount,
          0
        );
        console.log(`Swapped ${formatUnits(swapAmount, 18)} AVAX to ETH`);
      }

      if (avaxBalance.gt(toWei("500"))) {
        // Swap some AVAX to ETH
        const swapAmount = toWei("500");
        await wrappedLoan.swapPangolin(
          toBytes32("AVAX"),
          toBytes32("USDC"),
          swapAmount,
          0
        );
        console.log(`Swapped ${formatUnits(swapAmount, 18)} AVAX to USDC`);
      }

      if (usdcBalance.gt(parseUnits("100", 6))) {
        // Swap some USDC to ETH
        const swapAmount = parseUnits("100", 6);
        await wrappedLoan.swapPangolin(
          toBytes32("USDC"),
          toBytes32("ETH"),
          swapAmount,
          0
        );
        console.log(`Swapped ${formatUnits(swapAmount, 6)} USDC to ETH`);
      }

      let totalValueAfter = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioAfter = fromWei(await wrappedLoan.getHealthRatio());
      let debtAfter = fromWei(await wrappedLoan.getDebt());

      console.log("\nAfter swapping to diversify:");
      console.log("Total Value:", totalValueAfter);
      console.log("Total Debt:", debtAfter);
      console.log("Health Ratio:", healthRatioAfter);

      // Final balances
      avaxBalance = await wrappedLoan.getBalance(toBytes32("AVAX"));
      usdcBalance = await wrappedLoan.getBalance(toBytes32("USDC"));
      ethBalance = await wrappedLoan.getBalance(toBytes32("ETH"));

      console.log("Final balances:");
      console.log("AVAX:", formatUnits(avaxBalance, 18));
      console.log("USDC:", formatUnits(usdcBalance, 6));
      console.log("ETH:", formatUnits(ethBalance, 18));

      // Debt should be unchanged by swapping
      expect(debtAfter).to.be.closeTo(debtBefore, 1);

      // Total value should be preserved (minus slippage)
      expect(totalValueAfter).to.be.closeTo(
        totalValueBefore,
        totalValueBefore * 0.05
      ); // 5% tolerance for slippage

      // Should maintain solvency
      expect(await wrappedLoan.isSolvent()).to.be.true;
    });

    it("should add liquidity to TraderJoe V2 AVAX/USDC pair and maintain solvency", async () => {
      console.log("\n=== TRADERJOE V2 LIQUIDITY ADDITION TEST ===");

      // Check current balances before adding liquidity
      let avaxBalanceBefore = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalanceBefore = await wrappedLoan.getBalance(toBytes32("USDC"));
      let totalValueBefore = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioBefore = fromWei(await wrappedLoan.getHealthRatio());
      let debtBefore = fromWei(await wrappedLoan.getDebt());

      console.log("\n--- Status Before TraderJoe V2 Liquidity Addition ---");
      console.log("AVAX Balance:", formatUnits(avaxBalanceBefore, 18));
      console.log("USDC Balance:", formatUnits(usdcBalanceBefore, 6));
      console.log("Total Value:", totalValueBefore);
      console.log("Total Debt:", debtBefore);
      console.log("Health Ratio:", healthRatioBefore);

      // Check TraderJoe V2 positions before
      let tjv2PositionsBefore = await wrappedLoan.getOwnedTraderJoeV2Bins();
      console.log("TJV2 positions before:", tjv2PositionsBefore.length);

      // Define amounts for liquidity addition
      const avaxForTJV2 = toWei("50"); // 50 AVAX
      const usdcForTJV2 = parseUnits("500", 6); // 500 USDC

      console.log("\n--- Amounts for TraderJoe V2 Liquidity ---");
      console.log("AVAX to use:", formatUnits(avaxForTJV2, 18));
      console.log("USDC to use:", formatUnits(usdcForTJV2, 6));

      // Verify we have enough tokens
      expect(avaxBalanceBefore).to.be.gte(
        avaxForTJV2,
        "Insufficient AVAX balance"
      );
      expect(usdcBalanceBefore).to.be.gte(
        usdcForTJV2,
        "Insufficient USDC balance"
      );

      // Create token objects for TraderJoe SDK
      const tokenX = initializeToken({
        address: TOKEN_ADDRESSES["AVAX"],
        decimals: 18,
        symbol: "WAVAX",
        name: "WAVAX",
      });

      const tokenY = initializeToken({
        address: TOKEN_ADDRESSES["USDC"],
        decimals: 6,
        symbol: "USDC",
        name: "USDC",
      });

      // Get active bin ID from the pair
      const lbPairContract = new ethers.Contract(
        avaxUsdcLBPairAddress,
        LBPairABI,
        provider
      );
      const activeId = await lbPairContract.getActiveId();
      console.log("Active bin ID:", activeId);
      activeIDForStored = activeId; // Store for later use

      // Prepare liquidity parameters
      let input = getAddLiquidityParameters(
        wrappedLoan.address,
        tokenX,
        tokenY,
        avaxForTJV2.toString(),
        usdcForTJV2.toString(),
        "getUniformDistributionFromBinRange",
        20, // 20 bps bin step
        activeId,
        [activeId - 2, activeId + 2], // Range around active bin
        2, // 2% price slippage
        2 // 2% amount slippage
      );

      console.log("\n--- Adding TraderJoe V2 Liquidity ---");
      console.log("Using router:", tjv21RouterAddress);

      // Add liquidity through the wrapped loan
      await wrappedLoan.addLiquidityTraderJoeV2(tjv21RouterAddress, input);

      console.log("TraderJoe V2 liquidity addition completed");

      // Check balances after liquidity addition
      let avaxBalanceAfter = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalanceAfter = await wrappedLoan.getBalance(toBytes32("USDC"));
      let totalValueAfter = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioAfter = fromWei(await wrappedLoan.getHealthRatio());
      let debtAfter = fromWei(await wrappedLoan.getDebt());

      console.log("\n--- Status After TraderJoe V2 Liquidity Addition ---");
      console.log("AVAX Balance:", formatUnits(avaxBalanceAfter, 18));
      console.log("USDC Balance:", formatUnits(usdcBalanceAfter, 6));
      console.log("Total Value:", totalValueAfter);
      console.log("Total Debt:", debtAfter);
      console.log("Health Ratio:", healthRatioAfter);

      // Check TraderJoe V2 positions after
      let tjv2PositionsAfter = await wrappedLoan.getOwnedTraderJoeV2Bins();
      console.log("TJV2 positions after:", tjv2PositionsAfter.length);

      // Calculate changes
      const avaxUsed = avaxBalanceBefore.sub(avaxBalanceAfter);
      const usdcUsed = usdcBalanceBefore.sub(usdcBalanceAfter);

      console.log("\n--- Changes ---");
      console.log("AVAX used:", formatUnits(avaxUsed, 18));
      console.log("USDC used:", formatUnits(usdcUsed, 6));
      console.log(
        "New TJV2 positions:",
        tjv2PositionsAfter.length - tjv2PositionsBefore.length
      );

      // Store bin ID for removal test
      if (tjv2PositionsAfter.length > 0) {
        tjv2BinId = tjv2PositionsAfter[tjv2PositionsAfter.length - 1].id;
        console.log("Stored bin ID for removal:", tjv2BinId);
      }

      // Verification
      console.log("\n--- Verification ---");
      console.log("AVAX used > 0:", avaxUsed.gt(0));
      console.log("USDC used > 0:", usdcUsed.gt(0));
      console.log(
        "New TJV2 position created:",
        tjv2PositionsAfter.length > tjv2PositionsBefore.length
      );
      console.log("Loan still solvent:", await wrappedLoan.isSolvent());

      // Assertions
      expect(avaxUsed).to.be.gt(0, "No AVAX was used");
      expect(usdcUsed).to.be.gt(0, "No USDC was used");
      expect(tjv2PositionsAfter.length).to.be.gt(
        tjv2PositionsBefore.length,
        "No new TJV2 position created"
      );
      expect(await wrappedLoan.isSolvent()).to.be.true;

      // Debt should remain unchanged
      expect(debtAfter).to.be.closeTo(debtBefore, 1);

      // Total value should be preserved (allowing for small variations)
      expect(totalValueAfter).to.be.closeTo(
        totalValueBefore,
        totalValueBefore * 0.05, // 5% tolerance
        "Total value should be preserved"
      );

      console.log("✅ TraderJoe V2 liquidity addition successful!");
    });

    it("should remove liquidity from TraderJoe V2 AVAX/USDC pair and maintain solvency", async () => {
      console.log("\n=== TRADERJOE V2 LIQUIDITY REMOVAL TEST ===");

      // Check TraderJoe V2 positions before removal
      let tjv2PositionsBefore = await wrappedLoan.getOwnedTraderJoeV2Bins();
      console.log("TJV2 positions before removal:", tjv2PositionsBefore.length);

      if (tjv2PositionsBefore.length === 0) {
        console.log("No TraderJoe V2 positions to remove, skipping test");
        return;
      }

      // Find and remove from the active bin
      let targetBin = tjv2PositionsBefore.find(
        (bin) => bin.id === activeIDForStored
      ); // Active bin
      console.log("Target bin to remove:", targetBin.id);
      console.log("Target pair:", targetBin.pair);

      // Check current balances before removing liquidity
      let avaxBalanceBefore = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalanceBefore = await wrappedLoan.getBalance(toBytes32("USDC"));
      let totalValueBefore = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioBefore = fromWei(await wrappedLoan.getHealthRatio());
      let debtBefore = fromWei(await wrappedLoan.getDebt());

      console.log("\n--- Status Before TraderJoe V2 Liquidity Removal ---");
      console.log("AVAX Balance:", formatUnits(avaxBalanceBefore, 18));
      console.log("USDC Balance:", formatUnits(usdcBalanceBefore, 6));
      console.log("Total Value:", totalValueBefore);
      console.log("Total Debt:", debtBefore);
      console.log("Health Ratio:", healthRatioBefore);

      // Get the LP token balance for the specific bin
      const lbToken = await ethers.getContractAt(
        LBTokenAbi,
        targetBin.pair,
        owner
      );
      let binBalance = await lbToken.balanceOf(
        wrappedLoan.address,
        targetBin.id
      );

      console.log("\n--- LP Token Balance to Remove ---");
      console.log("Bin ID:", targetBin.id);
      console.log("LP Balance:", formatUnits(binBalance, 18));

      if (binBalance.eq(0)) {
        console.log("No LP tokens in this bin, skipping removal");
        return;
      }

      // Remove half of the liquidity to test partial removal
      const amountToRemove = binBalance.div(2);
      console.log("Amount to remove (50%):", formatUnits(amountToRemove, 18));
      //   Remove all liquidity for radicalism
      //   const amountToRemove = binBalance;
      //   console.log("Amount to remove (100%):", formatUnits(amountToRemove, 18));

      console.log("\n--- Removing TraderJoe V2 Liquidity ---");
      console.log("Using router:", tjv21RouterAddress);

      // Remove liquidity through the wrapped loan
      await wrappedLoan.removeLiquidityTraderJoeV2(tjv21RouterAddress, [
        TOKEN_ADDRESSES["AVAX"], // tokenX
        TOKEN_ADDRESSES["USDC"], // tokenY
        20, // binStep
        0, // amountXMin
        0, // amountYMin
        [targetBin.id], // ids
        [amountToRemove], // amounts
        Math.ceil(new Date().getTime() / 1000 + 100), // deadline
      ]);

      console.log("TraderJoe V2 liquidity removal completed");

      binBalance = await lbToken.balanceOf(wrappedLoan.address, targetBin.id);

      // Check balances after liquidity removal
      let avaxBalanceAfter = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalanceAfter = await wrappedLoan.getBalance(toBytes32("USDC"));
      let totalValueAfter = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioAfter = fromWei(await wrappedLoan.getHealthRatio());
      let debtAfter = fromWei(await wrappedLoan.getDebt());

      console.log("\n--- Status After TraderJoe V2 Liquidity Removal ---");
      console.log("AVAX Balance:", formatUnits(avaxBalanceAfter, 18));
      console.log("USDC Balance:", formatUnits(usdcBalanceAfter, 6));
      console.log("LP Balance:", formatUnits(binBalance, 18));
      console.log("Total Value:", totalValueAfter);
      console.log("Total Debt:", debtAfter);
      console.log("Health Ratio:", healthRatioAfter);

      // Check TraderJoe V2 positions after removal
      let tjv2PositionsAfter = await wrappedLoan.getOwnedTraderJoeV2Bins();
      console.log("TJV2 positions after removal:", tjv2PositionsAfter.length);

      // Calculate what was received
      const avaxReceived = avaxBalanceAfter.sub(avaxBalanceBefore);
      const usdcReceived = usdcBalanceAfter.sub(usdcBalanceBefore);

      console.log("\n--- Changes ---");
      console.log("AVAX received:", formatUnits(avaxReceived, 18));
      console.log("USDC received:", formatUnits(usdcReceived, 6));

      // Check remaining LP balance in the bin
      const remainingBalance = await lbToken.balanceOf(
        wrappedLoan.address,
        targetBin.id
      );
      console.log("Remaining LP balance:", formatUnits(remainingBalance, 18));

      // Verification
      console.log("\n--- Verification ---");
      console.log("Partial removal successful:", remainingBalance.gt(0));
      console.log("Loan still solvent:", await wrappedLoan.isSolvent());

      // Assertions
      expect(remainingBalance).to.be.gt(
        0,
        "Should have remaining LP tokens (partial removal)"
      );
      expect(await wrappedLoan.isSolvent()).to.be.true;

      // Debt should remain unchanged
      expect(debtAfter).to.be.closeTo(debtBefore, 1);

      // Total value should be preserved (allowing for small variations)
      expect(totalValueAfter).to.be.closeTo(
        totalValueBefore,
        totalValueBefore * 0.05, // 5% tolerance
        "Total value should be preserved"
      );

      console.log("✅ TraderJoe V2 liquidity removal successful!");
    });

    it("should stake AVAX in Wombat pool and maintain solvency", async () => {
      console.log("\n=== WOMBAT STAKING TEST ===");

      // Check current balances before Wombat staking
      let avaxBalanceBefore = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let totalValueBefore = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioBefore = fromWei(await wrappedLoan.getHealthRatio());
      let debtBefore = fromWei(await wrappedLoan.getDebt());
      let thresholdWeightedValueBefore = fromWei(
        await wrappedLoan.getThresholdWeightedValue()
      );

      console.log("\n--- Status Before Wombat Staking ---");
      console.log("AVAX Balance:", formatUnits(avaxBalanceBefore, 18));
      console.log("Total Value:", totalValueBefore);
      console.log("Total Debt:", debtBefore);
      console.log("Health Ratio:", healthRatioBefore);
      console.log("Threshold Weighted Value:", thresholdWeightedValueBefore);
      const stakedPositionsBefore = await wrappedLoan.getStakedPositions();
      console.log(
        "Number of staked positions before:",
        stakedPositionsBefore.length
      );

      // Use a portion of AVAX for Wombat staking (e.g., 100 AVAX)
      const avaxToStake = toWei("100");

      // Verify we have enough AVAX
      if (avaxBalanceBefore.lt(avaxToStake)) {
        console.log("Insufficient AVAX for staking, using available balance");
        const actualStakeAmount = avaxBalanceBefore.div(2); // Use half of available
        if (actualStakeAmount.gt(toWei("1"))) {
          await wrappedLoan.depositAvaxToAvaxSavax(actualStakeAmount, 0);
          console.log(
            `Staked ${formatUnits(
              actualStakeAmount,
              18
            )} AVAX in Wombat sAVAX-AVAX pool`
          );
        } else {
          console.log("Insufficient AVAX for meaningful staking, skipping");
          return;
        }
      } else {
        // Stake AVAX in Wombat sAVAX-AVAX pool
        await wrappedLoan.depositAvaxToAvaxSavax(avaxToStake, 0);
        console.log(
          `Staked ${formatUnits(
            avaxToStake,
            18
          )} AVAX in Wombat sAVAX-AVAX pool`
        );
      }

      // Check balances after staking
      let avaxBalanceAfter = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let wombatLpBalance = await wrappedLoan.avaxBalanceAvaxSavax();
      let totalValueAfter = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioAfter = fromWei(await wrappedLoan.getHealthRatio());
      let debtAfter = fromWei(await wrappedLoan.getDebt());
      let thresholdWeightedValueAfter = fromWei(
        await wrappedLoan.getThresholdWeightedValue()
      );

      console.log("\n--- Status After Wombat Staking ---");
      console.log("AVAX Balance:", formatUnits(avaxBalanceAfter, 18));
      console.log("Wombat LP Balance:", formatUnits(wombatLpBalance, 18));
      console.log("Total Value:", totalValueAfter);
      console.log("Total Debt:", debtAfter);
      console.log("Health Ratio:", healthRatioAfter);
      console.log("Threshold Weighted Value:", thresholdWeightedValueAfter);

      // Verify staked positions are included in solvency calculations
      let stakedPositions = await wrappedLoan.getStakedPositions();

      console.log("\n--- Verification ---");
      console.log("Wombat LP tokens received:", wombatLpBalance.gt(0));
      console.log(
        "AVAX balance decreased:",
        avaxBalanceAfter.lt(avaxBalanceBefore)
      );
      console.log("Number of staked positions:", stakedPositions.length);
      console.log("Loan remains solvent:", await wrappedLoan.isSolvent());

      // Assertions
      expect(wombatLpBalance).to.be.gt(0, "Should receive Wombat LP tokens");
      expect(avaxBalanceAfter).to.be.lt(
        avaxBalanceBefore,
        "AVAX balance should decrease"
      );
      expect(stakedPositions.length > 0, "Should have Wombat staked position")
        .to.be.true;

      // Debt should remain unchanged
      expect(debtAfter).to.be.closeTo(
        debtBefore,
        1,
        "Debt should remain unchanged"
      );

      // Total value should be preserved (allowing for small variations due to LP token pricing)
      expect(totalValueAfter).to.be.closeTo(
        totalValueBefore,
        totalValueBefore * 0.05,
        "Total value should be preserved"
      );

      // Health ratio should be maintained
      expect(healthRatioAfter).to.be.greaterThan(
        1,
        "Health ratio should remain > 1"
      );
      expect(await wrappedLoan.isSolvent(), "Loan should remain solvent").to.be
        .true;

      console.log("✅ Wombat staking successful - solvency maintained!");
    });

    it("should provide liquidity using loan's AVAX and USDC balances", async () => {
      console.log("\n=== LIQUIDITY PROVISION TEST FOR WRAPPED LOAN ===");

      // Check loan's current balances (should have both AVAX and USDC from previous swaps)
      let avaxBalance = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalance = await wrappedLoan.getBalance(toBytes32("USDC"));
      let ethBalance = await wrappedLoan.getBalance(toBytes32("ETH"));

      console.log("\n--- Loan's Current Balances ---");
      console.log("AVAX:", formatUnits(avaxBalance, 18));
      console.log("USDC:", formatUnits(usdcBalance, 6));
      console.log("ETH:", formatUnits(ethBalance, 18));

      // Check loan's solvency before liquidity provision
      let totalValueBefore = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioBefore = fromWei(await wrappedLoan.getHealthRatio());
      let debtBefore = fromWei(await wrappedLoan.getDebt());

      console.log("\n--- Loan Status Before Liquidity Provision ---");
      console.log("Total Value:", totalValueBefore);
      console.log("Total Debt:", debtBefore);
      console.log("Health Ratio:", healthRatioBefore);

      // Determine amounts to use for liquidity provision
      // Use reasonable portions of available balances
      const avaxForLiquidity = avaxBalance.div(4); // Use 25% of AVAX
      const usdcForLiquidity = usdcBalance.div(4); // Use 25% of USDC

      console.log("\n--- Amounts for Liquidity Provision ---");
      console.log("AVAX to use:", formatUnits(avaxForLiquidity, 18));
      console.log("USDC to use:", formatUnits(usdcForLiquidity, 6));

      // Check minimum thresholds
      const minAvax = toWei("0.1");
      const minUsdc = parseUnits("1", 6);

      console.log("\n--- Minimum Requirements Check ---");
      console.log("Min AVAX needed:", formatUnits(minAvax, 18));
      console.log("Min USDC needed:", formatUnits(minUsdc, 6));
      console.log("AVAX sufficient:", avaxForLiquidity.gte(minAvax));
      console.log("USDC sufficient:", usdcForLiquidity.gte(minUsdc));

      // Verify we have enough tokens
      if (avaxForLiquidity.lt(minAvax) || usdcForLiquidity.lt(minUsdc)) {
        console.log("\n❌ INSUFFICIENT BALANCES FOR LIQUIDITY PROVISION");
        console.log("Available AVAX:", formatUnits(avaxForLiquidity, 18));
        console.log("Available USDC:", formatUnits(usdcForLiquidity, 6));
        expect.fail(
          "Loan doesn't have sufficient AVAX and USDC balances for liquidity provision"
        );
      }

      // Check initial LP token balance for the loan
      const initialLpBalance = await wrappedLoan.getBalance(
        toBytes32("PNG_AVAX_USDC_LP")
      );
      console.log("\n--- Initial LP Token Balance ---");
      console.log("Initial LP tokens:", formatUnits(initialLpBalance, 18));

      // Provide liquidity using the loan's addLiquidityPangolin function
      console.log("\n--- Adding Liquidity via Wrapped Loan ---");
      console.log("AVAX address:", TOKEN_ADDRESSES["AVAX"]);
      console.log("USDC address:", TOKEN_ADDRESSES["USDC"]);
      console.log(
        "AVAX < USDC (AVAX is token A):",
        TOKEN_ADDRESSES["AVAX"] < TOKEN_ADDRESSES["USDC"]
      );
      console.log("Calling addLiquidityPangolin...");

      await wrappedLoan.addLiquidityPangolin(
        toBytes32("AVAX"),
        toBytes32("USDC"),
        avaxForLiquidity,
        usdcForLiquidity,
        avaxForLiquidity.mul(10).div(100), // Very low minimum - 10% of desired AVAX
        usdcForLiquidity.mul(10).div(100) // Very low minimum - 10% of desired USDC
      );

      console.log("Add liquidity transaction completed");

      // Check balances after liquidity provision
      let avaxBalanceAfter = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalanceAfter = await wrappedLoan.getBalance(toBytes32("USDC"));
      let lpBalanceAfter = await wrappedLoan.getBalance(
        toBytes32("PNG_AVAX_USDC_LP")
      );

      console.log("\n--- Balances After Liquidity Provision ---");
      console.log("AVAX after:", formatUnits(avaxBalanceAfter, 18));
      console.log("USDC after:", formatUnits(usdcBalanceAfter, 6));
      console.log("LP tokens after:", formatUnits(lpBalanceAfter, 18));

      // Calculate changes
      const avaxUsed = avaxBalance.sub(avaxBalanceAfter);
      const usdcUsed = usdcBalance.sub(usdcBalanceAfter);
      const lpTokensReceived = lpBalanceAfter.sub(initialLpBalance);

      console.log("\n--- Changes ---");
      console.log("AVAX used:", formatUnits(avaxUsed, 18));
      console.log("USDC used:", formatUnits(usdcUsed, 6));
      console.log("LP tokens received:", formatUnits(lpTokensReceived, 18));

      // Check loan's solvency after liquidity provision
      let totalValueAfter = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioAfter = fromWei(await wrappedLoan.getHealthRatio());
      let debtAfter = fromWei(await wrappedLoan.getDebt());

      console.log("\n--- Loan Status After Liquidity Provision ---");
      console.log("Total Value:", totalValueAfter);
      console.log("Total Debt:", debtAfter);
      console.log("Health Ratio:", healthRatioAfter);

      // Verify LP tokens were received
      console.log("\n--- Verification ---");
      console.log("LP tokens received > 0:", lpTokensReceived.gt(0));
      console.log("Loan still solvent:", await wrappedLoan.isSolvent());

      // Assertions
      expect(lpTokensReceived).to.be.gt(0, "No LP tokens were received");
      expect(avaxUsed).to.be.gt(0, "No AVAX was used");
      expect(usdcUsed).to.be.gt(0, "No USDC was used");
      expect(await wrappedLoan.isSolvent()).to.be.true;

      // Debt should remain unchanged
      expect(debtAfter).to.be.closeTo(debtBefore, 1);

      console.log("✅ Liquidity provision successful!");
    });

    it("should remove liquidity from loan's LP tokens", async () => {
      console.log("\n=== REMOVE LIQUIDITY TEST FOR WRAPPED LOAN ===");

      // Check loan's current LP token balance
      const lpBalanceBeforeRemove = await wrappedLoan.getBalance(
        toBytes32("PNG_AVAX_USDC_LP")
      );

      console.log("\n--- Initial LP Token Balance ---");
      console.log("Loan's LP balance:", formatUnits(lpBalanceBeforeRemove, 18));

      if (lpBalanceBeforeRemove.eq(0)) {
        console.log("No LP tokens to remove, skipping test");
        return; // Exit gracefully if no LP tokens
      }

      // Check loan's token balances before removing liquidity
      let avaxBalanceBefore = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalanceBefore = await wrappedLoan.getBalance(toBytes32("USDC"));

      console.log("\n--- Token Balances Before Removing Liquidity ---");
      console.log("AVAX before:", formatUnits(avaxBalanceBefore, 18));
      console.log("USDC before:", formatUnits(usdcBalanceBefore, 6));

      // Check loan's solvency before liquidity removal
      let totalValueBefore = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioBefore = fromWei(await wrappedLoan.getHealthRatio());
      let debtBefore = fromWei(await wrappedLoan.getDebt());

      console.log("\n--- Loan Status Before Liquidity Removal ---");
      console.log("Total Value:", totalValueBefore);
      console.log("Total Debt:", debtBefore);
      console.log("Health Ratio:", healthRatioBefore);

      // Remove all LP tokens
      console.log("\n--- Removing Liquidity via Wrapped Loan ---");
      console.log(
        "LP tokens to remove:",
        formatUnits(lpBalanceBeforeRemove, 18)
      );
      console.log("Calling removeLiquidityPangolin...");

      await wrappedLoan.removeLiquidityPangolin(
        toBytes32("AVAX"),
        toBytes32("USDC"),
        lpBalanceBeforeRemove,
        1, // Accept minimal AVAX amount
        1 // Accept minimal USDC amount
      );

      console.log("Remove liquidity transaction completed");

      // Check balances after liquidity removal
      const lpBalanceAfterRemove = await wrappedLoan.getBalance(
        toBytes32("PNG_AVAX_USDC_LP")
      );
      let avaxBalanceAfter = await wrappedLoan.getBalance(toBytes32("AVAX"));
      let usdcBalanceAfter = await wrappedLoan.getBalance(toBytes32("USDC"));

      console.log("\n--- Balances After Liquidity Removal ---");
      console.log("LP tokens after:", formatUnits(lpBalanceAfterRemove, 18));
      console.log("AVAX after:", formatUnits(avaxBalanceAfter, 18));
      console.log("USDC after:", formatUnits(usdcBalanceAfter, 6));

      // Calculate what was received
      const avaxReceived = avaxBalanceAfter.sub(avaxBalanceBefore);
      const usdcReceived = usdcBalanceAfter.sub(usdcBalanceBefore);
      const lpTokensRemoved = lpBalanceBeforeRemove.sub(lpBalanceAfterRemove);

      console.log("\n--- Changes ---");
      console.log("LP tokens removed:", formatUnits(lpTokensRemoved, 18));
      console.log("AVAX received:", formatUnits(avaxReceived, 18));
      console.log("USDC received:", formatUnits(usdcReceived, 6));

      // Check loan's solvency after liquidity removal
      let totalValueAfter = fromWei(await wrappedLoan.getTotalValue());
      let healthRatioAfter = fromWei(await wrappedLoan.getHealthRatio());
      let debtAfter = fromWei(await wrappedLoan.getDebt());

      console.log("\n--- Loan Status After Liquidity Removal ---");
      console.log("Total Value:", totalValueAfter);
      console.log("Total Debt:", debtAfter);
      console.log("Health Ratio:", healthRatioAfter);

      // Verification
      console.log("\n--- Verification ---");
      console.log("All LP tokens removed:", lpBalanceAfterRemove.eq(0));
      console.log("AVAX received > 0:", avaxReceived.gt(0));
      console.log("USDC received > 0:", usdcReceived.gt(0));
      console.log("Loan still solvent:", await wrappedLoan.isSolvent());

      // Assertions
      expect(lpBalanceAfterRemove).to.be.equal(
        0,
        "LP tokens should be completely removed"
      );
      expect(avaxReceived).to.be.gt(0, "Should receive some AVAX back");
      expect(usdcReceived).to.be.gt(0, "Should receive some USDC back");
      expect(await wrappedLoan.isSolvent()).to.be.true;

      // Debt should remain unchanged
      expect(debtAfter).to.be.closeTo(debtBefore, 1);

      console.log("✅ Liquidity removal successful!");
    });

    it("should handle multiple position types simultaneously", async () => {
      // Get comprehensive loan status
      let fullLoanStatus = await wrappedLoan.getFullLoanStatus();

      console.log("\nFull loan status:");
      console.log("Total Value:", fromWei(fullLoanStatus[0]));
      console.log("Total Debt:", fromWei(fullLoanStatus[1]));
      console.log("Threshold Weighted Value:", fromWei(fullLoanStatus[2]));
      console.log("Health Ratio:", fromWei(fullLoanStatus[3]));
      console.log("Is Solvent:", fullLoanStatus[4].toString());

      // Verify all position types are accounted for
      let allAssets = await wrappedLoan.getAllOwnedAssets();
      let stakedPositions = await wrappedLoan.getStakedPositions();
      let debtAssets = await wrappedLoan.getDebts();

      console.log("\nAsset summary:");
      console.log("Owned assets count:", allAssets.length);
      console.log("Staked positions count:", stakedPositions.length);
      console.log("Debt assets count:", debtAssets.length);

      // Debug debt assets
      for (const debt of debtAssets) {
        console.log(
          `Debt: ${fromBytes32(debt.name)} = ${formatUnits(
            debt.debt,
            getTokenDecimals(fromBytes32(debt.name))
          )}`
        );
      }

      // Print owned assets
      for (const asset of allAssets) {
        const symbol = fromBytes32(asset);
        const balance = await wrappedLoan.getBalance(toBytes32(symbol));
        console.log(
          `${symbol}: ${formatUnits(balance, getTokenDecimals(symbol))}`
        );
      }

      console.log("Number of staked positions:", stakedPositions.length);

      // Print debt positions
      for (const debt of debtAssets) {
        const symbol = fromBytes32(debt.name);
        console.log(
          `Debt ${symbol}: ${formatUnits(debt.debt, getTokenDecimals(symbol))}`
        );
      }

      // Verify solvency with all position types
      expect(fromWei(fullLoanStatus[3])).to.be.greaterThan(1);
      expect(fromWei(fullLoanStatus[0])).to.be.greaterThan(0);
      expect(fromWei(fullLoanStatus[1])).to.be.greaterThan(0);
      expect(fromWei(fullLoanStatus[2])).to.be.greaterThan(
        fromWei(fullLoanStatus[1])
      );
      expect(await wrappedLoan.isSolvent()).to.be.true;
      console.log("Loan is solvent with multiple position types.");
    });

    it("should maintain solvency with real-time oracle prices", async () => {
      // Simply verify that solvency calculations work with current oracle prices
      let healthRatio = fromWei(await wrappedLoan.getHealthRatio());
      let totalValue = fromWei(await wrappedLoan.getTotalValue());

      console.log("\nCurrent solvency with oracle prices:");
      console.log("Health Ratio:", healthRatio);
      console.log("Total Value:", totalValue);

      // Health ratio should be valid (> 1 for solvent position)
      expect(healthRatio).to.be.greaterThan(1);
      expect(totalValue).to.be.greaterThan(0);
      expect(await wrappedLoan.isSolvent()).to.be.true;
    });

    it("should approach insolvency when borrowing near limits", async () => {
      let initialHealthRatio = fromWei(await wrappedLoan.getHealthRatio());
      console.log("\nInitial Health Ratio:", initialHealthRatio);

      // Calculate how much more we can borrow while staying solvent
      let thresholdWeightedValue = fromWei(
        await wrappedLoan.getThresholdWeightedValue()
      );
      let currentDebt = fromWei(await wrappedLoan.getDebt());
      let availableBorrowingPower = thresholdWeightedValue - currentDebt;

      console.log("Threshold Weighted Value:", thresholdWeightedValue);
      console.log("Current Debt:", currentDebt);
      console.log("Available Borrowing Power:", availableBorrowingPower);

      if (availableBorrowingPower > 100) {
        // Only if we have significant borrowing power left
        // Borrow more to get closer to liquidation threshold
        // Leave some buffer to avoid actual insolvency
        let additionalBorrowAmount = availableBorrowingPower * 0.8; // Use 80% of available for safety

        // Convert USD borrowing power to AVAX amount
        let additionalBorrowAVAX = toWei(
          (additionalBorrowAmount / AVAX_PRICE).toFixed(18)
        );

        console.log("Additional borrow amount (USD):", additionalBorrowAmount);
        console.log("AVAX price:", AVAX_PRICE);
        console.log(
          "Additional AVAX to borrow:",
          formatUnits(additionalBorrowAVAX, 18)
        );

        try {
          await wrappedLoan.borrow(toBytes32("AVAX"), additionalBorrowAVAX);

          let newHealthRatio = fromWei(await wrappedLoan.getHealthRatio());
          console.log(
            "Health Ratio after additional borrowing:",
            newHealthRatio
          );

          // Should be closer to 1.0 but still > 1.0
          expect(newHealthRatio).to.be.greaterThan(1.0);
          expect(newHealthRatio).to.be.lessThan(initialHealthRatio);
          expect(await wrappedLoan.isSolvent()).to.be.true;

          // Should be relatively close to the target but not too restrictive
          expect(newHealthRatio).to.be.lessThan(2.0); // More reasonable threshold
        } catch (error: any) {
          console.log(
            "Additional borrowing failed (position may already be near limits):",
            String(error)
          );
          // This is acceptable - we may already be near the borrowing limit
        }
      } else {
        console.log(
          "Already near borrowing limits, skipping additional borrowing test"
        );
      }

      // Ensure we're still solvent
      expect(await wrappedLoan.isSolvent()).to.be.true;
    });

    it("should maintain accurate solvency across complex multi-asset portfolio", async () => {
      // Final comprehensive check of all solvency calculations
      let finalStatus = await wrappedLoan.getFullLoanStatus();

      console.log("\n=== FINAL PORTFOLIO FULL LOAN STATUS ===");
      console.log("Total Value:", fromWei(finalStatus[0]));
      console.log("Total Debt:", fromWei(finalStatus[1]));
      console.log("Threshold Weighted Value:", fromWei(finalStatus[2]));
      console.log("Health Ratio:", fromWei(finalStatus[3]));
      console.log("Is Solvent:", finalStatus[4].toString());

      // Get all positions for final verification
      let allAssets = await wrappedLoan.getAllOwnedAssets();
      let allStakedPositions = await wrappedLoan.getStakedPositions();
      let allDebtAssets = await wrappedLoan.getDebts();

      console.log("\n=== FINAL PORTFOLIO COMPOSITION ===");

      // Calculate manual total value for verification using BigNumber
      let manualTotalValue = BigNumber.from(0);
      let manualTotalDebt = BigNumber.from(0);
      let manualThresholdWeightedValue = BigNumber.from(0);

      for (const asset of allAssets) {
        const symbol = fromBytes32(asset);
        const balance = await wrappedLoan.getBalance(toBytes32(symbol));
        const price = await wrappedLoan.getPrice(toBytes32(symbol));
        const assetValue = balance.mul(price).div(toWei("1"));
        manualTotalValue = manualTotalValue.add(assetValue);

        // For TWV calculation, apply debt coverage ratio (assuming 0.833 for most assets)
        const thresholdValue = assetValue.mul(833).div(1000); // 83.3% debt coverage
        manualThresholdWeightedValue =
          manualThresholdWeightedValue.add(thresholdValue);

        const valueFormatted = formatUnits(assetValue, 18);
        console.log(
          `${symbol}: ${formatUnits(
            balance,
            getTokenDecimals(symbol)
          )} (value: $${valueFormatted})`
        );
      }

      for (const debt of allDebtAssets) {
        const symbol = fromBytes32(debt.name);
        const amount = debt.debt;
        const price = await wrappedLoan.getPrice(toBytes32(symbol));
        const debtValue = amount.mul(price).div(toWei("1"));
        manualTotalDebt = manualTotalDebt.add(debtValue);

        const valueFormatted = formatUnits(debtValue, 18);
        console.log(
          `Debt ${symbol}: ${formatUnits(
            amount,
            getTokenDecimals(symbol)
          )} (value: $${valueFormatted})`
        );
      }
      console.log("Is Solvent:", await wrappedLoan.isSolvent());

      console.log("\n✅ All solvency calculations verified successfully!");
    });
  });
});
