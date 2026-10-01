# HK4E complete verification acceleration — 2026-10-01

The [accepted candidate's recovered real launch](hk4e-real-launch-followup-20261001.md)
spent 22.508 s in four complete inventories, within 47.841 s of preparation.
This supports a small hashing improvement without changing the accepted launch
route or its lifecycle. The production change uses macOS's existing
`/usr/bin/openssl dgst -sha256 -binary` for regular files at least 2 MiB; smaller
files retain the original `Digest::SHA` path. No binary, runtime cache, persistent
state, parallel worker pool or user-installed developer tool is added.

## Verification and process contract

Only `hash_file()` and its core Perl `POSIX` import change. The parent still
opens each file with `O_RDONLY | O_NOFOLLOW` and verifies the opened handle is a
regular file. A large-file child inherits that descriptor through stdin; it
receives fixed arguments, with no shell or filename to reopen. The parent reads
at most 33 bytes, requires exactly 32 digest bytes and successful child exit,
and checks the original handle's close. Pipe close settles the sole child before
returning or reporting an error. Child setup/exec failure uses `_exit` so it
cannot run the parent's inherited recipe cleanup. Helper failure rejects
preparation; it does not silently switch algorithms after a partial read.

All four inventories and their metadata, symlink containment/admitted dangling
links, source-before/source-after/copy equality, distinct private inodes, pinned
assets and signatures, final output verification, temporary receipt and atomic
publication remain unchanged. Cancellation still waits for the finite recipe
before disposing its owned result. Wine waits, timeouts, journal ordering and
the `Game is running (DO NOT CLOSE THE LAUNCHER)` text are unchanged.

The inspected system OpenSSL is LibreSSL 3.3.6 with native arm64e and x86_64
slices and system-only dependencies. Its speed and availability remain properties
of the supported macOS environment; this does not qualify other operating systems
or claim identical savings on other machines.

## Alternating complete preparation measurements

The production baseline and the candidate recipe were each measured three times
in alternating order on one disposable source clone, with a fresh output for
every invocation. FPS, native fullscreen and Game Mode were enabled, with a
Global non-executable placeholder identity. No Wine process or game was launched.
No OS cache flush, persistent result reuse or file omission was used. Source
clone creation was outside the measured recipe; its private APFS clone and all
verification, patching and receipt work were inside.

| Alternating pair | Baseline recipe (s) | Candidate recipe (s) |
| --- | ---: | ---: |
| 1 | 22.682 | 15.902 |
| 2 | 21.041 | 16.113 |
| 3 | 21.068 | 15.994 |
| **Median** | **21.068** | **15.994** |

The median difference is **5.073 s / 24.1%**. Four inventories' median total
falls from **19.339 to 14.212 s**; this subtotal is inside the recipe, not an
additional saving. All six complete receipts match after removing only the
fresh runtime output path and the manifest hash affected by the request's timing
identifier. Source identity, the entire file map, modes, lengths, links, hashes
and feature manifests remain in that comparison. All disposable outputs were
removed after inspection.

The input uses the same pinned Wine 11 ntdll
`f26ade35f5b49e33b3780b6adc71f9eb9c831ea40222c1bae667ac14135d984b`.
Its 11,033 regular files contain 2,112,922,718 logical bytes; this representative
tree differs in incidental contents from the live profile. Both sides of each
comparison use exactly the same source and settings. The measured candidate and
production recipe differ only in comments. These are isolated recipe savings,
not a claim about click-to-gameplay or a controlled repeated real-game benchmark.

| Resource median, including waited children | Baseline | Candidate |
| --- | ---: | ---: |
| User CPU (s) | 15.55 | 9.77 |
| System CPU (s) | 3.62 | 4.13 |
| Total CPU (s) | 19.16 | 13.90 |
| Maximum resident set reported by `time -l` (MB) | 51.07 | 51.94 |
| Voluntary context switches | 16,371 | 17,488 |
| Involuntary context switches | 12,419 | 14,010 |
| Page faults | 9 | 525 |

The source contains 129 files at least 2 MiB, giving approximately 516 sequential
digest processes across four inventories, plus any qualifying admission hashes.
At most one digest child is outstanding. System CPU, context switches and page
faults rise, while total CPU falls by 5.26 s and measured peak RSS rises by about
0.87 MB. These costs are included in the timings. Medians of separate CPU columns
need not sum to the median of each run's combined CPU.

## Smaller and larger alternatives considered

The system Perl's `Digest::SHA` handle overload reads 4 KiB chunks. A larger
256 KiB `sysread` loop preserved complete receipts but improved recipe median
only **21.091 to 20.186 s**. Individual baseline results were
22.607 / 21.091 / 21.045 s; candidate results were 20.002 / 20.191 / 20.186 s.
It was not combined with the chosen change; the small-file path remains intact.

Complete-inventory threshold screening gave baseline
4.120 / 4.133 / 4.180 s, versus 2.855 s at 1 MiB, 2.938 s at 2 MiB and 3.094 s
at 4 MiB. Every inventory digest matched. The 2 MiB choice avoids 171 additional
processes per inventory relative to 1 MiB for only 0.083 s difference in this
screen. It retains more of the speedup than 4 MiB without parallel contention.
These single threshold samples select the candidate; the three paired full
recipes above provide the repeated comparison.

A benchmark-only sequential CommonCrypto worker was faster still: inventory
4.219 / 4.231 / 4.264 s versus 1.098 / 1.058 / 1.087 s, with matching inventories.
Shipping it would add source/build/artifact/architecture admission and a worker
protocol to maintain. It was not adopted or qualified for production because
the existing system primitive gives a useful saving with a much smaller change.
The undocumented Digest::SHA XS entry point was also diagnostic only.

## Validation and local evidence

The new `scripts/test-r2-hashing.py` exercises the production recipe with
disposable data and fixture-only fault injection. Existing R2 and regional
fullscreen/Game Mode tests remain separate admission/composition checks; source
cancellation tests cover a pending recipe's eventual success or rejection.
Validation passed: 22 hashing-contract checks, 13 R2 preparation cases,
17 fullscreen/Game Mode composition cases and 110 focused source tests across
four files. This includes files below/at/above the threshold, binary data and
quoted Unicode paths, source/copy byte/mode/link mutations, no-follow replacement,
failed/truncated/oversized/incorrect digests, read/exec errors, child settlement
after pipe EOF, failed/interrupted receipt publication and cancellation before
the recipe settles. Pinned Node 16.20.2 / pnpm 7.33.7 TypeScript, lint and format
checks pass with the existing nine lint warnings and no errors.
The package verifier additionally requires the descriptor-based hashing recipe
to reach the built frontend, alongside its existing complete bundle and ASAR
identity checks. Candidate build and live validation are recorded in the delivery
follow-up after building from committed source.

Raw paths, logs and prototype files remain ignored under
`.tmp/launch-followup-20261001/`. The main comparison is
`hash-options/full-recipe-openssl-comparison.json`; resource summaries and the
comment-only equivalence check are `hash-options/openssl-summary.json` and
`hash-options/production-equivalence.json`. Buffered-loop results, threshold
screens and the unshipped native prototype are retained there as separate
experiments. No private log or account information is committed.
