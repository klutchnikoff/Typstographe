//! Explicit, read-only network acquisition. No project state or publication authority.
mod cairn;
mod client;
mod crossref;
mod csl_json;
mod http;
mod input;
mod model;
mod native;
mod zbmath;
pub use client::Client;
pub use input::{cairn_identifier, doi};
pub use model::*;

#[cfg(test)]
mod tests;
