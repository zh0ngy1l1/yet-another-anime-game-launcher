import { beforeEach, expect, it, vi } from "vitest";
import { setKey } from "@utils";
import { Sophon } from "@sophon";
import {
  predownloadGameProgram,
  updateGameProgram,
} from "./program-update-game";
import { checkIntegrityProgram } from "./program-check-integrity";
vi.mock("@utils", () => ({
  setKey: vi.fn(),
  humanFileSize: (value: number) => String(value),
}));
beforeEach(() => {
  vi.resetAllMocks();
});
async function drain(program: AsyncGenerator) {
  const events = [];
  for await (const event of program) events.push(event);
  return events;
}
function client(fail = false) {
  return {
    startUpdate: vi.fn().mockResolvedValue("task"),
    startRepair: vi.fn().mockResolvedValue("task"),
    async *streamOperationProgress() {
      yield {
        type: "update_stage",
        stage: "verifying",
        completed_files: 2,
        total_files: 4,
      };
      if (fail) throw new Error("final hash mismatch");
      yield { type: "completed", task_id: "task" };
    },
  } as unknown as Sophon;
}
it("shows target verification and clears preload state only after completion", async () => {
  const sophon = client();
  const events = await drain(
    updateGameProgram({ sophon, gameDir: "/fixture" })
  );
  expect(events).toContainEqual(["setStateText", "SCANNING_FILES", "2", "4"]);
  expect(events).toContainEqual(["setProgress", 50]);
  expect(setKey).toHaveBeenCalledWith("predownloaded_all", null);
  expect(sophon.startUpdate).toHaveBeenCalledWith({
    gamedir: "/fixture",
    game_type: "hk4e",
    tempdir: "/fixture/.tmp",
    predownload: false,
  });
});
it("does not change preload metadata after an update failure", async () => {
  await expect(
    drain(updateGameProgram({ sophon: client(true), gameDir: "/fixture" }))
  ).rejects.toThrow("final hash mismatch");
  expect(setKey).not.toHaveBeenCalled();
});
it("does not mark a failed predownload complete", async () => {
  await expect(
    drain(predownloadGameProgram({ sophon: client(true), gameDir: "/fixture" }))
  ).rejects.toThrow("final hash mismatch");
  expect(setKey).not.toHaveBeenCalled();
});
it("requests predownload and records completion after the task finishes", async () => {
  const sophon = client();
  await drain(predownloadGameProgram({ sophon, gameDir: "/fixture" }));
  expect(sophon.startUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ predownload: true })
  );
  expect(setKey).toHaveBeenCalledWith("predownloaded_all", "true");
});

it("shows full-manifest repair verification through the integrity UI", async () => {
  const sophon = client();
  const events = await drain(
    checkIntegrityProgram({ sophon, gameDir: "/fixture" })
  );
  expect(events).toContainEqual(["setStateText", "SCANNING_FILES", "2", "4"]);
  expect(events).toContainEqual(["setProgress", 50]);
  expect(sophon.startRepair).toHaveBeenCalledWith({
    gamedir: "/fixture",
    game_type: "hk4e",
    repair_mode: "reliable",
  });
});
