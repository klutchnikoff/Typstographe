//! Documentary dates: explicit values, with no clock or locale-dependent inference.
use chrono::NaiveDate;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum DateValue {
    Calendar {
        #[schemars(regex(pattern = r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"), extend("format" = "date"))]
        iso: String,
    },
    Custom {
        #[schemars(regex(pattern = r"^[^\u0000-\u001f\u007f-\u009f]+$"), extend("x-max-utf8-bytes" = 16000))]
        text: String,
    },
}
impl DateValue {
    /// Complete Gregorian dates only. Partial dates remain explicit custom text.
    pub fn calendar(iso: &str) -> Option<Self> {
        let value = Self::Calendar { iso: iso.into() };
        value.valid().then_some(value)
    }
    pub fn valid(&self) -> bool {
        match self {
            Self::Calendar { iso } => {
                iso.len() == 10
                    && iso.as_bytes()[4] == b'-'
                    && iso.as_bytes()[7] == b'-'
                    && iso.as_bytes()[..4]
                        .iter()
                        .copied()
                        .all(|b| b.is_ascii_digit())
                    && !iso.starts_with("0000")
                    && NaiveDate::parse_from_str(iso, "%Y-%m-%d")
                        .is_ok_and(|date| date.to_string() == *iso)
            }
            Self::Custom { text } => {
                !text.trim().is_empty()
                    && text.len() <= 16_000
                    && !text.chars().any(char::is_control)
            }
        }
    }
    pub fn typst(&self) -> String {
        match self {
            Self::Calendar { iso } => {
                use chrono::Datelike;
                let date = NaiveDate::parse_from_str(iso, "%Y-%m-%d").expect("validated date");
                format!(
                    "datetime(year: {}, month: {}, day: {})",
                    date.year(),
                    date.month(),
                    date.day()
                )
            }
            Self::Custom { text } => crate::document::typst_string(text),
        }
    }
}
impl<'de> Deserialize<'de> for DateValue {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(Deserialize)]
        #[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
        enum Raw {
            Calendar { iso: String },
            Custom { text: String },
        }
        let value = match Raw::deserialize(deserializer)? {
            Raw::Calendar { iso } => Self::Calendar { iso },
            Raw::Custom { text } => Self::Custom { text },
        };
        if value.valid() {
            Ok(value)
        } else {
            Err(serde::de::Error::custom("invalid documentary date"))
        }
    }
}

#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn complete_dates_are_strict_and_custom_text_is_never_inferred() {
        for iso in ["2024-02-29", "0001-01-01", "9999-12-31", "1875-01-19"] {
            assert!(
                serde_json::from_value::<DateValue>(json!({"kind":"calendar","iso":iso})).is_ok()
            );
        }
        for iso in [
            "2025-02-29",
            "2026-04-31",
            "2026-13-01",
            "2026-1-01",
            "0000-01-01",
            "today",
            " 2026-01-01",
            "éé-01-01",
        ] {
            assert!(
                serde_json::from_value::<DateValue>(json!({"kind":"calendar","iso":iso})).is_err(),
                "{iso}"
            );
        }
        for text in [
            "2026-11-03",
            "Novembre 2026",
            "Vers 1875",
            "Du 3 au 5 novembre",
            "today",
        ] {
            let date: DateValue =
                serde_json::from_value(json!({"kind":"custom","text":text})).unwrap();
            assert_eq!(date.typst(), crate::document::typst_string(text));
        }
        for value in [
            json!("2026-11-03"),
            json!({"kind":"custom","text":""}),
            json!({"kind":"custom","text":"\n"}),
            json!({"kind":"calendar","iso":"2026-11-03","text":"oops"}),
        ] {
            assert!(serde_json::from_value::<DateValue>(value).is_err());
        }
        assert_eq!(
            DateValue::calendar("2026-11-03").unwrap().typst(),
            "datetime(year: 2026, month: 11, day: 3)"
        );
    }
}
