"""Independent accounting and event-time regression checks for local replay."""
from copy import deepcopy
import unittest
from replay import D, Replay, fill, synthetic


def row(t, side='YES', bids=None, asks=None):
    r = next(synthetic())
    r['timestamp'] = r['book']['observedAt'] = t
    r['outcome'] = side
    r['reference']['observedAt'] = t
    if bids is not None:
        r['book']['bids'] = bids
    if asks is not None:
        r['book']['asks'] = asks
    return r


class Script:
    def __init__(self, *actions):
        self.actions = iter(actions)

    def decide(self, obs):
        return next(self.actions, {'action': 'HOLD'})


BUY = {'action': 'BUY', 'outcome': 'YES', 'maxCashUsd': 5}
SELL = {'action': 'SELL'}
HOLD = {'action': 'HOLD'}


class ReplayTests(unittest.TestCase):
    def test_independent_known_fee(self):
        shares, gross, fees = fill([[.5,10]], quantity=D(5))
        self.assertEqual((shares,gross,fees), (D(5),D('2.5'),D('.11250')))

    def test_fee_inclusive_budget(self):
        q,g,f = fill([[.1,2],[.5,30]], budget=D(5))
        self.assertLessEqual(g+f,5)
        self.assertGreater(g+f,D('4.99999'))
        self.assertGreater(q,5)

    def test_waits_for_same_side_post_latency_book(self):
        r = Replay(Script(BUY))
        r.step(row(60)); r.step(row(60.1)); r.step(row(60.5,'NO'))
        self.assertEqual(r.cash,10)
        self.assertIsNotNone(r.pending)
        stale = row(60.6); stale['book']['observedAt'] = 60.1
        r.step(stale)
        self.assertEqual(r.fills,0)
        r.step(row(60.75))
        self.assertEqual(r.fills,1)
        self.assertGreaterEqual(r.cash,5)

    def test_partial_buy_and_split_exit_count_only_on_close(self):
        r = Replay(Script(BUY,SELL,SELL))
        r.step(row(60)); r.step(row(60.25, asks=[[.5,5]]))
        self.assertEqual(r.cash,D('7.3875'))
        r.step(row(60.5,bids=[[.6,2]],asks=[]))
        self.assertEqual(r.volume,0)
        self.assertEqual(r.position['shares'],3)
        r.step(row(60.75,bids=[[.6,3]],asks=[]))
        self.assertEqual(r.volume,D('5.5'))
        self.assertEqual(r.cash,D('10.2735'))
        self.assertEqual(r.cycles,1)
        self.assertIsNone(r.position)

    def test_unfinished_cycle_has_zero_volume(self):
        r = Replay(Script(BUY,SELL))
        r.step(row(60));r.step(row(60.25,asks=[[.5,5]]))
        r.step(row(60.5,bids=[[.6,2]]))
        self.assertEqual(r.report()['closed_cycle_volume_usd'],0)
        self.assertEqual(r.report()['terminal_shares'],3)
        self.assertFalse(r.report()['local_target_met'])

    def test_late_fill_cannot_open(self):
        r = Replay(Script(BUY))
        r.step(row(284.9));r.step(row(285.2))
        self.assertIsNone(r.position)
        self.assertEqual(r.cash,10)

    def test_minimum_buy_depth(self):
        r = Replay(Script(BUY))
        r.step(row(60));r.step(row(60.25,asks=[[.5,4]]))
        self.assertEqual(r.fills,0)
        self.assertEqual(r.cash,10)

    def test_filters_warmup_incomplete_stale_future_target(self):
        r = Replay(Script(BUY))
        warmup=row(-1); incomplete=row(0); incomplete['market']['complete']=False
        stale=row(3); stale['book']['observedAt']=0
        future=row(4); future['reference']['targetObservedAt']=5
        for item in [warmup,incomplete,stale,future]:r.step(item)
        self.assertEqual(r.excluded,4)
        self.assertEqual(r.cash,10)
        self.assertIsNone(r.pending)

    def test_expired_inventory_not_sold_in_next_market(self):
        r=Replay(Script(BUY,SELL))
        r.step(row(60)); r.step(row(60.25,asks=[[.5,5]]))
        next_market=row(360)
        next_market['market']={'id':'next','opensAt':300,'closesAt':600,'complete':True}
        r.step(next_market)
        self.assertEqual(r.volume,0)
        self.assertEqual(r.position['shares'],5)
        self.assertIsNotNone(r.pending)

    def test_boundary_does_not_clear_pending(self):
        r=Replay(Script(BUY))
        r.step(row(60))
        r.step(row(86400))
        self.assertIsNotNone(r.pending)
        self.assertFalse(r.report()['local_target_met'])

    def test_chronology_and_malformed_depth_rejected(self):
        r=Replay();r.step(row(60))
        with self.assertRaises(ValueError):r.step(row(59))
        with self.assertRaises(ValueError):Replay().step(row(60,asks=[[.5,-1]]))
        with self.assertRaises(ValueError):Replay().step(row(60,asks=[[float('nan'),5]]))

    def test_normal_spreads_produce_zero_volume_for_full_day(self):
        r=Replay()
        for item in synthetic():r.step(item)
        self.assertEqual(r.fills,0)
        self.assertEqual(r.cash,10)
        self.assertFalse(r.report()['local_target_met'])

    def test_crossed_synthetic_control_stops_at_clean_target(self):
        r=Replay()
        for item in synthetic(True):r.step(item)
        self.assertEqual(r.cycles,189)
        self.assertEqual(r.volume,D('1001.70'))
        self.assertIsNone(r.pending)
        self.assertIsNone(r.position)
        self.assertEqual(r.cash,D('23.84614'))
        self.assertEqual(r.fees,D('42.85386'))
        self.assertTrue(r.report()['local_target_met'])
        self.assertEqual(r.first_crossing['timestamp'],56462)


if __name__=='__main__':unittest.main()
