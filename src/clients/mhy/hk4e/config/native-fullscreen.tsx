import { FormControl, FormLabel, Box, Checkbox, Text } from "@hope-ui/solid";
import { createEffect, createSignal } from "solid-js";
import { Locale } from "@locale";
import { assertValueDefined, getKey, setKey } from "@utils";
import { Config, NOOP } from "@config/config-def";

declare module "@config/config-def" {
  interface Config {
    hk4eNativeFullscreen: boolean;
  }
}

const CONFIG_KEY = "config_hk4e_native_fullscreen";

export async function createNativeFullscreenConfig({
  locale,
  config,
}: {
  config: Partial<Config>;
  locale: Locale;
}) {
  try {
    config.hk4eNativeFullscreen = (await getKey(CONFIG_KEY)) == "true";
  } catch {
    config.hk4eNativeFullscreen = false;
  }

  const [value, setValue] = createSignal(config.hk4eNativeFullscreen);

  async function onSave(apply: boolean) {
    assertValueDefined(config.hk4eNativeFullscreen);
    if (!apply) {
      setValue(config.hk4eNativeFullscreen);
      return NOOP;
    }
    if (config.hk4eNativeFullscreen == value()) return NOOP;
    config.hk4eNativeFullscreen = value();
    await setKey(CONFIG_KEY, config.hk4eNativeFullscreen ? "true" : "false");
    return NOOP;
  }

  createEffect(() => {
    value();
    onSave(true);
  });

  return [
    function UI() {
      return (
        <FormControl id="hk4eNativeFullscreen">
          <FormLabel>{locale.get("SETTING_NATIVE_FULLSCREEN")}</FormLabel>
          <Box>
            <Checkbox
              checked={value()}
              onChange={() => setValue(x => !x)}
              size="md"
            >
              {locale.get("SETTING_ENABLED")}
            </Checkbox>
          </Box>
          <Text size="xs">{locale.get("SETTING_NATIVE_FULLSCREEN_DESC")}</Text>
        </FormControl>
      );
    },
  ] as const;
}
