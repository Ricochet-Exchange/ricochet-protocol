// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import './REXMarket.sol';

contract REXTwoWayMarket is REXMarket {
  using SafeERC20 for ERC20;

  ISuperToken inputTokenA;
  ISuperToken inputTokenB;
  uint32 constant OUTPUTA_INDEX = 0;
  uint32 constant OUTPUTB_INDEX = 1;
  IUniswapV2Router02 router;
  mapping(ISuperToken => uint32) outputPoolIndices;

  // REX Two Way Market Contracts
  // - Swaps the accumulated input tokens for output tokens

  constructor(
    address _owner,
    ISuperfluid _host,
    IConstantFlowAgreementV1 _cfa,
    IInstantDistributionAgreementV1 _ida,
    string memory _registrationKey
  ) public REXMarket(_owner, _host, _cfa, _ida, _registrationKey) {

  }

  function initializeTwoWayMarket(
    IUniswapV2Router02 _router,
    ITellor _tellor,
    ISuperToken _inputTokenA,
    uint256 _inputTokenARequestId,
    ISuperToken _inputTokenB,
    uint256 _inputTokenBRequestId,
    uint128 _feeRate,
    uint256 _rateTolerance
  ) public onlyOwner initializer {

    router = _router;
    inputTokenA = _inputTokenA;
    inputTokenB = _inputTokenB;
    market.inputToken = _inputTokenA; // market.inputToken isn't used but is set bc of the REXMarket
    market.rateTolerance = _rateTolerance;
    oracle = _tellor;
    addOutputPool(inputTokenA, _feeRate, 0, _inputTokenARequestId);
    addOutputPool(inputTokenB, _feeRate, 0, _inputTokenBRequestId);
    outputPoolIndices[inputTokenA] = OUTPUTA_INDEX;
    outputPoolIndices[inputTokenB] = OUTPUTB_INDEX;

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

  function afterAgreementCreated(
      ISuperToken _superToken,
      address _agreementClass,
      bytes32, //_agreementId,
      bytes calldata _agreementData,
      bytes calldata, //_cbdata,
      bytes calldata _ctx
  ) external override returns (bytes memory _newCtx) {
      _onlyHost();
      _onlyExpected(_superToken, _agreementClass);

      console.log("afterAgreementCreated");

      if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
          return _ctx;
      console.log("inside after agreement1");

      _newCtx = _ctx;

      if (_shouldDistribute()) {
          _newCtx = distribute(_newCtx);
      }

      (address _shareholder, int96 _flowRate, ) = _getShareholderInfo(
          _agreementData, _superToken
      );

      _newCtx = _updateShareholder(_newCtx, _shareholder, _flowRate, _superToken);
  }

function afterAgreementUpdated(
      ISuperToken _superToken,
      address _agreementClass,
      bytes32, //_agreementId,
      bytes calldata _agreementData,
      bytes calldata, //_cbdata,
      bytes calldata _ctx
  ) external override returns (bytes memory _newCtx) {
      _onlyHost();
      _onlyExpected(_superToken, _agreementClass);

      console.log("afterAgreementUpdated");

      _newCtx = _ctx;

      _newCtx = distribute(_newCtx);

      (address _shareholder, int96 _flowRate, ) = _getShareholderInfo(

          _agreementData, _superToken
      );

      _newCtx = _updateShareholder(_newCtx, _shareholder, _flowRate, _superToken);
  }



  function afterAgreementTerminated(
      ISuperToken _superToken,
      address, //_agreementClass
      bytes32, //_agreementId,
      bytes calldata _agreementData,
      bytes calldata _cbdata, //_cbdata,
      bytes calldata _ctx
  ) external override returns (bytes memory _newCtx) {
      _onlyHost();
      console.log("afterAgreementTerminated");

      _newCtx = _ctx;

      (address _shareholder, ,) = _getShareholderInfo(_agreementData, _superToken);

      uint256 _uninvestAmount = abi.decode(_cbdata, (uint256));

      console.log("Refunding", _uninvestAmount);

      // Refund the unswapped amount back to the person who started the stream
      market.inputToken.transferFrom(
          address(this),
          _shareholder,
          _uninvestAmount
      );

      _newCtx = _updateShareholder(_newCtx, _shareholder, 0, _superToken);
  }

  function distribute(bytes memory ctx) public override returns (bytes memory newCtx) {

    newCtx = ctx;

    require(market.oracles[market.outputPools[OUTPUTA_INDEX].token].lastUpdatedAt >= block.timestamp - 3600, "!currentValueA");
    require(market.oracles[market.outputPools[OUTPUTB_INDEX].token].lastUpdatedAt >= block.timestamp - 3600, "!currentValueB");

    // Figure out the surplus and make the swap needed to fulfill this distribution
    console.log("inputTokenA Balance: ", inputTokenA.balanceOf(address(this)));
    console.log("inputTokenB Balance: ", inputTokenB.balanceOf(address(this)));

    // Check how much inputTokenA we have already from tokenB
    uint256 tokenHave = inputTokenB.balanceOf(address(this)) * market.oracles[inputTokenB].usdPrice / market.oracles[inputTokenA].usdPrice;
    console.log("Initial tokenHave A", tokenHave);
    // If we have more tokenA than we need, swap the surplus to inputTokenB
    if (tokenHave < inputTokenA.balanceOf(address(this))) {
      tokenHave = inputTokenA.balanceOf(address(this)) - tokenHave;
      console.log("Surplus to swap inputTokenA", tokenHave);
      console.log("Swapped:", _swap(inputTokenA, inputTokenB, tokenHave, block.timestamp + 3600));
      // Otherwise we have more tokenB than we need, swap the surplus to inputTokenA
    } else {
      tokenHave = inputTokenA.balanceOf(address(this)) * market.oracles[inputTokenA].usdPrice / market.oracles[inputTokenB].usdPrice;
      console.log("Initial tokenHave B", tokenHave);
      tokenHave = inputTokenB.balanceOf(address(this)) - tokenHave;
      console.log("Surplus to swap inputTokenB", tokenHave);
      console.log("Swapped:", _swap(inputTokenB, inputTokenA, tokenHave, block.timestamp + 3600));
    }

    console.log("inputTokenA Balance: ", inputTokenA.balanceOf(address(this)));
    console.log("inputTokenB Balance: ", inputTokenB.balanceOf(address(this)));

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
        (feeCollected, distAmount) = _getFeeAndDist(tokenAAmount, market.outputPools[OUTPUTA_INDEX].feeRate);
        console.log("Distributing tokenA distAmount", distAmount);
        console.log("Distributing tokenA feeCollected", feeCollected);
        require(inputTokenA.balanceOf(address(this)) >= tokenAAmount, "!enough");
        newCtx = _idaDistribute(OUTPUTA_INDEX, uint128(distAmount), inputTokenA, newCtx);
        inputTokenA.transfer(owner(), feeCollected);
        emit Distribution(distAmount, feeCollected, address(inputTokenA));

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
        (feeCollected, distAmount) = _getFeeAndDist(tokenBAmount, market.outputPools[OUTPUTB_INDEX].feeRate);
        console.log("Distributing tokenB distAmount", distAmount);
        console.log("Distributing tokenB feeCollected", feeCollected);
        require(inputTokenB.balanceOf(address(this)) >= tokenBAmount, "!enough");
        newCtx = _idaDistribute(OUTPUTB_INDEX, uint128(distAmount), inputTokenB, newCtx);
        inputTokenB.transfer(owner(), feeCollected);
        emit Distribution(distAmount, feeCollected, address(inputTokenB));
      }

      market.lastDistributionAt = block.timestamp;

  }

  function _getFeeAndDist(uint256 tokenAmount, uint256 feeRate)
    internal returns (uint256 feeCollected, uint256 distAmount) {

      feeCollected = tokenAmount * feeRate / 1e6;
      distAmount = tokenAmount - feeCollected;
  }

  function _swap(
        ISuperToken input,
        ISuperToken output,
        uint256 amount,
        uint256 deadline
  ) internal returns(uint) {

   address inputToken;           // The underlying input token address
   address outputToken;          // The underlying output token address
   address[] memory path;        // The path to take
   uint256 minOutput;            // The minimum amount of output tokens based on Tellor
   uint256 outputAmount;         // The balance before the swap

   inputToken = input.getUnderlyingToken();
   outputToken = output.getUnderlyingToken();
   console.log("amount", amount);

   // Downgrade and scale the input amount
   input.downgrade(amount);
   // Scale it to 1e18 for calculations
   amount = ERC20(inputToken).balanceOf(address(this)) * (10 ** (18 - ERC20(inputToken).decimals()));
   console.log("amount", amount);

   minOutput = amount * market.oracles[input].usdPrice / market.oracles[output].usdPrice;
   minOutput = minOutput * (1e6 - market.rateTolerance) / 1e6;

   // Scale back from 1e18 to outputToken decimals
   minOutput = minOutput * (10 ** (ERC20(outputToken).decimals())) / 1e18;
   // Scale it back to inputToken decimals
   amount = amount / (10 ** (18 - ERC20(inputToken).decimals()));

   console.log("amount", amount);

   // Assumes a direct path to swap input/output
   path = new address[](2);
   path[0] = inputToken;
   path[1] = outputToken;
   router.swapExactTokensForTokens(
      amount,
      0, // Accept any amount but fail if we're too far from the oracle price
      path,
      address(this),
      deadline
   );
   // Assumes `amount` was outputToken.balanceOf(address(this))
   console.log("minOutput", minOutput);
   outputAmount = ERC20(outputToken).balanceOf(address(this));
   console.log("outputAmount", outputAmount);
   require(outputAmount >= minOutput, "BAD_EXCHANGE_RATE: Try again later");

   // Convert the outputToken back to its supertoken version
   output.upgrade(ERC20(outputToken).balanceOf(address(this)) * (10 ** (18 - ERC20(outputToken).decimals())));

   return outputAmount;
 }

 function _updateShareholder(
     bytes memory _ctx,
     address _shareholder,
     int96 _shareholderFlowRate,
     ISuperToken _superToken
 ) internal returns (bytes memory _newCtx) {

     // Check the input supertoken used and figure out the output Index
     // inputTokenA maps the OUTPUTB_INDEX
     // maybe a better way to do this
     uint32 outputIndex;
     if (outputPoolIndices[_superToken] == OUTPUTA_INDEX) {
       outputIndex = OUTPUTB_INDEX;
       _superToken = inputTokenB;
     } else {
       outputIndex = OUTPUTA_INDEX;
       _superToken = inputTokenA;
     }

     _newCtx = _ctx;
     _newCtx = _updateSubscriptionWithContext(
         _newCtx,
         outputIndex,
         _shareholder,
         uint128(uint256(int256(_shareholderFlowRate))),
         _superToken
     );
         // TODO: Update the fee taken by the DAO
 }

 function _isInputToken(ISuperToken _superToken)
     internal
     override
     view
     returns (bool)
 {
     return address(_superToken) == address(inputTokenA) || address(_superToken) == address(inputTokenB);
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



}
