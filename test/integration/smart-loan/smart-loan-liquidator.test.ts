import {ethers, waffle} from 'hardhat'
import chai, {expect} from 'chai'
import {solidity} from "ethereum-waffle";
import SmartLoansFactoryArtifact from '../../../artifacts/contracts/SmartLoansFactory.sol/SmartLoansFactory.json';
import MockTokenManagerArtifact from '../../../artifacts/contracts/mock/MockTokenManager.sol/MockTokenManager.json';
import AddressProviderArtifact from '../../../artifacts/contracts/AddressProvider.sol/AddressProvider.json';
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {WrapperBuilder} from "@redstone-finance/evm-connector";
import {
    addMissingTokenContracts,
    Asset,
    convertAssetsListToSupportedAssets,
    convertTokenPricesMapToMockPrices,
    deployAllFacets,
    deployAndInitExchangeContract,
    deployPools, fromWei,
    getFixedGasSigners,
    getRedstonePrices,
    getTokensPricesMap,
    PoolAsset,
    PoolInitializationObject,
    recompileConstantsFile,
    toBytes32,
    toWei, ZERO
} from "../../_helpers";
import {syncTime} from "../../_syncTime"
import {
    AddressProvider,
    MockTokenManager,
    PangolinIntermediary,
    SmartLoansFactory,
} from "../../../typechain";
import {BigNumber, Contract} from "ethers";
import {parseUnits} from "ethers/lib/utils";
import fs from "fs";
import path from "path";
import CACHE_LAYER_URLS from '../../../common/redstone-cache-layer-urls.json';

const {deployDiamond, replaceFacet} = require('../../../tools/diamond/deploy-diamond');

chai.use(solidity);

const {deployContract} = waffle;
const pangolinRouterAddress = '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106';

const LIQUIDATOR_PRIVATE_KEY = fs.readFileSync(path.resolve(__dirname, "../../../tools/liquidation/.private")).toString().trim();
const rpcProvider = new ethers.providers.JsonRpcProvider()
const liquidatorWallet = (new ethers.Wallet(LIQUIDATOR_PRIVATE_KEY)).connect(rpcProvider);

