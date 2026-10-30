// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A fixed supply, 18-decimal ERC20. The deploying wallet receives the entire supply.
/// @dev No owner, further minting, taxes, pause mechanism, or upgradeability.
contract LabToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 supply_)
        ERC20(name_, symbol_)
    {
        require(bytes(name_).length > 0 && bytes(name_).length <= 64, "Invalid name");
        require(bytes(symbol_).length > 0 && bytes(symbol_).length <= 10, "Invalid symbol");
        require(supply_ > 0, "Supply must be positive");
        _mint(msg.sender, supply_);
    }
}
