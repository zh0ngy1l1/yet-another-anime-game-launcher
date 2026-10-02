/* Test-only callback fault injection; this does not simulate OS policy denial.
 * Inject into fullscreen.exe in a private prefix, never into a game.
 */
#import <Cocoa/Cocoa.h>

@interface NSWindow (FullscreenFixture)
- (void)windowWillEnterFullScreen:(NSNotification *)notification;
- (void)windowWillExitFullScreen:(NSNotification *)notification;
- (void)windowDidExitFullScreen:(NSNotification *)notification;
- (void)windowDidFailToEnterFullScreen:(NSWindow *)window;
- (void)windowDidFailToExitFullScreen:(NSWindow *)window;
@end

static FILE *output;
static int failures;
static void check(BOOL pass, const char *message)
{
    fprintf(output, "%s %s\n", pass ? "PASS" : "FAIL", message);
    failures += !pass;
    fflush(output);
}

__attribute__((constructor)) static void start(void)
{
    const char *path = getenv("YAAGL_OBSERVER_LOG");
    if (!path || !(output = fopen(path, "a"))) return;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 4 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        @autoreleasepool {
            NSWindow *window = nil;
            for (NSWindow *candidate in NSApp.windows)
                if ([candidate.title isEqualToString:@"YAAGL fixed"]) window = candidate;
            /* Wine services inherit injection too. Only the process owning the
             * fixture window runs assertions. If the actual target is missing,
             * no RESULT is emitted and the runner still fails the case. */
            if (!window) return;
            [window retain];
            NSRect original = window.frame;
            [window windowWillEnterFullScreen:nil];
            check([[window valueForKey:@"fixedSizeFullscreenActive"] boolValue], "entry latches fixed-window handling");
            [window setValue:@NO forKey:@"fixedSizeFullscreen"];
            NSRect moved = original; moved.origin.x += 35;
            [window setFrame:moved display:NO];
            [window windowDidFailToEnterFullScreen:window];
            check(NSEqualRects(window.frame, original), "failed entry restores frame after eligibility changes");
            check(![[window valueForKey:@"enteringFullScreen"] boolValue] &&
                  ![[window valueForKey:@"fixedSizeFullscreenActive"] boolValue] &&
                  ![window valueForKey:@"nonFullscreenChildFrames"], "failed entry clears transition and saved children");

            [window setValue:@YES forKey:@"fixedSizeFullscreen"];
            [window windowWillEnterFullScreen:nil];
            [window setValue:@NO forKey:@"enteringFullScreen"];
            [window windowWillExitFullScreen:nil];
            [window windowDidFailToExitFullScreen:window];
            check(![[window valueForKey:@"exitingFullScreen"] boolValue] &&
                  [[window valueForKey:@"fixedSizeFullscreenActive"] boolValue] &&
                  [window valueForKey:@"nonFullscreenChildFrames"] != nil, "failed exit preserves snapshot for retry");
            [window windowDidExitFullScreen:nil];
            check(NSEqualRects(window.frame, original) &&
                  ![[window valueForKey:@"fixedSizeFullscreenActive"] boolValue], "successful retry restores and clears latch");

            [window windowWillEnterFullScreen:nil];
            [window setValue:@YES forKey:@"closing"];
            [window setValue:@NO forKey:@"fixedSizeFullscreen"];
            [window windowDidFailToEnterFullScreen:window];
            [window windowDidExitFullScreen:nil];
            [window windowDidFailToExitFullScreen:window];
            [window windowDidExitFullScreen:nil];
            check(!window.visible && ![[window valueForKey:@"enteringFullScreen"] boolValue] &&
                  ![[window valueForKey:@"exitingFullScreen"] boolValue] &&
                  ![window valueForKey:@"nonFullscreenChildFrames"], "repeated late callbacks leave closing shell hidden and release snapshots");
            fprintf(output, "RESULT failures=%d\n", failures); fflush(output);
            [window release];
        }
    });
}
