//! Immutable import plans. Preparing, resolving and applying never writes a file.
use crate::{
    CandidateGroup, Code, ConflictReason, Error, Fingerprint, Library, Record, RecordId, Result,
    Signal, candidate_groups, evidence,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Decision {
    Same {
        incoming: RecordId,
        target: RecordId,
    },
    Keep {
        incoming: RecordId,
        target: RecordId,
    },
    Distinct {
        incoming: RecordId,
        key: String,
    },
    Skip {
        incoming: RecordId,
    },
}

impl Decision {
    fn incoming(&self) -> &RecordId {
        match self {
            Self::Same { incoming, .. }
            | Self::Keep { incoming, .. }
            | Self::Distinct { incoming, .. }
            | Self::Skip { incoming } => incoming,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    New,
    Unchanged,
    Duplicate,
    Enrich,
    Conflict,
    Skip,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct PlanItem {
    pub incoming: RecordId,
    pub target: Option<RecordId>,
    pub action: Action,
    pub conflicts: Vec<ConflictReason>,
    /// Fields that will fill gaps, not overwrite known values.
    pub added_fields: Vec<String>,
    /// Known values left unchanged; correction remains a separate explicit edit.
    pub differing_fields: Vec<String>,
    /// Candidate pairs remain available while switching import decisions.
    pub matches: Vec<ImportMatch>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ImportMatch {
    pub target: RecordId,
    pub in_project: bool,
    pub identical: bool,
    pub signals: Vec<Signal>,
    pub added_fields: Vec<String>,
    pub differing_fields: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImportPlan {
    base: Library,
    expected: Fingerprint,
    incoming: Vec<Record>,
    decisions: BTreeMap<RecordId, Decision>,
    items: Vec<PlanItem>,
    proposed: Option<Library>,
}

impl ImportPlan {
    pub fn prepare(base: &Library, incoming: &[Record]) -> Result<Self> {
        if incoming.len() > crate::MAX_RECORDS {
            return Err(Error::new(Code::LimitExceeded, "Too many incoming records"));
        }
        let mut incoming = incoming.to_vec();
        incoming.sort_by(|a, b| a.id().cmp(b.id()));
        let mut ids = BTreeSet::new();
        for record in &incoming {
            if !ids.insert(record.id()) || base.get(record.id()).is_some() {
                return Err(Error::new(
                    Code::DuplicateIdentity,
                    "Import identities must be fresh and unique",
                )
                .at(record.key(), None));
            }
        }
        let plan = Self {
            base: base.clone(),
            expected: base.fingerprint(),
            incoming,
            decisions: BTreeMap::new(),
            items: vec![],
            proposed: None,
        };
        plan.rebuild()
    }
    pub fn items(&self) -> &[PlanItem] {
        &self.items
    }
    pub fn blocked(&self) -> bool {
        self.proposed.is_none()
    }

    /// Decisions target fixed candidate identities. Old plans are not mutated.
    pub fn resolve(&self, decisions: &[Decision]) -> Result<Self> {
        let mut next = self.clone();
        let mut seen = BTreeSet::new();
        for decision in decisions {
            if !self.incoming.iter().any(|r| r.id() == decision.incoming())
                || !seen.insert(decision.incoming())
            {
                return Err(Error::new(
                    Code::InvalidDecision,
                    "Unknown or repeated incoming identity",
                ));
            }
            if let Decision::Distinct { key, .. } = decision {
                crate::model::valid_key(key)?;
            }
            next.decisions
                .insert(decision.incoming().clone(), decision.clone());
        }
        next.rebuild()
    }

    /// The caller publishes the returned library atomically within its document command.
    pub fn apply(&self, current: &Library) -> Result<Library> {
        if current.fingerprint() != self.expected {
            return Err(Error::new(
                Code::StaleBase,
                "Library changed since planning",
            ));
        }
        self.proposed.clone().ok_or_else(|| {
            Error::new(
                Code::UnresolvedConflict,
                "Import contains unresolved decisions",
            )
        })
    }

    fn rebuild(mut self) -> Result<Self> {
        let all = self
            .base
            .records()
            .iter()
            .cloned()
            .chain(self.incoming.iter().cloned())
            .collect::<Vec<_>>();
        let groups = candidate_groups(&all)?;
        let mut matches = import_matches(&self.base, &all, &groups, &self.incoming);
        let duplicates: BTreeMap<_, _> = matches
            .iter()
            .filter_map(|(incoming, matches)| {
                let mut identical = matches.iter().filter(|m| m.in_project && m.identical);
                let target = identical.next()?;
                identical
                    .next()
                    .is_none()
                    .then(|| (incoming.clone(), target.target.clone()))
            })
            .collect();
        let active = all
            .iter()
            .filter(|r| match self.decisions.get(r.id()) {
                Some(Decision::Skip { .. } | Decision::Distinct { .. } | Decision::Keep { .. }) => {
                    false
                }
                Some(Decision::Same { .. }) => true,
                None => !duplicates.contains_key(r.id()),
            })
            .cloned()
            .collect::<Vec<_>>();
        let default_groups = candidate_groups(&active)?;
        let mut executor = Executor {
            base: &self.base,
            incoming: &self.incoming,
            decisions: &self.decisions,
            groups: &groups,
            default_groups: &default_groups,
            duplicates: &duplicates,
            records: self.base.records().to_vec(),
            items: BTreeMap::new(),
            aliases: BTreeMap::new(),
            visiting: BTreeSet::new(),
        };
        for record in &self.incoming {
            executor.process(record.id())?;
        }
        self.items = executor.items.into_values().collect();
        for item in &mut self.items {
            item.matches = matches.remove(&item.incoming).unwrap_or_default();
        }
        self.proposed = if self.items.iter().any(|i| i.action == Action::Conflict) {
            None
        } else {
            Some(Library::new(executor.records)?)
        };
        Ok(self)
    }
}

struct Executor<'a> {
    base: &'a Library,
    incoming: &'a [Record],
    decisions: &'a BTreeMap<RecordId, Decision>,
    groups: &'a [CandidateGroup],
    default_groups: &'a [CandidateGroup],
    duplicates: &'a BTreeMap<RecordId, RecordId>,
    records: Vec<Record>,
    items: BTreeMap<RecordId, PlanItem>,
    aliases: BTreeMap<RecordId, Option<RecordId>>,
    visiting: BTreeSet<RecordId>,
}

impl Executor<'_> {
    fn process(&mut self, id: &RecordId) -> Result<Option<RecordId>> {
        if self.base.get(id).is_some() {
            return Ok(Some(id.clone()));
        }
        if let Some(alias) = self.aliases.get(id) {
            return Ok(alias.clone());
        }
        if !self.visiting.insert(id.clone()) {
            return Err(Error::new(
                Code::InvalidDecision,
                "Cyclic candidate decisions",
            ));
        }
        let incoming = self
            .incoming
            .iter()
            .find(|r| r.id() == id)
            .cloned()
            .ok_or_else(|| Error::new(Code::InvalidDecision, "Decision target is absent"))?;
        let group = self.groups.iter().find(|g| g.members.contains(id));
        let decision = self.decisions.get(id).cloned();
        let result = match decision {
            Some(Decision::Skip { .. }) => {
                self.item(&incoming, None, Action::Skip, vec![], vec![], vec![]);
                None
            }
            Some(Decision::Distinct { key, .. }) => self.add(&incoming, &key)?,
            Some(Decision::Keep { target, .. }) => {
                let same_key = self
                    .base
                    .get(&target)
                    .or_else(|| self.incoming.iter().find(|r| r.id() == &target))
                    .is_some_and(|r| r.key() == incoming.key());
                if &target == id
                    || (!same_key && group.is_none_or(|g| !g.members.contains(&target)))
                {
                    return Err(Error::new(
                        Code::InvalidDecision,
                        "Kept record is not an import candidate",
                    ));
                }
                let target = self.process(&target)?;
                if let Some(target) = &target {
                    self.item(
                        &incoming,
                        Some(target.clone()),
                        Action::Unchanged,
                        vec![],
                        vec![],
                        vec![],
                    );
                } else {
                    self.conflict(&incoming, vec![ConflictReason::AmbiguousTarget]);
                }
                target
            }
            Some(Decision::Same { target, .. }) => {
                if &target == id || group.is_none_or(|g| !g.members.contains(&target)) {
                    return Err(Error::new(
                        Code::InvalidDecision,
                        "Same-work target is not a candidate",
                    ));
                }
                self.merge(&incoming, &target)?
            }
            None if self.duplicates.contains_key(id) => {
                let target = self.duplicates[id].clone();
                self.item(
                    &incoming,
                    Some(target.clone()),
                    Action::Duplicate,
                    vec![],
                    vec![],
                    vec![],
                );
                Some(target)
            }
            None => {
                let group = self.default_groups.iter().find(|g| g.members.contains(id));
                if let Some(group) = group {
                    let targets = group
                        .members
                        .iter()
                        .filter(|id| self.base.get(id).is_some())
                        .cloned()
                        .collect::<Vec<_>>();
                    if !group.conflicts.is_empty() {
                        self.conflict(&incoming, group.conflicts.clone());
                        None
                    } else if targets.len() > 1 {
                        self.conflict(&incoming, vec![ConflictReason::AmbiguousTarget]);
                        None
                    } else if let Some(target) = targets.first() {
                        self.merge(&incoming, target)?
                    } else {
                        // Explicit exclusions/distinct choices partition the default group.
                        let representative = group
                            .members
                            .iter()
                            .find(|other| !self.decisions.contains_key(*other))
                            .cloned()
                            .unwrap_or_else(|| id.clone());
                        if &representative == id {
                            self.add(&incoming, incoming.key())?
                        } else {
                            self.merge(&incoming, &representative)?
                        }
                    }
                } else {
                    self.add(&incoming, incoming.key())?
                }
            }
        };
        self.visiting.remove(id);
        self.aliases.insert(id.clone(), result.clone());
        Ok(result)
    }

    fn item(
        &mut self,
        incoming: &Record,
        target: Option<RecordId>,
        action: Action,
        conflicts: Vec<ConflictReason>,
        added_fields: Vec<String>,
        differing_fields: Vec<String>,
    ) {
        self.items.insert(
            incoming.id().clone(),
            PlanItem {
                incoming: incoming.id().clone(),
                target,
                action,
                conflicts,
                added_fields,
                differing_fields,
                matches: vec![],
            },
        );
    }
    fn conflict(&mut self, incoming: &Record, reasons: Vec<ConflictReason>) {
        self.item(incoming, None, Action::Conflict, reasons, vec![], vec![]);
    }
    fn add(&mut self, incoming: &Record, key: &str) -> Result<Option<RecordId>> {
        if self.records.iter().any(|r| r.key() == key) {
            self.conflict(incoming, vec![ConflictReason::KeyCollision]);
            return Ok(None);
        }
        let record = incoming.renamed(&incoming.fingerprint(), key)?;
        self.records.push(record);
        self.item(
            incoming,
            Some(incoming.id().clone()),
            Action::New,
            vec![],
            vec![],
            vec![],
        );
        Ok(Some(incoming.id().clone()))
    }
    fn merge(&mut self, incoming: &Record, target: &RecordId) -> Result<Option<RecordId>> {
        let Some(target) = self.process(target)? else {
            self.conflict(incoming, vec![ConflictReason::AmbiguousTarget]);
            return Ok(None);
        };
        let position = self
            .records
            .iter()
            .position(|r| r.id() == &target)
            .ok_or_else(|| Error::new(Code::InvalidDecision, "Target has no planned record"))?;
        let existing = &self.records[position];
        let (mut record, fields, differences) = enrich(existing, incoming)?;
        for source in existing.provenance().iter().chain(incoming.provenance()) {
            record.add_provenance(source.clone());
        }
        self.records[position] = record;
        self.item(
            incoming,
            Some(target.clone()),
            if fields.is_empty() {
                Action::Unchanged
            } else {
                Action::Enrich
            },
            vec![],
            fields,
            differences,
        );
        Ok(Some(target))
    }
}

fn import_matches(
    base: &Library,
    all: &[Record],
    groups: &[CandidateGroup],
    incoming: &[Record],
) -> BTreeMap<RecordId, Vec<ImportMatch>> {
    let by_id: BTreeMap<_, _> = all.iter().map(|record| (record.id(), record)).collect();
    let by_group: BTreeMap<_, _> = groups
        .iter()
        .flat_map(|group| group.members.iter().map(move |id| (id, &group.members)))
        .collect();
    let mut by_key: BTreeMap<_, Vec<_>> = BTreeMap::new();
    for record in all {
        by_key.entry(record.key()).or_default().push(record.id());
    }
    incoming
        .iter()
        .map(|incoming| {
            let related = by_group
                .get(incoming.id())
                .into_iter()
                .flat_map(|ids| ids.iter());
            let targets: BTreeSet<_> = related
                .chain(by_key[incoming.key()].iter().copied())
                .collect();
            let matches = targets
                .into_iter()
                .filter(|target| *target != incoming.id())
                .filter_map(|target| {
                    compare_match(incoming, by_id[target], base.get(target).is_some())
                })
                .collect();
            (incoming.id().clone(), matches)
        })
        .collect()
}

fn compare_match(incoming: &Record, target: &Record, in_project: bool) -> Option<ImportMatch> {
    let evidence = evidence(incoming, target);
    let signals = if evidence.refuted {
        vec![]
    } else {
        evidence.signals
    };
    if signals.is_empty() && incoming.key() != target.key() {
        return None;
    }
    let identical = incoming.native_value() == target.native_value()
        && incoming
            .retained_parents()
            .iter()
            .map(crate::model::canonical_entry)
            .eq(target
                .retained_parents()
                .iter()
                .map(crate::model::canonical_entry));
    let (added_fields, differing_fields) = if identical {
        (vec![], vec![])
    } else if signals.is_empty() {
        (vec![], gaps(target, incoming).2)
    } else {
        match enrich(target, incoming) {
            Ok((_, added, differences)) => (added, differences),
            Err(_) => (vec![], gaps(target, incoming).2),
        }
    };
    Some(ImportMatch {
        target: target.id().clone(),
        in_project,
        identical,
        signals,
        added_fields,
        differing_fields,
    })
}

fn gaps(existing: &Record, incoming: &Record) -> (Value, Vec<String>, Vec<String>) {
    let mut value = existing.native_value();
    let mut fields = vec![];
    let mut differences = vec![];
    fill_gaps(
        &mut value,
        &incoming.native_value(),
        "",
        &mut fields,
        &mut differences,
    );
    (value, fields, differences)
}

fn enrich(existing: &Record, incoming: &Record) -> Result<(Record, Vec<String>, Vec<String>)> {
    let (value, mut fields, differences) = gaps(existing, incoming);
    let mut record = existing.with_entry(value)?;
    let different_type = existing.entry().entry_type() != incoming.entry().entry_type();
    for parent in incoming
        .retained_parents()
        .iter()
        .chain(incoming.entry().parents().iter().filter(|_| different_type))
    {
        if !record.retained_parents.contains(parent) && !record.entry().parents().contains(parent) {
            record.retained_parents.push(parent.clone());
            if !fields.iter().any(|path| path == "/retained_parents") {
                fields.push("/retained_parents".into())
            }
        }
    }
    Ok((record, fields, differences))
}

fn empty(value: &Value) -> bool {
    value.is_null()
        || value.as_str().is_some_and(|v| v.trim().is_empty())
        || value.as_array().is_some_and(Vec::is_empty)
        || value.as_object().is_some_and(serde_json::Map::is_empty)
}

fn fill_gaps(
    existing: &mut Value,
    incoming: &Value,
    path: &str,
    added: &mut Vec<String>,
    differences: &mut Vec<String>,
) {
    if let (Some(existing), Some(incoming)) = (existing.as_object_mut(), incoming.as_object()) {
        for (field, value) in incoming {
            if field == "type" {
                if existing.get(field).is_some_and(|v| v != value) {
                    differences.push(format!("{path}/type"));
                }
                continue;
            }
            if field == "parent" && existing.get("type") != incoming.get("type") {
                differences.push(format!("{path}/parent"));
                continue;
            }
            if empty(value) {
                continue;
            }
            let child_path = format!("{path}/{field}");
            match existing.get_mut(field) {
                None => {
                    existing.insert(field.clone(), value.clone());
                    added.push(child_path);
                }
                Some(target) if empty(target) => {
                    *target = value.clone();
                    added.push(child_path);
                }
                Some(target) => fill_gaps(target, value, &child_path, added, differences),
            }
        }
    } else if let (Some(existing), Some(incoming)) = (existing.as_array_mut(), incoming.as_array())
    {
        if path.ends_with("/parent") {
            if existing.len() != incoming.len() {
                differences.push(path.into());
            }
            for (i, (target, source)) in existing.iter_mut().zip(incoming).enumerate() {
                // Container relations must match before filling their fields.
                if target.get("type") == source.get("type")
                    && target.get("title") == source.get("title")
                {
                    fill_gaps(target, source, &format!("{path}/{i}"), added, differences);
                } else if target != source {
                    differences.push(format!("{path}/{i}"));
                }
            }
        } else if existing != incoming {
            differences.push(path.into());
        }
    } else if existing != incoming {
        differences.push(path.into());
    }
}
