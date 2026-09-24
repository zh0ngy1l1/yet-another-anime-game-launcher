import { FormControl, FormLabel, Box, Checkbox, Text } from "@hope-ui/solid";
import { createSignal } from "solid-js";
import { Locale } from "@locale";
import { assertValueDefined, getKey, setKey } from "@utils";
import { Config, NOOP } from "@config/config-def";

declare module "@config/config-def" {
  interface Config {
    hk4eGameMode: boolean;
  }
}

const CONFIG_KEY = "config_hk4e_game_mode";

export async function createGameModeConfig({
  locale,
  config,
}: {
  config: Partial<Config>;
  locale: Locale;
}) {
  try {
    config.hk4eGameMode = (await getKey(CONFIG_KEY)) == "true";
  } catch {
    config.hk4eGameMode = false;
  }

  const [value, setValue] = createSignal(config.hk4eGameMode);

  async function onSave(apply: boolean) {
    assertValueDefined(config.hk4eGameMode);
    if (!apply) {
      setValue(config.hk4eGameMode);
      return NOOP;
    }
    if (config.hk4eGameMode == value()) return NOOP;
    config.hk4eGameMode = value();
    await setKey(CONFIG_KEY, config.hk4eGameMode ? "true" : "false");
    return NOOP;
  }

  return [
    function UI() {
      return (
        <FormControl id="hk4eGameMode">
          <FormLabel>{locale.get("SETTING_GAME_MODE")}</FormLabel>
          <Box>
            <Checkbox
              checked={value()}
              onChange={() => {
                setValue(x => !x);
                void onSave(true);
              }}
              size="md"
            >
              {locale.get("SETTING_ENABLED")}
            </Checkbox>
          </Box>
          <Text size="xs">{locale.get("SETTING_GAME_MODE_DESC")}</Text>
        </FormControl>
      );
    },
  ] as const;
}
