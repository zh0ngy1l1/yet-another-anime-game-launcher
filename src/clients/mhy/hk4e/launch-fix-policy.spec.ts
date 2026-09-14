import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import source from "./launch-fix.pl?raw";

// Only these two pure transformation functions enter the interpreter. The real
// privileged/helper entry point is never evaluated. Input/output are strings;
// no hosts path, filesystem operation, network or subprocess exists in this code.
const pure = source.match(
  /# BEGIN PURE HOSTS POLICY\n([\s\S]*?)# END PURE HOSTS POLICY/
)?.[1];
const harness = `use strict; use warnings; use JSON::PP;
${pure}
my $input = decode_json(do { local $/; <STDIN> });
my $addition = launch_fix_addition($input->{before}, 'example.test', 'a' x 64);
my $expected = $input->{before} . $addition;
my $current = exists($input->{current}) ? $input->{current} : $expected;
my $restored = eval { launch_fix_restore($current, $expected, $input->{before}) };
print encode_json({addition => $addition, restored => $restored, error => "$@"});`;
function policy(before: string, current?: string) {
  expect(pure).toBeDefined();
  // This fails closed if future changes add a real side-effect boundary to the
  // extracted policy; it cannot accidentally execute the full helper script.
  expect(pure).not.toMatch(
    /\b(?:open|sysopen|sysread|syswrite|unlink|rename|truncate|chmod|chown|system|exec|fork|socket|chdir|eval|require|do)\b|`/
  );
  return JSON.parse(
    execFileSync("/usr/bin/perl", ["-e", harness], {
      input: JSON.stringify({
        before,
        ...(current === undefined ? {} : { current }),
      }),
      encoding: "utf8",
    })
  );
}
it.each([
  "",
  "127.0.0.1 localhost",
  "127.0.0.1 localhost\n",
  "# Temporarily Added by Yaagl\nold entry\n# End of section\n",
])(
  "restores exact original bytes, including old markers and missing newline: %j",
  before => {
    const result = policy(before);
    expect(result.restored).toBe(before);
    expect(result.error).toBe("");
    expect(result.addition).toContain(
      `# Temporarily Added by Yaagl ${"a".repeat(64)}`
    );
    expect(result.addition).toContain(`# End of Yaagl ${"a".repeat(64)}`);
  }
);
it.each([
  "0.0.0.0 example.test\n",
  "  0.0.0.0 alias EXAMPLE.TEST # preexisting\r\n",
])(
  "preserves an existing matching hosts mapping without adding/removing it",
  before => {
    const result = policy(before);
    expect(result.addition).toBe("");
    expect(result.restored).toBe(before);
  }
);
it.each(["# 0.0.0.0 example.test\n", "0.0.0.0 example.test.extra\n"])(
  "does not mistake comments or longer domains for an existing mapping",
  before => {
    expect(policy(before).addition).toContain("0.0.0.0 example.test\n");
  }
);
it("refuses concurrent hosts changes without producing replacement bytes", () => {
  const result = policy("127.0.0.1 localhost\n", "independent edit\n");
  expect(result.restored).toBeNull();
  expect(result.error).toContain(
    "Hosts changed concurrently; restoration retained"
  );
});
