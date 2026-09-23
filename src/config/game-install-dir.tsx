import { FormControl, FormLabel, Input, InputGroup } from "@hope-ui/solid";

import { Locale } from "../locale";
import { Config, NOOP } from "./config-def";

export async function createGameInstallDirConfig({
  locale,
  gameInstallDir,
}: {
  config: Partial<Config>;
  locale: Locale;
  gameInstallDir: () => string;
}) {
  async function onSave() {
    return NOOP;
  }

  return [
    function UI() {
      return (
        <FormControl id="gameInstallDir">
          <FormLabel>{locale.get("SETTING_GAME_INSTALL_DIR")}</FormLabel>
          <InputGroup>
            <Input disabled readOnly value={gameInstallDir()} />
          </InputGroup>
        </FormControl>
      );
    },
    onSave,
  ] as const;
}
