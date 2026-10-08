"""Full workout mannequin adapted from BodyParts3D / Human Atlas.

The approved preview supplies unchanged traps. Source muscles supply the limbs,
chest and glutes. Missing structures are explicitly tagged schematic and fitted
to the source skin envelope. Run in Blender background mode.
"""
import bpy
import bmesh
import json
import math
import re
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/anatomy'
PUBLIC = ROOT / 'frontend/public/models'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    node = m.node_tree.nodes['Principled BSDF']
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = .58
    return m

neutral = material('Neutral anatomy', (.43, .49, .56))
surface = material('Workout anatomy', (.52, .59, .68))
line_mat = material('Fine anatomical boundaries', (.19, .23, .28))
objects = []

def mesh_object(name, vertices, faces, mapping=None, source_id=None, schematic=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for face in mesh.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj['kind'] = 'surface' if mapping else 'body'
    obj.data.materials.append(surface if mapping else neutral)
    if mapping:
        obj['muscle'], region = mapping
        if region:
            obj['region'] = region
        obj['area'] = mapping[0] + (':'+region if region else '')
    obj['sourceId'] = source_id or 'MacroTracker adaptation'
    if schematic:
        obj['schematic'] = True
    objects.append(obj)
    return obj

def apply(obj, kind, **values):
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new(kind, kind)
    for key, value in values.items():
        setattr(modifier, key, value)
    bpy.ops.object.modifier_apply(modifier=modifier.name)

def clean(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

parts = json.loads((OUT / 'source.json').read_text())
skin_part = next(p for p in parts if p['id'] == 'FJ2810')
skin = mesh_object('Skin reference', [(x,-z,y) for x,y,z in skin_part['vertices']], skin_part['faces'])
clean(skin)
skin_bvh = BVHTree.FromObject(skin, bpy.context.evaluated_depsgraph_get())
arm_shell_vertices={v.index for v in skin.data.vertices
    if 1.105<v.co.z<1.380 and abs(v.co.x)>.125}
# Contract cross-sections rather than following source vertex normals: the skin
# contains inner-facing surfaces as well as the outer envelope.
for vertex in skin.data.vertices:
    x,y,z = vertex.co
    side = 1 if x > 0 else -1
    if z > 1.49:
        if z < 1.60 and y > .02:
            vertex.co.x *= .68
            vertex.co.y = .022+(y-.022)*.60
    elif z < .13 or (abs(x) > .235 and z < .83):
        pass  # Neutral feet and hands keep the reference outline.
    elif z > .88 and abs(x) < .165:
        vertex.co.x *= .76
        vertex.co.y = .012+(y-.012)*.58
    else:
        if z > 1.045:
            center = side*(.22-(z-1.045)*.15)
        elif abs(x) > .19:
            center = side*(.28-(z-.83)*.25)
        else:
            center = side*.093
        vertex.co.x = center+(x-center)*.62
        vertex.co.y = .012+(y-.012)*.58
# Remove external pelvic detail from the neutral shell; the muscle geometry
# remains intact and a smooth inner pelvis fills this small context area.
bm=bmesh.new(); bm.from_mesh(skin.data)
bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index in arm_shell_vertices], context='VERTS')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if .70 < v.co.z < .96 and abs(v.co.x)<.14], context='VERTS')
bm.to_mesh(skin.data); bm.free()
skin.name = 'Neutral head, hands, feet and connective shell'
skin['sourceId'] = 'FJ2810'
apply(skin, 'SMOOTH', factor=.55, iterations=6)

# A convex outer head surface closes the eye sockets and removes the lip crease
# while retaining the source skull, nose and jaw envelope. Interior socket
# vertices cannot create holes or separate eye-shaped caps in this surface.
head_points=[v.co.copy() for v in skin.data.vertices if v.co.z>1.49]
# Overlap the retained neck internally so smoothing cannot open a collar gap.
head_points.extend(Vector((.028*math.cos(i*2*math.pi/32),
    .003+.025*math.sin(i*2*math.pi/32),1.465)) for i in range(32))
