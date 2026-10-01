import { afterEach, expect, it, vi } from "vitest";
import { errorDetails, errorMessage, operationError } from "./errors";
import { exec } from "./neu";
afterEach(() => {
  vi.unstubAllGlobals();
});
it("keeps useful native file/permission details without dumping its JSON object", () => {
  expect(
    errorMessage({
      code: "NE_FS_FILRDER",
      message: "Permission denied: /game/config.ini",
      data: { internal: true },
    })
  ).toBe("Permission denied: /game/config.ini (NE_FS_FILRDER)");
});
it("retains original exceptions in operation diagnostics", () => {
  const original = Error("Internal protocol value: 42"),
    error = operationError("Could not restore display settings.", original);
  expect(errorMessage(error)).toBe("Could not restore display settings.");
  expect(errorDetails(error)).toContain(original.message);
});
it("shows the failed command operation and keeps raw shell/Perl output in logs", async () => {
  const log = vi.fn(async (_message: string, _level?: string) => undefined);
  vi.stubGlobal("Neutralino", {
    debug: { log },
    os: {
      execCommand: async () => ({
        exitCode: 13,
        stdOut: "raw stdout",
        stdErr: "die: permission denied at -e line 1",
      }),
    },
  });
  const error = await exec(["/usr/bin/perl", "-e", "internal script"]).catch(
    error => error
  );
  expect(errorMessage(error)).toBe(
    "File preparation or cleanup failed (exit status 13). See neutralinojs.log for details."
  );
  await Promise.resolve();
  expect(log.mock.calls.map(call => call[0]).join("\n")).toContain(
    "die: permission denied at -e line 1"
  );
  expect(errorDetails(error)).toContain("internal\\ script");
});
