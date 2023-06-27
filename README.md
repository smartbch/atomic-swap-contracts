# HTLC EVM Contract

You can use `scripts/htlc.js`  to test HTLC contract on SmartBCH testnet.



## Prepare

```bash
git clone https://github.com/smartbch/atomic-swap.git
cd tomic-swap/htlc-evm
npm i
```



## Run unit tests

```bash
REPORT_GAS=true npx hardhat test
```



## Deploy to SmartBCH testnet

```bash
npx hardhat run scripts/deploy.js --network sbch_testnet
# HTLC deployed to 0x8e4cF2F44D6F345b7b98efeBcDfC06152Cac6361
```



## Open (Lock SBCH to HTLC)

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js lock \
	--signer=2 \
	--htlc-addr=0x8e4cF2F44D6F345b7b98efeBcDfC06152Cac6361 \
	--to-addr=0x8b1C9950aA5c6fF3BB038ff31878dd6a268958f8 \
	--secret-key=hello \
	--lock-time=2400 \
	--pkh=0xc03A886B25Cabc20dB49170981ef118693e807d1 \
	--penalty-bps=500 \
	--amount=0.01
```



## Close (Unlock SBCH from HTLC)

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js unlock \
	--signer=3 \
	--htlc-addr=0x8e4cF2F44D6F345b7b98efeBcDfC06152Cac6361 \
	--secret-key=hello
```



## Expire (Refund SBCH from HTLC)

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js refund \
	--signer=2 \
	--htlc-addr=0x8e4cF2F44D6F345b7b98efeBcDfC06152Cac6361 \
	--secret-key=hello
```



## Register Bot

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js register-bot \
	--htlc-addr=0x8e4cF2F44D6F345b7b98efeBcDfC06152Cac6361 \
	--intro=BCHFANS \
	--pkh=0x4d027fdd0585302264922bed58b8a84d38776ccb \
	--bch-lock-time=6 \
	--sbch-lock-time=3600 \
	--penalty-bps=500 \
	--fee-bps=100 \
	--min-swap-amt=0.1 \
	--max-swap-amt=1.0 \
	--status-checker=0x4d027fdd0585302264922bed58b8a84d38776ccb
```



## Query

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js query \
	--htlc-addr=0x8e4cF2F44D6F345b7b98efeBcDfC06152Cac6361
```



