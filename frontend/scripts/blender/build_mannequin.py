"""Original anatomical mannequin built from parametric muscle forms in Blender.

Rebuilt from scratch against stories/complete-example.jpg. Coordinates: meters,
Z up, front -Y. No downloaded meshes or face-muscle geometry. Temporary reviews
live in /tmp; only editable geometry and exports are saved in the project.
"""
import bpy
import bmesh
import math
import json
import re
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/mannequin'; OUT.mkdir(exist_ok=True,parents=True)
PREVIEW=Path('/tmp/macrotracker-model-review'); PREVIEW.mkdir(exist_ok=True)
text=(ROOT/'frontend/lib/tension.ts').read_text()
MUSCLES={key:{'label':label,'color':color} for key,label,color in re.findall(r'\["([a-z_]+)", "([^"]+)", "(#[a-f0-9]+)"\]',text)}
region_text=text.split('export const muscleRegions:')[1].split('// Store only')[0]
REGIONS={key:[i for i in re.findall(r'id: "([^"]+)"',value)] for key,value in re.findall(r'  (\w+): \[(.*?)\]',region_text,re.S)}

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
def collection(name):
    c=bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c
core_collection=collection('01 · Neutral head, joints and tendons')
source_collection=collection('02 · Individually shaped muscles')
whole_collection=collection('03 · Whole muscle export')
region_collection=collection('04 · Region export')
studio_collection=collection('05 · Review studio')

def move(obj,c):
    for prev in list(obj.users_collection): prev.objects.unlink(obj)
    c.objects.link(obj)

def material(name,color,roughness=.53):
    m=bpy.data.materials.new(name); m.use_nodes=True
    def linear(v): return v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4
    rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    m.diffuse_color=(*rgb,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*[linear(v) for v in rgb],1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=roughness
    return m
bone_mat=material('Neutral connective surfaces','#c5c9ce',.63)
muscle_mat=material('Neutral muscle forms','#b9c4d1',.52)
seam_mat=material('Soft anatomical boundaries','#8796a6',.75)
core=[]; muscles=[]; boundaries=[]

def mesh_object(name,vertices,faces,c,mat=bone_mat,uv=None,recalc=True):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.update()
    if recalc:
        bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(mesh); bm.free()
    for face in mesh.polygons: face.use_smooth=True
    if uv:
        layer=mesh.uv_layers.new(name='Muscle flow')
        for loop in mesh.loops: layer.data[loop.index].uv=uv[loop.vertex_index]
    mesh.materials.append(mat)
    obj=bpy.data.objects.new(name,mesh); c.objects.link(obj); return obj

# Monotone cubic interpolation produces smooth silhouettes without overshooting
# thin tendon or joint landmarks.
def interp(rows,t):
    i=next((i for i in range(len(rows)-1) if rows[i+1][0]>=t),len(rows)-2)
    a,b=rows[i:i+2]; h=b[0]-a[0]; u=max(0,min(1,(t-a[0])/h)); result=[]
    for k in range(1,len(a)):
        slope=(b[k]-a[k])/h
        prev=(a[k]-rows[i-1][k])/(a[0]-rows[i-1][0]) if i else slope
        nxt=(rows[i+2][k]-b[k])/(rows[i+2][0]-b[0]) if i+2<len(rows) else slope
        def tangent(x,y): return 0 if x*y<=0 else 2*x*y/(x+y)
        m0=tangent(prev,slope)*h; m1=tangent(slope,nxt)*h
        result.append((2*u**3-3*u*u+1)*a[k]+(u**3-2*u*u+u)*m0+(-2*u**3+3*u*u)*b[k]+(u**3-u*u)*m1)
    return result

def loft(name,rows,start=(0,0,0),end=None,rings=72,sides=40):
    start=Vector(start); rotation=(Vector(end)-start).to_track_quat('Z','Y') if end else None
    verts=[]; faces=[]
    for j in range(rings+1):
        z=rows[0][0]+(rows[-1][0]-rows[0][0])*j/rings
        w,d,offset=interp(rows,z)
        for k in range(sides):
            angle=2*math.pi*k/sides; p=Vector((w*math.cos(angle),d*math.sin(angle)+offset,z))
            verts.append(tuple(start+(rotation@p if rotation else p)))
    for j in range(rings):
        for k in range(sides):
            a=j*sides+k; b=j*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(rings*sides+k for k in range(sides))])
    obj=mesh_object(name,verts,faces,core_collection); core.append(obj); return obj