head_bm=bmesh.new()
for point in head_points: head_bm.verts.new(point)
bmesh.ops.convex_hull(head_bm,input=list(head_bm.verts),use_existing_faces=False)
bmesh.ops.delete(head_bm,geom=[v for v in head_bm.verts if not v.link_faces],context='VERTS')
bmesh.ops.recalc_face_normals(head_bm,faces=list(head_bm.faces))
head_bm.verts.ensure_lookup_table(); head_bm.verts.index_update()
head=mesh_object('Smooth neutral head',[v.co.copy() for v in head_bm.verts],
    [tuple(v.index for v in f.verts) for f in head_bm.faces],source_id='FJ2810 head envelope')
head_bm.free()
apply(head,'SUBSURF',levels=2)
apply(head,'SMOOTH',factor=.35,iterations=3)
bm=bmesh.new(); bm.from_mesh(skin.data)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z>1.49],context='VERTS')
bm.to_mesh(skin.data); bm.free(); skin.data.update()

def neutral_ellipsoid(name, center, scale):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=28,location=center)
    obj=bpy.context.object; obj.name=name; obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for face in obj.data.polygons: face.use_smooth=True
    obj.data.materials.append(neutral); obj['kind']='body'; objects.append(obj)
# A short tapered connective volume sits inside the hip musculature. The old
# ellipsoid hung below the glutes and read as a separate rounded appendage.
pelvis_sections = [
    (.849, .012, .009, -.008),
    (.867, .041, .021, -.006),
    (.891, .079, .032, -.003),
    (.918, .102, .043, .000),
    (.955, .108, .051, .004),
    (.988, .096, .048, .008),
]
pelvis_vertices=[]; pelvis_faces=[]; sides=40
for z,width,depth,offset in pelvis_sections:
    for i in range(sides):
        angle=2*math.pi*i/sides
        pelvis_vertices.append((width*math.cos(angle),offset+depth*math.sin(angle),z))
for ring in range(len(pelvis_sections)-1):
    for i in range(sides):
        a=ring*sides+i; b=ring*sides+(i+1)%sides
        pelvis_faces.append((a,b,b+sides,a+sides))
for ring,reverse in [(0,True),(len(pelvis_sections)-1,False)]:
    z,_,_,offset=pelvis_sections[ring]
    center=len(pelvis_vertices); pelvis_vertices.append((0,offset,z))
    for i in range(sides):
        face=(center,ring*sides+i,ring*sides+(i+1)%sides)
        pelvis_faces.append(tuple(reversed(face)) if reverse else face)
pelvis=mesh_object('Neutral pelvis',pelvis_vertices,pelvis_faces)
clean(pelvis)
apply(pelvis,'SUBSURF',levels=2)

# A single smooth inner arm replaces the contracted skin triangles that formed
# a web from the axilla down to the torso. Muscle surfaces establish the outside.
arm_sections=[
    (1.045,.233,.030,.015,.015),
    (1.085,.230,.030,.018,.018),
    (1.150,.217,.036,.023,.019),
    (1.240,.198,.027,.025,.020),
    (1.330,.183,.024,.025,.023),
    (1.385,.175,.020,.027,.026),
    (1.410,.170,.020,.023,.023),
]
for side in [-1,1]:
    vertices=[]; faces=[]; sides=40
    for z,cx,cy,rx,ry in arm_sections:
        for i in range(sides):
            angle=i*2*math.pi/sides
            vertices.append((side*cx+rx*math.cos(angle),cy+ry*math.sin(angle),z))
    for ring in range(len(arm_sections)-1):
        for i in range(sides):
            a=ring*sides+i; b=ring*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    for ring,reverse in [(0,True),(len(arm_sections)-1,False)]:
        z,cx,cy,_,_=arm_sections[ring]
        center=len(vertices); vertices.append((side*cx,cy,z))
        for i in range(sides):
            face=(center,ring*sides+i,ring*sides+(i+1)%sides)
            faces.append(tuple(reversed(face)) if reverse else face)
    core=mesh_object('Continuous upper-arm interior',vertices,faces)
    clean(core); apply(core,'SUBSURF',levels=2)

