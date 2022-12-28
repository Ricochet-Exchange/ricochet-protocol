pragma solidity ^0.8.0;

import ERC20 from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract RecurringDeposits {
  ERC20 public depositToken;
  uint256 public period;

  struct ScheduledDeposit {
    uint256 amount;
    uint256 times;
    uint256 nextDepositTime;
    address owner;
    uint256 next;
  }

  
  mapping(uint256 => ScheduledDeposit) public scheduledDeposits;
  mapping(address => uint256) public depositIndices;
  uint256 public nextIndex;
  uint256 public head;
  uint256 public tail;

  event DepositPerformed(
    uint256 indexed _index,
    uint256 _amount,
    uint256 _times,
    uint256 _nextDepositTime
  );

  constructor(ERC20 _depositToken, uint256 _period) public {
    depositToken = _depositToken;
    period = _period;
    nextIndex = 0;
  }

  function scheduleDeposit(uint256 amount, uint256 times) public {
    ScheduledDeposit deposit = ScheduledDeposit(
      amount,
      times,
      now.add(period),
      msg.sender,
      0
    );
    scheduledDeposits[nextIndex] = deposit;
    depositIndices[msg.sender] = nextIndex;
    if (tail == 0) {
      head = nextIndex;
      tail = nextIndex;
    } else {
      scheduledDeposits[tail].next = nextIndex;
      tail = nextIndex;
    }
    nextIndex = nextIndex.add(1);
  }

  function performNextDeposit() public {
    require(head != 0, "Queue is empty");
    ScheduledDeposit deposit = scheduledDeposits[head];
    require(deposit.nextDepositTime <= now, "Next deposit time has not yet passed");
    if (deposit.times > 0) {
      deposit.times -= 1;
    }
    deposit.nextDepositTime = now.add(period);
    if (deposit.times == 0) {
      head = deposit.next;
      if (head == 0) {
        tail = 0;
      }
    }
    if (deposit.times > 0) {
      scheduledDeposits[head].times = deposit.times;
      scheduledDeposits[head].nextDepositTime = deposit.nextDepositTime;
      scheduledDeposits[tail].next = head;
      tail = head;
    }
    emit DepositPerformed(
      head,
      deposit.amount,
      deposit.times,
      deposit.nextDepositTime
    );
  }

  function cancelScheduledDeposit() public {
    uint256 index = depositIndices[msg.sender];
    require(index != 0, "No scheduled deposit found for account");
    ScheduledDeposit deposit = scheduledDeposits[index];
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