def ellipsoid(name,center,scale):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=center)
    obj=bpy.context.object; obj.name=name; obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for face in obj.data.polygons: face.use_smooth=True
    obj.data.materials.append(bone_mat); move(obj,core_collection); core.append(obj); return obj

# Slim connective core. The muscle surfaces establish the outer silhouette.
torso_rows=[(.885,.066,.064,0),(.947,.131,.091,.012),(1.015,.135,.088,.008),
 (1.10,.119,.081,.002),(1.20,.138,.092,0),(1.30,.177,.108,0),
 (1.39,.204,.110,.004),(1.455,.190,.086,.008),(1.485,.113,.058,.006),
 (1.535,.046,.042,.004),(1.595,.042,.040,.004)]
loft('Deep torso',[(z,w*.965,d*.93,y) for z,w,d,y in torso_rows],rings=130,sides=64)

# Head has a rounded cranium, temples, cheek plane, jaw and chin matching the
# reference proportions; its face stays smooth and has no muscle map.
loft('Smooth mannequin head',[(1.573,.026,.027,-.015),(1.593,.039,.043,-.012),
 (1.616,.049,.055,-.005),(1.643,.065,.068,.002),(1.67,.073,.074,.005),
 (1.704,.075,.083,.010),(1.738,.073,.081,.012),(1.768,.062,.068,.012),
 (1.790,.038,.044,.011),(1.801,.008,.011,.01)],rings=105,sides=64)
# Subtle integrated nasal ridge; no lips, eyes, facial-muscle divisions or mask.
for vertex in core[-1].data.vertices:
    x,y,z=vertex.co
    if y<-.035:
        vertex.co.y-=.016*math.exp(-(x/.014)**2-((z-1.666)/.026)**2)
core[-1].data.update()

# Surface coordinates use the torso ellipse, and each muscle adds its own soft
# thickness. The whole mesh is never voxelized or cut into jagged face subsets.
def torso_surface(side,back=False):
    def surface(u,z,bulge=0):
        width,depth,offset=interp(torso_rows,z)
        x=u*side
        q=min(.985,abs(u)/width)
        y=(1 if back else -1)*depth*math.sqrt(max(.02,1-q*q))+offset
        normal=Vector((side*u/(width*width),(y-offset)/(depth*depth),0)).normalized()
        return Vector((x,y,z))+normal*bulge
    return surface

def rounded(poly,amount=.18,samples=5):
    result=[]
    for i,current in enumerate(poly):
        c=Vector(current); a=c.lerp(Vector(poly[i-1]),amount); b=c.lerp(Vector(poly[(i+1)%len(poly)]),amount)
        for j in range(samples):
            t=j/samples; result.append((1-t)**2*a+2*(1-t)*t*c+t*t*b)
    return result

