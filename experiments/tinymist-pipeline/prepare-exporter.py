"""Create the isolated corpus exporter without changing application dependencies."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
OUT=ROOT/'output/tinymist-pipeline/exporter'
if OUT.exists():raise SystemExit(f'Refusing to replace {OUT}')
(OUT/'src').mkdir(parents=True)
shutil.copyfile(HERE/'export.rs',OUT/'src/main.rs')
(OUT/'Cargo.toml').write_text('''[package]
name="typstographe-tinymist-corpus"
version="0.0.0"
edition="2024"
[workspace]
[dependencies]
typstographe-core={path="../../../crates/core"}
serde_json="1"
''')
lock=HERE/'exporter.lock'
shutil.copyfile(lock if lock.exists() else ROOT/'Cargo.lock',OUT/'Cargo.lock')
print(OUT)
