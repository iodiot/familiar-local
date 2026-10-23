#import <Cocoa/Cocoa.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) return 2;
        const NSInteger size = 1024;
        NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc]
            initWithBitmapDataPlanes:NULL
            pixelsWide:size pixelsHigh:size
            bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO
            colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];

        [NSGraphicsContext saveGraphicsState];
        NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
        NSGraphicsContext.currentContext.imageInterpolation = NSImageInterpolationHigh;

        NSRect bounds = NSMakeRect(0, 0, size, size);
        NSBezierPath *background = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(bounds, 24, 24)
            xRadius:220 yRadius:220];
        NSGradient *gradient = [[NSGradient alloc]
            initWithStartingColor:[NSColor colorWithCalibratedRed:0.48 green:0.35 blue:0.98 alpha:1]
            endingColor:[NSColor colorWithCalibratedRed:0.31 green:0.25 blue:0.76 alpha:1]];
        [gradient drawInBezierPath:background angle:135];

        [[NSColor colorWithWhite:1 alpha:0.10] setFill];
        [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(110, 500, 820, 820)] fill];

        CGFloat barWidth = 118, gap = 62;
        CGFloat heights[] = {310, 476, 310};
        CGFloat totalWidth = barWidth * 3 + gap * 2;
        CGFloat startX = (size - totalWidth) / 2;
        for (NSInteger index = 0; index < 3; index++) {
            CGFloat height = heights[index];
            NSRect bar = NSMakeRect(startX + index * (barWidth + gap), (size - height) / 2, barWidth, height);
            [[NSColor colorWithWhite:1 alpha:index == 1 ? 1 : 0.88] setFill];
            [[NSBezierPath bezierPathWithRoundedRect:bar xRadius:barWidth / 2 yRadius:barWidth / 2] fill];
        }

        [NSGraphicsContext restoreGraphicsState];
        NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        return [png writeToFile:[NSString stringWithUTF8String:argv[1]] atomically:YES] ? 0 : 1;
    }
}
