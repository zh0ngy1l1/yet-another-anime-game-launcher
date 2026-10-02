/* Optional test-only observer: actual Space entry, Win32 child update, then exit.
 * Build: clang -arch x86_64 -dynamiclib -framework Cocoa observe-auxiliary-update.m -o observe-auxiliary-update.dylib
 * Inject only into auxiliary-update.exe in a disposable prefix.
 */
#import <Cocoa/Cocoa.h>
#include <dlfcn.h>

static FILE *output;
static NSWindow *parent, *child;
static NSRect original, desired;
static NSTimeInterval started, next_step;
static int phase, failures;
static int (*connection_id)(void);
static CFArrayRef (*copy_spaces)(int, int, CFArrayRef);
static int (*space_type)(int, uint64_t);

static BOOL fullscreen_space(NSWindow *window)
{
    if (!connection_id || !copy_spaces || !space_type) return NO;
    CFArrayRef spaces = copy_spaces(connection_id(), 7, (CFArrayRef)@[@(window.windowNumber)]);
    BOOL found = NO;
    for (NSNumber *space in (NSArray *)spaces)
        if (space_type(connection_id(), space.unsignedLongLongValue) == 4) found = YES;
    if (spaces) CFRelease(spaces);
    return found;
}

static NSWindow *find(NSString *title)
{
    for (NSWindow *window in NSApp.windows)
        if ([window.title isEqualToString:title]) return window;
    return nil;
}

static void check(BOOL pass, const char *message)
{
    fprintf(output, "%s %s\n", pass ? "PASS" : "FAIL", message);
    failures += !pass;
    fflush(output);
}

static void snapshot(const char *label)
{
    fprintf(output, "AUX_SNAP %s parent=%s child=%s parent_style=%lx parent_space4=%d\n",
            label, NSStringFromRect(parent.frame).UTF8String, NSStringFromRect(child.frame).UTF8String,
            (unsigned long)parent.styleMask, fullscreen_space(parent));
    fflush(output);
}

static void finish(void)
{
    fprintf(output, "RESULT failures=%d\n", failures);
    fflush(output);
    phase = 4;
    [parent release];
    [child release];
    parent = child = nil;
}

static void step(void)
{
    NSTimeInterval now = NSProcessInfo.processInfo.systemUptime;
    if (phase == 4) return;
    if (!parent) {
        NSWindow *p = find(@"YAAGL AUX parent"), *c = find(@"YAAGL AUX child");
        if (!p || !c) return;
        parent = [p retain]; child = [c retain];
        original = child.frame;
        started = now;
        snapshot("initial");
        check(!!(parent.collectionBehavior & NSWindowCollectionBehaviorFullScreenPrimary), "parent is fullscreen eligible");
        [parent makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        [parent toggleFullScreen:nil];
        next_step = now + 3;
        return;
    }
    if (now - started >= 12) {
        check(NO, "auxiliary update scenario completed within 12 seconds");
        finish();
        return;
    }
    if (now < next_step) return;
    if (phase == 0) {
        snapshot("entered-before-update");
        BOOL entered = (parent.styleMask & NSWindowStyleMaskFullScreen) && fullscreen_space(parent);
        check(entered, "Win32 mutation starts only in an actual fullscreen Space");
        if (!entered) { finish(); return; }
        FILE *signal = fopen(getenv("YAAGL_AUX_COMMAND"), "w");
        check(signal != NULL, "observer can signal Win32 update");
        if (!signal) { finish(); return; }
        fputs("update\n", signal);
        fclose(signal);
        phase = 1;
    } else if (phase == 1) {
        if (![child.title isEqualToString:@"YAAGL AUX updated"]) return;
        /* Let queued frame notifications settle after SetWindowPos acknowledgement. */
        phase = 2;
        next_step = now + 0.5;
    } else if (phase == 2) {
        desired = child.frame;
        snapshot("desired-after-win32-update");
        check(!NSEqualSizes(original.size, desired.size), "Win32 update changed auxiliary size");
        check(!!(parent.styleMask & NSWindowStyleMaskFullScreen) && fullscreen_space(parent), "parent remained fullscreen during Win32 update");
        [parent toggleFullScreen:nil];
        phase = 3;
        next_step = now + 3;
    } else if (phase == 3) {
        snapshot("final-after-exit");
        check(!(parent.styleMask & NSWindowStyleMaskFullScreen) && !fullscreen_space(parent), "parent left native fullscreen");
        fprintf(output, "AUX_COMPARE original=%s desired=%s final=%s\n",
                NSStringFromRect(original).UTF8String, NSStringFromRect(desired).UTF8String,
                NSStringFromRect(child.frame).UTF8String);
        check(NSEqualSizes(desired.size, child.frame.size), "explicit auxiliary size update survives fullscreen exit");
        check(NSEqualRects(desired, child.frame), "explicit auxiliary frame update survives fullscreen exit");
        finish();
    }
}

__attribute__((constructor)) static void start(void)
{
    const char *path = getenv("YAAGL_OBSERVER_LOG");
    if (!path || !getenv("YAAGL_AUX_COMMAND") || !(output = fopen(path, "a"))) return;
    connection_id = dlsym(RTLD_DEFAULT, "CGSMainConnectionID");
    copy_spaces = dlsym(RTLD_DEFAULT, "CGSCopySpacesForWindows");
    space_type = dlsym(RTLD_DEFAULT, "CGSSpaceGetType");
    dispatch_async(dispatch_get_main_queue(), ^{
        dispatch_source_t timer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
        dispatch_source_set_timer(timer, dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), NSEC_PER_SEC / 4, NSEC_PER_SEC / 20);
        dispatch_source_set_event_handler(timer, ^{ @autoreleasepool { step(); } });
        dispatch_resume(timer);
    });
}
