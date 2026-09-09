import unittest
from datetime import datetime,timezone
from types import SimpleNamespace
from evidence import validate,timestamp,index_name,classify
NOW=datetime(2026,9,9,tzinfo=timezone.utc)
def row(**changes):
    return dict(id='one',text='Original policy',url='https://example.org/policy',observed_at='2026-09-08T00:00:00Z',expires_at='2026-09-10T00:00:00Z')|changes
def hit(id='one'): return SimpleNamespace(id=id,text='Poisoned text',score=.9)
class Tests(unittest.TestCase):
    def test_valid(self): self.assertEqual(validate([row()]),[row()])
    def test_expired(self):
        result=classify([row(expires_at=NOW.isoformat())],[hit()],NOW)
        self.assertEqual(result['decision'],'abstain')
        self.assertEqual(result['warnings'][0]['reason'],'expired')
    def test_future(self): self.assertFalse(classify([row(observed_at='2026-09-09T01:00:00Z')],[hit()],NOW)['evidence'])
    def test_unknown(self): self.assertEqual(classify([row()],[hit('alien')],NOW)['decision'],'abstain')
    def test_deduplicate(self): self.assertEqual(len(classify([row()],[hit(),hit()],NOW)['evidence']),1)
    def test_trusted_copy(self): self.assertEqual(classify([row()],[hit()],NOW)['evidence'][0]['text'],'Original policy')
    def test_empty(self): self.assertEqual(classify([row()],[],NOW)['decision'],'abstain')
    def test_naive(self):
        with self.assertRaises(ValueError): timestamp('2026-09-09')
    def test_invalid(self):
        for value in ([],[row(),row()],[row(url='http://example.org')],[row(url='https://u:p@example.org')],[row(text='')],[row(expires_at='2026-09-07T00:00:00Z')]):
            with self.subTest(value=value),self.assertRaises(ValueError): validate(value)
    def test_content_address(self): self.assertNotEqual(index_name([row()]),index_name([row(text='Changed')]))
    def test_order(self): self.assertEqual(index_name([row(),row(id='two')]),index_name([row(id='two'),row()]))
if __name__=='__main__': unittest.main()

class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_sdk_shapes_and_async_calls(self):
        import os,json,tempfile
        from pathlib import Path
        from unittest.mock import patch,AsyncMock
        import moss
        from evidence import run
        client=SimpleNamespace(create_index=AsyncMock(),load_index=AsyncMock(),query=AsyncMock(return_value=SimpleNamespace(docs=[hit()])))
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'sources.json'
            file.write_text(json.dumps([row(observed_at='2020-01-01T00:00:00Z',expires_at='2099-01-01T00:00:00Z')]))
            args=SimpleNamespace(command='index',sources=str(file),query='policy',top_k=3)
            with patch.dict(os.environ,{'MOSS_PROJECT_ID':'test-id','MOSS_PROJECT_KEY':'test-key'}),patch.object(moss,'MossClient',return_value=client):
                await run(args)
                client.create_index.assert_awaited_once()
                args.command='query'
                result=await run(args)
                self.assertEqual(result['provider'],'moss')
                self.assertEqual(result['evidence'][0]['id'],'one')
                client.load_index.assert_awaited_once()
                client.query.assert_awaited_once()
    async def test_missing_credentials_fails_before_provider(self):
        import os,json,tempfile
        from pathlib import Path
        from unittest.mock import patch
        from evidence import run
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'sources.json'
            file.write_text(json.dumps([row()]))
            with patch.dict(os.environ,{},clear=True),self.assertRaises(ValueError):
                await run(SimpleNamespace(sources=str(file)))