for part in parts:
    if part['id'] == 'FJ2810':
        continue
    print('Import', part['id'], part['name'], flush=True)
    obj = mesh_object(part['name'], [(x,-z,y) for x,y,z in part['vertices']],
                      part['faces'], part['mapping'], part['id'])
    if obj.get('muscle')=='chest':
        # Bring paired medial edges together without exposing a sternum trench.
        for v in obj.data.vertices:
            x=abs(v.co.x)
            if x<.05:
                v.co.x=(1 if v.co.x>0 else -1)*max(.0003,x-.012*(1-x/.05))
    if obj.get('muscle')=='obliques':
        # The reference includes a broad aponeurosis over the rectus area. Keep
        # the contractile lateral portion so our abdominal map remains visible.
        side=1 if sum(v.co.x for v in obj.data.vertices)>0 else -1
        bm=bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=(side*.052,0,0),plane_no=(side,0,0),dist=.000001,clear_inner=True)
        bm.to_mesh(obj.data); bm.free()
    if obj.get('muscle')=='biceps':
        # Give the anterior belly its rounded volume; taper displacement to
        # zero at the source shoulder tendons and elbow attachment.
        for v in obj.data.vertices:
            co=v.co.copy()
            t=max(0,min(1,(co.z-1.095)/.265))
            belly=math.sin(math.pi*t)**1.6
            front=max(0,min(1,(.028-co.y)/.034))
            co.y-=.016*belly*front
            v.co=co
        assert all(1.06<v.co.z<1.43 for v in obj.data.vertices), 'Invalid biceps reshape '+part['id']
    clean(obj)
    if obj.get('muscle')=='biceps':
        bm=bmesh.new(); bm.from_mesh(obj.data)
        # Welding the donor can leave an isolated vertex. Exclude it before
        # smoothing and reconstruction so it cannot stretch the hull.
        loose=[v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm,geom=loose,context='VERTS')
        bm.to_mesh(obj.data); bm.free(); obj.data.update()
        assert all(1.06<v.co.z<1.43 for v in obj.data.vertices), 'Invalid biceps clean '+part['id']
    original_count = len(obj.data.polygons)
    if part['mapping'] and obj.get('muscle')!='biceps':
        apply(obj, 'SUBSURF', levels=1)
    apply(obj, 'SMOOTH', factor=.6, iterations=8)
    # Smooth silhouettes with a bounded face count, retaining the fine source
    # geometry where it contributes to shape rather than exporting tessellation.
    target = min(original_count*1.15, 6000)
    if len(obj.data.polygons) > target and obj.get('muscle')!='biceps':
        apply(obj, 'DECIMATE', ratio=target/len(obj.data.polygons))

# Carry the approved continuous trap mesh and its lines over without reshaping.
with bpy.data.libraries.load(str(ROOT/'assets/anatomy-preview/preview.blend'), link=False) as (source, target):
    target.objects = [n for n in source.objects if n.startswith('Trapezius · ') or n in ['Trap head boundaries', 'Trapezius center seam']]
for obj in target.objects:
    bpy.context.collection.objects.link(obj)
    if obj.get('muscle'):
        obj['area'] = obj['muscle']+':'+obj['region']
    objects.append(obj)

