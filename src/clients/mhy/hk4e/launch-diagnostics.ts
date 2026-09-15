/** An exception address needs this run's load addresses to identify its module.
 * Apply the same channels to both routes; preserve the selected Wine settings.
 * Handled exceptions and loader messages do not by themselves mean failure. */
export function hk4eWineDebug(base = "fixme-all,err-unwind,+timestamp") {
  const additional = "err+seh,+loaddll,+pid";
  // Errors and module loads are bounded normal diagnostics. Full +seh traces
  // log handled syscalls at multi-GB/minute rates and require explicit opt-in.
  // Keep these last: a later -all must not disable error capture.
  return base.endsWith(additional)
    ? base
    : [base, additional].filter(Boolean).join(",");
}
