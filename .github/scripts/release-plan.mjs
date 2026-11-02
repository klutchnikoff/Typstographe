import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

export const platforms = [
  {
    id: 'linux-x86_64',
    os: 'ubuntu-22.04',
    target: 'x86_64-unknown-linux-gnu',
    rustTargets: 'x86_64-unknown-linux-gnu',
    bundles: 'deb,appimage',
    files: [
      ['deb', '.deb'],
      ['appimage', '.AppImage'],
    ],
  },
  {
    id: 'macos-universal',
    os: 'macos-latest',
    target: 'universal-apple-darwin',
    rustTargets: 'aarch64-apple-darwin x86_64-apple-darwin',
    bundles: 'dmg',
    files: [['dmg', '.dmg']],
  },
  {
    id: 'windows-x86_64',
    os: 'windows-latest',
    target: 'x86_64-pc-windows-msvc',
    rustTargets: 'x86_64-pc-windows-msvc',
    bundles: 'nsis',
    files: [['nsis', '-setup.exe']],
  },
]

export function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options }).trim()
}

export function versionsAt(root) {
  const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
  const lock = json('package-lock.json')
  // Cargo is the TOML parser; --no-deps also works with an empty Cargo cache.
  const cargo = JSON.parse(
    run('cargo', ['metadata', '--locked', '--offline', '--no-deps', '--format-version', '1'], {
      cwd: root,
    }),
  )
  return [
    json('package.json').version,
    json('app/package.json').version,
    json('app/src-tauri/tauri.conf.json').version,
    lock.version,
    lock.packages[''].version,
    lock.packages.app.version,
    ...cargo.packages.filter((p) => cargo.workspace_members.includes(p.id)).map((p) => p.version),
  ]
}

export function releasePlan({ versions, ref, commit, tagCommit, event, packages, acceptanceOnly }) {
  const version = versions[0]
  // Match SemVer, including prereleases, without accepting shell/path syntax.
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)'
  const semver = new RegExp(
    `^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
  )
  if (
    typeof version !== 'string' ||
    version !== version.trim() ||
    !semver.test(version) ||
    versions.some((v) => v !== version)
  )
    throw new Error('Cargo, npm and Tauri versions must agree on one SemVer version')
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('A full checked-out commit SHA is required')
  const tagged = ref.startsWith('refs/tags/')
  const tag = tagged ? ref.slice('refs/tags/'.length) : ''
  if (tagged && tag !== `v${version}`) throw new Error('The tag must match the application version')
  if (tagged && tagCommit !== commit)
    throw new Error('The tag does not identify the checked-out commit')
  return {
    version,
    commit,
    tag,
    publish: tagged && !acceptanceOnly,
    build_packages: !acceptanceOnly && (tagged || (event === 'workflow_dispatch' && packages)),
    matrix: { include: platforms },
  }
}

export function context(env = process.env) {
  const {
    RELEASE_TAG: tag,
    RELEASE_VERSION: version,
    RELEASE_COMMIT: commit,
    GITHUB_REPOSITORY: repo,
  } = env
  if (
    !tag ||
    tag !== `v${version}` ||
    !/^[0-9a-f]{40}$/.test(commit || '') ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo || '') ||
    ['.', '..'].includes(repo?.split('/')[1])
  )
    throw new Error('Invalid release context')
  // Reuse the tag/version validation before any GitHub or filesystem operation.
  releasePlan({
    versions: [version],
    ref: `refs/tags/${tag}`,
    commit,
    tagCommit: commit,
  })
  return { tag, version, commit, repo }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const commit = run('git', ['rev-parse', 'HEAD'])
  const ref = process.env.GITHUB_REF || ''
  const tagCommit = ref.startsWith('refs/tags/')
    ? run('git', ['rev-parse', '--verify', `${ref}^{commit}`])
    : undefined
  const plan = releasePlan({
    versions: versionsAt(process.cwd()),
    ref,
    commit,
    tagCommit,
    event: process.env.GITHUB_EVENT_NAME,
    packages: process.env.INPUT_PACKAGES === 'true',
    acceptanceOnly: process.env.INPUT_ACCEPTANCE_ONLY === 'true',
  })
  if (process.env.GITHUB_OUTPUT)
    for (const [key, value] of Object.entries(plan))
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}\n`,
      )
  console.log(JSON.stringify(plan, null, 2))
}
