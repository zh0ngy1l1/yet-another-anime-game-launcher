import { expect, it } from "vitest";
import { hk4eWineDebug } from "./launch-diagnostics";

it("retains custom debug channels and requests exception and module addresses", () => {
  expect(hk4eWineDebug("-all,+timestamp,err+virtual")).toBe(
    "-all,+timestamp,err+virtual,+seh,+loaddll"
  );
  expect(hk4eWineDebug("+seh,+loaddll,-all")).toBe(
    "+seh,+loaddll,-all,+seh,+loaddll"
  );
});
it("applying route diagnostics twice does not duplicate trace channels", () => {
  const selected = hk4eWineDebug();
  expect(hk4eWineDebug(selected)).toBe(selected);
  expect(selected).toBe("fixme-all,err-unwind,+timestamp,+seh,+loaddll");
});
