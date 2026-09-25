import { getCPUInfo, getKey } from "@utils";
import type { Config } from "@config/config-def";

declare module "@config/config-def" {
  interface Config {
    workaround3: boolean;
  }
}

const CONFIG_KEY = "config_workaround3";

/** Retain saved values and historical defaults for tagged patch compatibility.
 * The obsolete menu control is gone; loading never rewrites this preference. */
export async function loadWorkaround3Config(config: Partial<Config>) {
  try {
    config.workaround3 = (await getKey(CONFIG_KEY)) == "true";
  } catch {
    const { model } = await getCPUInfo();
    config.workaround3 =
      import.meta.env["YAAGL_CHANNEL_CLIENT"] == "hk4eos"
        ? false
        : model.includes("Apple") // HACK: the app runs on rosetta
        ? true
        : false; // default value
  }
}
