# AtomicSwap(HTLC) EVM Contracts

You can use `scripts/htlc.js`  to test HTLC contract on SmartBCH testnet.



## Prepare

```bash
git clone https://github.com/smartbch/atomic-swap-contracts.git
cd atomic-swap-contracts
npm i
```



## Run unit tests

```bash
REPORT_GAS=true npx hardhat test
```



## Deploy to SmartBCH testnet

```bash
npx hardhat run scripts/deploy.js --network sbch_testnet
# HTLC deployed to 0xc456314331D6f50681266fCC6CcA8542Ae71EbD8
```



## Lock SBCH to HTLC

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js lock \
	--signer=2 \
	--htlc-addr=0xc456314331D6f50681266fCC6CcA8542Ae71EbD8 \
	--to-addr=0x8b1C9950aA5c6fF3BB038ff31878dd6a268958f8 \
	--secret-key=hello \
	--lock-time=2400 \
	--pkh=0xc03A886B25Cabc20dB49170981ef118693e807d1 \
	--penalty-bps=500 \
	--amount=0.01 \
	--expected-price=1.0
```



## Unlock SBCH from HTLC

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js unlock \
	--signer=3 \
	--htlc-addr=0xc456314331D6f50681266fCC6CcA8542Ae71EbD8 \
	--secret-key=hello
```



## Refund SBCH from HTLC

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js refund \
	--signer=2 \
	--htlc-addr=0xc456314331D6f50681266fCC6CcA8542Ae71EbD8 \
	--secret-key=hello
```



## Register Market Maker Bot

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js register-bot \
	--signer=1 \
	--htlc-addr=0xc456314331D6f50681266fCC6CcA8542Ae71EbD8 \
	--intro=BCHFANS \
	--pkh=0x4d027fdd0585302264922bed58b8a84d38776ccb \
	--bch-lock-time=6 \
	--penalty-bps=500 \
	--bch-price=1.0 \
	--sbch-price=1.0 \
	--min-swap-amt=0.1 \
	--max-swap-amt=1.0 \
	--staked-val=0.2 \
	--status-checker=0x4d027fdd0585302264922bed58b8a84d38776ccb
```



## Update Merket Maker Bot

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js update-bot \
	--signer=1 \
	--htlc-addr=0xc456314331D6f50681266fCC6CcA8542Ae71EbD8 \
	--intro=BCHFANS \
	--bch-price=1.1 \
	--sbch-price=0.9
```



## Query

Example:

```bash
HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js query-bots \
	--htlc-addr=0xc456314331D6f50681266fCC6CcA8542Ae71EbD8

HARDHAT_NETWORK=sbch_testnet node ./scripts/htlc.js query-swap \
	--htlc-addr=0xc456314331D6f50681266fCC6CcA8542Ae71EbD8 \
	--secret-key=hello
```



