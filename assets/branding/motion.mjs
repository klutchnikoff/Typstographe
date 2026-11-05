// The standalone preview and the welcome screen use this same approved animation.
import { strokeData } from "./stroke-data.mjs";
import { traceClip } from "./reveal.mjs";

let nextClip = 0;
const clamp = (value) => Math.max(0, Math.min(1, value));
const segment = (time, start, end) => clamp((time - start) / (end - start));
const smooth = (value) => value ** 3 * (value * (value * 6 - 15) + 10);

export function createLigatureAnimation(root) {
  const camera = root.querySelector("[data-brand-camera]");
  const letters = root.querySelector("[data-brand-letters]");
  const ligature = root.querySelector("[data-brand-ligature]");
  const clip = root.querySelector("clipPath");
  const reveal = root.querySelector("[data-brand-reveal]");
  if (!camera || !letters || !ligature || !clip || !reveal)
    throw new Error("Incomplete typstOgraphe brand scene");
  clip.id = `typstographe-reveal-${++nextClip}`;
  ligature.setAttribute("clip-path", `url(#${clip.id})`);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const duration = strokeData.duration;
  let started = false;
  let disposed = false;
  let frame = 0;

  function render(time) {
    time = Math.max(0, Math.min(duration, time));
    reveal.setAttribute(
      "d",
      strokeData.traces
        .map((trace) => traceClip(trace, segment(time, trace.start, trace.end)))
        .join("") || "M0 0Z",
    );
    const progress = smooth(segment(time, 1620, 2480));
    const [cx, cy] = strokeData.ligatureCenter;
    const x = 600 + (cx - 600) * progress;
    const y = 360 + (cy - 360) * progress;
    const zoom = Math.exp(Math.log(3.1) * (1 - progress));
    camera.setAttribute(
      "transform",
      `translate(${x} ${y}) rotate(${25 * (1 - progress)}) scale(${zoom}) translate(${-cx} ${-cy})`,
    );
    letters.setAttribute("opacity", smooth(segment(time, 2260, duration)));
    root.dataset.state = time >= duration ? "settled" : "writing";
  }

  function finish() {
    cancelAnimationFrame(frame);
    frame = 0;
    render(duration);
  }

  function play() {
    if (started || disposed) return;
    started = true;
    if (reducedMotion.matches || document.hidden) {
      finish();
      return;
    }
    render(0);
    let beginning;
    const tick = (now) => {
      beginning ??= now;
      const time = now - beginning;
      render(time);
      frame = time < duration ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
  }

  const onMotionChange = (event) => {
    if (event.matches) finish();
  };
  const onVisibilityChange = () => {
    if (document.hidden) finish();
  };
  reducedMotion.addEventListener("change", onMotionChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  finish();
  return {
    duration,
    play,
    finish,
    seek(time) {
      cancelAnimationFrame(frame);
      frame = 0;
      render(time);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      reducedMotion.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
