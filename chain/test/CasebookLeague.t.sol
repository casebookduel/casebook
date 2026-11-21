// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CasebookLeague} from "../src/CasebookLeague.sol";
import {FalseToken, MockToken, NoReturnToken} from "./CasebookLessons.t.sol";

// A player: approves the league contract, then enters.
contract Player {
    function approve(address token, address spender) external {
        (bool ok,) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, type(uint256).max));
        require(ok, "approve failed");
    }
    function enter(CasebookLeague l, string calldata s) external returns (uint256) { return l.enter(s); }
}

// No test library: a revert fails the test, and `try` checks the calls that must fail.
contract CasebookLeagueTest {
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 constant FEE = 500_000e18;
    MockToken t;
    CasebookLeague l;
    Player p;

    function setUp() public {
        t = new MockToken();
        l = new CasebookLeague(address(t), FEE);
        p = new Player();
        t.mint(address(p), 1_200_000e18);
        p.approve(address(t), address(l));
    }

    function test_entering_burns_the_fee_and_counts() public {
        require(p.enter(l, "NOTES:\n- Factory topic0 for launches is 0x8d4aad49...") == 1, "first id is not 1");
        require(t.balanceOf(DEAD) == FEE && t.balanceOf(address(p)) == 700_000e18, "fee not burned");
        require(p.enter(l, "a second notebook") == 2 && l.entries() == 2, "ids do not count up");
        try p.enter(l, "a third needs 500,000 more") { revert("entered without the balance"); } catch {}
        require(l.entries() == 2, "a failed burn was counted");
    }

    function test_length_limits() public {
        bytes memory max = new bytes(2000);
        for (uint256 i; i < 2000; i++) max[i] = "a";
        require(p.enter(l, string(max)) == 1, "2000 bytes refused");
        bytes memory over = new bytes(2001);
        for (uint256 i; i < 2001; i++) over[i] = "a";
        try p.enter(l, string(over)) { revert("2001 bytes accepted"); } catch {}
        try p.enter(l, "") { revert("an empty notebook accepted"); } catch {}
        require(l.entries() == 1, "a refused notebook was counted");
    }

    function test_needs_an_allowance() public {
        Player q = new Player();
        t.mint(address(q), FEE);
        try q.enter(l, "no approve") { revert("burned without an allowance"); } catch {}
        require(t.balanceOf(DEAD) == 0 && l.entries() == 0, "something moved");
    }

    function test_other_tokens() public {
        NoReturnToken n = new NoReturnToken();
        CasebookLeague ln = new CasebookLeague(address(n), FEE);
        Player q = new Player();
        n.mint(address(q), FEE);
        q.approve(address(n), address(ln));
        require(q.enter(ln, "works") == 1 && n.balanceOf(DEAD) == FEE, "no-return token refused");
        CasebookLeague lf = new CasebookLeague(address(new FalseToken()), FEE);
        try p.enter(lf, "free entry") { revert("a false return was accepted"); } catch {}
    }

    function test_deploy_checks() public {
        try new CasebookLeague(address(0xBEEF), FEE) { revert("accepted an address without code"); } catch {}
        try new CasebookLeague(address(t), 0) { revert("accepted a zero fee"); } catch {}
        require(l.token() == address(t) && l.fee() == FEE && l.MAX_BYTES() == 2000, "settings not stored");
    }
}
