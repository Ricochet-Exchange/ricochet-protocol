// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import './REXMarket.sol';
import './ISETHCustom.sol';

error NotScalable();
error NotCurrentValue();

contract REXTwoWayMaticMarket is REXMarket {
  using SafeERC20 for ERC20;

  ISuperToken inputTokenA;
  ISuperToken inputTokenB;
  uint32 constant OUTPUTA_INDEX = 0;
  uint32 constant OUTPUTB_INDEX = 1;
  uint32 constant SUBSIDYA_INDEX = 2;
  uint32 constant SUBSIDYB_INDEX = 3;
  uint256 lastDistributionTokenAAt;
  uint256 lastDistributionTokenBAt;
  address public constant MATICX = 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3;
  ISuperToken subsidyToken = ISuperToken(0x263026E7e53DBFDce5ae55Ade22493f828922965);
  IUniswapV2Router02 router = IUniswapV2Router02(0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506);
  ITellorMini tellor = ITellorMini(0xf8c1EB914EF4271edBC95C48ED067295C057F1a0);


  // REX Two Way Market Contracts
  // - Swaps the accumulated input tokens for output tokens

  constructor(
    address _owner,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida,
    string memory _registrationKey,
    IREXReferral _rexReferral
  ) public REXMarket(_owner, _host, _cfa, _ida, _registrationKey, _rexReferral) {

  }

  function initializeTwoWayMarket(
    ISuperToken _inputTokenA,
    bytes32 _inputTokenAQueryId,
    uint128 _inputTokenAShareScaler,
    ISuperToken _inputTokenB,
    bytes32 _inputTokenBQueryId,
    uint128 _inputTokenBShareScaler,
    uint128 _feeRate,
    uint256 _rateTolerance
  ) public onlyOwner initializer {

    inputTokenA = _inputTokenA;
    inputTokenB = _inputTokenB;
    market.inputToken = _inputTokenA; // market.inputToken isn't used but is set bc of the REXMarket
    market.rateTolerance = _rateTolerance;
    oracle = tellor;
    market.feeRate = _feeRate;
    market.affiliateFee = 100000;
    if(_inputTokenAShareScaler < 1e6 && _inputTokenBShareScaler < 1e6) {
      revert NotScalable();
    }
    addOutputPool(inputTokenA, _feeRate, 0, _inputTokenAQueryId, _inputTokenAShareScaler);
    addOutputPool(inputTokenB, _feeRate, 0, _inputTokenBQueryId, _inputTokenBShareScaler);
    market.outputPoolIndicies[inputTokenA] = OUTPUTA_INDEX;
    market.outputPoolIndicies[inputTokenB] = OUTPUTB_INDEX;

    // Approvals
    // Unlimited approve for sushiswap
    ERC20(inputTokenA.getUnderlyingToken()).safeIncreaseAllowance(
        address(router),
        2**256 - 1
    );
    ERC20(inputTokenB.getUnderlyingToken()).safeIncreaseAllowance(
        address(router),
        2**256 - 1
    );
    // and Supertoken upgrades
    ERC20(inputTokenA.getUnderlyingToken()).safeIncreaseAllowance(
        address(inputTokenA),
        2**256 - 1
    );
    ERC20(inputTokenB.getUnderlyingToken()).safeIncreaseAllowance(
        address(inputTokenB),
        2**256 - 1
    );

  }

  function initializeSubsidies(
    uint256 _emissionRate
  ) public onlyOwner {
    require(address(market.outputPools[SUBSIDYA_INDEX].token) == address(0) && address(market.outputPools[SUBSIDYB_INDEX].token) == address(0), "already initialized");
    addOutputPool(subsidyToken, 0, _emissionRate, 0x6e5122118ce52cc9b97c359c1f174a3c21c71d810f7addce3484cc28e0be0f29, market.outputPools[OUTPUTB_INDEX].shareScaler);
    addOutputPool(subsidyToken, 0, _emissionRate, 0x6e5122118ce52cc9b97c359c1f174a3c21c71d810f7addce3484cc28e0be0f29,  market.outputPools[OUTPUTA_INDEX].shareScaler);
    lastDistributionTokenAAt = block.timestamp;
    lastDistributionTokenBAt = block.timestamp;
    // Does not need to add subsidy token to outputPoolIndicies
    // since these pools are hardcoded
  }

  function addOutputPool(
      ISuperToken _token,
      uint128 _feeRate,
      uint256 _emissionRate,
      bytes32 _queryId,
      uint128 _shareScaler
  ) public override onlyOwner {
      // Only Allow 4 output pools, this overrides the block in REXMarket
      // where there can't be two output pools of the same token
      require(market.numOutputPools < 4, "too many pools");

      OutputPool memory _newPool = OutputPool(
          _token,
          _feeRate,
          _emissionRate,
          _shareScaler
      );
      market.outputPools[market.numOutputPools] = _newPool;
      market.outputPoolIndicies[_token] = market.numOutputPools;
      _createIndex(market.numOutputPools, _token);
      market.numOutputPools++;
      OracleInfo memory _newOracle = OracleInfo(_queryId, 0, 0);
      market.oracles[_token] = _newOracle;
      updateTokenPrice(_token);
  }

  function distribute(bytes memory ctx) public override returns (bytes memory newCtx) {

    newCtx = ctx;

    if(market.oracles[market.outputPools[OUTPUTA_INDEX].token].lastUpdatedAt < block.timestamp - 3600) {
      revert NotCurrentValue();
    }
    if(market.oracles[market.outputPools[OUTPUTB_INDEX].token].lastUpdatedAt < block.timestamp - 3600) {
      revert NotCurrentValue();
    }

    // Figure out the surplus and make the swap needed to fulfill this distribution

    // Check how much inputTokenA we have already from tokenB
    uint256 tokenHave = inputTokenB.balanceOf(address(this)) * market.oracles[inputTokenB].usdPrice / market.oracles[inputTokenA].usdPrice;
    // If we have more tokenA than we need, swap the surplus to inputTokenB
    if (tokenHave < inputTokenA.balanceOf(address(this))) {
      tokenHave = inputTokenA.balanceOf(address(this)) - tokenHave;
      _swap(inputTokenA, inputTokenB, tokenHave);
      // Otherwise we have more tokenB than we need, swap the surplus to inputTokenA
    } else {
      tokenHave = inputTokenA.balanceOf(address(this)) * market.oracles[inputTokenA].usdPrice / market.oracles[inputTokenB].usdPrice;
      tokenHave = inputTokenB.balanceOf(address(this)) - tokenHave;
      _swap(inputTokenB, inputTokenA, tokenHave);
    }

     // At this point, we've got enough of tokenA and tokenB to perform the distribution
     uint256 tokenAAmount = inputTokenA.balanceOf(address(this));
     uint256 tokenBAmount = inputTokenB.balanceOf(address(this));
     if (tokenAAmount == 0 && tokenBAmount == 0) { return newCtx; }

     // Perform the distributions
     uint256 feeCollected;
     uint256 distAmount;

     (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) =  ida
         .getIndex(
             market.outputPools[OUTPUTA_INDEX].token,
             address(this),
             OUTPUTA_INDEX
         );
     if (tokenAAmount > 0 && _totalUnitsApproved + _totalUnitsPending > 0) {
       (tokenAAmount,) = ida.calculateDistribution(
          inputTokenA,
          address(this),
          OUTPUTA_INDEX,
          tokenAAmount);

        // Distribute TokenA
        require(inputTokenA.balanceOf(address(this)) >= tokenAAmount, "!enough");
        newCtx = _idaDistribute(OUTPUTA_INDEX, uint128(tokenAAmount), inputTokenA, newCtx);
        emit Distribution(distAmount, feeCollected, address(inputTokenA));

        // Distribution Subsidy
        distAmount = (block.timestamp - lastDistributionTokenAAt) * market.outputPools[SUBSIDYA_INDEX].emissionRate;
        if (distAmount < market.outputPools[SUBSIDYA_INDEX].token.balanceOf(address(this))) {
          newCtx = _idaDistribute(SUBSIDYA_INDEX, uint128(distAmount), market.outputPools[SUBSIDYA_INDEX].token, newCtx);
          emit Distribution(distAmount, 0, address(market.outputPools[SUBSIDYA_INDEX].token));
        }
        lastDistributionTokenAAt = block.timestamp;
     }

     (, , _totalUnitsApproved, _totalUnitsPending) =  ida
         .getIndex(
             market.outputPools[OUTPUTB_INDEX].token,
             address(this),
             OUTPUTB_INDEX
         );
     if (tokenBAmount > 0 && _totalUnitsApproved + _totalUnitsPending > 0) {
       (tokenBAmount,) = ida.calculateDistribution(
          inputTokenB,
          address(this),
          OUTPUTB_INDEX,
          tokenBAmount);

        // Distribute TokenB
        require(inputTokenB.balanceOf(address(this)) >= tokenBAmount, "!enough");
        newCtx = _idaDistribute(OUTPUTB_INDEX, uint128(tokenBAmount), inputTokenB, newCtx);
        emit Distribution(distAmount, feeCollected, address(inputTokenB));

        // Distribution Subsidy
        distAmount = (block.timestamp - lastDistributionTokenBAt) * market.outputPools[SUBSIDYB_INDEX].emissionRate;
        if (distAmount < market.outputPools[SUBSIDYB_INDEX].token.balanceOf(address(this))) {
          newCtx = _idaDistribute(SUBSIDYB_INDEX, uint128(distAmount), market.outputPools[SUBSIDYB_INDEX].token, newCtx);
          emit Distribution(distAmount, 0, address(market.outputPools[SUBSIDYB_INDEX].token));
        }
        lastDistributionTokenBAt = block.timestamp;

      }

      market.lastDistributionAt = block.timestamp;

  }

  function beforeAgreementCreated(
      ISuperToken _superToken,
      address _agreementClass,
      bytes32, //_agreementId,
      bytes calldata _agreementData,
      bytes calldata // _ctx
  ) external view virtual override returns (bytes memory _cbdata) {
    // _onlyHost();
    if(_isCFAv1(_agreementClass)) {
      (address shareholder, ) = abi.decode(_agreementData, (address, address));
      (,,uint128 shares,) = getIDAShares(OUTPUTA_INDEX, shareholder);
      require(shares == 0, "streaming");
      (,,shares,) = getIDAShares(OUTPUTB_INDEX, shareholder);
      require(shares == 0, "streaming");
    }
  }

  function beforeAgreementTerminated(
      ISuperToken _superToken,
      address _agreementClass,
      bytes32, //_agreementId,
      bytes calldata _agreementData,
      bytes calldata _ctx
  ) external view virtual override returns (bytes memory _cbdata) {
      _onlyHost();
      if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
          return _ctx;

      (address _shareholder, int96 _flowRateMain, uint256 _timestamp) = _getShareholderInfo(_agreementData, _superToken);

      uint256 _uinvestAmount = _calcUserUninvested(
          _timestamp,
          uint256(uint96(_flowRateMain)),
          // Select the correct lastDistributionAt for this _superToken
          _getLastDistributionAt(_superToken)
      );
      _cbdata = abi.encode(_uinvestAmount, int(_flowRateMain));

  }


  function _swap(
        ISuperToken input,
        ISuperToken output,
        uint256 amount
  ) internal {

   address inputToken;           // The underlying input token address
   address outputToken;          // The underlying output token address
   address[] memory path;        // The path to take
   uint256 minOutput;            // The minimum amount of output tokens based on Tellor
   uint256 outputAmount;         // The balance before the swap

   inputToken = input.getUnderlyingToken();
   outputToken = output.getUnderlyingToken();

   // Downgrade and scale the input amount
   input.downgrade(amount);
   // Scale it to 1e18 for calculations
   amount = ERC20(inputToken).balanceOf(address(this)) * (10 ** (18 - ERC20(inputToken).decimals()));

   minOutput = amount * market.oracles[input].usdPrice / market.oracles[output].usdPrice;
   minOutput = minOutput * (1e6 - market.rateTolerance) / 1e6;

   // Scale back from 1e18 to outputToken decimals
   minOutput = minOutput * (10 ** (ERC20(outputToken).decimals())) / 1e18;
   // Scale it back to inputToken decimals
   amount = amount / (10 ** (18 - ERC20(inputToken).decimals()));

   // Assumes a direct path to swap input/output
   path = new address[](2);
   path[0] = inputToken;
   path[1] = outputToken;

   // Convert the outputToken back to its supertoken version
   if (address(output) == MATICX) {
     router.swapExactTokensForETH(
        amount,
        minOutput,
        path,
        address(this),
        block.timestamp + 3600
     );
     ISETHCustom(address(output)).upgradeByETH{value: address(this).balance}();
   } else {
     router.swapExactTokensForTokens(
        amount,
        minOutput,
        path,
        address(this),
        block.timestamp + 3600
     );
     output.upgrade(ERC20(outputToken).balanceOf(address(this)) * (10 ** (18 - ERC20(outputToken).decimals())));
   }

 }

 function _updateShareholder(
     bytes memory _ctx,
     ShareholderUpdate memory _shareholderUpdate
 ) internal override returns (bytes memory _newCtx) {

     // Check the input supertoken used and figure out the output Index
     // inputTokenA maps the OUTPUTB_INDEX
     // maybe a better way to do this
     uint32 outputIndex;
     uint32 subsidyIndex;
     if (market.outputPoolIndicies[_shareholderUpdate.token] == OUTPUTA_INDEX) {
       outputIndex = OUTPUTB_INDEX;
       subsidyIndex = SUBSIDYB_INDEX;
       _shareholderUpdate.token = inputTokenB;
     } else {
       outputIndex = OUTPUTA_INDEX;
       subsidyIndex = SUBSIDYA_INDEX;
       _shareholderUpdate.token = inputTokenA;
     }

     (uint128 userShares, uint128 daoShares, uint128 affiliateShares) = _getShareAllocations(_shareholderUpdate);

     _newCtx = _ctx;

     // TODO: Update the fee taken by the DAO, Affiliate
     _newCtx = _updateSubscriptionWithContext(
         _newCtx,
         outputIndex,
         _shareholderUpdate.shareholder,
         userShares,
         market.outputPools[outputIndex].token
     );
     _newCtx = _updateSubscriptionWithContext(
         _newCtx,
         subsidyIndex,
         _shareholderUpdate.shareholder,
         userShares,
         subsidyToken
     );
     _newCtx = _updateSubscriptionWithContext(
         _newCtx,
         outputIndex,
         owner(),
         daoShares,
         market.outputPools[outputIndex].token
     );
     // Owner is not added to subsidy pool

     _newCtx = _updateSubscriptionWithContext(
         _newCtx,
         outputIndex,
         referrals.getAffiliateAddress(_shareholderUpdate.shareholder),
         affiliateShares,
         market.outputPools[outputIndex].token
     );
     _newCtx = _updateSubscriptionWithContext(
         _newCtx,
         subsidyIndex,
         referrals.getAffiliateAddress(_shareholderUpdate.shareholder),
         affiliateShares,
         subsidyToken
     );
 }

 function _isInputToken(ISuperToken _superToken)
     internal
     override
     view
     returns (bool)
 {
     return address(_superToken) == address(inputTokenA) || address(_superToken) == address(inputTokenB);
 }

 function _getLastDistributionAt(ISuperToken _token) internal view returns (uint256) {
   return market.outputPoolIndicies[_token] == OUTPUTA_INDEX ? lastDistributionTokenBAt : lastDistributionTokenAAt;
 }

 function _shouldDistribute() internal override returns (bool) {

   // TODO: This section should be checked,
   //       since it only checks one IDA,

   (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
       .getIndex(
           market.outputPools[OUTPUTA_INDEX].token,
           address(this),
           OUTPUTA_INDEX
       );
   if (_totalUnitsApproved + _totalUnitsPending > 0) {
     (, , _totalUnitsApproved, _totalUnitsPending) = ida
         .getIndex(
             market.outputPools[OUTPUTB_INDEX].token,
             address(this),
             OUTPUTB_INDEX
         );
     if (_totalUnitsApproved + _totalUnitsPending > 0) {

       // Check balance and account for just 1 input token
       uint256 _balance = ISuperToken(inputTokenA).balanceOf(
           address(this)
       ) /
           (10 **
               (18 -
                   ERC20(inputTokenA.getUnderlyingToken()).decimals()));

       return _balance > 0;
     }
   }

   return false;

 }

 function _onlyScalable(ISuperToken _superToken, int96 _flowRate) internal override {
   if (market.outputPoolIndicies[_superToken] == OUTPUTA_INDEX) {
     if(uint128(uint(int(_flowRate))) % (market.outputPools[OUTPUTB_INDEX].shareScaler * 1e3) != 0) {
       revert NotScalable();
     }
   } else {
     if(uint128(uint(int(_flowRate))) % (market.outputPools[OUTPUTA_INDEX].shareScaler * 1e3) != 0) {
       revert NotScalable();
     }
   }
 }

 receive() external payable {}

}
