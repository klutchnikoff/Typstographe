//! Window-local visual bases. A returned frame is not an acknowledgement.
use crate::error::CommandError;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
    pub generation: String,
    pub epoch: String,
    pub version: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reference {
    pub generation: String,
    pub epoch: String,
    pub id: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub generation: String,
    pub epoch: String,
    pub version: u64,
    pub id: String,
    pub base: Option<String>,
    pub keys: Vec<String>,
}
pub struct Record {
    pub metadata: Metadata,
    pub sync: Arc<typstographe_core::navigation::RenderSync>,
}
struct Lifetime {
    valid: AtomicBool,
    version: AtomicU64,
    attempt: AtomicU64,
}
pub struct Ticket {
    pub scope: Scope,
    lifetime: Arc<Lifetime>,
    attempt: u64,
    pub base: Option<Arc<Record>>,
}
impl Ticket {
    pub fn current(&self) -> bool {
        self.lifetime.valid.load(Ordering::Acquire)
            && self.lifetime.version.load(Ordering::Acquire) == self.scope.version
            && self.lifetime.attempt.load(Ordering::Acquire) == self.attempt
    }
}
struct View {
    generation: String,
    epoch: String,
    lifetime: Arc<Lifetime>,
    displayed: Option<Arc<Record>>,
    candidate: Option<Arc<Record>>,
}
#[derive(Default)]
pub struct Views(HashMap<String, View>);
fn stale<T>() -> Result<T, CommandError> {
    Err("stale".into())
}
impl Views {
    pub fn detach(&mut self, peer: &str) {
        if let Some(view) = self.0.remove(peer) {
            view.lifetime.valid.store(false, Ordering::Release);
        }
    }
    pub fn bind(&mut self, peer: &str, generation: &str) -> String {
        if self.0.get(peer).is_some_and(|v| v.generation != generation) {
            self.detach(peer);
        }
        let view = self.0.entry(peer.into()).or_insert_with(|| View {
            generation: generation.into(),
            epoch: uuid::Uuid::new_v4().to_string(),
            lifetime: Arc::new(Lifetime {
                valid: AtomicBool::new(true),
                version: AtomicU64::new(0),
                attempt: AtomicU64::new(0),
            }),
            displayed: None,
            candidate: None,
        });
        view.epoch.clone()
    }
    fn view(&mut self, peer: &str, scope: &Scope) -> Result<&mut View, CommandError> {
        self.0
            .get_mut(peer)
            .filter(|v| v.generation == scope.generation && v.epoch == scope.epoch)
            .ok_or_else(|| "preview-epoch".into())
    }
    pub fn invalidate(&mut self, peer: &str, scope: &Scope) -> Result<(), CommandError> {
        self.view(peer, scope)?
            .lifetime
            .version
            .fetch_max(scope.version, Ordering::AcqRel);
        Ok(())
    }
    pub fn begin(
        &mut self,
        peer: &str,
        scope: Scope,
        base: Option<&str>,
    ) -> Result<Ticket, CommandError> {
        let view = self.view(peer, &scope)?;
        let previous = view
            .lifetime
            .version
            .fetch_max(scope.version, Ordering::AcqRel);
        if previous > scope.version {
            return stale();
        }
        // Only the next request's actually displayed id acknowledges a candidate.
        if let Some(candidate) = view
            .candidate
            .as_ref()
            .filter(|r| Some(r.metadata.id.as_str()) == base)
        {
            view.displayed = Some(candidate.clone());
        }
        let base = view
            .displayed
            .as_ref()
            .filter(|r| Some(r.metadata.id.as_str()) == base)
            .cloned();
        let attempt = view.lifetime.attempt.fetch_add(1, Ordering::AcqRel) + 1;
        Ok(Ticket {
            scope,
            lifetime: view.lifetime.clone(),
            attempt,
            base,
        })
    }
    pub fn commit(
        &mut self,
        peer: &str,
        ticket: &Ticket,
        record: Arc<Record>,
    ) -> Result<(), CommandError> {
        if !ticket.current()
            || record.metadata.generation != ticket.scope.generation
            || record.metadata.epoch != ticket.scope.epoch
            || record.metadata.version != ticket.scope.version
        {
            return stale();
        }
        self.view(peer, &ticket.scope)?.candidate = Some(record);
        Ok(())
    }
    pub fn sync(
        &self,
        peer: &str,
        frame: &Reference,
        revision: u64,
    ) -> Result<Arc<typstographe_core::navigation::RenderSync>, CommandError> {
        let view = self
            .0
            .get(peer)
            .filter(|v| v.generation == frame.generation && v.epoch == frame.epoch)
            .ok_or("stale")?;
        [&view.candidate, &view.displayed]
            .into_iter()
            .flatten()
            .find(|r| r.metadata.id == frame.id && r.sync.revision == revision)
            .map(|r| r.sync.clone())
            .ok_or_else(|| "stale".into())
    }
}
