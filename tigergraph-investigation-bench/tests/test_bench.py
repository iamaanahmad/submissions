import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import Mock
import bench
Q={'qid':'q1','qtype':'single','question':'Who won?','answer':['Chen Ding'],'gold_doc_ids':['Q123']}
R={'natural_language_response':'Chen Ding','answered_question':True,'query_sources':{'chosen_retriever':'similaritysearch'}}
class Tests(unittest.TestCase):
 def test_gold_never_sent(self):
  for p in bench.PIPELINES:
   self.assertEqual(set(bench.payload(Q,p)),{'query','mode','rag_method','include_fields'})
   self.assertNotIn('Chen Ding',json.dumps(bench.payload(Q,p)))
 def test_distinct_modes(self):
  self.assertEqual(len({json.dumps(bench.payload(Q,p)) for p in bench.PIPELINES}),3)
 def test_exact_whole_answer(self):
  self.assertEqual(bench.score(Q,R)['exact_match_proxy'],1)
  self.assertEqual(bench.score(Q,dict(R,natural_language_response='Not Chen Ding'))['exact_match_proxy'],0)
 def test_abstention(self):
  self.assertEqual(bench.score(Q,dict(R,answered_question=False))['exact_match_proxy'],0)
 def test_hidden_not_zero(self): self.assertIsNone(bench.score({},R)['exact_match_proxy'])
 def test_tokens_unknown(self): self.assertIsNone(bench.score(Q,R)['total_tokens'])
 def test_retrieval_not_citation(self):
  self.assertEqual(bench.score(Q,dict(R,query_sources={'docs':['Q123']}))['gold_citation_recall'],0)
 def test_explicit_citations(self):
  s=bench.score(Q,dict(R,natural_language_response='Chen Ding [Q123] [Q999]'))
  self.assertEqual(s['gold_citation_recall'],1)
  self.assertEqual(s['cited_document_ids'],['Q123','Q999'])
  self.assertFalse(s['citation_semantics_verified'])
 def test_pipeline_mismatch(self):
  self.assertEqual(bench.audit_pipeline('graphrag',R),'mismatch')
  self.assertEqual(bench.audit_pipeline('agentic',R),'unverified')
 def test_duplicate_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'q';p.write_text(json.dumps(Q)+'\n'+json.dumps(Q))
   with self.assertRaises(ValueError): bench.load_questions(p)
 def test_empty_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'q';p.write_text('')
   with self.assertRaises(ValueError): bench.load_questions(p)
 def test_output_exclusive_incremental(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'result';c=Mock();c.query.side_effect=[R,ValueError('failure')]
   with self.assertRaises(ValueError): bench.run([Q],c,p)
   self.assertEqual(len(p.read_text().splitlines()),1)
   self.assertEqual(c.query.call_count,2)
   with self.assertRaises(FileExistsError): bench.run([Q],c,p)
 def test_summary_hidden_empty(self):
  r=bench.summary([{'pipeline':'rag','pipeline_audit':'unverified','metrics':bench.score({},R)}])
  self.assertIsNone(r['rag']['exact_match_proxy'])
  self.assertEqual(r['graphrag']['answers'],0)
 def test_transport(self):
  got=[]
  class Handler(BaseHTTPRequestHandler):
   def log_message(self,*args): pass
   def do_POST(self):
    got.append((self.path,json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
    self.send_response(200);self.end_headers();self.wfile.write(json.dumps(R).encode())
  server=HTTPServer(('127.0.0.1',0),Handler)
  t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
  try:
   c=bench.Client('http://127.0.0.1:'+str(server.server_port),'Olympics','test','fake')
   self.assertEqual(c.query(Q,'rag'),R)
   self.assertEqual(got[0],('/Olympics/query',bench.payload(Q,'rag')))
  finally: server.shutdown();server.server_close();t.join()
 def test_unsafe_urls(self):
  for url in ('http://example.com','https://u:p@example.com','https://example.com?q=secret'):
   with self.assertRaises(ValueError): bench.Client(url,'Graph','u','p')
 def test_redirect_blocked(self):
  with self.assertRaises(ValueError): bench.NoRedirect().redirect_request(None,None,302,'',{},'https://elsewhere.example')
if __name__=='__main__': unittest.main()
