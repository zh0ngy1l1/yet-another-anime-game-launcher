import type { Locale } from "@locale";
import type { Config } from "@config";
import { loadWorkaround3Config } from "./config/workaround-3";
import createPatchOff from "./config/patch-off";
import createSteamPatch from "./config/steam-patch";
import createBlockNet from "./config/block-net";
import createResolution from "./config/resolution";
import createTimeoutFix from "./config/timeout-fix";
import { createNativeFullscreenConfig } from "./config/native-fullscreen";
import { createGameModeConfig } from "./config/game-mode";
import { createEnableHDRConfig } from "./config/enable-hdr";
import { createFpsUnlockConfig } from "./config/fps-unlock";

export async function createHk4eSettings(
  locale: Locale,
  config: Partial<Config>,
  gameVersion: () => string
) {
  await loadWorkaround3Config(config);
  const [PO] = await createPatchOff({ locale, config });
  const [SP] = await createSteamPatch({ locale, config });
  const [BN] = await createBlockNet({ locale, config });
  const [NF] = await createNativeFullscreenConfig({ locale, config });
  const [GM] = await createGameModeConfig({ locale, config });
  const [HDR] = await createEnableHDRConfig({ locale, config });
  const [RES] = await createResolution({ locale, config });
  const [TF] = await createTimeoutFix({ locale, config });
  const [FPS] = await createFpsUnlockConfig({ locale, config });

  return function () {
    return [
      "Game Version: ",
      gameVersion(),
      <FPS />,
      <NF />,
      <GM />,
      <HDR />,
      <PO />,
      <SP />,
      <BN />,
      <RES />,
      <TF />,
    ];
  };
}