# A smooth disk parameterization: continuously rounded borders, outward muscle
# volume, and a recessed closed underside. No raised armor plates or box cuts.
def patch(muscle,region,poly,surface,belly=.014,rounding=.18):
    border=rounded(poly,rounding,6); center=sum(border,Vector((0,0)))/len(border)
    nr=12; ns=len(border); verts=[]; uv=[]; faces=[]
    cx=(min(p.x for p in border)+max(p.x for p in border))/2
    cy=(min(p.y for p in border)+max(p.y for p in border))/2
    wx=max(.001,(max(p.x for p in border)-min(p.x for p in border))*.53)
    wy=max(.001,(max(p.y for p in border)-min(p.y for p in border))*.53)
    def point(q,r):
        # Evaluate fullness in anatomical coordinates, not radial mesh rings,
        # which would create triangular ridges on long or fan-shaped muscles.
        dome=math.exp(-1.3*((q.x-cx)/wx)**2-1.3*((q.y-cy)/wy)**2)
        edge=min(1,max(0,(1-r)*6)); edge=edge*edge*(3-2*edge)
        return surface(q.x,q.y,.0008+belly*dome*edge)
    verts.append(tuple(point(center,0))); uv.append((center.x*5,center.y*2))
    for j in range(1,nr+1):
        r=j/nr
        for p in border:
            q=center.lerp(p,r); verts.append(tuple(point(q,r))); uv.append((q.x*5,q.y*2))
    for k in range(ns): faces.append((0,1+k,1+(k+1)%ns))
    for j in range(nr-1):
        for k in range(ns):
            a=1+j*ns+k; b=1+j*ns+(k+1)%ns; faces.append((a,b,b+ns,a+ns))
    # Close below the surface so edges have soft physical thickness.
    underside=len(verts); verts.append(tuple(surface(center.x,center.y,-.004))); uv.append((center.x*5,center.y*2))
    for k in range(ns): faces.append((underside,1+(nr-1)*ns+(k+1)%ns,1+(nr-1)*ns+k))
    area=muscle+(':'+region if region else '')
    obj=mesh_object(area,verts,faces,source_collection,muscle_mat,uv)
    # Round the entire closed form, including its insertion and edge roll-off.
    bpy.context.view_layer.objects.active=obj
    modifier=obj.modifiers.new('Organic surface smoothing','SUBSURF'); modifier.levels=1
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    modifier=obj.modifiers.new('Compact smooth surface','DECIMATE'); modifier.ratio=.36
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    for face in obj.data.polygons: face.use_smooth=True
    obj['muscle']=muscle; obj['area']=area; obj['kind']='surface'; obj['baseColor']=MUSCLES[muscle]['color']
    if region: obj['region']=region
    muscles.append(obj)
    curve=bpy.data.curves.new(area+' · edge','CURVE'); curve.dimensions='3D'; curve.bevel_depth=.00022; curve.bevel_resolution=1
    spline=curve.splines.new('POLY'); spline.points.add(len(border)-1); spline.use_cyclic_u=True
    for p,q in zip(spline.points,border): p.co=(*surface(q.x,q.y,.00115),1)
    edge=bpy.data.objects.new(curve.name,curve); source_collection.objects.link(edge); edge.data.materials.append(seam_mat)
    for key in obj.keys(): edge[key]=obj[key]
    edge['kind']='outline'
    bpy.ops.object.select_all(action='DESELECT'); edge.select_set(True); bpy.context.view_layer.objects.active=edge
    bpy.ops.object.convert(target='MESH'); boundaries.append(bpy.context.object)
    return obj

def continuous_regions(muscle,poly,surface,cuts,regions,belly):
    """Shape a single muscle first; divide its faces without moving the seams.

    Adjacent heads inherit identical seam positions and normals. There is no
    separate bevel, gap, cap or per-head bulge at an internal division.
    """
    whole=patch(muscle,None,poly,surface,belly,.20)
    muscles.remove(whole)
    old_border=boundaries.pop(); bpy.data.objects.remove(old_border,do_unlink=True)
    bm=bmesh.new(); bm.from_mesh(whole.data)
    for height,slope in cuts:
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=(0,0,height),plane_no=(-side*slope,0,1),dist=1e-7,
            clear_inner=False,clear_outer=False)
    bm.normal_update(); bm.to_mesh(whole.data); bm.free(); whole.data.update()
    mesh=whole.data
    positions=[v.co.copy() for v in mesh.vertices]
    normals=[v.normal.copy() for v in mesh.vertices]
    uv=[(0,0)]*len(positions)
    for loop in mesh.loops: uv[loop.vertex_index]=tuple(mesh.uv_layers.active.data[loop.index].uv)
    partitions=[[] for _ in regions]
    for face in mesh.polygons:
        x,y,z=face.center
        n=sum(z-slope*abs(x)>height for height,slope in cuts)
        partitions[n].append(tuple(face.vertices))
    for region,faces in zip(regions,partitions):
        area=muscle+':'+region
        used=sorted({v for face in faces for v in face}); mapping={v:i for i,v in enumerate(used)}
        obj=mesh_object(area,[positions[v] for v in used],
            [tuple(mapping[v] for v in face) for face in faces],source_collection,muscle_mat,[uv[v] for v in used],recalc=False)
        obj.data.normals_split_custom_set_from_vertices([normals[v] for v in used])
        obj['muscle']=muscle; obj['region']=region; obj['area']=area
        obj['kind']='surface'; obj['continuous']=True; obj['baseColor']=MUSCLES[muscle]['color']
        muscles.append(obj)
        # Trace actual mesh boundaries, including the shared, flush head seams.
        counts={}
        for face in faces:
            for j,a in enumerate(face):
                edge=tuple(sorted((a,face[(j+1)%len(face)]))); counts[edge]=counts.get(edge,0)+1
        edges={e for e,n in counts.items() if n==1}; neighbors={}
        for a,b in edges:
            neighbors.setdefault(a,set()).add(b); neighbors.setdefault(b,set()).add(a)
        curve=bpy.data.curves.new(area+' · fine seams','CURVE'); curve.dimensions='3D'
        curve.bevel_depth=.00028; curve.bevel_resolution=1
        while edges:
            a,b=next(iter(edges)); edges.remove((a,b)); path=[a,b]; closed=False
            while True:
                nexts=[v for v in neighbors[path[-1]] if tuple(sorted((path[-1],v))) in edges]
                if not nexts: break
                v=min(nexts); edges.remove(tuple(sorted((path[-1],v))))
                if v==path[0]: closed=True; break
                path.append(v)
            spline=curve.splines.new('POLY'); spline.points.add(len(path)-1); spline.use_cyclic_u=closed
            for point,v in zip(spline.points,path): point.co=(*(positions[v]+normals[v]*.00045),1)
        edge=bpy.data.objects.new(curve.name,curve); source_collection.objects.link(edge); edge.data.materials.append(seam_mat)
        for key in obj.keys(): edge[key]=obj[key]
        edge['kind']='outline'
        bpy.ops.object.select_all(action='DESELECT'); edge.select_set(True); bpy.context.view_layer.objects.active=edge
        bpy.ops.object.convert(target='MESH'); boundaries.append(bpy.context.object)
    bpy.data.objects.remove(whole,do_unlink=True)

