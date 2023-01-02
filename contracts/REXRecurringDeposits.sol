pragma solidity ^0.8.0;

import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "./gelato/OpsTaskCreator.sol";
import "hardhat/console.sol";

// TODO:
// 1. Implement a RIC gas tank, require some RIC to be deposited to the contract and use it to pay for gas
// 2. Implement a way to edit a scheduled deposit
// 3. Incorporate the REX Referral contract
// 4. Gelato integration: create task, txn pays for itself

contract RecurringDeposits is Ownable, OpsTaskCreator {
  ISuperToken public depositToken;
  ERC20 public gasToken;
  uint256 public period;
  uint256 public feeRate;
  uint256 public feeRateScaler;

  uint24[] public poolFees = [500];
  address[] public uniswapPath;
  IUniswapV3Factory public uniswapFactory; // Address of deployed uniswap factory

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
  mapping(address => uint256) pubic gasTank;

  // Gelato task variables
  uint256 public count;
  uint256 public lastExecuted;
  bytes32 public taskId;
  uint256 public constant MAX_COUNT = 5;
  uint256 public constant INTERVAL = 1 minutes;

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

  constructor(ISuperToken _depositToken, ERC20 _gasToken uint256 _period, uint256 _feeRate, address payable _ops, address _taskCreator) OpsTaskCreator(_ops, _taskCreator) {
    depositToken = _depositToken;
    gasToken = _gasToken;
    period = _period;
    feeRate = _feeRate;
    feeRateScaler = 10000;
    nextIndex = 0;

    // Approve the deposit token to be spent by this contract
    ERC20(depositToken.getUnderlyingToken()).approve(address(depositToken), type(uint256).max);

  }

  receive() external payable {}

  // Creates the performNextDeposit task on Gelato Network
  function createTask() external payable onlyOwner {
      require(taskId == bytes32(""), "Already started task");
      bytes memory execData = abi.encodeCall(this.performNextDeposit, ());
      ModuleData memory moduleData = ModuleData({
          modules: new Module[](2),
          args: new bytes[](2)
      });
      moduleData.modules[0] = Module.TIME;
      moduleData.modules[1] = Module.PROXY;
      moduleData.args[0] = _timeModuleArg(block.timestamp, INTERVAL);
      moduleData.args[1] = _proxyModuleArg();
      bytes32 id = _createTask(address(this), execData, moduleData, ETH);
      taskId = id;
      emit ProcessNextDepositTaskCreated(id);
  }

  // Initialize Uniswap v3
    function initializeUniswap(
        ISwapRouter02 _uniswapRouter,
        address[] memory _uniswapPath,
        uint24[] memory _poolFees
    ) external onlyOwner {
        router = _uniswapRouter;
        uniswapPath = _uniswapPath;
        poolFees = _poolFees;
    }

  // Wrapper around uniswap v3 swap
  function _swap(uint256 amountIn, uint256 amountOutMin, address[] memory path, uint24 fee) internal {
    ISwapRouter.ExactInputParams memory params =
      ISwapRouter.ExactInputParams({
        path: path,
        recipient: address(this),
        deadline: block.timestamp,
        amountIn: amountIn,
        amountOutMinimum: amountOutMin
      });
    router.exactInput(params, fee);
  }

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

  // Gas Tank Functions
  // - Gas tank takes gasTokens and sells them for MATIC to reimburse the user for gas costs
  function depositGas(uint amount) public  {
    // Require they have a scheduled deposit
    require(scheduledDeposits[depositIndices[msg.sender]].owner == msg.sender, "No scheduled deposit found for this account");
    gasToken.transferFrom(msg.sender, address(this), amount);
    gasTank[msg.sender] += amount;
  }

  function withdrawGas(uint amount) public  {
    require(amount <= gasTank[msg.sender], "Not enough gas in the tank");
    gasTank[msg.sender] -= amount;
    gasToken.transferFrom(address(this), msg.sender, amount);
  }

  function performNextDeposit() public {
    ScheduledDeposit storage deposit = scheduledDeposits[head];
    uint depositAmount = deposit.amount;
    address depositor = deposit.owner;
    require(deposit.nextDepositTime <= block.timestamp, "Next deposit time has not yet passed");
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

    // Swap the gasTokens for MATIC on uniswap 

    _transfer(fee, feeToken);
  }

  function _performDeposit(address _depositor, uint _amount) internal {
    uint fee = _amount * feeRate / feeRateScaler; // Calculate the fee
    uint depositAmount = _amount - fee; // Calculate the amount to be deposited after deducting the fee
    
    
    // Transfer the deposit amount from the depositor to the contract
    ERC20(depositToken.getUnderlyingToken()).transferFrom(_depositor, address(this), _amount);

    // Transfer the fee to the contract owner
    ERC20(depositToken.getUnderlyingToken()).transfer(owner(), fee);

    // Upgrade the deposit amount to SuperTokens
    depositToken.upgradeTo(_depositor, depositAmount, '');

    // Emit the DepositPerformed event
    emit DepositPerformed(
      _depositor,
      depositAmount,
      fee
    );
  }

  function cancelScheduledDeposit() public {
    uint256 index = depositIndices[msg.sender];
    ScheduledDeposit memory deposit = scheduledDeposits[index];
    require(deposit.owner == msg.sender, "No scheduled deposit found for this address");
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

}


