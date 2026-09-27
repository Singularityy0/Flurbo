import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from flurbo_sdk.semantics import semantic_error
from flurbo_sdk.runtime.executor import Executor

F = json.loads((Path(__file__).resolve().parents[3] / 'protocol/fixtures/semantics.json').read_text())

class Semantics(unittest.TestCase):
    def test_conformance(self):
        for c in F['cases']:
            with self.subTest(c['name']):
                self.assertEqual(semantic_error(c['result'], F['deployment'], c['claim'], c['claim']['quantityAtoms'], F['now']), c['error'])

    def test_execution_aborts_before_approval_or_signing(self):
        for code in ('SEMANTIC_COLLISION', 'SEMANTICS_UNKNOWN', 'SEMANTICS_UNAVAILABLE'):
            c = next(c for c in F['cases'] if c['error'] == code)
            entry = dict(id='test', status='planned', action='buy', claim={'scope':3,'mask':'8'}, quantityAtoms='1000000')
            class Journal:
                def locked(self, fn):
                    return fn({'entries':[entry]})
            logs = []
            ex = Executor(None, SimpleNamespace(address='0x'+'4'*40), Journal(), SimpleNamespace(validate_trade=lambda *a: c['result']), None, lambda: (True,None), now=lambda: F['now'], log=lambda code,detail: logs.append(code))
            result = ex.execute(dict(deployment=F['deployment'], action='buy', claim={'scope':3,'mask':8}, quantityAtoms=1000000))
            self.assertEqual(result['reason'], code)
            self.assertIsNone(ex.sign('test', F['deployment']))
            self.assertEqual(entry['status'],'abandoned')
            self.assertEqual(entry['note'],code)
            self.assertIn(code,logs)
