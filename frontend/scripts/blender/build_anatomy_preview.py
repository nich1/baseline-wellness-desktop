"""Build a bounded back/shoulder review from BodyParts3D via Human Atlas.

Run with Blender --background --python this-file. Source identity and licensing
are recorded in assets/anatomy-preview. This does not replace the full mannequin.
"""
import bpy
import bmesh
import json
import faulthandler
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
faulthandler.dump_traceback_later(45, repeat=True)

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/anatomy-preview'
PUBLIC = ROOT / 'frontend/public/models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .58
    return m

neutral = material('Neutral context', (.43, .49, .56))
muscle_mat = material('Workout surface', (.52, .59, .68))
seam_mat = material('Fine center seam', (.19, .23, .28))
objects = []
for part in json.loads((OUT / 'source.json').read_text()):
    print('Importing', part['id'], part['name'], flush=True)
    mesh = bpy.data.meshes.new(part['name'])
    # Atlas Y-up/front +Z -> Blender Z-up/front -Y.
    mesh.from_pydata([(x, -z, y) for x, y, z in part['vertices']], [], part['faces'])
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    # The checkpoint is a bust, with head/neck skin as neutral context only.
    cutoff = 1.50 if part['id'] == 'FJ2810' else 1.105
    plane_normal = Vector((0, -.85, 1)) if part['id'] == 'FJ2810' else Vector((0, 0, 1))
    result = bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        dist=.000001, plane_co=(0, 0, cutoff), plane_no=plane_normal, clear_inner=True)
    edges = [e for e in bm.edges if e.is_boundary and all(abs(plane_normal.dot(v.co-Vector((0, 0, cutoff)))) < .00001 for v in e.verts)]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    # Triangulate cut caps before subdivision; large ngons can stall OpenSubdiv.
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    if not mesh.polygons:
        bpy.data.meshes.remove(mesh)
        continue
    obj = bpy.data.objects.new(part['name'], mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    if part['mapping']:
        modifier = obj.modifiers.new('Smooth source facets', 'SUBSURF')
        modifier.levels = 1
        modifier.subdivision_type = 'CATMULL_CLARK'
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier = obj.modifiers.new('Soften scan surface', 'SMOOTH')
    modifier.factor = .6
    modifier.iterations = 8
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.data.materials.append(muscle_mat if part['mapping'] else neutral)
    obj['kind'] = 'surface' if part['mapping'] else 'body'
    obj['sourceId'] = part['id']
    if part['mapping']:
        muscle, region = part['mapping']
        obj['muscle'] = muscle
        if region:
            obj['region'] = region
        obj['area'] = muscle + (':'+region if region else '')
    objects.append(obj)

# Reconcile overlapping source sheets into one continuous trapezius surface.
# Assign its faces back to the closest anatomical head, preserving shared
# coordinates/normals rather than separating heads with physical gaps.
original_traps = [o for o in objects if o.get('muscle') == 'traps']
depsgraph = bpy.context.evaluated_depsgraph_get()
references = [(o['region'], BVHTree.FromObject(o, depsgraph)) for o in original_traps]
bpy.ops.object.select_all(action='DESELECT')
copies = []
for obj in original_traps:
    clone = obj.copy()
    clone.data = obj.data.copy()
    bpy.context.collection.objects.link(clone)
    clone.select_set(True)
    copies.append(clone)
bpy.context.view_layer.objects.active = copies[0]
bpy.ops.object.join()
fused = bpy.context.object
modifier = fused.modifiers.new('Joined anatomical trap sheets', 'REMESH')
modifier.mode = 'VOXEL'
modifier.voxel_size = .0012
modifier.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
modifier = fused.modifiers.new('Continuous head transitions', 'SMOOTH')
modifier.factor = .7
modifier.iterations = 6
bpy.ops.object.modifier_apply(modifier=modifier.name)
for face in fused.data.polygons:
    face.use_smooth = True
fused.data.update()
regions = {'upper': [], 'middle': [], 'lower': []}
face_region = {}
for face in fused.data.polygons:
    nearest = min(references, key=lambda item: item[1].find_nearest(face.center)[3])
    regions[nearest[0]].append(face)
    face_region[face.index] = nearest[0]
# Thin lines mark the shared head boundaries without moving either surface.
edge_regions = {}
for face in fused.data.polygons:
    for edge in face.edge_keys:
        edge_regions.setdefault(edge, set()).add(face_region[face.index])
curve = bpy.data.curves.new('Trap head boundaries', 'CURVE')
curve.dimensions = '3D'
curve.bevel_depth = .00018
curve.bevel_resolution = 1
for edge, assignments in edge_regions.items():
    if len(assignments) < 2:
        continue
    vertices = [fused.data.vertices[i] for i in edge]
    if sum(v.normal.y for v in vertices) < .4:
        continue
    spline = curve.splines.new('POLY')
    spline.points.add(1)
    for point, vertex in zip(spline.points, vertices):
        point.co = (*(vertex.co + vertex.normal*.00012), 1)
boundary = bpy.data.objects.new('Trap head boundaries', curve)
bpy.context.collection.objects.link(boundary)
boundary.data.materials.append(seam_mat)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = boundary
boundary.select_set(True)
bpy.ops.object.convert(target='MESH')
boundary = bpy.context.object
boundary['kind'] = 'body'
objects.append(boundary)
for region, faces in regions.items():
    used = sorted({i for f in faces for i in f.vertices})
    lookup = {i: j for j, i in enumerate(used)}
    mesh = bpy.data.meshes.new('Continuous traps '+region)
    mesh.from_pydata([fused.data.vertices[i].co for i in used], [], [[lookup[i] for i in f.vertices] for f in faces])
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.normals_split_custom_set_from_vertices([fused.data.vertices[i].normal for i in used])
    mesh.materials.append(muscle_mat)
    obj = bpy.data.objects.new('Trapezius · '+region, mesh)
    bpy.context.collection.objects.link(obj)
    obj['kind'] = 'surface'
    obj['muscle'] = 'traps'
    obj['region'] = region
    obj['area'] = 'traps:'+region
    obj['sourceId'] = ','.join(o['sourceId'] for o in original_traps if o['region'] == region)
    objects.append(obj)
for obj in original_traps:
    objects.remove(obj)
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.data.objects.remove(fused, do_unlink=True)

# An understated interior closes missing context without representing an
# additional workout muscle (the downloaded dataset has no latissimus entry).
for name, center, scale in [('Neutral torso interior', (0, .014, 1.265), (.126, .065, .18)),
                            ('Neutral neck interior', (0, .018, 1.514), (.029, .020, .092))]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=32, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if 'torso' in name:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces), dist=.000001,
            plane_co=(0, 0, 1.105), plane_no=(0, 0, 1), clear_inner=True)
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
        bm.to_mesh(obj.data)
        bm.free()
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.data.materials.append(neutral)
    obj['kind'] = 'body'
    objects.append(obj)

