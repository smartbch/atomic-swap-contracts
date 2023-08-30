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
            .option('penalty-bps',    { required: true, type: 'number', description: 'penalty ratio of HTLC refund (in BPS)'})
            .option('bch-price',      { required: true, type: 'string', description: 'BCH price (in sBCH)' })
            .option('sbch-price',     { required: true, type: 'string', description: 'sBCH price (in BCH)' })
            .option('min-swap-amt',   { required: true, type: 'string', description: "min amount of swap (in Ethers)"})
            .option('max-swap-amt',   { required: true, type: 'string', description: "max amount of swap (in Ethers)"})
            .option('status-checker', { required: true, type: 'string', description: "status checker" })
            .option('staked-val',     { required: true, type: 'string', description: "staked value" })
            ;
    }, async (argv) => {
        await registerBot(argv.signer, argv.htlcAddr, argv.intro, argv.pkh, 
            argv.bchLockTime, argv.penaltyBps,
            ethers.utils.parseEther(argv.bchPrice),
            ethers.utils.parseEther(argv.sbchPrice),
            ethers.utils.parseEther(argv.minSwapAmt),
            ethers.utils.parseEther(argv.maxSwapAmt), 
            ethers.utils.parseEther(argv.stakedVal), 
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
                // const botAddr = await htlc.marketMakerAddrs(i);
                const mms = await htlc.getMarketMakers(i, 1);
                if (mms.length == 0) {
                    break;
                }

                const botInfo = mms[0];
                // console.log(botInfo);
                bots.push({
                    addr        : botInfo.addr,
                    intro       : ethers.utils.parseBytes32String(botInfo.intro),
                    bchPkh      : botInfo.bchPkh,
                    bchLockTime : botInfo.bchLockTime,
                    sbchLockTime: botInfo.sbchLockTime,
                    penaltyBPS  : botInfo.penaltyBPS,
                    bchPrice    : ethers.utils.formatUnits(botInfo.bchPrice),
                    sbchPrice   : ethers.utils.formatUnits(botInfo.sbchPrice),
                    minSwapAmt  : ethers.utils.formatUnits(botInfo.minSwapAmt),
                    maxSwapAmt  : ethers.utils.formatUnits(botInfo.maxSwapAmt),
                    stakedValue : ethers.utils.formatUnits(botInfo.stakedValue),
                    retiredAt   : botInfo.retiredAt.toNumber(),
                });
            } catch (err) {
                // console.log(err);
                break;
            }
        }
        return bots;
    }

    async function getSwaps(htlc) {
        const states = ["INVALID", "LOCKED", "UNLOCKED", "REFUNDED"];
        const swaps = [];
        for (let i = 0; ; i++) {
            process.stdout.write(".");
            try {
                const secretLock = await htlc.secretLocks(i);
                const swap = await htlc.swaps(secretLock);
                swaps.push({
                    timelock      : swap.timelock.toNumber(),
                    value         : ethers.utils.formatUnits(swap.value),
                    sender        : swap.sender.substring(0, 10) + '...',
                    receiver      : swap.receiver.substring(0, 10) + '...',
                    receiverBchPkh: swap.receiverBchPkh.substring(0, 10) + '...',
                    penaltyBPS    : swap.penaltyBPS,
                    secretLock    : secretLock.substring(0, 10) + '...',
                    secretKey     : swap.secretKey.substring(0, 10) + '...',
                    state         : states[swap.state],
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
        bchLockTime, penaltyBPS, bchPrice, sbchPrice, minSwapAmt, maxSwapAmt, stakedVal,
        statusChecker) {

    console.log('register bot ...');
    const [signer, htlc] = await getHTLC(signerIdx, htlcAddr);
    console.log('signer:', signer.address);

    const botIntro = ethers.utils.formatBytes32String(intro);
    const tx = await htlc.registerMarketMaker(botIntro, pkh,
        bchLockTime, penaltyBPS, bchPrice, sbchPrice, minSwapAmt, maxSwapAmt, statusChecker,
        {value: stakedVal});
    console.log('tx:', tx);
    console.log('result:', await tx.wait());
}

async function lockBCH(signerIdx, htlcAddr, toAddr, secretKey, lockTime, pkh, penaltyBPS, amount) {
    console.log('lock sBCH ...');
    const [signer, htlc] = await getHTLC(signerIdx, htlcAddr);
    console.log('signer:', signer.address);

    secretKey = ethers.utils.formatBytes32String(secretKey);
    const secretLock = ethers.utils.sha256(secretKey);
    const tx = await htlc.lock(toAddr, secretLock, lockTime, pkh, penaltyBPS, false,
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
    const tx = await htlc.unlock(secretLock, secretKey);
    console.log('tx:', tx);
    console.log('result:', await tx.wait());
}

async function refundBCH(signerIdx, htlcAddr, secretKey) {
    console.log('refund sBCH ...');
    const [signer, htlc] = await getHTLC(signerIdx, htlcAddr);

    secretKey = ethers.utils.formatBytes32String(secretKey);
    const secretLock = ethers.utils.sha256(secretKey);
    const tx = await htlc.refund(secretLock);
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
