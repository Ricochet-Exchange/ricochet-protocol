// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;


import "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol"; 
import "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperToken.sol";
import "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperApp.sol";
import "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperAgreement.sol";
import "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/Definitions.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {IInstantDistributionAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "./tellor/ITellor.sol";
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

    struct OracleInfo {
        uint256 requestId;
        uint256 usdPrice;
        uint256 lastUpdatedAt;
    }

    struct OutputPool {
        ISuperToken token;
        uint128 feeRate; // Fee taken by the DAO on each output distribution
        uint256 emissionRate; // Rate to emit tokens if there's a balance, used for subsidies
    }

    struct Market {
        ISuperToken inputToken;
        uint256 lastDistributionAt; // The last time a distribution was made
        uint256 rateTolerance; // The percentage to deviate from the oracle scaled to 1e6
        address owner; // The owner of the market (reciever of fees)
        mapping(ISuperToken => OracleInfo) oracles; // Maps tokens to their oracle info
        mapping(uint32 => OutputPool) outputPools; // Maps IDA indexes to their distributed Supertokens
        uint8 numOutputPools; // Indexes outputPools and outputPoolFees
    }

    ISuperfluid internal host; // Superfluid host contract
    IConstantFlowAgreementV1 internal cfa; // The stored constant flow agreement class address
    IInstantDistributionAgreementV1 internal ida; // The stored instant dist. agreement class address
    ITellor internal oracle; // Address of deployed simple oracle for input//output token
    Market internal market;
    uint32 internal constant PRIMARY_OUTPUT_INDEX = 0;

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
        string memory _registrationKey
    ) {
        host = _host;
        cfa = _cfa;
        ida = _ida;
        transferOwnership(_owner);

        uint256 _configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        console.log(_registrationKey);
        if (bytes(_registrationKey).length > 0) {
            host.registerAppWithKey(_configWord, _registrationKey);
        } else {
            host.registerApp(_configWord);
        }
    }

    /// @dev Allows anyone to close any stream if the app is jailed.
    /// @param streamer is stream source (streamer) address
    function emergencyCloseStream(address streamer) external virtual {
        // Allows anyone to close any stream if the app is jailed
        bool isJailed = host.isAppJailed(ISuperApp(address(this)));

        require(isJailed, "!jailed");

        host.callAgreement(
            cfa,
            abi.encodeWithSelector(
                cfa.deleteFlow.selector,
                market.inputToken,
                streamer,
                address(this),
                new bytes(0) // placeholder
            ),
            "0x"
        );
    }

    /// @dev Drain contract's input and output tokens balance to owner if SuperApp dont have any input streams.
    function emergencyDrain() external virtual onlyOwner {
        require(
            cfa.getNetFlow(market.inputToken, address(this)) == 0,
            "!zeroStreamers"
        );

        market.inputToken.transfer(
            owner(),
            market.inputToken.balanceOf(address(this))
        );

        // Go through the other OutputPools and trigger distributions
        for (uint32 index = 0; index < market.numOutputPools; index++) {
            market.outputPools[index].token.transfer(
                owner(),
                market.outputPools[index].token.balanceOf(address(this))
            );
        }
    }

    // Getters

    /// @dev Get input token address
    /// @return input token address
    function getInputToken() external view returns (ISuperToken) {
        return market.inputToken;
    }

    /// @dev Get output token address
    /// @return output token address
    function getOuputPool(uint32 _index)
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

    /// @dev Get total input flow rate
    /// @return input flow rate
    function getTotalInflow() external view returns (int96) {
        return cfa.getNetFlow(market.inputToken, address(this));
    }

    /// @dev Get last distribution timestamp
    /// @return last distribution timestamp
    function getLastDistributionAt() external view returns (uint256) {
        return market.lastDistributionAt;
    }

    /// @dev Get Tellor Oracle address
    /// @return Tellor Oracle address
    function getTellorOracle() external view returns (address) {
        return address(oracle);
    }

    // Emergency Admin Methods

    /// @dev Is app jailed in SuperFluid protocol
    /// @return is app jailed in SuperFluid protocol
    function isAppJailed() external view returns (bool) {
        return host.isAppJailed(this);
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
        uint256 _inputTokenRequestId
    ) public virtual onlyOwner {
        require(
            address(market.inputToken) == address(0),
            "Already initialized"
        );
        market.inputToken = _inputToken;
        market.rateTolerance = _rateTolerance;
        oracle = _tellor;
        OracleInfo memory _newOracle = OracleInfo(_inputTokenRequestId, 0, 0);
        market.oracles[market.inputToken] = _newOracle;
        updateTokenPrice(_inputToken);
    }

    function addOutputPool(
        ISuperToken _token,
        uint128 _feeRate,
        uint256 _emissionRate,
        uint256 _requestId
    ) public virtual onlyOwner {
        // NOTE: Careful how many output pools, theres a loop over these pools
        require(_requestId != 0, "!validReqId");
        require(market.oracles[_token].requestId == 0, "!unique");
        //
        OutputPool memory _newPool = OutputPool(
            _token,
            _feeRate,
            _emissionRate
        );
        market.outputPools[market.numOutputPools] = _newPool;
        _createIndex(market.numOutputPools, _token);
        market.numOutputPools++;
        OracleInfo memory _newOracle = OracleInfo(_requestId, 0, 0);
        market.oracles[_token] = _newOracle;
        updateTokenPrice(_token);
    }

    // Standardized functionality for all REX Markets

    // Oracle Functions

    function updateTokenPrice(ISuperToken _token) public {
        console.log("token", address(_token));
        (
            bool _ifRetrieve,
            uint256 _value,
            uint256 _timestampRetrieved
        ) = getCurrentValue(market.oracles[_token].requestId);

        console.log("rid", market.oracles[_token].requestId);
        console.log("timestampRetrieved", _timestampRetrieved);

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
        external
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
        address _shareholder,
        int96 _shareholderFlowRate
    ) internal returns (bytes memory _newCtx) {
        // TODO: We need to make sure this for-loop won't run out of gas, do this we can set a limit on numOutputPools
        // We need to go through all the output tokens and update their IDA shares
        _newCtx = _ctx;
        for (uint32 _index = 0; _index < market.numOutputPools; _index++) {
            _newCtx = _updateSubscriptionWithContext(
                _newCtx,
                _index,
                _shareholder,
                uint128(uint256(int256(_shareholderFlowRate))),
                market.outputPools[_index].token
            );
            // TODO: Update the fee taken by the DAO
        }
    }

    function _getShareholderInfo(bytes calldata _agreementData, ISuperToken _superToken)
        internal
        view
        returns (address _shareholder, int96 _flowRate)
    {
        (_shareholder, ) = abi.decode(_agreementData, (address, address));
        (, _flowRate, , ) = cfa.getFlow(
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
            require(
                host.isCtxValid(_newCtx) || _newCtx.length == 0,
                "!distribute"
            );
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
        console.log(address(distToken));

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
                // one share for the to get it started
                subscriber,
                shares / 1e9,
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
                shares / 1e9, // Number of shares is proportional to their rate
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

        console.log("Uninvested amount is: %s", _uninvestedAmount);
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
        if (market.oracles[_superToken].requestId != 0) {
            return true;
        } else {
            return false;
        }
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

    /// @dev Accept only input token for CFA, output and subsidy tokens for IDA
    function _onlyExpected(ISuperToken _superToken, address _agreementClass)
        internal
        view
    {
        if (_isCFAv1(_agreementClass)) {
            require(_isInputToken(_superToken), "!inputAccepted");
        } else if (_isIDAv1(_agreementClass)) {
            require(_isOutputToken(_superToken), "!outputAccepted");
        }
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
      ) /
          (10 **
              (18 -
                  ERC20(market.inputToken.getUnderlyingToken()).decimals()));

      return _totalUnitsApproved + _totalUnitsPending > 0 && _balance > 0;
    }

    // Superfluid Functions

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
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

        console.log("inside after agreement4");

        _newCtx = _updateShareholder(_newCtx, _shareholder, _flowRate);
        console.log("inside after agreement5");
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    ) external virtual override returns (bytes memory _newCtx) {
        _onlyHost();
        _onlyExpected(_superToken, _agreementClass);

        _newCtx = _ctx;
        (address _shareholder, int96 _flowRate) = _getShareholderInfo(
            _agreementData, _superToken
        );

        _newCtx = distribute(_newCtx);
        _newCtx = _updateShareholder(_newCtx, _shareholder, _flowRate);
    }

    // We need before agreement to get the uninvested amount using the flowRate before update
    function beforeAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata // _ctx
    ) external view virtual override returns (bytes memory _cbdata) {
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
    ) external virtual override returns (bytes memory _newCtx) {
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
        _newCtx = _updateShareholder(_newCtx, _shareholder, 0);
    }
}
