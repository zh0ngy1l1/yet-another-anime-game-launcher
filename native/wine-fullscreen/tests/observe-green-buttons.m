/* Separate coverage: use the ordinary green button for every entry AND exit.
 * Keep the historical comparison observer byte-for-byte unchanged.
 */
#import <Cocoa/Cocoa.h>
@interface NSWindow (GreenButtonFixture)
- (void)fixtureClickGreenButton:(id)sender;
@end
@implementation NSWindow (GreenButtonFixture)
- (void)fixtureClickGreenButton:(id)sender
{
    [[self standardWindowButton:NSWindowZoomButton] performClick:sender];
}
@end
#define toggleFullScreen fixtureClickGreenButton
#include "observe-fullscreen.m"
#undef toggleFullScreen
