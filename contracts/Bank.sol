// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./BankStorage.sol";
import "./ITellor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

import "hardhat/console.sol";

/**
 * @title Bank
 * This contract allows the owner to deposit reserves(debt token), earn interest and
 * origination fees from users that borrow against their collateral.
 * The oracle for Bank is Tellor.
 */
contract Bank is BankStorage, AccessControlEnumerable, Initializable {
    using SafeERC20 for IERC20;

    address private _bankFactoryOwner;

    /*Events*/
    event ReserveDeposit(uint256 amount);
    event ReserveWithdraw(address indexed token, uint256 amount);
    event VaultDeposit(address indexed owner, uint256 amount);
    event VaultBorrow(address indexed borrower, uint256 amount);
    event VaultRepay(address indexed borrower, uint256 amount);
    event VaultWithdraw(address indexed borrower, uint256 amount);
    event PriceUpdate(address indexed token, uint256 price);
    event Liquidation(address indexed borrower, uint256 debtAmount);

    /*Constructor*/
    constructor(address payable oracleContract) {
        reserve.oracleContract = oracleContract;
    }

    /*Modifiers*/
    modifier onlyOwner() {
        require(_owner == msg.sender, "IS NOT OWNER");
        _;
    }

    /*Functions*/
    /**
     * @dev Returns the owner of the bank
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     * NOTE: Override this to add changing the
     */
    function transferOwnership(address newOwner) public onlyOwner {
        _owner = newOwner;
    }

    /**
     * @dev This function sets the fundamental parameters for the bank
     *      and assigns the first admin
     */
    function init(
        address creator,
        string memory bankName,
        uint256 interestRate,
        uint256 originationFee,
        uint256 collateralizationRatio,
        uint256 liquidationPenalty,
        uint256 period,
        address bankFactoryOwner,
        address payable oracleContract
    ) public initializer {
        //set up as admin / owner
        _setupRole(DEFAULT_ADMIN_ROLE, creator);
        reserve.interestRate = interestRate;
        reserve.originationFee = originationFee;
        reserve.collateralizationRatio = collateralizationRatio;
        reserve.oracleContract = oracleContract;
        reserve.liquidationPenalty = liquidationPenalty;
        reserve.period = period;
        _bankFactoryOwner = bankFactoryOwner;
        name = bankName;
    }

    /**
     * @dev This function sets the collateral token properties, only callable one time
     */
    function setCollateral(
        address collateralToken,
        uint256 collateralTokenTellorRequestId,
        uint256 collateralTokenPriceGranularity,
        uint256 collateralTokenPrice
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            collateral.tokenAddress == address(0) &&
                collateralToken != address(0),
            "!setable"
        );
        collateral.tokenAddress = collateralToken;
        collateral.price = collateralTokenPrice;
        collateral.priceGranularity = collateralTokenPriceGranularity;
        collateral.tellorRequestId = collateralTokenTellorRequestId;
    }

    /**
     * @dev This function sets the debt token properties, only callable one time
     */
    function setDebt(
        address debtToken,
        uint256 debtTokenTellorRequestId,
        uint256 debtTokenPriceGranularity,
        uint256 debtTokenPrice
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            debt.tokenAddress == address(0) && debtToken != address(0),
            "!setable"
        );
        debt.tokenAddress = debtToken;
        debt.price = debtTokenPrice;
        debt.priceGranularity = debtTokenPriceGranularity;
        debt.tellorRequestId = debtTokenTellorRequestId;
    }

    /**
     * @dev This function allows the Bank owner to deposit the reserve (debt tokens)
     * @param amount is the amount to deposit
     */
    function reserveDeposit(uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(amount > 0, "Amount is zero !!");
        reserve.debtBalance += amount;
        IERC20(debt.tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        emit ReserveDeposit(amount);
    }

    /**
     * @dev This function allows the Bank owner to withdraw the reserve (debt tokens)
     *      Withdraws incur a 0.5% fee paid to the bankFactoryOwner
     * @param amount is the amount to withdraw
     */
    function reserveWithdraw(uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            IERC20(debt.tokenAddress).balanceOf(address(this)) >= amount,
            "NOT ENOUGH DEBT TOKENS IN RESERVE"
        );
        uint256 feeAmount = amount / 200; // Bank Factory collects 0.5% fee
        reserve.debtBalance -= amount;
        IERC20(debt.tokenAddress).safeTransfer(msg.sender, amount - feeAmount);
        IERC20(debt.tokenAddress).safeTransfer(_bankFactoryOwner, feeAmount);
        emit ReserveWithdraw(debt.tokenAddress, amount);
    }

    /**
  * @dev This function allows the user to withdraw their collateral
         Withdraws incur a 0.5% fee paid to the bankFactoryOwner
  * @param amount is the amount to withdraw
  */
    function reserveWithdrawCollateral(uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            reserve.collateralBalance >= amount,
            "NOT ENOUGH COLLATERAL IN RESERVE"
        );
        uint256 feeAmount = amount / 200; // Bank Factory collects 0.5% fee
        reserve.collateralBalance -= amount;
        emit ReserveWithdraw(collateral.tokenAddress, amount);
        IERC20(collateral.tokenAddress).safeTransfer(
            msg.sender,
            amount - feeAmount
        );
        IERC20(collateral.tokenAddress).safeTransfer(
            _bankFactoryOwner,
            feeAmount
        );
    }

    /**
     * @dev Use this function to get and update the price for the collateral token
     * using the Tellor Oracle.
     */
    function updateCollateralPrice() external {
        require(
            hasRole(REPORTER_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "not price updater or admin"
        );
        (, collateral.price, collateral.lastUpdatedAt) = getCurrentValue(
            collateral.tellorRequestId
        ); //,now - 1 hours);
        emit PriceUpdate(collateral.tokenAddress, collateral.price);
    }

    /**
     * @dev Use this function to get and update the price for the debt token
     * using the Tellor Oracle.
     */
    function updateDebtPrice() external {
        require(
            hasRole(REPORTER_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "not price updater or admin"
        );
        (, debt.price, debt.lastUpdatedAt) = getCurrentValue(
            debt.tellorRequestId
        ); //,now - 1 hours);
        emit PriceUpdate(debt.tokenAddress, debt.price);
    }

    /**
     * @dev Only keepers or admins can use this function to liquidate a vault's debt,
     * the bank admins gets the collateral liquidated, liquidated collateral
     * is charged a 10% fee which gets paid to the bankFactoryOwner
     * @param vaultOwner is the user the bank admins wants to liquidate
     */
    function liquidate(address vaultOwner) external {
        require(
            hasRole(KEEPER_ROLE, msg.sender) ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "not keeper or admin"
        );
        // Require undercollateralization
        require(
            getVaultCollateralizationRatio(vaultOwner) <
                reserve.collateralizationRatio * 100,
            "VAULT NOT UNDERCOLLATERALIZED"
        );
        uint256 debtOwned = vaults[vaultOwner].debtAmount +
            ((vaults[vaultOwner].debtAmount *
                100 *
                reserve.liquidationPenalty) /
                100 /
                100);
        uint256 collateralToLiquidate = (debtOwned * debt.price) /
            collateral.price;

        if (collateralToLiquidate > vaults[vaultOwner].collateralAmount) {
            collateralToLiquidate = vaults[vaultOwner].collateralAmount;
        }

        uint256 feeAmount = collateralToLiquidate / 10; // Bank Factory collects 10% fee
        reserve.collateralBalance += collateralToLiquidate - feeAmount;
        vaults[vaultOwner].collateralAmount -= collateralToLiquidate;
        vaults[vaultOwner].debtAmount = 0;
        IERC20(collateral.tokenAddress).safeTransfer(
            _bankFactoryOwner,
            feeAmount
        );
        emit Liquidation(vaultOwner, debtOwned);
    }

    /**
     * @dev Use this function to allow users to deposit collateral to the vault
     * @param amount is the collateral amount
     */
    function vaultDeposit(uint256 amount) external {
        require(amount > 0, "Amount is zero !!");
        vaults[msg.sender].collateralAmount += amount;
        reserve.collateralBalance += amount;
        IERC20(collateral.tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        emit VaultDeposit(msg.sender, amount);
    }

    /**
     * @dev Use this function to allow users to borrow against their collateral
     * @param amount to borrow
     */
    function vaultBorrow(uint256 amount) external {
        if (vaults[msg.sender].debtAmount != 0) {
            vaults[msg.sender].debtAmount = getVaultRepayAmount();
        }
        uint256 maxBorrow = ((vaults[msg.sender].collateralAmount *
            collateral.price) /
            debt.price /
            reserve.collateralizationRatio) * 100;
        maxBorrow *= debt.priceGranularity;
        maxBorrow /= collateral.priceGranularity;
        maxBorrow -= vaults[msg.sender].debtAmount;
        vaults[msg.sender].debtAmount +=
            amount +
            ((amount * reserve.originationFee) / 10000);
        require(
            vaults[msg.sender].debtAmount < maxBorrow,
            "NOT ENOUGH COLLATERAL"
        );
        require(
            amount <= IERC20(debt.tokenAddress).balanceOf(address(this)),
            "NOT ENOUGH RESERVES"
        );
        if (block.timestamp - vaults[msg.sender].createdAt > reserve.period) {
            // Only adjust if more than 1 interest rate period has past
            vaults[msg.sender].createdAt = block.timestamp;
        }
        reserve.debtBalance -= amount;
        IERC20(debt.tokenAddress).safeTransfer(msg.sender, amount);
        emit VaultBorrow(msg.sender, amount);
    }

    /**
     * @dev This function allows users to pay the interest and origination fee to the
     *  vault before being able to withdraw
     * @param amount owed
     */
    function vaultRepay(uint256 amount) external {
        require(amount > 0, "Amount is zero !!");
        vaults[msg.sender].debtAmount = getVaultRepayAmount();
        require(
            amount <= vaults[msg.sender].debtAmount,
            "CANNOT REPAY MORE THAN OWED"
        );
        vaults[msg.sender].debtAmount -= amount;
        reserve.debtBalance += amount;
        uint256 periodsElapsed = (block.timestamp / reserve.period) -
            (vaults[msg.sender].createdAt / reserve.period);
        vaults[msg.sender].createdAt += periodsElapsed * reserve.period;
        IERC20(debt.tokenAddress).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );
        emit VaultRepay(msg.sender, amount);
    }

    /**
     * @dev Allows users to withdraw their collateral from the vault
     * @param amount withdrawn
     */
    function vaultWithdraw(uint256 amount) external {
        require(
            amount <= vaults[msg.sender].collateralAmount,
            "CANNOT WITHDRAW MORE COLLATERAL"
        );

        uint256 maxBorrowAfterWithdraw = (((vaults[msg.sender]
            .collateralAmount - amount) * collateral.price) /
            debt.price /
            reserve.collateralizationRatio) * 100;
        maxBorrowAfterWithdraw *= debt.priceGranularity;
        maxBorrowAfterWithdraw /= collateral.priceGranularity;
        require(
            vaults[msg.sender].debtAmount <= maxBorrowAfterWithdraw,
            "CANNOT UNDERCOLLATERALIZE VAULT"
        );
        vaults[msg.sender].collateralAmount -= amount;
        reserve.collateralBalance -= amount;
        IERC20(collateral.tokenAddress).safeTransfer(msg.sender, amount);
        emit VaultWithdraw(msg.sender, amount);
    }

    function getBankFactoryOwner() public view returns (address) {
        return _bankFactoryOwner;
    }

    function setBankFactoryOwner(address newOwner) external {
        require(_bankFactoryOwner == msg.sender, "IS NOT BANK FACTORY OWNER");
        _bankFactoryOwner = newOwner;
    }

    function getCurrentValue(uint256 _requestId)
        public
        view
        returns (
            bool ifRetrieve,
            uint256 value,
            uint256 _timestampRetrieved
        )
    {
        ITellor oracle = ITellor(reserve.oracleContract);
        uint256 _count = oracle.getNewValueCountbyRequestId(_requestId);
        uint256 _time = oracle.getTimestampbyRequestIDandIndex(
            _requestId,
            _count - 1
        );
        uint256 _value = oracle.retrieveData(_requestId, _time);
        if (_value > 0) return (true, _value, _time);
        return (false, 0, _time);
    }

    /**
     * @dev Allows admin to add address to keeper role
     * @param keeper address of new keeper
     */
    function addKeeper(address keeper) external {
        require(keeper != address(0), "operation not allowed");
        grantRole(KEEPER_ROLE, keeper);
    }

    /**
     * @dev Allows admin to remove address from keeper role
     * @param oldKeeper address of old keeper
     */
    function revokeKeeper(address oldKeeper) external {
        revokeRole(KEEPER_ROLE, oldKeeper);
    }

    /**
     * @dev Allows admin to add address to price updater role
     * @param updater address of new price updater
     */
    function addReporter(address updater) external {
        require(updater != address(0), "operation not allowed");
        grantRole(REPORTER_ROLE, updater);
    }

    /**
     * @dev Allows admin to remove address from price updater role
     * @param oldUpdater address of old price updater
     */
    function revokeReporter(address oldUpdater) external {
        revokeRole(REPORTER_ROLE, oldUpdater);
    }
}
