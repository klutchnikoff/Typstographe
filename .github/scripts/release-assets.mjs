import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platforms, releasePlan } from './release-plan.mjs'

const productName = 'Typstographe'

function validate(version, commit) {
  releasePlan({ versions: [version], ref: 'refs/heads/packages', commit })
}

export async function fingerprint(path) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.size === 0)
    throw new Error(`Missing, empty or non-regular installer: ${path}`)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return { size: stat.size, sha256: hash.digest('hex') }
}

function platform(id) {
  const found = platforms.find((p) => p.id === id)
  if (!found) throw new Error(`Unknown installer platform: ${id}`)
  return found
}

export function bundleDirectory(root, id) {
  return join(root, 'target', platform(id).target, 'release', 'bundle')
}

export function assetName(version, id, extension) {
  return `${productName}-${version}-${id}${extension}`
}

export async function cleanBundles(root, id) {
  // Keep Cargo's compiled dependencies; remove only bundler output from old runs.
  await rm(bundleDirectory(root, id), { recursive: true, force: true })
}

export async function collect(root, id, version, commit) {
  validate(version, commit)
  const selected = platform(id)
  const directory = join(root, 'output/packages', id)
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  const files = []
  for (const [format, extension] of selected.files) {
    const source = join(bundleDirectory(root, id), format)
    const candidates = (await readdir(source)).filter(
      (name) => name.startsWith(`${productName}_${version}_`) && name.endsWith(extension),
    )
    if (candidates.length !== 1)
      throw new Error(`Expected one ${format} installer for ${version}, found ${candidates.length}`)
    const original = join(source, candidates[0])
    const name = assetName(version, id, extension)
    const metadata = await fingerprint(original)
    await copyFile(original, join(directory, name))
    files.push({ name, ...metadata })
  }
  const manifest = { schema: 1, platform: id, version, commit, files }
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export async function assemble(root, version, commit) {
  validate(version, commit)
  // Validate every platform before producing anything uploadable. This rejects
  // incomplete downloads, mixed commits and modified/stale installer bytes.
  const records = []
  for (const selected of platforms) {
    const directory = join(root, 'output/downloads', `installers-${selected.id}`)
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    if (
      manifest.schema !== 1 ||
      manifest.platform !== selected.id ||
      manifest.version !== version ||
      manifest.commit !== commit
    )
      throw new Error(`Installer provenance mismatch for ${selected.id}`)
    const names = selected.files
      .map(([, extension]) => assetName(version, selected.id, extension))
      .sort()
    if (
      !Array.isArray(manifest.files) ||
      JSON.stringify(manifest.files.map((file) => file.name).sort()) !== JSON.stringify(names)
    )
      throw new Error(`Incomplete or unexpected installer set for ${selected.id}`)
    for (const file of manifest.files) {
      const path = join(directory, file.name)
      const actual = await fingerprint(path)
      if (file.size !== actual.size || file.sha256 !== actual.sha256)
        throw new Error(`Installer integrity mismatch: ${file.name}`)
      records.push({ ...file, platform: selected.id, path })
    }
  }
  const directory = join(root, 'output/release')
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  const files = records.sort((a, b) => a.name.localeCompare(b.name))
  for (const file of files) await copyFile(file.path, join(directory, file.name))
  const manifestName = `${productName}-${version}-manifest.json`
  await writeFile(
    join(directory, manifestName),
    `${JSON.stringify(
      {
        schema: 1,
        version,
        commit,
        files: files.map(({ path, ...file }) => file),
      },
      null,
      2,
    )}\n`,
  )
  const manifest = await fingerprint(join(directory, manifestName))
  await writeFile(
    join(directory, 'SHA256SUMS'),
    [...files, { name: manifestName, ...manifest }]
      .map((file) => `${file.sha256}  ${file.name}\n`)
      .join(''),
  )
  return [
    ...files.map((file) => join(directory, file.name)),
    join(directory, manifestName),
    join(directory, 'SHA256SUMS'),
  ]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd(),
    id = process.env.INSTALLER_PLATFORM
  if (process.argv[2] === 'clean') await cleanBundles(root, id)
  else if (process.argv[2] === 'collect')
    console.log(
      JSON.stringify(
        await collect(root, id, process.env.RELEASE_VERSION, process.env.RELEASE_COMMIT),
        null,
        2,
      ),
    )
  else throw new Error('Expected clean or collect')
}
