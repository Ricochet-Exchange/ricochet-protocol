// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BankStorage
 * This contract provides the data structures, variables, and getters for Bank
 */
contract BankStorage {
    /*Variables*/
    address _owner;     // JR
    string name;
    // role identifier for keeper that can make liquidations
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    // role identifier for price updater
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    struct Reserve {
        uint256 collateralBalance;
        uint256 debtBalance;
        uint256 interestRate;
        uint256 originationFee;
        uint256 collateralizationRatio;
        uint256 liquidationPenalty;
        address oracleContract;
        uint256 period;
    }

    struct Token {
        address tokenAddress;
        uint256 price;
        uint256 priceGranularity;
        uint256 tellorRequestId;
        uint256 reserveBalance;
        uint256 lastUpdatedAt;
    }

    struct Vault {
        uint256 collateralAmount;
        uint256 debtAmount;
        uint256 createdAt;
    }

    mapping(address => Vault) public vaults;
    Token debt;
    Token collateral;
    Reserve reserve;

    /**
     * @dev Getter function for the bank name
     * @return bank name
     */
    function getName() public view returns (string memory) {
        return name;
    }

    /**
     * @dev Getter function for the current interest rate
     * @return interest rate
     */
    function getInterestRate() public view returns (uint256) {
        return reserve.interestRate;
    }

    /**
     * @dev Getter function for the origination fee
     * @return origination fee
     */
    function getOriginationFee() public view returns (uint256) {
        return reserve.originationFee;
    }

    /**
     * @dev Getter function for the current collateralization ratio
     * @return collateralization ratio
     */
    function getCollateralizationRatio() public view returns (uint256) {
        return reserve.collateralizationRatio;
    }

    /**
     * @dev Getter function for the liquidation penalty
     * @return liquidation penalty
     */
    function getLiquidationPenalty() public view returns (uint256) {
        return reserve.liquidationPenalty;
    }

    /**
     * @dev Getter function for debt token address
     * @return debt token price
     */
    function getDebtTokenAddress() public view returns (address) {
        return debt.tokenAddress;
    }

    /**
     * @dev Getter function for the debt token(reserve) price
     * @return debt token price
     */
    function getDebtTokenPrice() public view returns (uint256) {
        return debt.price;
    }

    /**
     * @dev Getter function for the debt token price granularity
     * @return debt token price granularity
     */
    function getDebtTokenPriceGranularity() public view returns (uint256) {
        return debt.priceGranularity;
    }

    /**
     * @dev Getter function for the debt token last update time
     * @return debt token last update time
     */
    function getDebtTokenLastUpdatedAt() public view returns (uint256) {
        return debt.lastUpdatedAt;
    }

    /**
     * @dev Getter function for debt token address
     * @return debt token price
     */
    function getCollateralTokenAddress() public view returns (address) {
        return collateral.tokenAddress;
    }

    /**
     * @dev Getter function for the collateral token price
     * @return collateral token price
     */
    function getCollateralTokenPrice() public view returns (uint256) {
        return collateral.price;
    }

    /**
     * @dev Getter function for the collateral token price granularity
     * @return collateral token price granularity
     */
    function getCollateralTokenPriceGranularity()
        public
        view
        returns (uint256)
    {
        return collateral.priceGranularity;
    }

    /**
     * @dev Getter function for the collateral token last update time
     * @return collateral token last update time
     */
    function getCollateralTokenLastUpdatedAt() public view returns (uint256) {
        return collateral.lastUpdatedAt;
    }

    /**
     * @dev Getter function for the debt token(reserve) balance
     * @return debt reserve balance
     */
    function getReserveBalance() public view returns (uint256) {
        return reserve.debtBalance;
    }

    /**
     * @dev Getter function for the debt reserve collateral balance
     * @return collateral reserve balance
     */
    function getReserveCollateralBalance() public view returns (uint256) {
        return reserve.collateralBalance;
    }

    /**
     * @dev Getter function for the user's vault collateral amount
     * @return collateral amount
     */
    function getVaultCollateralAmount() public view returns (uint256) {
        return vaults[msg.sender].collateralAmount;
    }

    /**
     * @dev Getter function for the user's vault debt amount
     * @return debt amount
     */
    function getVaultDebtAmount() public view returns (uint256) {
        return vaults[msg.sender].debtAmount;
    }

    /**
     * @dev Getter function for the user's vault debt amount
     *   uses a simple interest formula (i.e. not compound  interest)
     * @return principal debt amount
     */
    function getVaultRepayAmount() public view returns (uint256 principal) {
        principal = vaults[msg.sender].debtAmount;
        uint256 periodsPerYear = 365 days / reserve.period;
        uint256 periodsElapsed = (block.timestamp / reserve.period) -
            (vaults[msg.sender].createdAt / reserve.period);
        principal +=
            ((principal * reserve.interestRate) / 10000 / periodsPerYear) *
            periodsElapsed;
    }

    /**
     * @dev Getter function for the collateralization ratio
     * @return collateralization ratio
     */
    function getVaultCollateralizationRatio(address vaultOwner)
        public
        view
        returns (uint256)
    {
        if (vaults[vaultOwner].debtAmount == 0) {
            return 0;
        } else {
            return
                (((vaults[vaultOwner].collateralAmount * collateral.price) /
                    collateral.priceGranularity) * 10000) /
                ((vaults[vaultOwner].debtAmount * debt.price) /
                    debt.priceGranularity);
        }
    }
}
