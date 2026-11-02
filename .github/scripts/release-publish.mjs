import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assemble } from './release-assets.mjs'
import { context, run } from './release-plan.mjs'

export function github(repo, execute = execFileSync) {
  return {
    async api(path, missing = false) {
      try {
        return JSON.parse(
          execute('gh', ['api', `repos/${repo}/${path}`], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }),
        )
      } catch (error) {
        // Do not treat a denied request, transport failure or invalid JSON as
        // an absent release and accidentally start a second publication path.
        if (missing && /\(HTTP 404\)/.test(String(error.stderr))) return null
        throw error
      }
    },
    async command(args) {
      run('gh', [...args, '--repo', repo])
    },
  }
}

export async function checkRelease(ctx, gh) {
  const reference = await gh.api(`git/ref/tags/${encodeURIComponent(ctx.tag)}`)
  let object = reference.object
  for (let depth = 0; object.type === 'tag' && depth < 10; depth++)
    object = (await gh.api(`git/tags/${object.sha}`)).object
  if (object.type !== 'commit' || object.sha !== ctx.commit)
    throw new Error('The remote tag moved or does not identify the validated commit')
  const release = await gh.api(`releases/tags/${encodeURIComponent(ctx.tag)}`, true)
  if (release && !release.draft)
    throw new Error(
      'This release is already published; use a new version instead of replacing its installers',
    )
  return release
}

export async function publish(ctx, files, gh, notes) {
  const release = await checkRelease(ctx, gh)
  if (!release) {
    const args = [
      'release',
      'create',
      ctx.tag,
      '--verify-tag',
      '--draft',
      '--title',
      `typstOgraphe ${ctx.tag}`,
      '--notes-file',
      notes,
    ]
    if (ctx.version.includes('-')) args.push('--prerelease')
    await gh.command(args)
  }
  // Existing draft notes are deliberately preserved. Only this job writes
  // assets, after all three platforms succeeded, so parallel builders cannot race.
  await gh.command(['release', 'upload', ctx.tag, ...files, '--clobber'])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ctx = context(),
    gh = github(ctx.repo)
  if (process.argv[2] === 'check') await checkRelease(ctx, gh)
  else if (process.argv[2] === 'publish') {
    const files = await assemble(process.cwd(), ctx.version, ctx.commit)
    await publish(ctx, files, gh, '.github/release-notes.md')
    console.log(`Draft installers: https://github.com/${ctx.repo}/releases/tag/${ctx.tag}`)
  } else throw new Error('Expected check or publish')
}
