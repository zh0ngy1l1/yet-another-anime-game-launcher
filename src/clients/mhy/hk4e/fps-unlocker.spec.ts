import { afterEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "path-browserify";
import { acquireFpsUnlocker } from "./fps-unlocker";
import { FPS_UNLOCKER_MANIFEST as manifest } from "./fps-unlocker-manifest";
import { fpsUnlockerIO } from "./fps-unlocker-io";
import { build } from "../../../utils/command-builder";
import { exec as execCallback } from "child_process";
import {
  mkdtemp,
  readFile,
  writeFile,
  lstat,
  rm,
  symlink,
  mkdir,
} from "fs/promises";
import { tmpdir } from "os";

const directory = `/application/fps-unlocker/${manifest.tag}/${manifest.sha256}`;
const finalPath = join(directory, manifest.filename);
const goodStat: Neutralino.filesystem.Stats = {
  size: manifest.size,
  isFile: true,
  isDirectory: false,
};
type File = { stat: typeof goodStat; hash: string };
const goodFile = (): File => ({ stat: { ...goodStat }, hash: manifest.sha256 });
const missing = { code: "NE_FS_NOPATHE" };

function fixture(cached?: File) {
  const events: string[] = [];
  const files = new Map<string, File>(cached ? [[finalPath, cached]] : []);
  let next = 0;
  const io = {
    cacheDirectory: vi.fn(() => directory),
    stats: vi.fn(async (path: string) => {
      events.push(`stat:${path}`);
      const file = files.get(path);
      if (!file) throw missing;
      return file.stat;
    }),
    sha256: vi.fn(async (path: string) => {
      events.push(`hash:${path}`);
      const file = files.get(path);
      if (!file) throw missing;
      return file.hash;
    }),
    temporary: vi.fn(async (dir: string) => {
      const path = join(dir, `.unlockfps-${++next}`);
      events.push(`temporary:${path}`);
      files.set(path, { stat: { ...goodStat, size: 0 }, hash: "" });
      return path;
    }),
    download: vi.fn(async (_url: string, path: string) => {
      events.push(`download:${path}`);
      files.set(path, goodFile());
    }),
    promote: vi.fn(async (source: string, destination: string) => {
      events.push(`promote:${source}:${destination}`);
      const file = files.get(source);
      if (!file) throw missing;
      files.set(destination, file);
      files.delete(source);
    }),
    cleanup: vi.fn(async (path: string) => {
      events.push(`cleanup:${path}`);
      files.delete(path);
    }),
    warn: vi.fn(async (_message: string) => undefined),
  };
  return { io, events, files, temporary: join(directory, ".unlockfps-1") };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HK4E FPS unlocker acquisition", () => {
  it("pins all supplied manifest facts", () => {
    expect(manifest).toEqual({
      repository: "rishabhroyy/genshin-fps-unlock-universal",
      tag: "v3.0.7",
      filename: "unlockfps.exe",
      url: "https://github.com/rishabhroyy/genshin-fps-unlock-universal/releases/download/v3.0.7/unlockfps.exe",
      sourceCommit: "56b9c64381ef9fd59e916dc9bf547d3210ab5db1",
      size: 39661090,
      sha256:
        "8543f45a4edced854ab8c5466ce2dc2e511fb4f89361bc4dfb474b68d998cc17",
    });
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it("verifies a cache hit without downloading, rewriting, deleting, or promoting", async () => {
    const { io, events } = fixture(goodFile());
    await expect(acquireFpsUnlocker(io)).resolves.toBe(finalPath);
    expect(events).toEqual([`stat:${finalPath}`, `hash:${finalPath}`]);
    expect(io.sha256).toHaveBeenCalledWith(finalPath, manifest.size);
    expect(io.cacheDirectory).toHaveBeenCalledWith(
      manifest.tag,
      manifest.sha256
    );
    for (const effect of [io.temporary, io.download, io.promote, io.cleanup]) {
      expect(effect).not.toHaveBeenCalled();
    }
  });

  it.each(["absent", "wrong size", "wrong hash"])(
    "replaces %s cache only after both temporary checks, then checks final",
    async state => {
      const cached = state === "absent" ? undefined : goodFile();
      if (cached) {
        if (state === "wrong size") cached.stat.size--;
        else cached.hash = "0".repeat(64);
      }
      const { io, events, files, temporary } = fixture(cached);
      io.promote.mockImplementation(async (source, destination) => {
        expect(files.get(finalPath)).toBe(cached);
        expect(events.slice(-2)).toEqual([
          `stat:${temporary}`,
          `hash:${temporary}`,
        ]);
        events.push(`promote:${source}:${destination}`);
        const replacement = files.get(source);
        if (!replacement) throw missing;
        files.set(destination, replacement);
        files.delete(source);
      });
      await expect(acquireFpsUnlocker(io)).resolves.toBe(finalPath);
      expect(events).toEqual([
        `stat:${finalPath}`,
        ...(state === "wrong hash" ? [`hash:${finalPath}`] : []),
        `temporary:${temporary}`,
        `download:${temporary}`,
        `stat:${temporary}`,
        `hash:${temporary}`,
        `promote:${temporary}:${finalPath}`,
        `stat:${finalPath}`,
        `hash:${finalPath}`,
      ]);
      expect(io.download).toHaveBeenCalledOnce();
      expect(io.download).toHaveBeenCalledWith(manifest.url, temporary);
      expect(dirname(temporary)).toBe(dirname(finalPath));
      expect(files.has(temporary)).toBe(false);
      expect(io.cleanup).not.toHaveBeenCalled();
    }
  );

  it.each([
    "wrong size",
    "wrong hash",
    "non-regular",
    "directory",
    "missing",
    "unreadable",
    "hash failure",
  ])("rejects %s temporary content and preserves prior cache", async state => {
    const cached = goodFile();
    cached.stat.size--;
    const { io, files, temporary } = fixture(cached);
    io.download.mockImplementation(async (_url, path) => {
      const file = goodFile();
      if (state === "wrong size") file.stat.size--;
      if (state === "wrong hash") file.hash = "0".repeat(64);
      if (state === "non-regular") file.stat.isFile = false;
      if (state === "directory") file.stat.isDirectory = true;
      files.set(path, file);
      if (state === "missing") files.delete(path);
      if (state === "unreadable")
        io.stats.mockRejectedValue(new Error("read denied"));
      if (state === "hash failure")
        io.sha256.mockRejectedValue(new Error("digest process failed"));
    });
    await expect(acquireFpsUnlocker(io)).rejects.toThrow(
      "verify temporary file"
    );
    expect(io.promote).not.toHaveBeenCalled();
    expect(io.download).toHaveBeenCalledOnce();
    expect(io.cleanup.mock.calls).toEqual([[temporary]]);
    expect(files.get(finalPath)).toBe(cached);
    expect(files.has(temporary)).toBe(false);
    if (
      [
        "wrong size",
        "non-regular",
        "directory",
        "missing",
        "unreadable",
      ].includes(state)
    ) {
      expect(io.sha256).not.toHaveBeenCalled();
    }
  });

  it.each(["download interrupted", "download rejected", "promotion failed"])(
    "rejects %s, cleans only owned temporary content and keeps cause",
    async message => {
      const { io, temporary } = fixture();
      const cause = new Error(message);
      if (message === "promotion failed") io.promote.mockRejectedValue(cause);
      else io.download.mockRejectedValue(cause);
      await expect(acquireFpsUnlocker(io)).rejects.toMatchObject({ cause });
      expect(io.cleanup.mock.calls).toEqual([[temporary]]);
      expect(io.download).toHaveBeenCalledOnce();
      if (message !== "promotion failed")
        expect(io.promote).not.toHaveBeenCalled();
    }
  );

  it.each([
    "wrong size",
    "wrong hash",
    "directory",
    "missing",
    "unreadable",
    "hash failure",
  ])("rejects %s final file after promotion", async state => {
    const { io, files } = fixture();
    io.promote.mockImplementation(async source => {
      files.delete(source);
      const file = goodFile();
      if (state === "wrong size") file.stat.size--;
      if (state === "wrong hash") file.hash = "0".repeat(64);
      if (state === "directory") file.stat.isFile = false;
      if (state !== "missing") files.set(finalPath, file);
      if (state === "unreadable")
        io.stats.mockRejectedValue(new Error("unreadable final"));
      if (state === "hash failure")
        io.sha256.mockRejectedValue(new Error("final hash failure"));
    });
    await expect(acquireFpsUnlocker(io)).rejects.toThrow("verify final file");
    expect(io.stats).toHaveBeenLastCalledWith(finalPath);
    expect(io.promote).toHaveBeenCalledOnce();
    expect(io.cleanup).not.toHaveBeenCalled();
  });

  it.each(["directory", "other object", "unreadable", "hash failure"])(
    "fails closed on %s cached object",
    async state => {
      const cached = goodFile();
      if (state === "directory") cached.stat.isDirectory = true;
      if (state === "other object") cached.stat.isFile = false;
      const { io } = fixture(cached);
      if (state === "unreadable")
        io.stats.mockRejectedValue(new Error("permission denied"));
      if (state === "hash failure")
        io.sha256.mockRejectedValue(new Error("hash unreadable"));
      await expect(acquireFpsUnlocker(io)).rejects.toThrow("inspect cache");
      expect(io.download).not.toHaveBeenCalled();
      expect(io.cleanup).not.toHaveBeenCalled();
    }
  );

  it("rejects temporary creation failure without cleaning an unowned path", async () => {
    const { io } = fixture();
    io.temporary.mockRejectedValue(new Error("disk full"));
    await expect(acquireFpsUnlocker(io)).rejects.toThrow(
      "create temporary file"
    );
    expect(io.cleanup).not.toHaveBeenCalled();
    expect(io.download).not.toHaveBeenCalled();
  });

  it.each(["", `${manifest.sha256}\nextra`])(
    "parser failure in temporary verification cannot promote (%j)",
    async output => {
      nativeMock(output);
      const { io, temporary } = fixture();
      io.sha256.mockImplementation(path =>
        fpsUnlockerIO.sha256(path, manifest.size)
      );
      await expect(acquireFpsUnlocker(io)).rejects.toThrow("Malformed SHA-256");
      expect(io.promote).not.toHaveBeenCalled();
      expect(io.cleanup.mock.calls).toEqual([[temporary]]);
    }
  );

  it.each(["verify", "promote"])(
    "cleanup failure preserves the %s failure",
    async stage => {
      const { io } = fixture();
      const cause = new Error(`${stage} failed`);
      const cleanupError = new Error("cleanup denied");
      if (stage === "verify") io.sha256.mockRejectedValue(cause);
      else io.promote.mockRejectedValue(cause);
      io.cleanup.mockRejectedValue(cleanupError);
      await expect(acquireFpsUnlocker(io)).rejects.toMatchObject({
        cause,
        cleanupError,
      });
      expect(io.warn).toHaveBeenCalledOnce();
    }
  );

  it.each([false, true])(
    "preserves primary and cleanup failures when logging fails: %s",
    async loggingFails => {
      const { io, temporary } = fixture();
      const cause = new Error("interrupted download");
      const cleanupError = new Error("cleanup denied");
      const loggingError = new Error("log denied");
      io.download.mockRejectedValue(cause);
      io.cleanup.mockRejectedValue(cleanupError);
      if (loggingFails) io.warn.mockRejectedValue(loggingError);
      await expect(acquireFpsUnlocker(io)).rejects.toMatchObject({
        cause,
        cleanupError,
        ...(loggingFails ? { loggingError } : {}),
      });
      expect(io.warn).toHaveBeenCalledWith(expect.stringContaining(temporary));
      expect(io.promote).not.toHaveBeenCalled();
    }
  );

  it.each(["success", "failure"])(
    "overlapping calls own distinct files and independently verify final (%s)",
    async outcome => {
      const { io, files, events, temporary } = fixture();
      const entered = deferred<void>();
      const release = deferred<void>();
      io.download.mockImplementation(async (url, path) => {
        if (path === temporary) {
          entered.resolve();
          await release.promise;
          if (outcome === "failure")
            throw new Error("first download interrupted");
        }
        events.push(`download:${path}`);
        files.set(path, goodFile());
      });
      const first = acquireFpsUnlocker(io).then(
        value => ({ value }),
        error => ({ error })
      );
      await entered.promise;
      await expect(acquireFpsUnlocker(io)).resolves.toBe(finalPath);
      const secondTemporary = join(directory, ".unlockfps-2");
      expect(io.download.mock.calls.map(call => call[1])).toEqual([
        temporary,
        secondTemporary,
      ]);
      expect(files.has(temporary)).toBe(true);
      release.resolve();
      const result = await first;
      if (outcome === "success") {
        expect(result).toEqual({ value: finalPath });
        expect(events.filter(e => e === `hash:${finalPath}`)).toHaveLength(2);
        expect(io.cleanup).not.toHaveBeenCalled();
      } else {
        expect(result).toHaveProperty("error");
        expect(io.cleanup.mock.calls).toEqual([[temporary]]);
      }
      expect(io.cleanup).not.toHaveBeenCalledWith(secondTemporary);
      expect(files.get(finalPath)).toEqual(goodFile());
    }
  );

  it("a caller whose promotion fails rejects even if a winner installed valid bytes", async () => {
    const { io, files, temporary } = fixture();
    io.promote.mockImplementation(async () => {
      files.set(finalPath, goodFile());
      throw new Error("lost promotion");
    });
    await expect(acquireFpsUnlocker(io)).rejects.toThrow("atomically promote");
    expect(io.cleanup.mock.calls).toEqual([[temporary]]);
    expect(files.get(finalPath)).toEqual(goodFile());
  });
});

function nativeMock(output = "") {
  const execCommand = vi.fn(async (_command: string) => ({
    exitCode: 0,
    stdOut: output,
    stdErr: "",
    pid: 1,
  }));
  const spawnProcess = vi.fn();
  vi.stubGlobal("window", {
    NL_OS: "Darwin",
    NL_CWD: "/application",
    NL_PATH: ".",
  });
  vi.stubGlobal("Neutralino", {
    os: { execCommand, spawnProcess },
    debug: { log: vi.fn(async () => undefined) },
    filesystem: { getStats: vi.fn(async () => goodStat) },
  });
  return { execCommand, spawnProcess };
}

describe("FPS unlocker native boundaries", () => {
  it.each([
    manifest.sha256,
    manifest.sha256.toUpperCase(),
    `${manifest.sha256}\n`,
  ])("accepts strictly framed digest %s", async output => {
    nativeMock(output);
    await expect(fpsUnlockerIO.sha256(finalPath, manifest.size)).resolves.toBe(
      manifest.sha256
    );
  });

  it.each([
    "",
    "a".repeat(63),
    "a".repeat(65),
    "g".repeat(64),
    `${manifest.sha256}\n\n`,
    ` ${manifest.sha256}`,
    `${manifest.sha256}  file`,
    `${manifest.sha256}\r\n`,
    `${manifest.sha256}\n${manifest.sha256}`,
  ])("rejects malformed digest %j", async output => {
    nativeMock(output);
    await expect(
      fpsUnlockerIO.sha256(finalPath, manifest.size)
    ).rejects.toThrow("Malformed SHA-256");
  });

  it("propagates digest process failure", async () => {
    const { execCommand } = nativeMock(manifest.sha256);
    execCommand.mockResolvedValue({
      exitCode: 1,
      stdOut: manifest.sha256,
      stdErr: "read error",
      pid: 1,
    });
    await expect(
      fpsUnlockerIO.sha256(finalPath, manifest.size)
    ).rejects.toThrow("read error");
  });

  it("uses version and content identity in the application resource directory", () => {
    nativeMock();
    expect(fpsUnlockerIO.cacheDirectory(manifest.tag, manifest.sha256)).toBe(
      directory
    );
  });

  it("rejects non-macOS runtime before acquisition", async () => {
    const { execCommand } = nativeMock();
    window.NL_OS = "Windows";
    await expect(acquireFpsUnlocker()).rejects.toThrow("requires macOS");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it.each([
    "relative/path",
    "/path\nname",
    "/path\tname",
    "/path\rname",
    "/path\0name",
    "/path?name",
  ])("rejects paths the builder cannot faithfully pass: %j", async path => {
    const { execCommand } = nativeMock();
    await expect(fpsUnlockerIO.sha256(path, manifest.size)).rejects.toThrow(
      "absolute path without control"
    );
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("reserves a file in the exact cache directory", async () => {
    const path = join(directory, ".unlockfps-aB01234567");
    const { execCommand } = nativeMock(`${path}\n`);
    await expect(fpsUnlockerIO.temporary(directory)).resolves.toBe(path);
    expect(execCommand.mock.calls.map(call => call[0])).toEqual([
      build(["/bin/mkdir", "-p", directory]),
      build(["/usr/bin/mktemp", join(directory, ".unlockfps-XXXXXXXXXX")]),
    ]);
  });

  it.each([
    "",
    "/another/file\n",
    `${directory}/.unlockfps-../../file\n`,
    `${directory}/.unlockfps-aB01234567\nextra`,
  ])(
    "rejects unexpected temporary output without deleting it: %j",
    async output => {
      const { execCommand } = nativeMock(output);
      await expect(fpsUnlockerIO.temporary(directory)).rejects.toThrow(
        "Invalid FPS unlocker temporary path"
      );
      expect(execCommand).toHaveBeenCalledTimes(2);
    }
  );

  it("downloads once with explicit output, HTTPS, no config, bounded time and no retry", async () => {
    const { execCommand, spawnProcess } = nativeMock();
    const path = join(directory, ".unlockfps-aB01234567");
    await fpsUnlockerIO.download(manifest.url, path);
    expect(execCommand).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith(
      build([
        "/usr/bin/curl",
        "--disable",
        "--fail",
        "--silent",
        "--show-error",
        "--location",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--retry",
        "0",
        "--connect-timeout",
        "30",
        "--max-time",
        "600",
        "--output",
        path,
        "--url",
        manifest.url,
      ]),
      {}
    );
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("rejects cross-directory promotion", async () => {
    const { execCommand } = nativeMock();
    await expect(
      fpsUnlockerIO.promote("/tmp/source", finalPath)
    ).rejects.toThrow("same directory");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("a default cache hit executes only the trusted digest utility, never the artifact or Wine", async () => {
    const { execCommand, spawnProcess } = nativeMock(`${manifest.sha256}\n`);
    await expect(acquireFpsUnlocker()).resolves.toBe(finalPath);
    expect(execCommand).toHaveBeenCalledOnce();
    expect(execCommand.mock.calls[0][0]).toMatch(/^\/usr\/bin\/perl -e /);
    expect(execCommand.mock.calls[0][0]).toContain("Digest::SHA");
    expect(execCommand.mock.calls[0][0]).toContain(
      build(["--", finalPath, String(manifest.size)])
    );
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("default acquisition uses only filesystem, digest, and download commands and ends with final hashing", async () => {
    const { execCommand, spawnProcess } = nativeMock();
    const path = join(directory, ".unlockfps-aB01234567");
    vi.mocked(Neutralino.filesystem.getStats).mockRejectedValueOnce(missing);
    execCommand.mockImplementation(async command => ({
      exitCode: 0,
      stdErr: "",
      pid: 1,
      stdOut: command.startsWith("/usr/bin/mktemp ")
        ? `${path}\n`
        : `${manifest.sha256}\n`,
    }));
    await expect(acquireFpsUnlocker()).resolves.toBe(finalPath);
    const commands = execCommand.mock.calls.map(([command]) => command);
    expect(commands.map(command => command.split(" ")[0])).toEqual([
      "/bin/mkdir",
      "/usr/bin/mktemp",
      "/usr/bin/curl",
      "/usr/bin/perl",
      "/usr/bin/perl",
      "/usr/bin/perl",
    ]);
    expect(commands[3]).toContain(build(["--", path, String(manifest.size)]));
    expect(commands[4]).toContain(build(["--", path, finalPath]));
    expect(commands[5]).toContain(
      build(["--", finalPath, String(manifest.size)])
    );
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  // Tiny, sequential local fixtures validate the actual Darwin primitives and
  // command builder. No network, artifact bytes, or filesystem race is used.
  it("streams a tiny file and directly replaces a file, refusing symlinks and directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "yaagl-step4-test-"));
    const hostile = join(root, "space ' \" ` $(touch INJECTED) ; & [x]");
    const { execCommand, spawnProcess } = nativeMock();
    execCommand.mockImplementation(
      command =>
        new Promise((resolve, reject) => {
          execCallback(command, (error, stdOut, stdErr) => {
            if (error) reject(error);
            else resolve({ exitCode: 0, stdOut, stdErr, pid: 1 });
          });
        })
    );
    try {
      await mkdir(hostile);
      const first = await fpsUnlockerIO.temporary(hostile);
      const second = await fpsUnlockerIO.temporary(hostile);
      expect(first).not.toBe(second);
      expect(dirname(first)).toBe(hostile);
      await writeFile(first, "abc");
      await expect(fpsUnlockerIO.sha256(first, 3)).resolves.toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      );
      await expect(fpsUnlockerIO.sha256(first, 4)).rejects.toThrow();
      const link = join(hostile, "link");
      await symlink(first, link);
      await expect(fpsUnlockerIO.sha256(link, 3)).rejects.toThrow();
      await expect(fpsUnlockerIO.sha256(hostile, 3)).rejects.toThrow();
      const inode = (await lstat(first)).ino;
      await writeFile(second, "old");
      await fpsUnlockerIO.promote(first, second);
      expect(await readFile(second, "utf8")).toBe("abc");
      expect((await lstat(second)).ino).toBe(inode);
      await expect(lstat(first)).rejects.toThrow();
      const destinationDirectory = join(hostile, "directory");
      await mkdir(destinationDirectory);
      await expect(
        fpsUnlockerIO.promote(second, destinationDirectory)
      ).rejects.toThrow();
      expect(await readFile(second, "utf8")).toBe("abc");
      await fpsUnlockerIO.cleanup(second);
      await fpsUnlockerIO.cleanup(second); // missing owned file is harmless
      await expect(lstat(second)).rejects.toThrow();
      expect(spawnProcess).not.toHaveBeenCalled();
      expect(
        execCommand.mock.calls.every(([command]) =>
          /^\/(usr\/bin\/(perl|mktemp)|bin\/(mkdir|rm)) /.test(command)
        )
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