# Follow the actual posterior surface. A hairline, not an added spinal ridge.
traps = [o for o in objects if o.get('muscle') == 'traps']
points = []
for i in range(160):
    z = 1.15 + i / 159 * .425
    hits = []
    for obj in traps:
        hit, p, normal, face = obj.ray_cast(Vector((0, .4, z)), Vector((0, -1, 0)))
        if hit:
            hits.append(p)
    if hits:
        p = max(hits, key=lambda p: p.y)
        points.append((p.x, p.y+.00012, p.z))
curve = bpy.data.curves.new('Trapezius center seam', 'CURVE')
curve.dimensions = '3D'
curve.bevel_depth = .00020
curve.bevel_resolution = 2
spline = curve.splines.new('POLY')
spline.points.add(len(points)-1)
for point, co in zip(spline.points, points):
    point.co = (*co, 1)
seam = bpy.data.objects.new('Trapezius center seam', curve)
bpy.context.collection.objects.link(seam)
seam.data.materials.append(seam_mat)
bpy.context.view_layer.objects.active = seam
seam.select_set(True)
bpy.ops.object.convert(target='MESH')
seam = bpy.context.object
seam['kind'] = 'body'
objects.append(seam)

for mode in ['regions', 'muscles']:
    for obj in objects:
        if obj.get('muscle'):
            region = obj.get('region')
            obj['area'] = obj['muscle'] + (':'+region if region and mode == 'regions' else '')
            # Keep the original region for editing, but whole mode uses one ID.
            if region:
                obj['sourceRegion'] = region
                if mode == 'muscles':
                    del obj['region']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC / f'anatomy-preview-{mode}.glb'),
        export_format='GLB', use_selection=True, export_extras=True,
        export_cameras=False, export_lights=False)

for obj in objects:
    if obj.get('sourceRegion'):
        obj['region'] = obj['sourceRegion']
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 20
scene.cycles.use_denoising = True
scene.render.resolution_x = 1100
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.world.color = (.15, .15, .15)
def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()
for loc, power in [((2, 3, 3), 220), ((-2, 2, 2), 110), ((1, -3, 2), 170)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    light = bpy.context.object
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = 2
    aim(light, (0, 0, 1.42))
bpy.ops.object.camera_add(location=(0, 3, 1.42))
camera = bpy.context.object
camera.data.type = 'ORTHO'
camera.data.ortho_scale = .79
aim(camera, (0, 0, 1.42))
scene.camera = camera
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'preview.blend'))
scene.render.filepath = '/tmp/anatomy-preview-back.png'
bpy.ops.render.render(write_still=True)
camera.location = (2, 3, 1.5)
aim(camera, (0, 0, 1.42))
scene.render.filepath = '/tmp/anatomy-preview-angle.png'
bpy.ops.render.render(write_still=True)
