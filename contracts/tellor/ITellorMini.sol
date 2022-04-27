// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITellorMini{
    /**
     * @dev Gets median of oracle values within a given time interval
     * @param _queryId is the id of the desired data
     * @param _timestamp is the highest timestamp in the time interval
     * @param _timeLimit is the length (seconds) of the time interval
     * @param _maxValueCount is the max number of values used to calculate a median
     * @return uint256 the median value
     * @return uint256 the quantity of values used to determine the median
     */
    function getMedian(
        bytes32 _queryId,
        uint256 _timestamp,
        uint256 _timeLimit,
        uint256 _maxValueCount
    ) external view returns (uint256, uint256);
}