def limb(name,start,end,rows,side):
    a=Vector(start); b=Vector(end); axis=(b-a).normalized(); length=(b-a).length
    across=Vector((axis.z,0,-axis.x)).normalized()*side
    front=Vector((0,-1,0))
    loft(name+' · tendon core',[(t*length,w*.92,d*.92,0) for t,w,d in rows],start=a,end=b,rings=70,sides=32)
    def surface(angle,t,bulge=0):
        w,d=interp(rows,t)
        p=a+(b-a)*t
        n=(across*math.sin(angle)+front*math.cos(angle)).normalized()
        return p+across*(w*math.sin(angle))+front*(d*math.cos(angle))+n*bulge
    return surface

def spindle(muscle,region,surface,angle,low,high,width,belly=.010,lean=0):
    # Long fusiform bellies with narrow tendon insertions, not ellipsoid blobs.
    h=high-low
    points=[(angle-width*.12,low),(angle+width*.22,low+h*.14),
      (angle+width*.53+lean*.45,low+h*.48),(angle+width*.46+lean*.8,low+h*.77),
      (angle+lean,high),(angle-width*.43+lean*.8,low+h*.82),
      (angle-width*.56+lean*.40,low+h*.46),(angle-width*.24,low+h*.13)]
    return patch(muscle,region,points,surface,belly,.27)

