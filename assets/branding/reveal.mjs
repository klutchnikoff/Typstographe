// Each ownership region is an intersection of exact half-planes in glyph space.
// No glyph contour is copied into the reveal clip; its exterior is rasterized once.
const sBoundary = [8, 27, 12978]; // 8*x + 27*y <= 12978: shared s/bridge cut.
const neck = [32, -11, 9123]; // 32*x - 11*y = 9123: bridge/head cut.
// Both cuts meet at (491, 599), the upper end of the native bridge/head join.
// The old ridge started lower, assigning a triangular piece of the connector
// to the return stroke. Anchoring it at the shared join keeps the entry solid.
const ridge = [-51, 114, 43245]; // (491, 599) -> (605, 650): outbound below, return above.
const below = (p) => p;
const above = (p) => p.map((v) => -v);
const headCut = [0, 1, 567];
const regions = {
  s: [[below(sBoundary)]],
  bridge: [[above(sBoundary), below(neck)]],
  outward: [[above(neck), above(headCut), below(ridge)]],
  inward: [[above(neck), above(headCut), above(ridge)]],
  stem: [
    [above(neck), [0, 1, 346]],
    [
      above(neck),
      [0, -1, -346],
      [0, 1, 400],
      [-53, 20, -14478],
      [55, -14, 21085],
    ],
    [above(neck), [0, -1, -400], [0, 1, 567]],
  ],
  bar: [
    [
      [0, -1, -325],
      [0, 1, 430],
    ],
  ],
};
function clipPolygon(poly, planes) {
  for (const [a, b, c] of planes) {
    const output = [];
    if (!poly.length) break;
    let prev = poly[poly.length - 1],
      pd = a * prev[0] + b * prev[1] - c;
    for (const point of poly) {
      const d = a * point[0] + b * point[1] - c;
      if (d <= 0 !== pd <= 0) {
        const t = pd / (pd - d);
        output.push([
          prev[0] + t * (point[0] - prev[0]),
          prev[1] + t * (point[1] - prev[1]),
        ]);
      }
      if (d <= 0) output.push(point);
      prev = point;
      pd = d;
    }
    poly = output;
  }
  return poly;
}
function partialPoints(trace, progress) {
  const length = trace.length * progress,
    points = [];
  for (let i = 0; i < trace.points.length; i++) {
    if (trace.distances[i] <= length) points.push(trace.points[i]);
    else {
      if (i > 0) {
        const a = trace.points[i - 1],
          b = trace.points[i],
          t =
            (length - trace.distances[i - 1]) /
            (trace.distances[i] - trace.distances[i - 1]);
        points.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
      break;
    }
  }
  return points;
}
function strokeEnvelope(points, radius) {
  if (points.length < 2) return [];
  const left = [],
    right = [];
  let firstAngle, lastAngle;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (i === 0) firstAngle = angle;
    if (i === points.length - 1) lastAngle = angle;
    const nx = -Math.sin(angle) * radius,
      ny = Math.cos(angle) * radius;
    left.push([points[i][0] + nx, points[i][1] + ny]);
    right.push([points[i][0] - nx, points[i][1] - ny]);
  }
  const poly = [...left];
  const last = points[points.length - 1],
    first = points[0];
  for (let i = 1; i < 17; i++) {
    const a = lastAngle + Math.PI / 2 - (i * Math.PI) / 16;
    poly.push([last[0] + radius * Math.cos(a), last[1] + radius * Math.sin(a)]);
  }
  poly.push(...right.reverse());
  for (let i = 1; i < 17; i++) {
    const a = firstAngle - Math.PI / 2 - (i * Math.PI) / 16;
    poly.push([
      first[0] + radius * Math.cos(a),
      first[1] + radius * Math.sin(a),
    ]);
  }
  return poly;
}
function polygonData(poly) {
  if (poly.length < 3) return "";
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) poly.reverse();
  return (
    "M" + poly.map((p) => p.map((v) => v.toFixed(4)).join(" ")).join("L") + "Z"
  );
}
function traceClip(trace, progress) {
  if (progress <= 0) return "";
  if (progress >= 1 && trace.completed) return trace.completed;
  const polygon = strokeEnvelope(partialPoints(trace, progress), trace.radius);
  let result = "";
  for (const region of regions[trace.id])
    result += polygonData(clipPolygon(polygon, region));
  if (progress >= 1) trace.completed = result;
  return result;
}

export { traceClip };
