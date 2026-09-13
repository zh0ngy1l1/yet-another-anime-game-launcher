/** An exception address needs this run's load addresses to identify its module.
 * Apply the same channels to both routes; preserve the selected Wine settings.
 * Handled exceptions and loader messages do not by themselves mean failure. */
export function hk4eWineDebug(base = "fixme-all,err-unwind,+timestamp") {
  const additional = "+seh,+loaddll";
  // Keep these last: a later -all in a custom base must not disable capture.
  return base.endsWith(additional)
    ? base
    : [base, additional].filter(Boolean).join(",");
}
