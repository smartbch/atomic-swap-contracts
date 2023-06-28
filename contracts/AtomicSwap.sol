//SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.19;

// HTLC EVM contract, initial version comes from:
// https://github.com/confio/eth-atomic-swap/blob/master/contracts/AtomicSwapEther.sol
contract AtomicSwapEther {

    // Market maker info
    struct MarketMaker {
        address addr;          // EVM address
        uint64  retiredAt;     // retired time
        bytes32 intro;         // introduction
        bytes20 bchPkh;        // BCH P2PKH address
        uint16  bchLockTime;   // BCH HTLC lock time (in blocks)
        uint32  sbchLockTime;  // sBCH HTLC lock time (in seconds)
        uint16  penaltyBPS;    // refund penalty ratio (in BPS)
        uint16  feeBPS;        // service fee ratio (in BPS)
        uint256 minSwapAmt;    //
        uint256 maxSwapAmt;    //
        address statusChecker; // the one who can set unavailable status
        bool    unavailable;   // 
    }

    // Swap info
    struct Swap {
        uint256 timelock;               // unlock time
        uint256 value;                  // locked value
        address payable ethTrader;      // the locker
        address payable withdrawTrader; // the unlocker
        bytes20 bchWithdrawPKH;         // BCH recipient address (P2PKH)
        uint16  penaltyBPS;             // refund penalty ratio (in BPS)
        States  state;                  //
        bytes32 secretKey;              // 
    }

    // Swap states
    enum States { INVALID, OPEN, CLOSED, EXPIRED }

    // All swaps
    mapping (bytes32 => Swap) public swaps; // secretLock => Swap
    bytes32[] public secretLocks;

    // Market maker registry
    mapping (address => MarketMaker) public marketMakers;
    address[] public marketMakerAddrs;


    // Events
    event Open(address indexed _depositTrader,
               address indexed _withdrawTrader,
               bytes32 _secretLock,
               uint256 _unlockTime,
               uint256 _value,
               bytes20 _bchWithdrawPKH,
               uint256 _createdTime,
               uint16  _penaltyBPS);
    event Expire(bytes32 indexed _secretLock);
    event Close(bytes32 indexed _secretLock, bytes32 indexed _secretKey);

    function registerMarketMaker(bytes32 _intro,
                                 bytes20 _bchPkh,
                                 uint16  _bchLockTime,
                                 uint32  _sbchLockTime,
                                 uint16  _penaltyBPS,
                                 uint16  _feeBPS,
                                 uint256 _minSwapAmt,
                                 uint256 _maxSwapAmt,
                                 address _statusChecker) public {
        require(marketMakers[msg.sender].addr == address(0x0), 'registered-address');
        require(_penaltyBPS < 10000, 'invalid-penalty-bps');
        require(_feeBPS < 10000, 'invalid-fee-bps');
        require(_maxSwapAmt > _minSwapAmt, 'invalid-swap-amt');
        marketMakers[msg.sender] = MarketMaker(msg.sender, 0, _intro, _bchPkh,
            _bchLockTime, _sbchLockTime, _penaltyBPS, _feeBPS, _minSwapAmt, _maxSwapAmt, _statusChecker, false);
        marketMakerAddrs.push(msg.sender);
    }

    function updateMarketMaker(bytes32 _intro) public {
        MarketMaker storage mm = marketMakers[msg.sender];
        require(mm.addr != address(0x0), 'not-registered');
        mm.intro = _intro;
    }

    function retireMarketMaker(uint256 _delay) public {
        MarketMaker storage mm = marketMakers[msg.sender];
        require(mm.addr != address(0x0), 'not-registered');
        require(mm.retiredAt == 0, 'already-set-retire-time');
        mm.retiredAt = uint64(block.timestamp + _delay);
    }

    function setUnavailable(address marketMaker, bool b) public {
        MarketMaker storage mm = marketMakers[marketMaker];
        require(mm.addr != address(0x0), 'not-registered');
        require(mm.statusChecker == msg.sender, 'not-status-checker');
        mm.unavailable = b;
    }

    // lock value
    function open(address payable _withdrawTrader,
                  bytes32 _secretLock,
                  uint256 _validPeriod,
                  bytes20 _bchWithdrawPKH,
                  uint16  _penaltyBPS) public payable {
        require(swaps[_secretLock].state == States.INVALID, 'used-secret-lock');

        MarketMaker storage mm = marketMakers[_withdrawTrader];
        if (mm.addr != address(0x0)) { // lock to market maker
            require(_validPeriod == mm.sbchLockTime, 'sbch-lock-time-mismatch');
            require(_penaltyBPS == mm.penaltyBPS, 'penalty-bps-mismatch');
            require(msg.value >= mm.minSwapAmt && msg.value <= mm.maxSwapAmt, 'value-out-of-range');
            require(mm.retiredAt == 0 || mm.retiredAt > block.timestamp, 'market-maker-retired');
            require(!mm.unavailable, 'unavailable');
        } else {
            require(_penaltyBPS < 10000, 'invalid-penalty-bps');
        }

        uint256 _unlockTime = block.timestamp + _validPeriod;

        // Store the details of the swap.
        Swap memory swap = Swap({
            timelock      : _unlockTime,
            value         : msg.value,
            ethTrader     : payable(msg.sender),
            withdrawTrader: _withdrawTrader,
            bchWithdrawPKH: _bchWithdrawPKH,
            penaltyBPS    : _penaltyBPS,
            secretKey     : 0,
            state         : States.OPEN
        });
        swaps[_secretLock] = swap;
        secretLocks.push(_secretLock);

        // Trigger open event.
        emit Open(msg.sender, _withdrawTrader, _secretLock, _unlockTime, msg.value,
            _bchWithdrawPKH, block.timestamp, _penaltyBPS);
    }

    // unlock value
    function close(bytes32 _secretLock, bytes32 _secretKey) public {
        Swap storage swap = swaps[_secretLock];
        require(swap.state == States.OPEN, 'not-open');
        require(_secretLock == sha256(abi.encodePacked(_secretKey)), 'invalid-key');

        // Close the swap.
        swap.secretKey = _secretKey;
        swap.state = States.CLOSED;

        // Transfer the ETH funds from this contract to the withdrawing trader.
        swap.withdrawTrader.transfer(swap.value);

        // Trigger close event.
        emit Close(_secretLock, _secretKey);
    }

    // refund value
    function expire(bytes32 _secretLock) public {
        Swap storage swap = swaps[_secretLock];
        require(swap.state == States.OPEN, 'not-open');
        require(swap.timelock < block.timestamp, 'not-expirable');

        // Expire the swap.
        swap.state = States.EXPIRED;

        // Transfer the ETH value from this contract back to the ETH trader (minus penalty).
        uint256 penalty = 0;
        if (swap.penaltyBPS > 0) {
          penalty = swap.value * swap.penaltyBPS / 10000;
          swap.withdrawTrader.transfer(penalty);
        }
        swap.ethTrader.transfer(swap.value - penalty);

        // Trigger expire event.
        emit Expire(_secretLock);
    }

}
