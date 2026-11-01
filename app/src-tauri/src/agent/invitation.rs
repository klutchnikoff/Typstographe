//! Replace an invitation only after its durable local descriptor is written.
use super::{AgentState, agent_peer};
use crate::error::CommandError;
use crate::session::Session;
use std::{io::Write, path::Path, sync::Mutex};
use typstographe_mcp::local::Invitation;
pub(super) fn install(
    session: &Mutex<Session>,
    agent: &Mutex<AgentState>,
    root: &Path,
    invitation: &Invitation,
) -> Result<(), CommandError> {
    std::fs::create_dir_all(root)?;
    let options = atomic_write_file::AtomicWriteFile::options();
    #[cfg(unix)]
    let options = {
        use std::os::unix::fs::OpenOptionsExt;
        let mut options = options;
        options.mode(0o600);
        options
    };
    let mut out = options.open(root.join("invitation.json"))?;
    out.write_all(&serde_json::to_vec(invitation)?)?;
    out.commit()?;
    let mut session = session.lock()?;
    let mut agent = agent.lock()?;
    if let Some(owner) = &mut session.owner {
        owner.close(&agent_peer(&agent))?;
    }
    agent.token = Some(invitation.token.clone());
    agent.proposal = None;
    agent.seen.clear();
    Ok(())
}
