"""Local diagnostic replay, NOT the organizer's evaluator or a qualification score.

Input is our normalized JSONL schema, not a claimed official data schema.
No networking, settlement, redemption, or real orders. Expired inventory remains
stranded and disqualifies this diagnostic, rather than inventing settlement cash.
"""
import argparse
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
import json

from bot import Policy

D = lambda x: Decimal(str(x))
ZERO = D(0)
TICK = D('.00001')


def fee(gross, protocol):
    # Local explicit rounding convention; official tie rounding is unpublished.
    return protocol.quantize(TICK, rounding=ROUND_HALF_UP) + (gross * D('.01')).quantize(TICK, rounding=ROUND_HALF_UP)


def fill(rows, quantity=None, budget=None):
    """Consume sorted depth; fee-inclusive budget uses conservative microshares."""
    gross = protocol = shares = ZERO
    for raw_price, raw_size in rows:
        price, size = D(raw_price), D(raw_size)
        if not price.is_finite() or not size.is_finite() or not 0 < price < 1 or size <= 0:
            raise ValueError('invalid depth')
        take = size if quantity is None else min(size, quantity - shares)
        if budget is not None:
            # Integer binary search accounts for rounded total fees at each level.
            lo, hi = 0, int(take * 1000000)
            while lo < hi:
                mid = (lo + hi + 1) // 2
                q = D(mid) / 1000000
                g, p = gross + q * price, protocol + D('.07') * q * price * (1-price)
                if g + fee(g, p) <= budget:
                    lo = mid
                else:
                    hi = mid - 1
            take = D(lo) / 1000000
        gross += take * price
        protocol += D('.07') * take * price * (1-price)
        shares += take
        if (quantity is not None and shares >= quantity) or take < size:
            break
    return shares, gross, fee(gross, protocol)


