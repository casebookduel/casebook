// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Casebook seals
/// @notice One write-once fingerprint per graded hour of the Casebook duel. A root is the SHA-256 of the bytes served
///         at /data/seal/<hour>: that hour's rows of results.jsonl exactly as written, then the notebook Holmes wrote
///         after the hour. Once an hour is sealed, nobody can change its root, the sealer included.
contract CasebookSeals {
    /// @notice The only address that can seal. It holds gas money and nothing else.
    address public immutable sealer;

    /// @notice The root of each sealed hour; zero means not sealed yet.
    mapping(uint256 hour => bytes32 root) public seals;

    event Sealed(uint256 indexed hour, bytes32 root);

    error NotSealer();
    error LengthMismatch();
    error EmptyRoot(uint256 hour);
    error AlreadySealed(uint256 hour);

    constructor(address sealer_) {
        sealer = sealer_;
    }

    /// @notice Seal several hours at once. Reverts as a whole if any of them is already sealed.
    function seal(uint256[] calldata hourIds, bytes32[] calldata roots) external {
        if (msg.sender != sealer) revert NotSealer();
        if (hourIds.length != roots.length) revert LengthMismatch();
        for (uint256 i; i < hourIds.length; ++i) {
            uint256 h = hourIds[i];
            bytes32 r = roots[i];
            if (r == bytes32(0)) revert EmptyRoot(h);
            if (seals[h] != bytes32(0)) revert AlreadySealed(h);
            seals[h] = r;
            emit Sealed(h, r);
        }
    }
}
