import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from agent_readiness import evaluate

GOOD = dict(objetivo=2, calidad=2, coste=1, supervision=2, permisos=2, trazabilidad=1, recuperacion=2)
SCRIPT = Path(__file__).with_name('agent_readiness.py')

class ReadinessTests(unittest.TestCase):
    def test_production_candidate(self):
        self.assertEqual('CANDIDATO A PRODUCCIÓN', evaluate(GOOD)['estado'])

    def test_all_zero(self):
        self.assertEqual('NO LISTO', evaluate({k:0 for k in GOOD})['estado'])

    def test_critical_blocker(self):
        self.assertEqual('NO LISTO', evaluate(dict(GOOD, permisos=0))['estado'])

    def test_middle_score(self):
        self.assertEqual('PILOTO SUPERVISADO', evaluate(dict(GOOD, objetivo=0, coste=0, trazabilidad=0))['estado'])

    def test_missing_key(self):
        with self.assertRaises(ValueError):evaluate({'calidad':1})

    def test_bad_boolean(self):
        with self.assertRaises(ValueError):evaluate(dict(GOOD, coste=True))

    def test_extra_key(self):
        with self.assertRaises(ValueError):evaluate(dict(GOOD, private_token='X'))

    def test_cli_example(self):
        p=subprocess.run([sys.executable,str(SCRIPT),str(SCRIPT.with_name('ejemplo.json'))],capture_output=True,text=True)
        self.assertEqual(0,p.returncode)
        self.assertEqual('CANDIDATO A PRODUCCIÓN',json.loads(p.stdout)['estado'])

    def test_cli_bad_json(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.json';p.write_text('{bad}',encoding='utf-8')
            r=subprocess.run([sys.executable,str(SCRIPT),str(p)],capture_output=True,text=True)
            self.assertEqual(2,r.returncode)

if __name__=='__main__':unittest.main()
