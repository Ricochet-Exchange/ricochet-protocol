contract REXMarketBase {

// Custom functionality that needs to be overrided by contract extending the base

  // Converts input token to output token
  function distribute() public virtual;

  // Harvests rewards if any
  function harvest() public virtual;

  // Send fees accured to the owner
  function claim() public virtual;


// Standardized functionality for all REX Markets

  function afterAgreementCreated(...,bytes calldata _agreementData,...) {
      (address shareholder,
       int96 shareholderFlowRate) = _getShareholderInfo(_agreementData)

      harvest();
      distribute();
      _createNewShareholder(shareholder, shareholderFlowRate);
  }

  function afterAgreementUpdated(...,bytes calldata _agreementData,...) {
      (address shareholder,
       int96 shareholderFlowRate) = _getShareholderInfo(_agreementData)

      harvest();
      distribute();
      _updateShareholder(shareholder, shareholderFlowRate);
  }

  function afterAgreementTerminated(...,bytes calldata _agreementData,...) {
      (address shareholder, ) = _getShareholderInfo(_agreementData)

      claim(); // Claim fees for contract owner on agreement termination
      _deleteShareholder(shareholder);
  }

  function _createNewShareholder(address shareholder, int96 shareholderFlowRate) { }

  function _updateShareholder(address shareholder, int96 shareholderFlowRate) { }

  function _deleteShareholder(address shareholder) { }

  function _getShareholderInfo(bytes calldata _agreementData) { }


}
