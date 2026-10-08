# Blender mannequin

An original neutral mannequin, generated in Blender for MacroTracker. No third-party meshes or textures are used.

## Review artifacts

- `mannequin.blend`: editable master, including individually editable muscle forms, a fused neutral head/joint core, both export modes, and a preview studio. Whole-muscle view is enabled initially; source and region collections are hidden.
- `mannequin-muscles.glb`: web export with 20 selectable whole-muscle areas.
- `mannequin-regions.glb`: web export with 52 named regions plus the three deltoid groups and brachialis.
- `manifest.json` and `validation.json`: generated mesh metadata and export validation.

The daily-log muscle map loads these exports from `frontend/public/models/`. Review the model in the app; the standalone preview images were removed.

## Asset conventions

Blender uses meters, Z-up, front along -Y. GLB exports use Y-up, front along +Z, matching the current app renderer. Mesh extras contain `kind` (`body`, `surface`, `outline`), `muscle`, `area`, optional `region`, and the muscle's `baseColor`.

Rebuilt from scratch against `stories/complete-example.jpg`: smooth parametric fan and spindle forms establish the musculature, rather than carving polygons out of a voxel body. A fused neutral core connects the head, hands, feet and joints. There are no facial muscle divisions. Each muscle/region export combines the corresponding original forms while retaining independent selection metadata. The lats and traps are each constructed as a continuous surface, then partitioned into heads with shared seam positions and normals. Their thin borders remain visible in both views. The trapezius is one bilateral sheet across the spine, extending to the skull base and both shoulder attachments. Other forms retain their existing construction for subsequent visual checkpoints. The app uses a smooth finish with minimal surface texture.

Region boundaries are schematic, particularly for deep muscles; they are not a medical anatomical model. Both body sides represent the same allocation and must not double workout totals. The renderer clones materials per selectable area before applying workout colors.

## Rebuild

From the repository root:

```bash
/home/nich/Applications/blender-5.2.2-linux-x64/blender --background --factory-startup --python-exit-code 1 --python frontend/scripts/blender/build_mannequin.py
```

Validate the exports with the app's Three.js loader:

```bash
cd frontend
node scripts/validate-blender-model.mjs
```

The build replaces these generated artifacts and writes temporary review renders to `/tmp/macrotracker-model-review/`. Copy the two GLBs to `frontend/public/models/` before rebuilding the web app. Blender may retain its usual `.blend1` previous-version backup.
