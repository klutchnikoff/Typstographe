//! Single error type returned by the Tauri commands and the native agent bridge.
//!
//! Wire shape (IPC, STDIO recipe driver):
//! - [`CommandError::Message`] serializes as a JSON string, already localized when it
//!   comes from a catalogue;
//! - [`CommandError::Content`] serializes as the typed content-contract payload
//!   (`{"code": "stale_revision", …}`), nested causes included;
//! - [`CommandError::Protocol`] serializes as `api::error_value` of the core protocol
//!   error (`{"code": …, "params": …}` or the embedded content payload).
//!
//! `Display` keeps the historical text: the message itself, or the compact JSON payload.
use serde::{Serialize, Serializer};
use typstographe_core::{
    content::{api, archive, contract},
    errors::CoreError,
    protocol,
};

#[derive(Debug, PartialEq, thiserror::Error)]
pub enum CommandError {
    #[error("{0}")]
    Message(String),
    #[error("{}", payload(.0))]
    Content(contract::Error),
    #[error("{}", payload(&api::error_value(.0)))]
    Protocol(protocol::CommandError),
}

fn payload(value: &impl Serialize) -> String {
    serde_json::to_string(value).unwrap_or_else(|error| error.to_string())
}

impl CommandError {
    /// Plain message from any `Display` failure (the historical `e.to_string()`).
    pub fn message(error: impl std::fmt::Display) -> Self {
        Self::Message(error.to_string())
    }
    /// Localized text of a content-contract error, for messages shown as-is.
    pub fn localized_content(error: contract::Error) -> Self {
        Self::Message(typstographe_i18n::content_error(&error))
    }
    /// Localized text of a protocol error, for messages shown as-is.
    pub fn localized_protocol(error: protocol::CommandError) -> Self {
        Self::Message(typstographe_i18n::command_error(&error))
    }
    /// Localized text of a core error, for messages shown as-is.
    pub fn localized_core(error: CoreError) -> Self {
        Self::Message(typstographe_i18n::error(&error))
    }
    /// Localized text of an archive error, for messages shown as-is.
    pub fn localized_archive(error: archive::Error) -> Self {
        Self::Message(typstographe_i18n::archive_error(&error))
    }
    /// Machine-readable code of a typed error; plain messages carry none.
    #[cfg(test)]
    pub fn code(&self) -> Option<String> {
        match self {
            Self::Message(_) => None,
            Self::Content(error) => serde_json::to_value(error).ok(),
            Self::Protocol(error) => Some(api::error_value(error)),
        }
        .and_then(|value| value["code"].as_str().map(str::to_owned))
    }
}

impl Serialize for CommandError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Message(message) => serializer.serialize_str(message),
            Self::Content(error) => error.serialize(serializer),
            Self::Protocol(error) => api::error_value(error).serialize(serializer),
        }
    }
}

impl From<contract::Error> for CommandError {
    fn from(error: contract::Error) -> Self {
        Self::Content(error)
    }
}
impl From<protocol::CommandError> for CommandError {
    fn from(error: protocol::CommandError) -> Self {
        Self::Protocol(error)
    }
}
impl From<String> for CommandError {
    fn from(message: String) -> Self {
        Self::Message(message)
    }
}
impl From<&str> for CommandError {
    fn from(message: &str) -> Self {
        Self::Message(message.into())
    }
}
impl<T> From<std::sync::PoisonError<T>> for CommandError {
    fn from(error: std::sync::PoisonError<T>) -> Self {
        Self::message(error)
    }
}

/// Foreign failures that the Tauri layer has always reported by their `Display` text.
macro_rules! message_from {
    ($($error:ty),* $(,)?) => {$(
        impl From<$error> for CommandError {
            fn from(error: $error) -> Self {
                Self::message(error)
            }
        }
    )*};
}
message_from!(
    std::io::Error,
    std::num::TryFromIntError,
    std::time::SystemTimeError,
    serde_json::Error,
    base64::DecodeError,
    png::EncodingError,
    tokio::sync::oneshot::error::RecvError,
    tauri::Error,
);

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn messages_stay_plain_strings_and_typed_errors_stay_structured() {
        assert_eq!(
            serde_json::to_value(CommandError::from("stale")).unwrap(),
            json!("stale")
        );
        let stale = CommandError::from(contract::Error::StaleRevision {
            expected: 1,
            actual: 2,
        });
        assert_eq!(
            serde_json::to_value(&stale).unwrap(),
            json!({"code":"stale_revision","expected":1,"actual":2})
        );
        assert_eq!(
            stale.to_string(),
            r#"{"code":"stale_revision","expected":1,"actual":2}"#
        );
        assert_eq!(stale.code().as_deref(), Some("stale_revision"));
        let nested = CommandError::from(contract::Error::BatchFailed {
            index: 1,
            cause: Box::new(contract::Error::WrongDocument),
        });
        assert_eq!(
            serde_json::to_value(&nested).unwrap(),
            json!({"code":"batch_failed","index":1,"cause":{"code":"wrong_document"}})
        );
        let protocol = CommandError::from(protocol::CommandError::invalid("x"));
        assert_eq!(
            serde_json::to_value(&protocol).unwrap(),
            api::error_value(&protocol::CommandError::invalid("x"))
        );
    }
}
