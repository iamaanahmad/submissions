import copy
import json
import threading
import unittest
import urllib.request
from http.server import HTTPServer
from bot import Policy, handler_for


def sample():
    return {'timestamp': 1000, 'market': {'id': 'synthetic', 'secondsToClose': 100},
            'account': {'cashUsd': 10, 'eligibleVolumeUsd': 0, 'position': None},
            'rules': {'maximumBuyCashUsd': 5, 'targetVolumeUsd': 1000},
            'reference': {'btcMidUsd': 80500, 'openingTargetUsd': 80400,
                          'observedAt': 1000, 'targetObservedAt': 990, 'targetProvisional': False},
            'books': {side: {'bids': [[.6, 10]], 'asks': [[.5, 10]], 'minOrderSize': 5}
                      for side in ['YES', 'NO']}}


def advance(o, seconds=1):
    o['timestamp'] += seconds
    o['reference']['observedAt'] = o['timestamp']


class Tests(unittest.TestCase):
    def setUp(self):
        self.bot, self.o = Policy(), sample()

    def warm(self):
        self.assertEqual(self.bot.decide(self.o), {'action': 'HOLD'})
        advance(self.o)

    def test_persistent_signal_buys_with_fee_cap(self):
        self.warm()
        result = self.bot.decide(self.o)
        self.assertEqual(result['action'], 'BUY')
        self.assertEqual(result['outcome'], 'YES')
        self.assertAlmostEqual(result['maxCashUsd'], 2.6125)

    def test_no_outcome(self):
        self.o['reference']['btcMidUsd'] = 80300
        self.warm()
        self.assertEqual(self.bot.decide(self.o)['outcome'], 'NO')

    def test_normal_spread_does_not_buy(self):
        self.o['books']['YES']['bids'] = [[.49, 100]]
        self.warm()
        self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_reference_and_market_gates(self):
        for key, value in [('observedAt', 1002), ('observedAt', 900),
                           ('targetObservedAt', 1002), ('targetProvisional', True),
                           ('btcMidUsd', float('nan'))]:
            with self.subTest(key=key, value=value):
                self.setUp(); self.warm(); self.o['reference'][key] = value
                self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_entry_cutoff(self):
        for remaining in [60, 15, 0, -1, 241]:
            self.setUp(); self.warm(); self.o['market']['secondsToClose'] = remaining
            self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_partial_one_sided_deadline_exit(self):
        self.o['account']['position'] = {'outcome': 'YES', 'shares': 5}
        self.o['market']['secondsToClose'] = 1
        self.o['books']['YES'] = {'bids': [[.45, 1]], 'asks': []}
        del self.o['reference']
        self.assertEqual(self.bot.decide(self.o), {'action': 'SELL'})
        advance_time = self.o['timestamp'] + 1
        self.o['timestamp'] = advance_time
        self.o['account']['position']['shares'] = 4
        self.assertEqual(self.bot.decide(self.o), {'action': 'SELL'})

    def test_unfilled_exit_retries_without_inventing_volume(self):
        self.o['account']['position'] = {'outcome': 'NO', 'shares': 5}
        self.o['books']['NO'] = {'bids': [], 'asks': []}
        before = copy.deepcopy(self.o)
        self.assertEqual(self.bot.decide(self.o)['action'], 'SELL')
        self.assertEqual(self.o, before)

    def test_pending_order(self):
        for field in ['pendingAction', 'pendingBuy', 'pendingOrder']:
            self.setUp(); self.warm(); self.o['account'][field] = {'action': 'BUY'}
            self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_cash_and_hard_cap(self):
        for cash, limit in [(2, 5), (10, 2), (10, -1)]:
            self.setUp(); self.warm()
            self.o['account']['cashUsd'] = cash
            self.o['rules']['maximumBuyCashUsd'] = limit
            self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_insufficient_depth(self):
        for side in ['asks', 'bids']:
            self.setUp(); self.warm(); self.o['books']['YES'][side] = [[.5, 1]]
            self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_min_order_exceeds_cash(self):
        self.warm(); self.o['books']['YES']['minOrderSize'] = 10
        self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_stop_at_target_but_exit_owned_inventory(self):
        self.warm(); self.o['account']['eligibleVolumeUsd'] = 1000
        self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')
        advance(self.o); self.o['account']['position'] = {'outcome': 'YES', 'shares': 5}
        self.assertEqual(self.bot.decide(self.o)['action'], 'SELL')

    def test_flip_resets_signal(self):
        self.warm(); self.o['reference']['btcMidUsd'] = 80300
        self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_market_change_resets_signal(self):
        self.warm(); self.o['market']['id'] = 'new'
        self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_stale_book(self):
        self.warm(); self.o['books']['YES']['observedAt'] = 990
        self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_out_of_order(self):
        self.bot.decide(self.o); self.o['timestamp'] -= 1
        self.assertEqual(self.bot.decide(self.o)['action'], 'HOLD')

    def test_malformed(self):
        for value in [None, [], {}, {'timestamp': True}, {'timestamp': float('inf')}]:
            self.assertEqual(Policy().decide(value)['action'], 'HOLD')

    def test_http_contract(self):
        server = HTTPServer(('127.0.0.1', 0), handler_for(Policy()))
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/decide'
            request = urllib.request.Request(url, json.dumps(sample()).encode(), {'Content-Type': 'application/json'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(json.load(response), {'action': 'HOLD'})
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
