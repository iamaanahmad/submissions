"""Window-aware telescope scheduling using only organizer-published snapshots.

No filesystem, network, model, or hidden scenario access. The wrapper owns
candidate validation and anomaly reporting. Memory records confirmed progress,
not attempted observations.
"""
from collections import Counter
from datetime import datetime


def _time(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (AttributeError, TypeError, ValueError):
        return None


def _evenness(counts):
    total = sum(counts.values())
    squares = sum(x * x for x in counts.values())
    return total * total / (len(counts) * squares) if squares else 0.0


def choose_action(candidates, snapshot, memory):
    if not candidates:
        return None
    regions = memory.setdefault('regions', {})
    for row in snapshot.get('candidate_tiles', []):
        regions[row['tile_id']] = row['region_id']
    for publication in ('night_start', 'weekly'):
        for row in (snapshot.get(publication) or {}).get('tile_windows', []):
            if 'region_id' in row:
                regions[row['tile_id']] = row['region_id']
    completed = set((snapshot.get('progress') or {}).get('completed_tile_ids', []))
    counts = Counter({region: 0 for region in regions.values()})
    counts.update(regions[tile] for tile in completed if tile in regions)
    bests = memory.setdefault('realized_bests', {})
    feedback = snapshot.get('tile_last_finished') or {}
    if feedback.get('tile_id') is not None and isinstance(feedback.get('score'), (float, int)):
        tile = feedback['tile_id']
        bests[tile] = max(bests.get(tile, 0.0), feedback['score'])
    science = sum(bests.values())
    weight = float((snapshot.get('score_config') or {}).get('coverage_bonus_weight', 0.0))
    before = _evenness(counts)
    now = _time((snapshot.get('cursor') or {}).get('timestamp_utc'))
    windows = {row['tile_id']: _time(row.get('window_end_utc')) for row in snapshot.get('candidate_tiles', [])}

    def value(candidate):
        duration = max(1.0, float(candidate.get('nominal_exptime_seconds', 900)))
        gain = float(candidate.get('estimated_total_gain', 0.0))
        region = candidate.get('region_id')
        after = before
        if candidate['tile_id'] not in completed and region in counts:
            updated = counts.copy()
            updated[region] += 1
            after = _evenness(updated)
        if weight:
            marginal = float(candidate.get('estimated_science_score', 0.0))
            gain += weight * ((science + marginal) * after - science * before)
        end = windows.get(candidate['tile_id'])
        urgency = 0.0
        if now is not None and end is not None and end >= now + duration:
            # A small bounded preference for an observation that loses its
            # current window soon. Never mistakes a horizon for a final deadline.
            urgency = 0.15 * duration / max(duration, end - now)
        return gain / duration * (1.0 + urgency)

    chosen = dict(max(candidates, key=value))
    chosen['reason'] = 'current gain, confirmed coverage, and remaining viewing time'
    return chosen
