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

    ISuperfluid private host; // Superfluid host contract
    IConstantFlowAgreementV1 private cfa; // The stored constant flow agreement class address
    IInstantDistributionAgreementV1 private ida; // The stored instant dist. agreement class address
    ITellor private oracle; // Address of deployed simple oracle for input//output token
    Market private market;
    uint32 private constant PRIMARY_OUTPUT_INDEX = 0;

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

        uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        console.log(_registrationKey);
        if (bytes(_registrationKey).length > 0) {
            host.registerAppWithKey(configWord, _registrationKey);
        } else {
            host.registerApp(configWord);
        }
    }

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
        OracleInfo memory newOracle = OracleInfo(_inputTokenRequestId, 0, 0);
        market.oracles[market.inputToken] = newOracle;
        updateTokenPrice(_inputToken);
    }

    function addOutputPool(
        ISuperToken _token,
        uint128 _feeRate,
        uint256 _emissionRate,
        uint256 _requestId
    ) public onlyOwner {
        // NOTE: Careful how many output pools, theres a loop over these pools
        require(_requestId != 0, "!validReqId");
        require(market.oracles[_token].requestId == 0, "!unique");
        //
        OutputPool memory newPool = OutputPool(_token, _feeRate, _emissionRate);
        market.outputPools[market.numOutputPools] = newPool;
        _createIndex(market.numOutputPools, _token);
        market.numOutputPools++;
        OracleInfo memory newOracle = OracleInfo(_requestId, 0, 0);
        market.oracles[_token] = newOracle;
        updateTokenPrice(_token);
    }

    // Custom functionality that needs to be overrided by contract extending the base

    // Converts input token to output token
    function distribute(bytes memory _ctx)
        public
        virtual
        returns (bytes memory newCtx);

    // Harvests rewards if any
    function harvest(bytes memory _ctx)
        public
        virtual
        returns (bytes memory newCtx);

    // Standardized functionality for all REX Markets

    // Oracle Functions

    function updateTokenPrice(ISuperToken _token) public {
        console.log("token", address(_token));
        (
            bool ifRetrieve,
            uint256 value,
            uint256 timestampRetrieved
        ) = getCurrentValue(market.oracles[_token].requestId);
        console.log("rid", market.oracles[_token].requestId);
        console.log("timestampRetrieved", timestampRetrieved);
        require(ifRetrieve, "!getCurrentValue");
        require(timestampRetrieved >= block.timestamp - 3600, "!currentValue");
        market.oracles[_token].usdPrice = value;
        market.oracles[_token].lastUpdatedAt = timestampRetrieved;
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

    // Superfluid Functions

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    )
        external
        override
        onlyHost
        onlyExpected(_superToken, _agreementClass)
        returns (bytes memory _newCtx)
    {
        if (!_isInputToken(_superToken) || !_isCFAv1(_agreementClass))
            return _ctx;
        console.log("inside after agreement1");

        _newCtx = _ctx;

        // NOTE: This section be moved to a method: if(shouldDistribute()) { ... }
        (, , uint128 totalUnitsApproved, uint128 totalUnitsPending) = ida
            .getIndex(
                market.outputPools[PRIMARY_OUTPUT_INDEX].token,
                address(this),
                PRIMARY_OUTPUT_INDEX
            );
        // Check balance and account for
        uint256 balance = ISuperToken(market.inputToken).balanceOf(
            address(this)
        ) /
            (10 **
                (18 -
                    ERC20(market.inputToken.getUnderlyingToken()).decimals()));

        if (totalUnitsApproved + totalUnitsPending > 0 && balance > 0) {
            _newCtx = distribute(_newCtx);
        }

        (address shareholder, int96 flowRate) = _getShareholderInfo(
            _agreementData
        );

        console.log("inside after agreement4");

        _newCtx = _updateShareholder(_newCtx, shareholder, flowRate);
        console.log("inside after agreement5");
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    )
        external
        override
        onlyHost
        onlyExpected(_superToken, _agreementClass)
        returns (bytes memory _newCtx)
    {
        _newCtx = _ctx;

        (address shareholder, int96 flowRate) = _getShareholderInfo(
            _agreementData
        );

        _newCtx = harvest(_newCtx);
        _newCtx = distribute(_newCtx);
        _newCtx = _updateShareholder(_newCtx, shareholder, flowRate);
    }

    // We need before agreement to get the uninvested amount using the flowRate before update
    function beforeAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata // _ctx
    )
        external
        view
        override
        onlyExpected(_superToken, _agreementClass)
        onlyHost
        returns (bytes memory _cbdata)
    {
        (address shareholder, ) = _getShareholderInfo(_agreementData);

        (uint256 timestamp, int96 flowRateMain, , ) = cfa.getFlow(
            market.inputToken,
            shareholder,
            address(this)
        );
        uint256 uinvestAmount = _calcUserUninvested(
            timestamp,
            uint256(uint96(flowRateMain)),
            market.lastDistributionAt
        );
        _cbdata = abi.encode(uinvestAmount);
    }

    function afterAgreementTerminated(
        ISuperToken, //_superToken
        address, //_agreementClass
        bytes32, //_agreementId,
        bytes calldata _agreementData,
        bytes calldata _cbdata, //_cbdata,
        bytes calldata _ctx
    ) external override onlyHost returns (bytes memory _newCtx) {
        _newCtx = _ctx;
        (address shareholder, ) = _getShareholderInfo(_agreementData);
        uint256 uninvestAmount = abi.decode(_cbdata, (uint256));
        // Refund the unswapped amount back to the person who started the stream
        market.inputToken.transferFrom(
            address(this),
            shareholder,
            uninvestAmount
        );
        _newCtx = _updateShareholder(_newCtx, shareholder, 0);
    }

    /// @dev Get flow rate for `_streamer`
    /// @param _streamer is streamer address
    /// @return _requesterFlowRate `_streamer` flow rate
    function getStreamRate(address _streamer)
        external
        view
        returns (int96 _requesterFlowRate)
    {
        (, _requesterFlowRate, , ) = cfa.getFlow(
            market.inputToken,
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

    function _getShareholderInfo(bytes calldata _agreementData)
        internal
        view
        returns (address _shareholder, int96 _flowRate)
    {
        (_shareholder, ) = abi.decode(_agreementData, (address, address));
        (, _flowRate, , ) = cfa.getFlow(
            market.inputToken,
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

        // console.log("Uninvested amount is: %s", _userUninvestedSum);
    }

    // Modifiers

    /// @dev Restricts calls to only from SuperFluid host
    modifier onlyHost() {
        require(msg.sender == address(host), "!host");
        _;
    }

    /// @dev Accept only input token for CFA, output and subsidy tokens for IDA
    modifier onlyExpected(ISuperToken _superToken, address _agreementClass) {
        if (_isCFAv1(_agreementClass)) {
            require(_isInputToken(_superToken), "!inputAccepted");
        } else if (_isIDAv1(_agreementClass)) {
            require(_isOutputToken(_superToken), "!outputAccepted");
        }
        _;
    }

    // Boolean Helpers

    function _isInputToken(ISuperToken _superToken)
        internal
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
        console.log("_isOutputToken", address(_superToken));
        console.log(
            "market.oracles[_superToken].requestId",
            market.oracles[_superToken].requestId
        );
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

    // Superfluid Agreement Management Methods

    function _createIndex(uint256 index, ISuperToken distToken) internal {
        console.log("Create index", index);
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
}
