// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CasebookLessons} from "../src/CasebookLessons.sol";

// A plain ERC-20 subset that returns true.
contract MockToken {
    uint8 public constant decimals = 18;
    string public constant symbol = "CASE";
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a && balanceOf[f] >= a, "insufficient");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

// Older tokens return nothing from transferFrom.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external { allowance[msg.sender][s] = a; }
    function transferFrom(address f, address t, uint256 a) external {
        require(allowance[f][msg.sender] >= a && balanceOf[f] >= a, "insufficient");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
    }
}

// A token that reports failure without reverting.
contract FalseToken {
    function transferFrom(address, address, uint256) external pure returns (bool) { return false; }
}

// A holder: approves the lessons contract (or not), then teaches.
contract Teacher {
    function approve(address token, address spender) external {
        (bool ok,) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, type(uint256).max));
        require(ok, "approve failed");
    }
    function teach(CasebookLessons l, string calldata s) external returns (uint256) { return l.teach(s); }
}

// No test library: a revert fails the test, and `try` checks the calls that must fail.
contract CasebookLessonsTest {
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 constant FEE = 100_000e18;
    MockToken t;
    CasebookLessons l;
    Teacher a;

    function setUp() public {
        t = new MockToken();
        l = new CasebookLessons(address(t), FEE);
        a = new Teacher();
        t.mint(address(a), 250_000e18);
        a.approve(address(t), address(l));
    }

    function test_teaching_burns_the_fee_and_counts() public {
        require(a.teach(l, "Max getLogs span is 10,000,000 blocks; split longer ranges.") == 1, "first id is not 1");
        require(t.balanceOf(DEAD) == FEE && t.balanceOf(address(a)) == 150_000e18, "fee not burned");
        require(a.teach(l, "TokenGraduated is 0x0a44ef75... on the factory.") == 2, "ids do not count up");
        require(l.lessons() == 2 && t.balanceOf(DEAD) == 2 * FEE, "second lesson not counted");
        try a.teach(l, "a third needs 100,000 more") { revert("taught without the balance"); } catch {}
        require(l.lessons() == 2, "a failed burn was counted");
    }

    function test_length_limits() public {
        bytes memory max = new bytes(280);
        for (uint256 i; i < 280; i++) max[i] = "a";
        require(a.teach(l, string(max)) == 1, "280 bytes refused");
        bytes memory over = new bytes(281);
        for (uint256 i; i < 281; i++) over[i] = "a";
        try a.teach(l, string(over)) { revert("281 bytes accepted"); } catch {}
        try a.teach(l, "") { revert("an empty lesson accepted"); } catch {}
        require(l.lessons() == 1, "a refused lesson was counted");
    }

    function test_needs_an_allowance() public {
        Teacher b = new Teacher();
        t.mint(address(b), 250_000e18);
        try b.teach(l, "no approve") { revert("burned without an allowance"); } catch {}
        require(t.balanceOf(DEAD) == 0 && l.lessons() == 0, "something moved");
    }

    function test_tokens_without_a_return_value() public {
        NoReturnToken n = new NoReturnToken();
        CasebookLessons ln = new CasebookLessons(address(n), FEE);
        Teacher b = new Teacher();
        n.mint(address(b), FEE);
        b.approve(address(n), address(ln));
        require(b.teach(ln, "works") == 1 && n.balanceOf(DEAD) == FEE, "no-return token refused");
    }

    function test_a_false_return_is_a_failed_burn() public {
        CasebookLessons lf = new CasebookLessons(address(new FalseToken()), FEE);
        try a.teach(lf, "free lesson") { revert("a false return was accepted"); } catch {}
        require(lf.lessons() == 0, "counted a failed burn");
    }

    function test_deploy_checks() public {
        try new CasebookLessons(address(0xBEEF), FEE) { revert("accepted an address without code"); } catch {}
        try new CasebookLessons(address(t), 0) { revert("accepted a zero fee"); } catch {}
        require(l.token() == address(t) && l.fee() == FEE && l.MAX_BYTES() == 280, "settings not stored");
    }
}
