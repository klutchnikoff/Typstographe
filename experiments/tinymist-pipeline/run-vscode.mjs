import { spawn, execFileSync } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdir,
  symlink,
  cp,
  mkdtemp,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { chromium } from "../../node_modules/@playwright/test/index.mjs";
import { observePreview, armPreview, readPreview } from "./vscode-observer.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "output/tinymist-pipeline");
const extension =
  process.env.TOG_TINYMIST_EXTENSION ||
  resolve(
    homedir(),
    ".vscode/extensions/myriad-dreamin.tinymist-0.15.12-darwin-arm64",
  );
const code =
  process.env.TOG_VSCODE_CLI ||
  "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
const smoke = process.argv.includes("--smoke");
const batch = await mkdtemp(resolve(output, "vscode-run-"));
const reports = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = async () => {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
};
for (let run = 0; run < (smoke ? 1 : 2); run++)
  for (const count of smoke ? [10] : [10, 50, 200])
    for (const partial of run ? [false, true] : [true, false]) {
      const folder = resolve(
        batch,
        `article-${count}-${partial ? "partial" : "full"}-${run}`,
      );
      await mkdir(folder);
      const project = resolve(folder, "article");
      await cp(resolve(output, `articles/article-${count}`), project, {
        recursive: true,
      });
      const states = JSON.parse(
        await readFile(resolve(project, "states.json"), "utf8"),
      );
      // Blank article first: base fonts/template initialized, math package loaded by
      // the first full corpus, matching the native application's first-math recipe.
      await writeFile(resolve(project, "contenu.typ"), "#par[]\n");
      const runtime = await mkdtemp("/private/tmp/tog-vscode-");
      const profile = resolve(runtime, "profile"),
        extensions = resolve(runtime, "extensions");
      await mkdir(resolve(profile, "User"), { recursive: true });
      await mkdir(extensions);
      await symlink(
        extension,
        resolve(extensions, "myriad-dreamin.tinymist-0.15.12-darwin-arm64"),
        "dir",
      );
      await writeFile(
        resolve(profile, "User/settings.json"),
        JSON.stringify({
          "telemetry.telemetryLevel": "off",
          "update.mode": "none",
          "extensions.autoUpdate": false,
          "extensions.autoCheckUpdates": false,
          "workbench.startupEditor": "none",
          "window.restoreWindows": "none",
          "security.workspace.trust.enabled": false,
          "git.enabled": false,
          "git.openRepositoryInParentFolders": "never",
          "files.hotExit": "onExitAndWindowClose",
          "window.zoomLevel": 0,
          "tinymist.serverPath": resolve(extension, "out/tinymist"),
          "tinymist.systemFonts": false,
          "tinymist.fontPaths": [resolve(project, "fonts")],
          "tinymist.exportPdf": "never",
          "tinymist.preview.partialRendering": partial,
          "tinymist.lint.enabled": false,
        }),
      );
      const token = randomUUID(),
        endpoint = resolve(folder, "endpoint.json"),
        port = await freePort();
      const child = spawn(
        code,
        [
          "--user-data-dir",
          profile,
          "--extensions-dir",
          extensions,
          "--extensionDevelopmentPath",
          resolve(root, "experiments/tinymist-pipeline/vscode-helper"),
          `--remote-debugging-port=${port}`,
          "--remote-debugging-address=127.0.0.1",
          "--disable-workspace-trust",
          "--skip-welcome",
          "--skip-release-notes",
          "--window-size=1280,900",
          "--new-window",
          "--wait",
          project,
        ],
        {
          env: {
            ...process.env,
            TOG_PIPELINE_PROJECT: project,
            TOG_PIPELINE_TOKEN: token,
            TOG_PIPELINE_ENDPOINT: endpoint,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let log = "",
        browser,
        call;
      child.stdout.on("data", (x) => {
        log += x;
      });
      child.stderr.on("data", (x) => {
        log += x;
      });
      const samples = [];
      try {
        let helper;
        for (let i = 0; i < 120; i++) {
          try {
            helper = JSON.parse(await readFile(endpoint, "utf8")).port;
            break;
          } catch {}
          await sleep(500);
        }
        if (!helper) throw Error("VS Code helper did not activate");
        call = async (op, args = {}) => {
          const r = await fetch(`http://127.0.0.1:${helper}/${op}`, {
            method: "POST",
            headers: { "x-benchmark-token": token },
            body: JSON.stringify(args),
          });
          const x = await r.json();
          if (x.error) throw Error(JSON.stringify(x));
          return x.result;
        };
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        const context = browser.contexts()[0],
          page = context.pages().find((p) => p.url().includes("workbench"));
        const cdp = await browser.newBrowserCDPSession(),
          target = await context.newCDPSession(page);
        await page.bringToFront();
        await call("setup");
        let frame;
        for (let i = 0; i < 100; i++) {
          for (const f of page.frames())
            if (f.url().includes("/index.html?"))
              try {
                if (
                  await f.evaluate(
                    () =>
                      !!document
                        .querySelector("iframe")
                        ?.contentWindow?.document.querySelector(
                          "svg.typst-doc",
                        ),
                  )
                ) {
                  frame = f;
                  break;
                }
              } catch {}
          if (frame) break;
          await sleep(100);
        }
        if (!frame)
          throw Error("Tinymist webview did not render the blank article");
        const focus = await call("focus");
        await sleep(500);
        await frame.evaluate(observePreview);
        const clockChecks = [];
        for (let i = 0; i < 12; i++) {
          const before = performance.timeOrigin + performance.now();
          const remote = await frame.evaluate(() => {
            const w = document.querySelector("iframe").contentWindow;
            return w.performance.timeOrigin + w.performance.now();
          });
          const after = performance.timeOrigin + performance.now();
          clockChecks.push({
            offset: remote - (before + after) / 2,
            rtt: after - before,
          });
        }
        const clock = clockChecks.sort((a, b) => a.rtt - b.rtt)[0];
        const helperClockChecks = [];
        for (let i = 0; i < 12; i++) {
          const before = performance.timeOrigin + performance.now();
          const remote = await call("clock");
          const after = performance.timeOrigin + performance.now();
          helperClockChecks.push({
            offset: remote - (before + after) / 2,
            rtt: after - before,
          });
        }
        const helperClock = helperClockChecks.sort((a, b) => a.rtt - b.rtt)[0];
        for (const state of states.states) {
          await frame.evaluate(armPreview);
          const edit = await call("edit", { source: state.source });
          if (!edit.applied) throw Error("VS Code edit refused");
          let result;
          for (let i = 0; i < 1000; i++) {
            result = await frame.evaluate(readPreview);
            if (result) break;
            await sleep(10);
          }
          if (!result) throw Error("No SVG publication");
          if (
            result.visible !== "visible" ||
            result.publicationVisible !== "visible"
          )
            throw Error("Hidden preview sample");
          const rawPublishedMs = result.publishAt - edit.start;
          const correction = helperClock.offset - clock.offset;
          const publishedMs = rawPublishedMs + correction,
            frameMs = result.frameAt - edit.start + correction;
          if (publishedMs < 0)
            throw Error("Preview preceded the requested edit");
          if (result.pages.length !== states.pages)
            throw Error(
              `Page count mismatch ${result.pages.length}/${states.pages}`,
            );
          samples.push({
            phase: state.phase,
            round: state.round,
            publishedMs,
            rawPublishedMs,
            frameMs,
            editMs: edit.end - edit.start,
            edit,
            render: result,
            sourceSha: createHash("sha256").update(state.source).digest("hex"),
          });
        }
        // Use the real source→preview command and preview Cmd-click handler.
        const lastSource = states.states.at(-1).source;
        const requested = await call("forward", {
          offset: lastSource.indexOf("Conclusion") + 3,
        });
        let forwardScroll = 0;
        for (let i = 0; i < 150; i++) {
          forwardScroll = await frame.evaluate(
            () =>
              document
                .querySelector("iframe")
                .contentWindow.document.getElementById("typst-container-main")
                .scrollTop,
          );
          if (forwardScroll > 0) break;
          await sleep(20);
        }
        await frame.evaluate(() =>
          document
            .querySelector("iframe")
            .contentWindow.document.getElementById("typst-container-main")
            .scrollTo(0, 0),
        );
        await sleep(400);
        const click = await frame.evaluate(() => {
          const w = document.querySelector("iframe").contentWindow;
          const svg = w.document.querySelector("svg.typst-doc");
          const rect = svg.getBoundingClientRect();
          const scale = rect.width / Number(svg.getAttribute("data-width"));
          const x = rect.left + 110.5 * scale,
            y = rect.top + 219 * scale;
          const element = w.document.elementFromPoint(x, y);
          if (!element) throw Error("No preview element at backward target");
          return { tag: element.tagName, x, y };
        });
        const box = await frame.locator("iframe").boundingBox();
        if (!box) throw Error("Missing preview iframe geometry");
        await page.keyboard.down("Meta");
        try {
          await page.mouse.click(box.x + click.x, box.y + click.y);
        } finally {
          await page.keyboard.up("Meta");
        }
        let state;
        for (let i = 0; i < 100; i++) {
          state = await call("state");
          if (state.active?.selection?.start.line === 2) break;
          await sleep(20);
        }
        const navigation = {
          forward: forwardScroll > 0,
          forwardScroll,
          requested,
          backward:
            state.active?.selection?.start.line === 2 &&
            state.active?.uri?.endsWith("/contenu.typ"),
          selection: state.active,
          click,
        };
        // The source→preview command is a recorded diagnostic: no observed
        // scroll after this unsaved edit sequence is not treated as a successful
        // navigation test, nor as evidence that Tinymist navigation is broken.
        if (!navigation.backward)
          throw Error(
            "Tinymist preview-to-source navigation failed: " +
              JSON.stringify(navigation),
          );
        reports.push({
          success: true,
          run,
          corpus: `article-${count}`,
          partial,
          pages: states.pages,
          samples,
          clock,
          clockChecks,
          helperClock,
          helperClockChecks,
          clockUncertaintyMs: (clock.rtt + helperClock.rtt) / 2,
          navigation,
          preview: state.preview,
          focus,
          workbenchViewport: await page.evaluate(() => ({
            width: innerWidth,
            height: innerHeight,
            dpr: devicePixelRatio,
          })),
          browserVersion: await cdp.send("Browser.getVersion"),
          source:
            "Real VS Code WorkspaceEdit → installed Tinymist LSP → builtin SVG webview",
        });
        console.log(
          `VS Code article-${count} partial=${partial} run=${run}: ${samples.length} valid states`,
        );
      } catch (error) {
        await writeFile(
          resolve(folder, "failure.json"),
          JSON.stringify(
            { error: String(error), stack: error.stack, samples },
            null,
            2,
          ),
        );
        throw error;
      } finally {
        await writeFile(resolve(folder, "native.log"), log);
        if (call) await call("close").catch(() => {});
        await sleep(250);
        if (browser) {
          const c = await browser.newBrowserCDPSession().catch(() => null);
          if (c)
            await Promise.race([
              c.send("Browser.close").catch(() => {}),
              sleep(1000),
            ]);
          await Promise.race([browser.close().catch(() => {}), sleep(1000)]);
        }
        if (child.exitCode === null) {
          child.kill();
        }
      }
      await writeFile(
        resolve(output, smoke ? "vscode-smoke.json" : "vscode-raw.json"),
        JSON.stringify(reports, null, 2) + "\n",
      );
    }
console.log(
  JSON.stringify(
    {
      success: true,
      runs: reports.length,
      states: reports.reduce((n, r) => n + r.samples.length, 0),
      output,
    },
    null,
    2,
  ),
);
