"""Sky Window's public-progress coverage policy for the v4 survey.

The policy groups targets into eight right-ascension sectors. It gives a
bounded preference to sectors with fewer confirmed completions. This adapts
Sky Window's earlier coverage idea to v4 target-level feedback without using
future weather or hidden card data.
"""

from __future__ import annotations


def coverage_weights(ra: list[float], factor: list[float], required: list[bool],
                     required_threshold: float) -> tuple[float, ...]:
    """Return one multiplier per sector, in [1, 1.12]."""
    totals = [0] * 8
    done = [0] * 8
    for angle, progress, must_finish in zip(ra, factor, required):
        sector = int((angle % 360.0) // 45.0)
        totals[sector] += 1
        if progress >= (required_threshold if must_finish else 0.95):
            done[sector] += 1
    all_targets = sum(totals)
    if not all_targets:
        return (1.0,) * 8
    overall = sum(done) / all_targets
    if overall == 0:
        return (1.0,) * 8
    return tuple(
        1.0 + min(0.12, 0.12 * max(0.0, overall - done[i] / totals[i]))
        if totals[i] else 1.0
        for i in range(8)
    )


def target_coverage_weight(angle: float, weights: tuple[float, ...]) -> float:
    return weights[int((angle % 360.0) // 45.0)]
