pragma solidity ^0.8.0;

import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract RecurringDeposits {
  ISuperToken public depositToken;
  uint256 public period;

  struct ScheduledDeposit {
    uint256 amount;
    uint256 times;
    uint256 nextDepositTime;
    address owner;
    uint256 next;
    uint256 prev;
  }

  // Use a first-in-first-out queue to store the scheduled deposits
  mapping(uint256 => ScheduledDeposit) public scheduledDeposits;
  mapping(address => uint256) public depositIndices;
  uint256 public nextIndex;
  uint256 public head;
  uint256 public tail;

  event DepositPerformed(
    address indexed depositor,
    uint256 amount
  );

  event DepositScheduled(
    address indexed depositor,
    uint256 amount,
    uint256 times,
    uint256 nextDepositTime
  );

  constructor(ISuperToken _depositToken, uint256 _period) public {
    depositToken = _depositToken;
    period = _period;
    nextIndex = 0;

    // Approve the deposit token to be spent by this contract
    ERC20(depositToken.getUnderlyingToken()).approve(address(depositToken), type(uint256).max);
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
  }

  function _performDeposit(address _depositor, uint _amount) internal {
      


    ERC20(depositToken.getUnderlyingToken()).transferFrom(_depositor, address(this), _amount);
    depositToken.upgradeTo(_depositor, _amount, '');
    emit DepositPerformed(
      _depositor,
      _amount
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


