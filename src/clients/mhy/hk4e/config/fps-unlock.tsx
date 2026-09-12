import {
  Box,
  Checkbox,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  Text,
  VStack,
} from "@hope-ui/solid";
import { Show } from "solid-js";
import type { Config } from "@config/config-def";
import type { Locale } from "@locale";
import { createFpsUnlockSettings } from "./fps-unlock-settings";
import type { FpsUnlockDraft } from "./fps-unlock-state";

export async function createFpsUnlockConfig({
  locale,
  config,
}: {
  locale: Locale;
  config: Partial<Config>;
}) {
  const settings = await createFpsUnlockSettings(config);
  async function onChange(draft: FpsUnlockDraft) {
    try {
      await settings.change(draft);
    } catch {
      // The controller retains the draft and exposes a localized save error.
    }
  }

  return [
    function UI() {
      return (
        <VStack spacing={4} alignItems="stretch" w="100%">
          <FormControl id="hk4eFpsUnlockEnabled">
            <FormLabel>{locale.get("SETTING_FPS_UNLOCK")}</FormLabel>
            <Box>
              <Checkbox
                checked={settings.draft().enabled}
                onChange={() =>
                  onChange({
                    ...settings.draft(),
                    enabled: !settings.draft().enabled,
                  })
                }
                size="md"
              >
                {locale.get("SETTING_ENABLED")}
              </Checkbox>
            </Box>
          </FormControl>
          <FormControl
            id="hk4eFpsUnlockTarget"
            invalid={!settings.validation().ok}
          >
            <FormLabel>{locale.get("SETTING_HK4E_FPS_TARGET")}</FormLabel>
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              value={settings.draft().target}
              onInput={e =>
                onChange({ ...settings.draft(), target: e.currentTarget.value })
              }
            />
            <FormErrorMessage role="alert">
              {locale.get("SETTING_HK4E_FPS_TARGET_ERROR")}
            </FormErrorMessage>
          </FormControl>
          <Show when={settings.saveFailed()}>
            <Text role="alert" color="$danger11" size="sm">
              {locale.get("SETTING_HK4E_FPS_SAVE_ERROR")}
            </Text>
          </Show>
        </VStack>
      );
    },
  ] as const;
}
