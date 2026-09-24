/* Test-only __wine_main replacement. Never shipped in a runtime. */
#import <Foundation/Foundation.h>
#include <dlfcn.h>
#include <mach-o/dyld.h>
#include <unistd.h>

void __wine_main(int argc, char **argv)
{
    @autoreleasepool {
        char executable[4096]; uint32_t length = sizeof(executable);
        _NSGetExecutablePath(executable, &length);
        NSMutableArray *arguments = [NSMutableArray array];
        for (int i = 0; i < argc; i++) [arguments addObject:@(argv[i])];
        struct area { void *address; size_t size; };
        const struct area **areas = dlsym(RTLD_DEFAULT, "wine_main_preload_info");
        if (!areas || (*areas)[0].address != (void *)0x1000 || (*areas)[0].size != 0x1fffff000 ||
            (*areas)[1].address != (void *)0x7ff000000000 || (*areas)[1].size != 0x001ff0000 || (*areas)[2].size) exit(90);
        int fd = atoi(getenv("YAAGL_TEST_FD"));
        if (write(fd, "kept", 4) != 4) exit(91);
        NSBundle *bundle = NSBundle.mainBundle;
        NSDictionary *record = @{
            @"arguments": arguments, @"pid": @(getpid()), @"executable": @(executable),
            @"cwd": NSFileManager.defaultManager.currentDirectoryPath,
            @"environment": NSProcessInfo.processInfo.environment,
            @"bundle": bundle.bundleIdentifier ?: @"",
            @"gameMode": [bundle objectForInfoDictionaryKey:@"LSSupportsGameMode"] ?: @NO,
        };
        NSData *json = [NSJSONSerialization dataWithJSONObject:record options:0 error:nil];
        write(1, json.bytes, json.length);
        exit(23);
    }
}
