/** Injected only into the Tinymist preview of an isolated VS Code profile. */
export function observePreview() {
  const w = document.querySelector("iframe")?.contentWindow;
  if (!w?.TypstRenderSession)
    throw new Error("Tinymist preview session missing");
  if (w.__pipelineBench) return;
  const bench = (w.__pipelineBench = { active: null, result: null });
  const now = () => w.performance.timeOrigin + w.performance.now();
  const proto = w.TypstRenderSession.prototype;
  const manipulate = proto.manipulateData;
  proto.manipulateData = function (...args) {
    const sample = bench.active,
      start = now();
    const result = manipulate.apply(this, args);
    if (sample) {
      sample.mergeMs += now() - start;
      sample.mergeAt = start;
      sample.bytes += args[0]?.data?.byteLength || 0;
      sample.session = this;
      sample.merges++;
    }
    return result;
  };
  const render = proto.render_in_window;
  proto.render_in_window = function (...args) {
    const sample = bench.active,
      start = now();
    const result = render.apply(this, args);
    if (sample && sample.merges) {
      sample.svgMs += now() - start;
      sample.svgAt = start;
      sample.svgChars += result.length;
      sample.renders++;
      sample.rendered = true;
    }
    return result;
  };
  const observer = new w.MutationObserver((records) => {
    const sample = bench.active;
    if (!sample?.rendered || sample.scheduled) return;
    const insideDoc = (node) =>
      node instanceof w.SVGElement &&
      (node.matches("svg.typst-doc") || !!node.closest("svg.typst-doc"));
    if (
      !records.some(
        (record) =>
          insideDoc(record.target) || [...record.addedNodes].some(insideDoc),
      )
    )
      return;
    sample.scheduled = true;
    sample.publishAt = now();
    sample.publicationVisible = w.document.visibilityState;
    w.requestAnimationFrame(() =>
      w.requestAnimationFrame(() => {
        if (bench.active !== sample) return;
        const svg = w.document.querySelector("svg.typst-doc");
        const pages = sample.session.retrievePagesInfo();
        bench.result = {
          ...sample,
          session: undefined,
          frameAt: now(),
          pages,
          visible: w.document.visibilityState,
          viewport: {
            width: w.innerWidth,
            height: w.innerHeight,
            dpr: w.devicePixelRatio,
            svgWidth: svg?.getBoundingClientRect().width,
          },
          svgElements: svg?.querySelectorAll("*").length,
        };
        bench.active = null;
      }),
    );
  });
  observer.observe(w.document, {
    subtree: true,
    attributes: true,
    characterData: true,
    childList: true,
  });
}
export function armPreview() {
  const w = document.querySelector("iframe").contentWindow;
  if (w.document.visibilityState !== "visible") throw Error("Hidden preview");
  const b = w.__pipelineBench;
  b.result = null;
  b.active = {
    armedAt: w.performance.timeOrigin + w.performance.now(),
    mergeMs: 0,
    svgMs: 0,
    bytes: 0,
    svgChars: 0,
    merges: 0,
    renders: 0,
  };
}
export function readPreview() {
  return document.querySelector("iframe").contentWindow.__pipelineBench.result;
}
