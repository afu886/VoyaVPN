//! Certificate probe facade. Network and TLS I/O is owned by `voya-net`.

pub use voya_contracts::{CertificateFetchRequest, CertificateFetchResult};
pub use voya_net::certificates::{
    calculate_certificate_sha256, fetch_certificate, CertificateError, Result,
};
