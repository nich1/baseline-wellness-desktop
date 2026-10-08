"""Extract our selected BodyParts3D structures from a Human Atlas checkout.

python frontend/scripts/blender/extract_anatomy.py /path/to/human-atlas/public/models
Source license and modifications are documented in assets/anatomy/ATTRIBUTION.txt.
"""
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[3]
source = Path(sys.argv[1])
manifest_bytes = (source / 'atlas.json').read_bytes()
manifest = json.loads(manifest_bytes)
mapping = {}
def assign(muscle, region, *ids):
    for number in ids:
        mapping['FJ'+str(number)] = [muscle, region]

assign('chest', 'clavicular', 1447)
assign('chest', 'middle', 1464)
assign('chest', 'lower', 1446)
assign('front_delts', None, 1468)
assign('side_delts', None, 1467)
assign('rear_delts', None, 1513)
assign('upper_back', 'infraspinatus', 1500)
assign('upper_back', 'teres_major', 1507)
assign('upper_back', 'teres_minor', 1508)
assign('upper_back', 'rhomboids', 1536, 1537)
assign('lower_back', 'erector_spinae', 1527, 1528, 1535, 1543, 1544)
assign('biceps', 'long', 1478)
assign('biceps', 'short', 1512)
assign('brachialis', None, 1486)
assign('triceps', 'long', 1479)
assign('triceps', 'lateral', 1477)
assign('triceps', 'medial', 1480)
assign('forearms', 'flexors', 1473, 1475, 1496, 1497, 1498, 1499, 1502, 1518)
assign('forearms', 'extensors', 1472, 1484, 1489, 1490, 1491, 1492, 1493, 1494, 1495, 1517)
assign('forearms', 'pronators', 1474, 1503, 1516)
assign('forearms', 'supinator', 1505)
assign('forearms', 'brachioradialis', 1487)
assign('obliques', 'external', 1452)
assign('glutes', 'maximus', 1418)
assign('glutes', 'medius', 1419)
assign('glutes', 'minimus', 1420)
assign('abductors', 'tfl', 1438)
assign('quads', 'rectus_femoris', 1433)
assign('quads', 'vastus_intermedius', 1441)
assign('quads', 'vastus_lateralis', 1442)
assign('quads', 'vastus_medialis', 1443)
assign('hamstrings', 'biceps_femoris_long', 1395)
assign('hamstrings', 'biceps_femoris_short', 1444)
assign('hamstrings', 'semimembranosus', 1435)
assign('hamstrings', 'semitendinosus', 1436)
assign('adductors', 'brevis', 1401)
assign('adductors', 'longus', 1402)
assign('adductors', 'magnus', 1403, 1404)
assign('adductors', 'gracilis', 1421)
assign('adductors', 'pectineus', 1427)
assign('calves', 'gastrocnemius_lateral', 1394)
assign('calves', 'gastrocnemius_medial', 1397)
assign('calves', 'soleus', 1437)
# Non-workout surfaces: shin, tendons, shoulder/neck context, serratus and skin.
context = {1405,1406,1408,1409,1410,1411,1414,1415,1423,1429,1434,1439,1440,
           1448,1451,1455,1456,1459,1460,1485,1488,1504,1506,1532,1538,1545,
           1573,1595,2810}
parts = []
chunks = {}
for part in manifest['parts']:
    key = part['id'].removesuffix('M')
    if key not in mapping and int(key[2:]) not in context:
        continue
    chunk = part['chunk']
    if chunk not in chunks:
        chunks[chunk] = (source / f'body-{chunk}.bin').read_bytes()
    data = chunks[chunk]
    vertices = struct.unpack_from('<'+'f'*part['vertexCount']*3, data, part['positions'])
    faces = struct.unpack_from('<'+'I'*part['indexCount'], data, part['indices'])
    parts.append({'id':part['id'], 'name':part['name'], 'mapping':mapping.get(key),
        'vertices':[vertices[i:i+3] for i in range(0,len(vertices),3)],
        'faces':[faces[i:i+3] for i in range(0,len(faces),3)]})
output = ROOT / 'assets/anatomy'
(output / 'source.json').write_text(json.dumps(parts, separators=(',', ':')))
(output / 'source-manifest.json').write_text(json.dumps({
    'source':'https://github.com/ashemag/human-atlas', 'dataset':manifest['version'],
    'atlas_sha256':hashlib.sha256(manifest_bytes).hexdigest(),
    'source_ids':[p['id'] for p in parts], 'license':'CC BY 4.0'}, indent=2)+'\n')
print(f'Extracted {len(parts)} structures, {sum(len(p["faces"]) for p in parts)} triangles')
