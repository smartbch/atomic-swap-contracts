const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HTLC", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, bot1, bot2, user1, user2, statusChecker1, statusChecker2] = await ethers.getSigners();

    const HTLC = await ethers.getContractFactory("AtomicSwapEther");
    const htlc = await HTLC.deploy();

    return { htlc, owner, bot1, bot2, user1, user2, statusChecker1, statusChecker2 };
  }

  // test data
  const intro1        = ethers.utils.formatBytes32String('bot1');
  const intro2        = ethers.utils.formatBytes32String('bot1');
  const pkh1          = '0x4d027fdd0585302264922bed58b8a84d38776ccb';
  const pkh2          = '0xa47165ef477c99a53cdeb846a7687a069d7df27c';
  const bchLockTime1  = 12 * 6;
  const sbchLockTime1 = 12 * 3600;
  const penaltyBPS1   = 500;
  const feeBPS1       = 100;
  const minSwapAmt1   = ethers.utils.parseUnits('0.1');
  const maxSwapAmt1   = ethers.utils.parseUnits('1.0')
  const zeroBytes32   = ethers.utils.formatBytes32String('');
  const secretKey1    = ethers.utils.formatBytes32String('123');
  const secretKey2    = ethers.utils.formatBytes32String('456');      
  const secretLock1   = ethers.utils.sha256(secretKey1);
  const secretLock2   = ethers.utils.sha256(secretKey2);

  // Swap States
  const INVALID = 0;
  const OPEN    = 1;
  const CLOSED  = 2;
  const EXPIRED = 3;

  describe("MarketMaker", function () {

    it("registerMarketMaker", async function () {
      const { htlc, bot1, bot2, statusChecker1, statusChecker2  } = await loadFixture(deployFixture);

      await expect(htlc.registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, 10000, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker1.address))
        .to.be.revertedWith("invalid-penalty-bps");
      await expect(htlc.registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, 10000, minSwapAmt1, maxSwapAmt1, statusChecker1.address))
        .to.be.revertedWith("invalid-fee-bps");
      await expect(htlc.registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, maxSwapAmt1, minSwapAmt1, statusChecker1.address))
        .to.be.revertedWith("invalid-swap-amt");

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker1.address);
      await expect(htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker1.address))
        .to.be.revertedWith("registered-address");

      await htlc.connect(bot2).registerMarketMaker(intro2, pkh2, bchLockTime1*2, sbchLockTime1*2, penaltyBPS1*2, feeBPS1*2, minSwapAmt1.mul(2), maxSwapAmt1.mul(2), statusChecker2.address);
      
      expect(await htlc.marketMakers(bot1.address)).to.deep.equal([
        bot1.address, 0, intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker1.address, false]);
      expect(await htlc.marketMakers(bot2.address)).to.deep.equal([
        bot2.address, 0, intro2, pkh2, bchLockTime1*2, sbchLockTime1*2, penaltyBPS1*2, feeBPS1*2, minSwapAmt1.mul(2), maxSwapAmt1.mul(2), statusChecker2.address, false]);
    });

    it("updateMarketMaker", async function () {
      const { htlc, bot1, bot2, statusChecker1 } = await loadFixture(deployFixture);

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker1.address);
      expect(await htlc.marketMakers(bot1.address).then(x => x.intro)).to.equal(intro1);

      await htlc.connect(bot1).updateMarketMaker(intro2);
      expect(await htlc.marketMakers(bot1.address).then(x => x.intro)).to.equal(intro1);

      await expect(htlc.connect(bot2).updateMarketMaker(intro1))
        .to.be.revertedWith("not-registered");
      await expect(htlc.updateMarketMaker(intro2))
        .to.be.revertedWith("not-registered");
    });

    it("retireMarketMaker", async function () {
      const { htlc, bot1, bot2, statusChecker1 } = await loadFixture(deployFixture);

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker1.address);
      expect(await htlc.marketMakers(bot1.address).then(x => x.retiredAt)).to.equal(0);

      await htlc.connect(bot1).retireMarketMaker(24 * 3600);
      expect(await htlc.marketMakers(bot1.address).then(x => x.retiredAt)).to.gt(0);

      await expect(htlc.connect(bot2).retireMarketMaker(123))
        .to.be.revertedWith("not-registered");
      await expect(htlc.retireMarketMaker(123))
        .to.be.revertedWith("not-registered");
      await expect(htlc.connect(bot1).retireMarketMaker(24 * 3600))
        .to.be.revertedWith("already-set-retire-time");
    });

    it("setUnavailable", async function () {
      const { htlc, bot1, bot2, statusChecker1, statusChecker2 } = await loadFixture(deployFixture);
      await expect(htlc.setUnavailable(bot1.address, true))
        .to.be.revertedWith("not-registered");

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker1.address);
      await expect(htlc.connect(statusChecker2).setUnavailable(bot1.address, true))
      .to.be.revertedWith("not-status-checker");

      expect(await htlc.marketMakers(bot1.address).then(x => x.unavailable)).to.equal(false);
      await htlc.connect(statusChecker1).setUnavailable(bot1.address, true)
      expect(await htlc.marketMakers(bot1.address).then(x => x.unavailable)).to.equal(true);
    });
  });

  describe("AtomicSwap", function () {

    it("open: errors", async function () {
      const { htlc, bot1, bot2, user1, user2, statusChecker1, statusChecker2 } = await loadFixture(deployFixture);

      await htlc.connect(bot1).registerMarketMaker(intro1, pkh1, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker1.address);
      await htlc.connect(bot2).registerMarketMaker(intro2, pkh2, bchLockTime1, sbchLockTime1, penaltyBPS1, feeBPS1, minSwapAmt1, maxSwapAmt1, statusChecker2.address);
      await htlc.connect(bot2).retireMarketMaker(0);

      await expect(htlc.connect(user1).open(bot1.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1/2))
        .to.be.revertedWith("penalty-bps-mismatch");
      await expect(htlc.connect(user1).open(bot1.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, {value: minSwapAmt1.sub(1)}))
        .to.be.revertedWith("value-out-of-range");
      await expect(htlc.connect(user1).open(bot1.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, {value: maxSwapAmt1.add(1)}))
        .to.be.revertedWith("value-out-of-range");
      await expect(htlc.connect(user1).open(bot2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, {value: minSwapAmt1.add(1)}))
        .to.be.revertedWith("market-maker-retired");

      // ok
      htlc.connect(user1).open(bot1.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, {value: minSwapAmt1.add(1)});

      await expect(htlc.connect(user2).open(user1.address, secretLock1, sbchLockTime1, pkh2, penaltyBPS1))
        .to.be.revertedWith("used-secret-lock");
      await expect(htlc.connect(user2).open(user1.address, secretLock2, sbchLockTime1, pkh2, 10000))
        .to.be.revertedWith("invalid-penalty-bps");
    });

    it("open: ok", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      const amt1 = 123456789;
      await expect(htlc.connect(user1).open(user2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, {value: amt1}))
        .to.changeEtherBalances([user1.address, htlc.address], [-amt1, amt1])
        .to.emit(htlc, "Open").withArgs(user1.address, user2.address, secretLock1, anyValue, amt1, pkh1, anyValue, penaltyBPS1);

      const amt2 = 234567890;
      await expect(htlc.connect(user2).open(user1.address, secretLock2, sbchLockTime1, pkh2, penaltyBPS1, {value: amt2}))
        .to.changeEtherBalances([user2.address, htlc.address], [-amt2, amt2])
        .to.emit(htlc, "Open").withArgs(user2.address, user1.address, secretLock2, anyValue, amt2, pkh2, anyValue, penaltyBPS1);

      expect(await htlc.secretLocks(0)).to.equal(secretLock1);
      expect(await htlc.secretLocks(1)).to.equal(secretLock2);

      const swap0 = await htlc.swaps(secretLock1);
    //expect(swap0.timelock).to.equal(0);
      expect(swap0.value).to.equal(amt1);
      expect(swap0.ethTrader).to.equal(user1.address);
      expect(swap0.withdrawTrader).to.equal(user2.address);
      expect(swap0.bchWithdrawPKH).to.equal(pkh1);
      expect(swap0.penaltyBPS).to.equal(penaltyBPS1);
      expect(swap0.secretKey).to.equal(zeroBytes32);
      expect(swap0.state).to.equal(OPEN);
    });

    it("close: errors", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      await htlc.connect(user1).open(user2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, {value: 12345});

      await expect(htlc.close(secretLock2, secretLock1))
        .to.be.revertedWith("not-open");
      await expect(htlc.close(secretLock1, secretLock2))
        .to.be.revertedWith("invalid-key");
    });

    it("close: ok", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      const amt = 123456789;
      await htlc.connect(user1).open(user2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, {value: amt});

      await expect(htlc.close(secretLock1, secretKey1))
        .to.changeEtherBalances([htlc.address, user2.address], [-amt, amt])
        .to.emit(htlc, "Close").withArgs(secretLock1, secretKey1);

      const swap0 = await htlc.swaps(secretLock1);
      expect(swap0.secretKey).to.equal(secretKey1);
      expect(swap0.state).to.equal(CLOSED);
    });

    it("expire: errors", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      await htlc.connect(user1).open(user2.address, secretLock1, sbchLockTime1, pkh1, penaltyBPS1, {value: 12345});

      await expect(htlc.expire(secretLock2))
        .to.be.revertedWith("not-open");
      await expect(htlc.expire(secretLock1))
        .to.be.revertedWith("not-expirable");
    });

    it("expire: ok", async function () {
      const { htlc, user1, user2 } = await loadFixture(deployFixture);

      await htlc.connect(user1).open(user2.address, secretLock1, sbchLockTime1, pkh1, 500, {value: 20000});

      await time.increase(sbchLockTime1 + 10);
      await expect(htlc.expire(secretLock1))
        .to.changeEtherBalances([htlc.address, user1.address, user2.address], [-20000, 19000, 1000])
        .to.be.emit(htlc, "Expire").withArgs(secretLock1);
    });

  });

});
