"""Validate src/data/presets.ts: every key must exist in the settings catalog and be written to the
right file (GameUserSettings.ini vs Game.ini) – ARK silently ignores keys in the wrong file.

Usage: python scripts/check_presets.py   (exit code 1 on problems)
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / 'src/data/settings.generated.ts').read_text(encoding='utf-8')
catalog = json.loads(src[src.index('export const SETTINGS'):].split('=', 1)[1].strip().rstrip(';'))
where = {e['key']: e['file'] for e in catalog}
presets = (root / 'src/data/presets.ts').read_text(encoding='utf-8')

problems = []
for fn, key in re.findall(r"\b(gus|game)\('([A-Za-z_\[\]0-9]+)'", presets):
    if key.split('[')[0].startswith(('PerLevelStatsMultiplier', 'PlayerBaseStatMultipliers', 'MutagenLevelBoost')):
        if fn != 'game':
            problems.append(f'{key}: stat grids belong in Game.ini')
        continue
    if key not in where:
        problems.append(f'{key}: not in the settings catalog')
        continue
    want = 'GUS' if fn == 'gus' else 'Game'
    if where[key] != want:
        problems.append(f'{key}: preset writes {want}, catalog says {where[key]}')

if problems:
    print('\n'.join(sorted(set(problems))))
    sys.exit(1)
print('All preset keys valid.')
