const {
  time, mine,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HTLC", function () {

  const minStakedValue = 1234567890;
  const minRetireDelay = 12 * 3600;

  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, bot1, bot2, user1, user2, statusChecker1, statusChecker2] = await ethers.getSigners();

    const HTLC = await ethers.getContractFactory("AtomicSwapEther");
    const htlc = await HTLC.deploy(minStakedValue, minRetireDelay);

    return { htlc, owner, bot1, bot2, user1, user2, statusChecker1, statusChecker2 };
  }

  // test data
  const intro1        = ethers.utils.formatBytes32String('bot1');
  const intro2        = ethers.utils.formatBytes32String('bot2');
  const intro3        = ethers.utils.formatBytes32String('bot3');
  const intro4        = ethers.utils.formatBytes32String('bot4');
  const pkh1          = '0x4d027fdd0585302264922bed58b8a84d38776ccb';
  const pkh2          = '0xa47165ef477c99a53cdeb846a7687a069d7df27c';
  const bchLockTime1  = 12 * 6;
  const sbchLockTime1 = 12 * 3600;
  const penaltyBPS1   = 500;
  const bchPrice      = ethers.utils.parseUnits('1.1');
  const sbchPrice     = ethers.utils.parseUnits('0.9');
  const minSwapAmt1   = ethers.utils.parseUnits('0.1');
  const maxSwapAmt1   = ethers.utils.parseUnits('1.0')
  const zeroBytes32   = ethers.utils.formatBytes32String('');
  const secretKey1    = ethers.utils.formatBytes32String('123');
  const secretKey2    = ethers.utils.formatBytes32String('456');      
  const secretLock1   = ethers.utils.sha256(secretKey1);
  const secretLock2   = ethers.utils.sha256(secretKey2);

  // Swap States
  const INVALID  = 0;
  const LOCKED   = 1;
  const UNLOCKED = 2;
  const REFUNDED = 3;

  describe("MarketMaker", function () {

    it("registerMarketMaker: errors", async function () {
      const { htlc, bot1, bot2, statusChecker1, statusChecker2 } = await loadFixture(deployFixture);

      await expect(htlc.registerMarketMaker(intro1, pkh1, 0, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue}))
        .to.be.revertedWith("zero-bch-lock-time");
      await expect(htlc.registerMarketMaker(intro1, pkh1, bchLockTime1, 10000, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue}))
        .to.be.revertedWith("invalid-penalty-bps");
      await expect(htlc.registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, maxSwapAmt1, minSwapAmt1, statusChecker1.address, {value: minStakedValue}))
        .to.be.revertedWith("invalid-swap-amt");
      await expect(htlc.registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue-1}))
        .to.be.revertedWith("not-enough-staked-val");

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue});
      await expect(htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue}))
        .to.be.revertedWith("registered-address");
    });

    it("registerMarketMaker: ok", async function () {
      const { htlc, bot1, bot2, statusChecker1, statusChecker2 } = await loadFixture(deployFixture);

      await expect(htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue+1}))
        .to.changeEtherBalances([bot1.address, htlc.address], [-minStakedValue-1, minStakedValue+1]);
      await expect(htlc.connect(bot2).registerMarketMaker(intro2, pkh2, bchLockTime1*2, penaltyBPS1*2, bchPrice, sbchPrice.mul(2), minSwapAmt1.mul(2), maxSwapAmt1.mul(2), statusChecker2.address, {value: minStakedValue+2}))
        .to.changeEtherBalances([bot2.address, htlc.address], [-minStakedValue-2, minStakedValue+2]);

      expect(await htlc.marketMakerByAddress(bot1.address)).to.deep.equal([
        bot1.address, 0, intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, minStakedValue+1, statusChecker1.address, false]);
      expect(await htlc.marketMakerByAddress(bot2.address)).to.deep.equal([
        bot2.address, 0, intro2, pkh2, bchLockTime1*2, sbchLockTime1*2, penaltyBPS1*2, bchPrice, sbchPrice.mul(2), minSwapAmt1.mul(2), maxSwapAmt1.mul(2), minStakedValue+2, statusChecker2.address, false]);
    });

    it("updateMarketMaker", async function () {
      const { htlc, bot1, bot2, statusChecker1 } = await loadFixture(deployFixture);

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue});
      expect(await htlc.marketMakerByAddress(bot1.address).then(x => [x.intro, x.bchPrice, x.sbchPrice]))
        .to.deep.equal([intro1, bchPrice, sbchPrice]);

      await htlc.connect(bot1).updateMarketMaker(intro2, sbchPrice, bchPrice);
      expect(await htlc.marketMakerByAddress(bot1.address).then(x => [x.intro, x.sbchPrice, x.bchPrice]))
        .to.deep.equal([intro2, bchPrice, sbchPrice]);

      await expect(htlc.connect(bot2).updateMarketMaker(intro1, bchPrice, bchPrice))
        .to.be.revertedWith("not-registered");
      await expect(htlc.updateMarketMaker(intro2, bchPrice, bchPrice))
        .to.be.revertedWith("not-registered");
    });

    it("setUnavailable", async function () {
      const { htlc, bot1, bot2, statusChecker1, statusChecker2 } = await loadFixture(deployFixture);
      await expect(htlc.setUnavailable(bot1.address, true))
        .to.be.revertedWith("not-registered");

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue});
      await expect(htlc.connect(statusChecker2).setUnavailable(bot1.address, true))
      .to.be.revertedWith("not-status-checker");

      expect(await htlc.marketMakerByAddress(bot1.address).then(x => x.unavailable)).to.equal(false);
      await htlc.connect(statusChecker1).setUnavailable(bot1.address, true)
      expect(await htlc.marketMakerByAddress(bot1.address).then(x => x.unavailable)).to.equal(true);
    });

    it("retireMarketMaker", async function () {
      const { htlc, bot1, bot2, statusChecker1 } = await loadFixture(deployFixture);

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue});
      expect(await htlc.marketMakerByAddress(bot1.address).then(x => x.retiredAt)).to.equal(0);

      await htlc.connect(bot1).retireMarketMaker();
      expect(await htlc.marketMakerByAddress(bot1.address).then(x => x.retiredAt)).to.gt(0);

      await expect(htlc.connect(bot2).retireMarketMaker())
        .to.be.revertedWith("not-registered");
      await expect(htlc.retireMarketMaker())
        .to.be.revertedWith("not-registered");
      await expect(htlc.connect(bot1).retireMarketMaker())
        .to.be.revertedWith("already-retired");
    });

    it("withdrawStakedValue", async function () {
      const { htlc, bot1, bot2, statusChecker1 } = await loadFixture(deployFixture);

      await expect(htlc.connect(bot1).withdrawStakedValue())
        .to.be.revertedWith("not-registered");

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue*2});
      await expect(htlc.connect(bot1).withdrawStakedValue())
        .to.be.revertedWith("not-retired");

      await htlc.connect(bot1).retireMarketMaker();
      await expect(htlc.connect(bot1).withdrawStakedValue())
        .to.be.revertedWith("not-ready-to-withdraw");

      await time.increase(6 * 3600);
      await expect(htlc.connect(bot1).withdrawStakedValue())
        .to.be.revertedWith("not-ready-to-withdraw");

      await time.increase(6 * 3600);
      await expect(htlc.connect(bot1).withdrawStakedValue())
        .to.changeEtherBalances([bot1.address, htlc.address], [minStakedValue*2, -minStakedValue*2]);

      await expect(htlc.connect(bot1).withdrawStakedValue())
        .to.be.revertedWith("nothing-to-withdraw");
    });

    it("getMarketMakers", async function() {
      const { htlc, bot1, bot2, user1, user2, statusChecker1 } = await loadFixture(deployFixture);

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue+1});
      await htlc.connect(bot2).registerMarketMaker(intro2, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue+2});
      await htlc.connect(user1).registerMarketMaker(intro3, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue+3});
      await htlc.connect(user2).registerMarketMaker(intro4, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue+4});

      expect((await htlc.getMarketMakers(100, 200)).map(x => x.intro))
        .to.deep.equal([]);
      expect((await htlc.getMarketMakers(0, 100)).map(x => x.intro))
        .to.deep.equal([intro1, intro2, intro3, intro4]);
      expect((await htlc.getMarketMakers(1, 100)).map(x => x.intro))
        .to.deep.equal([intro2, intro3, intro4]);
      expect((await htlc.getMarketMakers(0, 4)).map(x => x.intro))
        .to.deep.equal([intro1, intro2, intro3, intro4]);
      expect((await htlc.getMarketMakers(0, 3)).map(x => x.intro))
        .to.deep.equal([intro1, intro2, intro3]);
      expect((await htlc.getMarketMakers(1, 2)).map(x => x.intro))
        .to.deep.equal([intro2, intro3]);
      expect((await htlc.getMarketMakers(1, 3)).map(x => x.intro))
        .to.deep.equal([intro2, intro3, intro4]);

      await htlc.connect(bot2).retireMarketMaker();
      await time.increase(minRetireDelay);
      await htlc.connect(bot2).withdrawStakedValue();
      expect((await htlc.getMarketMakers(0, 4)).map(x => x.intro))
        .to.deep.equal([intro1, intro4, intro3]);

      // call marketMakerByAddress()
      // const result = await htlc.provider.call({
      //   to: htlc.address,
      //   data: bot1.address.replace('0x', '0xe670ce1f000000000000000000000000'),
      // });
      // console.log(result);
    });

  });

  describe("AtomicSwap", function () {

    const expectedPrice = ethers.utils.parseEther('1.0');

    it("lock: errors", async function () {
      const { htlc, bot1, bot2, user1, user2, statusChecker1, statusChecker2 } = await loadFixture(deployFixture);

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker1.address, {value: minStakedValue});
      await htlc.connect(bot2).registerMarketMaker(intro2, pkh2, bchLockTime1, penaltyBPS1, bchPrice, sbchPrice, minSwapAmt1, maxSwapAmt1, statusChecker2.address, {value: minStakedValue});

      await expect(htlc.connect(user1).lock(bot1.address, secretLock2, sbchLockTime1, pkh2, penaltyBPS1, false, expectedPrice))
        .to.be.revertedWith("receiver-is-mm");

      await htlc.connect(statusChecker2).setUnavailable(bot2.address, true);
      await expect(htlc.connect(bot2).lock(user1.address, secretLock2, sbchLockTime1, pkh2, penaltyBPS1, false, expectedPrice))
        .to.be.revertedWith("sender-is-unavailable");

      await htlc.connect(bot2).retireMarketMaker();
      await expect(htlc.connect(bot2).lock(user1.address, secretLock2, sbchLockTime1, pkh2, penaltyBPS1, false, expectedPrice))
        .to.be.revertedWith("sender-is-retired");

      await expect(htlc.connect(bot1).lock(user1.address, secretLock1, sbchLockTime1, pkh2, penaltyBPS1, true, expectedPrice))
        .to.be.revertedWith("sender-is-mm");
      await expect(htlc.connect(user1).lock(user2.address, secretLock2, sbchLockTime1, pkh2, penaltyBPS1, true, expectedPrice))
        .to.be.revertedWith("receiver-not-mm");
      await expect(htlc.connect(user1).lock(bot1.address, secretLock1, sbchLockTime1/2, pkh1, penaltyBPS1, true, expectedPrice))
        .to.be.revertedWith("sbch-lock-time-mismatch");
      await expect(htlc.connect(user1).lock(bot1.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1/2, true, expectedPrice))
        .to.be.revertedWith("penalty-bps-mismatch");
      await expect(htlc.connect(user1).lock(bot1.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, true, expectedPrice, {value: minSwapAmt1.sub(1)}))
        .to.be.revertedWith("value-out-of-range");
      await expect(htlc.connect(user1).lock(bot1.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, true, expectedPrice, {value: maxSwapAmt1.add(1)}))
        .to.be.revertedWith("value-out-of-range");
      await expect(htlc.connect(user1).lock(bot2.address, secretLock2, sbchLockTime1, pkh2, penaltyBPS1, true, expectedPrice, {value: minSwapAmt1.add(1)}))
        .to.be.revertedWith("market-maker-retired");

      // ok
      await htlc.connect(user1).lock(bot1.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, true, expectedPrice, {value: minSwapAmt1.add(1)});

      await expect(htlc.connect(user1).lock(user1.address, secretLock1, sbchLockTime1, pkh2, penaltyBPS1, false, expectedPrice))
        .to.be.revertedWith("used-secret-lock");
      await expect(htlc.connect(user2).lock(user1.address, secretLock2, sbchLockTime1, pkh2, 10000, false, expectedPrice))
        .to.be.revertedWith("invalid-penalty-bps");

      await htlc.connect(statusChecker1).setUnavailable(bot1.address, true);
      await expect(htlc.connect(user1).lock(bot1.address, secretLock2, sbchLockTime1, pkh1, penaltyBPS1, true, expectedPrice, {value: minSwapAmt1.add(1)}))
        .to.be.revertedWith("unavailable");
    });

    it("lock: ok", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      const amt1 = 123456789;
      await expect(htlc.connect(user1).lock(user2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, false, expectedPrice, {value: amt1}))
        .to.changeEtherBalances([user1.address, htlc.address], [-amt1, amt1])
        .to.emit(htlc, "Lock").withArgs(user1.address, user2.address, secretLock1, anyValue, amt1, pkh1, anyValue, penaltyBPS1, expectedPrice);

      const amt2 = 234567890;
      await expect(htlc.connect(user2).lock(user1.address, secretLock2, sbchLockTime1, pkh2, penaltyBPS1, false, expectedPrice, {value: amt2}))
        .to.changeEtherBalances([user2.address, htlc.address], [-amt2, amt2])
        .to.emit(htlc, "Lock").withArgs(user2.address, user1.address, secretLock2, anyValue, amt2, pkh2, anyValue, penaltyBPS1, expectedPrice);

      // expect(await htlc.secretLocks(0)).to.equal(secretLock1);
      // expect(await htlc.secretLocks(1)).to.equal(secretLock2);

      const swap0 = await htlc.swaps(user1.address, secretLock1);
    //expect(swap0.timelock).to.equal(0);
      expect(swap0.value).to.equal(amt1);
      expect(swap0.sender).to.equal(user1.address);
      expect(swap0.receiver).to.equal(user2.address);
      expect(swap0.receiverBchPkh).to.equal(pkh1);
      expect(swap0.penaltyBPS).to.equal(penaltyBPS1);
      expect(swap0.secretKey).to.equal(zeroBytes32);
      expect(swap0.state).to.equal(LOCKED);

      expect(await htlc.getSwapState(user1.address, secretLock1))
        .to.be.equal(LOCKED);
      expect(await htlc.getSwapState(user1.address, ethers.utils.sha256('0xfafafafafa')))
        .to.be.equal(INVALID);
    });

    it("unlock: errors", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      await htlc.connect(user1).lock(user2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, false, expectedPrice, {value: 12345});

      await expect(htlc.unlock(user1.address, secretLock2, secretLock1))
        .to.be.revertedWith("not-locked");
      await expect(htlc.unlock(user2.address, secretLock1, secretLock1))
        .to.be.revertedWith("not-locked");
      await expect(htlc.unlock(user1.address, secretLock1, secretLock2))
        .to.be.revertedWith("invalid-key");

      // chain halted
      await time.increase(sbchLockTime1 + 10);
      await expect(htlc.unlock(user1.address, secretLock1, secretKey1))
        .to.be.revertedWith("no-unlock-when-chain-halted");
    });

    it("unlock: ok", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      const amt = 123456789;
      await htlc.connect(user1).lock(user2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, false, expectedPrice, {value: amt});

      await expect(htlc.unlock(user1.address, secretLock1, secretKey1))
        .to.changeEtherBalances([htlc.address, user2.address], [-amt, amt])
        .to.emit(htlc, "Unlock").withArgs(secretLock1, secretKey1);

      const swap0 = await htlc.swaps(user1.address, secretLock1);
      expect(swap0.secretKey).to.equal(secretKey1);
      expect(swap0.state).to.equal(UNLOCKED);

      expect(await htlc.getSwapState(user1.address, secretLock1))
        .to.be.equal(UNLOCKED);
    });

    it("refund: errors", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      await htlc.connect(user1).lock(user2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, false, expectedPrice, {value: 12345});

      await expect(htlc.refund(user1.address, secretLock2))
        .to.be.revertedWith("not-locked");
      await expect(htlc.refund(user1.address, secretLock1))
        .to.be.revertedWith("not-refundable");

      // chain halted
      await time.increase(sbchLockTime1 + 10);
      await expect(htlc.refund(user1.address, secretLock1))
        .to.be.revertedWith("not-refundable");
    });

    it("refund: ok", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      await htlc.connect(user1).lock(user2.address, secretLock1, sbchLockTime1, pkh1, 500, false, expectedPrice, {value: 20000});

      await time.increase(sbchLockTime1 + 10);
      await mine(sbchLockTime1/6 + 10);
      await expect(htlc.refund(user1.address, secretLock1))
        .to.changeEtherBalances([htlc.address, user1.address, user2.address], [-20000, 19000, 1000])
        .to.be.emit(htlc, "Refund").withArgs(secretLock1);

      expect(await htlc.getSwapState(user1.address, secretLock1))
        .to.be.equal(REFUNDED);

      // print Expire event
      // const logs = await htlc.provider.getLogs({address: htlc.address});
      // console.log(JSON.stringify(logs, null, '  '));

      // call getSwapState(secretLock1)
      // const result = await htlc.provider.call({
      //   to: htlc.address,
      //   data: secretLock1.replace('0x', '0xdb9b6d06'),
      // });
      // console.log(result);
    });

  });

});