print('MODEL: building fresh anatomical forms',flush=True)
for side in (-1,1):
    S=lambda x,y,z: (side*x,y,z)
    ellipsoid('Ear',S(.074,.007,1.665),(.010,.015,.025))
    # Neck tendons give the reference its characteristic slender neck.
    a=Vector(S(.032,-.019,1.594)); b=Vector(S(.008,-.043,1.487)); length=(a-b).length
    loft('Sternocleidomastoid',[(0,.003,.004,0),(length*.5,.007,.006,0),(length,.004,.004,0)],start=b,end=a,rings=35,sides=20)
    F=torso_surface(side); B=torso_surface(side,True)
    def chest(u,z,bulge=0):
        mound=.025*math.exp(-((u-.102)/.110)**2-((z-1.375)/.083)**2)
        return F(u,z,bulge+mound)

    def glute(u,z,bulge=0):
        q=((u-.075)/.084)**2+((z-.927)/.094)**2
        y=.053+.064*math.sqrt(max(.035,1-q))
        return Vector((side*u,y+bulge*.3,z))
    # Three pectoral fans meet at the upper-arm insertion instead of equal strips.
    patch('chest','clavicular',[(.005,1.461),(.080,1.466),(.190,1.453),(.208,1.417),(.109,1.432),(.006,1.432)],chest,.003,.20)
    patch('chest','middle',[(.006,1.428),(.109,1.429),(.207,1.416),(.166,1.373),(.070,1.314),(.006,1.337)],chest,.004,.22)
    patch('chest','lower',[(.008,1.333),(.069,1.310),(.166,1.369),(.192,1.393),(.133,1.310),(.073,1.282),(.008,1.311)],chest,.003,.22)
    # Closely spaced rectus segments and a tapered lower abdominal wall.
    for z,w,h in [(1.275,.047,.043),(1.229,.045,.043),(1.183,.043,.044),(1.137,.041,.043),(1.092,.037,.042)]:
        region='upper' if z>1.19 else 'lower'
        patch('abs',region,[(.004,z+h*.45),(w*.88,z+h*.54),(w,z-h*.42),(.004,z-h*.49)],F,.007,.25)
    patch('abs','transverse',[(.004,1.068),(.035,1.066),(.041,1.025),(.013,.970),(.004,.958)],F,.006,.22)
    patch('obliques','external',[(.056,1.276),(.156,1.322),(.148,1.244),(.117,1.145),(.119,1.046),(.044,.979),(.047,1.125)],F,.009,.16)
    patch('obliques','internal',[(.047,.978),(.120,1.041),(.133,.994),(.093,.952),(.036,.957)],F,.007,.20)
    # Serrated rib-side forms remain in the oblique group.
    for j in range(3):
        z=1.315-j*.035
        patch('obliques','external',[(.147,z),(.181,z+.035),(.173,z-.006),(.140,z-.019)],F,.006,.24)
    patch('upper_back','infraspinatus',[(.107,1.408),(.151,1.419),(.192,1.399),(.184,1.355),(.101,1.344),(.078,1.363)],B,.014,.24)
    patch('upper_back','teres_minor',[(.106,1.340),(.182,1.349),(.196,1.373),(.184,1.327),(.125,1.316)],B,.010,.22)
    patch('upper_back','teres_major',[(.117,1.313),(.181,1.324),(.194,1.351),(.181,1.289),(.108,1.291)],B,.015,.23)
    patch('upper_back','rhomboids',[(.070,1.353),(.102,1.336),(.108,1.293),(.057,1.272),(.035,1.291)],B,.009,.20)
    continuous_regions('lats',[(.065,1.269),(.180,1.288),(.188,1.315),
        (.163,1.210),(.135,1.099),(.058,1.009),(.035,1.045),(.038,1.144)],
        B,[(1.135,.40)],['lower','upper'],.014)
    patch('lower_back','erector_spinae',[(.010,1.207),(.029,1.236),(.041,1.137),(.049,1.020),(.022,.976),(.008,.984)],B,.010,.22)
    patch('lower_back','multifidus',[(.003,1.195),(.009,1.187),(.011,.981),(.003,.967)],B,.004,.18)
    patch('lower_back','quadratus_lumborum',[(.045,1.127),(.075,1.079),(.093,1.022),(.052,.987)],B,.008,.22)
    patch('glutes','maximus',[(.009,.988),(.075,1.009),(.135,.974),(.144,.903),(.103,.855),(.035,.846),(.006,.888)],glute,.012,.30)
    patch('glutes','medius',[(.076,1.016),(.135,1.026),(.155,.977),(.136,.950)],glute,.008,.25)
    patch('glutes','minimus',[(.142,.949),(.158,.977),(.158,.914),(.143,.889)],B,.010,.22)
    # A wider, relaxed A-pose matches the supplied multi-view reference.
    shoulder=Vector(S(.214,.003,1.438)); elbow=Vector(S(.357,.001,1.209)); wrist=Vector(S(.468,-.002,.995))
    upper=limb('Upper arm',elbow,shoulder,[(0,.026,.027),(.18,.036,.036),(.52,.044,.044),(.79,.046,.044),(1,.054,.051),(1.10,.042,.038),(1.19,.008,.009)],side)
    # Deltoid wraps over the shoulder in a teardrop, rather than a sphere cap.
    for muscle,angle in [('front_delts',-.20),('side_delts',1.40),('rear_delts',2.94)]:
        patch(muscle,None,[(angle-.60,.72),(angle-.67,.98),(angle-.29,1.175),(angle+.39,1.16),(angle+.80,.96),(angle+.40,.78),(angle,.57)],upper,.019,.24)
    spindle('biceps','short',upper,-.42,.06,.80,.85,.017,-.18)
    spindle('biceps','long',upper,.37,.05,.83,.79,.016,-.15)
    spindle('brachialis',None,upper,1.12,.07,.63,.58,.010)
    spindle('triceps','long',upper,3.49,.06,.88,1.08,.016,.15)
    spindle('triceps','lateral',upper,2.25,.10,.84,.94,.015)
    spindle('triceps','medial',upper,2.95,.025,.51,.54,.009)
    fore=limb('Forearm',wrist,elbow,[(0,.018,.020),(.20,.023,.023),(.52,.031,.030),(.77,.035,.032),(1,.027,.027)],side)
    spindle('forearms','flexors',fore,-.32,.01,.89,1.28,.010,-.36)
    spindle('forearms','brachioradialis',fore,1.12,.09,1.03,.80,.012,-.10)
    spindle('forearms','extensors',fore,2.80,.02,.91,1.52,.009,.24)
    spindle('forearms','pronators',fore,.45,.47,.97,.66,.008,-.32)
    spindle('forearms','supinator',fore,1.89,.66,.98,.52,.007)
    ellipsoid('Olecranon',elbow,(.025,.026,.028))
    # Smooth connected palm and slender fingers. The model has no robotic cuff.
    palm_end=Vector(S(.501,-.003,.925)); handlength=(wrist-palm_end).length
    loft('Palm',[(0,.026,.014,0),(.03,.029,.016,0),(handlength,.019,.018,0)],start=palm_end,end=wrist,rings=36,sides=32)
    for offset,length in [(-.022,.071),(-.007,.079),(.008,.073),(.022,.061)]:
        tip=Vector(S(.522+offset*1.38,-.011,.920-length)); base=Vector(S(.501+offset,-.003,.939)); l=(base-tip).length
        loft('Finger',[(0,.002,.003,0),(.008,.0048,.005,0),(l*.50,.0055,.006,0),(l,.0064,.007,0)],start=tip,end=base,rings=30,sides=16)
    tip=Vector(S(.470,-.020,.905)); base=Vector(S(.481,-.008,.964)); l=(base-tip).length
    loft('Thumb',[(0,.002,.003,0),(.012,.007,.007,0),(l*.64,.009,.009,0),(l,.011,.011,0)],start=tip,end=base,rings=26,sides=20)
    hip=Vector(S(.078,.012,.963)); knee=Vector(S(.066,-.006,.507)); ankle=Vector(S(.059,.012,.106))
    thigh=limb('Thigh',knee,hip,[(0,.029,.034),(.18,.044,.051),(.47,.060,.064),(.76,.067,.067),(1,.060,.060)],side)
    spindle('quads','rectus_femoris',thigh,-.02,.05,.94,.78,.016,.20)
    spindle('quads','vastus_lateralis',thigh,1.00,.06,.97,1.12,.016,.12)
    spindle('quads','vastus_medialis',thigh,-.94,.01,.73,.92,.016,.08)
    spindle('quads','vastus_intermedius',thigh,-.76,.57,.96,.48,.008,-.20)
    spindle('hamstrings','biceps_femoris_long',thigh,2.18,.04,.90,.80,.014,.14)
    spindle('hamstrings','biceps_femoris_short',thigh,1.72,.07,.65,.49,.009)
    spindle('hamstrings','semitendinosus',thigh,3.30,.025,.91,.77,.012,-.15)
    spindle('hamstrings','semimembranosus',thigh,3.97,.06,.85,.66,.012,-.18)
    spindle('adductors','magnus',thigh,4.58,.21,.96,.68,.011)
    spindle('adductors','longus',thigh,5.16,.34,.97,.49,.010)
    spindle('adductors','brevis',thigh,4.89,.68,.98,.42,.008)
    spindle('adductors','gracilis',thigh,4.84,.03,.73,.27,.006)
    spindle('adductors','pectineus',thigh,5.58,.82,1.01,.40,.007)
    spindle('abductors','tfl',thigh,1.39,.78,1.11,.50,.011)
    spindle('abductors','medius',thigh,1.98,.93,1.13,.56,.011)
    spindle('abductors','minimus',thigh,2.55,.95,1.11,.46,.007)
    ellipsoid('Patella',S(.066,-.034,.509),(.023,.014,.028))
    shin=limb('Lower leg',ankle,knee,[(0,.019,.022),(.17,.021,.028),(.41,.031,.039),(.68,.041,.045),(.86,.033,.035),(1,.026,.028)],side)
    spindle('calves','gastrocnemius_medial',shin,3.82,.30,.96,1.16,.017,-.10)
    spindle('calves','gastrocnemius_lateral',shin,2.47,.35,.94,1.12,.015,.09)
    # Soleus tapers into the long Achilles insertion and wraps the lower calf.
    patch('calves','soleus',[(1.38,.78),(1.65,.87),(2.05,.70),(2.70,.35),(3.15,.14),(3.65,.35),(4.33,.73),(4.55,.86),(4.88,.75),(4.35,.39),(3.43,.02),(2.91,.02),(1.90,.39)],shin,.008,.20)
    # Anterior shin contours and ankle/foot tendons are neutral, unallocated.
    for angle in (-.32,.66):
        fake=spindle('calves','soleus',shin,angle,.015,.94,.66,.005,.08)
        muscles.remove(fake); edge=boundaries.pop(); bpy.data.objects.remove(edge,do_unlink=True)
        fake.data.materials[0]=bone_mat
        for key in list(fake.keys()): del fake[key]
        move(fake,core_collection); core.append(fake)
    ellipsoid('Ankle',ankle,(.021,.027,.030))
    ellipsoid('Heel',S(.059,.025,.056),(.029,.039,.038))
    loft('Foot',[(0,.027,.023,0),(.06,.032,.027,0),(.14,.039,.018,0),(.18,.033,.010,0)],start=S(.059,.045,.04),end=S(.059,-.14,.04),rings=50,sides=32)
    for offset,length,radius in [(-.027,.040,.010),(-.009,.045,.008),(.008,.039,.0075),(.022,.032,.0065),(.033,.025,.0055)]:
        a=Vector(S(.059+offset,-.110,.022)); b=Vector(S(.059+offset,-.110-length,.016)); l=(a-b).length
        loft('Toe',[(0,.002,.003,0),(.007,radius,.009,0),(l,radius,.009,0)],start=b,end=a,rings=20,sides=16)

