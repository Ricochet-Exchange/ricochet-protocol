// SPDX-License-Identifier: All rights reserved
pragma solidity ^0.8.0;

import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "./gelato/OpsTaskCreator.sol";
import "./superswap/interfaces/IV3SwapRouter.sol";
import "./matic/IWMATIC.sol";
import "hardhat/console.sol";


contract RecurringDeposits is Ownable, OpsTaskCreator {

    IWMATIC public constant WMATIC = IWMATIC(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);

    ISuperToken public depositToken;
    ERC20 public gasToken;
    ERC20 public feeToken;
    uint256 public period;
    uint256 public feeRate;
    uint256 public feeRateScaler;

    struct ScheduledDeposit {
        uint256 amount;
        uint256 times;
        uint256 nextDepositTime;
        address owner;
        uint256 next;
        uint256 prev;
    }

    // Use a linked list to store the scheduled deposits
    mapping(uint256 => ScheduledDeposit) public scheduledDeposits;
    mapping(address => uint256) public depositIndices;
    uint256 public nextIndex;
    uint256 public head;
    uint256 public tail;

    // Keep track of gas for each account using this contract
    mapping(address => uint256) public gasTank;

    // Gelato task variables
    uint256 public count;
    uint256 public lastExecuted;
    bytes32 public taskId;
    uint256 public constant MAX_COUNT = 5;
    uint256 public constant INTERVAL = 1 minutes;

    // Uniswap integration variables
    IV3SwapRouter public router;

    // Events
    event ProcessNextDepositTaskCreated(bytes32 taskId);

    event DepositPerformed(
        address indexed depositor,
        uint256 amount,
        uint256 fee
    );

    event DepositScheduled(
        address indexed depositor,
        uint256 amount,
        uint256 times,
        uint256 nextDepositTime
    );

    constructor(
        ISuperToken _depositToken,
        ERC20 _gasToken,
        ERC20 _feeToken,
        IV3SwapRouter _uniswapRouter,
        uint256 _period,
        uint256 _feeRate,
        address payable _ops,
        address _taskCreator
    ) OpsTaskCreator(_ops, _taskCreator) {
        depositToken = _depositToken;
        gasToken = _gasToken;
        feeToken = _feeToken;
        router = _uniswapRouter;
        period = _period;
        feeRate = _feeRate;
        feeRateScaler = 10000;
        nextIndex = 0;

        // Approve the deposit token to be spent by this contract
        ERC20(depositToken.getUnderlyingToken()).approve(
            address(depositToken),
            type(uint256).max
        );

        // Approve the router to spend the gasTokens
        gasToken.approve(address(router), type(uint256).max);
    }

    receive() external payable {}

    // Initialization methods

    // Creates the performNextDeposit task on Gelato Network
    function createTask() external payable onlyOwner {
        require(taskId == bytes32(""), "Already started task");
        bytes memory execData = abi.encodeCall(this.performNextDeposit, ());
        ModuleData memory moduleData = ModuleData({
            modules: new Module[](1),
            args: new bytes[](1)
        });
        moduleData.modules[0] = Module.TIME;
        moduleData.args[0] = _timeModuleArg(block.timestamp, INTERVAL);
        bytes32 id = _createTask(address(this), execData, moduleData, ETH);
        taskId = id;
        emit ProcessNextDepositTaskCreated(id);
    }

    // Gas Tank Functions
    // - Gas tank takes gasTokens and sells them for MATIC to reimburse the user for gas costs
    function depositGas(uint256 amount) public {
        // Require they have a scheduled deposit
        require(
            scheduledDeposits[depositIndices[msg.sender]].owner == msg.sender,
            "No scheduled deposit found for this account"
        );
        require(gasToken.transferFrom(msg.sender, address(this), amount));
        gasTank[msg.sender] += amount;

    }

    function withdrawGas(uint256 amount) public {
        require(amount <= gasTank[msg.sender], "Not enough gas in the tank");
        gasTank[msg.sender] -= amount;
        gasToken.transfer(msg.sender, amount);
    }

    // Recurring Deposit Functions

    // Make a new scheduled deposit that will deposit _amount
    // recurring _times before stopping
    function scheduleDeposit(uint256 _amount, uint256 _times) public {
        ScheduledDeposit memory deposit = ScheduledDeposit(
            _amount,
            _times,
            block.timestamp + period,
            msg.sender,
            0,
            0
        );
        scheduledDeposits[nextIndex] = deposit;
        if (head == 0) {
            head = nextIndex;
        } else {
            scheduledDeposits[tail].next = nextIndex;
            deposit.prev = tail;
        }
        tail = nextIndex;
        nextIndex = nextIndex + 1;
        emit DepositScheduled(
            msg.sender,
            _amount,
            _times,
            block.timestamp + period
        );
    }

    // Polled by gelato to perform the next deposit, gas tank is used to reimburse the user for gas costs
    function performNextDeposit() public payable {
        uint gasUsed = gasleft(); 
        ScheduledDeposit storage deposit = scheduledDeposits[head];
        uint256 depositAmount = deposit.amount;
        address depositor = deposit.owner;
        require(
            deposit.nextDepositTime <= block.timestamp,
            "Next deposit time has not yet passed"
        );
        if (deposit.times > 0) {
            deposit.times -= 1;
        }
        if (deposit.times == 0) {
            delete scheduledDeposits[head];
            head = deposit.next;
            if (head == 0) {
                tail = 0;
            } else {
                scheduledDeposits[head].prev = 0;
            }
        } else {
            scheduledDeposits[tail].next = head;
            deposit.prev = tail;
            deposit.next = 0;
            tail = head;
        }
        deposit.nextDepositTime = block.timestamp + period;
        _performDeposit(depositor, depositAmount);

        // Gelato transaction pays for itself
        (uint256 fee, address feeToken) = _getFeeDetails();

        // If the gelato executor is paying for the transaction, pay for the gas for them
        uint amountIn;
        if(fee > 0) {
            // TODO: Need to integration test
            amountIn = _swap(fee, type(uint256).max, 500);
            require(amountIn <= gasTank[depositor], "Not enough gas in the tank");
            WMATIC.withdraw(WMATIC.balanceOf(address(this)));
            _transfer(fee, feeToken);
        } else {
            gasUsed = gasUsed - gasleft();
            fee = gasUsed * tx.gasprice;
            amountIn = _swap(fee, type(uint256).max, 500);
            WMATIC.transfer(depositor, amountIn);
        }

    }

    // Perform a deposit (upgrade) for a specific user for a specific amount
    function _performDeposit(address _depositor, uint256 _amount) internal {
        uint256 fee = (_amount * feeRate) / feeRateScaler; // Calculate the fee
        uint256 depositAmount = _amount - fee; // Calculate the amount to be deposited after deducting the fee

        // Transfer the deposit amount from the depositor to the contract
        ERC20(depositToken.getUnderlyingToken()).transferFrom(
            _depositor,
            address(this),
            _amount
        );

        // Transfer the fee to the contract owner
        ERC20(depositToken.getUnderlyingToken()).transfer(owner(), fee);

        // Upgrade the deposit amount to SuperTokens
        depositToken.upgradeTo(_depositor, depositAmount, "");

        // Emit the DepositPerformed event
        emit DepositPerformed(_depositor, depositAmount, fee);
    }

    // Cancel a scheduled deposit, can only cancel your own deposit
    function cancelScheduledDeposit() public {
        uint256 index = depositIndices[msg.sender];
        ScheduledDeposit memory deposit = scheduledDeposits[index];
        require(
            deposit.owner == msg.sender,
            "No scheduled deposit found for this address"
        );
        delete scheduledDeposits[index];
        // Update the prev and next fields of the surrounding scheduled deposits
        if (deposit.next != 0) {
            scheduledDeposits[deposit.next].prev = deposit.prev;
        }
        if (deposit.prev != 0) {
            scheduledDeposits[deposit.prev].next = deposit.next;
        }

        // Update the head and tail variables if necessary
        if (index == head) {
            head = deposit.next;
        }
        if (index == tail) {
            tail = deposit.prev;
        }

        delete depositIndices[msg.sender];
    }

    // Uniswap V3 Helper functions

    // Swaps deposit tokens and repays the gas
    function _swap(
        uint256 amountOut,
        uint256 amountInMaximum,
        uint24 fee
    ) internal returns (uint256) {

        // TODO: Use path as (USDC -> RIC -> MATIC) instead of (USDC -> MATIC)
        IV3SwapRouter.ExactOutputParams memory params = IV3SwapRouter.ExactOutputParams({
            // Pass the swap through the feeToken LP
            path: abi.encodePacked(address(WMATIC), fee, address(feeToken), fee, address(gasToken)),
            recipient: address(this),
            deadline: block.timestamp + 3600,
            amountOut: amountOut,
            amountInMaximum: 2000000
        });
        return router.exactOutput(params);

    }
}
