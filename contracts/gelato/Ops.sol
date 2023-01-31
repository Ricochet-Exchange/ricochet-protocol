pragma solidity ^0.8.0;

import './LibDataTypes.sol';

contract Ops {

    function exec(
        address _taskCreator,
        address _execAddress,
        bytes memory _execData,
        LibDataTypes.ModuleData calldata _moduleData,
        uint256 _txFee,
        address _feeToken,
        bool _useTaskTreasuryFunds,
        bool _revertOnFailure
    ) external {

    }
}