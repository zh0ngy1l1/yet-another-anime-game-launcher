#!/usr/bin/env python3
"""Complete-hashing contract regressions with disposable filesystem inputs.

Fixture mutations change temporary recipe copies, never production flags or live
data. Uses a read-only qualified Wine input; never executes Wine or a game.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def literal(value):
    return "'" + str(value).replace('\\', '\\\\').replace("'", "\\'") + "'"


def inject(text, anchor, extra):
    assert text.count(anchor) == 1, (anchor, text.count(anchor))
    return text.replace(anchor, extra + '\n' + anchor)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    repo = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((repo / 'native/wine-r2/delta.json').read_text())
    code = (repo / 'src/clients/mhy/hk4e/prepare-r2.pl').read_text()
    assert code.count("'/usr/bin/openssl'") == 1, 'Expected one system digest executable literal'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    records = []
    relative = 'lib/wine/x86_64-unix/ntdll.so'
    with tempfile.TemporaryDirectory(prefix='yaagl-hash-contract-') as temp:
        root = Path(temp).resolve()
        source = root / 'source'
        pristine = root / 'pristine'
        for name in [relative, *manifest['pins']]:
            dest = pristine / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(args.runtime / name, dest)
        ntdll = pristine / relative
        original = bytearray(ntdll.read_bytes())
        if sha(ntdll) == manifest['outputSha256']:
            for offset, old, new in manifest['changes']:
                assert original[offset] == new
                original[offset] = old
        assert hashlib.sha256(original).hexdigest() == manifest['inputSha256']
        ntdll.write_bytes(original)
        # Fixed nonzero data above the intended large-file threshold. Keep it bounded.
        payload = pristine / 'inventory-fixture.bin'
        payload.write_bytes(bytes(range(256)) * (9 * 4096))
        threshold_files = []
        for name, size in [
            ('threshold-below.bin', 2 * 1024 * 1024 - 1),
            ('threshold-exact.bin', 2 * 1024 * 1024),
            ("threshold-above-'原神.bin", 2 * 1024 * 1024 + 1),
        ]:
            path = pristine / name
            path.write_bytes((bytes(range(256)) * (size // 256 + 1))[:size])
            threshold_files.append(path)
        (pristine / 'small.bin').write_bytes(b'complete small-file bytes\x00\xff')
        (pristine / 'empty.bin').write_bytes(b'')
        (pristine / 'internal-link').symlink_to('inventory-fixture.bin')
        parent = root / 'prepared'
        parent.mkdir()
        retained = parent / 'r2-retained'
        retained.mkdir()
        (retained / 'unrelated').write_text('retain this existing fixture')

        def reset():
            if source.exists():
                shutil.rmtree(source)
            shutil.copytree(pristine, source, symlinks=True)

        def run(name, recipe=code, ok=False, error=None, interrupted=False, keep=False):
            reset()
            local_recipe = root / (name + '.pl')
            local_recipe.write_text(recipe)
            before = set(parent.iterdir())
            completed = subprocess.run(
                ['/usr/bin/perl', str(local_recipe), str(source), str(parent), json.dumps(manifest)],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45,
            )
            stdout = completed.stdout.decode()
            stderr = completed.stderr.decode(errors='replace')
            assert 'cleanup/publication raced digest child' not in stderr, (name, stderr)
            new = set(parent.iterdir()) - before
            assert (completed.returncode == 0) == ok, (name, completed.returncode, stderr)
            assert (retained / 'unrelated').read_text() == 'retain this existing fixture'
            receipt = None
            if ok:
                runtime = Path(stdout.strip())
                assert len(new) == 1 and runtime.parent in new and runtime.name == 'wine'
                receipt = json.loads((runtime.parent / 'receipt.json').read_text())
                assert receipt['files']['/inventory-fixture.bin'][3] == sha(payload)
                assert receipt['files']['/small.bin'][3] == sha(pristine / 'small.bin')
                assert receipt['files']['/empty.bin'][3] == hashlib.sha256(b'').hexdigest()
                for path in threshold_files:
                    assert receipt['files']['/' + path.name][2:] == [path.stat().st_size, sha(path)]
                assert receipt['files']['/internal-link'] == ['link', 'inventory-fixture.bin']
                assert (runtime / 'inventory-fixture.bin').stat().st_ino != (source / payload.name).stat().st_ino
            else:
                assert stdout == '', (name, stdout)
                if interrupted:
                    assert len(new) == 1
                    abandoned = next(iter(new))
                    assert (abandoned / 'receipt.json.tmp').is_file()
                    assert not (abandoned / 'receipt.json').exists()
                else:
                    assert not new, (name, list(new))
                if error:
                    assert error in stderr, (name, stderr)
            records.append({'case': name, 'passed': True, 'exitCode': completed.returncode,
                            'unpublished': not ok, 'retainedExistingOutput': True})
            if not keep:
                for path in new:
                    shutil.rmtree(path)
            return receipt, new

        candidate, _ = run('candidate-complete-receipt', ok=True)
        # Retain the previous complete-file digest as an independent reference while
        # exercising the current inventories, admission, signatures and publication.
        previous_hash = '''sub hash_file {
            my ($path) = @_;
            sysopen(my $f, $path, O_RDONLY | O_NOFOLLOW) or die "open $path: $!";
            die "not regular: $path" unless -f $f;
            my $hash = Digest::SHA->new(256)->addfile($f)->hexdigest;
            close($f) or die "close $path: $!";
            return $hash;
        }
'''
        assert code.count('sub hash_file {') == code.count('sub inventory {') == 1
        start, end = code.index('sub hash_file {'), code.index('sub inventory {')
        baseline_code = code[:start] + previous_hash + code[end:]
        baseline, _ = run('baseline-complete-receipt', recipe=baseline_code, ok=True)
        # Same source and manifest; only the fresh request-private runtime path differs.
        candidate.pop('runtime')
        baseline.pop('runtime')
        assert candidate == baseline, 'Inventory/receipt mismatch against baseline'
        records.append({'case': 'baseline-candidate-receipt-equality', 'passed': True})

        byte_mutation = '''open(my $fixture, '+<', "ROOT/inventory-fixture.bin") or die $!;
        binmode($fixture); print {$fixture} "changed" or die $!; close($fixture) or die $!;'''
        for side in ('source', 'copy'):
            for field, mutation in [
                ('bytes', byte_mutation.replace('ROOT', '$' + side)),
                ('mode', 'chmod(0600, "$' + side + '/inventory-fixture.bin") or die $!;'),
                ('link', 'unlink("$' + side + '/internal-link") or die $!; symlink("small.bin", "$' + side + '/internal-link") or die $!;'),
            ]:
                mutant = inject(code, "    timing_phase('copied-inventory');", mutation)
                run(side + '-' + field + '-mutation-rejected', recipe=mutant,
                    error='runtime changed during preparation')
        changed_final = inject(code, "    timing_phase('output-inventory');",
                               byte_mutation.replace('ROOT', '$copy'))
        run('final-output-byte-mutation-rejected', recipe=changed_final,
            error='prepared runtime mismatch')
        escaped = inject(code, "    timing_phase('copied-inventory');", '''
            unlink("$copy/internal-link") or die $!;
            symlink("/etc/hosts", "$copy/internal-link") or die $!;
        ''')
        run('external-copy-symlink-rejected', recipe=escaped, error='external/broken runtime link')
        nofollow = inject(code,
                          '    sysopen(my $f, $path, O_RDONLY | O_NOFOLLOW) or die "open $path: $!";',
                          '''if (defined($timing_phase) && $timing_phase eq 'source-inventory-before' &&
                              $path eq "$source/inventory-fixture.bin") {
                              unlink($path) or die $!;
                              symlink('small.bin', $path) or die $!;
                          }''')
        manifest['timingRequest'] = 'local-hash-contract'
        run('link-replacement-between-lstat-and-open-rejected', recipe=nofollow, error='open ')
        manifest.pop('timingRequest')

        # Substitute only the executable literal in an ignored recipe copy. Gate the fake
        # on the copied-inventory phase, so failures occur after staging exists.
        for name, digest_code, exit_code in [
            ('nonzero-after-complete-digest', 'print STDOUT Digest::SHA->new(256)->addfile(*STDIN)->digest;', 9),
            ('short-digest', 'print STDOUT "x" x 31;', 0),
            ('long-digest', 'print STDOUT "x" x 33;', 0),
            ('wrong-complete-digest', 'print STDOUT "x" x 32;', 0),
            ('parent-read-error', '', 0),
            ('delayed-success', 'print STDOUT Digest::SHA->new(256)->addfile(*STDIN)->digest;', 0),
        ]:
            started, ended = root / (name + '.started'), root / (name + '.ended')
            fake = root / (name + '.fake-openssl')
            fake.write_text("#!/usr/bin/perl\nuse strict; use warnings; use Digest::SHA;\n"
                            + 'unlink(' + literal(ended) + ') if -e ' + literal(ended) + ';\n'
                            + 'open(my $s, ">", ' + literal(started) + ') or die $!; print {$s} "$$"; close($s);\n'
                            + 'binmode(STDIN); binmode(STDOUT); $|=1;\n' + digest_code + '\n'
                            + 'close(STDOUT) or die $!;\n'
                            + 'select(undef, undef, undef, 0.25);\n'
                            + 'open(my $e, ">", ' + literal(ended) + ') or die $!; print {$e} "settled"; close($e);\n'
                            + 'exit ' + str(exit_code) + ';\n')
            fake.chmod(0o755)
            expression = "(defined($timing_phase) && $timing_phase eq 'copied-inventory' ? " + literal(fake) + " : '/usr/bin/openssl')"
            mutant = code.replace("'/usr/bin/openssl'", expression)
            if name == 'parent-read-error':
                # Close only the parent's pipe descriptor, leaving the Perl handle
                # present. Its first real read must fail, and close must still reap.
                mutant = inject(mutant, "        my $digest = '';", '''
                    if (defined($timing_phase) && $timing_phase eq 'copied-inventory') {
                        POSIX::close(fileno($output)) == 0 or die "fixture pipe close: $!";
                    }
                ''')
            # A complete response followed by delayed child exit must not permit
            # cleanup or publication while the child still has the input open.
            settled = 'die "cleanup/publication raced digest child" unless -f ' + literal(ended) + ';'
            mutant = inject(mutant, '    remove_tree($directory);', settled)
            mutant = inject(mutant, '    print "$copy\\n";', settled)
            # Timing phase is enabled using ordinary diagnostic manifest input.
            manifest['timingRequest'] = 'local-hash-contract'
            run('digest-child-' + name, recipe=mutant, ok=(name == 'delayed-success'),
                error='openssl read:' if name == 'parent-read-error' else None)
            assert started.is_file() and ended.read_text() == 'settled', name
            pid = int(started.read_text())
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                pass
            else:
                raise AssertionError((name, 'digest child still exists', pid))
            records[-1]['digestChildSettledBeforeRecipeExit'] = True
            manifest.pop('timingRequest')

        missing = root / 'nonexistent-digest-executable'
        expression = "(defined($timing_phase) && $timing_phase eq 'copied-inventory' ? " + literal(missing) + " : '/usr/bin/openssl')"
        manifest['timingRequest'] = 'local-hash-contract'
        run('digest-child-exec-failure-no-publication',
            recipe=code.replace("'/usr/bin/openssl'", expression))
        manifest.pop('timingRequest')

        rename_failed = inject(code,
                               '    rename("$directory/receipt.json.tmp", "$directory/receipt.json") or die $!;',
                               '    mkdir("$directory/receipt.json") or die "fixture mkdir: $!";')
        run('receipt-rename-failure-no-publication', recipe=rename_failed, error='Is a directory')

        interrupted = inject(code,
                             '    rename("$directory/receipt.json.tmp", "$directory/receipt.json") or die $!;',
                             '    kill "KILL", $$; die "fixture kill failed";')
        _, abandoned = run('interrupted-before-receipt-publication', recipe=interrupted,
                           interrupted=True, keep=True)
        _, fresh = run('abandoned-unpublished-output-never-reused', ok=True, keep=True)
        assert abandoned.isdisjoint(fresh)
        assert all(not (path / 'receipt.json').exists() for path in abandoned)
        assert all((path / 'receipt.json').is_file() for path in fresh)
    args.output.write_text(json.dumps(records, indent=2) + '\n')
    print(f'{len(records)} bounded hash contract checks passed; no Wine or game execution')


if __name__ == '__main__':
    main()
