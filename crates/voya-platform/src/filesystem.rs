//! Filesystem side effects shared by orchestration managers.

use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub fn write_file_with_parent(path: &Path, contents: impl AsRef<[u8]>) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)
}

pub fn remove_file_if_exists(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

pub fn remove_dir_all_if_exists(path: &Path) -> io::Result<()> {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

pub fn file_exists(path: &Path) -> io::Result<bool> {
    match fs::metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

/// Rejects a retired standalone configuration without modifying it.
pub fn reject_incompatible_config(path: &Path, expected_schema_version: u32) -> io::Result<()> {
    if !file_exists(path)? {
        return Ok(());
    }

    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        format!(
            "unsupported configuration at {}; expected database schema version {expected_schema_version}; remove it manually with: {}",
            path.display(),
            manual_remove_command(path),
        ),
    ))
}

#[cfg(windows)]
fn manual_remove_command(path: &Path) -> String {
    format!("Remove-Item -LiteralPath '{}'", path.display())
}

#[cfg(not(windows))]
fn manual_remove_command(path: &Path) -> String {
    format!("rm -- '{}'", path.display())
}

pub fn remove_matching_files(dir: &Path, prefix: &str, suffix: &str) -> io::Result<Vec<PathBuf>> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut removed = Vec::new();
    for entry in entries {
        let path = entry?.path();
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if file_name.starts_with(prefix) && file_name.ends_with(suffix) {
            remove_file_if_exists(&path)?;
            removed.push(path);
        }
    }
    Ok(removed)
}

pub fn stage_private_files(work_dir: &Path, files: &[(&Path, &str)]) -> io::Result<()> {
    fs::create_dir_all(work_dir)?;
    set_mode(work_dir, 0o700)?;
    for (path, contents) in files {
        fs::write(path, contents)?;
        set_mode(path, 0o600)?;
    }
    Ok(())
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: u32) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    #[test]
    fn incompatible_configuration_is_rejected_without_modification() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        let path = std::env::temp_dir().join(format!(
            "voya-incompatible-config-{}-{nonce}.json",
            std::process::id()
        ));
        let original = b"retired configuration";
        fs::write(&path, original).expect("test fixture should be writable");

        let error = reject_incompatible_config(&path, 1)
            .expect_err("retired configuration must be rejected");
        let message = error.to_string();
        assert!(message.contains(path.to_string_lossy().as_ref()));
        assert!(message.contains("schema version 1"));
        assert!(message.contains("remove it manually"));
        assert_eq!(
            fs::read(&path).expect("fixture must remain readable"),
            original
        );

        fs::remove_file(path).expect("test fixture should be removable");
    }
}
