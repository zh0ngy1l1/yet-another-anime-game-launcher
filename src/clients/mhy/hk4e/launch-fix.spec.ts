import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildLaunchFixCommand, createLaunchFix } from "./launch-fix";
import helper from "./launch-fix.pl?raw";
import { deferred } from "../../../utils/operation";

const token = "a".repeat(64),
  directory = "/tmp/yaagl-launch-fix.0123456789";
function fixture() {
  const result = deferred<Neutralino.os.ExecCommandResult>();
  let status: string | undefined;
  const io = {
    directory: async () => directory,
    token: () => token,
    execute: vi.fn(() => result.promise),
    read: vi.fn(async () => status),
    write: vi.fn(async (_path: string, _text: string) => undefined),
    pause: () => new Promise<void>(resolve => setTimeout(resolve, 50)),
    event: vi.fn(),
  };
  const problem = vi.fn(),
    fix = createLaunchFix("hk4e_global", problem, io);
  const state = (phase: string, error = "", attempt = 0) => {
    status = JSON.stringify({
      version: 1,
      token,
      phase,
      changed: 1,
      attempt,
      error,
    });
    return status;
  };
  return {
    io,
    fix,
    problem,
    state,
    corrupt: (text: string) => {
      status = text;
    },
    complete: (text = status ?? "", exitCode = 0) =>
      result.resolve({ pid: 1, exitCode, stdOut: text, stdErr: "fixture" }),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  // No default filesystem, process, network or privilege boundary is available.
  vi.stubGlobal("Neutralino", undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const advance = () => vi.advanceTimersByTimeAsync(100);

it("runs immutable inline source with strict request identity and retains the ten-second behavior", () => {
  const command = buildLaunchFixCommand(directory, "dispatch.example", token);
  expect(command).toContain("/usr/bin/osascript -e '");
  expect(command).toContain("with administrator privileges");
  expect(command).not.toContain("source /tmp/");
  expect(command).not.toContain("sudo");
  expect(helper).toContain("time() + 10");
  expect(helper).toContain(
    "launch_fix_restore(contents(), $expected, $before)"
  );
  expect(helper).toContain("$before = $expected = contents()");
  expect(helper).toContain("Temporarily Added by Yaagl $token");
  expect(helper).not.toContain("sed ");
});

it("round-trips the inline privileged command through shell and AppleScript quoting without execution", () => {
  // Parse only the quoting grammar generated here. This is not a shell and has
  // no expansion, evaluation, filesystem or process boundary.
  const words = (text: string) => {
    const output: string[] = [];
    let quoted = false,
      word = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "'") quoted = !quoted;
      else if (!quoted && c === "\\") word += text[++i];
      else if (!quoted && c === " ") {
        output.push(word);
        word = "";
      } else word += c;
    }
    expect(quoted).toBe(false);
    output.push(word);
    return output;
  };
  const outer = words(buildLaunchFixCommand(directory, "example.test", token));
  expect(outer.slice(0, 2)).toEqual(["/usr/bin/osascript", "-e"]);
  const encoded = outer[2].match(
    /do shell script ("(?:\\.|[^"\\])*") with administrator privileges/
  );
  expect(encoded).not.toBeNull();
  if (!encoded) throw Error("Generated AppleScript command is missing");
  const arguments_ = words(JSON.parse(encoded[1]));
  expect(arguments_).toEqual([
    "/usr/bin/env",
    "-i",
    "PATH=/usr/bin:/bin:/usr/sbin:/sbin",
    "/usr/bin/perl",
    "-e",
    helper,
    directory,
    "example.test",
    token,
  ]);
});
it.each([
  [directory + "/../../etc", "example.test", token],
  [directory, "example; bad", token],
  [directory, "example.test", "bad"],
])(
  "rejects untrusted command parameters before any execution",
  (path, host, id) => {
    expect(() => buildLaunchFixCommand(path, host, id)).toThrow(
      "Invalid Launch Fix identity"
    );
  }
);
it("requires readiness, restoration acknowledgement and foreground completion separately", async () => {
  const f = fixture();
  let started = false,
    finished = false;
  const starting = f.fix.start().then(() => {
    started = true;
  });
  await advance();
  expect(started).toBe(false);
  f.state("ready");
  await advance();
  await starting;
  const finishing = f.fix.finish().then(() => {
    finished = true;
  });
  await advance();
  expect(f.io.write).toHaveBeenCalledWith(
    `${directory}/control`,
    `${token} finish\n`
  );
  f.state("restored");
  await advance();
  expect(finished).toBe(false);
  f.complete();
  await advance();
  await finishing;
  expect(f.io.execute).toHaveBeenCalledOnce();
  expect(f.io.event).toHaveBeenCalledWith(
    expect.stringContaining(
      "foreground completion and hosts restoration confirmed"
    )
  );
  expect(f.problem).not.toHaveBeenCalled();
});

it("serializes monitor and cleanup reads so a late old ready snapshot cannot overtake restored", async () => {
  const f = fixture(),
    starting = f.fix.start();
  const oldReady = f.state("ready");
  await advance();
  await starting;
  const delayed = deferred<string | undefined>();
  f.io.read.mockImplementationOnce(() => delayed.promise);
  await advance();
  const before = f.io.read.mock.calls.length;
  const finishing = f.fix.finish();
  f.state("restored");
  f.complete();
  await advance();
  expect(f.io.read).toHaveBeenCalledTimes(before);
  delayed.resolve(oldReady);
  await advance();
  await finishing;
  expect(f.fix.errors()).toEqual([]);
  expect(f.problem).not.toHaveBeenCalled();
});

