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
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "./tellor/ITellor.sol";
import "./referral/IREXReferral.sol";
import "hardhat/console.sol";


// solhint-disable not-rely-on-time
abstract contract REXMarket is Ownable, SuperAppBase, Initializable {
    // REX Market Base Contract
    //
    // Responsibilities:
    // - Reusable superfluid functionality
    // - Oracle management functionality
    // - IDA pool share management functionality
    //
    // Deployment Sequence:
    // - Construct the contract with the Superfluid and owner info
    // - Initialize the input token and props (initializeMarket)
    // - Add first output pool which is the main output token sent (addOutputPool)
    // - Add second output pool which is the subsidy token send (addOutputPool)
    //
    // Extending REX Markets:
    // - Contract should be extended and the extending contract should override:
    //   - distribute() - must take accumulated input tokens, convert to
    //                    output tokens and distribute to output pool
    //   - harvest() - (optional) must harvest yield, aggregate it such so that
    //                 the distrute method can distribute it

    struct ShareholderUpdate {
      address shareholder;
      address affiliate;
      int96 previousFlowRate;
      int96 currentFlowRate;
      ISuperToken token;
    }

    struct OracleInfo {
        address pool;
        address inputToken;
        address outputToken;
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
    IUniswapV3Factory public uniswapFactory; // Address of deployed uniswap factory
    Market internal market;
    uint32 internal constant PRIMARY_OUTPUT_INDEX = 0;
    uint8 internal constant MAX_OUTPUT_POOLS = 5;
    IREXReferral internal referrals;

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

    constructor(
        address _owner,
        ISuperfluid _host,
        IConstantFlowAgreementV1 _cfa,
        IInstantDistributionAgreementV1 _ida,
        string memory _registrationKey,
        IREXReferral _rexReferral
    ) {
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

    /// @dev Allows anyone to close any stream if the app is jailed.
    /// @param streamer is stream source (streamer) address
    function emergencyCloseStream(address streamer, ISuperToken token) external virtual {
        // Allows anyone to close any stream if the app is jailed
        require(host.isAppJailed(ISuperApp(address(this))), "!jailed");

        host.callAgreement(
            cfa,
            abi.encodeWithSelector(
                cfa.deleteFlow.selector,
                token,
                streamer,
                address(this),
                new bytes(0) // placeholder
            ),
            "0x"
        );
    }

    /// @dev Close stream from `streamer` address if balance is less than 8 hours of streaming
    /// @param streamer is stream source (streamer) address
    function closeStream(address streamer, ISuperToken token) public {
      // Only closable iff their balance is less than 8 hours of streaming
      (,int96 streamerFlowRate,,) = cfa.getFlow(token, streamer, address(this));
      // int96 streamerFlowRate = getStreamRate(token, streamer);
      require(int(token.balanceOf(streamer)) <= streamerFlowRate * 8 hours,
                "!closable");

      // Close the streamers stream
      // Does this trigger before/afterAgreementTerminated
      host.callAgreement(
          cfa,
          abi.encodeWithSelector(
              cfa.deleteFlow.selector,
              token,
              streamer,
              address(this),
              new bytes(0) // placeholder
          ),
          "0x"
      );
    }

    /// @dev Drain contract's input and output tokens balance to owner if SuperApp dont have any input streams.
    function emergencyDrain(ISuperToken token) external virtual onlyOwner {
        require(host.isAppJailed(ISuperApp(address(this))), "!jailed");

        token.transfer(
            owner(),
            token.balanceOf(address(this))
        );
    }



    /// @dev Set rate tolerance
    /// @param _rate This is the new rate we need to set to
    function setRateTolerance(uint256 _rate) external onlyOwner {
        market.rateTolerance = _rate;
    }

    /// @dev Sets fee rate for a output pool/token
    /// @param _index IDA index for the output pool/token
    /// @param _feeRate Fee rate for the output pool/token
    function setFeeRate(uint32 _index, uint128 _feeRate) external onlyOwner {
        market.outputPools[_index].feeRate = _feeRate;
    }

    /// @dev Sets emission rate for a output pool/token
    /// @param _index IDA index for the output pool/token
    /// @param _emissionRate Emission rate for the output pool/token
    function setEmissionRate(uint32 _index, uint128 _emissionRate)
        external
        onlyOwner
    {
        market.outputPools[_index].emissionRate = _emissionRate;
    }

    // Getters

    /// @dev Get input token address
    /// @return input token address
    function getInputToken() external view returns (ISuperToken) {
        return market.inputToken;
    }

    /// @dev Get output token address
    /// @return output token address
    function getOutputPool(uint32 _index)
        external
        view
        returns (OutputPool memory)
    {
        return market.outputPools[_index];
    }

    /// @dev Get output token address
    /// @return output token address
    function getOracleInfo(ISuperToken token)
        external
        view
        returns (OracleInfo memory)
    {
        return market.oracles[token];
    }

    /// @dev Get last distribution timestamp
    /// @return last distribution timestamp
    function getLastDistributionAt() external view returns (uint256) {
        return market.lastDistributionAt;
    }

    /// @dev Is app jailed in SuperFluid protocol
    /// @return is app jailed in SuperFluid protocol
    function isAppJailed() external view returns (bool) {
        return host.isAppJailed(this);
    }

    /// @dev Get rate tolerance
    /// @return Rate tolerance scaled to 1e6
    function getRateTolerance() external view returns (uint256) {
        return market.rateTolerance;
    }

    /// @dev Get fee rate for a given output pool/token
    /// @param _index IDA index for the output pool/token
    /// @return Fee rate for the output pool
    function getFeeRate(uint32 _index) external view returns (uint128) {
        return market.outputPools[_index].feeRate;
    }

    /// @dev Get emission rate for a given output pool/token
    /// @param _index IDA index for the output pool/token
    /// @return Emission rate for the output pool
    function getEmissionRate(uint32 _index) external view returns (uint256) {
        return market.outputPools[_index].emissionRate;
    }

    // Custom functionality that needs to be overrided by contract extending the base

    // Converts input token to output token
    function distribute(bytes memory _ctx)
        public
        virtual
        returns (bytes memory _newCtx);

    // Market initialization methods

    function initializeMarket(
        ISuperToken _inputToken,
        uint256 _rateTolerance,
        ITellor _tellor,
        address _uniswapPool,
        address _uniswapInputToken,
        address _uniswapOutputToken,
        uint128 _affiliateFee,
        uint128 _feeRate
    ) public virtual onlyOwner {
        require(
            address(market.inputToken) == address(0),
            "Already initialized"
        );
        market.inputToken = _inputToken;
        market.rateTolerance = _rateTolerance;
        market.affiliateFee = _affiliateFee;
        market. feeRate = _feeRate;
        oracle = _tellor;
        OracleInfo memory _newOracle = OracleInfo(_uniswapPool, _uniswapInputToken, _uniswapOutputToken, 0, 0);
        market.oracles[market.inputToken] = _newOracle;
        updateTokenPrice(_inputToken);
    }

    function addOutputPool(
        ISuperToken _token,
        uint128 _feeRate,
        uint256 _emissionRate,
        address _uniswapPool,
        address _uniswapInputToken,
        address _uniswapOutputToken,
        uint128 _shareScaler
    ) public virtual onlyOwner {
        // NOTE: Careful how many output pools, theres a loop over these pools
        require(market.numOutputPools < MAX_OUTPUT_POOLS, "Too many pools");

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
        OracleInfo memory _newOracle = OracleInfo(_requestId, _uniswapInputToken, _uniswapOutputToken, 0, 0);
        market.oracles[_token] = _newOracle;
        updateTokenPrice(_token);
    }

    // Standardized functionality for all REX Markets

    // Oracle Functions

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

    function updateTokenPrice(ISuperToken _token) public {
        // Optimizing Uniswap V3 consult() code for gas efficiency as we dont need code for harmonicMeanLiquidity
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        // int56 since tick * time = int24 * uint32
        // 56 = 24 + 32
        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(market.oracles[_token].pool).observe(
            secondsAgos
        );

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

        // int56 / uint32 = int24
        int24 tick = int24(tickCumulativesDelta / secondsAgo);
        // Always round to negative infinity
        /*
            int doesn't round down when it is negative
            int56 a = -3
            -3 / 10 = -3.3333... so round down to -4
            but we get
            a / 10 = -3
            so if tickCumulativeDelta < 0 and division has remainder, then round
            down
        */
        if (
            tickCumulativesDelta < 0 && (tickCumulativesDelta % secondsAgo != 0)
        ) {
            tick--;
        }

        address uniswapInputToken = market.oracles[_token].inputToken;

        uint256 value = OracleLibrary.getQuoteAtTick(
            tick,
            10 ** (IERC20(uniswapInputToken).decimals() - 1),
            uniswapInputToken,
            market.oracles[_token].outputToken
        );

        market.oracles[_token].usdPrice = value;
        market.oracles[_token].lastUpdatedAt = now;
    }

    /// @dev Get flow rate for `_streamer`
    /// @param _streamer is streamer address
    /// @return _requesterFlowRate `_streamer` flow rate
    function getStreamRate(address _streamer, ISuperToken _token)
        external
        view
        returns (int96 _requesterFlowRate)
    {
        (, _requesterFlowRate, , ) = cfa.getFlow(
            _token,
            _streamer,
            address(this)
        );
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

    function _updateShareholder(
        bytes memory _ctx,
        ShareholderUpdate memory _shareholderUpdate
    ) internal virtual returns (bytes memory _newCtx) {
        // We need to go through all the output tokens and update their IDA shares
        _newCtx = _ctx;
        (uint128 userShares, uint128 daoShares, uint128 affiliateShares) = _getShareAllocations(_shareholderUpdate);
        // updateOutputPools
        for (uint32 _index = 0; _index < market.numOutputPools; _index++) {
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                _index,
                _shareholderUpdate.shareholder,
                // shareholder gets 98% of the units, DAO takes 0.02%
                userShares,
                market.outputPools[_index].token
            );
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                _index,
                owner(),
                // shareholder gets 98% of the units, DAO takes 2%
                daoShares,
                market.outputPools[_index].token
            );
            if (_shareholderUpdate.affiliate != address(0)) {
              _newCtx = _updateSubscriptionWithContext(
                  _newCtx,
                  _index,
                  _shareholderUpdate.affiliate,
                  // affiliate may get 0.2%
                  affiliateShares,
                  market.outputPools[_index].token
              );
            }
            // TODO: Update the fee taken by the DAO
        }

    }

    function _getShareAllocations(ShareholderUpdate memory _shareholderUpdate)
     internal returns (uint128 userShares, uint128 daoShares, uint128 affiliateShares)
    {
      (,,daoShares,) = getIDAShares(market.outputPoolIndicies[_shareholderUpdate.token], owner());
      daoShares *= market.outputPools[market.outputPoolIndicies[_shareholderUpdate.token]].shareScaler;

      if (address(0) != _shareholderUpdate.affiliate) {
        (,,affiliateShares,) = getIDAShares(market.outputPoolIndicies[_shareholderUpdate.token], _shareholderUpdate.affiliate);
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
        if (address(0) != _shareholderUpdate.affiliate) {
          affiliateShares += feeShares * market.affiliateFee / 1e6;
          feeShares -= feeShares * market.affiliateFee / 1e6;
        }
        daoShares += feeShares;
      } else {
        // Make the rate positive
        changeInFlowRate = -1 * changeInFlowRate;
        feeShares = uint128(uint256(int256(changeInFlowRate)) * market.feeRate / 1e6);
        if (address(0) != _shareholderUpdate.affiliate) {
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

    // Superfluid Agreement Management Methods

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

    /// @dev Set new `shares` share for `subscriber` address in IDA with `index` index
    /// @param index IDA index ID
    /// @param subscriber is subscriber address
    /// @param shares is distribution shares count
    /// @param distToken is distribution token address
    function _updateSubscription(
        uint256 index,
        address subscriber,
        uint128 shares,
        ISuperToken distToken
    ) internal {
        host.callAgreement(
            ida,
            abi.encodeWithSelector(
                ida.updateSubscription.selector,
                distToken,
                index,
                subscriber,
                shares,
                new bytes(0) // placeholder ctx
            ),
            new bytes(0) // user data
        );
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

    // Boolean Helpers

    function _isInputToken(ISuperToken _superToken)
        internal
        virtual
        view
        returns (bool)
    {
        return address(_superToken) == address(market.inputToken);
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

    function _shouldDistribute() internal virtual returns (bool) {

      (, , uint128 _totalUnitsApproved, uint128 _totalUnitsPending) = ida
          .getIndex(
              market.outputPools[PRIMARY_OUTPUT_INDEX].token,
              address(this),
              PRIMARY_OUTPUT_INDEX
          );

      // Check balance and account for just 1 input token
      uint256 _balance = market.inputToken.balanceOf(
          address(this)
      );

      return _totalUnitsApproved + _totalUnitsPending > 0 && _balance > 0;
    }

    function _onlyScalable(ISuperToken _superToken, int96 _flowRate) internal virtual {
      // Enforce speed limit on flowRate
      require(uint128(uint(int(_flowRate))) % (market.outputPools[market.outputPoolIndicies[_superToken]].shareScaler * 1e3) == 0, "notScalable");
    }

    function _registerReferral(bytes memory _ctx, address _shareholder) internal {
      require(referrals.addressToAffiliate(_shareholder) == 0, "noAffiliates");
      ISuperfluid.Context memory decompiledContext = host.decodeCtx(_ctx);
      string memory affiliateId;
      if (decompiledContext.userData.length > 0) {
        (affiliateId) = abi.decode(decompiledContext.userData, (string));
      } else {
        affiliateId = "";
      }

      referrals.safeRegisterCustomer(_shareholder, affiliateId);
    }

    // Superfluid Functions

    function beforeAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata // _ctx
    ) external view virtual override returns (bytes memory _cbdata) {

    }

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;

        if (_shouldDistribute()) {
            _newCtx = distribute(_newCtx);
        }

        (address _shareholder, int96 _flowRate, ) = _getShareholderInfo(
            _agreementData, _superToken
        );

        _onlyScalable(_superToken, _flowRate);

        _registerReferral(_ctx, _shareholder);

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
          _shareholder, referrals.getAffiliateAddress(_shareholder), 0, _flowRate, _superToken
        );
        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);

    }

    function beforeAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
      _onlyHost();
      if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
          return _ctx;

      // Get the stakeholders current flow rate and save it in cbData
      (, int96 _flowRate,) = _getShareholderInfo(
          _agreementData, _superToken
      );

      _cbdata = abi.encode(_flowRate);
    }


    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;
        (address _shareholder, int96 _flowRate,) = _getShareholderInfo(
            _agreementData, _superToken
        );

        _onlyScalable(_superToken, _flowRate);

        int96 _beforeFlowRate = abi.decode(_cbdata, (int96));


        if (_shouldDistribute()) {
            _newCtx = distribute(_newCtx);
        }

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
          _shareholder, referrals.getAffiliateAddress(_shareholder), _beforeFlowRate, _flowRate, _superToken
        );

        // TODO: Udpate shareholder needs before and after flow rate
        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);

    }

    // We need before agreement to get the uninvested amount using the flowRate before update
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
            market.lastDistributionAt
        );
        _cbdata = abi.encode(_uinvestAmount, _flowRateMain);

    }

    function afterAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;

        _newCtx = _ctx;
        (address _shareholder, ) = abi.decode(_agreementData, (address, address));
        (uint256 _uninvestAmount, int96 _beforeFlowRate ) = abi.decode(_cbdata, (uint256, int96));

        ShareholderUpdate memory _shareholderUpdate = ShareholderUpdate(
          _shareholder, referrals.getAffiliateAddress(_shareholder), _beforeFlowRate, 0, _superToken
        );

        _newCtx = _updateShareholder(_newCtx, _shareholderUpdate);
        // Refund the unswapped amount back to the person who started the stream
        try _superToken.transferFrom(address(this), _shareholder, _uninvestAmount)
        // solhint-disable-next-line no-empty-blocks
        {} catch {
        }
    }
}
