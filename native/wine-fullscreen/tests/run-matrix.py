#!/usr/bin/env python3
"""Run serial, bounded non-game fixtures in new prefixes; retain every failure.

Requires built fullscreen.exe and observe-fullscreen.dylib in WORK/tests, and
private baseline-runtime/patched-runtime directories in WORK. Never use a game
prefix. The original geometry checker is unchanged.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--work', type=Path, required=True)
p.add_argument('cases', nargs='+', choices=['baseline-off', 'patched-off',
    'patched-on', 'patched-on-repeat', 'patched-retina', 'patched-close',
    'patched-app-off', 'patched-app-on', 'patched-green'])
a = p.parse_args()
work = a.work.resolve()
here = Path(__file__).resolve().parent
results = []
for name in a.cases:
    case = work / name
    case.mkdir()  # Refuse to reuse a prefix, including one from a failed run.
    shutil.copytree(work / 'tests', case / 'tests')
    (case / 'logs').mkdir()
    baseline = name.startswith('baseline')
    runtime = work / ('baseline-runtime' if baseline else 'patched-runtime')
    enabled = name not in ('baseline-off', 'patched-off', 'patched-app-off')
    global_value = 'absent' if name.endswith('-off') else 'Y'
    app_value = 'absent'
    if name == 'patched-app-off': global_value, app_value = 'Y', 'N'
    if name == 'patched-app-on': global_value, app_value = 'N', 'Y'
    env = {**os.environ, 'WINEPREFIX': str(case / 'test-prefix'),
        'WINEDEBUG': '-all', 'WINEDLLOVERRIDES': 'mscoree,mshtml=',
        'MVK_CONFIG_LOG_LEVEL': '0', 'YAAGL_WINE_WORK': str(case),
        'YAAGL_TEST_GREEN_BUTTON': '1', 'YAAGL_TEST_DUPLICATE_TOGGLE': '1'}
    if name == 'patched-close':
        env.update(YAAGL_TEST_CLOSE_DURING_ENTRY='1', YAAGL_TEST_SECONDS='12')
    if name == 'patched-green':
        env['YAAGL_OBSERVER_DYLIB'] = str(work / 'tests/observe-green-buttons.dylib')
    result = {'case': name, 'enabled': enabled,
        'retina': name == 'patched-retina', 'global': global_value, 'app': app_value}
    print('START', name, flush=True)
    try:
        with (case / 'setup.log').open('w') as log:
            subprocess.run([str(runtime / 'bin/wine'), 'reg', 'add',
                r'HKCU\Software\Wine\Mac Driver', '/v', 'RetinaMode',
                '/t', 'REG_SZ', '/d', 'Y' if result['retina'] else 'N', '/f'],
                env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=90)
        with (case / 'result.log').open('w') as log:
            run = subprocess.run(['bash', str(here / 'run-case.sh'), str(runtime),
                name, str(int(enabled)), global_value, app_value], env=env,
                stdout=log, stderr=subprocess.STDOUT, timeout=110)
            result['exitCode'] = run.returncode
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as error:
        result['error'] = str(error)
        # This server sees only the new, per-case prefix above.
        subprocess.run([str(runtime / 'bin/wineserver'), '-k'], env=env, timeout=10)
    finally:
        subprocess.run([str(runtime / 'bin/wineserver'), '-w'], env=env, timeout=15)
    results.append(result)
    (work / ('results-' + a.cases[0] + '.json')).write_text(json.dumps(results, indent=2) + '\n')
    print('END', json.dumps(result), flush=True)
raise SystemExit(int(any(r.get('exitCode') != 0 for r in results)))
