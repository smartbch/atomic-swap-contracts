const yargs = require('yargs');
const hre = require("hardhat");

const ethers = hre.ethers;

yargs(process.argv.slice(2))
    .command('query', 'query bots and swaps', (yargs) => {
        return yargs
            .option('htlc-addr', { required: true, type: 'string', description: 'HTLC contract address' });
    }, async (argv) => {
        await query(argv['htlc-addr']);
    })
    .command('register-bot', 'register bot', (yargs) => {
        return yargs
            .option('signer',         { required: false,type: 'number', default: 1})
            .option('htlc-addr',      { required: true, type: 'string', description: 'HTLC contract address' })
            .option('intro',          { required: true, type: 'string', description: "bot's intro" })
            .option('pkh',            { required: true, type: 'string', description: 'bot public key hash (hex)' })
            .option('bch-lock-time',  { required: true, type: 'number', description: "BCH HTLC lock-time (in blocks)" })
            .option('sbch-lock-time', { required: true, type: 'number', description: "sBCH HTLC lock-time (in seconds)" })
            .option('penalty-bps',    { required: true, type: 'number', description: 'penalty ratio of HTLC refund (in BPS)'})
            .option('fee-bps',        { required: true, type: 'number', description: 'service fee ratio (in BPS)' })
            .option('min-swap-amt',   { required: true, type: 'string', description: "min amount of swap (in Ethers)"})
            .option('max-swap-amt',   { required: true, type: 'string', description: "max amount of swap (in Ethers)"})
            .option('status-checker', { required: true, type: 'string', description: "status checker" })
            ;
    }, async (argv) => {
        await registerBot(argv.signer, argv.htlcAddr, argv.intro, argv.pkh, 
            argv.bchLockTime, argv.sbchLockTime, argv.penaltyBps, argv.feeBps,
            ethers.utils.parseEther(argv.minSwapAmt),
            ethers.utils.parseEther(argv.maxSwapAmt), 
            argv.statusChecker);
    })
    .command('lock', 'lock sbch', (yargs) => {
        return yargs
            .option('signer',      { required: false,type: 'number', default: 2})
            .option('htlc-addr',   { required: true, type: 'string', description: 'HTLC contract address' })
            .option('to-addr',     { required: true, type: 'string', description: 'withdraw address' })
            .option('secret-key',  { required: true, type: 'string', description: "unlock secret-key" })
            .option('lock-time',   { required: true, type: 'string', description: "locking period (in seconds)" })
            .option('pkh',         { required: true, type: 'string', description: 'bch withdraw public key hash (hex)' })
            .option('penalty-bps', { required: true, type: 'string', description: 'penalty ratio of HTLC refund (in BPS)' })
            .option('amount',      { required: true, type: 'string', description: "locked value (in Ethers)" })
            ;
    }, async (argv) => {
        await lockBCH(argv.signer, argv.htlcAddr, argv.toAddr, argv.secretKey, argv.lockTime, argv.pkh, argv.penaltyBps, argv.amount);
    })
    .command('unlock', 'unlock sbch', (yargs) => {
        return yargs
            .option('signer',     { required: false,type: 'number', default: 3})
            .option('htlc-addr',  { required: true, type: 'string', description: 'HTLC contract address' })
            .option('secret-key', { required: true, type: 'string', description: "unlock secret-key" })
            ;
    }, async (argv) => {
        await unlockBCH(argv.signer, argv.htlcAddr, argv.secretKey);
    })
    .command('refund', 'refund sbch', (yargs) => {
        return yargs
            .option('signer',     { required: false,type: 'number', default: 2})
            .option('htlc-addr',  { required: true, type: 'string', description: 'HTLC contract address' })
            .option('secret-key', { required: true, type: 'string', description: "unlock secret-key" })
            ;
    }, async (argv) => {
        await refundBCH(argv.signer, argv.htlcAddr, argv.secretKey);
    })
    .strictCommands()
    .argv;

