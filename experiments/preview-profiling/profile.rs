//! Isolated timing records, never included in the normal application.
use serde_json::{Value, json};
use std::{
    cell::Cell,
    sync::{Mutex, OnceLock},
    time::Instant,
};
thread_local! { static REVISION: Cell<u64> = const { Cell::new(0) }; }
pub fn begin(revision: u64) {
    REVISION.set(revision);
}
pub fn cold() -> bool {
    static COLD: OnceLock<bool> = OnceLock::new();
    *COLD.get_or_init(|| std::env::var("TOG_PROFILE_CACHE").as_deref() == Ok("cold"))
}
static RECORDS: OnceLock<Mutex<Vec<Value>>> = OnceLock::new();
pub fn record(mut value: Value) {
    if value.get("revision").is_none() {
        value["revision"] = json!(REVISION.get());
    }
    RECORDS
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .push(value);
}
pub fn take() -> Vec<Value> {
    std::mem::take(&mut *RECORDS.get_or_init(Default::default).lock().unwrap())
}
pub fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.
}
