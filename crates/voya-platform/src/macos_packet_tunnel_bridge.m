#import <Foundation/Foundation.h>
#import <NetworkExtension/NetworkExtension.h>
#import <dispatch/dispatch.h>
#import <stdlib.h>
#import <string.h>

static NSString *const VoyaAppGroupIdentifier = @"group.app.voyavpn.desktop";
static NSString *const VoyaProviderBundleIdentifier = @"app.voyavpn.desktop.PacketTunnel";
static NSString *const VoyaRuntimeConfigRelativePath = @"Library/Application Support/VoyaVPN/packet-tunnel-runtime.json";
static NSString *const VoyaLocalizedDescription = @"VoyaVPN";

static char *VoyaCopyCString(NSString *string) {
    const char *utf8 = [string UTF8String];
    if (utf8 == NULL) {
        utf8 = "";
    }
    return strdup(utf8);
}

static char *VoyaCopyError(NSError *error) {
    NSString *message = error.localizedDescription ?: @"unknown macOS PacketTunnel error";
    return VoyaCopyCString([@"error:" stringByAppendingString:message]);
}

static NSError *VoyaMakeError(NSString *message) {
    return [NSError errorWithDomain:@"VoyaVPNPacketTunnelBridge"
                               code:1
                           userInfo:@{NSLocalizedDescriptionKey: message}];
}

static void VoyaWait(dispatch_semaphore_t semaphore) {
    if (![NSThread isMainThread]) {
        dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
        return;
    }

    while (dispatch_semaphore_wait(semaphore, DISPATCH_TIME_NOW) != 0) {
        @autoreleasepool {
            NSDate *limit = [NSDate dateWithTimeIntervalSinceNow:0.05];
            [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:limit];
        }
    }
}

static NSArray<NETunnelProviderManager *> *VoyaLoadAllManagers(NSError **outError) {
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block NSArray<NETunnelProviderManager *> *loadedManagers = nil;
    __block NSError *loadedError = nil;

    [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:
        ^(NSArray<NETunnelProviderManager *> *managers, NSError *error) {
            loadedManagers = managers ?: @[];
            loadedError = error;
            dispatch_semaphore_signal(semaphore);
        }];
    VoyaWait(semaphore);

    if (loadedError != nil && outError != NULL) {
        *outError = loadedError;
    }
    return loadedError == nil ? loadedManagers : nil;
}

static void VoyaConfigureManager(NETunnelProviderManager *manager) {
    NETunnelProviderProtocol *proto = nil;
    if ([manager.protocolConfiguration isKindOfClass:[NETunnelProviderProtocol class]]) {
        proto = (NETunnelProviderProtocol *)manager.protocolConfiguration;
    } else {
        proto = [[NETunnelProviderProtocol alloc] init];
    }

    proto.providerBundleIdentifier = VoyaProviderBundleIdentifier;
    proto.serverAddress = VoyaLocalizedDescription;
    proto.providerConfiguration = @{
        @"runtimeConfigRelativePath": VoyaRuntimeConfigRelativePath,
        @"appGroupIdentifier": VoyaAppGroupIdentifier,
    };

    manager.localizedDescription = VoyaLocalizedDescription;
    manager.protocolConfiguration = proto;
}

static NETunnelProviderManager *VoyaLoadManager(BOOL createIfMissing, NSError **outError) {
    NSError *loadError = nil;
    NSArray<NETunnelProviderManager *> *managers = VoyaLoadAllManagers(&loadError);
    if (loadError != nil) {
        if (outError != NULL) {
            *outError = loadError;
        }
        return nil;
    }

    for (NETunnelProviderManager *manager in managers) {
        NETunnelProviderProtocol *proto = nil;
        if ([manager.protocolConfiguration isKindOfClass:[NETunnelProviderProtocol class]]) {
            proto = (NETunnelProviderProtocol *)manager.protocolConfiguration;
        }
        if ([proto.providerBundleIdentifier isEqualToString:VoyaProviderBundleIdentifier]) {
            VoyaConfigureManager(manager);
            return manager;
        }
    }

    if (!createIfMissing) {
        return nil;
    }

    NETunnelProviderManager *manager = [[NETunnelProviderManager alloc] init];
    VoyaConfigureManager(manager);
    return manager;
}

static BOOL VoyaSaveManager(NETunnelProviderManager *manager, NSError **outError) {
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block NSError *saveError = nil;

    [manager saveToPreferencesWithCompletionHandler:^(NSError *error) {
        saveError = error;
        dispatch_semaphore_signal(semaphore);
    }];
    VoyaWait(semaphore);

    if (saveError != nil && outError != NULL) {
        *outError = saveError;
    }
    return saveError == nil;
}

static BOOL VoyaReloadManager(NETunnelProviderManager *manager, NSError **outError) {
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block NSError *loadError = nil;

    [manager loadFromPreferencesWithCompletionHandler:^(NSError *error) {
        loadError = error;
        dispatch_semaphore_signal(semaphore);
    }];
    VoyaWait(semaphore);

    if (loadError != nil && outError != NULL) {
        *outError = loadError;
    }
    return loadError == nil;
}