it("reads again after completion when an earlier cleanup read captured ready", async () => {
  const f = fixture(),
    starting = f.fix.start();
  const oldReady = f.state("ready");
  await advance();
  await starting;
  const delayed = deferred<string | undefined>();
  f.io.read.mockImplementationOnce(() => delayed.promise);
  const finishing = f.fix.finish();
  await advance();
  const before = f.io.read.mock.calls.length;
  f.state("restored");
  f.complete();
  delayed.resolve(oldReady);
  await advance();
  await finishing;
  expect(f.io.read.mock.calls.length).toBeGreaterThan(before);
  expect(f.io.write).not.toHaveBeenCalled();
  expect(f.fix.errors()).toEqual([]);
});
it("retains one helper and the restoration failure until an explicit cleanup retry", async () => {
  const f = fixture(),
    starting = f.fix.start();
  f.state("ready");
  await advance();
  await starting;
  f.state("restore-error", "Hosts changed concurrently; restoration retained");
  await advance();
  await expect(f.fix.finish()).rejects.toThrow("Hosts changed concurrently");
  expect(f.io.write).not.toHaveBeenCalled();
  const retry = f.fix.finish();
  await advance();
  expect(f.io.write).toHaveBeenLastCalledWith(
    `${directory}/control`,
    `${token} retry 1\n`
  );
  f.state("restored", "", 1);
  f.complete();
  await advance();
  await retry;
  expect(f.io.execute).toHaveBeenCalledOnce();
  expect(f.problem).toHaveBeenCalledWith(
    expect.stringContaining("Hosts changed concurrently; restoration retained")
  );
  expect(f.io.event).toHaveBeenCalledWith(
    expect.stringContaining("Hosts changed concurrently; restoration retained")
  );
  expect(f.fix.errors()).toEqual([]);
});
it.each(["transport", "bad-token", "nonzero", "missing-final"])(
  "retains unknown lifetime/restoration for %s",
  async mode => {
    const f = fixture();
    if (mode === "transport")
      f.io.execute.mockRejectedValueOnce(Error("RPC lost"));
    const starting = f.fix.start();
    const rejected = expect(starting).rejects.toThrow();
    if (mode === "bad-token") f.corrupt('{"token":"wrong"}');
    if (mode === "nonzero") f.complete("", 1);
    if (mode === "missing-final")
      f.complete(
        JSON.stringify({
          version: 1,
          token,
          phase: "restored",
          changed: 0,
          attempt: 0,
          error: "",
        })
      );
    await advance();
    await rejected;
    await expect(f.fix.finish()).rejects.toThrow();
    expect(f.io.execute).toHaveBeenCalledOnce();
    expect(f.io.write).not.toHaveBeenCalled();
  }
);
it("auth cancellation is a visible pre-execution failure with confirmed natural completion", async () => {
  const f = fixture(),
    starting = f.fix.start();
  const rejected = expect(starting).rejects.toThrow(
    "ended before game creation"
  );
  f.complete(`Launch Fix authorization cancelled ${token}`);
  await advance();
  await rejected;
  await f.fix.finish();
  expect(f.io.write).not.toHaveBeenCalled();
  expect(f.problem).toHaveBeenCalledWith(
    expect.stringContaining("authorization cancelled before execution")
  );
});
it("does not accept authorization cancellation when a helper record exists", async () => {
  const f = fixture(),
    starting = f.fix.start();
  f.state("ready");
  await advance();
  await starting;
  f.complete(`Launch Fix authorization cancelled ${token}`);
  await advance();
  await expect(f.fix.finish()).rejects.toThrow("conflicts");
});
it("reports a restored preparation failure and never treats it as ready", async () => {
  const f = fixture(),
    starting = f.fix.start();
  const rejected = expect(starting).rejects.toThrow(
    "ended before game creation"
  );
  f.state("restored", "Cannot open hosts");
  f.complete();
  await advance();
  await rejected;
  await f.fix.finish();
  expect(f.fix.errors().map(String)).toEqual(["Error: Cannot open hosts"]);
});

it("reports pending readiness without inferring termination or issuing a second helper", async () => {
  const f = fixture(),
    starting = f.fix.start();
  await vi.advanceTimersByTimeAsync(30001);
  expect(f.problem).toHaveBeenCalledWith(
    expect.stringContaining("readiness remains pending")
  );
  expect(f.io.execute).toHaveBeenCalledOnce();
  f.state("ready");
  await advance();
  await starting;
  const finishing = f.fix.finish();
  await vi.advanceTimersByTimeAsync(30001);
  expect(f.problem).toHaveBeenCalledWith(
    expect.stringContaining("foreground completion/restoration remains pending")
  );
  f.state("restored");
  f.complete();
  await advance();
  await finishing;
  expect(f.fix.errors()).toEqual([]);
});

it("requires concurrent foreground RPC support before issuing even a temporary-directory command", async () => {
  vi.stubGlobal("window", { NL_OS: "Darwin", NL_VERSION: "4.11.0" });
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(1),
  });
  const execute = vi.fn(async () => {
    throw Error("native execution forbidden");
  });
  vi.stubGlobal("Neutralino", { os: { execCommand: execute } });
  const fix = createLaunchFix("hk4e_global", vi.fn());
  await expect(fix.start()).rejects.toThrow("concurrent foreground execution");
  await fix.finish();
  expect(execute).not.toHaveBeenCalled();
});
