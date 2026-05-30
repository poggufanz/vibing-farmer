// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockVault
/// @notice Minimal mock vault for hackathon demo. Shares = assets 1:1.
///         Pure-accounting (no real ERC20 transfers). Simulates time-based
///         yield, reward claiming, and withdrawal for Background Agents.
contract MockVault {
    string public name;
    address public asset; // informational only (mock USDC address)
    uint256 public apyBps; // e.g. 820 = 8.2% APY

    mapping(address => uint256) private _shares;
    uint256 private _totalDeposited;

    mapping(address => uint256) public depositTimestamp;
    mapping(address => uint256) public unclaimedRewards;

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
    event RewardsClaimed(address indexed user, uint256 amount);
    event YieldAccrued(address indexed user, uint256 amount);

    constructor(string memory _name, address _asset, uint256 _apyBps) {
        name = _name;
        asset = _asset;
        apyBps = _apyBps;
    }

    /// @notice Shares convert 1:1 to assets in this mock.
    function convertToAssets(uint256 shares) public pure returns (uint256) {
        return shares;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _shares[account];
    }

    function totalAssets() external view returns (uint256) {
        return _totalDeposited;
    }

    /// @notice Deposit assets, receive shares 1:1. Starts the yield accrual clock.
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        require(assets > 0, "Zero assets");
        // Fold any accrued yield before resetting the accrual clock.
        if (depositTimestamp[receiver] != 0) {
            unclaimedRewards[receiver] = getUnclaimedRewards(receiver);
        }
        shares = assets;
        _shares[receiver] += shares;
        _totalDeposited += assets;
        depositTimestamp[receiver] = block.timestamp;
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Yield accrued since last deposit/claim, plus any folded rewards.
    ///         accrued = principal * apyBps * timeElapsed / (10000 * 365 days)
    function getUnclaimedRewards(address user) public view returns (uint256) {
        if (depositTimestamp[user] == 0) return 0;
        uint256 principal = convertToAssets(balanceOf(user));
        uint256 timeElapsed = block.timestamp - depositTimestamp[user];
        uint256 accrued = (principal * apyBps * timeElapsed) / (10000 * 365 days);
        return accrued + unclaimedRewards[user];
    }

    /// @notice Claim accrued yield. Pure-accounting: the amount is reported via
    ///         events (no real ERC20 mint). Resets the accrual clock.
    function claimRewards(address user) external returns (uint256 rewards) {
        rewards = getUnclaimedRewards(user);
        require(rewards > 0, "No rewards");
        unclaimedRewards[user] = 0;        // EFFECTS before any emit
        depositTimestamp[user] = block.timestamp;
        emit YieldAccrued(user, rewards);
        emit RewardsClaimed(user, rewards);
    }

    /// @notice Withdraw assets (partial or full). Burns owner shares 1:1.
    ///         Preserves accrued yield across the withdrawal.
    function withdrawAssets(uint256 assets, address receiver, address owner)
        external
        returns (uint256 shares)
    {
        require(assets > 0, "Zero assets");
        shares = assets; // 1:1
        require(_shares[owner] >= shares, "Insufficient shares");
        if (depositTimestamp[owner] != 0) {
            unclaimedRewards[owner] = getUnclaimedRewards(owner);
            depositTimestamp[owner] = block.timestamp;
        }
        _shares[owner] -= shares;
        _totalDeposited -= assets;
        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }
}
