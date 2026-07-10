//! SQLite and JSON persistence boundary for VoyaVPN.
//!
//! This crate owns the fresh schema, repository mapping, and the only place
//! where typed domain blobs become SQLite `TEXT`.

mod config_store;
mod database;
mod error;
mod repos;

pub use config_store::AppConfigStore;
pub use database::{Database, DATABASE_NAME};
pub use error::{blob, DbError, Result};
pub use repos::*;
