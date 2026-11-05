#!/usr/bin/env python3
"""Local, dependency-free, read-only assessment of an AI-agent workflow."""
import argparse
import json
import sys
from pathlib import Path

FACTORS = (
    ('objetivo', 2), ('calidad', 3), ('coste', 2), ('supervision', 3),
    ('permisos', 3), ('trazabilidad', 2), ('recuperacion', 3),
)


def evaluate(data):
    if not isinstance(data, dict) or set(data) != {name for name, _ in FACTORS}:
        raise ValueError('Deben indicarse exactamente los siete factores definidos')
    if any(type(data[name]) is not int or not 0 <= data[name] <= 2 for name, _ in FACTORS):
        raise ValueError('Cada factor debe ser un entero entre 0 y 2')
    total = sum(data[name] * weight for name, weight in FACTORS)
    max_total = 2 * sum(weight for _, weight in FACTORS)
    critical = [name for name in ('calidad', 'supervision', 'permisos', 'recuperacion') if data[name] == 0]
    category = ('NO LISTO' if critical or total < 22 else 'PILOTO SUPERVISADO' if total < 31 else 'CANDIDATO A PRODUCCIÓN')
    return {'estado': category, 'puntuacion': total, 'maximo': max_total,
            'bloqueos': critical, 'nota': 'Evaluación orientativa. No certifica seguridad ni aptitud regulatoria.'}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Chequeo local orientativo de preparación de agentes IA')
    parser.add_argument('config', type=Path, help='Fichero JSON con siete factores de 0 a 2')
    args = parser.parse_args(argv)
    try:
        if args.config.stat().st_size > 65536:
            raise ValueError('El JSON supera el límite de 64 KiB')
        with args.config.open(encoding='utf-8') as handle:
            result = evaluate(json.load(handle))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print('ERROR: ' + str(exc), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['estado'] != 'NO LISTO' else 1


if __name__ == '__main__':
    sys.exit(main())
