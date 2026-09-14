import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import source from "./launch-fix.pl?raw";

const control = source.match(
  /# BEGIN INJECTED RESTORATION CONTROL\n([\s\S]*?)# END INJECTED RESTORATION CONTROL/
)?.[1];
function exercise(permanent: boolean) {
  expect(control).toBeDefined();
  // Only callback orchestration is evaluated. Every callback below is inert;
  // the real helper entry point and its I/O implementations are never evaluated.
  expect(control?.replace(/^\s*#.*$/gm, "")).not.toMatch(
    /\b(?:open|sysopen|sysread|syswrite|unlink|rename|truncate|chmod|chown|system|exec|fork|socket|chdir|require)\b|`/
  );
  const harness = `use strict; use warnings; use JSON::PP;
${control}
my $permanent = ${permanent ? 1 : 0};
my ($attempt, $restores, $publications, $pauses, $commands, $published) = (0, 0, 0, 0, 0, 0);
my $preimage = "retained in memory";
my @warnings; my @failures; my $escaped = '';
eval {
    launch_fix_restore_until(
        sub { $restores++; die "original content conflict" if $restores == 1; },
        sub { push @failures, $_[0]; $publications++; die "record write failed" if $permanent || $publications < 3; $published = 1; return 'published'; },
        sub { $commands++; die "control read before failure published" unless $published; return "token retry 1\\n"; },
        sub { $pauses++; die "inert test observation bound" if $pauses == 5; },
        sub { push @warnings, $_[0]; }, 'token', \\$attempt);
    1;
} or $escaped = "$@";
print encode_json({attempt=>$attempt, restores=>$restores, publications=>$publications, pauses=>$pauses, commands=>$commands, preimage=>$preimage, warnings=>\\@warnings, failures=>\\@failures, escaped=>$escaped});`;
  return JSON.parse(
    execFileSync("/usr/bin/perl", ["-e", harness], { encoding: "utf8" })
  );
}
it("retains original restoration failure and preimage through transient record failure, then retries only on explicit control", () => {
  const result = exercise(false);
  expect(result.escaped).toBe("");
  expect(result.preimage).toBe("retained in memory");
  expect(result.publications).toBe(3);
  expect(result.restores).toBe(2);
  expect(result.commands).toBe(1);
  expect(result.attempt).toBe(1);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toContain("record write failed");
  expect(
    result.failures.every((text: string) =>
      text.includes("original content conflict")
    )
  ).toBe(true);
});
it("persistent publication failure keeps the same state without retrying host writes or flooding stderr", () => {
  const result = exercise(true);
  expect(result.escaped).toContain("inert test observation bound");
  expect(result.preimage).toBe("retained in memory");
  expect(result.publications).toBe(5);
  expect(result.restores).toBe(1);
  expect(result.commands).toBe(0);
  expect(result.attempt).toBe(0);
  expect(result.warnings).toHaveLength(1);
});
