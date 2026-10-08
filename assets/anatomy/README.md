# Main anatomical mannequin

The default Muscle map uses `frontend/public/models/anatomy-regions.glb` for
both muscle-group and regional views, avoiding two copies of full-body geometry.
The offline whole-group export is retained as `anatomy-muscles.glb` for validation.
The viewer now offers only the full model; the temporary comparison UI is removed.

Source: BodyParts3D 4.0 via [Human Atlas](https://github.com/ashemag/human-atlas).
See `frontend/public/models/anatomy-attribution.txt` for CC BY 4.0 attribution and
adaptations. `source-manifest.json` records source IDs and the upstream manifest
hash; `source.json` contains the selected source geometry.

Rebuild from the checked-in source:

```
/home/nich/Applications/blender-5.2.2-linux-x64/blender --background --factory-startup --python-exit-code 1 --python frontend/scripts/blender/build_anatomy.py
```

The approved continuous trapezius and its boundaries are loaded from
`assets/anatomy-preview/preview.blend`. `mannequin.blend` stores the editable full
assembly. Internal front/back/side renders go to `/tmp/anatomy-main-*.png`.

Source anatomy supplies most groups. Missing lats, abdominal regions, multifidus,
quadratus lumborum and internal obliques are explicitly tagged `schematic` and
fitted to the body envelope. Glute medius/minimus are partitioned into posterior
and lateral portions to represent the two existing accounting groups without
overlapping duplicate surfaces. Deeper heads remain anatomically positioned;
selecting a region reveals it through overlying geometry.

Validation:

```
cd frontend
node scripts/validate-anatomy.mjs
node scripts/mannequin-data.test.mjs
python scripts/mannequin-smoke.py
```

The original procedural model and its builder remain archived under
`assets/mannequin` and `scripts/blender/build_mannequin.py`; the app no longer
loads those assets. Update this anatomical builder for future visual changes.

Upper-lat refinement: above 1.205 m, the authored sheet smoothly turns forward
and tapers toward an attachment guide on the source teres-major insertion. This
replaces the former raised upper edge on the outer skin envelope. The other 54
selectable regions retain identical vertex positions to the approved full model.

Pelvis refinement: the rounded filler was replaced with a shorter tapered neutral
volume whose lower edge is tucked above the lower glute contour. Workout muscle
surfaces are unchanged. The approved preview blend remains a build dependency
for the trapezius geometry; it is no longer an in-app viewing mode.

Face refinement: the source eye sockets and lip detail are replaced by a smooth
convex head envelope, with an internal overlap into the retained neck. Separate
eye meshes are removed; no facial muscle map is introduced. Muscle geometry is
unchanged. A temporary face close-up renders to `/tmp/anatomy-face-detail.png`.

Arm refinement: the contracted neutral skin web under each shoulder is replaced
with a smooth interior following the upper-arm axis. Shoulder and elbow context
are retained. Biceps donor meshes are cleaned of isolated vertices, then rebuilt
as a rounded continuous belly with a shared long/short-head boundary and tapered
attachment ends. The 54 other muscle regions retain identical positions.
