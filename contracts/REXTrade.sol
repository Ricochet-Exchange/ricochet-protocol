// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract REXTrade is Ownable, ERC721 {
    using Counters for Counters.Counter;

    struct Trade {
        uint256 tradeId;
        uint256 startTime;
        uint256 endTime;
        int96 flowRate;
        uint256 startIdaIndex;
        uint256 endIdaIndex;
        uint256 units;
    }

    Counters.Counter private tradeIds;
    mapping(uint256 => Trade) public trades;
    mapping(address => uint256[]) public tradesByUser;

    event TradeStarted(
        address indexed shareholder,
        uint256 indexed tradeId,
        uint256 startIndex,
        int96 flowRate,
        uint256 units
    );
    event TradeEnded(
        address indexed shareholder,
        uint256 indexed tradeId,
        uint256 endIndex
    );

    constructor() ERC721("REX Trade", "REX") {}

    function getTradeInfo(address _trader, uint _tradeIndex)
        external
        view
        returns (Trade memory trade)
    {
        trade = trades[tradesByUser[_trader][_tradeIndex]];
    }

    function getLatestTrade(address _trader)
        external
        view
        returns (Trade memory trade)
    {
        trade = trades[
            tradesByUser[_trader][tradesByUser[_trader].length - 1]
        ];
    }

    function startRexTrade(
        address _shareholder,
        int96 _flowRate,
        uint _indexValue,
        uint _units
    ) external onlyOwner {
        // Mint the shareholder an NFT to track this trade
        uint tradeId = tradeIds.current();

        trades[tradeId] = Trade({
            tradeId: tradeId,
            startTime: block.timestamp,
            endTime: 0,
            flowRate: _flowRate,
            startIdaIndex: _indexValue,
            endIdaIndex: 0,
            units: _units
        });
        tradesByUser[_shareholder].push(tradeId);
        _safeMint(_shareholder, tradeIds.current());
        tradeIds.increment();

        emit TradeStarted(
            _shareholder,
            tradeId,
            _indexValue,
            _flowRate,
            _units
        );
    }

    function endRexTrade(
        address _shareholder,
        uint _indexValue
    ) external onlyOwner {
        // Get the trade for this shareholder, will always be the last one in the list
        Trade storage trade = trades[
            tradesByUser[_shareholder][tradesByUser[_shareholder].length - 1]
        ];

        // Update the trade
        trade.endTime = block.timestamp;
        trade.endIdaIndex = _indexValue;

        emit TradeEnded(_shareholder, trade.tradeId, _indexValue);
    }
}