# One bilateral trapezius sheet: no medial borders or exposed spinal island.
# Its upper edge follows the occipital base; lateral fibers wrap to the shoulder.
def trapezius_surface(x,z,bulge=0):
    if z<=1.535:
        width,depth,offset=interp(torso_rows,z)
    else:
        width,depth,offset=interp([(1.535,.046,.042,.004),
            (1.595,.042,.040,.004),(1.616,.049,.055,-.005),
            (1.643,.065,.068,.002),(1.660,.070,.073,.004)],z)
    q=min(.985,abs(x)/width)
    y=offset+depth*math.sqrt(max(.02,1-q*q))
    # Only lift posteriorly: the centerline stays welded and the shoulder
    # attachment cannot pull away laterally as each side is thickened.
    return Vector((x,y+.003+bulge,z))

continuous_regions('traps',[
    (-.028,1.650),(.028,1.650),(.041,1.594),(.056,1.537),(.112,1.501),
    (.198,1.474),(.236,1.458),(.226,1.426),(.162,1.401),(.109,1.363),
    (.066,1.304),(.026,1.223),(0,1.180),(-.026,1.223),(-.066,1.304),
    (-.109,1.363),(-.162,1.401),(-.226,1.426),(-.236,1.458),
    (-.198,1.474),(-.112,1.501),(-.056,1.537),(-.041,1.594)],
    trapezius_surface,[(1.395,0),(1.475,0)],['lower','middle','upper'],.010)

