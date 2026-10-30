// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
// LOCAL VALIDATION ONLY. Never bundled into the site or deployed to a public chain.
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract ValidationSQK is ERC20 {
    constructor() ERC20("Validation SQK", "SQK") {}
    function mintForValidation(address account, uint256 amount) external { _mint(account, amount); }
}
contract ValidationCore {
    struct State { uint64 settledThroughRound; uint64 cumulativeWork; uint96 cumulativeBlockUnits; uint64 blockHeight; uint96 blockProgress; uint32 workPerThousandBlocks; uint256 authorizationNonce; bool paused; }
    function state() external pure returns (State memory) {
        return State(41, 1000, 23000000000, 23, 0, 1000, 1, false);
    }
}
contract ValidationGame {
    struct Turn { uint256 round; bool odd; }
    mapping(address => Turn) public turns;
    mapping(address => uint256) public points;
    address[] private players;
    uint256 private nextRound = 1;
    function choose(bool odd) external {
        require(turns[msg.sender].round == 0, "Round already pending");
        turns[msg.sender] = Turn(nextRound++, odd);
    }
    function finish(uint256 round) external {
        require(round != 0 && turns[msg.sender].round == round, "No matching round");
        if (points[msg.sender] == 0) players.push(msg.sender);
        points[msg.sender]++;
        delete turns[msg.sender];
    }
    function ranking() external view returns (address[] memory accounts, uint256[] memory scores) {
        accounts = players;
        scores = new uint256[](players.length);
        for (uint256 i; i < players.length; i++) scores[i] = points[players[i]];
    }
}
