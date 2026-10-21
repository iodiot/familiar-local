#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AppDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) NSView *loadingView;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic, strong) NSProgressIndicator *spinner;
@property(nonatomic, strong) NSTask *serverTask;
@property(nonatomic, strong) NSTimer *pollTimer;
@property(nonatomic, assign) BOOL loadedChat;
@property(nonatomic, assign) BOOL pollInFlight;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

    NSRect frame = NSMakeRect(0, 0, 1120, 760);
    self.window = [[NSWindow alloc] initWithContentRect:frame
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Familiar";
    self.window.minSize = NSMakeSize(640, 480);
    [self.window center];

    self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self.window.contentView addSubview:self.webView];

    self.loadingView = [[NSView alloc] initWithFrame:self.window.contentView.bounds];
    NSView *loadingView = self.loadingView;
    loadingView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    loadingView.wantsLayer = YES;
    loadingView.layer.backgroundColor = [NSColor colorWithRed:0.98 green:0.98 blue:0.97 alpha:1.0].CGColor;

    NSTextField *title = [NSTextField labelWithString:@"familiar"];
    title.font = [NSFont systemFontOfSize:25 weight:NSFontWeightSemibold];
    title.textColor = [NSColor colorWithRed:0.35 green:0.32 blue:0.62 alpha:1.0];
    title.translatesAutoresizingMaskIntoConstraints = NO;

    self.statusLabel = [NSTextField labelWithString:@"Starting your local assistant…"];
    self.statusLabel.font = [NSFont systemFontOfSize:13];
    self.statusLabel.textColor = [NSColor secondaryLabelColor];
    self.statusLabel.translatesAutoresizingMaskIntoConstraints = NO;

    self.spinner = [[NSProgressIndicator alloc] initWithFrame:NSZeroRect];
    self.spinner.style = NSProgressIndicatorStyleSpinning;
    self.spinner.controlSize = NSControlSizeRegular;
    self.spinner.translatesAutoresizingMaskIntoConstraints = NO;
    [self.spinner startAnimation:nil];

    [loadingView addSubview:title];
    [loadingView addSubview:self.spinner];
    [loadingView addSubview:self.statusLabel];
    [NSLayoutConstraint activateConstraints:@[
        [title.centerXAnchor constraintEqualToAnchor:loadingView.centerXAnchor],
        [title.centerYAnchor constraintEqualToAnchor:loadingView.centerYAnchor constant:-38],
        [self.spinner.centerXAnchor constraintEqualToAnchor:loadingView.centerXAnchor],
        [self.spinner.topAnchor constraintEqualToAnchor:title.bottomAnchor constant:20],
        [self.statusLabel.centerXAnchor constraintEqualToAnchor:loadingView.centerXAnchor],
        [self.statusLabel.topAnchor constraintEqualToAnchor:self.spinner.bottomAnchor constant:14]
    ]];
    [self.window.contentView addSubview:loadingView positioned:NSWindowAbove relativeTo:nil];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    [self startLocalServer];
    self.pollTimer = [NSTimer scheduledTimerWithTimeInterval:0.4 target:self selector:@selector(checkServer:) userInfo:nil repeats:YES];
}

- (void)startLocalServer {
    NSURL *helperURL = [[[NSBundle mainBundle] bundleURL] URLByAppendingPathComponent:@"Contents/Helpers/apple-fm-chat"];
    if (![[NSFileManager defaultManager] isExecutableFileAtPath:helperURL.path]) {
        self.statusLabel.stringValue = @"The local assistant helper is missing from this app.";
        [self.spinner stopAnimation:nil];
        return;
    }

    self.serverTask = [[NSTask alloc] init];
    self.serverTask.executableURL = helperURL;
    self.serverTask.standardOutput = [NSFileHandle fileHandleWithNullDevice];
    self.serverTask.standardError = [NSFileHandle fileHandleWithNullDevice];
    NSError *error = nil;
    if (![self.serverTask launchAndReturnError:&error]) {
        self.statusLabel.stringValue = [NSString stringWithFormat:@"Could not start the local assistant: %@", error.localizedDescription];
        [self.spinner stopAnimation:nil];
    }
}

- (void)checkServer:(NSTimer *)timer {
    if (self.loadedChat || self.pollInFlight) return;
    self.pollInFlight = YES;
    NSURL *url = [NSURL URLWithString:@"http://127.0.0.1:8787/api/status"];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:1.0];
    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            self.pollInFlight = NO;
            if (error || ![response isKindOfClass:[NSHTTPURLResponse class]] || ((NSHTTPURLResponse *)response).statusCode != 200) return;
            self.loadedChat = YES;
            [self.pollTimer invalidate];
            [self.spinner stopAnimation:nil];
            [self.loadingView removeFromSuperview];
            [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"http://127.0.0.1:8787/"]]];
        });
    }];
    [task resume];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }

- (void)applicationWillTerminate:(NSNotification *)notification {
    [self.pollTimer invalidate];
    if (self.serverTask.isRunning) [self.serverTask terminate];
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
