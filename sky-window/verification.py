"""Shared checks for deterministic Sky Window execution evidence."""
import csv


def require_complete(summary, log):
    if summary.get('termination_reason') != 'survey_complete':
        raise ValueError('Entry did not finish the survey')
    if 'using the default ranking' in log:
        raise ValueError('Strategy fallback is not entry verification')
    if 'provider=deterministic\n' not in log:
        raise ValueError('Expected deterministic execution without a model provider')


def require_strategy_decisions(path):
    # This is the current policy's own reason, preserved by the pinned wrapper.
    # Completion and logs alone cannot detect its silent default-policy branches.
    expected = 'current gain, confirmed coverage, and remaining viewing time'
    detector_reason = 'repeat observation to confirm an anomalous realized-score deviation'
    observations = detector_observations = 0
    with path.open(newline='') as source:
        rows = csv.DictReader(source)
        if not {'action', 'reason'}.issubset(rows.fieldnames or []):
            raise ValueError('Missing strategy decision evidence')
        for row in rows:
            if row['action'] == 'observe':
                if row['reason'] == detector_reason:
                    detector_observations += 1
                    continue
                if row['reason'] != expected:
                    raise ValueError('Strategy fallback or unrecognized observation reason')
                observations += 1
    if not observations:
        raise ValueError('No strategy observations were verified')
    return {'strategy': observations, 'organizer_detector': detector_observations}

