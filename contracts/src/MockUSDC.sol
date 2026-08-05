// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Simple mock USDC with 6 decimals for local testing.
contract MockUSDC {
    string public name;
    string public symbol;
    uint8 public immutable decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        name = "Mock USDC";
        symbol = "mUSDC";
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= amount, "MockUSDC: transfer amount exceeds allowance");
        _approve(from, msg.sender, currentAllowance - amount);
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "MockUSDC: mint to zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "MockUSDC: transfer to zero address");
        uint256 fromBalance = balanceOf[from];
        require(fromBalance >= amount, "MockUSDC: transfer amount exceeds balance");
        balanceOf[from] = fromBalance - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "MockUSDC: approve from zero address");
        require(spender != address(0), "MockUSDC: approve to zero address");
        allowance[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
