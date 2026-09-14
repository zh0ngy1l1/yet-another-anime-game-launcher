// Local macOS startup clock and visible failure fallback. This code runs in
// the native process; hidden WKWebView timers and painting are not involved.
#import <Cocoa/Cocoa.h>
#include <chrono>
#include <algorithm>
#include <condition_variable>
#include <mutex>
#include <string>
#include "api/custom/custom.h"
#include "api/debug/debug.h"
#include "api/events/events.h"
#include "api/window/window.h"

namespace {
std::mutex stateMutex;
std::condition_variable changed;
std::string phase = "unarmed", failureMessage;
constexpr int deadlineMilliseconds = 90000;
using Clock = std::chrono::steady_clock;
Clock::time_point startupDeadline;
const std::string deadlineMessage = "Startup did not finish within 90 seconds. See neutralinojs.log.";
NSPanel *failurePanel = nil;
NSTextField *failureText = nil;
id failureController = nil;

json status() {
    std::lock_guard<std::mutex> lock(stateMutex);
    return {{"phase", phase}, {"message", failureMessage}};
}

void requestClose();
void displayFailure(const std::string &message);
// stateMutex must be held. Check elapsed time at admission too: dispatch_after
// delivery can be delayed by other AppKit work, and must not extend the budget.
bool expireLocked() {
    if (phase != "starting" || Clock::now() < startupDeadline) return false;
    phase = "failed";
    failureMessage = deadlineMessage;
    return true;
}
void fail(const std::string &message) {
    // All state transitions that touch AppKit are serialized on the main queue.
    {
        std::lock_guard<std::mutex> lock(stateMutex);
        if (phase == "ready") return;
        if (phase != "cancelled") phase = "failed";
        failureMessage = message;
    }
    changed.notify_all();
    debug::log(debug::LogTypeError, "Bootstrap failure: " + message);
    displayFailure(message);
    events::dispatch("bootstrapFailure", {{"message", message}});
}
}

@interface YaaglBootstrapFailureController : NSObject <NSWindowDelegate>
- (void)quit:(id)sender;
@end
@implementation YaaglBootstrapFailureController
- (void)quit:(id)sender { requestClose(); }
- (BOOL)windowShouldClose:(id)sender { requestClose(); return NO; }
@end

