#!/usr/bin/env python3
"""Build the approved st icons and native app resources with Python 3 and rsvg-convert.

Run: python3 assets/branding/generate.py --icons-only
The macOS/Windows containers use PNG layers; the ICO starts with its 32px layer.
Without --icons-only, also regenerate the approved st splash and wordmark preview.
"""

import argparse
import json
import math
import re
from pathlib import Path
import shutil
import struct
import subprocess
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parent
SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
source = ET.parse(ROOT / "ligature-st.svg").getroot()
group = source.find(f"{{{SVG}}}g")
mark = ET.tostring(group, encoding="unicode").replace(f' xmlns="{SVG}"', "")


def optical_mark(size):
    """Scale the approved outline to the logical size, also used by Retina layers."""
    if size not in (16, 24, 32, 48):
        return mark
    return f'<g transform="scale({size / 512})">{mark}</g>'


def icon(platform, size=1024):
    small = {16: (1, 14, 3), 24: (2, 20, 5), 32: (2, 28, 6), 48: (4, 40, 9)}
    dimension = size if size in small else 512
    inset, width, radius = small.get(size, (48, 416, 96 if platform == "macos" else 88))
    if platform == "macos":
        plate = '''<defs><linearGradient id="ink" x1="0" y1="0" x2=".6" y2="1">
          <stop stop-color="#39728d"/><stop offset="1" stop-color="#204c65"/>
        </linearGradient></defs>'''
        plate += f'<rect x="{inset}" y="{inset}" width="{width}" height="{width}" rx="{radius}" fill="url(#ink)"/>'
        if size not in small:
            plate += '''<rect x="49" y="49" width="414" height="414" rx="95" fill="none" stroke="#fff" stroke-opacity=".16"/>
            <path d="M144 49H368C421 49 463 91 463 144" fill="none" stroke="#fff" stroke-opacity=".1"/>'''
    else:
        # A restrained plate keeps contrast in light/dark Windows and Linux shells.
        plate = f'<rect x="{inset}" y="{inset}" width="{width}" height="{width}" rx="{radius}" fill="#285c77"/>'
    # The approved +15% size is relative to the coloured plate, not the outer
    # transparent artboard. Preserve that ratio with each platform's padding.
    fitted = f'<g transform="translate({inset} {inset}) scale({width / dimension})">{optical_mark(size)}</g>'
    return f'''<svg xmlns="{SVG}" width="{dimension}" height="{dimension}" viewBox="0 0 {dimension} {dimension}" color="#f6f4ee">
      <title>Typstographe — {platform}</title>{plate}{fitted}</svg>'''


def document_icon():
    return f'''<svg xmlns="{SVG}" width="512" height="512" viewBox="0 0 512 512" color="#285c77">
  <title>Typstographe — project document</title>
  <path d="M128 48H320L400 128V448Q400 464 384 464H128Q112 464 112 448V64Q112 48 128 48Z" fill="#f6f4ee" stroke="#285c77" stroke-width="10" stroke-linejoin="round"/>
  <path d="M320 48V112Q320 128 336 128H400" fill="#dce6ea" stroke="#285c77" stroke-width="10" stroke-linejoin="round"/>
  <g transform="translate(256 298) scale(.54) translate(-256 -256)">{mark}</g>
</svg>'''


def png(svg, size, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(target)],
        input=svg.encode(), check=True,
    )
    return target.read_bytes()


def containers(windows, mac):
    sizes = (32, 16, 24, 48, 64, 128, 256)
    layers = [(size, (windows / f"{size}.png").read_bytes()) for size in sizes]
    offset = 6 + 16 * len(layers)
    directory, payload = bytearray(), bytearray()
    for size, data in layers:
        directory.extend(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset))
        payload.extend(data)
        offset += len(data)
    (windows / "icon.ico").write_bytes(struct.pack("<HHH", 0, 1, len(layers)) + directory + payload)

    chunks = bytearray()
    for kind, filename in (("icp4", "16"), ("icp5", "32"), ("icp6", "64"), ("ic07", "128"),
                           ("ic08", "256"), ("ic09", "512"), ("ic10", "512@2x"),
                           ("ic11", "16@2x"), ("ic12", "32@2x"), ("ic13", "128@2x"), ("ic14", "256@2x")):
        data = (mac / f"{filename}.png").read_bytes()
        chunks.extend(kind.encode() + struct.pack(">I", len(data) + 8) + data)
    (mac / "icon.icns").write_bytes(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)



def stroke_data():
    """Sample the approved pen paths; the font outline itself is never sampled."""
    data = json.loads((ROOT / "strokes.json").read_text(encoding="utf-8"))
    arity = {"M": 2, "L": 2, "C": 6}
    for trace in data["traces"]:
        tokens = re.findall(r"[A-Za-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", trace.pop("d"))
        points = []
        while tokens:
            command = tokens.pop(0)
            if command not in arity:
                raise ValueError(f"Unsupported reveal-path command: {command}")
            values = [float(tokens.pop(0)) for _ in range(arity[command])]
            if command == "M":
                points.append(tuple(values))
                continue
            a = points[-1]
            if command == "L":
                b = tuple(values)
                count = max(1, math.ceil(math.dist(a, b) / 4))
                points.extend((a[0] + (b[0] - a[0]) * i / count, a[1] + (b[1] - a[1]) * i / count) for i in range(1, count + 1))
            else:
                b, c, d = values[:2], values[2:4], values[4:]
                count = max(8, math.ceil((math.dist(a, b) + math.dist(b, c) + math.dist(c, d)) / 4))
                for i in range(1, count + 1):
                    t, u = i / count, 1 - i / count
                    points.append((u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0], u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]))
        distances = [0]
        for a, b in zip(points, points[1:]):
            distances.append(distances[-1] + math.dist(a, b))
        trace.update(points=points, distances=distances, length=distances[-1])
    (ROOT / "stroke-data.mjs").write_text(
        "// Generated from strokes.json by generate.py; only reveal trajectories are sampled.\n"
        + "export const strokeData = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")


