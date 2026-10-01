import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import * as utils from "@utils";
import type { Aria2 } from "@aria2";
import type { Wine } from "@wine";
import { build } from "./utils/command-builder";
import {
  checkAndDownloadDXMT,
  checkAndDownloadDXVK,
  checkAndDownloadMoltenVK,
  checkAndDownloadReshade,
  DXVK_FILES,
  prepareReshadeConfiguration,
} from "./downloadable-resource";

vi.mock("@utils", () => ({
  mkdirp: vi.fn(),
  resolve: vi.fn(),
  humanFileSize: (value: number) => String(value),
  setKey: vi.fn(),
  getKeyOrDefault: vi.fn(),
  fileOrDirExists: vi.fn(),
  stats: vi.fn(),
  doStreamUnzip: vi.fn(),
  forceMove: vi.fn(),
  readBinary: vi.fn(),
  writeBinary: vi.fn(),
  writeFile: vi.fn(),
  rmrf_dangerously: vi.fn(),
  exec: vi.fn(),
  removeFile: vi.fn(),
}));

const run = promisify(execFile);
const revision = "654f547ffab4e0c395ee368aad52bb4586b04576";
const version = "654f547";
const windowsFiles = [
  "d3d10core.dll",
  "d3d11.dll",
  "dxgi.dll",
  "winemetal.dll",
  "nvngx.dll",
  "nvapi64.dll",
];
const requiredFiles = [
  "d3d10core.dll",
  "d3d11.dll",
  "dxgi.dll",
  "winemetal.dll",
  "nvngx.dll",
  "nvapi64.dll",
  "winemetal.so",
];
const payload = (name: string) => Buffer.from(`synthetic ${name} payload`);
let fixtureRoot: string;
let temporary: string;
let profile: string;
let completeArchive: Buffer;
let incompleteArchive: Buffer;
let reshadeInstaller: Buffer;
const storage = new Map<string, string>();

async function makeDxmtArchive(name: string, omitted?: string) {
  const source = path.join(fixtureRoot, name);
  for (const [directory, names] of [
    ["x86_64-windows", windowsFiles],
    ["x86_64-unix", ["winemetal.so"]],
  ] as const) {
    const destination = path.join(source, revision, directory);
    await fs.mkdir(destination, { recursive: true });
    for (const file of names) {
      if (file !== omitted)
        await fs.writeFile(path.join(destination, file), payload(file));
    }
  }
  const tar = `dxmt-${revision}.tar.gz`;
  await run("tar", ["-czf", tar, revision], { cwd: source });
  await run("zip", ["-q", "archive.zip", tar], { cwd: source });
  return fs.readFile(path.join(source, "archive.zip"));
}

beforeAll(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(tmpdir(), "yaagl-resource-input-"));
  completeArchive = await makeDxmtArchive("complete");
  incompleteArchive = await makeDxmtArchive("incomplete", "winemetal.dll");
  const source = path.join(fixtureRoot, "reshade");
  await fs.mkdir(source);
  await fs.writeFile(
    path.join(source, "ReShade64.dll"),
    payload("ReShade64.dll")
  );
  await run("zip", ["-q", "reshade.zip", "ReShade64.dll"], { cwd: source });
  reshadeInstaller = Buffer.concat([
    Buffer.from("MZ synthetic installer prefix"),
    await fs.readFile(path.join(source, "reshade.zip")),
  ]);
});

afterAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.resetAllMocks();
  storage.clear();
  temporary = await fs.mkdtemp(path.join(tmpdir(), "yaagl-resource-test-"));
  profile = path.join(temporary, "launcher profile");
  await fs.mkdir(profile);
  const resolve = (file: string) => path.resolve(profile, file);
  vi.mocked(utils.resolve).mockImplementation(resolve);
  vi.mocked(utils.getKeyOrDefault).mockImplementation(async (key, fallback) => {
    return storage.get(key) ?? fallback;
  });
  vi.mocked(utils.setKey).mockImplementation(async (key, value) => {
    if (value === null) storage.delete(key);
    else storage.set(key, value);
  });
  vi.mocked(utils.stats).mockImplementation(async file => {
    const info = await fs.stat(resolve(file));
    return {
      size: info.size,
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
    };
  });
  vi.mocked(utils.fileOrDirExists).mockImplementation(async file => {
    try {
      await fs.stat(resolve(file));
      return true;
    } catch {
      return false;
    }
  });
  vi.mocked(utils.exec).mockImplementation(async (segments, environment) => {
    // Execute the same escaped shell command used by the native boundary.
    const result = await run("/bin/sh", ["-c", build(segments, environment)], {
      cwd: temporary,
    });
    return {
      pid: 0,
      exitCode: 0,
      stdOut: result.stdout,
      stdErr: result.stderr,
    };
  });
  vi.mocked(utils.mkdirp).mockImplementation(directory =>
    utils.exec(["mkdir", "-p", resolve(directory)])
  );
  vi.mocked(utils.rmrf_dangerously).mockImplementation(file =>
    utils.exec(["rm", "-rf", resolve(file)])
  );
  vi.mocked(utils.forceMove).mockImplementation((source, destination) =>
    utils.exec(["mv", "-f", resolve(source), resolve(destination)])
  );
  vi.mocked(utils.removeFile).mockImplementation(file =>
    fs.unlink(resolve(file))
  );
  vi.mocked(utils.readBinary).mockImplementation(async file => {
    const bytes = await fs.readFile(resolve(file));
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.length
    );
  });
  vi.mocked(utils.writeBinary).mockImplementation((file, data) =>
    fs.writeFile(resolve(file), Buffer.from(data))
  );
  vi.mocked(utils.writeFile).mockImplementation((file, data) =>
    fs.writeFile(resolve(file), data)
  );
  vi.mocked(utils.doStreamUnzip).mockImplementation(async function* (
    source,
    destination
  ) {
    await utils.exec([
      "unzip",
      "-oq",
      resolve(source),
      "-d",
      resolve(destination),
    ]);
    yield [1, 1] as const;
  });
});

afterEach(async () => {
  await fs.rm(temporary, { recursive: true, force: true });
});

function downloader(archive = completeArchive) {
  const requests: { uri: string; absDst: string }[] = [];
  const aria2 = {
    async *doStreamingDownload(request: { uri: string; absDst: string }) {
      requests.push(request);
      const bytes = request.uri.includes("/dxmt-")
        ? archive
        : request.uri.includes("ReShade_Setup_")
        ? reshadeInstaller
        : payload(path.basename(request.absDst));
      await fs.writeFile(request.absDst, bytes);
      yield {
        completedLength: BigInt(bytes.length),
        totalLength: BigInt(bytes.length),
        downloadSpeed: BigInt(bytes.length),
      };
    },
  } as unknown as Aria2;
  return { aria2, requests };
}

async function drain(program: AsyncGenerator) {
  const events = [];
  for await (const event of program) events.push(event);
  return events;
}

async function seedDxmt(storedVersion = version) {
  storage.set("installed_dxmt_version", storedVersion);
  await fs.mkdir(path.join(profile, "dxmt"));
  for (const file of [...windowsFiles, "winemetal.so"])
    await fs.writeFile(path.join(profile, "dxmt", file), payload(file));
}

async function expectCompleteDxmt() {
  expect(await fs.readdir(path.join(profile, "dxmt"))).toEqual(
    [...windowsFiles, "winemetal.so"].sort()
  );
  for (const file of [...windowsFiles, "winemetal.so"])
    expect(await fs.readFile(path.join(profile, "dxmt", file))).toEqual(
      payload(file)
    );
  expect(storage.get("installed_dxmt_version")).toBe(version);
}