def line(name, paths, region_only=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = .00020
    curve.bevel_resolution = 1
    for points in paths:
        if len(points) < 2:
            continue
        spline = curve.splines.new('POLY')
        spline.points.add(len(points)-1)
        for point, co in zip(spline.points, points):
            point.co = (*co, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(line_mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    obj = bpy.context.object
    obj['kind'] = 'body'
    obj['regionOnly'] = region_only
    objects.append(obj)

def partition(obj, classify, draw_lines=False):
    """Split labels on shared geometry, preserving vertex normals across seams."""
    mesh = obj.data
    assignments = {f.index: classify(f.center) for f in mesh.polygons}
    # Preserve coordinates and shared normals while constructing the separate
    # head meshes and their seam geometry.
    positions=[tuple(v.co) for v in mesh.vertices]
    normals=[tuple(v.normal) for v in mesh.vertices]
    groups = {}
    for face in mesh.polygons:
        groups.setdefault(assignments[face.index], []).append(tuple(face.vertices))
    if draw_lines:
        edges = {}
        for face in mesh.polygons:
            for edge in face.edge_keys:
                edges.setdefault(edge,set()).add(assignments[face.index])
        paths = [[mesh.vertices[i].co + mesh.vertices[i].normal*.00015 for i in edge]
                 for edge, labels in edges.items() if len(labels)>1]
        line(obj.name+' head seams', paths, True)
    for mapping, faces in groups.items():
        indices = sorted({i for f in faces for i in f})
        lookup = {i:j for j,i in enumerate(indices)}
        piece = mesh_object(obj.name+' '+str(mapping), [positions[i] for i in indices],
            [[lookup[i] for i in f] for f in faces], mapping,
            obj.get('sourceId'), obj.get('schematic',False))
        piece.data.normals_split_custom_set_from_vertices([normals[i] for i in indices])
    objects.remove(obj)
    bpy.data.objects.remove(obj, do_unlink=True)

# The two source heads previously read as isolated narrow strips. Reconcile
# them into one rounded belly, then split the coloring on a shared surface.
for side in [-1,1]:
    heads=[o for o in objects if o.get('muscle')=='biceps'
           and sum(v.co.x for v in o.data.vertices)*side>0]
    points=[v.co.copy() for o in heads for v in o.data.vertices]
    assert all(1.06<p.z<1.43 for p in points), 'Invalid source biceps '+str(side)
    bm=bmesh.new()
    for point in points: bm.verts.new(point)
    bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.verts.ensure_lookup_table(); bm.verts.index_update()
    belly=mesh_object('Continuous biceps belly',[v.co.copy() for v in bm.verts],
        [tuple(v.index for v in f.verts) for f in bm.faces],('biceps','long'),
        ','.join(o['sourceId'] for o in heads))
    bm.free()
    assert all(1.06<v.co.z<1.43 for v in belly.data.vertices), 'Invalid biceps hull '+str(side)
    apply(belly,'REMESH',mode='VOXEL',voxel_size=.0015,use_smooth_shade=True)
    assert all(1.06<v.co.z<1.43 for v in belly.data.vertices), 'Invalid biceps remesh '+str(side)
    apply(belly,'SMOOTH',factor=.6,iterations=5)
    if len(belly.data.polygons)>5500:
        apply(belly,'DECIMATE',ratio=5500/len(belly.data.polygons))
    assert all(1.06<v.co.z<1.43 for v in belly.data.vertices), 'Invalid biceps decimation '+str(side)
    for face in belly.data.polygons: face.use_smooth=True
    belly.data.update()
    # A straight cut on the sloped arm axis yields a fine, continuous head line.
    bm=bmesh.new(); bm.from_mesh(belly.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        dist=.0000001,plane_co=(side*.225,0,1.10),plane_no=(side,0,.22))
    bm.to_mesh(belly.data); bm.free(); belly.data.update()
    assert all(1.06<v.co.z<1.43 for v in belly.data.vertices), 'Invalid biceps cut '+str(side)
    partition(belly,lambda p: ('biceps','long' if side*p.x+.22*(p.z-1.10)>.225 else 'short'),True)
    for obj in heads:
        objects.remove(obj); bpy.data.objects.remove(obj,do_unlink=True)

# Glute medius/minimus appear in two user-defined accounting groups. Allocate
# posterior vs lateral/anterior portions so no coincident duplicate mesh can
# flicker or incorrectly compete for a click.
for obj in list(objects):
    if obj.get('muscle') == 'glutes' and obj.get('region') in ('medius','minimus'):
        region = obj['region']
        mid = sum(v.co.y for v in obj.data.vertices)/len(obj.data.vertices)
        partition(obj, lambda p: ('glutes' if p.y >= mid else 'abductors', region))

# The skin envelope sits behind the actual axillary attachment. Use the source
# teres-major insertion as the local attachment guide instead of leaving the
# upper lat on that outer envelope like a raised plate.
lat_insertions = {}
for side in [-1, 1]:
    guide = next(o for o in objects if o.get('sourceId') in ('FJ1507','FJ1507M')
                 and sum(v.co.x for v in o.data.vertices)*side > 0)
    tree = BVHTree.FromObject(guide, bpy.context.evaluated_depsgraph_get())
    point = tree.find_nearest(Vector((side*.172, .025, 1.344)))[0]
    lat_insertions[side] = point

def projected_patch(name, polygon, side, back, mapping, inset, divide=None):
    # Smooth the anatomical footprint, then project every point onto the source
    # body envelope. This makes the missing sheets conform to real proportions.
    for _ in range(2):
        polygon = [p for a,b in zip(polygon,polygon[1:]+polygon[:1])
                   for p in [(.75*a[0]+.25*b[0], .75*a[1]+.25*b[1]),
                             (.25*a[0]+.75*b[0], .25*a[1]+.75*b[1])]]
    center = (sum(p[0] for p in polygon)/len(polygon), sum(p[1] for p in polygon)/len(polygon))
    sign = 1 if back else -1
    def project(x,z):
        point, normal, index, distance = skin_bvh.ray_cast(Vector((side*x,sign*.5,z)), Vector((0,-sign,0)))
        # Clamp the footprint to the actual waist silhouette, including the
        # narrow gap between the trunk and the source model's lowered arms.
        for _ in range(30):
            if point is not None:
                break
            x *= .985
            point, normal, index, distance = skin_bvh.ray_cast(Vector((side*x,sign*.5,z)), Vector((0,-sign,0)))
        assert point is not None, f'{name}: source envelope missed at {x},{z}'
        point.y -= sign*inset
        if mapping[0] == 'lats':
            # Only the upper attachment changes. Gradually turn the sheet
            # forward into the armpit and taper into the source insertion.
            t = max(0, min(1, (z-1.205)/.118))
            blend = min(.97, t*t*(3-2*t))
            point = point.lerp(lat_insertions[side], blend)
        return point
    vertices = [project(*center)]
    rings, count = 18, len(polygon)
    for ring in range(1,rings+1):
        t = ring/rings
        for x,z in polygon:
            vertices.append(project(center[0]+(x-center[0])*t,center[1]+(z-center[1])*t))
    faces = [(0,1+i,1+(i+1)%count) for i in range(count)]
    for ring in range(rings-1):
        for i in range(count):
            a=1+ring*count+i; b=1+ring*count+(i+1)%count
            faces.append((a,a+count,b+count,b))
    obj = mesh_object(name, vertices, faces, mapping, 'FJ2810 envelope; authored anatomical sheet', True)
    # Orient outward before solidifying; the surface remains a connected sheet.
    if sum(f.normal.y for f in obj.data.polygons)*sign < 0:
        bm=bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.reverse_faces(bm,faces=list(bm.faces)); bm.to_mesh(obj.data); bm.free()
    if divide:
        bm=bmesh.new(); bm.from_mesh(obj.data)
        normal=(-side*.16,0,1) if mapping[0]=='lats' else (0,0,1)
        height=1.16 if mapping[0]=='lats' else 1.13
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=.0000001,plane_co=(0,0,height),plane_no=normal)
        bm.to_mesh(obj.data); bm.free()
    apply(obj, 'SOLIDIFY', thickness=.0025, offset=-1)
    for face in obj.data.polygons:
        face.use_smooth=True
    obj.data.update()
    if divide:
        partition(obj, divide, True)
    return obj

for side in [-1,1]:
    projected_patch('Latissimus',[(.0005,.969),(.070,.975),(.100,.995),(.139,1.101),
        (.164,1.237),(.166,1.310),(.139,1.337),(.111,1.258),(.053,1.182),(.012,1.115),(.0005,1.022)],
        side,True,('lats','lower'),.0015,
        lambda p: ('lats','upper' if p.z > 1.16+.16*abs(p.x) else 'lower'))
    projected_patch('Rectus abdominis',[(.0005,.916),(.032,.932),(.059,1.063),
        (.057,1.188),(.048,1.262),(.0005,1.271)],side,False,('abs','upper'),.004,
        lambda p: ('abs','upper' if p.z > 1.13 else 'lower'))
    projected_patch('Transverse abdominal region',[(.034,1.014),(.092,1.012),(.115,1.129),
        (.079,1.225),(.040,1.229)],side,False,('abs','transverse'),.026)
    projected_patch('Multifidus region',[(.003,.984),(.022,.997),(.025,1.15),(.014,1.232),
        (.003,1.223)],side,True,('lower_back','multifidus'),.027)
    projected_patch('Quadratus lumborum region',[(.033,1.004),(.076,1.009),(.088,1.118),
        (.065,1.191),(.033,1.179)],side,True,('lower_back','quadratus_lumborum'),.026)
    # The upper/lower abs split is a training region, not a separation in tissue.
    for height in [1.063,1.194]:
        points=[]
        for i in range(26):
            x=side*(.006+.042*i/25)
            hit=skin_bvh.ray_cast(Vector((x,-.5,height)),Vector((0,1,0)))[0]
            if hit:
                points.append((x,hit.y+.0038,height))
        line('Rectus tendinous marking', [points])

# A schematic deeper sheet follows each real external oblique exactly, inset.
for obj in list(objects):
    if obj.get('muscle')=='obliques' and obj.get('region')=='external':
        copy=mesh_object('Internal oblique region',
            [v.co-v.normal*.007 for v in obj.data.vertices],
            [tuple(f.vertices) for f in obj.data.polygons], ('obliques','internal'),obj['sourceId'],True)

# A subtle anterior midline unites the paired chest and abdominal sheets.
points=[]
for i in range(100):
    z=.986+i/99*.393
    hit=skin_bvh.ray_cast(Vector((0,-.5,z)),Vector((0,1,0)))[0]
    if hit:
        points.append((0,hit.y+.012,z))
line('Anterior center line',[points])

def joined(name, members):
    copies=[]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in members:
        clone=obj.copy(); clone.data=obj.data.copy()
        bpy.context.collection.objects.link(clone); clone.select_set(True); copies.append(clone)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join()
    result=bpy.context.object; result.name=name
    # Consolidate the material slot so a region remains a single hit target.
    mat=result.data.materials[0]; result.data.materials.clear(); result.data.materials.append(mat)
    for face in result.data.polygons:
        face.material_index=0
    result.data.validate(clean_customdata=False)
    result.data.update()
    return result

definitions=(ROOT/'frontend/lib/tension.ts').read_text()
muscles=[key for key in re.findall(r'\["([a-z_]+)", "[^"]+", "#[a-f0-9]+"\]',definitions)]
text=definitions.split('export const muscleRegions:')[1].split('// Store only')[0]
regions={key:re.findall(r'id: "([^"]+)"',body) for key,body in re.findall(r'  (\w+): \[(.*?)\]',text,re.S)}
report={}
for mode in ['muscles','regions']:
    exports=[]
    body=joined('Neutral anatomy', [o for o in objects if o.get('kind')=='body' and (mode=='regions' or not o.get('regionOnly'))])
    for key in list(body.keys()): del body[key]
    body['kind']='body'; exports.append(body)
    for muscle in muscles:
        for region in regions.get(muscle,[None]) if mode=='regions' else [None]:
            area=muscle+(':'+region if region else '')
            chosen=[o for o in objects if o.get('muscle')==muscle and (mode=='muscles' or o.get('region')==region)]
            assert chosen, 'Missing workout mapping: '+area
            obj=joined(area,chosen)
            for key in list(obj.keys()): del obj[key]
            obj['kind']='surface'; obj['muscle']=muscle; obj['area']=area
            obj['sourceId']=','.join(sorted({o.get('sourceId','') for o in chosen}))
            if region: obj['region']=region
            if any(o.get('schematic') for o in chosen): obj['schematic']=True
            exports.append(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in exports: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(PUBLIC/f'anatomy-{mode}.glb'),export_format='GLB',
        use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
    report[mode]={'areas':len(exports)-1,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in exports)}
    for obj in exports: bpy.data.objects.remove(obj,do_unlink=True)

(OUT/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print('EXPORTS',report,flush=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
scene.render.resolution_x=1000; scene.render.resolution_y=1400; scene.render.resolution_percentage=100
scene.world.color=(.15,.15,.15)
def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
for loc,power in [((2,-3,3.5),250),((-2,-2,2),120),((1,3,3),240),((-2,2,2),120)]:
    bpy.ops.object.light_add(type='AREA',location=loc); light=bpy.context.object
    light.data.energy=power; light.data.size=2; aim(light,(0,0,.9))
bpy.ops.object.camera_add(location=(0,-3,.86)); camera=bpy.context.object
camera.data.type='ORTHO'; camera.data.ortho_scale=1.91; scene.camera=camera
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mannequin.blend'))
for name,location in [('front',(0,-3,.86)),('back',(0,3,.86)),('side',(3,0,.86))]:
    camera.location=location; aim(camera,(0,0,.86))
    scene.render.filepath=f'/tmp/anatomy-main-{name}.png'; bpy.ops.render.render(write_still=True)
camera.location=(0,-3,1.60); aim(camera,(0,0,1.60)); camera.data.ortho_scale=.28
scene.render.filepath='/tmp/anatomy-face-detail.png'; bpy.ops.render.render(write_still=True)
print('ANATOMY_COMPLETE',flush=True)
