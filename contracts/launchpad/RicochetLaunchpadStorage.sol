import {
    ISuperfluid,
    ISuperToken
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";


import {
    IConstantFlowAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";


import {
    IInstantDistributionAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IInstantDistributionAgreementV1.sol";


library RicochetLaunchpadStorage  {
  struct RicochetLaunchpad {
    ISuperfluid host;                     // Superfluid host contract
    IConstantFlowAgreementV1 cfa;         // The stored constant flow agreement class address
    IInstantDistributionAgreementV1 ida;  // The stored instant dist. agreement class address
    ISuperToken inputToken;
    ISuperToken outputToken;
    address owner;
    address originator;
    address beneficiary;
    uint256 lastDistributionAt;
    uint256 outputRate;
    uint32 outputIndexId;
    uint128 feeRate;
    uint256 lastSharePrice;
  }
}
