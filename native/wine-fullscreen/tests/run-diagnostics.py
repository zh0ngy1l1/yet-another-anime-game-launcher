#!/usr/bin/env python3
"""Run auxiliary-update and injected-failure diagnostics in fresh private prefixes."""
import argparse
import json
import os
from pathlib import Path
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--work', type=Path, required=True)
p.add_argument('cases', nargs='+', choices=['baseline-resizable', 'patched-resizable',
    'patched-fixed', 'callbacks'])
a = p.parse_args()
work = a.work.resolve()
here = Path(__file__).resolve().parent
results = []
for name in a.cases:
    case = work / name
    case.mkdir()  # Never reuse stale signals or a previous prefix.
    runtime = work / ('baseline-runtime' if name.startswith('baseline') else 'patched-runtime')
    env = {**os.environ, 'WINEPREFIX': str(case / 'test-prefix'), 'WINEDEBUG': '-all',
           'WINEDLLOVERRIDES': 'mscoree,mshtml=', 'MVK_CONFIG_LOG_LEVEL': '0'}
    result = {'case': name}
    print('START', name, flush=True)
    try:
        with (case / 'setup.log').open('w') as log:
            for key, value in [('RetinaMode', 'N'), ('AllowFixedSizeFullscreen', 'Y')]:
                subprocess.run([str(runtime / 'bin/wine'), 'reg', 'add',
                    r'HKCU\Software\Wine\Mac Driver', '/v', key, '/t', 'REG_SZ', '/d', value, '/f'],
                    env=env, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=90)
        subprocess.run([str(runtime / 'bin/wineserver'), '-w'], env=env, check=True, timeout=20)
        executable = 'fullscreen.exe' if name == 'callbacks' else 'auxiliary-update.exe'
        observer = 'failure-callbacks.dylib' if name == 'callbacks' else 'observe-auxiliary-update.dylib'
        env.update(YAAGL_OBSERVER_LOG=str(case / 'native.log'),
                   DYLD_INSERT_LIBRARIES=str(work / 'tests' / observer),
                   YAAGL_TEST_SECONDS='12', YAAGL_AUX_COMMAND=str(case / 'update.signal'),
                   YAAGL_AUX_RESIZABLE_PARENT='1' if name.endswith('resizable') else '0')
        with (case / 'windows.log').open('w') as log:
            run = subprocess.run([str(runtime / 'bin/wine'), str(work / 'tests' / executable)],
                env=env, stdout=log, stderr=subprocess.STDOUT, timeout=40)
        result['exitCode'] = run.returncode
        native = (case / 'native.log').read_text() if (case / 'native.log').exists() else ''
        lines = native.splitlines()
        records = [line for line in lines if line.startswith('RESULT ')]
        result['passed'] = (run.returncode == 0 and records == ['RESULT failures=0']
                            and not any(line.startswith('FAIL ') for line in lines))
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as error:
        result.update(error=str(error), passed=False)
        subprocess.run([str(runtime / 'bin/wineserver'), '-k'], env=env, timeout=10)
    finally:
        subprocess.run([str(runtime / 'bin/wineserver'), '-w'], env=env, timeout=15)
    results.append(result)
    (work / ('diagnostics-' + a.cases[0] + '.json')).write_text(json.dumps(results, indent=2) + '\n')
    print('END', json.dumps(result), flush=True)
raise SystemExit(int(any(not r['passed'] for r in results)))
