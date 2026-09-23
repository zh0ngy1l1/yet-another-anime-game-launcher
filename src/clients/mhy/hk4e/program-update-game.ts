import { join, basename } from "path-browserify";
import { Sophon, SophonProgressEvent } from "@sophon";
import { CommonUpdateProgram } from "@common-update-ui";
import { humanFileSize, setKey } from "@utils";

export async function* showUpdateProgress(
  progress: SophonProgressEvent
): CommonUpdateProgram {
  if (progress.type === "update_stage") {
    const completed = Number(progress.completed_files || 0);
    const total = Number(progress.total_files || 0);
    if (progress.stage === "verifying") {
      yield [
        "setStateText",
        "SCANNING_FILES",
        String(completed),
        String(total),
      ];
    } else if (progress.stage === "downloading") {
      const downloadTotal = progress.overall_progress?.total_size;
      if (downloadTotal) {
        yield [
          "setStateText",
          "DOWNLOADING_FILE_PROGRESS",
          basename(progress.filename || ""),
          humanFileSize(progress.overall_progress?.download_speed || 0),
          humanFileSize(progress.downloaded_bytes || 0),
          humanFileSize(downloadTotal),
        ];
      } else {
        // Missing chunks depend on the verified local data; do not invent a
        // total before the engine has established it.
        yield ["setStateText", "DOWNLOADING_UPDATE_FILE"];
      }
    } else if (["reusing", "assembling", "deleting"].includes(progress.stage)) {
      yield ["setStateText", "PATCHING"];
    } else {
      yield ["setStateText", "UPDATING"];
    }
    if (total > 0)
      yield ["setProgress", Math.min(100, (completed * 100) / total)];
    else yield ["setUndeterminedProgress"];
  } else if (
    ["chunk_progress", "ldiff_download_complete"].includes(progress.type)
  ) {
    yield [
      "setStateText",
      "DOWNLOADING_FILE_PROGRESS",
      basename(progress.filename),
      humanFileSize(progress.overall_progress.download_speed),
      humanFileSize(progress.overall_progress.downloaded_size),
      humanFileSize(progress.overall_progress.total_size),
    ];
    yield ["setProgress", Number(progress.overall_progress.overall_percent)];
  } else if (["delete_file", "delete_ldiff_file"].includes(progress.type)) {
    yield ["setStateText", "PATCHING"];
    yield ["setProgress", Number(progress.overall_progress.overall_percent)];
  }
}

async function* update(
  sophon: Sophon,
  gameDir: string,
  predownload: boolean
): CommonUpdateProgram {
  const taskId = await sophon.startUpdate({
    gamedir: gameDir,
    game_type: "hk4e",
    tempdir: join(gameDir, ".tmp"),
    predownload,
  });
  yield ["setUndeterminedProgress"];
  yield ["setStateText", "UPDATING"];
  for await (const progress of sophon.streamOperationProgress(taskId)) {
    yield* showUpdateProgress(progress);
  }
}

export async function* updateGameProgram({
  sophon,
  gameDir,
}: {
  sophon: Sophon;
  gameDir: string;
}): CommonUpdateProgram {
  // File migration, verification and version metadata belong to the updater's
  // transaction. The UI must never move/delete source files before it starts.
  yield* update(sophon, gameDir, false);
  await setKey("predownloaded_all", null);
}

export async function* predownloadGameProgram({
  sophon,
  gameDir,
}: {
  sophon: Sophon;
  gameDir: string;
}): CommonUpdateProgram {
  yield* update(sophon, gameDir, true);
  await setKey("predownloaded_all", "true");
}