print('MODEL: joining export groups',flush=True)
# Keep individual anatomy editable; build combined meshes for one material and
# one hit target per muscle/region, preserving the existing app's area IDs.
def joined(name,objects,target):
    copies=[]
    for obj in objects:
        dup=obj.copy(); dup.data=obj.data.copy(); target.objects.link(dup); copies.append(dup)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies: obj.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]; bpy.ops.object.join()
    result=bpy.context.object; result.name=name
    # Consolidate duplicate material slots to keep glTF one mesh per area.
    mat=result.data.materials[0]; result.data.materials.clear(); result.data.materials.append(mat)
    for face in result.data.polygons: face.material_index=0
    return result

body=joined('Neutral head, joints and tendons',core,whole_collection); body['kind']='body'
# Fuse neutral joints, hands, head and tendon core so they join continuously.
bpy.context.view_layer.objects.active=body
modifier=body.modifiers.new('Continuous neutral anatomy','REMESH'); modifier.mode='VOXEL'; modifier.voxel_size=.0028; modifier.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=modifier.name)
modifier=body.modifiers.new('Soften neutral transitions','SMOOTH'); modifier.factor=.7; modifier.iterations=5
bpy.ops.object.modifier_apply(modifier=modifier.name)
modifier=body.modifiers.new('Compact neutral surface','DECIMATE'); modifier.ratio=.18
bpy.ops.object.modifier_apply(modifier=modifier.name)
for face in body.data.polygons: face.use_smooth=True
exports={'muscles':[body],'regions':[]}; counts={}
for mode,target in [('muscles',whole_collection),('regions',region_collection)]:
    if mode=='regions':
        b=body.copy(); b.data=body.data; target.objects.link(b); exports[mode].append(b)
    for muscle in MUSCLES:
        ids=REGIONS.get(muscle,[None]) if mode=='regions' else [None]
        for region in ids:
            area=muscle+(':'+region if region else '')
            chosen=lambda o:o.get('muscle')==muscle and (mode=='muscles' or o.get('region')==region)
            for kind,source in [('surface',muscles),('outline',boundaries)]:
                pieces=[o for o in source if chosen(o)]
                assert pieces, 'Missing '+area+' '+kind
                obj=joined(area+' · '+kind,pieces,target)
                for key in list(obj.keys()): del obj[key]
                obj['kind']=kind; obj['muscle']=muscle; obj['area']=area; obj['baseColor']=MUSCLES[muscle]['color']
                if region: obj['region']=region
                if muscle in ('lats','traps'): obj['continuous']=True
                exports[mode].append(obj)
                if kind=='surface': counts[area]=len(obj.data.polygons)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in exports[mode]: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'mannequin-{mode}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)

