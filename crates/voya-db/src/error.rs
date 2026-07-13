use std::path::PathBuf;

use sqlx::migrate::MigrateError;
use thiserror::Error;

pub mod blob {
    use serde::{de::DeserializeOwned, Serialize};
    use thiserror::Error;
    use voya_core::{ProtocolExtraItem, RulesItem, TransportExtraItem};

    #[derive(Debug, Error)]
    pub enum BlobError {
        #[error("failed to serialize {type_name}: {source}")]
        Serialize {
            type_name: &'static str,
            #[source]
            source: serde_json::Error,
        },
        #[error("failed to deserialize {type_name}: {source}")]
        Deserialize {
            type_name: &'static str,
            #[source]
            source: serde_json::Error,
        },
    }

    pub fn protocol_extra_to_text(value: &ProtocolExtraItem) -> Result<String, BlobError> {
        to_text("ProtocolExtraItem", value)
    }

    pub fn protocol_extra_from_text(value: &str) -> Result<ProtocolExtraItem, BlobError> {
        from_text_or_default("ProtocolExtraItem", value)
    }

    pub fn transport_extra_to_text(value: &TransportExtraItem) -> Result<String, BlobError> {
        to_text("TransportExtraItem", value)
    }

    pub fn transport_extra_from_text(value: &str) -> Result<TransportExtraItem, BlobError> {
        from_text_or_default("TransportExtraItem", value)
    }

    pub fn rules_to_text(value: &[RulesItem]) -> Result<String, BlobError> {
        to_text("RulesItem[]", value)
    }

    pub fn rules_from_text(value: &str) -> Result<Vec<RulesItem>, BlobError> {
        if value.trim().is_empty() {
            return Ok(Vec::new());
        }

        serde_json::from_str(value).map_err(|source| BlobError::Deserialize {
            type_name: "RulesItem[]",
            source,
        })
    }

    fn to_text<T>(type_name: &'static str, value: &T) -> Result<String, BlobError>
    where
        T: Serialize + ?Sized,
    {
        serde_json::to_string(value).map_err(|source| BlobError::Serialize { type_name, source })
    }

    fn from_text_or_default<T>(type_name: &'static str, value: &str) -> Result<T, BlobError>
    where
        T: DeserializeOwned + Default,
    {
        if value.trim().is_empty() {
            return Ok(T::default());
        }

        serde_json::from_str(value).map_err(|source| BlobError::Deserialize { type_name, source })
    }

    #[cfg(test)]
    mod tests {
        use voya_core::{MultipleLoad, ProtocolExtraItem, TransportExtraItem};

        use super::*;

        #[test]
        fn protocol_and_transport_extras_are_text_only_at_blob_boundary() {
            let proto = ProtocolExtraItem {
                flow: Some("xtls-rprx-vision".to_string()),
                multiple_load: Some(MultipleLoad::RoundRobin),
                ..ProtocolExtraItem::default()
            };
            let transport = TransportExtraItem {
                host: Some("example.com".to_string()),
                path: Some("/ws".to_string()),
                ..TransportExtraItem::default()
            };

            let proto_text =
                protocol_extra_to_text(&proto).expect("database test operation should succeed");
            let transport_text = transport_extra_to_text(&transport)
                .expect("database test operation should succeed");

            assert_eq!(
                proto_text,
                r#"{"Flow":"xtls-rprx-vision","MultipleLoad":3}"#
            );
            assert_eq!(transport_text, r#"{"Host":"example.com","Path":"/ws"}"#);
            assert_eq!(
                protocol_extra_from_text(&proto_text)
                    .expect("database test operation should succeed"),
                proto
            );
            assert_eq!(
                transport_extra_from_text(&transport_text)
                    .expect("database test operation should succeed"),
                transport
            );
            assert_eq!(
                protocol_extra_from_text("").expect("database test operation should succeed"),
                ProtocolExtraItem::default()
            );
        }
    }
}

pub type Result<T> = std::result::Result<T, DbError>;

#[derive(Debug, Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migrate(#[from] MigrateError),
    #[error(transparent)]
    Blob(#[from] blob::BlobError),
    #[error("invalid {enum_name} discriminant {value} in database")]
    InvalidEnum { enum_name: &'static str, value: i32 },
    #[error("filesystem error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("JSON config error at {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}