describe("DXMT resource acquisition", () => {
  const realArchive = process.env.YAAGL_TEST_DXMT_ARCHIVE;
  (realArchive ? it : it.skip)(
    "installs the explicitly provided upstream archive in an isolated profile",
    async () => {
      if (!realArchive) throw new Error("YAAGL_TEST_DXMT_ARCHIVE is required");
      const { aria2, requests } = downloader(await fs.readFile(realArchive));
      await drain(checkAndDownloadDXMT(aria2));
      expect(requests).toHaveLength(1);
      for (const file of requiredFiles) {
        const info = await fs.stat(path.join(profile, "dxmt", file));
        expect(info.isFile()).toBe(true);
        expect(info.size).toBeGreaterThan(0);
      }
      expect(storage.get("installed_dxmt_version")).toBe(version);
    }
  );

  it.each(["0.80.0", "deadbeef-commit-not-semver"])(
    "upgrades stored %s using the nested upstream archive",
    async previous => {
      await seedDxmt(previous);
      await fs.writeFile(path.join(profile, "dxmt", "obsolete.dll"), "old");
      const { aria2, requests } = downloader();
      await drain(checkAndDownloadDXMT(aria2));
      expect(requests).toHaveLength(1);
      expect(requests[0].uri).toBe(
        `https://github.com/yaagl/anime-game-wine/releases/download/dxmt-${version}/dxmt-${revision}.zip`
      );
      await expectCompleteDxmt();
    }
  );

  it("reuses the exact version only with a complete nonempty payload", async () => {
    await seedDxmt();
    const { aria2, requests } = downloader();
    expect(await drain(checkAndDownloadDXMT(aria2))).toEqual([]);
    expect(requests).toEqual([]);
    expect(utils.setKey).not.toHaveBeenCalled();
    expect(utils.exec).not.toHaveBeenCalled();
    await expectCompleteDxmt();
  });

  it.each(requiredFiles)("repairs a cache missing %s", async file => {
    await seedDxmt();
    await fs.unlink(path.join(profile, "dxmt", file));
    const { aria2, requests } = downloader();
    await drain(checkAndDownloadDXMT(aria2));
    expect(requests).toHaveLength(1);
    await expectCompleteDxmt();
  });

  it.each(["winemetal.dll", "winemetal.so"])(
    "repairs a zero-byte %s",
    async file => {
      await seedDxmt();
      await fs.writeFile(path.join(profile, "dxmt", file), "");
      const { aria2, requests } = downloader();
      await drain(checkAndDownloadDXMT(aria2));
      expect(requests).toHaveLength(1);
      await expectCompleteDxmt();
    }
  );

  it("repairs a directory masquerading as a required file", async () => {
    await seedDxmt();
    const metal = path.join(profile, "dxmt", "winemetal.dll");
    await fs.unlink(metal);
    await fs.mkdir(metal);
    const { aria2, requests } = downloader();
    await drain(checkAndDownloadDXMT(aria2));
    expect(requests).toHaveLength(1);
    await expectCompleteDxmt();
  });

  it("rejects an incomplete extracted payload without publishing its version", async () => {
    storage.set("installed_dxmt_version", "0.80.0");
    const { aria2 } = downloader(incompleteArchive);
    await expect(drain(checkAndDownloadDXMT(aria2))).rejects.toThrow(
      "DXMT extraction is incomplete"
    );
    expect(utils.setKey).not.toHaveBeenCalled();
    expect(storage.get("installed_dxmt_version")).toBe("0.80.0");
  });

  it("awaits version persistence and propagates a failed write", async () => {
    storage.set("installed_dxmt_version", "0.80.0");
    let failWrite!: (error: Error) => void;
    let startedWrite!: () => void;
    const writing = new Promise<void>(resolve => (startedWrite = resolve));
    vi.mocked(utils.setKey).mockImplementationOnce(() => {
      startedWrite();
      return new Promise<void>((_resolve, reject) => (failWrite = reject));
    });
    const { aria2 } = downloader();
    let settled = false;
    const completion = drain(checkAndDownloadDXMT(aria2));
    void completion.then(
      () => (settled = true),
      () => (settled = true)
    );
    await writing;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    const rejected = expect(completion).rejects.toThrow("storage unavailable");
    failWrite(new Error("storage unavailable"));
    await rejected;
    expect(storage.get("installed_dxmt_version")).toBe("0.80.0");
  });

  it("extracts safely through paths containing spaces, quotes and shell substitutions", async () => {
    profile = path.join(
      temporary,
      "profile 'single' \"double\" $(touch injected)"
    );
    await fs.mkdir(profile);
    const { aria2 } = downloader();
    await drain(checkAndDownloadDXMT(aria2));
    await expectCompleteDxmt();
    await expect(
      fs.stat(path.join(temporary, "injected"))
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("ReShade acquisition and game configuration", () => {
  const wine = {
    toWinePath: (file: string) => "Z:" + file.replaceAll("/", "\\"),
  } as Wine;

  async function gameDirectory() {
    const game = path.join(temporary, "game directory");
    await fs.mkdir(game);
    await fs.writeFile(path.join(game, "keep.dat"), "untouched");
    return game;
  }

  async function expectConfiguration(game: string) {
    expect(await fs.readFile(path.join(game, "ReShade.ini"), "utf8")).toBe(
      `[GENERAL]\nEffectSearchPaths=${wine.toWinePath(
        path.join(profile, "reshade/Shaders")
      )}\nTextureSearchPaths=${wine.toWinePath(
        path.join(profile, "reshade/Textures")
      )}`
    );
    expect(await fs.readFile(path.join(game, "keep.dat"), "utf8")).toBe(
      "untouched"
    );
  }

  it("configures the game by default after acquiring the installer", async () => {
    const game = await gameDirectory();
    const { aria2, requests } = downloader();
    await drain(checkAndDownloadReshade(aria2, wine, game));
    expect(requests).toHaveLength(2);
    expect(await fs.readFile(path.join(profile, "reshade/dxgi.dll"))).toEqual(
      payload("ReShade64.dll")
    );
    expect(storage.get("installed_reshade")).toBe("5.8.0");
    await expectConfiguration(game);
  });

  it("acquires without game writes when disabled, then configures explicitly", async () => {
    const game = await gameDirectory();
    await fs.writeFile(
      path.join(game, "ReShade.ini"),
      "existing user settings"
    );
    const { aria2 } = downloader();
    await drain(checkAndDownloadReshade(aria2, wine, game, false));
    expect(await fs.readdir(game)).toEqual(["ReShade.ini", "keep.dat"]);
    expect(await fs.readFile(path.join(game, "ReShade.ini"), "utf8")).toBe(
      "existing user settings"
    );
    expect(utils.writeFile).not.toHaveBeenCalled();
    await prepareReshadeConfiguration(wine, game);
    await expectConfiguration(game);
  });

  it("keeps the game untouched when reusing acquired resources with false", async () => {
    const game = await gameDirectory();
    const { aria2, requests } = downloader();
    await drain(checkAndDownloadReshade(aria2, wine, game, false));
    expect(
      await drain(checkAndDownloadReshade(aria2, wine, game, false))
    ).toEqual([]);
    expect(requests).toHaveLength(2);
    expect(await fs.readdir(game)).toEqual(["keep.dat"]);
    expect(await fs.readFile(path.join(game, "keep.dat"), "utf8")).toBe(
      "untouched"
    );
    expect(utils.writeFile).not.toHaveBeenCalled();
  });
});

describe("legacy graphics resource APIs", () => {
  it("downloads and reuses MoltenVK through its existing API", async () => {
    const { aria2, requests } = downloader();
    await drain(checkAndDownloadMoltenVK(aria2));
    expect(storage.get("installed_moltenvk_version")).toBe("1.2.2");
    expect(
      await fs.readFile(path.join(profile, "moltenvk/libMoltenVK.dylib"))
    ).toEqual(payload("libMoltenVK.dylib"));
    expect(await drain(checkAndDownloadMoltenVK(aria2))).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("downloads and reuses all existing DXVK exports", async () => {
    const { aria2, requests } = downloader();
    await drain(checkAndDownloadDXVK(aria2));
    expect(storage.get("installed_dxvk_version")).toBe("1.10.4-alpha.20230402");
    for (const file of DXVK_FILES)
      expect(await fs.readFile(path.join(profile, "dxvk", file))).toEqual(
        payload(file)
      );
    expect(await drain(checkAndDownloadDXVK(aria2))).toEqual([]);
    expect(requests).toHaveLength(DXVK_FILES.length);
  });
});