namespace {
void displayFailure(const std::string &message) {
    if (!failurePanel) {
        failureController = [[YaaglBootstrapFailureController alloc] init];
        failurePanel = [[NSPanel alloc]
            initWithContentRect:NSMakeRect(0, 0, 580, 235)
            styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
            backing:NSBackingStoreBuffered defer:NO];
        [failurePanel setTitle:@"Yaagl OS"];
        [failurePanel setReleasedWhenClosed:NO];
        [failurePanel setDelegate:failureController];
        failureText = [[NSTextField alloc] initWithFrame:NSMakeRect(24, 65, 532, 150)];
        [failureText setEditable:NO];
        [failureText setSelectable:YES];
        [failureText setBezeled:NO];
        [failureText setDrawsBackground:NO];
        [[failureText cell] setWraps:YES];
        [[failurePanel contentView] addSubview:failureText];
        NSButton *quit = [[NSButton alloc] initWithFrame:NSMakeRect(438, 18, 118, 32)];
        [quit setTitle:@"Quit"];
        [quit setBezelStyle:NSBezelStyleRounded];
        [quit setTarget:failureController];
        [quit setAction:@selector(quit:)];
        [[failurePanel contentView] addSubview:quit];
        [quit release];
        [failurePanel center];
    }
    const std::string text = "Yaagl OS could not finish starting.\n\n" + message +
        "\n\nQuit uses normal cleanup. If cleanup cannot finish, keep the launcher and its logs for review.";
    [failureText setStringValue:[NSString stringWithUTF8String:text.c_str()]];
    [failurePanel makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

void requestClose() {
    {
        std::lock_guard<std::mutex> lock(stateMutex);
        if (phase != "ready") phase = "cancelled";
    }
    changed.notify_all();
    displayFailure("Waiting for normal cleanup. No forced exit has been requested.");
    // This is the existing JS ownership/termination gate, never app.exit.
    events::dispatch("windowClose", nullptr);
}
}

namespace custom {
void observeBootstrapClose() {
    bool pending;
    {
        std::lock_guard<std::mutex> lock(stateMutex);
        pending = phase == "starting" || phase == "failed" || phase == "cancelled";
        if (pending) phase = "cancelled";
    }
    if (!pending) return;
    changed.notify_all();
    displayFailure("Waiting for normal cleanup.");
}

void armBootstrap() {
    {
        std::lock_guard<std::mutex> lock(stateMutex);
        if (phase != "unarmed") return;
        phase = "starting";
        startupDeadline = Clock::now() + std::chrono::milliseconds(deadlineMilliseconds);
    }
    debug::log(debug::LogTypeInfo, "Bootstrap watchdog armed deadlineMs=90000");
    // Arm before navigation, so even missing JS/a disconnected WebView gets a
    // visible native failure. Late readiness cannot revive a failed startup.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, deadlineMilliseconds * NSEC_PER_MSEC),
        dispatch_get_main_queue(), ^{
            bool expired;
            { std::lock_guard<std::mutex> lock(stateMutex); expired = expireLocked(); }
            if (expired) fail(deadlineMessage);
        });
}

namespace controllers {
json bootstrap(const json &input) {
    if (!input.contains("op") || !input["op"].is_string())
        return {{"error", {{"code", "YAAGL_BOOTSTRAP_ARGUMENT"}, {"message", "Missing bootstrap operation"}}}};
    const auto op = input["op"].get<std::string>();
    if (op == "wait") {
        if (!input.contains("milliseconds") || !input["milliseconds"].is_number_integer())
            return {{"error", {{"code", "YAAGL_BOOTSTRAP_ARGUMENT"}, {"message", "Invalid bootstrap wait"}}}};
        const auto ms = input["milliseconds"].get<int64_t>();
        if (ms < 1 || ms > deadlineMilliseconds)
            return {{"error", {{"code", "YAAGL_BOOTSTRAP_ARGUMENT"}, {"message", "Bootstrap wait outside bounds"}}}};
        std::unique_lock<std::mutex> lock(stateMutex);
        changed.wait_until(lock, std::min(startupDeadline, Clock::now() + std::chrono::milliseconds(ms)),
            [] { return phase != "starting"; });
        const bool expired = expireLocked();
        lock.unlock();
        if (expired) {
            changed.notify_all();
            dispatch_async(dispatch_get_main_queue(), ^{ fail(deadlineMessage); });
        }
    } else if (op == "ready") {
        dispatch_sync(dispatch_get_main_queue(), ^{
            bool show = false;
            bool expired = false;
            {
                std::lock_guard<std::mutex> lock(stateMutex);
                expired = expireLocked();
                if (phase == "starting") { phase = "ready"; show = true; }
            }
            changed.notify_all();
            if (expired) fail(deadlineMessage);
            if (show) {
                debug::log(debug::LogTypeInfo, "Bootstrap DOM ready; showing launcher once");
                window::show();
            }
        });
    } else if (op == "fail" || op == "cancel") {
        const std::string message = input.contains("message") && input["message"].is_string()
            ? input["message"].get<std::string>().substr(0, 4096) : "Launcher startup cancelled";
        dispatch_sync(dispatch_get_main_queue(), ^{
            if (op == "cancel") {
                { std::lock_guard<std::mutex> lock(stateMutex); if (phase != "ready") phase = "cancelled"; }
                changed.notify_all();
                displayFailure("Waiting for normal cleanup.");
            } else fail(message);
        });
    } else if (op == "begin") {
        bool expired;
        { std::lock_guard<std::mutex> lock(stateMutex); expired = expireLocked(); }
        if (expired) {
            changed.notify_all();
            dispatch_async(dispatch_get_main_queue(), ^{ fail(deadlineMessage); });
        }
    } else {
        return {{"error", {{"code", "YAAGL_BOOTSTRAP_ARGUMENT"}, {"message", "Unknown bootstrap operation"}}}};
    }
    return {{"success", true}, {"returnValue", status()}};
}
}
}
