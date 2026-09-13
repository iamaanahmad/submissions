"""Sequential, leakage-resistant benchmark client for TigerGraph GraphRAG.

This is an external API client, not a copy of the upstream implementation.
Python 3.11+; no dependencies. No network call occurs without the run command.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

PIPELINES = {
    'rag': ('classic', 'similaritysearch'),
    'graphrag': ('classic', 'hybridsearch'),
    'agentic': ('agentic', 'planned'),
}


def load_questions(path):
    rows = []
    seen = set()
    for line in Path(path).read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict):
            raise ValueError('Question must be an object')
        for field in ('qid', 'question', 'qtype'):
            if not isinstance(row.get(field), str) or not row[field].strip():
                raise ValueError('Missing question field: ' + field)
        if row['qid'] in seen:
            raise ValueError('Duplicate question id')
        for field in ('answer', 'gold_doc_ids'):
            if field in row and (not isinstance(row[field], list) or
                                not all(isinstance(s, str) and s.strip() for s in row[field])):
                raise ValueError('Expected string list: ' + field)
        seen.add(row['qid'])
        rows.append(row)
    if not rows:
        raise ValueError('Empty question set')
    return rows


def payload(question, pipeline):
    mode, method = PIPELINES[pipeline]
    # Deliberate allowlist. Gold answers, qtype and gold evidence never reach the model.
    return {'query': question['question'], 'mode': mode, 'rag_method': method,
            'include_fields': ['query_sources']}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Endpoint redirects are disabled')


class Client:
    def __init__(self, base_url, graph, username, password, timeout=90):
        parsed = urllib.parse.urlsplit(base_url)
        if (parsed.scheme != 'https' and not
                (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1'))):
            raise ValueError('Use HTTPS, or HTTP on loopback only')
        if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Invalid service URL')
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', graph):
            raise ValueError('Invalid graph name')
        if not username or not password or ':' in username:
            raise ValueError('Missing or invalid service credentials')
        if not 1 <= timeout <= 300:
            raise ValueError('Timeout must be between 1 and 300 seconds')
        self.url = base_url.rstrip('/') + '/' + graph + '/query'
        self.auth = base64.b64encode((username + ':' + password).encode()).decode()
        self.timeout = timeout
        self.opener = urllib.request.build_opener(NoRedirect())

    def query(self, question, pipeline):
        req = urllib.request.Request(self.url, data=json.dumps(payload(question, pipeline)).encode(),
              headers={'Authorization': 'Basic ' + self.auth, 'Content-Type': 'application/json'})
        try:
            with self.opener.open(req, timeout=self.timeout) as response:
                raw = response.read(8_000_001)
                if len(raw) > 8_000_000:
                    raise ValueError('Response exceeds limit')
                value = json.loads(raw)
        except urllib.error.HTTPError as exc:
            # Never log provider bodies: they can contain credentials or stack traces.
            raise ValueError('Service HTTP status ' + str(exc.code)) from None
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            raise ValueError('Service transport or JSON failure') from None
        if (not isinstance(value, dict) or
                not isinstance(value.get('natural_language_response'), str) or
                type(value.get('answered_question')) is not bool or
                not isinstance(value.get('query_sources'), (dict, type(None)))):
            raise ValueError('Invalid GraphRAG response envelope')
        return value


def normalize(text):
    return ' '.join(re.findall(r'\w+', text.casefold()))


def score(question, response):
    answer = response['natural_language_response']
    answered = response['answered_question']
    gold = question.get('answer')
    # Conservative whole-answer equality; this is NOT the organizer's semantic judge.
    exact = (int(answered and normalize(answer) in {normalize(s) for s in gold})
             if gold else None)
    # Explicit Q-ID references only. Do not confuse retrieved documents with citations.
    cited = set(re.findall(r'\bQ\d+\b', answer))
    expected = set(question.get('gold_doc_ids', []))
    return {'exact_match_proxy': exact,
            'gold_citation_recall': len(cited & expected) / len(expected) if expected else None,
            'cited_document_ids': sorted(cited),
            'citation_semantics_verified': False,
            'semantic_accuracy': None, 'completeness': None,
            'input_tokens': None, 'output_tokens': None, 'total_tokens': None}


def audit_pipeline(pipeline, response):
    sources = response.get('query_sources') or {}
    observed = sources.get('chosen_retriever')
    if pipeline != 'agentic' and observed:
        return 'matched' if observed == PIPELINES[pipeline][1] else 'mismatch'
    # Upstream may silently downgrade agentic mode. A request is not proof of execution.
    return 'unverified'


def run(questions, client, output):
    # Exclusive creation protects previous results and prevents accidental repeat runs.
    with Path(output).open('x', encoding='utf-8') as file:
        for question in questions:
            for pipeline in PIPELINES:
                start = time.monotonic()
                response = client.query(question, pipeline)
                row = {'qid': question['qid'], 'qtype': question['qtype'], 'pipeline': pipeline,
                       'question_sha256': hashlib.sha256(question['question'].encode()).hexdigest(),
                       'seconds': round(time.monotonic() - start, 4),
                       'pipeline_audit': audit_pipeline(pipeline, response),
                       'response': response, 'metrics': score(question, response)}
                file.write(json.dumps(row, ensure_ascii=False) + '\n')
                file.flush()
    # Fail-fast, no automatic retries: interrupted requests can still incur model usage.


def summary(rows):
    result = {}
    for pipeline in PIPELINES:
        group = [r for r in rows if r['pipeline'] == pipeline]
        scored = [r['metrics']['exact_match_proxy'] for r in group
                  if r['metrics']['exact_match_proxy'] is not None]
        result[pipeline] = {'answers': len(group), 'scored_answers': len(scored),
                           'exact_match_proxy': sum(scored) / len(scored) if scored else None,
                           'pipeline_mismatches': sum(r['pipeline_audit'] == 'mismatch' for r in group),
                           'pipeline_unverified': sum(r['pipeline_audit'] == 'unverified' for r in group),
                           'semantic_accuracy': None, 'completeness': None, 'total_tokens': None}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    validate = sub.add_parser('validate')
    validate.add_argument('questions')
    execute = sub.add_parser('run')
    execute.add_argument('questions')
    execute.add_argument('--output', required=True)
    execute.add_argument('--limit', type=int, default=1, help='Smoke-test default: one question, three requests')
    execute.add_argument('--confirm-free-runtime', action='store_true')
    report = sub.add_parser('report')
    report.add_argument('results')
    args = parser.parse_args()
    try:
        if args.command == 'validate':
            questions = load_questions(args.questions)
            print(json.dumps({'questions': len(questions),
                              'with_gold_answers': sum(bool(q.get('answer')) for q in questions),
                              'sha256': hashlib.sha256(Path(args.questions).read_bytes()).hexdigest()}))
        elif args.command == 'report':
            rows = [json.loads(line) for line in Path(args.results).read_text().splitlines() if line.strip()]
            print(json.dumps(summary(rows), indent=2))
        else:
            if not args.confirm_free_runtime:
                raise ValueError('Confirm that this runtime uses approved free credits before running')
            questions = load_questions(args.questions)
            if not 1 <= args.limit <= len(questions):
                raise ValueError('Limit is outside the question set')
            client = Client(os.environ.get('TG_GRAPHRAG_URL', ''), os.environ.get('TG_GRAPH', ''),
                            os.environ.get('TG_USERNAME', ''), os.environ.get('TG_PASSWORD', ''))
            run(questions[:args.limit], client, args.output)
    except (ValueError, OSError, KeyError, TypeError):
        # Exception details may include raw file/provider data. Keep CLI logs safe.
        parser.exit(2, 'Benchmark failed. Check input schema, runtime access, and output path. No retries were made.\n')


if __name__ == '__main__':
    main()
