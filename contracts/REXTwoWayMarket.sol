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

      if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
          return _ctx;
      console.log("inside after agreement1");

      _newCtx = _ctx;

      if (_shouldDistribute()) {
          _newCtx = distribute(_newCtx);
      }

      (address _shareholder, int96 _flowRate) = _getShareholderInfo(
          _agreementData, _superToken
      );

      _newCtx = _updateShareholder(_newCtx, _shareholder, _flowRate, _superToken);
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

      _newCtx = _ctx;
      (address _shareholder, int96 _flowRate) = _getShareholderInfo(
          _agreementData, _superToken
      );

      _newCtx = distribute(_newCtx);
      _newCtx = _updateShareholder(_newCtx, _shareholder, _flowRate, _superToken);
  }

  // We need before agreement to get the uninvested amount using the flowRate before update
  function beforeAgreementTerminated(
      ISuperToken _superToken,
      address _agreementClass,
      bytes32, //_agreementId,
      bytes calldata _agreementData,
      bytes calldata // _ctx
  ) external view override returns (bytes memory _cbdata) {
      _onlyHost();
      _onlyExpected(_superToken, _agreementClass);

      (address _shareholder, ) = _getShareholderInfo(_agreementData, _superToken);

      (uint256 _timestamp, int96 _flowRateMain, , ) = cfa.getFlow(
          market.inputToken,
          _shareholder,
          address(this)
      );
      uint256 _uinvestAmount = _calcUserUninvested(
          _timestamp,
          uint256(uint96(_flowRateMain)),
          market.lastDistributionAt
      );
      _cbdata = abi.encode(_uinvestAmount);
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

      _newCtx = _ctx;
      (address _shareholder, ) = _getShareholderInfo(_agreementData, _superToken);
      uint256 _uninvestAmount = abi.decode(_cbdata, (uint256));

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

    // Check how much inputTokenA we want to fill the sale of tokenB
    uint256 tokenWant = inputTokenB.balanceOf(address(this)) * market.oracles[inputTokenB].usdPrice / market.oracles[inputTokenA].usdPrice / 1e6;
    // If we have more tokenA than we need, swap the surplus to inputTokenB
    if (tokenWant < inputTokenA.balanceOf(address(this))) {
      tokenWant = inputTokenA.balanceOf(address(this)) - tokenWant;
      console.log("Surplus to swap inputTokenA", tokenWant);
      console.log("Swapped:", _swap(inputTokenA, inputTokenB, tokenWant, block.timestamp + 3600));
      // Otherwise we have more tokenB than we need, swap the surplus to inputTokenA
    } else {
      tokenWant = inputTokenA.balanceOf(address(this)) * market.oracles[inputTokenA].usdPrice / market.oracles[inputTokenB].usdPrice / 1e6;
      tokenWant = inputTokenB.balanceOf(address(this)) - tokenWant;
      console.log("Surplus to swap inputTokenB", tokenWant);
      console.log("Swapped:", _swap(inputTokenB, inputTokenA, tokenWant, block.timestamp + 3600));
    }

    // At this point, we've got enough of tokenA and tokenB to perform the distribution
     uint256 tokenAAmount = inputTokenA.balanceOf(address(this));
     uint256 tokenBAmount = inputTokenB.balanceOf(address(this));

     console.log("tokenAAmount", tokenAAmount);
     console.log("tokenBAmount", tokenBAmount);


     (tokenAAmount,) = ida.calculateDistribution(
        inputTokenA,
        address(this),
        OUTPUTA_INDEX,
        tokenAAmount);
     console.log("tokenAAmount", tokenAAmount);
     (tokenBAmount,) = ida.calculateDistribution(
        inputTokenB,
        address(this),
        OUTPUTB_INDEX,
        tokenBAmount);

      console.log("tokenAAmount", tokenAAmount);
      console.log("tokenBAmount", tokenBAmount);

      if (tokenAAmount == 0 && tokenBAmount == 0) { return newCtx; }

      // Perform the distribution
      uint256 feeCollected;
      uint256 distAmount;
      if (tokenAAmount > 0) {
        // Distribute TokenA
        (feeCollected, distAmount) = _getFeeAndDist(tokenAAmount, market.outputPools[OUTPUTA_INDEX].feeRate);
        console.log("Distributing tokenA distAmount", distAmount);
        console.log("Distributing tokenA feeCollected", feeCollected);
        require(inputTokenA.balanceOf(address(this)) >= tokenAAmount, "!enough");
        newCtx = _idaDistribute(OUTPUTA_INDEX, uint128(distAmount), inputTokenA, newCtx);
        inputTokenA.transfer(owner(), feeCollected);
        emit Distribution(distAmount, feeCollected, address(inputTokenA));
      }
      if (tokenBAmount > 0) {
        // Distribute TokenB
        (feeCollected, distAmount) = _getFeeAndDist(tokenBAmount, market.outputPools[OUTPUTB_INDEX].feeRate);
        console.log("Distributing tokenB distAmount", distAmount);
        console.log("Distributing tokenB feeCollected", feeCollected);
        require(inputTokenB.balanceOf(address(this)) >= tokenBAmount, "!enough");
        newCtx = _idaDistribute(OUTPUTB_INDEX, uint128(distAmount), inputTokenB, newCtx);
        inputTokenB.transfer(owner(), feeCollected);
        emit Distribution(distAmount, feeCollected, address(inputTokenB));
      }

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
   router.swapExactTokensForTokens(
      amount,
      0, // Accept any amount but fail if we're too far from the oracle price
      path,
      address(this),
      deadline
   );
   // Assumes `amount` was outputToken.balanceOf(address(this))
   outputAmount = ERC20(outputToken).balanceOf(address(this));
   require(outputAmount >= minOutput, "BAD_EXCHANGE_RATE: Try again later");

   // Convert the outputToken back to its supertoken version
   output.upgrade(outputAmount * (10 ** (18 - ERC20(outputToken).decimals())));

   return outputAmount;
 }

 function _updateShareholder(
     bytes memory _ctx,
     address _shareholder,
     int96 _shareholderFlowRate,
     ISuperToken _superToken
 ) internal returns (bytes memory _newCtx) {
   console.log("shareholder", _shareholder);
   console.log("_shareholderFlowRate", uint(int(_shareholderFlowRate)));
   console.log("_superToken", address(_superToken));
     // TODO: We need to make sure this for-loop won't run out of gas, do this we can set a limit on numOutputPools
     // We need to go through all the output tokens and update their IDA shares
     _newCtx = _ctx;
     _newCtx = _updateSubscriptionWithContext(
         _newCtx,
         outputPoolIndices[_superToken],
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

}
