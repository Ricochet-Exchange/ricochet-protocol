pragma solidity >=0.4.0;

interface ISETHCustom {
  // using native token
  function upgradeByETH() external payable;

  function upgradeByETHTo(address to) external payable;

  function downgradeToETH(uint wad) external;

  // using wrapped native token
  function getUnderlyingToken() external view returns (address tokenAddr);

  function upgrade(uint256 amount) external;

  function upgradeTo(address to, uint256 amount, bytes calldata data) external;

  function downgrade(uint256 amount) external;
}
