//SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// import "hardhat/console.sol";

// HTLC EVM contract, initial version comes from:
// https://github.com/confio/eth-atomic-swap/blob/master/contracts/AtomicSwapEther.sol
contract AtomicSwapEther {
    using EnumerableSet for EnumerableSet.AddressSet;

    // Market maker info
    struct MarketMaker {
        address addr;          // EVM address
        uint64  retiredAt;     // retired time
        bytes32 intro;         // introduction
        bytes20 bchPkh;        // BCH P2PKH address
        uint16  bchLockTime;   // BCH HTLC lock time (in blocks)
        uint32  sbchLockTime;  // sBCH HTLC lock time (in seconds)
        uint16  penaltyBPS;    // refund penalty ratio (in BPS)
        uint256 bchPrice;      // BCH price (in sBCH)
        uint256 sbchPrice;     // sBCH price (in BCH)
        uint256 minSwapAmt;    //
        uint256 maxSwapAmt;    //
        uint256 stakedValue;   // to prevent spam bots
        address statusChecker; // the one who can set unavailable status
        bool    unavailable;   // 
    }

    // Swap info
    struct Swap {
        bool    receiverIsMM;     // the locked coins will be unlocked a MarketMaker
        uint64  startTime;        // lock time
        uint64  startHeight;      // lock height
        uint32  validPeriod;      // valid time span (in seconds)
        address payable sender;   // the locker
        address payable receiver; // the unlocker
        uint96  value;            // locked value
        bytes20 receiverBchPkh;   // BCH recipient address (P2PKH)
        uint16  penaltyBPS;       // refund penalty ratio (in BPS)
        States  state;            //
        bytes32 secretKey;        // 
        uint256 expectedPrice;    // read by frontend
    }

    // Swap states
    enum States { INVALID, LOCKED, UNLOCKED, REFUNDED }


    uint immutable public MIN_STAKED_VALUE;
    uint immutable public MIN_RETIRE_DELAY;

    uint constant private HALT_TIME = 1800;
    uint32 constant private BLOCK_INTERVAL = 6;


    // All swaps, (sender, secretLock) => Swap
    mapping (address => mapping (bytes32 => Swap)) public swaps;

    // Market maker registry
    mapping (address => MarketMaker) private marketMakers; // public will cause 'CompilerError: Stack too deep'
    EnumerableSet.AddressSet private marketMakerAddrs;


    constructor (uint256 minStakedValue, uint256 minRetireDelay) {
        MIN_STAKED_VALUE = minStakedValue;
        MIN_RETIRE_DELAY = minRetireDelay;
    }

    // Events
    event Lock(address indexed _sender,
               address indexed _receiver,
               bytes32 _secretLock,
               uint256 _unlockTime,
               uint256 _value,
               bytes20 _receiverBchPkh,
               uint256 _createdTime,
               uint16  _penaltyBPS,
               uint256 _expectedPrice);
    event Refund(bytes32 indexed _secretLock);
    event Unlock(bytes32 indexed _secretLock, 
                 bytes32 indexed _secretKey);

    function marketMakerByAddress(address addr) public view returns (MarketMaker memory) {
        return marketMakers[addr];
    }

    function getSwapState(address sender, bytes32 secretLock) public view returns (States) {
        return swaps[sender][secretLock].state;
    }

    function getMarketMakers(uint256 fromIdx, uint256 count
            ) public view returns (MarketMaker[] memory list) {

        uint n = marketMakerAddrs.length();
        if (fromIdx >= n) {
            return list;
        }

        uint left = n - fromIdx;
        if (count > left) {
            count = left;
        }

        list = new MarketMaker[](count);
        for (uint i = 0; i < count; i++) {
            address key = marketMakerAddrs.at(fromIdx + i);
            MarketMaker memory mm = marketMakers[key];
            list[i] = mm;
        }
        return list;
    }

    function registerMarketMaker(bytes32 _intro,
                                 bytes20 _bchPkh,
                                 uint16  _bchLockTime,
                                 uint16  _penaltyBPS,
                                 uint256 _bchPrice,
                                 uint256 _sbchPrice,
                                 uint256 _minSwapAmt,
                                 uint256 _maxSwapAmt,
                                 address _statusChecker) public payable {
        require(marketMakers[msg.sender].addr == address(0x0), 'registered-address');
        require(_bchLockTime > 0, 'zero-bch-lock-time');
        require(_penaltyBPS < 10000, 'invalid-penalty-bps');
        require(_maxSwapAmt > _minSwapAmt, 'invalid-swap-amt');
        require(msg.value >= MIN_STAKED_VALUE, 'not-enough-staked-val');

        // console.log('_bchLockTime: %d', _bchLockTime);
        uint32 _sbchLockTime = uint32(_bchLockTime) * 10 * 60;
        marketMakers[msg.sender] = MarketMaker(msg.sender, 0, _intro, _bchPkh,
            _bchLockTime, _sbchLockTime, _penaltyBPS, _bchPrice, _sbchPrice, 
            _minSwapAmt, _maxSwapAmt, msg.value,
            _statusChecker, false);
        marketMakerAddrs.add(msg.sender);
    }

    function updateMarketMaker(bytes32 _intro,
                               uint256 _bchPrice,
                               uint256 _sbchPrice) public {
        MarketMaker storage mm = marketMakers[msg.sender];
        require(mm.addr != address(0x0), 'not-registered');
        mm.intro = _intro;
        mm.bchPrice = _bchPrice;
        mm.sbchPrice = _sbchPrice;
    }

    function retireMarketMaker() public {
        MarketMaker storage mm = marketMakers[msg.sender];
        require(mm.addr != address(0x0), 'not-registered');
        require(mm.retiredAt == 0, 'already-retired');
        mm.retiredAt = uint64(block.timestamp);
    }

    function setUnavailable(address marketMaker, bool b) public {
        MarketMaker storage mm = marketMakers[marketMaker];
        require(mm.addr != address(0x0), 'not-registered');
        require(mm.statusChecker == msg.sender, 'not-status-checker');
        mm.unavailable = b;
    }

    function withdrawStakedValue() public {
        MarketMaker storage mm = marketMakers[msg.sender];
        require(mm.addr != address(0x0), 'not-registered');
        require(mm.retiredAt > 0, 'not-retired');
        require(mm.retiredAt + MIN_RETIRE_DELAY < block.timestamp, 'not-ready-to-withdraw');
        require(mm.stakedValue > 0, 'nothing-to-withdraw');
        uint val = mm.stakedValue;
        mm.stakedValue = 0;
        marketMakerAddrs.remove(msg.sender);
        payable(msg.sender).transfer(val);
    }

    // lock value
    function lock(address payable _receiver,
                  bytes32 _secretLock,
                  uint256 _validPeriod,
                  bytes20 _receiverBchPkh,
                  uint16  _penaltyBPS,
                  bool    _receiverIsMM,
                  uint256 _expectedPrice) public payable {
        require(swaps[msg.sender][_secretLock].state == States.INVALID, 'used-secret-lock');

        if (_receiverIsMM) {
            require(marketMakers[msg.sender].addr == address(0x0), 'sender-is-mm');

            MarketMaker storage mm = marketMakers[_receiver];
            require(mm.addr != address(0x0), 'receiver-not-mm');
            require(_validPeriod == mm.sbchLockTime, 'sbch-lock-time-mismatch');
            require(_penaltyBPS == mm.penaltyBPS, 'penalty-bps-mismatch');
            require(msg.value >= mm.minSwapAmt && msg.value <= mm.maxSwapAmt, 'value-out-of-range');
            require(mm.retiredAt == 0, 'market-maker-retired');
            require(!mm.unavailable, 'unavailable');
        } else {
            require(marketMakers[_receiver].addr == address(0x0), 'receiver-is-mm');
            require(marketMakers[msg.sender].retiredAt == 0, 'sender-is-retired');   // in case sender is market maker bot
            require(!marketMakers[msg.sender].unavailable, 'sender-is-unavailable'); // in case sender is market maker bot
            require(_penaltyBPS < 10000, 'invalid-penalty-bps');
        }

        uint256 _unlockTime = block.timestamp + _validPeriod;

        // Store the details of the swap.
        Swap memory swap = Swap({
            receiverIsMM  : _receiverIsMM,
            startTime     : uint64(block.timestamp),
            startHeight   : uint64(block.number),
            validPeriod   : uint32(_validPeriod),
            value         : uint96(msg.value),
            sender        : payable(msg.sender),
            receiver      : _receiver,
            receiverBchPkh: _receiverBchPkh,
            penaltyBPS    : _penaltyBPS,
            secretKey     : 0,
            expectedPrice : _expectedPrice,
            state         : States.LOCKED
        });
        swaps[msg.sender][_secretLock] = swap;

        // Trigger lock event.
        emit Lock(msg.sender, _receiver, _secretLock, _unlockTime, msg.value,
            _receiverBchPkh, block.timestamp, _penaltyBPS, _expectedPrice);
    }

    // unlock value
    function unlock(address _sender, bytes32 _secretLock, bytes32 _secretKey) public {
        Swap memory swap = swaps[_sender][_secretLock];
        require(swap.state == States.LOCKED, 'not-locked');
        require(_secretLock == sha256(abi.encodePacked(_secretKey)), 'invalid-key');
        if(!swap.receiverIsMM) {
            uint estimatedTimeSpan = (block.number - swap.startHeight) * BLOCK_INTERVAL;
            uint realTimeSpan = block.timestamp - swap.startTime;
            require(estimatedTimeSpan + HALT_TIME > realTimeSpan, "no-unlock-when-chain-halted");
        }

        // change state.
        swaps[_sender][_secretLock].secretKey = _secretKey;
        swaps[_sender][_secretLock].state = States.UNLOCKED;

        // Transfer the ETH funds from this contract to the withdrawing trader.
        swap.receiver.transfer(swap.value);

        // Trigger unlock event.
        emit Unlock(_secretLock, _secretKey);
    }

    // refund value
    function refund(address _sender, bytes32 _secretLock) public {
        Swap memory swap = swaps[_sender][_secretLock];
        require(swap.state == States.LOCKED, 'not-locked');
        uint validBlocks = swap.validPeriod/BLOCK_INTERVAL;
        require(swap.startTime + swap.validPeriod < block.timestamp &&
                swap.startHeight + validBlocks < block.number, 'not-refundable');

        // change the state.
        swaps[_sender][_secretLock].state = States.REFUNDED;

        // Transfer the ETH value from this contract back to the ETH trader (minus penalty).
        uint256 penalty = 0;
        if (swap.penaltyBPS > 0) {
          penalty = swap.value * swap.penaltyBPS / 10000;
          swap.receiver.transfer(penalty);
        }
        swap.sender.transfer(swap.value - penalty);

        // Trigger refund event.
        emit Refund(_secretLock);
    }

}
