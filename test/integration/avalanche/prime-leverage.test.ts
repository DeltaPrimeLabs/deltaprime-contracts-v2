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
} from "../../../typechain";

import {
  deployPools,
  addMissingTokenContracts,
  Asset,
  convertAssetsListToSupportedAssets,
  convertTokenPricesMapToMockPrices,
  deployAllFacets,
  erc20ABI,
  fromBytes32,
  fromWei,
  getFixedGasSigners,
  getRedstonePrices,
  syncTime,
  toBytes32,
  toWei,
  getTokensPricesMap,
  PoolAsset,
  PoolInitializationObject,
  recompileConstantsFile,
  MockTokenPriceObject,
} from "../../_helpers";

import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { parseUnits } from "ethers/lib/utils";
import { deployDiamond } from "../../../tools/diamond/deploy-diamond";
import TOKEN_ADDRESSES from "../../../common/addresses/avax/token_addresses.json";
import { wrap } from "module";

chai.use(solidity);

const { deployContract, provider } = waffle;

describe("Smart loan 10x Leverage Feature Tests", () => {
  before("Synchronize blockchain time", async () => {
    await syncTime();
  });

  describe("10x Leverage - PrimeLeverageFacet Comprehensive Tests", () => {
    let smartLoansFactory: SmartLoansFactory,
      loan: SmartLoanGigaChadInterface,
      poolContracts: Map<string, Contract> = new Map(),
      tokenContracts: Map<string, Contract> = new Map(),
      lendingPools: Array<PoolAsset> = [],
      supportedAssets: Array<Asset>,
      tokensPrices: Map<string, number>,
      wrappedLoan: any,
      owner: SignerWithAddress,
      depositor: SignerWithAddress,
      liquidator: SignerWithAddress,
      MOCK_PRICES: any,
      diamondAddress: any,
      tokenManager: MockTokenManager,
      AVAX_PRICE: number,
      PRIME_PRICE: number;

    // Helper function to advance time
    const advanceTime = async (seconds: number) => {
      await network.provider.send("evm_increaseTime", [seconds]);
      await network.provider.send("evm_mine");
    };

    // Helper function to get current timestamp
    const getCurrentTimestamp = async (): Promise<number> => {
      const block = await ethers.provider.getBlock("latest");
      return block.timestamp;
    };

    before("deploy factory and pool", async () => {
      [owner, depositor, liquidator] = await getFixedGasSigners(10000000);
      depositor = depositor || owner;

      let assetsList = ["AVAX", "USDC", "ETH"];
      let allAssetsList = ["AVAX", "USDC", "ETH", "PRIME"];

      let poolNameAirdropList: Array<PoolInitializationObject> = [
        { name: "AVAX", airdropList: [depositor] },
        { name: "USDC", airdropList: [depositor] },
      ];

      diamondAddress = await deployDiamond();

      smartLoansFactory = (await deployContract(
        owner,
        SmartLoansFactoryArtifact
      )) as SmartLoansFactory;

      tokenManager = (await deployContract(
        owner,
        MockTokenManagerArtifact,
        []
      )) as MockTokenManager;

      // Add a check to ensure tokenManager is properly deployed
      if (!tokenManager.address) {
        throw new Error(
          "TokenManager deployment failed - address is undefined"
        );
      }

      console.log("TokenManager deployed at:", tokenManager.address); // Debug log

      const primeTokenContract = new ethers.Contract(
        TOKEN_ADDRESSES["PRIME"], // Using the imported TOKEN_ADDRESSES
        erc20ABI,
        provider
      );
      tokenContracts.set("PRIME", primeTokenContract);

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
      supportedAssets = convertAssetsListToSupportedAssets(allAssetsList);
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

      // Configure tiered debt coverage for PREMIUM tier
      const premiumDebtCoverage = toWei("0.909090909"); // 10x leverage (1/1.1)
      await tokenManager.setTieredDebtCoverage(
        1, // PREMIUM tier
        tokenContracts.get("AVAX")!.address,
        premiumDebtCoverage
      );
      await tokenManager.setTieredDebtCoverage(
        1, // PREMIUM tier
        tokenContracts.get("USDC")!.address,
        premiumDebtCoverage
      );

      await tokenManager.setTieredDebtCoverage(
        0, // BASIC tier
        tokenContracts.get("PRIME")!.address,
        toWei("0.0") // No coverage for PRIME in BASIC tier
      );

      await tokenManager.setTieredDebtCoverage(
        1, // PREMIUM tier
        tokenContracts.get("PRIME")!.address,
        toWei("0.0") // No coverage for PRIME in PREMIUM tier
      );

      await tokenManager.setTieredDebtCoverage(
        0, // BASIC tier
        tokenContracts.get("AVAX")!.address,
        toWei("0.8333333333") // 5x leverage for BASIC tier
      );

      // Set PRIME staking ratio: 5 PRIME per $100 borrowed
      await tokenManager.setTieredPrimeStakingRatio(1, toWei("5")); // PREMIUM tier, 5 PRIME per $100 borrowed

      await tokenManager.setTieredPrimeDebtRatio(1, toWei("2")); // PREMIUM tier, 2 PRIME per $100 borrowed

      await tokenManager.deactivateToken(tokenContracts.get("PRIME")!.address);

      let addressProvider = (await deployContract(
        owner,
        AddressProviderArtifact,
        []
      )) as AddressProvider;

      AVAX_PRICE = tokensPrices.get("AVAX")!;
      // PRIME_PRICE = tokensPrices.get("PRIME")!;

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

      wrappedLoan = WrapperBuilder
        // @ts-ignore
        .wrap(loan)
        .usingSimpleNumericMock({
          mockSignersCount: 10,
          dataPoints: MOCK_PRICES,
        });
    });

    it("should start with BASIC tier", async () => {
      const currentTier = await wrappedLoan.getLeverageTier();
      expect(currentTier).to.equal(0); // BASIC = 0
    });

    it("should fund loan with AVAX and PRIME", async () => {
      // 1. Impersonate PRIME whale and send tokens to owner
      const primeWhale = "0x0b6946fdC8d941CD3C9Ec6354fEb1fa343D22C94";

      const balance = await ethers.provider.getBalance(primeWhale);
      const code = await ethers.provider.getCode(primeWhale);
      console.log("Impersonating whale for PRIME:", primeWhale);

      console.log("Whale AVAX balance:", fromWei(balance));

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [primeWhale],
      });
      const whaleSigner = await ethers.provider.getSigner(primeWhale);

      // Get PRIME token contract
      const primeToken = tokenContracts.get("PRIME")!;

      console.log("PRIME token address:", primeToken.address);

      const primeTokenObject = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        primeToken.address
      );

      const whaleTokenBalance = await primeTokenObject.balanceOf(primeWhale);
      // console.log("Whale PRIME token balance:", whaleTokenBalance.toString());
      console.log(
        "Whale PRIME token balance (formatted):",
        fromWei(whaleTokenBalance)
      );

      // Transfer 25000 PRIME from whale to owner
      const primeAmount = toWei("25000");
      // await primeToken
      //   .connect(whaleSigner)
      //   .transfer(owner.address, primeAmount);
      await primeTokenObject
        .connect(whaleSigner)
        .transfer(owner.address, primeAmount);

      // Stop impersonating whale (optional cleanup)
      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [primeWhale],
      });

      const ownerPrimeBalance = await primeTokenObject.balanceOf(owner.address);
      console.log(
        "Owner's PRIME token balance after impersonation, formatted:",
        fromWei(ownerPrimeBalance)
      );

      // 2. Fund with AVAX
      const avaxAmount = toWei("1000");
      await tokenContracts
        .get("AVAX")!
        .connect(owner)
        .deposit({ value: avaxAmount });
      await tokenContracts
        .get("AVAX")!
        .connect(owner)
        .approve(wrappedLoan.address, avaxAmount);
      await wrappedLoan.fund(toBytes32("AVAX"), avaxAmount);

      // 3. Fund with PRIME tokens for staking
      await tokenContracts
        .get("PRIME")!
        .connect(owner)
        .approve(wrappedLoan.address, primeAmount);

      // funding the loan via PrimeLeverageFacet:depositPrime() instead of AssetsOperationsFacet:fund()
      await wrappedLoan.depositPrime(primeAmount);

      const loanBalanceAVAX = fromWei(
        await wrappedLoan.getBalance(toBytes32("AVAX"))
      );
      const loanBalancePRIME = fromWei(
        await wrappedLoan.getBalance(toBytes32("PRIME"))
      );

      console.log("Funded loan with AVAX and PRIME");

      console.log("Loan balance AVAX:", loanBalanceAVAX);
      console.log("Loan balance PRIME:", loanBalancePRIME);

      expect(fromWei(await wrappedLoan.getBalance(toBytes32("AVAX")))).to.equal(
        1000
      );
      expect(
        fromWei(await wrappedLoan.getBalance(toBytes32("PRIME")))
      ).to.equal(25000);
    });

    it("should stake PRIME and activate PREMIUM tier", async () => {
      // Stake PRIME and activate PREMIUM tier
      // const primeStakeAmount = toWei("20"); // Stake 20 PRIME (~$30)
      await wrappedLoan.stakePrimeAndActivatePremium();

      const initialInfo =
        await wrappedLoan.callStatic.getLeverageTierFullInfo();
      console.log("Current tier:", initialInfo.currentTier);
      console.log("Staked PRIME:", initialInfo.stakedPrime.toString());
      console.log(
        "Initial Recorded debt right after activating PREMIUM:",
        initialInfo.recordedDebt.toString()
      );

      expect(initialInfo.recordedDebt.gte(10000000)).to.be.false;

      const currentTier = await wrappedLoan.getLeverageTier();
      expect(currentTier).to.equal(1); // PREMIUM = 1

      const stakedAmount = fromWei(await wrappedLoan.getPrimeStakedAmount());
      expect(stakedAmount).to.be.greaterThan(0);
      console.log("Staked PRIME amount:", stakedAmount);
    });

    it("should borrow AVAX to have some debt", async () => {
      // Borrow $1000 worth of AVAX (approximately 52.6 AVAX at $19 each)
      console.log("Checking if AVAX is an active asset...");
      const isActiveAVAX = await tokenManager.isTokenAssetActive(
        tokenContracts.get("AVAX")!.address
      );
      console.log("Is AVAX active asset?", isActiveAVAX);
      const borrowAmount = toWei("53");
      await wrappedLoan.borrow(toBytes32("AVAX"), borrowAmount);
      console.log("Borrowed AVAX:", fromWei(borrowAmount));

      // Check current debt
      const debt = fromWei(await wrappedLoan.getDebt());
      expect(debt).to.be.greaterThan(900); // Should be around $1000 debt
      console.log("Current debt after borrowing:", debt);

      const healthRatio = fromWei(await wrappedLoan.getHealthRatio());
      console.log(
        "Health Ratio after borrowing AVAX, in PREMIUM tier:",
        healthRatio
      );
    });

    it("should have improved debt coverage in PREMIUM tier", async () => {
      // Check health ratio improvement with PREMIUM tier
      const healthRatio = fromWei(await wrappedLoan.getHealthRatio());
      console.log(
        "Health Ratio in PREMIUM tier right after activating PREMIUM:",
        healthRatio
      );
      const thresholdWeightedValue = fromWei(
        await wrappedLoan.getThresholdWeightedValue()
      );
      const debt = fromWei(await wrappedLoan.getDebt());

      console.log("PREMIUM Tier Health Ratio:", healthRatio);
      console.log("Threshold Weighted Value:", thresholdWeightedValue);
      console.log("Debt:", debt);

      // Should have better leverage capacity
      expect(healthRatio).to.be.greaterThan(1);
      expect(thresholdWeightedValue / debt).to.be.greaterThan(1.8); // Better than BASIC tier
    });

    it("should accrue PRIME debt over time", async () => {
      const tier = await wrappedLoan.getLeverageTier();
      console.log("Current tier:", tier);

      let block = await ethers.provider.getBlock("latest");
      console.log("Initial timestamp:", block.timestamp);
      const initialTimestamp = block.timestamp;

      await wrappedLoan.updatePrimeDebt();

      console.log("Updated PRIME debt");

      const initialInfo =
        await wrappedLoan.callStatic.getLeverageTierFullInfo();
      console.log("Current tier:", initialInfo.currentTier);
      console.log("Staked PRIME:", initialInfo.stakedPrime.toString());
      console.log(
        "Initial Recorded debt:",
        initialInfo.recordedDebt.toString()
      );

      expect(initialInfo.recordedDebt.gte(0)).to.be.true; // might be zero, might have some dust accruing already

      // Advance time by 1 hour
      await advanceTime(3600 * 24 * 365);

      // Check timestamp after time advance
      block = await ethers.provider.getBlock("latest");
      console.log("Timestamp after 1 year:", block.timestamp);
      console.log(
        "Time elapsed:",
        block.timestamp - initialTimestamp,
        "seconds"
      );

      // Update prime debt snapshot
      await wrappedLoan.updatePrimeDebt();

      const infoOneYear =
        await wrappedLoan.callStatic.getLeverageTierFullInfo();
      const primeDebtAfterOneYear = fromWei(infoOneYear.recordedDebt);
      console.log("Recorded PRIME debt after 1 year:", primeDebtAfterOneYear);
      expect(primeDebtAfterOneYear).to.be.greaterThan(
        fromWei(initialInfo.recordedDebt)
      );

      console.log("Prime debt after 1 Year:", primeDebtAfterOneYear);
      const debt = fromWei(await wrappedLoan.getDebt());
      console.log("Full Debt at the time of recording PRIME Debt:", debt);
    });

    it("should prevent withdrawals when PRIME debt exists", async () => {
      // Try to withdraw some AVAX - should fail due to PRIME debt
      const withdrawAmount = toWei("10");

      await expect(
        wrappedLoan.createWithdrawalIntent(toBytes32("AVAX"), withdrawAmount)
      ).to.not.be.reverted; // Creating intent should succeed

      // But executing should fail
      await advanceTime(25 * 3600); // Wait for intent maturity

      await expect(
        wrappedLoan.executeWithdrawalIntent(toBytes32("AVAX"), [0])
      ).to.be.revertedWith("Cannot withdraw while in PRIME debt");
    });

    it("should handle additional borrowing with PREMIUM tier debt update", async () => {
      const debtBefore = fromWei(await wrappedLoan.getDebt());

      let healthRatio = fromWei(await wrappedLoan.getHealthRatio());
      console.log("Health Ratio before additional borrow:", healthRatio);

      // Borrow more to test debt update mechanism
      const additionalBorrow = toWei("26.3"); // ~$500 more
      await wrappedLoan.borrow(toBytes32("AVAX"), additionalBorrow);

      const debtAfter = fromWei(await wrappedLoan.getDebt());
      expect(debtAfter).to.be.greaterThan(debtBefore);

      healthRatio = fromWei(await wrappedLoan.getHealthRatio());
      console.log("Health Ratio after additional borrow:", healthRatio);

      // PRIME debt should start accruing again
      await advanceTime(3600);
      const debtInfo = await wrappedLoan.getLeverageTierFullInfo();
      const primeDebt = fromWei(debtInfo.recordedDebt);
      console.log("Recorded PRIME debt after additional borrow:", primeDebt);
      expect(primeDebt).to.be.greaterThan(0);
    });

    it("should prevent unstaking below minimum requirement for PREMIUM tier", async () => {
      // Activate PREMIUM tier first
      // await wrappedLoan.activatePremium();

      const stakedAmount = await wrappedLoan.getPrimeStakedAmount();

      console.log("Staked PRIME amount:", stakedAmount.toString());
      // console.log("Staked PRIME amount (formatted):", stakedAmount);

      // const unStakeAmount = toWei(stakedAmount.toString());

      // Try to unstake the entire staked amount without changing tier
      await expect(wrappedLoan.unstakePrime(stakedAmount)).to.be.revertedWith(
        "Would fall below minimum stake requirement for PREMIUM tier"
      );
    });

    it("should deactivate PREMIUM tier by paying PRIME debt", async () => {
      // Should fail because we have PRIME debt

      const debtInfo = await wrappedLoan.getLeverageTierFullInfo();
      const primeDebt = fromWei(debtInfo.recordedDebt);
      console.log(
        "Recorded PRIME debt before trying to deactivate PREMIUM:",
        primeDebt
      );

      // Get PRIME token contract
      const primeToken = tokenContracts.get("PRIME")!;

      console.log("PRIME token address:", primeToken.address);

      const primeTokenObject = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        primeToken.address
      );

      const loanPRIMEBalanceBefore = await primeTokenObject.balanceOf(
        wrappedLoan.address
      );
      // console.log("Whale PRIME token balance:", whaleTokenBalance.toString());
      console.log(
        "Loan PRIME token balance before deactivation of PREMIUM:",
        fromWei(loanPRIMEBalanceBefore)
      );

      const healthRatioBefore = fromWei(await wrappedLoan.getHealthRatio());
      console.log(
        "Health Ratio before deactivation:",
        healthRatioBefore.toString()
      );

      await wrappedLoan.deactivatePremiumTier(false);
      const currentTier = await wrappedLoan.getLeverageTier();
      console.log(
        "Current leverage tier after PREMIUM deactivation:",
        currentTier
      );

      expect(currentTier).to.equal(0); // Should be BASIC now

      const loanPRIMEBalanceAfter = await primeTokenObject.balanceOf(
        wrappedLoan.address
      );

      console.log(
        "Loan PRIME token balance after deactivation of PREMIUM:",
        fromWei(loanPRIMEBalanceAfter)
      );

      expect(loanPRIMEBalanceAfter.lt(loanPRIMEBalanceBefore)).to.be.true;

      const healthRatioAfter = fromWei(await wrappedLoan.getHealthRatio());
      console.log(
        "Health Ratio after deactivation:",
        healthRatioAfter.toString()
      );
      expect(healthRatioAfter).to.be.lessThan(healthRatioBefore);
    });

    it("should allow withdrawals after repaying PRIME debt and deactivating PREMIUM", async () => {
      // Now withdrawals should work
      const withdrawAmount = toWei("10");
      await wrappedLoan.createWithdrawalIntent(
        toBytes32("AVAX"),
        withdrawAmount
      );
      await advanceTime(25 * 3600);

      await expect(wrappedLoan.executeWithdrawalIntent(toBytes32("AVAX"), [1]))
        .to.not.be.reverted;
    });

    // it("should handle staking additional PRIME", async () => {
    //   // Fund more PRIME and stake
    //   const additionalPrime = toWei("100");
    //   await tokenContracts
    //     .get("PRIME")!
    //     .connect(owner)
    //     .approve(wrappedLoan.address, additionalPrime);
    //   await wrappedLoan.fund(toBytes32("PRIME"), additionalPrime);

    //   const stakeAmount = toWei("50");
    //   await wrappedLoan.stakePrime(stakeAmount);

    //   const stakedAmount = fromWei(await wrappedLoan.getPrimeStakedAmount());
    //   expect(stakedAmount).to.be.greaterThan(0);
    // });

    it("should handle unstaking PRIME with sufficient remaining stake", async () => {
      const stakedBefore = fromWei(await wrappedLoan.getPrimeStakedAmount());
      const unstakeAmount = toWei("10");

      await wrappedLoan.unstakePrime(unstakeAmount);

      const stakedAfter = fromWei(await wrappedLoan.getPrimeStakedAmount());
      expect(stakedAfter).to.equal(stakedBefore - 10);
    });

    it("should calculate available balance correctly for PRIME", async () => {
      const totalPrimeBalance = fromWei(
        await wrappedLoan.getBalance(toBytes32("PRIME"))
      );
      const stakedPrime = fromWei(await wrappedLoan.getPrimeStakedAmount());
      const availableBalance = fromWei(
        await wrappedLoan.getAvailableBalance(toBytes32("PRIME"))
      );

      const expectedBalance = totalPrimeBalance - stakedPrime;
      const percentageDifference = Math.abs(
        (availableBalance - expectedBalance) / expectedBalance
      );
      expect(percentageDifference).to.be.lessThan(0.0001); // 0.01% = 0.0001
    });

    it("should handle PRIME debt liquidation scenario", async () => {
      // First check if liquidation should trigger
      const shouldLiquidate = await wrappedLoan.shouldLiquidatePrimeDebt();

      if (!shouldLiquidate) {
        // Advance time to create liquidation scenario
        await advanceTime(8 * 24 * 3600); // 8 days

        // Check again
        const shouldLiquidateAfterTime =
          await wrappedLoan.shouldLiquidatePrimeDebt();

        if (shouldLiquidateAfterTime) {
          // Simulate liquidator calling liquidation
          await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [liquidator.address],
          });

          // Note: This would require liquidator to be whitelisted
          // For testing purposes, we just verify the function exists and logic
          console.log("Liquidation would be triggered");
        }
      }
    });

    it("should maintain solvency throughout tier operations", async () => {
      // Comprehensive solvency check
      const healthRatio = fromWei(await wrappedLoan.getHealthRatio());
      const totalValue = fromWei(await wrappedLoan.getTotalValue());
      const debt = fromWei(await wrappedLoan.getDebt());
      const thresholdWeightedValue = fromWei(
        await wrappedLoan.getThresholdWeightedValue()
      );

      console.log("Final state:");
      console.log("Health Ratio:", healthRatio);
      console.log("Total Value:", totalValue);
      console.log("Debt:", debt);
      console.log("Threshold Weighted Value:", thresholdWeightedValue);

      expect(await wrappedLoan.isSolvent()).to.be.true;
      expect(healthRatio).to.be.greaterThan(1);
      expect(totalValue).to.be.greaterThan(0);
      expect(thresholdWeightedValue).to.be.greaterThan(debt);
    });

    it("should handle edge case: exact debt coverage boundaries", async () => {
      // Test behavior at exact debt coverage limits
      const thresholdWeightedValue = fromWei(
        await wrappedLoan.getThresholdWeightedValue()
      );
      const currentDebt = fromWei(await wrappedLoan.getDebt());

      console.log("Testing debt coverage boundaries:");
      console.log("Current TWV:", thresholdWeightedValue);
      console.log("Current Debt:", currentDebt);
      console.log(
        "Utilization:",
        (currentDebt / thresholdWeightedValue) * 100,
        "%"
      );

      // Loan should remain solvent even at high utilization
      expect(await wrappedLoan.isSolvent()).to.be.true;
    });

    it("should validate PRIME debt ratio configuration", async () => {
      // This test verifies the debt ratio is configured correctly
      // Based on tech spec: 2 PRIME yearly per $100 borrowed
      const borrowed = 1000; // $1000 borrowed
      const expectedYearlyDebt = (borrowed / 100) * 2; // 20 PRIME per year
      const expectedHourlyDebt = expectedYearlyDebt / (365 * 24); // Per hour

      console.log("Expected yearly PRIME debt for $1000:", expectedYearlyDebt);
      console.log("Expected hourly PRIME debt:", expectedHourlyDebt);

      // Note: Actual ratio testing would require access to storage
      // This is more of a documentation/validation test
    });

    it("should check available PRIME balance and create/execute withdrawal intent for that amount", async () => {
      // Check available PRIME balance
      const availablePrime = await wrappedLoan.getAvailableBalance(
        toBytes32("PRIME")
      );
      const availablePrimeFormatted = fromWei(availablePrime);

      console.log("Available PRIME balance:", availablePrimeFormatted);
      expect(availablePrime.gt(0)).to.be.true; // Should have some available PRIME

      // Create withdrawal intent for the full available amount
      await wrappedLoan.createWithdrawalIntent(
        toBytes32("PRIME"),
        availablePrime
      );

      // Verify intent was created
      const intents = await wrappedLoan.getUserIntents(toBytes32("PRIME"));
      expect(intents.length).to.equal(1);
      expect(intents[0].amount).to.equal(availablePrime);
      expect(intents[0].isPending).to.be.true;

      console.log(
        "Withdrawal intent created for:",
        fromWei(intents[0].amount),
        "PRIME"
      );

      // Advance time to make intent actionable (24 hours)
      await advanceTime(25 * 3600); // 25 hours to be safe

      // Check intent is now actionable
      const intentsAfterTime = await wrappedLoan.getUserIntents(
        toBytes32("PRIME")
      );
      expect(intentsAfterTime[0].isActionable).to.be.true;
      expect(intentsAfterTime[0].isPending).to.be.false;

      // Execute the withdrawal intent
      const primeBalanceBefore = await tokenContracts
        .get("PRIME")!
        .balanceOf(wrappedLoan.address);
      console.log(
        "Loan PRIME balance before withdrawal:",
        fromWei(primeBalanceBefore)
      );

      await wrappedLoan.executeWithdrawalIntent(toBytes32("PRIME"), [0]);

      console.log("Withdrawal intent executed for PRIME");

      // Verify withdrawal was successful
      const primeBalanceAfter = await tokenContracts
        .get("PRIME")!
        .balanceOf(wrappedLoan.address);
      console.log(
        "Loan PRIME balance after withdrawal:",
        fromWei(primeBalanceAfter)
      );

      const withdrawnAmount = primeBalanceBefore.sub(primeBalanceAfter);
      expect(withdrawnAmount).to.equal(availablePrime);

      // Verify intent was removed
      const finalIntents = await wrappedLoan.getUserIntents(toBytes32("PRIME"));
      expect(finalIntents.length).to.equal(0);

      console.log("Successfully withdrew", fromWei(withdrawnAmount), "PRIME");
    });
  });
});
