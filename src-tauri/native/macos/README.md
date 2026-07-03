# macOS Native Tunnel

VoyaVPN's macOS transparent tunnel is designed to match the system VPN model
used by clients such as V2Box.

Runtime shape:

- Containing app bundle id: `app.voyavpn.desktop`
- PacketTunnel extension bundle id: `app.voyavpn.desktop.PacketTunnel`
- App Group: `group.app.voyavpn.desktop`
- Runtime config file: `Library/Application Support/VoyaVPN/packet-tunnel-runtime.json`

The Tauri app writes the generated sing-box JSON into the App Group container
and starts the VPN profile in-process through NetworkExtension. The extension
then owns the packet tunnel and runs the sing-box Apple/libbox runtime linked
into or embedded with the PacketTunnel extension.

Build commands:

```sh
pnpm native:macos:libbox
pnpm native:macos:tunnel
pnpm native:macos:tunnel:verify
```

`pnpm native:macos:libbox` clones the pinned sing-box source tag and builds the
Apple `Libbox.xcframework`. By default it stages the framework at
`src-tauri/native/macos/Frameworks/Libbox.xcframework`. Override the source or
destination with:

- `VOYAVPN_SING_BOX_REF`: sing-box git ref, defaults to the app's pinned
  sing-box version.
- `VOYAVPN_SING_BOX_SOURCE_DIR`: local sing-box source checkout.
- `VOYAVPN_LIBBOX_XCFRAMEWORK`: existing or target `Libbox.xcframework` path.

`pnpm native:macos:tunnel` stages:

- `VoyaVPN.app/Contents/PlugIns/app.voyavpn.desktop.PacketTunnel.appex`
- `VoyaVPN.app/Contents/PlugIns/app.voyavpn.desktop.PacketTunnel.appex/Contents/Frameworks/Libbox.framework`
  only when the selected `Libbox.xcframework` slice is a dynamic framework.

`voyavpn-macos-tunnelctl` is no longer bundled by default because App
Store/TestFlight provisioning applies to app bundles and extensions, not a loose
helper executable with restricted NetworkExtension entitlements. Set
`VOYAVPN_BUILD_MACOS_TUNNEL_HELPER=1` only for local development experiments.

When the selected `Libbox.framework` slice is static, the script links Libbox
symbols into `VoyaPacketTunnel` and intentionally does not embed a framework in
the extension bundle.

By default the staged app bundle is
`target/native/macos/VoyaVPN.app`. To inject the native tunnel into a real Tauri
bundle, set:

```sh
export VOYAVPN_MACOS_APP_BUNDLE="$PWD/target/release/bundle/macos/VoyaVPN.app"
pnpm native:macos:tunnel
```

Set `VOYAVPN_CODESIGN_IDENTITY` to codesign the staged dynamic Libbox framework
when present and the extension. The final App Store/TestFlight lane must sign
the containing app with `src-tauri/entitlements/macos-app.plist` and the
extension with `src-tauri/entitlements/packet-tunnel.plist`.

Provisioning profiles are discovered from `VOYAVPN_PROVISIONING_PROFILE_DIR`
when set, otherwise from `../docs/certs` when that directory exists. Override
individual profiles with:

- `VOYAVPN_MACOS_APP_PROVISIONING_PROFILE`
- `VOYAVPN_PACKET_TUNNEL_PROVISIONING_PROFILE`

When profiles are present, `pnpm native:macos:tunnel` embeds them as
`Contents/embedded.provisionprofile` in the containing app and PacketTunnel
extension and generates signing entitlements from the profile app identifiers.
Set `VOYAVPN_REQUIRE_PROVISIONING=1` in App Store/TestFlight lanes so missing or
mismatched profiles fail the build.

Release signing and notarization helpers:

```sh
pnpm native:macos:app:sign
pnpm native:macos:app:notarize
```

`native:macos:app:notarize` uses `VOYAVPN_NOTARY_KEYCHAIN_PROFILE` when set, or
`VOYAVPN_NOTARY_APPLE_ID`, `VOYAVPN_NOTARY_TEAM_ID`, and
`VOYAVPN_NOTARY_PASSWORD`. Do not commit these values.

Provisioning requirements:

- App ID: `app.voyavpn.desktop`
- Extension App ID: `app.voyavpn.desktop.PacketTunnel`
- App Group: `group.app.voyavpn.desktop`
- Network Extension capability with `packet-tunnel-provider` for the containing
  app and the PacketTunnel extension.

`pnpm native:macos:tunnel:verify` checks the staged app and PacketTunnel
extension, either static Libbox symbols or an embedded dynamic
`Libbox.framework`, embedded provisioning profiles when present, code
signatures, and required entitlement strings. Set `VOYAVPN_REQUIRE_LIBBOX=1`,
`VOYAVPN_REQUIRE_CODESIGN=1`, or
`VOYAVPN_REQUIRE_PROVISIONING=1` to make those checks hard failures in release
lanes.

If `Libbox.xcframework` is absent, the PacketTunnel provider still builds but
fails closed at runtime with a clear "requires the sing-box Apple/libbox
runtime" error. It does not report a connected VPN without an active sing-box
runtime.