describe('Test liquidator with new snapshot model', () => {
    before("Synchronize blockchain time", async () => {
        await syncTime();
    });


    describe('A loan with debt and repayment', () => {
        let exchange: PangolinIntermediary,
            smartLoansFactory: SmartLoansFactory,
            loan: Contract,
            wrappedLoan: any,
            wrappedLoan2: any,
            wrappedLoan3: any,
            wrappedLoan4: any,
            tokenManager: any,
            MOCK_PRICES: any,
            poolContracts: Map<string, Contract> = new Map(),
            tokenContracts: Map<string, Contract> = new Map(),
            lendingPools: Array<PoolAsset> = [],
            supportedAssets: Array<Asset>,
            tokensPrices: Map<string, number>,
            owner: SignerWithAddress,
            depositor: SignerWithAddress,
            borrower: SignerWithAddress,
            borrower2: SignerWithAddress,
            borrower3: SignerWithAddress,
            borrower4: SignerWithAddress,
            diamondAddress: any;


        before("deploy factory, exchange, wrapped native token pool and USD pool", async () => {
            [owner, depositor, borrower, borrower2, borrower3, borrower4] = await getFixedGasSigners(10000000);
            let assetsList = ['AVAX', 'USDC'];
            let poolNameAirdropList: Array<PoolInitializationObject> = [
                {name: 'AVAX', airdropList: [borrower, depositor, borrower2, borrower3, borrower4]},
                {name: 'USDC', airdropList: []}
            ];

            diamondAddress = await deployDiamond();

            const provider = waffle.provider;
            console.log(`Owner: ${owner.address}`)
            console.log(fromWei(await provider.getBalance(owner.address)));
            smartLoansFactory = await deployContract(owner, SmartLoansFactoryArtifact) as SmartLoansFactory;
            console.log('DONE')

            tokenManager = await deployContract(
                owner,
                MockTokenManagerArtifact,
                []
            ) as MockTokenManager;


            await deployPools(smartLoansFactory, poolNameAirdropList, tokenContracts, poolContracts, lendingPools, owner, depositor, 1000, 'AVAX', [], tokenManager.address);
            tokensPrices = await getTokensPricesMap(assetsList, "avalanche", getRedstonePrices, []);
            MOCK_PRICES = convertTokenPricesMapToMockPrices(tokensPrices);
            supportedAssets = convertAssetsListToSupportedAssets(assetsList);
            addMissingTokenContracts(tokenContracts, assetsList);

            //load liquidator wallet
            await tokenContracts.get('AVAX')!.connect(liquidatorWallet).deposit({value: toWei("5000")});

            await tokenManager.connect(owner).initialize(supportedAssets, lendingPools);
            await tokenManager.connect(owner).setFactoryAddress(smartLoansFactory.address);

            await tokenManager.setIdentifiersToExposureGroups([toBytes32("AVAX")], [toBytes32("AVAX_GROUP")]);
            await tokenManager.setMaxProtocolsExposure([toBytes32("AVAX_GROUP")], [toWei("5000")]);

            await smartLoansFactory.initialize(diamondAddress, tokenManager.address);

            exchange = await deployAndInitExchangeContract(owner, pangolinRouterAddress, tokenManager.address, supportedAssets, "PangolinIntermediary") as PangolinIntermediary;

            let addressProvider = await deployContract(
                owner,
                AddressProviderArtifact,
                []
            ) as AddressProvider;

            await recompileConstantsFile(
                'local',
                "DeploymentConstants",
                [
                    {
                        facetPath: './contracts/facets/avalanche/PangolinDEXFacet.sol',
                        contractAddress: exchange.address,
                    }
                ],
                tokenManager.address,
                addressProvider.address,
                diamondAddress,
                smartLoansFactory.address,
                'lib'
            );
            await deployAllFacets(diamondAddress, false);
            const diamondCut = await ethers.getContractAt('IDiamondCut', diamondAddress, owner);
            await diamondCut.pause();
            await replaceFacet('MockSolvencyFacetAlwaysSolvent', diamondAddress, ['isSolvent']);
            await diamondCut.unpause();
        });

        function wrapLoan(loanContract: Contract, wallet=undefined){
            if(wallet){
                loanContract = loanContract.connect(wallet);
            }
            return WrapperBuilder.wrap(loanContract).usingDataService(
                {
                    dataServiceId: "redstone-avalanche-prod",
                    uniqueSignersCount: 3,
                    dataFeeds: ["AVAX", "ETH", "USDC", "BTC", "LINK"],
                    // @ts-ignore
                    disablePayloadsDryRun: true
                },
                 CACHE_LAYER_URLS.urls
            );
        }


        it("should deploy a smart loan", async () => {
            await smartLoansFactory.connect(borrower).createLoan();
            await smartLoansFactory.connect(borrower2).createLoan();
            await smartLoansFactory.connect(borrower3).createLoan();
            await smartLoansFactory.connect(borrower4).createLoan();

            const loan_proxy_address = await smartLoansFactory.getLoanForOwner(borrower.address);
            const loan_proxy_address2 = await smartLoansFactory.getLoanForOwner(borrower2.address);
            const loan_proxy_address3 = await smartLoansFactory.getLoanForOwner(borrower3.address);
            const loan_proxy_address4 = await smartLoansFactory.getLoanForOwner(borrower4.address);

            loan = await ethers.getContractAt("SmartLoanGigaChadInterface", loan_proxy_address, borrower);
            // @ts-ignore
            wrappedLoan = wrapLoan(loan);

            loan = await ethers.getContractAt("SmartLoanGigaChadInterface", loan_proxy_address2, borrower2);
            // @ts-ignore
            wrappedLoan2 = wrapLoan(loan);

            loan = await ethers.getContractAt("SmartLoanGigaChadInterface", loan_proxy_address3, borrower3);
            // @ts-ignore
            wrappedLoan3 = wrapLoan(loan);

            loan = await ethers.getContractAt("SmartLoanGigaChadInterface", loan_proxy_address4, borrower4);
            // @ts-ignore
            wrappedLoan4 = wrapLoan(loan);
        });


        it("should fund, borrow and withdraw, making loan's health ratio lower than 1", async () => {
            await tokenContracts.get('AVAX')!.connect(borrower).deposit({value: toWei("100")});
            await tokenContracts.get('AVAX')!.connect(borrower).approve(wrappedLoan.address, toWei("100"));
            await wrappedLoan.fund(toBytes32("AVAX"), toWei("100"));
            await wrappedLoan.borrow(toBytes32("AVAX"), toWei("600"));

            await tokenContracts.get('AVAX')!.connect(borrower2).deposit({value: toWei("100")});
            await tokenContracts.get('AVAX')!.connect(borrower2).approve(wrappedLoan2.address, toWei("100"));
            await wrappedLoan2.fund(toBytes32("AVAX"), toWei("100"));
            await wrappedLoan2.borrow(toBytes32("AVAX"), toWei("600"));

            await tokenContracts.get('AVAX')!.connect(borrower3).deposit({value: toWei("100")});
            await tokenContracts.get('AVAX')!.connect(borrower3).approve(wrappedLoan3.address, toWei("100"));
            await wrappedLoan3.fund(toBytes32("AVAX"), toWei("100"));
            await wrappedLoan3.borrow(toBytes32("AVAX"), toWei("600"));

            await tokenContracts.get('AVAX')!.connect(borrower4).deposit({value: toWei("100")});
            await tokenContracts.get('AVAX')!.connect(borrower4).approve(wrappedLoan4.address, toWei("100"));
            await wrappedLoan4.fund(toBytes32("AVAX"), toWei("100"));
            await wrappedLoan4.borrow(toBytes32("AVAX"), toWei("501"));

            expect((fromWei(await wrappedLoan.getHealthRatio()))).to.be.lt(1);
            expect((fromWei(await wrappedLoan2.getHealthRatio()))).to.be.lt(1);
            expect((fromWei(await wrappedLoan3.getHealthRatio()))).to.be.lt(1);
            expect((fromWei(await wrappedLoan4.getHealthRatio()))).to.be.lt(1);
        });

        it("replace facet", async () => {
            const diamondCut = await ethers.getContractAt('IDiamondCut', diamondAddress, owner);
            await diamondCut.pause();
            await replaceFacet('SolvencyFacetProdAvalanche', diamondAddress, ['isSolvent']);
            await diamondCut.unpause();

            expect(await wrappedLoan.isSolvent()).to.be.false;
        });

        it("liquidate loans using new snapshot model", async () => {
            const TREASURY_ADDRESS = "0x764a9756994f4E6cd9358a6FcD924d566fC2e666";
            const STABILITY_POOL_ADDRESS = "0x6B9836D18978a2e865A935F12F4f958317DA4619";
            const FEES_REDISTRIBUTION_ADDRESS = "0x8995d790169023Ee4fF67621948EBDFe7383f59e";
            
            console.log(`STABILITY_POOL_ADDRESS: ${STABILITY_POOL_ADDRESS}`);
            console.log(`TREASURY_ADDRESS: ${TREASURY_ADDRESS}`);
            console.log(`FEES_REDISTRIBUTION_ADDRESS: ${FEES_REDISTRIBUTION_ADDRESS}`);
            
            // Whitelist liquidator using new method
            let whitelistingFacet = await ethers.getContractAt("ISmartLoanLiquidationFacet", diamondAddress, owner);
            await whitelistingFacet.whitelistLiquidators([liquidatorWallet.address]);

            let avaxExposureGroup = await tokenManager.identifierToExposureGroup(toBytes32("AVAX"));
            let currentAVAXExposure = fromWei((await tokenManager.groupToExposure(avaxExposureGroup))[0]);
            console.log(`currentAVAXExposure: ${currentAVAXExposure}`)
            
            expect(currentAVAXExposure).to.be.equal(2701);

            // Liquidation 1 - New snapshot model
            console.log('Starting Liquidation 1 with snapshot model');
            
            let wrappedLoanLiquidator = wrapLoan(wrappedLoan, liquidatorWallet);
            
            console.log(`HR: ${fromWei(await wrappedLoan.getHealthRatio())}`);
            console.log(`Debt: ${fromWei(await wrappedLoan.getDebt())}`);
            console.log(`TotalValue: ${fromWei(await wrappedLoan.getTotalValue())}`);

            let stabilityPoolAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(STABILITY_POOL_ADDRESS);
            let treasuryAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(TREASURY_ADDRESS);
            let feesRedistributionAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(FEES_REDISTRIBUTION_ADDRESS);

            console.log(`stabilityPoolAVAXBalanceBefore: ${fromWei(stabilityPoolAVAXBalanceBefore)}`)
            console.log(`treasuryAVAXBalanceBefore: ${fromWei(treasuryAVAXBalanceBefore)}`)
            console.log(`feesRedistributionAVAXBalanceBefore: ${fromWei(feesRedistributionAVAXBalanceBefore)}`)

            let debtBefore = await wrappedLoan.getDebt();
            console.log(`Debt before liquidation: ${fromWei(debtBefore)}`);
            
            // Declare variables for reuse across liquidations
            let expectedFeeUSD, expectedFeePerTreasuryUSD;
            let avaxPrice = tokensPrices.get('AVAX')!;
            let stabilityPoolAVAXChange, treasuryAVAXChange, feesRedistributionAVAXChange;
            let stabilityPoolUSDChange, treasuryUSDChange, feesRedistributionUSDChange;
            
            // Step 1: Take insolvency snapshot
            await wrappedLoanLiquidator.snapshotInsolvency();
            
            // Check snapshot was taken
            let lastInsolventTimestamp = await wrappedLoanLiquidator.getLastInsolventTimestamp();
            expect(lastInsolventTimestamp).to.be.gt(0);
            
            // Step 2: Execute liquidation (normal mode)
            await wrappedLoanLiquidator.liquidate(false);

            let stabilityPoolAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(STABILITY_POOL_ADDRESS);
            let treasuryAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(TREASURY_ADDRESS);
            let feesRedistributionAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(FEES_REDISTRIBUTION_ADDRESS);

            console.log(`stabilityPoolAVAXBalanceAfter: ${fromWei(stabilityPoolAVAXBalanceAfter)}`)
            console.log(`treasuryAVAXBalanceAfter: ${fromWei(treasuryAVAXBalanceAfter)}`)
            console.log(`feesRedistributionAVAXBalanceAfter: ${fromWei(feesRedistributionAVAXBalanceAfter)}`)
            
            currentAVAXExposure = fromWei((await tokenManager.groupToExposure(avaxExposureGroup))[0]);
            console.log(`currentAVAXExposure after liquidation: ${currentAVAXExposure}`)

            // Check loan is now solvent (or fully liquidated)
            let debtAfter = await wrappedLoan.getDebt();
            console.log(`Debt after liquidation: ${fromWei(debtAfter)}`);
            expect(debtAfter).to.be.equal(0); // Full liquidation should clear all debt

            // Calculate expected fees (14% of total debt in USD, paid in AVAX)
            expectedFeeUSD = fromWei(debtBefore) * 0.14;
            expectedFeePerTreasuryUSD = expectedFeeUSD / 3;
            
            // Convert AVAX balance changes to USD for comparison
            avaxPrice = tokensPrices.get('AVAX')!;
            stabilityPoolAVAXChange = fromWei(stabilityPoolAVAXBalanceAfter.sub(stabilityPoolAVAXBalanceBefore));
            treasuryAVAXChange = fromWei(treasuryAVAXBalanceAfter.sub(treasuryAVAXBalanceBefore));
            feesRedistributionAVAXChange = fromWei(feesRedistributionAVAXBalanceAfter.sub(feesRedistributionAVAXBalanceBefore));
            
            stabilityPoolUSDChange = stabilityPoolAVAXChange * avaxPrice;
            treasuryUSDChange = treasuryAVAXChange * avaxPrice;
            feesRedistributionUSDChange = feesRedistributionAVAXChange * avaxPrice;
            
            console.log(`Expected total fee: ${expectedFeeUSD} USD`);
            console.log(`Expected fee per treasury: ${expectedFeePerTreasuryUSD} USD`);
            console.log(`AVAX price: ${avaxPrice} USD`);
            console.log(`Stability pool fee: ${stabilityPoolAVAXChange} AVAX = ${stabilityPoolUSDChange} USD`);
            console.log(`Treasury fee: ${treasuryAVAXChange} AVAX = ${treasuryUSDChange} USD`);
            console.log(`Fees redistribution fee: ${feesRedistributionAVAXChange} AVAX = ${feesRedistributionUSDChange} USD`);

            expect(stabilityPoolUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02); // 2% tolerance
            expect(treasuryUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02);
            expect(feesRedistributionUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02);

            // Liquidation 2
            console.log('Starting Liquidation 2');
            wrappedLoanLiquidator = wrapLoan(wrappedLoan2, liquidatorWallet);
            
            stabilityPoolAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(STABILITY_POOL_ADDRESS);
            treasuryAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(TREASURY_ADDRESS);
            feesRedistributionAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(FEES_REDISTRIBUTION_ADDRESS);

            debtBefore = await wrappedLoan2.getDebt();
            console.log(`Loan 2 debt before liquidation: ${fromWei(debtBefore)}`);

            await wrappedLoanLiquidator.snapshotInsolvency();
            await wrappedLoanLiquidator.liquidate(false);

            stabilityPoolAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(STABILITY_POOL_ADDRESS);
            treasuryAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(TREASURY_ADDRESS);
            feesRedistributionAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(FEES_REDISTRIBUTION_ADDRESS);
            
            debtAfter = await wrappedLoan2.getDebt();
            expect(debtAfter).to.be.equal(0);
            
            expectedFeeUSD = fromWei(debtBefore) * 0.14;
            expectedFeePerTreasuryUSD = expectedFeeUSD / 3;
            
            stabilityPoolAVAXChange = fromWei(stabilityPoolAVAXBalanceAfter.sub(stabilityPoolAVAXBalanceBefore));
            treasuryAVAXChange = fromWei(treasuryAVAXBalanceAfter.sub(treasuryAVAXBalanceBefore));
            feesRedistributionAVAXChange = fromWei(feesRedistributionAVAXBalanceAfter.sub(feesRedistributionAVAXBalanceBefore));
            
            stabilityPoolUSDChange = stabilityPoolAVAXChange * avaxPrice;
            treasuryUSDChange = treasuryAVAXChange * avaxPrice;
            feesRedistributionUSDChange = feesRedistributionAVAXChange * avaxPrice;
            
            expect(stabilityPoolUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02);
            expect(treasuryUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02);
            expect(feesRedistributionUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02);

            // Liquidation 3
            console.log('Starting Liquidation 3');
            wrappedLoanLiquidator = wrapLoan(wrappedLoan3, liquidatorWallet);
            
            stabilityPoolAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(STABILITY_POOL_ADDRESS);
            treasuryAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(TREASURY_ADDRESS);
            feesRedistributionAVAXBalanceBefore = await tokenContracts.get('AVAX')!.balanceOf(FEES_REDISTRIBUTION_ADDRESS);

            debtBefore = await wrappedLoan3.getDebt();
            console.log(`Loan 3 debt before liquidation: ${fromWei(debtBefore)}`);

            await wrappedLoanLiquidator.snapshotInsolvency();
            await wrappedLoanLiquidator.liquidate(false);

            stabilityPoolAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(STABILITY_POOL_ADDRESS);
            treasuryAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(TREASURY_ADDRESS);
            feesRedistributionAVAXBalanceAfter = await tokenContracts.get('AVAX')!.balanceOf(FEES_REDISTRIBUTION_ADDRESS);
            
            debtAfter = await wrappedLoan3.getDebt();
            expect(debtAfter).to.be.equal(0);
            
            expectedFeeUSD = fromWei(debtBefore) * 0.14;
            expectedFeePerTreasuryUSD = expectedFeeUSD / 3;
            
            stabilityPoolAVAXChange = fromWei(stabilityPoolAVAXBalanceAfter.sub(stabilityPoolAVAXBalanceBefore));
            treasuryAVAXChange = fromWei(treasuryAVAXBalanceAfter.sub(treasuryAVAXBalanceBefore));
            feesRedistributionAVAXChange = fromWei(feesRedistributionAVAXBalanceAfter.sub(feesRedistributionAVAXBalanceBefore));
            
            stabilityPoolUSDChange = stabilityPoolAVAXChange * avaxPrice;
            treasuryUSDChange = treasuryAVAXChange * avaxPrice;
            feesRedistributionUSDChange = feesRedistributionAVAXChange * avaxPrice;
            
            expect(stabilityPoolUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02);
            expect(treasuryUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02);
            expect(feesRedistributionUSDChange).to.be.closeTo(expectedFeePerTreasuryUSD, expectedFeePerTreasuryUSD * 0.02);

            console.log('All liquidations completed successfully');
        });

        it("test emergency liquidation mode", async () => {
            const diamondCut = await ethers.getContractAt('IDiamondCut', diamondAddress, owner);
            await diamondCut.pause();
            await replaceFacet('MockSolvencyFacetAlwaysSolvent', diamondAddress, ['isSolvent']);
            await replaceFacet('AssetsOperationsMock', diamondAddress, ['withdraw']);
            await diamondCut.unpause();
            
            // Create a new loan that will be severely undercapitalized
            await smartLoansFactory.connect(owner).createLoan();
            const emergencyLoanAddress = await smartLoansFactory.getLoanForOwner(owner.address);
            const emergencyLoan = await ethers.getContractAt("SmartLoanGigaChadInterface", emergencyLoanAddress, owner);
            const wrappedEmergencyLoan = wrapLoan(emergencyLoan);
            const wrappedEmergencyLoanLiquidator = wrapLoan(emergencyLoan, liquidatorWallet);

            // Set up an undercapitalized position (more debt than assets)
            await tokenContracts.get('AVAX')!.connect(owner).deposit({value: toWei("10")});
            await tokenContracts.get('AVAX')!.connect(owner).approve(wrappedEmergencyLoan.address, toWei("10"));
            await wrappedEmergencyLoan.fund(toBytes32("AVAX"), toWei("10"));
            
            console.log('=== AFTER FUNDING ===');
            console.log(`AVAX balance: ${fromWei(await tokenContracts.get('AVAX')!.balanceOf(wrappedEmergencyLoan.address))}`);
            console.log(`HR: ${fromWei(await wrappedEmergencyLoan.getHealthRatio())}`);
            console.log(`Debt: ${fromWei(await wrappedEmergencyLoan.getDebt())}`);
            console.log(`Total Value: ${fromWei(await wrappedEmergencyLoan.getTotalValue())}`);
            
            await wrappedEmergencyLoan.borrow(toBytes32("AVAX"), toWei("100")); // High debt ratio
            
            console.log('=== AFTER BORROWING 100 AVAX ===');
            console.log(`AVAX balance: ${fromWei(await tokenContracts.get('AVAX')!.balanceOf(wrappedEmergencyLoan.address))}`);
            console.log(`HR: ${fromWei(await wrappedEmergencyLoan.getHealthRatio())}`);
            console.log(`Debt: ${fromWei(await wrappedEmergencyLoan.getDebt())}`);
            console.log(`Total Value: ${fromWei(await wrappedEmergencyLoan.getTotalValue())}`);
            
            // Withdraw most assets, leaving insufficient to cover debt
            console.log('=== BEFORE WITHDRAW ===');
            console.log(`AVAX balance before withdraw: ${fromWei(await tokenContracts.get('AVAX')!.balanceOf(wrappedEmergencyLoan.address))}`);
            
            await wrappedEmergencyLoan.withdraw(toBytes32("AVAX"), toWei("105"));
            
            console.log('=== AFTER WITHDRAWING 105 AVAX ===');
            console.log(`AVAX balance after withdraw: ${fromWei(await tokenContracts.get('AVAX')!.balanceOf(wrappedEmergencyLoan.address))}`);
            console.log(`Emergency loan HR: ${fromWei(await wrappedEmergencyLoan.getHealthRatio())}`);
            console.log(`Emergency loan debt: ${fromWei(await wrappedEmergencyLoan.getDebt())}`);
            console.log(`Emergency loan total value: ${fromWei(await wrappedEmergencyLoan.getTotalValue())}`);

            expect(await wrappedEmergencyLoan.getDebt()).to.be.gt(await wrappedEmergencyLoan.getTotalValue());

            await diamondCut.pause();
            await replaceFacet('SolvencyFacetProdAvalanche', diamondAddress, ['isSolvent']);
            await diamondCut.unpause();

            // Take snapshot and attempt emergency liquidation
            await wrappedEmergencyLoanLiquidator.snapshotInsolvency();
            await wrappedEmergencyLoanLiquidator.liquidate(true); // Emergency mode

            // In emergency mode, total value should be 0 and no fees are taken
            expect(await wrappedEmergencyLoan.getTotalValue()).to.be.equal(0);
            console.log('Emergency liquidation completed successfully');
        });
    });
});