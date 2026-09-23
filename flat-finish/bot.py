"""Flat Finish: original, experimental paper-only YeNo decision policy.

No exchange client, credentials, evaluator accounting or real-order support.
Synthetic tests establish behavior, not competition performance.
"""
import json
import math
from http.server import BaseHTTPRequestHandler, HTTPServer


def number(value):
    if isinstance(value, bool):
        raise ValueError('boolean is not a number')
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('nonfinite number')
    return value


def levels(rows, reverse=False):
    result = []
    for row in rows:
        price, size = map(number, row)
        if not 0 < price < 1 or size <= 0:
            raise ValueError('invalid level')
        result.append((price, size))
    return sorted(result, reverse=reverse)


def sweep(rows, quantity):
    gross = protocol = 0.0
    remaining = quantity
    for price, size in rows:
        taken = min(size, remaining)
        gross += taken * price
        protocol += .07 * taken * price * (1 - price)
        remaining -= taken
        if remaining <= 1e-9:
            break
    return gross, round(protocol, 5) + round(gross * .01, 5), remaining


class Policy:
    def __init__(self):
        self.last_time = -math.inf
        self.signal = None
        self.last_attempt = -math.inf

    def decide(self, observation):
        try:
            return self._decide(observation)
        except (KeyError, TypeError, ValueError, IndexError, OverflowError, AttributeError):
            self.signal = None
            return {'action': 'HOLD'}

    def _decide(self, obs):
        now = number(obs['timestamp'])
        if now <= self.last_time:
            return {'action': 'HOLD'}
        self.last_time = now
        account, market = obs['account'], obs['market']
        seconds = number(market['secondsToClose'])
        # The evaluator controls pending execution; never issue a new order over it.
        if account.get('pendingAction') or account.get('pendingBuy') or account.get('pendingOrder'):
            self.signal = None
            return {'action': 'HOLD'}
        position = account.get('position')
        if position is not None:
            self.signal = None
            side = position['outcome']
            if side not in ('YES', 'NO') or number(position['shares']) <= 0:
                return {'action': 'HOLD'}
            # SELL requests closing whatever inventory remains. The evaluator owns
            # latency, partial fills, one-sided depth and fill eligibility.
            # In particular, don't wait for full depth before attempting a partial exit.
            return {'action': 'SELL'}
        if number(account['eligibleVolumeUsd']) >= number(obs['rules']['targetVolumeUsd']):
            self.signal = None
            return {'action': 'HOLD'}
        if not 60 < seconds <= 240:
            self.signal = None
            return {'action': 'HOLD'}
        ref = obs['reference']
        if ref['targetProvisional'] is not False:
            raise ValueError('provisional reference')
        if not 0 <= now - number(ref['observedAt']) <= 1.5:
            raise ValueError('stale or future reference')
        if number(ref['targetObservedAt']) > now:
            raise ValueError('future target')
        gap = number(ref['btcMidUsd']) - number(ref['openingTargetUsd'])
        if abs(gap) < 50:
            self.signal = None
            return {'action': 'HOLD'}
        side = 'YES' if gap > 0 else 'NO'
        signal = (str(market['id']), side, now)
        previous = self.signal
        self.signal = signal
        # Require two close receive-time observations agreeing on direction.
        if previous is None or previous[:2] != signal[:2] or not .25 <= now - previous[2] <= 2:
            return {'action': 'HOLD'}
        if now - self.last_attempt < 2:
            return {'action': 'HOLD'}
        book = obs['books'][side]
        # Optional explicit book timestamps take precedence. The official sample
        # omits them; the evaluator contract enforces the two-second book limit.
        if 'observedAt' in book and not 0 <= now - number(book['observedAt']) <= 2:
            raise ValueError('stale book')
        asks, bids = levels(book['asks']), levels(book['bids'], True)
        minimum = number(book['minOrderSize'])
        if minimum <= 0:
            raise ValueError('invalid minimum size')
        quantity = max(5, minimum)
        buy, buy_fee, unfilled = sweep(asks, quantity)
        sell, sell_fee, unsold = sweep(bids, quantity)
        if unfilled > 1e-9 or unsold > 1e-9:
            return {'action': 'HOLD'}
        # Only enter an immediately executable fee-positive book. This is a
        # deliberately conservative hypothesis, not evidence of achievable volume.
        if sell - sell_fee - buy - buy_fee < .01:
            return {'action': 'HOLD'}
        cash = math.ceil((buy + buy_fee) * 1e6) / 1e6
        cap = min(5, number(obs['rules']['maximumBuyCashUsd']), number(account['cashUsd']))
        if not 0 < cash <= cap:
            return {'action': 'HOLD'}
        self.last_attempt = now
        self.signal = None
        return {'action': 'BUY', 'outcome': side, 'maxCashUsd': cash}


def handler_for(policy):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != '/decide':
                self.send_error(404)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536:
                    raise ValueError('request size')
                obs = json.loads(self.rfile.read(length))
                body = json.dumps(policy.decide(obs), allow_nan=False).encode()
            except (ValueError, TypeError):
                self.send_error(400)
                return
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass
    return Handler


if __name__ == '__main__':
    # Sequential handling avoids races in session state; one process per replay.
    HTTPServer(('127.0.0.1', 8080), handler_for(Policy())).serve_forever()
