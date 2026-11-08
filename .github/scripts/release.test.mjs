import assert from 'node:assert/strict'
import { cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { assetName, assemble, bundleDirectory, cleanBundles, collect } from './release-assets.mjs'
import { context, platforms, releasePlan, versionsAt } from './release-plan.mjs'
import { checkRelease, github, publish } from './release-publish.mjs'

const commit = 'a'.repeat(40),
  version = '0.1.0'
const ctx = { tag: `v${version}`, version, commit, repo: 'owner/editor' }
const tagged = {
  versions: [version, version, version],
  ref: ctx.tag && `refs/tags/${ctx.tag}`,
  commit,
  tagCommit: commit,
}

async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'typstographe-release-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function installers(root) {
  for (const p of platforms) {
    for (const [format, extension] of p.files) {
      const directory = join(bundleDirectory(root, p.id), format)
      await mkdir(directory, { recursive: true })
      await writeFile(
        join(directory, `Typstographe_${version}_fixture${extension}`),
        `installer for ${p.id} / ${format}`,
      )
      await writeFile(join(directory, `Typstographe_0.0.9_old${extension}`), 'old cached version')
      await writeFile(
        join(directory, `typstOgraphe_${version}_old${extension}`),
        'old product name',
      )
    }
    await collect(root, p.id, version, commit)
    await cp(
      join(root, 'output/packages', p.id),
      join(root, 'output/downloads', `installers-${p.id}`),
      { recursive: true },
    )
  }
}

function fakeGithub(release = null, remoteCommit = commit) {
  const commands = []
  return {
    commands,
    async api(path) {
      if (path.startsWith('git/ref/tags/')) return { object: { type: 'tag', sha: 'b'.repeat(40) } }
      if (path.startsWith('git/tags/')) return { object: { type: 'commit', sha: remoteCommit } }
      if (path.startsWith('releases/tags/')) return release
      throw new Error(`Unexpected API path: ${path}`)
    },
    async command(args) {
      commands.push(args)
    },
  }
}

test('only the exact versioned tag enables a draft; branch builds and acceptance checks do not', () => {
  assert.equal(releasePlan(tagged).publish, true)
  assert.equal(releasePlan(tagged).build_packages, true)
  const branch = {
    ...tagged,
    ref: 'refs/heads/main',
    event: 'workflow_dispatch',
    packages: true,
  }
  assert.equal(releasePlan(branch).build_packages, true)
  assert.equal(releasePlan(branch).publish, false)
  assert.equal(releasePlan({ ...branch, event: 'schedule' }).build_packages, false)
  for (const plan of [tagged, branch]) {
    assert.equal(releasePlan({ ...plan, acceptanceOnly: true }).publish, false)
    assert.equal(releasePlan({ ...plan, acceptanceOnly: true }).build_packages, false)
  }
})

test('version disagreement, invalid names and a moved tag fail before packaging', () => {
  for (const change of [
    { versions: [version, '0.2.0'] },
    { versions: [] },
    { versions: ['01.2.3'] },
    { versions: ['0.1.0-01'] },
    { versions: ['0.1.0\nignored'] },
    { versions: ['0.1.0\n'] },
    { ref: 'refs/tags/v0.2.0' },
    { commit: 'main' },
    { tagCommit: 'b'.repeat(40) },
  ])
    assert.throws(() => releasePlan({ ...tagged, ...change }))
  assert.equal(
    releasePlan({
      ...tagged,
      versions: ['0.2.0-rc.1'],
      ref: 'refs/tags/v0.2.0-rc.1',
    }).version,
    '0.2.0-rc.1',
  )
  assert.throws(() =>
    context({
      RELEASE_TAG: ctx.tag,
      RELEASE_VERSION: version,
      RELEASE_COMMIT: commit,
      GITHUB_REPOSITORY: '../invalid',
    }),
  )
})

test('Cargo, npm and Tauri versions are read from the real repository without compiling', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const versions = versionsAt(root)
  assert.ok(versions.length >= 4)
  assert.doesNotThrow(() => releasePlan({ ...tagged, versions, ref: 'refs/heads/test' }))
})

test('collection ignores old names and versions and assembly verifies the four hashes', async (t) => {
  const root = await temporary(t)
  await installers(root)
  const files = await assemble(root, version, commit)
  assert.equal(files.length, 6)
  const manifest = JSON.parse(
    await readFile(join(root, 'output/release', `Typstographe-${version}-manifest.json`)),
  )
  assert.equal(manifest.commit, commit)
  assert.equal(manifest.files.length, 4)
  assert.deepEqual(
    new Set(manifest.files.map((f) => f.platform)),
    new Set(platforms.map((p) => p.id)),
  )
  for (const file of manifest.files) assert.ok(file.name.startsWith(`Typstographe-${version}-`))
  const sums = await readFile(join(root, 'output/release/SHA256SUMS'), 'utf8')
  for (const file of manifest.files) assert.ok(sums.includes(`${file.sha256}  ${file.name}\n`))
})

