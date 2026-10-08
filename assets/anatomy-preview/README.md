# Back and shoulders checkpoint

Adapted BodyParts3D 4.0 anatomy from https://github.com/ashemag/human-atlas.
Attribution and adaptation details: ../../frontend/public/models/anatomy-attribution.txt.

`source.json` preserves the selected source element IDs, names, indexed geometry,
and workout mapping. Coordinates are meters, Y up, front +Z. No repository viewer
code is included. `preview.blend` is the editable assembled bust. Rebuild with:

```
/home/nich/Applications/blender-5.2.2-linux-x64/blender --background --factory-startup --python-exit-code 1 --python frontend/scripts/blender/build_anatomy_preview.py
```

The app has a comparison control; its existing full model remains available.
This checkpoint maps traps (all three source subdivisions), front/side/rear
deltoids, and upper back. Deeper structures retain their source positions and may
be hidden beneath superficial muscles. No latissimus entry was found in this
source manifest, so lats are deliberately outside this checkpoint. This is not
yet a full-body replacement. Internal render previews are saved only under /tmp.
