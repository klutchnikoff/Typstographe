import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { nativeMetadata } from './native-locales.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src-tauri')
const json = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'))
const association = json('tauri.conf.json').bundle.fileAssociations[0]
const plistValue = (element) => {
  if (element.tagName === 'array') return [...element.children].map(plistValue)
  if (element.tagName === 'dict') {
    const children = [...element.children]
    return Object.fromEntries(
      children
        .filter((_, i) => i % 2 === 0)
        .map((key, i) => [key.textContent, plistValue(children[i * 2 + 1])]),
    )
  }
  return element.textContent
}

test('macOS retains file ownership and the packaged document icon with either Fluent fallback', () => {
  for (const fallback of ['en', 'fr']) {
    const metadata = nativeMetadata({ fallback, languages: ['en', 'fr'] }, [association])
    const dom = new JSDOM(metadata.plist, { contentType: 'text/xml' })
    const plist = plistValue(dom.window.document.querySelector('plist > dict'))
    assert.equal(plist.CFBundleDevelopmentRegion, fallback)
    const document = plist.CFBundleDocumentTypes[0]
    const exported = plist.UTExportedTypeDeclarations[0]
    assert.deepEqual(document.CFBundleTypeExtensions, ['typsto'])
    assert.equal(document.CFBundleTypeRole, 'Editor')
    assert.deepEqual(document.LSItemContentTypes, [exported.UTTypeIdentifier])
    assert.equal(exported.UTTypeTagSpecification['public.mime-type'], association.mimeType)
    const resources = json('tauri.macos.conf.json').bundle.resources
    assert.ok(Object.values(resources).includes(document.CFBundleTypeIconFile))
    for (const file of Object.keys(resources)) assert.ok(existsSync(resolve(root, file)))
    dom.window.close()
  }
})

test('Windows sets its document icon on the same file class that Tauri registers', () => {
  const bundle = json('tauri.windows.conf.json').bundle
  const hook = readFileSync(resolve(root, bundle.windows.nsis.installerHooks), 'utf8')
  assert.ok(hook.includes(`Software\\Classes\\${association.name}\\DefaultIcon`))
  assert.ok(hook.includes('$INSTDIR\\document.ico'))
  assert.equal(bundle.resources['icons/document.ico'], 'document.ico')
  assert.ok(existsSync(resolve(root, 'icons/document.ico')))
})

test('Linux package mappings provide matching MIME metadata and icons', () => {
  const mime = new JSDOM(readFileSync(resolve(root, 'associations/typstographe.xml'), 'utf8'), {
    contentType: 'text/xml',
  })
  const type = mime.window.document.querySelector('mime-type')
  assert.equal(type.getAttribute('type'), association.mimeType)
  assert.equal(type.querySelector('glob').getAttribute('pattern'), '*.typsto')
  const name = type.querySelector('icon').getAttribute('name')
  const linux = json('tauri.linux.conf.json').bundle.linux
  for (const kind of ['deb', 'rpm']) {
    const desktop = readFileSync(resolve(root, linux[kind].desktopTemplate), 'utf8')
    assert.match(desktop, /^Exec=\{\{exec\}\} %f$/m)
    assert.ok(desktop.includes(`MimeType=${association.mimeType};`))
  }
  for (const kind of ['deb', 'rpm', 'appimage']) {
    const files = linux[kind].files
    for (const source of Object.values(files)) assert.ok(existsSync(resolve(root, source)), source)
    assert.ok(files['usr/share/mime/packages/typstographe.xml'])
    assert.ok(files[`usr/share/icons/hicolor/scalable/mimetypes/${name}.svg`])
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512])
      assert.ok(files[`usr/share/icons/hicolor/${size}x${size}/mimetypes/${name}.png`])
  }
  mime.window.close()
})

test('native app and document PNGs retain the RGBA format required by Tauri', () => {
  for (const file of [
    'icons/icon.png',
    'icons/document.png',
    'icons/macos/icon.png',
    'icons/windows/icon.png',
    'icons/linux/icon.png',
  ]) {
    const png = readFileSync(resolve(root, file))
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.readUInt32BE(16), 512)
    assert.equal(png.readUInt32BE(20), 512)
    assert.equal(png[24], 8)
    assert.equal(png[25], 6)
  }
})
