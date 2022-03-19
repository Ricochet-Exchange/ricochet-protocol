// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;


import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import './REXMarket.sol';
import './referral/IREXReferral.sol';
import './idle/IIdleToken.sol';
import 'hardhat/console.sol';

contract REXIdleTokenMarket is REXMarket {

  using SafeERC20 for ERC20;
  uint32 constant OUTPUT_INDEX = 0;
  // REXMarket contract requires an oracle request id, so set to an unused id
  uint256 constant USDC_REQUEST_ID = 78;
  ITellor constant TELLOR_ORACLE = ITellor(0xACC2d27400029904919ea54fFc0b18Bf07C57875);

  constructor(
    address _owner,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida,
    string memory _registrationKey,
    IREXReferral _rexReferral
  ) public REXMarket(_owner, _host, _cfa, _ida, _registrationKey, _rexReferral) {

  }

  function initializeIdleTokenMarket(
    ISuperToken _inputToken,
    ISuperToken _outputToken,
    uint128 _feeRate,
    uint128 _affiliateFee) public onlyOwner initializer {

    // The rateTolerance and oracle info is not required hence 0, address(0), BLANK_REQUEST_ID
    REXMarket.initializeMarket(_inputToken, 0, TELLOR_ORACLE, USDC_REQUEST_ID, _affiliateFee, _feeRate);
    addOutputPool(_outputToken, _feeRate, 0, USDC_REQUEST_ID, 1e6);

    // TODO: Setup subsidies for IDLE and RIC
    // ...

    // Unlimited approve for idleUSDC contract
    ERC20(market.inputToken.getUnderlyingToken()).safeIncreaseAllowance(
        market.outputPools[OUTPUT_INDEX].token.getUnderlyingToken(),
        2**256 - 1
    );

    // Unlimited approval for upgrading idleUSDC to idleUSDCx
    ERC20(market.outputPools[OUTPUT_INDEX].token.getUnderlyingToken()).safeIncreaseAllowance(
        address(market.outputPools[OUTPUT_INDEX].token),
        2**256 - 1
    );

  }

  function distribute(bytes memory ctx) public override returns (bytes memory newCtx) {

    newCtx = ctx;

    // TODO: Rebalance idleUSDC?

    // Downgrade USDCx, mint idleUSDC, upgrade to idleUSDCx
    market.inputToken.downgrade(market.inputToken.balanceOf(address(this)));
    IIdleToken(market.outputPools[OUTPUT_INDEX].token.getUnderlyingToken()).mintIdleToken(
      ERC20(market.inputToken.getUnderlyingToken()).balanceOf(address(this)), true, address(this)
    );
    market.outputPools[OUTPUT_INDEX].token.upgrade(ERC20(market.outputPools[OUTPUT_INDEX].token.getUnderlyingToken()).balanceOf(address(this)));

    uint256 outputBalance = market.outputPools[OUTPUT_INDEX].token.balanceOf(address(this));
    (uint256 actualAmount,) = ida.calculateDistribution(
        market.outputPools[OUTPUT_INDEX].token,
        address(this),
        0,
        outputBalance);

    // Return if there's not anything to actually distribute
    if (actualAmount == 0) { return newCtx; }

    // Calculate the fee for making the distribution
    uint256 feeCollected = actualAmount * market.feeRate / 1e6;
    uint256 distAmount = actualAmount - feeCollected;

    console.log("outputBalance", outputBalance);
    console.log("actualAmount", actualAmount);
    console.log("feesCollected", feeCollected);
    console.log("distAmount", distAmount);

    // Make the distribution for primary output pool
    newCtx = _idaDistribute(0, uint128(actualAmount), market.outputPools[OUTPUT_INDEX].token, newCtx);
    emit Distribution(actualAmount, feeCollected, address(market.outputPools[OUTPUT_INDEX].token));

    // Go through the other OutputPools and trigger distributions
    for( uint32 index = 1; index < market.numOutputPools; index++) {
      outputBalance = market.outputPools[index].token.balanceOf(address(this));
      if (outputBalance > 0) {
        // Should oneway market only support subsidy tokens?
        if (market.feeRate != 0) {
          newCtx = _idaDistribute(index, uint128(outputBalance), market.outputPools[index].token, newCtx);
          emit Distribution(outputBalance, feeCollected, address(market.outputPools[index].token));
        } else {
          actualAmount = (block.timestamp - market.lastDistributionAt) * market.outputPools[index].emissionRate;
          if (actualAmount < outputBalance) {
            newCtx = _idaDistribute(index, uint128(actualAmount), market.outputPools[index].token, newCtx);
            emit Distribution(actualAmount, 0, address(market.outputPools[index].token));
          }
        }
      }
    }

    market.lastDistributionAt = block.timestamp;

  }

}