static NSURL *VoyaRuntimeConfigURL(NSError **outError) {
    NSURL *container = [[NSFileManager defaultManager]
        containerURLForSecurityApplicationGroupIdentifier:VoyaAppGroupIdentifier];
    if (container == nil) {
        if (outError != NULL) {
            *outError = VoyaMakeError(@"VoyaVPN App Group container is unavailable.");
        }
        return nil;
    }
    return [container URLByAppendingPathComponent:VoyaRuntimeConfigRelativePath];
}

static BOOL VoyaWriteRuntimeConfig(NSString *configPath, NSString *profileId, NSError **outError) {
    if (![configPath hasPrefix:@"/"]) {
        if (outError != NULL) {
            *outError = VoyaMakeError(@"config path must be absolute");
        }
        return NO;
    }

    NSError *readError = nil;
    NSString *singboxConfigJson = [NSString stringWithContentsOfFile:configPath
                                                           encoding:NSUTF8StringEncoding
                                                              error:&readError];
    if (readError != nil) {
        if (outError != NULL) {
            *outError = readError;
        }
        return NO;
    }

    NSURL *destination = VoyaRuntimeConfigURL(outError);
    if (destination == nil) {
        return NO;
    }

    NSDictionary *runtimeConfig = @{
        @"version": @1,
        @"activeProfileId": profileId ?: [NSNull null],
        @"mainConfigPath": configPath,
        @"singboxConfigJson": singboxConfigJson ?: @"",
    };

    NSError *encodeError = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:runtimeConfig options:0 error:&encodeError];
    if (encodeError != nil) {
        if (outError != NULL) {
            *outError = encodeError;
        }
        return NO;
    }

    NSError *mkdirError = nil;
    BOOL created = [[NSFileManager defaultManager] createDirectoryAtURL:destination.URLByDeletingLastPathComponent
                                            withIntermediateDirectories:YES
                                                             attributes:nil
                                                                  error:&mkdirError];
    if (!created) {
        if (outError != NULL) {
            *outError = mkdirError;
        }
        return NO;
    }

    NSError *writeError = nil;
    BOOL written = [data writeToURL:destination options:NSDataWritingAtomic error:&writeError];
    if (!written && outError != NULL) {
        *outError = writeError;
    }
    return written;
}

char *voya_macos_packet_tunnel_status(void) {
    @autoreleasepool {
        NSError *error = nil;
        NETunnelProviderManager *manager = VoyaLoadManager(NO, &error);
        if (error != nil) {
            return VoyaCopyError(error);
        }
        if (manager == nil) {
            return VoyaCopyCString(@"permissionRequired");
        }

        switch (manager.connection.status) {
            case NEVPNStatusConnected:
                return VoyaCopyCString(@"running");
            case NEVPNStatusConnecting:
            case NEVPNStatusReasserting:
            case NEVPNStatusDisconnecting:
                return VoyaCopyCString(@"starting");
            case NEVPNStatusDisconnected:
            case NEVPNStatusInvalid:
                return VoyaCopyCString(@"stopped");
        }
        return VoyaCopyCString(@"error:unknown macOS PacketTunnel status");
    }
}

char *voya_macos_packet_tunnel_start(const char *config_path, const char *profile_id) {
    @autoreleasepool {
        if (config_path == NULL) {
            return VoyaCopyCString(@"error:missing config path");
        }

        NSString *configPath = [NSString stringWithUTF8String:config_path];
        NSString *profileId = profile_id != NULL ? [NSString stringWithUTF8String:profile_id] : nil;
        if (configPath == nil) {
            return VoyaCopyCString(@"error:config path is not valid UTF-8");
        }
        if (profile_id != NULL && profileId == nil) {
            return VoyaCopyCString(@"error:profile id is not valid UTF-8");
        }

        NSError *error = nil;
        if (!VoyaWriteRuntimeConfig(configPath, profileId, &error)) {
            return VoyaCopyError(error);
        }

        NETunnelProviderManager *manager = VoyaLoadManager(YES, &error);
        if (error != nil) {
            return VoyaCopyError(error);
        }
        if (manager == nil) {
            return VoyaCopyCString(@"error:VoyaVPN PacketTunnel manager is unavailable.");
        }

        manager.enabled = YES;
        if (!VoyaSaveManager(manager, &error)) {
            return VoyaCopyError(error);
        }
        if (!VoyaReloadManager(manager, &error)) {
            return VoyaCopyError(error);
        }

        if (![manager.connection isKindOfClass:[NETunnelProviderSession class]]) {
            return VoyaCopyCString(@"error:VoyaVPN PacketTunnel session is unavailable.");
        }
        NETunnelProviderSession *session = (NETunnelProviderSession *)manager.connection;
        if (![session startTunnelWithOptions:nil andReturnError:&error]) {
            return VoyaCopyError(error);
        }
        return VoyaCopyCString(@"ok");
    }
}

char *voya_macos_packet_tunnel_stop(void) {
    @autoreleasepool {
        NSError *error = nil;
        NETunnelProviderManager *manager = VoyaLoadManager(NO, &error);
        if (error != nil) {
            return VoyaCopyError(error);
        }
        if (manager != nil) {
            [manager.connection stopVPNTunnel];
        }
        return VoyaCopyCString(@"ok");
    }
}

void voya_macos_packet_tunnel_free(char *value) {
    free(value);
}