class Replay:
    def __init__(self, policy=None, start=0):
        self.policy = policy or Policy()
        self.start = D(start)
        self.last = None
        self.cash = D(10)
        self.volume = self.fees = ZERO
        self.position = self.pending = None
        self.books = {}
        self.cycles = self.fills = self.excluded = 0
        self.first_crossing = None

    def step(self, row):
        now = D(row['timestamp'])
        if not now.is_finite() or (self.last is not None and now < self.last):
            raise ValueError('receive times must be finite and chronological')
        self.last = now
        market = row['market']
        opened, closed = D(market['opensAt']), D(market['closesAt'])
        if closed - opened != 300:
            raise ValueError('only five-minute markets supported')
        ref = row.get('reference', {})
        if (not self.start <= now < self.start + 86400 or not market['complete']
                or not opened <= now < closed or D(ref.get('targetObservedAt', now)) > now):
            self.excluded += 1
            return
        side = row['outcome']
        if side not in ('YES', 'NO'):
            raise ValueError('unknown outcome')
        key = (market['id'], side)
        book = deepcopy(row['book'])
        stamp = D(book['observedAt'])
        if not stamp.is_finite() or not 0 <= now - stamp <= 2:
            self.excluded += 1
            return
        # Validate both sides even if the policy holds. No malformed input scores.
        book['asks'] = sorted(book['asks'], key=lambda x: D(x[0]))
        book['bids'] = sorted(book['bids'], key=lambda x: D(x[0]), reverse=True)
        fill(book['asks']); fill(book['bids'])
        minimum = D(book['minOrderSize'])
        if not minimum.is_finite() or minimum <= 0:
            raise ValueError('invalid order minimum')
        self.books[key] = book
        order = self.pending
        # Same-outcome post-latency update only, never the opposite-side cache.
        if order and key == order['key'] and now >= order['due'] and stamp >= order['due']:
            self.pending = None
            if order['action'] == 'BUY' and closed - now > 15:
                shares, gross, fees = fill(book['asks'], budget=min(order['budget'], self.cash))
                if shares >= minimum:
                    self.cash -= gross + fees
                    self.position = {'key': key, 'shares': shares, 'gross': gross, 'closes': closed}
                    self.fees += fees
                    self.fills += 1
            elif order['action'] == 'SELL' and self.position:
                # Residual partial exits are permitted in this diagnostic, even
                # below BUY minimum. Organizer dust handling needs confirmation.
                shares, gross, fees = fill(book['bids'], quantity=self.position['shares'])
                if shares:
                    self.cash += gross - fees
                    self.position['shares'] -= shares
                    self.position['gross'] += gross
                    self.fees += fees
                    self.fills += 1
                    if self.position['shares'] == 0:
                        self.volume += self.position['gross']
                        self.position = None
                        self.cycles += 1
                        if self.volume >= 1000 and self.first_crossing is None:
                            self.first_crossing = {'timestamp': float(now), 'cash_usd': float(self.cash)}
        if self.position and self.position['key'][0] != market['id']:
            return  # Never liquidate old inventory using another market's book.
        pos = self.position
        obs = {'timestamp': float(now), 'market': {'id': market['id'], 'secondsToClose': float(closed-now)},
               'account': {'cashUsd': float(self.cash), 'eligibleVolumeUsd': float(self.volume),
                           'pendingAction': bool(self.pending),
                           'position': None if pos is None else {'outcome': pos['key'][1], 'shares': float(pos['shares'])}},
               'rules': {'targetVolumeUsd': 1000, 'maximumBuyCashUsd': 5},
               'books': {s: self.books.get((market['id'], s), {'bids': [], 'asks': [], 'minOrderSize': 5}) for s in ('YES','NO')},
               'reference': ref}
        action = self.policy.decide(obs)
        if self.pending:
            return
        if action.get('action') == 'BUY' and pos is None and closed-now > 15:
            budget = D(action['maxCashUsd'])
            outcome = action['outcome']
            if not budget.is_finite() or outcome not in ('YES', 'NO') or not 0 < budget <= min(D(5),self.cash):
                raise ValueError('invalid BUY from policy')
            self.pending = {'action': 'BUY', 'key': (market['id'], outcome), 'budget': budget, 'due': now+D('.25')}
        elif action.get('action') == 'SELL' and pos:
            self.pending = {'action': 'SELL', 'key': pos['key'], 'due': now+D('.25')}

    def report(self):
        return {'label': 'local diagnostic only; not official qualification',
                'cash_usd': float(self.cash), 'closed_cycle_volume_usd': float(self.volume),
                'fees_usd': float(self.fees), 'closed_cycles': self.cycles, 'fills': self.fills,
                'terminal_shares': float(self.position['shares']) if self.position else 0,
                'terminal_pending': self.pending is not None, 'excluded_rows': self.excluded,
                'first_clean_crossing': self.first_crossing,
                'local_target_met': self.volume >= 1000 and self.position is None and self.pending is None}


def synthetic(crossed=False):
    """288 complete synthetic five-minute sessions. No historical price claim."""
    for m in range(288):
        start = m * 300
        for offset in (0,60,61,61.25,62,62.25,299.99):
            t = start + offset
            yield {'timestamp': t, 'market': {'id': str(m), 'opensAt': start, 'closesAt': start+300, 'complete': True},
                   'outcome': 'YES', 'book': {'observedAt': t, 'minOrderSize': 5,
                     'asks': [[.5, 100]], 'bids': [[.56 if crossed else .49, 100]]},
                   'reference': {'btcMidUsd': 80100, 'openingTargetUsd': 80000,
                     'observedAt': t, 'targetObservedAt': start, 'targetProvisional': False}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--input', help='normalized local JSONL; no network access')
    group.add_argument('--synthetic', choices=['normal', 'crossed'])
    parser.add_argument('--start', type=float, default=0, help='fixed evaluation start timestamp')
    args = parser.parse_args()
    replay = Replay(start=args.start)
    if args.input:
        with open(args.input) as stream:
            for line in stream:
                replay.step(json.loads(line))
    else:
        for row in synthetic(args.synthetic == 'crossed'):
            replay.step(row)
    print(json.dumps(replay.report(), indent=2, allow_nan=False))
