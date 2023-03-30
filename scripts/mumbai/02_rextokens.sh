# REX Token Deployment Scirpts
# This must be run from within the superfluid-finance/custom-supertokens repo

NETWORK=maticmum

# # 52 REX Hat (rexHAT) tokens using MintBurnSuperToken
CONTRACT=BurnMintSuperToken INIT_ARGS="REX Hat","rexHAT","52000000000000000000","0x8e38Be5c136B3f7f05aD570c2996e43733418C4a","0x" npx truffle exec --network $NETWORK scripts/deploy.js

# 52 REX Shirt (rexSHIRT) tokens using MintBurnSuperToken 
CONTRACT=BurnMintSuperToken INIT_ARGS="REX Shirt","rexSHIRT","52000000000000000000","0x8e38Be5c136B3f7f05aD570c2996e43733418C4a","0x" npx truffle exec --network $NETWORK scripts/deploy.js

# 1M Ricochet (RIC) tokens using MintBurnSupertoken
CONTRACT=BurnMintSuperToken INIT_ARGS="Ricochet","RIC","1000000000000000000000000","0x8e38Be5c136B3f7f05aD570c2996e43733418C4a","0x" npx truffle exec --network $NETWORK scripts/deploy.js