test('missing, duplicate, empty and symlinked installers cannot be collected', async (t) => {
  const root = await temporary(t),
    id = 'windows-x86_64'
  const directory = join(bundleDirectory(root, id), 'nsis')
  await mkdir(directory, { recursive: true })
  await assert.rejects(collect(root, id, version, commit), /Expected one/)
  const file = join(directory, `Typstographe_${version}_x64-setup.exe`)
  await writeFile(file, '')
  await assert.rejects(collect(root, id, version, commit), /empty/)
  await writeFile(file, 'installer')
  const duplicate = join(directory, `Typstographe_${version}_other-setup.exe`)
  await writeFile(duplicate, 'duplicate')
  await assert.rejects(collect(root, id, version, commit), /found 2/)
  await rm(duplicate)
  await rm(file)
  const external = join(root, 'external')
  await writeFile(external, 'must not be packaged')
  await symlink(external, file)
  await assert.rejects(collect(root, id, version, commit), /non-regular/)
})

test('incomplete or mixed-commit downloads and modified bytes never become release assets', async (t) => {
  const root = await temporary(t)
  await installers(root)
  const dir = join(root, 'output/downloads/installers-windows-x86_64')
  const manifestPath = join(dir, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath))
  for (const change of [
    { commit: 'b'.repeat(40) },
    { version: '0.2.0' },
    { files: [] },
    { files: [{ name: '../../outside.exe' }] },
  ]) {
    await writeFile(manifestPath, JSON.stringify({ ...manifest, ...change }))
    await assert.rejects(assemble(root, version, commit))
  }
  await writeFile(manifestPath, JSON.stringify(manifest))
  await writeFile(join(dir, assetName(version, 'windows-x86_64', '-setup.exe')), 'tampered bytes')
  await assert.rejects(assemble(root, version, commit), /integrity mismatch/)
  await rm(dir, { recursive: true })
  await assert.rejects(assemble(root, version, commit), /ENOENT/)
  await assert.rejects(lstat(join(root, 'output/release')), /ENOENT/)
})

test('cleaning removes stale bundles without deleting compiled Cargo dependencies', async (t) => {
  const root = await temporary(t),
    id = 'linux-x86_64'
  const dir = bundleDirectory(root, id)
  const deps = join(dir, '../deps')
  await mkdir(dir, { recursive: true })
  await mkdir(deps)
  await writeFile(join(dir, 'old.deb'), 'old installer')
  await writeFile(join(deps, 'cached.rlib'), 'compiled dependency')
  await cleanBundles(root, id)
  await assert.rejects(lstat(dir), /ENOENT/)
  assert.equal(await readFile(join(deps, 'cached.rlib'), 'utf8'), 'compiled dependency')
})

test('published releases and moved tags refuse every write', async () => {
  for (const gh of [fakeGithub({ draft: false }), fakeGithub(null, 'c'.repeat(40))]) {
    await assert.rejects(publish(ctx, ['installer'], gh, 'notes.md'))
    assert.deepEqual(gh.commands, [])
  }
})

test('a missing release creates a draft; retries keep its notes and only upload assets', async () => {
  const gh = fakeGithub()
  await publish(ctx, ['one.dmg', 'two.exe'], gh, 'notes.md')
  assert.deepEqual(gh.commands, [
    [
      'release',
      'create',
      ctx.tag,
      '--verify-tag',
      '--draft',
      '--title',
      `Typstographe ${ctx.tag}`,
      '--notes-file',
      'notes.md',
    ],
    ['release', 'upload', ctx.tag, 'one.dmg', 'two.exe', '--clobber'],
  ])
  const existing = fakeGithub({ draft: true, body: 'User-edited notes' })
  await publish(ctx, ['installer'], existing, 'notes.md')
  assert.deepEqual(existing.commands, [['release', 'upload', ctx.tag, 'installer', '--clobber']])
})

test('read-only checks accept lightweight tags and propagate API errors', async () => {
  const gh = fakeGithub()
  gh.api = async (path) =>
    path.startsWith('git/ref/') ? { object: { type: 'commit', sha: commit } } : null
  assert.equal(await checkRelease(ctx, gh), null)
  gh.api = async () => {
    throw new Error('Access denied')
  }
  await assert.rejects(publish(ctx, ['installer'], gh, 'notes'), /Access denied/)
  assert.deepEqual(gh.commands, [])
})

test('only an explicit HTTP 404 is treated as a missing release', async () => {
  const absent = github(ctx.repo, () => {
    throw Object.assign(new Error('Not found'), {
      stderr: 'gh: Not Found (HTTP 404)',
    })
  })
  assert.equal(await absent.api('releases/tags/v0.1.0', true), null)
  await assert.rejects(absent.api('git/ref/tags/v0.1.0'))
  for (const error of ['gh: Forbidden (HTTP 403)', 'Connection failed']) {
    const denied = github(ctx.repo, () => {
      throw Object.assign(new Error(error), { stderr: error })
    })
    await assert.rejects(denied.api('releases/tags/v0.1.0', true))
  }
})
