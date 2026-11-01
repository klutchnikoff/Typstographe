//! Structured MCP adapter. Documentary logic belongs to content::api in the core.
#![cfg_attr(coverage_nightly, feature(coverage_attribute))]
pub mod args;
pub mod discovery;
#[cfg(test)]
#[cfg_attr(coverage_nightly, coverage(off))]
mod discovery_tests;
pub mod local;
mod mcp;
pub mod targets;
pub use mcp::catalogue::{attached_command, attached_id, attached_step, attached_support, tools};
pub use mcp::{guide, instructions, serve};

pub use mcp::validation::check as validate_request;
