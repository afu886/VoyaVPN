use std::env;

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_macos_packet_tunnel_bridge();
    }
}

fn build_macos_packet_tunnel_bridge() {
    let source = "native/macos_packet_tunnel_bridge.m";

    println!("cargo:rerun-if-changed={source}");

    cc::Build::new()
        .file(source)
        .flag("-fobjc-arc")
        .flag("-fblocks")
        .flag("-mmacosx-version-min=10.15")
        .compile("voya_macos_packet_tunnel_bridge");

    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rustc-link-lib=framework=NetworkExtension");
    println!("cargo:rustc-link-lib=framework=SystemExtensions");
}