core_collection.hide_render=True; core_collection.hide_viewport=True
source_collection.hide_render=True; source_collection.hide_viewport=True
region_collection.hide_render=True; region_collection.hide_viewport=True

# Temporary studio reviews only. The user reviews the finished result in-app.
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
scene.render.resolution_x=1000; scene.render.resolution_y=1400; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'; scene.render.image_settings.file_format='PNG'
scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.045,.065,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4

def aim(obj,target): obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,loc,energy,size in [('Key',(-2,-3,3.5),330,2.5),('Fill',(2,-2,2),100,2),('Rim',(1,2,3),350,2),('Back',(-2,2,2),150,2)]:
    bpy.ops.object.light_add(type='AREA',location=loc); o=bpy.context.object; o.name=name; o.data.energy=energy; o.data.size=size; aim(o,(0,0,1)); move(o,studio_collection)
bpy.ops.object.camera_add(location=(0,-4,.92)); camera=bpy.context.object; camera.data.type='ORTHO'; camera.data.ortho_scale=2.03; move(camera,studio_collection); scene.camera=camera
for name,loc in [('front',(0,-4,.92)),('side',(4,0,.92)),('back',(0,4,.92))]:
    camera.location=loc; aim(camera,(0,0,.92)); scene.render.filepath=str(PREVIEW/f'{name}.png'); bpy.ops.render.render(write_still=True)
camera.location=(0,-4,.92); aim(camera,(0,0,.92))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mannequin.blend'))
manifest={'original_geometry':True,'revision':'anatomical-forms-v3','units':'meters','height':1.801,'surface_areas':counts,'files':['mannequin.blend','mannequin-muscles.glb','mannequin-regions.glb'],'notes':'Original smooth muscle forms rebuilt against complete-example.jpg. Neutral head with no facial muscle map. Deep regions are schematic.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('MODEL_COMPLETE',flush=True)
