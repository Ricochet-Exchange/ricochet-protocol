// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2;

import 'hardhat/console.sol';

import {ISuperApp, ISuperfluid, ISuperToken, ISuperToken, ISuperAgreement} from '@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol';

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

import './RicochetLaunchpadStorage.sol';

library RicochetLaunchpadHelper {
  using SafeERC20 for ERC20;

  // TODO: Emit these events where appropriate
  event Distribution(
    uint256 inputAmount,
    uint256 outputAmount,
    uint256 feeCollected
  );
  event UpdatedStream(address from, int96 newRate, int96 totalInflow);

  function _closeStream(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    address streamer
  ) public {
    // Only closable iff their balance is less than 8 hours of streaming
    (, int96 streamerFlowRate, , ) = self.cfa.getFlow(
      self.inputToken,
      streamer,
      address(this)
    );
    require(
      int(self.inputToken.balanceOf(streamer)) <= streamerFlowRate * 8 hours,
      '!closable'
    );

    // Update Subscriptions
    _updateSubscription(
      self,
      self.outputIndexId,
      streamer,
      0,
      self.outputToken
    );
    emit UpdatedStream(
      streamer,
      0,
      self.cfa.getNetFlow(self.inputToken, address(this))
    );

    // Close the streamers stream
    self.host.callAgreement(
      self.cfa,
      abi.encodeWithSelector(
        self.cfa.deleteFlow.selector,
        self.inputToken,
        streamer,
        address(this),
        new bytes(0) // placeholder
      ),
      '0x'
    );
  }

  function _emergencyCloseStream(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    address streamer
  ) public {
    // Allows anyone to close any stream iff the app is jailed
    bool isJailed = self.host.isAppJailed(ISuperApp(address(this)));

    require(isJailed, '!jailed');
    self.host.callAgreement(
      self.cfa,
      abi.encodeWithSelector(
        self.cfa.deleteFlow.selector,
        self.inputToken,
        streamer,
        address(this),
        new bytes(0) // placeholder
      ),
      '0x'
    );
  }

  function _emergencyDrain(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self
  ) public {
    require(
      self.cfa.getNetFlow(self.inputToken, address(this)) == 0,
      '!zeroStreamers'
    );
    self.inputToken.transfer(
      self.owner,
      self.inputToken.balanceOf(address(this))
    );
    self.outputToken.transfer(
      self.owner,
      self.outputToken.balanceOf(address(this))
    );
  }

  // @dev Distribute a single `amount` of outputToken among all streamers
  // @dev Calculates the amount to distribute
  function _distribute(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    bytes memory ctx
  ) external returns (bytes memory newCtx) {
    newCtx = ctx;
    require(
      self.host.isCtxValid(newCtx) || newCtx.length == 0,
      '!distributeCtx'
    );

    // Disperse input tokens to beneficiary and owner
    uint256 inputAmount = self.inputToken.balanceOf(address(this));
    uint256 feeCollected = (inputAmount * self.feeRate) / 1e6;
    uint256 distAmount = inputAmount - feeCollected;
    ISuperToken(self.inputToken).transfer(self.owner, feeCollected);
    ISuperToken(self.inputToken).transfer(self.beneficiary, distAmount);

    // Distribute the output tokens to the streamers
    uint256 outputAmount = (block.timestamp - self.lastDistributionAt) *
      self.outputRate;
    if (self.outputToken.balanceOf(address(this)) >= outputAmount) {
      newCtx = _idaDistribute(
        self,
        self.outputIndexId,
        uint128(outputAmount),
        self.outputToken,
        newCtx
      );
      self.lastSharePrice = (inputAmount * 1e18) / outputAmount;
      emit Distribution(inputAmount, outputAmount, feeCollected);
    }

    self.lastDistributionAt = block.timestamp;

    return newCtx;
  }

  function _idaDistribute(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    uint32 index,
    uint128 distAmount,
    ISuperToken distToken,
    bytes memory ctx
  ) internal returns (bytes memory newCtx) {
    newCtx = ctx;
    if (newCtx.length == 0) {
      // No context provided
      self.host.callAgreement(
        self.ida,
        abi.encodeWithSelector(
          self.ida.distribute.selector,
          distToken,
          index,
          distAmount,
          new bytes(0) // placeholder ctx
        ),
        new bytes(0) // user data
      );
    } else {
      require(
        self.host.isCtxValid(newCtx) || newCtx.length == 0,
        '!distribute'
      );
      (newCtx, ) = self.host.callAgreementWithContext(
        self.ida,
        abi.encodeWithSelector(
          self.ida.distribute.selector,
          distToken,
          index,
          distAmount,
          new bytes(0) // placeholder ctx
        ),
        new bytes(0), // user data
        newCtx
      );
    }
  }

  function _createIndex(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    uint256 index,
    ISuperToken distToken
  ) internal {
    self.host.callAgreement(
      self.ida,
      abi.encodeWithSelector(
        self.ida.createIndex.selector,
        distToken,
        index,
        new bytes(0) // placeholder ctx
      ),
      new bytes(0) // user data
    );
  }

  function _updateSubscription(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    uint256 index,
    address subscriber,
    uint128 shares,
    ISuperToken distToken
  ) internal {
    self.host.callAgreement(
      self.ida,
      abi.encodeWithSelector(
        self.ida.updateSubscription.selector,
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

  function _updateSubscriptionWithContext(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    bytes memory ctx,
    uint256 index,
    address subscriber,
    uint128 shares,
    ISuperToken distToken
  ) internal returns (bytes memory newCtx) {
    newCtx = ctx;
    (newCtx, ) = self.host.callAgreementWithContext(
      self.ida,
      abi.encodeWithSelector(
        self.ida.updateSubscription.selector,
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

  function _deleteSubscriptionWithContext(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    bytes memory ctx,
    address receiver,
    uint256 index,
    address subscriber,
    ISuperToken distToken
  ) internal returns (bytes memory newCtx) {
    (newCtx, ) = self.host.callAgreementWithContext(
      self.ida,
      abi.encodeWithSelector(
        self.ida.deleteSubscription.selector,
        distToken,
        receiver,
        index,
        subscriber,
        new bytes(0)
      ),
      new bytes(0), // user data
      newCtx
    );
  }

  /**************************************************************************
   * SuperApp callbacks
   *************************************************************************/

  function _isInputToken(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    ISuperToken superToken
  ) internal view returns (bool) {
    return address(superToken) == address(self.inputToken);
  }

  function _isOutputToken(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    ISuperToken superToken
  ) internal view returns (bool) {
    return address(superToken) == address(self.outputToken);
  }

  function _isCFAv1(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    address agreementClass
  ) internal view returns (bool) {
    return
      ISuperAgreement(agreementClass).agreementType() ==
      keccak256('org.superfluid-finance.agreements.ConstantFlowAgreement.v1');
  }

  function _isIDAv1(
    RicochetLaunchpadStorage.RicochetLaunchpad storage self,
    address agreementClass
  ) internal view returns (bool) {
    return
      ISuperAgreement(agreementClass).agreementType() ==
      keccak256(
        'org.superfluid-finance.agreements.InstantDistributionAgreement.v1'
      );
  }
}
