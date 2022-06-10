// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import {ISuperfluid, ISuperToken, ISuperApp, ISuperAgreement, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {IInstantDistributionAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./tellor/ITellor.sol";
import "./referral/IREXReferral.sol";
import "hardhat/console.sol";

import "./ISETHCustom.sol";

contract REXTwoWayMarket is Ownable, SuperAppBase, Initializable {
    using SafeERC20 for ERC20;

    struct ShareholderUpdate {
      address shareholder;
      int96 previousFlowRate;
      int96 currentFlowRate;
      ISuperToken token;
    }

    struct OracleInfo {
        uint256 requestId;
        uint256 usdPrice;
        uint256 lastUpdatedAt;
    }

    struct OutputPool {
        ISuperToken token;
        uint128 feeRate; // Fee taken by the DAO on each output distribution
        uint256 emissionRate; // Rate to emit tokens if there's a balance, used for subsidies
        uint128 shareScaler;  // The amount to scale back IDA shares of this output pool
    }

    struct Market {
        ISuperToken inputToken;
        uint256 lastDistributionAt; // The last time a distribution was made
        uint256 rateTolerance; // The percentage to deviate from the oracle scaled to 1e6
        uint128 feeRate;
        uint128 affiliateFee;
        address owner; // The owner of the market (reciever of fees)
        mapping(ISuperToken => OracleInfo) oracles; // Maps tokens to their oracle info
        mapping(uint32 => OutputPool) outputPools; // Maps IDA indexes to their distributed Supertokens
        mapping(ISuperToken => uint32) outputPoolIndicies; // Maps tokens to their IDA indexes in OutputPools
        uint8 numOutputPools; // Indexes outputPools and outputPoolFees
    }

    ISuperfluid internal host; // Superfluid host contract
    IConstantFlowAgreementV1 internal cfa; // The stored constant flow agreement class address
    IInstantDistributionAgreementV1 internal ida; // The stored instant dist. agreement class address
    ITellor public oracle; // Address of deployed simple oracle for input//output token
    Market internal market;
    uint32 internal constant PRIMARY_OUTPUT_INDEX = 0;
    uint8 internal constant MAX_OUTPUT_POOLS = 5;
    IREXReferral internal referrals;

    ISuperToken inputTokenA;
    ISuperToken inputTokenB;
    uint32 constant OUTPUTA_INDEX = 0;
    uint32 constant OUTPUTB_INDEX = 1;
    uint32 constant SUBSIDYA_INDEX = 2;
    uint32 constant SUBSIDYB_INDEX = 3;
    uint256 lastDistributionTokenAAt;
    uint256 lastDistributionTokenBAt;
    address public constant MATICX = 0x3aD736904E9e65189c3000c7DD2c8AC8bB7cD4e3;
    ISuperToken subsidyToken;
    IUniswapV2Router02 router =
        IUniswapV2Router02(0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506);
    ITellor tellor = ITellor(0xACC2d27400029904919ea54fFc0b18Bf07C57875);

    // TODO: Emit these events where appropriate
    /// @dev Distribution event. Emitted on each token distribution operation.
    /// @param totalAmount is total distributed amount
    /// @param feeCollected is fee amount collected during distribution
    /// @param token is distributed token address
    event Distribution(
        uint256 totalAmount,
        uint256 feeCollected,
        address token
    );

    // REX Two Way Market Contracts
    // - Swaps the accumulated input tokens for output tokens

    constructor(
        address _owner,
        ISuperfluid _host,
        IConstantFlowAgreementV1 _cfa,
        IInstantDistributionAgreementV1 _ida,
        string memory _registrationKey,
        IREXReferral _rexReferral
    )
    {
        host = _host;
        cfa = _cfa;
        ida = _ida;
        referrals = _rexReferral;

        transferOwnership(_owner);

        uint256 _configWord = SuperAppDefinitions.APP_LEVEL_FINAL;

        if (bytes(_registrationKey).length > 0) {
            host.registerAppWithKey(_configWord, _registrationKey);
        } else {
            host.registerApp(_configWord);
        }
    }

    function initializeTwoWayMarket(
        ISuperToken _inputTokenA,
        uint256 _inputTokenARequestId,
        uint128 _inputTokenAShareScaler,
        ISuperToken _inputTokenB,
        uint256 _inputTokenBRequestId,
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
        market.affiliateFee = 500000;
        require(
            _inputTokenAShareScaler >= 1e6 && _inputTokenBShareScaler >= 1e6,
            "!scaleable"
        );
        addOutputPool(
            inputTokenA,
            _feeRate,
            0,
            _inputTokenARequestId,
            _inputTokenAShareScaler
        );
        addOutputPool(
            inputTokenB,
            _feeRate,
            0,
            _inputTokenBRequestId,
            _inputTokenBShareScaler
        );
        market.outputPoolIndicies[inputTokenA] = OUTPUTA_INDEX;
        market.outputPoolIndicies[inputTokenB] = OUTPUTB_INDEX;

        // Approvals for sushiswap and upgrading tokens
        address inputTokenAUnderlying = address(
            inputTokenA.getUnderlyingToken()
        );
        address inputTokenBUnderlying = address(
            inputTokenB.getUnderlyingToken()
        );

        if (inputTokenAUnderlying == address(0)) {
            // inputTokenA is supertoken, approve swap router for it
            inputTokenAUnderlying = address(inputTokenA);
        } else {
            // otherwise approve underlying for upgrade
            ERC20(inputTokenAUnderlying).safeIncreaseAllowance(
                address(inputTokenA),
                2**256 - 1
            );
        }

        if (inputTokenBUnderlying == address(0)) {
            // inputTokenB is supertoken, approve swap router for it
            inputTokenBUnderlying = address(inputTokenB);
        } else {
            // otherwise approve underlying for upgrade
            ERC20(inputTokenBUnderlying).safeIncreaseAllowance(
                address(inputTokenB),
                2**256 - 1
            );
        }

        ERC20(inputTokenAUnderlying).safeIncreaseAllowance(
            address(router),
            2**256 - 1
        );
        ERC20(inputTokenBUnderlying).safeIncreaseAllowance(
            address(router),
            2**256 - 1
        );

        market.lastDistributionAt = block.timestamp;
    }

    function initializeSubsidies(
        uint256 _emissionRate,
        ISuperToken _subsidyToken
    ) public onlyOwner {
        subsidyToken = _subsidyToken;
        require(
            address(market.outputPools[SUBSIDYA_INDEX].token) == address(0) &&
                address(market.outputPools[SUBSIDYB_INDEX].token) == address(0),
            "already initialized"
        );
        addOutputPool(
            _subsidyToken,
            0,
            _emissionRate,
            77,
            market.outputPools[OUTPUTB_INDEX].shareScaler
        );
        addOutputPool(
            _subsidyToken,
            0,
            _emissionRate,
            77,
            market.outputPools[OUTPUTA_INDEX].shareScaler
        );
        lastDistributionTokenAAt = block.timestamp;
        lastDistributionTokenBAt = block.timestamp;
        // Does not need to add subsidy token to outputPoolIndicies
        // since these pools are hardcoded
    }

    function addOutputPool(
        ISuperToken _token,
        uint128 _feeRate,
        uint256 _emissionRate,
        uint256 _requestId,
        uint128 _shareScaler
    ) public onlyOwner {
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
        OracleInfo memory _newOracle = OracleInfo(_requestId, 0, 0);
        market.oracles[_token] = _newOracle;
        updateTokenPrice(_token);
    }

    function distribute(bytes memory ctx)
        public
        returns (bytes memory newCtx)
    {
        newCtx = ctx;

        require(
            market
                .oracles[market.outputPools[OUTPUTA_INDEX].token]
                .lastUpdatedAt >= block.timestamp - 3600,
            "!currentValueA"
        );
        require(
            market
                .oracles[market.outputPools[OUTPUTB_INDEX].token]
                .lastUpdatedAt >= block.timestamp - 3600,
            "!currentValueB"
        );

        // At this point, we've got enough of tokenA and tokenB to perform the distribution
        uint256 tokenAAmount = inputTokenA.balanceOf(address(this));
        uint256 tokenBAmount = inputTokenB.balanceOf(address(this));

        // Check how much inputTokenA we have already from tokenB
        uint256 tokenHave = (tokenBAmount *
            market.oracles[inputTokenB].usdPrice) /
            market.oracles[inputTokenA].usdPrice;
        // If we have more tokenA than we need, swap the surplus to inputTokenB
        if (tokenHave < tokenAAmount) {
            tokenHave = tokenAAmount - tokenHave;
            _swap(inputTokenA, inputTokenB, tokenHave, block.timestamp + 3600);
            // Otherwise we have more tokenB than we need, swap the surplus to inputTokenA
        } else {
            tokenHave =
                (tokenAAmount * market.oracles[inputTokenA].usdPrice) /
                market.oracles[inputTokenB].usdPrice;
            tokenHave = tokenBAmount - tokenHave;
            _swap(inputTokenB, inputTokenA, tokenHave, block.timestamp + 3600);
        }

        // At this point, we've got enough of tokenA and tokenB to perform the distribution
        tokenAAmount = inputTokenA.balanceOf(address(this));
        tokenBAmount = inputTokenB.balanceOf(address(this));

        if (tokenAAmount == 0 && tokenBAmount == 0) {
            return newCtx;
        }

        // Perform the distributions
        uint256 feeCollected;
        uint256 distAmount;

        (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
            .getIndex(
                market.outputPools[OUTPUTA_INDEX].token,
                address(this),
                OUTPUTA_INDEX
            );
        if (tokenAAmount > 0 && _totalUnitsApproved + _totalUnitsPending > 0) {
            (tokenAAmount, ) = ida.calculateDistribution(
                inputTokenA,
                address(this),
                OUTPUTA_INDEX,
                tokenAAmount
            );

            // Distribute TokenA
            require(
                inputTokenA.balanceOf(address(this)) >= tokenAAmount,
                "!enough"
            );
            newCtx = _idaDistribute(
                OUTPUTA_INDEX,
                uint128(tokenAAmount),
                inputTokenA,
                newCtx
            );
            emit Distribution(distAmount, feeCollected, address(inputTokenA));

            // Distribution Subsidy
            distAmount =
                (block.timestamp - lastDistributionTokenAAt) *
                market.outputPools[SUBSIDYA_INDEX].emissionRate;
            if (
                distAmount <
                market.outputPools[SUBSIDYA_INDEX].token.balanceOf(
                    address(this)
                )
            ) {
                newCtx = _idaDistribute(
                    SUBSIDYA_INDEX,
                    uint128(distAmount),
                    market.outputPools[SUBSIDYA_INDEX].token,
                    newCtx
                );
                emit Distribution(
                    distAmount,
                    0,
                    address(market.outputPools[SUBSIDYA_INDEX].token)
                );
            }
            lastDistributionTokenAAt = block.timestamp;
        }

        (, , _totalUnitsApproved, _totalUnitsPending) = ida.getIndex(
            market.outputPools[OUTPUTB_INDEX].token,
            address(this),
            OUTPUTB_INDEX
        );
        if (tokenBAmount > 0 && _totalUnitsApproved + _totalUnitsPending > 0) {
            (tokenBAmount, ) = ida.calculateDistribution(
                inputTokenB,
                address(this),
                OUTPUTB_INDEX,
                tokenBAmount
            );

            // Distribute TokenB
            require(
                inputTokenB.balanceOf(address(this)) >= tokenBAmount,
                "!enough"
            );
            newCtx = _idaDistribute(
                OUTPUTB_INDEX,
                uint128(tokenBAmount),
                inputTokenB,
                newCtx
            );
            emit Distribution(distAmount, feeCollected, address(inputTokenB));

            // Distribution Subsidy
            distAmount =
                (block.timestamp - lastDistributionTokenBAt) *
                market.outputPools[SUBSIDYB_INDEX].emissionRate;
            if (
                distAmount <
                market.outputPools[SUBSIDYB_INDEX].token.balanceOf(
                    address(this)
                )
            ) {
                newCtx = _idaDistribute(
                    SUBSIDYB_INDEX,
                    uint128(distAmount),
                    market.outputPools[SUBSIDYB_INDEX].token,
                    newCtx
                );
                emit Distribution(
                    distAmount,
                    0,
                    address(market.outputPools[SUBSIDYB_INDEX].token)
                );
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
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;
        (address shareholder, ) = abi.decode(
            _agreementData,
            (address, address)
        );
        (, , uint128 shares, ) = getIDAShares(OUTPUTA_INDEX, shareholder);
        require(shares == 0, "Already streaming");
        (, , shares, ) = getIDAShares(OUTPUTB_INDEX, shareholder);
        require(shares == 0, "Already streaming");
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

        (
            address _shareholder,
            int96 _flowRateMain,
            uint256 _timestamp
        ) = _getShareholderInfo(_agreementData, _superToken);

        uint256 _uinvestAmount = _calcUserUninvested(
            _timestamp,
            uint256(uint96(_flowRateMain)),
            // Select the correct lastDistributionAt for this _superToken
            _getLastDistributionAt(_superToken)
        );
        _cbdata = abi.encode(_uinvestAmount, int256(_flowRateMain));
    }

    function _swap(
        ISuperToken input,
        ISuperToken output,
        uint256 amount,
        uint256 deadline
    ) internal returns (uint256) {
        address inputToken; // The underlying input token address
        address outputToken; // The underlying output token address
        address[] memory path; // The path to take
        uint256 minOutput; // The minimum amount of output tokens based on Tellor
        uint256 outputAmount; // The balance before the swap

        inputToken = input.getUnderlyingToken();
        outputToken = output.getUnderlyingToken();

        // Downgrade and scale the input amount
        // Handle case input or output is native supertoken
        if (inputToken == address(0)) {
            inputToken = address(input);
        } else {
            input.downgrade(amount);
            // Scale it to 1e18 for calculations
            amount =
                ERC20(inputToken).balanceOf(address(this)) *
                (10**(18 - ERC20(inputToken).decimals()));
        }

        if (outputToken == address(0)) {
            outputToken = address(output);
        }

        minOutput =
            (amount * market.oracles[input].usdPrice) /
            market.oracles[output].usdPrice;
        minOutput = (minOutput * (1e6 - market.rateTolerance)) / 1e6;

        // Scale back from 1e18 to outputToken decimals
        minOutput = (minOutput * (10**(ERC20(outputToken).decimals()))) / 1e18;
        // Scale it back to inputToken decimals
        amount = amount / (10**(18 - ERC20(inputToken).decimals()));

        // Assumes a direct path to swap input/output
        path = new address[](2);
        path[0] = inputToken;
        path[1] = outputToken;

        if (address(output) == MATICX) {
          router.swapExactTokensForETH(
             amount,
             0,
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
          if (address(output) != outputToken) {
              output.upgrade(
                  ERC20(outputToken).balanceOf(address(this)) *
                      (10**(18 - ERC20(outputToken).decimals()))
              );
          }
        }

        // Assumes `amount` was outputToken.balanceOf(address(this))
        outputAmount = ERC20(outputToken).balanceOf(address(this));

        return outputAmount;
    }

    function _updateShareholder(
        bytes memory _ctx,
        ShareholderUpdate memory _shareholderUpdate
    ) internal returns (bytes memory _newCtx) {
        // Check the input supertoken used and figure out the output Index
        // inputTokenA maps the OUTPUTB_INDEX
        // maybe a better way to do this
        uint32 outputIndex;
        uint32 subsidyIndex;
        if (
            market.outputPoolIndicies[_shareholderUpdate.token] == OUTPUTA_INDEX
        ) {
            outputIndex = OUTPUTB_INDEX;
            subsidyIndex = SUBSIDYB_INDEX;
            _shareholderUpdate.token = inputTokenB;
        } else {
            outputIndex = OUTPUTA_INDEX;
            subsidyIndex = SUBSIDYA_INDEX;
            _shareholderUpdate.token = inputTokenA;
        }

        (
            uint128 userShares,
            uint128 daoShares,
            uint128 affiliateShares
        ) = _getShareAllocations(_shareholderUpdate);

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

        address affiliate = referrals.getAffiliateAddress(
            _shareholderUpdate.shareholder
        );
        if (affiliate != address(0)) {
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                outputIndex,
                affiliate,
                affiliateShares,
                market.outputPools[outputIndex].token
            );
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                subsidyIndex,
                affiliate,
                affiliateShares,
                subsidyToken
            );
        }
    }

    function _isInputToken(ISuperToken _superToken)
        internal
        view
        returns (bool)
    {
        return
            address(_superToken) == address(inputTokenA) ||
            address(_superToken) == address(inputTokenB);
    }

    function _getLastDistributionAt(ISuperToken _token)
        internal
        view
        returns (uint256)
    {
        return
            market.outputPoolIndicies[_token] == OUTPUTA_INDEX
                ? lastDistributionTokenBAt
                : lastDistributionTokenAAt;
    }

    function _shouldDistribute() internal returns (bool) {
        // TODO: This section should be checked,
        //       since it only checks one IDA,
        (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
            .getIndex(
                market.outputPools[OUTPUTA_INDEX].token,
                address(this),
                OUTPUTA_INDEX
            );
        if (_totalUnitsApproved + _totalUnitsPending > 0) {
            (, , _totalUnitsApproved, _totalUnitsPending) = ida.getIndex(
                market.outputPools[OUTPUTB_INDEX].token,
                address(this),
                OUTPUTB_INDEX
            );
            if (_totalUnitsApproved + _totalUnitsPending > 0) {
                return true;
            }
        }

        return false;
    }

    function _onlyScalable(ISuperToken _superToken, int96 _flowRate)
        internal
    {
        if (market.outputPoolIndicies[_superToken] == OUTPUTA_INDEX) {
            require(
                uint128(uint256(int256(_flowRate))) %
                    (market.outputPools[OUTPUTB_INDEX].shareScaler * 1e3) ==
                    0,
                "notScalable"
            );
        } else {
            require(
                uint128(uint256(int256(_flowRate))) %
                    (market.outputPools[OUTPUTA_INDEX].shareScaler * 1e3) ==
                    0,
                "notScalable"
            );
        }
    }

    receive() external payable {}

//================================================================================================
    function _createIndex(uint256 index, ISuperToken distToken) internal {
        host.callAgreement(
            ida,
            abi.encodeWithSelector(
                ida.createIndex.selector,
                distToken,
                index,
                new bytes(0) // placeholder ctx
            ),
            new bytes(0) // user data
        );
    }

    function updateTokenPrices() public {
      updateTokenPrice(market.inputToken);
      for (uint32 index = 0; index < market.numOutputPools; index++) {
          updateTokenPrice(market.outputPools[index].token);
      }
    }

    function updateTokenPrice(ISuperToken _token) public {
        (
            bool _ifRetrieve,
            uint256 _value,
            uint256 _timestampRetrieved
        ) = getCurrentValue(market.oracles[_token].requestId);

        require(_ifRetrieve, "!getCurrentValue");
        require(_timestampRetrieved >= block.timestamp - 3600, "!currentValue");

        market.oracles[_token].usdPrice = _value;
        market.oracles[_token].lastUpdatedAt = _timestampRetrieved;
    }

    function getCurrentValue(uint256 _requestId)
        public
        view
        returns (
            bool _ifRetrieve,
            uint256 _value,
            uint256 _timestampRetrieved
        )
    {
        uint256 _count = oracle.getNewValueCountbyRequestId(_requestId);
        _timestampRetrieved = oracle.getTimestampbyRequestIDandIndex(
            _requestId,
            _count - 1
        );
        _value = oracle.retrieveData(_requestId, _timestampRetrieved);

        if (_value > 0) return (true, _value, _timestampRetrieved);
        return (false, 0, _timestampRetrieved);
    }

    /// @dev Distributes `_distAmount` amount of `_distToken` token among all IDA index subscribers
    /// @param _index IDA index ID
    /// @param _distAmount amount to distribute
    /// @param _distToken distribute token address
    /// @param _ctx SuperFluid context data
    /// @return _newCtx updated SuperFluid context data
    function _idaDistribute(
        uint32 _index,
        uint128 _distAmount,
        ISuperToken _distToken,
        bytes memory _ctx
    ) internal returns (bytes memory _newCtx) {
        _newCtx = _ctx;
        if (_newCtx.length == 0) {
            // No context provided
            host.callAgreement(
                ida,
                abi.encodeWithSelector(
                    ida.distribute.selector,
                    _distToken,
                    _index,
                    _distAmount,
                    new bytes(0) // placeholder ctx
                ),
                new bytes(0) // user data
            );
        } else {
            (_newCtx, ) = host.callAgreementWithContext(
                ida,
                abi.encodeWithSelector(
                    ida.distribute.selector,
                    _distToken,
                    _index,
                    _distAmount,
                    new bytes(0) // placeholder ctx
                ),
                new bytes(0), // user data
                _newCtx
            );
        }
    }

    function _isOutputToken(ISuperToken _superToken)
        internal
        view
        returns (bool)
    {
        return market.outputPools[market.outputPoolIndicies[_superToken]].token == _superToken;
    }

    function _isCFAv1(address _agreementClass) internal view returns (bool) {
        return
            ISuperAgreement(_agreementClass).agreementType() ==
            keccak256(
                "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
            );
    }

    function _isIDAv1(address _agreementClass) internal view returns (bool) {
        return
            ISuperAgreement(_agreementClass).agreementType() ==
            keccak256(
                "org.superfluid-finance.agreements.InstantDistributionAgreement.v1"
            );
    }

    /// @dev Restricts calls to only from SuperFluid host
    function _onlyHost() internal view {
        require(msg.sender == address(host), "!host");
    }

    /// @dev Get `_streamer` IDA subscription info for token with index `_index`
    /// @param _index is token index in IDA
    /// @param _streamer is streamer address
    /// @return _exist Does the subscription exist?
    /// @return _approved Is the subscription approved?
    /// @return _units Units of the suscription.
    /// @return _pendingDistribution Pending amount of tokens to be distributed for unapproved subscription.
    function getIDAShares(uint32 _index, address _streamer)
        public
        view
        returns (
            bool _exist,
            bool _approved,
            uint128 _units,
            uint256 _pendingDistribution
        )
    {
        (_exist, _approved, _units, _pendingDistribution) = ida.getSubscription(
            market.outputPools[_index].token,
            address(this),
            _index,
            _streamer
        );
    }

    function _getShareAllocations(ShareholderUpdate memory _shareholderUpdate)
     internal returns (uint128 userShares, uint128 daoShares, uint128 affiliateShares)
    {
      (,,daoShares,) = getIDAShares(market.outputPoolIndicies[_shareholderUpdate.token], owner());
      daoShares *= market.outputPools[market.outputPoolIndicies[_shareholderUpdate.token]].shareScaler;

      address affiliateAddress = referrals.getAffiliateAddress(_shareholderUpdate.shareholder);
      if (address(0) != affiliateAddress) {
        (,,affiliateShares,) = getIDAShares(market.outputPoolIndicies[_shareholderUpdate.token], affiliateAddress);
        affiliateShares *= market.outputPools[market.outputPoolIndicies[_shareholderUpdate.token]].shareScaler;
      }

      // Compute the change in flow rate, will be negative is slowing the flow rate
      int96 changeInFlowRate = _shareholderUpdate.currentFlowRate - _shareholderUpdate.previousFlowRate;
      uint128 feeShares;
      // if the change is positive value then DAO has some new shares,
      // which would be 2% of the increase in shares
      if(changeInFlowRate > 0) {
        // Add new shares to the DAO
        feeShares = uint128(uint256(int256(changeInFlowRate)) * market.feeRate / 1e6);
        if (address(0) != affiliateAddress) {
          affiliateShares += feeShares * market.affiliateFee / 1e6;
          feeShares -= feeShares * market.affiliateFee / 1e6;
        }
        daoShares += feeShares;
      } else {
        // Make the rate positive
        changeInFlowRate = -1 * changeInFlowRate;
        feeShares = uint128(uint256(int256(changeInFlowRate)) * market.feeRate / 1e6);
        if (address(0) != affiliateAddress) {
          affiliateShares -= (feeShares * market.affiliateFee / 1e6 > affiliateShares) ? affiliateShares : feeShares * market.affiliateFee / 1e6;
          feeShares -= feeShares * market.affiliateFee / 1e6;
        }
        daoShares -= (feeShares > daoShares) ? daoShares : feeShares;
      }
      userShares = uint128(uint256(int256(_shareholderUpdate.currentFlowRate))) * (1e6 - market.feeRate) / 1e6;

      // Scale back shares
      affiliateShares /= market.outputPools[market.outputPoolIndicies[_shareholderUpdate.token]].shareScaler;
      daoShares /= market.outputPools[market.outputPoolIndicies[_shareholderUpdate.token]].shareScaler;
      userShares /= market.outputPools[market.outputPoolIndicies[_shareholderUpdate.token]].shareScaler;

    }

    /// @dev Same as _updateSubscription but uses provided SuperFluid context data
    /// @param ctx SuperFluid context data
    /// @param index IDA index ID
    /// @param subscriber is subscriber address
    /// @param shares is distribution shares count
    /// @param distToken is distribution token address
    /// @return newCtx updated SuperFluid context data
    function _updateSubscriptionWithContext(
        bytes memory ctx,
        uint256 index,
        address subscriber,
        uint128 shares,
        ISuperToken distToken
    ) internal returns (bytes memory newCtx) {
        newCtx = ctx;
        (newCtx, ) = host.callAgreementWithContext(
            ida,
            abi.encodeWithSelector(
                ida.updateSubscription.selector,
                distToken,
                index,
                subscriber,
                shares,
                new bytes(0)
            ),
            new bytes(0), // user data
            newCtx
        );
    }

    // internal helper function to get the amount that needs to be returned back to the user
    function _calcUserUninvested(
        uint256 _prevUpdateTimestamp,
        uint256 _flowRate,
        uint256 _lastDistributedAt
    ) internal view returns (uint256 _uninvestedAmount) {
        _uninvestedAmount =
            _flowRate *
            (block.timestamp -
                (
                    (_prevUpdateTimestamp > _lastDistributedAt)
                        ? _prevUpdateTimestamp
                        : _lastDistributedAt
                ));
    }

    function _getShareholderInfo(bytes calldata _agreementData, ISuperToken _superToken)
        internal
        view
        returns (address _shareholder, int96 _flowRate, uint256 _timestamp)
    {
        (_shareholder, ) = abi.decode(_agreementData, (address, address));
        (_timestamp, _flowRate, , ) = cfa.getFlow(
            _superToken,
            _shareholder,
            address(this)
        );
    }
}
