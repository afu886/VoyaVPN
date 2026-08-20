mod manager;
mod profile_ex;

pub(crate) use manager::normalize_profile;
pub use manager::{ProfileManager, ProfileManagerError, Result};
pub use profile_ex::ProfileExManager;

const DEFAULT_PROFILE_SORT_STEP: i32 = 10;
