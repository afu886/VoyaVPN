use std::{
    fs, io,
    path::{Path, PathBuf},
};

use thiserror::Error;

pub const CONFIG_DIR_NAME: &str = "guiConfigs";
pub const BIN_DIR_NAME: &str = "bin";
pub const BIN_CONFIG_DIR_NAME: &str = "binConfigs";
pub const LOG_DIR_NAME: &str = "guiLogs";
pub const TEMP_DIR_NAME: &str = "guiTemps";
pub const CORE_SEED_RESOURCE_DIR_NAME: &str = "core-seeds";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppPaths {
    app_dir: PathBuf,
    config_dir: PathBuf,
    bin_dir: PathBuf,
    bin_config_dir: PathBuf,
    log_dir: PathBuf,
    temp_dir: PathBuf,
}

impl AppPaths {
    #[must_use]
    pub fn new(app_dir: impl Into<PathBuf>) -> Self {
        let app_dir = app_dir.into();
        Self {
            config_dir: app_dir.join(CONFIG_DIR_NAME),
            bin_dir: app_dir.join(BIN_DIR_NAME),
            bin_config_dir: app_dir.join(BIN_CONFIG_DIR_NAME),
            log_dir: app_dir.join(LOG_DIR_NAME),
            temp_dir: app_dir.join(TEMP_DIR_NAME),
            app_dir,
        }
    }

    #[must_use]
    pub fn app_dir(&self) -> &Path {
        &self.app_dir
    }

    #[must_use]
    pub fn config_dir(&self) -> &Path {
        &self.config_dir
    }

    #[must_use]
    pub fn bin_dir(&self) -> &Path {
        &self.bin_dir
    }

    #[must_use]
    pub fn bin_config_dir(&self) -> &Path {
        &self.bin_config_dir
    }

    #[must_use]
    pub fn log_dir(&self) -> &Path {
        &self.log_dir
    }

    #[must_use]
    pub fn temp_dir(&self) -> &Path {
        &self.temp_dir
    }

    #[must_use]
    pub fn config_file(&self, file_name: impl AsRef<Path>) -> PathBuf {
        self.config_dir.join(file_name)
    }

    #[must_use]
    pub fn bin_config_file(&self, file_name: impl AsRef<Path>) -> PathBuf {
        self.bin_config_dir.join(file_name)
    }

    #[must_use]
    pub fn temp_file(&self, file_name: impl AsRef<Path>) -> PathBuf {
        self.temp_dir.join(file_name)
    }

    #[must_use]
    pub fn core_bin_dir(&self, core_type_dir: impl AsRef<Path>) -> PathBuf {
        self.bin_dir.join(core_type_dir)
    }

    #[must_use]
    pub fn core_bin_file(
        &self,
        core_type_dir: impl AsRef<Path>,
        file_name: impl AsRef<Path>,
    ) -> PathBuf {
        self.core_bin_dir(core_type_dir).join(file_name)
    }

    pub fn ensure_dirs(&self) -> Result<(), PathError> {
        for dir in [
            &self.app_dir,
            &self.config_dir,
            &self.bin_dir,
            &self.bin_config_dir,
            &self.log_dir,
            &self.temp_dir,
        ] {
            create_dir(dir)?;
        }
        Ok(())
    }
}

#[must_use]
pub fn core_seed_resources_dir(packaged_resources_dir: impl AsRef<Path>) -> PathBuf {
    packaged_resources_dir
        .as_ref()
        .join(CORE_SEED_RESOURCE_DIR_NAME)
}

#[must_use]
pub fn core_seed_resource_dir(
    core_seed_resources_dir: impl AsRef<Path>,
    core_type_dir: impl AsRef<Path>,
) -> PathBuf {
    core_seed_resources_dir.as_ref().join(core_type_dir)
}

#[derive(Debug, Error)]
pub enum PathError {
    #[error("failed to create directory {path}: {source}")]
    CreateDir { path: PathBuf, source: io::Error },
}

fn create_dir(path: &Path) -> Result<(), PathError> {
    fs::create_dir_all(path).map_err(|source| PathError::CreateDir {
        path: path.to_path_buf(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use std::env;

    use super::*;

    #[test]
    fn coreinfo_paths_keep_reference_directory_names() {
        let paths = AppPaths::new("/tmp/VoyaVPN");

        assert_eq!(paths.app_dir(), Path::new("/tmp/VoyaVPN"));
        assert_eq!(paths.config_dir(), Path::new("/tmp/VoyaVPN/guiConfigs"));
        assert_eq!(paths.bin_dir(), Path::new("/tmp/VoyaVPN/bin"));
        assert_eq!(paths.bin_config_dir(), Path::new("/tmp/VoyaVPN/binConfigs"));
        assert_eq!(paths.log_dir(), Path::new("/tmp/VoyaVPN/guiLogs"));
        assert_eq!(paths.temp_dir(), Path::new("/tmp/VoyaVPN/guiTemps"));
    }

    #[test]
    fn coreinfo_paths_locate_packaged_core_seed_resources() {
        let resources_dir = Path::new("/tmp/VoyaVPN.app/Contents/Resources");
        let seed_root = core_seed_resources_dir(resources_dir);

        assert_eq!(
            seed_root,
            Path::new("/tmp/VoyaVPN.app/Contents/Resources/core-seeds")
        );
        assert_eq!(
            core_seed_resource_dir(&seed_root, "sing_box"),
            Path::new("/tmp/VoyaVPN.app/Contents/Resources/core-seeds/sing_box")
        );
    }

    #[test]
    fn coreinfo_paths_ensure_required_directories() {
        let root = unique_temp_root("paths-ensure");
        let paths = AppPaths::new(root.join("VoyaVPN"));

        paths.ensure_dirs().expect("create app directories");

        assert!(paths.config_dir().is_dir());
        assert!(paths.bin_dir().is_dir());
        assert!(paths.bin_config_dir().is_dir());
        assert!(paths.log_dir().is_dir());
        assert!(paths.temp_dir().is_dir());

        let _ = fs::remove_dir_all(root);
    }

    fn unique_temp_root(name: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "voyavpn-{name}-{}-{}",
            std::process::id(),
            monotonic_nanos()
        ))
    }

    fn monotonic_nanos() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos())
    }
}
