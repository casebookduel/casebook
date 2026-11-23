"""creator_sold: a burn is not a sale and not ambiguous; tokens moved elsewhere stay ambiguous.   python3 -m unittest test_creator_sold"""
import random, unittest
import duel as D

CRE, CUR, TOK, DEAD, ROUTER = "0x" + "c1" * 20, "0x" + "c2" * 20, "0x" + "70" * 20, "0x000000000000000000000000000000000000dead", "0x" + "ab" * 20
xfer = lambda frm, to: dict(address=TOK, topics=[D.T_TRANSFER, D.pad(frm), D.pad(to)], data="0x1", blockNumber="0x10", transactionHash="0x" + "11" * 32, logIndex="0x0")


def ctx(moves):
    l = dict(token=TOK, creator=CRE, curve=CUR, block=1, log=xfer(CRE, CUR))
    D.xfers = lambda c: {TOK: moves}
    return dict(head=100, ls=[l], rng=random.Random(1))


class CreatorSold(unittest.TestCase):
    def test_burn_only_is_a_no(self):
        self.assertEqual(D.creator_sold(ctx([xfer(CRE, DEAD)]))["a"], "no")

    def test_direct_sale_is_a_yes(self):
        self.assertEqual(D.creator_sold(ctx([xfer(CRE, DEAD), xfer(CRE, CUR)]))["a"], "yes")

    def test_router_move_stays_ambiguous(self):
        with self.assertRaises(D.Skip): D.creator_sold(ctx([xfer(CRE, ROUTER)]))


if __name__ == "__main__":
    unittest.main()
