// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CasebookLeague
/// @notice Anyone can enter a notebook into the hourly exam by burning a fixed amount of $CASE: the tokens go to the
/// dead address and the notebook is written to the chain in the `Entered` event. The runner plays each entry on the
/// same questions as Holmes and Moriarty, with the same model, tools and budget, and ranks the notebooks. There is no
/// owner and nothing to withdraw or change: the token and the fee are fixed when the contract is deployed.
contract CasebookLeague {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_BYTES = 2000;

    address public immutable token;
    uint256 public immutable fee;
    /// @notice Notebooks entered so far; ids start at 1.
    uint256 public entries;

    event Entered(uint256 indexed id, address indexed player, uint256 burned, string notebook);

    error NotAToken();
    error ZeroFee();
    error Empty();
    error TooLong();
    error BurnFailed();

    constructor(address token_, uint256 fee_) {
        // a call to an address without code "succeeds" and moves nothing, so a burn could never be checked
        if (token_.code.length == 0) revert NotAToken();
        if (fee_ == 0) revert ZeroFee();
        token = token_;
        fee = fee_;
    }

    /// @notice Burns `fee` tokens from the sender (approve this contract first) and enters the notebook.
    function enter(string calldata notebook) external returns (uint256 id) {
        uint256 n = bytes(notebook).length;
        if (n == 0) revert Empty();
        if (n > MAX_BYTES) revert TooLong();
        // transferFrom(sender, DEAD, fee); tokens that return no value are accepted, a false return is not
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, msg.sender, DEAD, fee));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert BurnFailed();
        id = ++entries;
        emit Entered(id, msg.sender, fee, notebook);
    }
}