def build(include_splash=True):
    for size in (16, 24, 32, 48):
        drawing = f'''<svg xmlns="{SVG}" viewBox="0 0 {size} {size}" fill="none">
  <title>Typstographe — st, {size} px</title>{optical_mark(size)}</svg>'''
        (ROOT / "optical" / f"{size}.svg").write_text(drawing, encoding="utf-8")

    for platform in ("macos", "windows", "linux"):
        (ROOT / f"icon-{platform}.svg").write_text(icon(platform), encoding="utf-8")
        for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
            png(icon(platform, size), size, ROOT / "exports" / platform / f"{size}.png")
            if size < 1024:
                png(icon(platform, size), size * 2, ROOT / "exports" / platform / f"{size}@2x.png")
            if size in (16, 24, 32, 48):
                (ROOT / "exports" / platform / f"{size}.svg").write_text(icon(platform, size), encoding="utf-8")

    containers(ROOT / "exports" / "windows", ROOT / "exports" / "macos")

    linux = ROOT / "exports" / "linux"
    (linux / "typstographe.svg").write_text(icon("linux"), encoding="utf-8")
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        target = linux / "hicolor" / f"{size}x{size}" / "apps" / "typstographe.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((linux / f"{size}.png").read_bytes())
    scalable = linux / "hicolor" / "scalable" / "apps"
    scalable.mkdir(parents=True, exist_ok=True)
    (scalable / "typstographe.svg").write_text(icon("linux"), encoding="utf-8")

    if include_splash:
        stroke_data()
        scene = ET.parse(ROOT / "wordmark.svg").getroot()
        definitions = ET.Element(f"{{{SVG}}}defs")
        clip = ET.SubElement(definitions, f"{{{SVG}}}clipPath", {"id": "brand-reveal", "clipPathUnits": "userSpaceOnUse"})
        ET.SubElement(clip, f"{{{SVG}}}path", {"data-brand-reveal": "", "d": "M-200 -200H1000V1000H-200Z"})
        scene.insert(0, definitions)
        for node in scene.iter():
            if "data-brand-ligature" in node.attrib:
                node.set("clip-path", "url(#brand-reveal)")
        markup = ET.tostring(scene, encoding="unicode")
        (ROOT / "splash.svg").write_text(markup + "\n", encoding="utf-8")
        template = (ROOT / "splash.template.html").read_text(encoding="utf-8")
        (ROOT / "splash.html").write_text(template.replace("<!-- BRAND SCENE -->", markup), encoding="utf-8")

    # Keep native resources in sync with the approved, size-specific exports.
    native = ROOT.parents[1] / "app" / "src-tauri" / "icons"
    for platform in ("macos", "windows", "linux"):
        destination = native / platform
        destination.mkdir(parents=True, exist_ok=True)
        for filename, source in (("32x32.png", "32.png"), ("128x128.png", "128.png"),
                                 ("128x128@2x.png", "128@2x.png"), ("icon.png", "512.png")):
            shutil.copyfile(ROOT / "exports" / platform / source, destination / filename)
    shutil.copyfile(ROOT / "exports" / "macos" / "icon.icns", native / "icon.icns")
    shutil.copyfile(ROOT / "exports" / "windows" / "icon.ico", native / "icon.ico")
    shutil.copyfile(ROOT / "exports" / "linux" / "512.png", native / "icon.png")
    # Document icons retain a paper silhouette distinct from the application plate.
    documents = ROOT / "exports" / "documents"
    drawing = document_icon()
    (ROOT / "document.svg").write_text(drawing, encoding="utf-8")
    for platform in ("macos", "windows", "linux"):
        for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
            png(drawing, size, documents / platform / f"{size}.png")
            if size < 1024:
                png(drawing, size * 2, documents / platform / f"{size}@2x.png")
    containers(documents / "windows", documents / "macos")
    shutil.copyfile(documents / "macos" / "icon.icns", native / "document.icns")
    shutil.copyfile(documents / "windows" / "icon.ico", native / "document.ico")
    shutil.copyfile(documents / "linux" / "512.png", native / "document.png")
    for size in (16, 24, 32, 48, 64, 128, 256, 512):
        destination = native / "mimetypes" / "hicolor" / f"{size}x{size}" / "mimetypes" / "application-x-typstographe.png"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(documents / "linux" / f"{size}.png", destination)
    destination = native / "mimetypes" / "hicolor" / "scalable" / "mimetypes" / "application-x-typstographe.svg"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(drawing, encoding="utf-8")
    print("st: SVG, PNG, ICO and ICNS generated; app/src-tauri/icons/ updated.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--icons-only", action="store_true", help="Leave the existing splash assets untouched.")
    build(include_splash=not parser.parse_args().icons_only)
