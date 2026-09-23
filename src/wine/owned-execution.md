# Opt-in Wine execution for the HK4E FPS companion

Step 7 now consumes this adapter for its request-private bridge and registry
utility. See [the bridge boundary and evidence](../../native/fps-bridge/README.md)
and [operator guidance](../../docs/fps-runtime.md). The selected loader and prefix
remain explicit. A verified executable path is a caller precondition, not a
property proved by TypeScript's `string` type. The live adapter uses a local
same-revision native build that permits concurrent foreground RPCs and normal
macOS quit veto; this does not strengthen the Perl supervisor's child ownership.

## Native evidence and the ownership boundary

`configure.sh` installs 3Shain Neutralino **v4.11.0-1**, whose tag resolves to
**a925feb6b2a89740762e40ed673b435c1c74d466**, and neutralino.js **v3.9.0**.
The installed client forwards `execCommand` to the request RPC. The matching
[native os.cpp](https://github.com/3Shain/neutralinojs/blob/a925feb6b2a89740762e40ed673b435c1c74d466/api/os/os.cpp)
waits on the child constructed for each foreground execution. Conversely, its
spawn API allocates virtual IDs from map size and resolves updates through that
map. A preliminary PID check, a JS token, or serializing only these callers would
not make updates safe against unrelated users of the existing spawn API.

The matching
[TinyProcess implementation](https://github.com/3Shain/neutralinojs/blob/a925feb6b2a89740762e40ed673b435c1c74d466/lib/tinyprocess/process_unix.cpp)
executes command text using `/bin/sh -c` and waits with `waitpid`. The new API uses
foreground requests only. It never subscribes to virtual-ID events or calls
`updateSpawnedProcess`, even for cleanup. This preserves the same request
association used by the existing wineserver fix.

A system Perl script is embedded with Vite's existing `?raw` support. System Perl
is already used by Step 4; no dependency, native binary, or packaging change is
required. The adapter allocates a private `mktemp -d` directory and materializes
the script there. It passes literal arguments through the existing command
builder's explicit raw-segment support, with POSIX single quoting. This also
preserves empty environment values, question marks and control characters which
normal builder strings do not preserve. NUL and invalid environment names are
rejected. The explicit context prefix wins over an inherited `WINEPREFIX`.

The supervisor forks one direct child and execs the supplied Wine loader with the
exact executable and arguments. A close-on-exec pipe distinguishes exec failure
from later process exit. The helper's standard streams go to `/dev/null`, so
inherited output pipes cannot prevent foreground-request completion. The
supervisor emits a structured result only after observing its child.

Only this parent reaps the child. Its positive PID remains reserved while alive
or an unreaped zombie. The single-threaded loop signals only after `waitpid`
returns zero, and never after reaping or a wait error. No signal handler reaps.
Thus exit between observation and signal cannot redirect that signal to a reused
PID. This follows the macOS SDK `wait(2)`/`exit(2)` semantics; it is not an identity
check followed by an unrelated process's `kill` command. No process groups,
process-name lookup, global taskkill, Steam cleanup or prefix shutdown are used.

The directory is a cooperative mailbox, not a PID capability. `stop()` writes an
owned stop file. The supervisor checks it before forking and every 100 ms. It
requests TERM, waits two seconds, then requests KILL once if still unreaped. It
continues observing its child if termination cannot be confirmed. Private files
are removed only after the originating request, all reads and stop writes have
settled, and the result explicitly confirms the child was reaped (or never
created). Stop cannot add a write once resource removal has begun.

## Limits and outcomes

The adapter returns a handle immediately, before asynchronous setup. `started`
is exec acknowledgement; `completion` is execution plus resource cleanup and
never rejects. `stop()` coalesces one mailbox write and returns that completion.
It is not a bounded or cancellable native request. A rejected/malformed native
response leaves termination unconfirmed, requests cooperative stop, and retains
the mailbox path in the outcome. This deliberately leaves diagnostic resources
rather than asserting cleanup succeeded. A stop-write or file-removal failure is
also reported. Step 7 exposes a retry for known mailbox removal only after confirmed direct-child completion; it cannot confirm an unknown process or signal after reaping.
The controller forwards these paths in `retainedDirectories` for diagnosis.

The controller's `start()` and `stop()` share a terminal-outcome promise.
`start()` completion means the lifecycle has ended, not that spawning succeeded.
After ten seconds of cleanup observation, this outcome can say `unresolved`.
Its separate `completion` promise retains and observes all issued operations and
reports their eventual settlement. Late spawn results are registered and stopped;
late failures are observed. A permanently pending native request can leave that
promise pending indefinitely. The public timeout clears its timers and prevents
new lifecycle work; it cannot erase native effects. Fully settled cleanup leaves
no controller timers, restart activity or observation subscriptions.

Discovery defaults to 90 seconds, initialization to 10 seconds, and restart
backoff to 5 seconds, matching the inspected legacy sequencing at
`d48bd81bfcd64b337c92d2b53d0dacc3321a9b41`. Polling is once per second; individual
probe/startup observations and public cleanup observations default to ten seconds.
Controller timings are injectable and are not persisted settings. Every ordinary
helper exit pays backoff before restart; spawn and observation failures are
terminal. There is no total game-session timeout. Normal game exit, requested
stop and failure remain distinct, with cleanup errors reported alongside the
original error.

The game observer must bind discovery to this launch and retain the same process
incarnation. PID reuse must mean the original game is dead, never a new game to
adopt. Abort must release its subscriptions. Observation grants no authority to
terminate the game. The Step 7 bridge supplies this binding using the handle returned by CreateProcessW, with job accounting for Win32 descendants.

Ownership covers the direct Wine execution and its supervising request only.
Shared wineserver processes and detached descendants are not claimed or killed.
The supplied loader must run the helper directly, not daemonize it or use
`wine start`. Wine 11.0's upstream loader/preloader uses exec/SETEXEC, which is
consistent with this design; that upstream source is not proof of every custom
packaged engine. Real selected-engine/unlocker process behavior, especially any
detached child behavior, remains a separate real-game manual gate. Harmless Wine fixtures now exercise the bridge, worker and descendant accounting without real game attachment. Native crashes,
OS stalls and loss of the launcher/RPC connection cannot be promised successful
cleanup. This mechanism reports uncertainty instead of signaling another process.

## Verification boundary

Vitest exercises the actual TypeScript controller, command construction and
Neutralino adapter with controlled promises, mocked native IO and fake clocks.
It covers request association, identical native PIDs, stop/exit races, late
results, retained resources and propagation. These controller/adapter tests do not launch Perl or Wine. The broader suite includes real filesystem journal tests and existing shell-command builder tests. The Perl resource is separately syntax-checked with the system
interpreter. Run `/usr/bin/perl src/wine/owned-execution.t` for eight deterministic
supervisor cases: the actual script runs with stubbed fork/wait/signal/clock
operations and memory-backed output, without creating or signaling a child or
sleeping. Its parent/reaping rules are also reviewed against matching native source
and macOS system-call documentation. These simulations do not establish kernel or
real Wine behavior. The actual settings controls were rendered in an isolated native launcher/settings fixture, with real storage and no Wine/game operations. Step 4 external provenance acceptance and real-game compatibility remain manual gates. New real OS supervisor fixtures complement these eight simulated Perl cases; neither kind of test proves a custom engine or actual game compatible.
