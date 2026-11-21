// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CasebookSeals} from "../src/CasebookSeals.sol";

contract Stranger {
    function trySeal(CasebookSeals s, uint256[] memory h, bytes32[] memory r) external {
        s.seal(h, r);
    }
}

// No test library: a revert fails the test, and `try` checks the calls that must fail.
contract CasebookSealsTest {
    CasebookSeals s;

    function setUp() public {
        s = new CasebookSeals(address(this));
    }

    function pair(uint256 a, uint256 b) internal pure returns (uint256[] memory h, bytes32[] memory r) {
        h = new uint256[](2);
        r = new bytes32[](2);
        (h[0], h[1]) = (a, b);
        (r[0], r[1]) = (sha256(abi.encode(a)), sha256(abi.encode(b)));
    }

    function test_stores_each_root() public {
        (uint256[] memory h, bytes32[] memory r) = pair(3, 4);
        s.seal(h, r);
        require(s.seals(3) == r[0] && s.seals(4) == r[1], "roots not stored");
        require(s.seals(5) == bytes32(0), "an unsealed hour reads non-zero");
    }

    function test_an_hour_is_sealed_once() public {
        (uint256[] memory h, bytes32[] memory r) = pair(7, 8);
        s.seal(h, r);
        (uint256[] memory h2, bytes32[] memory r2) = pair(9, 7);   // 9 is new, 7 is not: the whole call must revert
        try s.seal(h2, r2) { revert("resealed an hour"); } catch {}
        require(s.seals(9) == bytes32(0), "part of a failed batch was kept");
        require(s.seals(7) == r[0], "a sealed root changed");
    }

    function test_only_the_sealer() public {
        (uint256[] memory h, bytes32[] memory r) = pair(1, 2);
        Stranger x = new Stranger();
        try x.trySeal(s, h, r) { revert("a stranger sealed"); } catch {}
        require(s.seals(1) == bytes32(0), "a stranger's root was kept");
    }

    function test_rejects_bad_input() public {
        (uint256[] memory h, bytes32[] memory r) = pair(1, 2);
        r[1] = bytes32(0);
        try s.seal(h, r) { revert("sealed an empty root"); } catch {}
        uint256[] memory one = new uint256[](1);
        try s.seal(one, r) { revert("accepted mismatched lengths"); } catch {}
    }
}
