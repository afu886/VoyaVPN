use std::{env, path::PathBuf, process::Command};

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_macos_packet_tunnel_bridge();
    }
}

fn build_macos_packet_tunnel_bridge() {
    let out_dir = match env::var_os("OUT_DIR") {
        Some(value) => PathBuf::from(value),
        None => panic!("OUT_DIR is not set"),
    };
    let source = PathBuf::from("src/macos_packet_tunnel_bridge.m");
    let object = out_dir.join("macos_packet_tunnel_bridge.o");
    let archive = out_dir.join("libvoya_macos_packet_tunnel_bridge.a");

    println!("cargo:rerun-if-changed={}", source.display());

    let object_arg = path_arg(&object);
    let source_arg = path_arg(&source);
    run(
        "xcrun",
        &[
            "clang".to_string(),
            "-fobjc-arc".to_string(),
            "-fblocks".to_string(),
            "-mmacosx-version-min=10.15".to_string(),
            "-c".to_string(),
            source_arg,
            "-o".to_string(),
            object_arg.clone(),
        ],
    );
    run(
        "xcrun",
        &[
            "ar".to_string(),
            "crus".to_string(),
            path_arg(&archive),
            object_arg,
        ],
    );

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=voya_macos_packet_tunnel_bridge");
    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rustc-link-lib=framework=NetworkExtension");
    println!("cargo:rustc-link-lib=framework=SystemExtensions");
}

fn path_arg(path: &std::path::Path) -> String {
    path.to_string_lossy().into_owned()
}

fn run(program: &str, args: &[String]) {
    let status = match Command::new(program).args(args).status() {
        Ok(status) => status,
        Err(error) => panic!("failed to run {program}: {error}"),
    };
    if !status.success() {
        panic!("{program} {} failed with status {status}", args.join(" "));
    }
}