async function query(htlcAddr) {
    async function getBots(htlc) {
        const bots = [];
        for (let i = 0; ; i++) {
            process.stdout.write(".");
            try {
                const botAddr = await htlc.marketMakerAddrs(i);
                const botInfo = await htlc.marketMakers(botAddr);
                // console.log(botInfo);
                bots.push({
                    addr: botInfo.addr,
                    intro: ethers.utils.parseBytes32String(botInfo.intro),
                    bchPkh: botInfo.bchPkh,
                    bchLockTime: botInfo.bchLockTime,
                    sbchLockTime: botInfo.sbchLockTime,
                    penaltyBPS: botInfo.penaltyBPS,
                    feeBPS: botInfo.feeBPS,
                });
            } catch (err) {
                // console.log(err);
                break;
            }
        }
        return bots;
    }

    async function getSwaps(htlc) {
        const states = ["INVALID", "OPEN", "CLOSED", "EXPIRED"];
        const swaps = [];
        for (let i = 0; ; i++) {
            process.stdout.write(".");
            try {
                const secretLock = await htlc.secretLocks(i);
                const swap = await htlc.swaps(secretLock);
                swaps.push({
                    timelock: swap.timelock.toNumber(),
                    value: ethers.utils.formatUnits(swap.value),
                    ethTrader: swap.ethTrader.substring(0, 10) + '...',
                    withdrawTrader: swap.withdrawTrader.substring(0, 10) + '...',
                    bchWithdrawPKH: swap.bchWithdrawPKH.substring(0, 10) + '...',
                    penaltyBPS: swap.penaltyBPS,
                    secretLock: secretLock.substring(0, 10) + '...',
                    secretKey: swap.secretKey.substring(0, 10) + '...',
                    state: states[swap.state],
                });
            } catch (err) {
                break;
            }
        }
        return swaps;
    }

    const HTLC = await ethers.getContractFactory("AtomicSwapEther");
    const htlc = await HTLC.attach(htlcAddr);

    const bots = await getBots(htlc);
    console.log('\nbots:');
    console.table(bots);

    const swaps = await getSwaps(htlc);
    console.log('\nswaps:');
    console.table(swaps);
}

async function registerBot(signerIdx, htlcAddr, intro, pkh, 
        bchLockTime, sbchLockTime, penaltyBPS, feeBPS, minSwapAmt, maxSwapAmt, statusChecker) {

    console.log('register bot ...');
    const [signer, htlc] = await getHTLC(signerIdx, htlcAddr);
    console.log('signer:', signer.address);

    const botIntro = ethers.utils.formatBytes32String(intro);
    const tx = await htlc.registerMarketMaker(botIntro, pkh,
        bchLockTime, sbchLockTime, penaltyBPS, feeBPS, minSwapAmt, maxSwapAmt, statusChecker);
    console.log('tx:', tx);
    console.log('result:', await tx.wait());
}

async function lockBCH(signerIdx, htlcAddr, toAddr, secretKey, lockTime, pkh, penaltyBPS, amount) {
    console.log('lock sBCH ...');
    const [signer, htlc] = await getHTLC(signerIdx, htlcAddr);
    console.log('signer:', signer.address);

    secretKey = ethers.utils.formatBytes32String(secretKey);
    const secretLock = ethers.utils.sha256(secretKey);
    const tx = await htlc.open(toAddr, secretLock, lockTime, pkh, penaltyBPS,
        { value: ethers.utils.parseEther(amount) });
    console.log('tx:', tx);
    console.log('result:', await tx.wait());
}

async function unlockBCH(signerIdx, htlcAddr, secretKey) {
    console.log('unlock sBCH ...');
    const [signer, htlc] = await getHTLC(signerIdx, htlcAddr);
    console.log('signer:', signer.address);

    secretKey = ethers.utils.formatBytes32String(secretKey);
    const secretLock = ethers.utils.sha256(secretKey);
    const tx = await htlc.close(secretLock, secretKey);
    console.log('tx:', tx);
    console.log('result:', await tx.wait());
}

async function refundBCH(signerIdx, htlcAddr, secretKey) {
    console.log('refund sBCH ...');
    const [signer, htlc] = await getHTLC(signerIdx, htlcAddr);

    secretKey = ethers.utils.formatBytes32String(secretKey);
    const secretLock = ethers.utils.sha256(secretKey);
    const tx = await htlc.expire(secretLock);
    console.log('tx:', tx);
    console.log('result:', await tx.wait());
}

async function getHTLC(signerIdx, htlcAddr) {
    const signers = await ethers.getSigners();
    const signer = signers[signerIdx];

    const HTLC = await ethers.getContractFactory("AtomicSwapEther");
    const htlc = await HTLC.attach(htlcAddr).connect(signer);

    return [signer, htlc];
}
