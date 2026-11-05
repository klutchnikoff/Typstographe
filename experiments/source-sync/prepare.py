"""Reuse the validated native comparison, checking complete maps and anchors too."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
variant = sys.argv[1]
prior = ROOT / 'experiments/ui-refresh/prepare.py'
code = prior.read_text().replace('ui-refresh-', 'source-sync-')
exec(compile(code, str(prior), 'exec'), {'__file__': str(prior), '__name__': '__main__'})
out = ROOT / f'output/source-sync-{variant}'
source = out / 'source'

def replace(path, old, new):
    p = source / path
    s = p.read_text()
    assert s.count(old) == 1, (path, old)
    p.write_text(s.replace(old, new))

# Hash every UTF-16 mapping range, not only the sampled navigation positions.
# This verification is outside mapMs but remains in the end-to-end measurement.
replace('app/src-tauri/src/main.rs', '        let map_ms = ms(map_started);', '''        let map_ms = ms(map_started);
        let verification_started = std::time::Instant::now();
        let map_signature = format!("{:032x}", typst::utils::hash128(&(&map.characters, map.source_len)));
        let map_check_ms = ms(verification_started);''')
replace('app/src-tauri/src/main.rs', '"mapMs":map_ms,', '"mapMs":map_ms,"mapSignature":map_signature,"mapCheckMs":map_check_ms,')
# Complete source ranges and transformed geometry, with no temporary anchor copy.
# Leave eager link-frame preparation in place: no cost is deferred to the click.
replace('crates/core/src/navigation.rs', '        Self {\n            revision,\n            world,', '''        use std::hash::{Hash, Hasher};
        struct Signature<'a>(&'a [Anchor]);
        impl Hash for Signature<'_> {
            fn hash<H: Hasher>(&self, hasher: &mut H) {
                self.0.len().hash(hasher);
                for a in self.0 {
                    a.source.hash(hasher);
                    a.point.hash(hasher);
                    a.page.hash(hasher);
                    a.corners.hash(hasher);
                }
            }
        }
        let verification_started = std::time::Instant::now();
        let signature = format!("{:032x}", typst::utils::hash128(&Signature(&anchors)));
        crate::preview_profile::record(serde_json::json!({"stage":"sync-index", "signature":signature,
            "anchors":anchors.len(), "verificationMs":crate::preview_profile::ms(verification_started)}));
        Self {
            revision,
            world,''')
m = json.loads((out / 'manifest.json').read_text())
m.update(scope='Native source-map and synchronization indexing comparison')
(out / 'manifest.json').write_text(json.dumps(m, indent=2) + '\n')
