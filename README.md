# 🦕 STEGO

**A lightweight 2D CAD that runs entirely in your browser.**

Because sometimes you just want to draw lines…  
without installing a 5-gigabyte dinosaur of a CAD.

STEGO is a minimal browser-based CAD focused on simple geometry, fast interaction and a clean project format.

And yes, it's named after **Stegosaurus**.  
Because dinosaurs are cool. Obviously.

---

## Why STEGO?

Most CAD software feels like a giant prehistoric creature.

STEGO tries to be the opposite:

- lightweight
- simple
- hackable
- browser-native

Open the page and start drawing.  
No install, no plugins, no cloud lock-in.

---

## Features

### 🦴 Geometry primitives

- segments
- arcs
- circles
- polylines

### ✂️ Editing tools

- **Break** – split geometry with a click  
- **Katana** – cut objects with a 2-point blade  
- selection box
- layer system

### ⚡ Lightweight engine

- fast rendering
- simple data structures
- minimal dependencies

---

## Project format

STEGO uses a very simple **JSON geometry format**.

Example:

```json
{
  "layers": {
    "Layer 1": {
      "visible": true,
      "color": "#111827",
      "locked": false
    }
  },
  "activeLayer": "Layer 1",
  "segments": [
    {
      "id": "seg1",
      "a": { "x": 0, "y": 0 },
      "b": { "x": 100, "y": 100 },
      "layer": "Layer 1"
    }
  ]
}
```

Why JSON?

- easy to debug
- easy to generate
- easy to convert from other formats

---

## DXF Import

STEGO can import simple **DXF files**.

Supported entities:

- `LINE`
- `CIRCLE`
- `ARC`
- `LWPOLYLINE`

You can export DXF from tools like:

- AutoCAD
- LibreCAD
- QCAD
- DraftSight

and convert it into STEGO's JSON format.

---

## Philosophy

STEGO is not trying to replace professional CAD suites.

Instead it aims to be:

- a **small drafting engine**
- a **geometry playground**
- a **hackable CAD core**

Perfect for experiments, tools, or custom workflows.

---

## Roadmap

Possible future improvements:

- better snapping engine
- spatial indexing for large drawings
- improved polyline editing
- better DXF support
- performance optimizations

---

## License

MIT License

You are free to use, modify and build on STEGO.  
Just keep the original copyright notice.

---

## Author

Created by **Marco RANZATO VIANELLO**

If you build something with STEGO, feel free to mention it.

https://buymeacoffee.com/ranzacoffee

Dinosaurs would approve. 🦕
