import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type MuscleMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export type Patch = { mesh: MuscleMesh; outline?: MuscleMesh; muscle: string; region?: string };

// Fine directional relief follows the muscle-specific UVs exported from Blender.
function muscleFibers() {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const drift = .35 * Math.sin(y / size * Math.PI * 4);
    const ridge = Math.sin((x + drift) * Math.PI / 4);
    const grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const value = Math.round(128 + ridge * 45 + (grain - Math.floor(grain) - .5) * 14);
    const offset = (y * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** BodyParts3D adaptations; both sides represent the same workout allocation. */
export async function createMannequin() {
  const root = new THREE.Group();
  const fibers = muscleFibers();
  const patches: Patch[] = [];
  const pickable: THREE.Mesh[] = [];
  try {
    // The full model shares one geometry across both coloring modes. This avoids
    // downloading and retaining a second copy of the anatomical surfaces.
    const gltf = await new GLTFLoader().loadAsync("/models/anatomy-regions.glb");
    root.add(gltf.scene);
    const outlines = new Map<string, MuscleMesh>();
    const surfaces: MuscleMesh[] = [];
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.kind === "outline") outlines.set(object.userData.area, object as MuscleMesh);
      else {
        pickable.push(object);
        if (object.userData.kind === "surface") surfaces.push(object as MuscleMesh);
      }
    });
    // Exports share materials; each selectable area needs independent coloring.
    const originals = new Set<THREE.Material>();
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      originals.add(object.material);
      object.material = object.material.clone();
      if (object.userData.kind === "body") {
        object.material.color.set("#77818e");
      }
    });
    originals.forEach(material => material.dispose());
    for (const mesh of surfaces) {
      const outline = outlines.get(mesh.userData.area);
      mesh.material.bumpMap = null;
      mesh.material.bumpScale = .00008;
      mesh.material.roughness = .56;
      mesh.material.metalness = 0;
      if (outline) {
        outline.material.polygonOffset = true;
        outline.material.polygonOffsetFactor = -1;
        outline.material.polygonOffsetUnits = -1;
      }
      patches.push({ mesh, outline, muscle: mesh.userData.muscle, region: mesh.userData.region });
    }
    return {
      root, patches, pickable, fibers,
      setMode(regions: boolean) {
        for (const patch of patches) patch.region = regions ? patch.mesh.userData.region : undefined;
      },
    };
  } catch (error) {
    fibers.dispose();
    root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
      }
    });
    throw error;
  }
}
