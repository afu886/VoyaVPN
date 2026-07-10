use std::{
    fs,
    path::{Path, PathBuf},
};

use voya_core::AppConfig;

use crate::{DbError, Result};

#[derive(Debug, Clone)]
pub struct AppConfigStore {
    path: PathBuf,
}

impl AppConfigStore {
    #[must_use]
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load(&self) -> Result<AppConfig> {
        if !self.path.exists() {
            return Ok(AppConfig::default());
        }

        let content = fs::read_to_string(&self.path).map_err(|source| DbError::Io {
            path: self.path.clone(),
            source,
        })?;

        serde_json::from_str(&content).map_err(|source| DbError::Json {
            path: self.path.clone(),
            source,
        })
    }

    pub fn save(&self, config: &AppConfig) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|source| DbError::Io {
                path: parent.to_path_buf(),
                source,
            })?;
        }

        let content = serde_json::to_string_pretty(config).map_err(|source| DbError::Json {
            path: self.path.clone(),
            source,
        })?;
        let temp_path = self.path.with_extension("json.tmp");

        fs::write(&temp_path, content).map_err(|source| DbError::Io {
            path: temp_path.clone(),
            source,
        })?;
        match fs::rename(&temp_path, &self.path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                fs::remove_file(&self.path).map_err(|source| DbError::Io {
                    path: self.path.clone(),
                    source,
                })?;
                fs::rename(&temp_path, &self.path).map_err(|source| DbError::Io {
                    path: self.path.clone(),
                    source,
                })?;
            }
            Err(source) => {
                return Err(DbError::Io {
                    path: self.path.clone(),
                    source,
                });
            }
        }

        Ok(())
    }
}
