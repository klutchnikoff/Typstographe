// Isolated VS Code recipe. Never installed in the user's normal profile.
const vscode = require("vscode");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
exports.activate = async (context) => {
  const root = path.resolve(process.env.TOG_PIPELINE_PROJECT);
  let document, task;
  const state = { events: [] };
  vscode.workspace.onDidChangeTextDocument(
    (e) => {
      if (e.document === document)
        state.events.push({
          version: e.document.version,
          at: performance.timeOrigin + performance.now(),
        });
    },
    null,
    context.subscriptions,
  );
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers["x-benchmark-token"] !== process.env.TOG_PIPELINE_TOKEN)
        throw Error("Unauthorized benchmark client");
      let body = "";
      for await (const chunk of req) body += chunk;
      if (body.length > 2000000) throw Error("Too large");
      const args = body ? JSON.parse(body) : {};
      let result;
      switch (req.url) {
        case "/clock":
          result = performance.timeOrigin + performance.now();
          break;
        case "/forward": {
          const editor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
          });
          const position = document.positionAt(args.offset);
          editor.selection = new vscode.Selection(position, position);
          // showTextDocument's activation event can arrive after its promise.
          await new Promise((resolve) => setTimeout(resolve, 75));
          if (
            vscode.window.activeTextEditor?.document.uri.toString() !==
            document.uri.toString()
          )
            throw Error("Source editor not active for navigation");
          await vscode.commands.executeCommand("typst-preview.sync", {
            taskId: task.taskId,
          });
          result = { position, uri: document.uri.toString() };
          break;
        }
        case "/setup": {
          const main = await vscode.workspace.openTextDocument(
            vscode.Uri.file(path.join(root, "main.typ")),
          );
          await vscode.window.showTextDocument(main);
          task = await vscode.commands.executeCommand("typst-preview.preview");
          document = await vscode.workspace.openTextDocument(
            vscode.Uri.file(path.join(root, "contenu.typ")),
          );
          await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
          });
          result = {
            task,
            source: document.getText(),
            version: document.version,
          };
          break;
        }
        case "/edit": {
          const before = document.getText(),
            after = args.source;
          let lo = 0,
            hi = 0;
          while (
            lo < before.length &&
            lo < after.length &&
            before[lo] === after[lo]
          )
            lo++;
          while (
            hi < before.length - lo &&
            hi < after.length - lo &&
            before[before.length - 1 - hi] === after[after.length - 1 - hi]
          )
            hi++;
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(
              document.positionAt(lo),
              document.positionAt(before.length - hi),
            ),
            after.slice(lo, after.length - hi),
          );
          const start = performance.timeOrigin + performance.now();
          const applied = await vscode.workspace.applyEdit(edit);
          result = {
            start,
            end: performance.timeOrigin + performance.now(),
            applied,
            version: document.version,
            changed: {
              from: lo,
              to: before.length - hi,
              inserted: after.length - lo - hi,
            },
          };
          break;
        }
        case "/focus":
          await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
          });
          await vscode.commands.executeCommand("workbench.action.closeSidebar");
          await vscode.commands.executeCommand("workbench.action.closePanel");
          await vscode.commands.executeCommand(
            "workbench.action.evenEditorWidths",
          );
          const all = await vscode.commands.getCommands(true);
          const top = all.find((c) => /toggleWindowAlwaysOnTop$/i.test(c));
          if (top) await vscode.commands.executeCommand(top);
          result = { alwaysOnTopCommand: top };
          break;
        case "/state":
          result = {
            ...state,
            active: vscode.window.activeTextEditor && {
              uri: vscode.window.activeTextEditor.document.uri.toString(),
              selection: {
                start: {
                  line: vscode.window.activeTextEditor.selection.start.line,
                  character:
                    vscode.window.activeTextEditor.selection.start.character,
                },
                end: {
                  line: vscode.window.activeTextEditor.selection.end.line,
                  character:
                    vscode.window.activeTextEditor.selection.end.character,
                },
              },
            },
            preview: await vscode.commands.executeCommand(
              "tinymist.doInspectPreviewState",
            ),
          };
          break;
        case "/commands":
          result = (await vscode.commands.getCommands(true)).filter((c) =>
            /preview|typst|tinymist|alwaysOnTop/i.test(c),
          );
          break;
        case "/close":
          result = true;
          setTimeout(
            () =>
              vscode.commands.executeCommand("workbench.action.closeWindow"),
            100,
          );
          break;
        default:
          throw Error("Unknown operation");
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result }));
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(error), stack: error.stack }));
    }
  });
  server.listen(0, "127.0.0.1", () =>
    fs.writeFileSync(
      process.env.TOG_PIPELINE_ENDPOINT,
      JSON.stringify({ port: server.address().port }),
    ),
  );
  context.subscriptions.push({
    dispose() {
      server.close();
    },
  });
};
