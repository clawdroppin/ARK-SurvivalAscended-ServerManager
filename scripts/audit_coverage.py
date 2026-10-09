"""Report ARK wiki options (ASA-applicable) that the app doesn't expose anywhere.

Usage:
  curl -sL "https://ark.wiki.gg/wiki/Server_configuration?action=raw" -o wiki.txt
  python scripts/parse_wiki.py wiki.txt vars.json
  python scripts/audit_coverage.py vars.json
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
read = lambda p: (root / p).read_text(encoding='utf-8')

catalog = {k.split('[')[0].lower() for k in re.findall(r'"key": "([^"]+)"', read('src/data/settings.generated.ts'))}
launch = {k.lstrip('-?').lower() for k in re.findall(r"key: '([-?][^']+)'", read('src/data/launchOptions.ts'))}
lists = {k.lower() for k in re.findall(r"key: '(\w+)'", read('src/data/listEditors.ts'))}
grids = {k.lower() for k in re.findall(r"key: '(\w+)'", read('src/data/stats.ts'))}
# Owned by the server profile / leveling generator / mod manager.
managed = {k.lower() for k in (
    'SessionName Port QueryPort RCONEnabled RCONPort ServerAdminPassword ServerPassword SpectatorPassword MaxPlayers '
    'ActiveMods ActiveMapMod LevelExperienceRampOverrides OverridePlayerLevelEngramPoints OverrideMaxExperiencePointsPlayer '
    'OverrideMaxExperiencePointsDino mods passivemods clusterid ClusterDirOverride WinLiveMaxPlayers port '
    'AltSaveDirectoryName listen MULTIHOME ServerIP ip').split()}
# Deliberately not exposed: official-host-only, save-format migration and renderer/engine switches.
excluded = {k.lower() for k in (
    'SecureSendArKPayload webalarm inlinesaveload noninlinesaveload oldsaveformat usecache vday BattlEyeServerRecheck '
    'CustomMerticsURL dedihibernation EnableOfficialOnlyVersioningCode EnableVictoryCoreDupeCheck forcedisablemeshchecking '
    'NitradoQueryPort nitradotest2 parseservertojson pauseonddos PreventTotalConversionSaveDir ReloadedForBackup '
    'd3d11 game log lowmemory nomansky nomemorybias norhithread opengl server vulkan').split()}

missing = []
for o in json.load(open(sys.argv[1], encoding='utf-8')):
    if o['inASA'].strip() == 'No' or o['section'] == 'DynamicConfig':
        continue
    name = o['name'].split('<')[0].split('[')[0].split('=')[0].strip().strip("'").split(' ')[0]
    base = name.lstrip('-?').lower()
    if o['section'] == 'Command line options':
        ok = base in launch or base in managed or base in excluded
    else:
        ok = base in catalog or base in lists or base in grids or base in managed
    if not ok:
        missing.append(f"{o['section']}: {name}")

print('\n'.join(missing) if missing else 'Full coverage – every ASA option is exposed or intentionally excluded.')
sys.exit(1 if missing else 0)
