import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createMannequin } from "./model";
import type { MuscleArea } from "./data";

export type MannequinScene = Awaited<ReturnType<typeof mountMannequin>>;

export async function mountMannequin(host: HTMLDivElement, onSelect: (id: string) => void, onView: (view: string) => void, onLost: () => void) {
  const model = await createMannequin();
  let renderer: THREE.WebGLRenderer;
  const renderCanvas = document.createElement("canvas");
  let contextMessage = "";
  const contextFailed = (event: Event) => { contextMessage = (event as WebGLContextEvent).statusMessage || ""; };
  renderCanvas.addEventListener("webglcontextcreationerror", contextFailed);
  try {
    renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (error) {
    model.fibers.dispose();
    model.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
      }
    });
    const failure = new Error(contextMessage || (error instanceof Error ? error.message : "WebGL context creation failed"));
    failure.name = "WebGLContextError";
    throw failure;
  } finally {
    renderCanvas.removeEventListener("webglcontextcreationerror", contextFailed);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .85;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-label", "Interactive muscle mannequin. Drag to rotate. Arrow keys rotate; plus and minus zoom. Select a muscle on the model or use the selector below.");
  canvas.setAttribute("role", "application");
  canvas.tabIndex = 0;
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 30);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, .89, 0);
  controls.enablePan = false;
  controls.enableDamping = false; // Render on demand; no idle animation loop.
  controls.enableZoom = false; // Keep wheel scrolling the page. Buttons + pinch handle zoom.
  controls.minPolarAngle = Math.PI * .30;
  controls.maxPolarAngle = Math.PI * .70;
  controls.rotateSpeed = .65;
  scene.add(model.root);
  // Even neutral fill keeps every surface readable. The shape light follows the
  // camera so rotating to the back never puts the visible muscles in shadow.
  scene.add(new THREE.AmbientLight("#ffffff", 1.1));
  const shapeLight = new THREE.DirectionalLight("#ffffff", 1.2);
  shapeLight.position.set(2, 3, 4);
  shapeLight.target.position.set(0, 0, -1);
  camera.add(shapeLight, shapeLight.target);
  scene.add(camera);
  let frame = 0, disposed = false, visible = true, initial = true, baseDistance = 3.6;
  function requestRender() {
    if (disposed || !visible || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; if (!disposed) renderer.render(scene, camera); });
  }
  function changed() {
    const angle = Math.abs(controls.getAzimuthalAngle());
    onView(angle < .40 ? "Front" : angle > Math.PI - .40 ? "Back" : "Side");
    requestRender();
  }
  controls.addEventListener("change", changed);
  function setAngle(angle: number, polar = Math.PI / 2, distance = camera.position.distanceTo(controls.target)) {
    const spherical = new THREE.Spherical(distance, THREE.MathUtils.clamp(polar, controls.minPolarAngle, controls.maxPolarAngle), angle);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update(); requestRender();
  }
  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    const previousBase = baseDistance;
    camera.aspect = width / height;
    baseDistance = Math.max(2.15, 1.56 / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    renderer.setSize(width, height); camera.updateProjectionMatrix();
    if (initial) { initial = false; setAngle(0, Math.PI/2, baseDistance); }
    else setAngle(controls.getAzimuthalAngle(), controls.getPolarAngle(), camera.position.distanceTo(controls.target) * baseDistance / previousBase);
    requestRender();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
  const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) requestRender(); });
  visibility.observe(host);
  const zoom = (factor: number) => setAngle(controls.getAzimuthalAngle(), controls.getPolarAngle(), THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * factor, baseDistance * .55, baseDistance * 1.45));
  const pointers = new Map<number, THREE.Vector2>();
  const start = new THREE.Vector2();
  let moved = false, pinch = 0;
  function down(event: PointerEvent) {
    pointers.set(event.pointerId, new THREE.Vector2(event.clientX,event.clientY));
    start.set(event.clientX, event.clientY); moved = pointers.size > 1;
    if (pointers.size === 2) {
      const [a,b] = [...pointers.values()]; pinch = a.distanceTo(b); controls.enabled = false;
    }
  }
  function move(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, new THREE.Vector2(event.clientX,event.clientY));
    if (start.distanceTo(new THREE.Vector2(event.clientX,event.clientY)) > 5) moved = true;
    if (pointers.size === 2) {
      const [a,b] = [...pointers.values()], distance = a.distanceTo(b);
      if (pinch > 0 && distance > 0) zoom(pinch / distance);
      pinch = distance; moved = true;
    }
  }
  function up(event: PointerEvent) {
    const wasSingle = pointers.size === 1;
    pointers.delete(event.pointerId);
    if (!pointers.size) controls.enabled = true;
    if (moved || !wasSingle) return;
    const rect = canvas.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1, -(event.clientY-rect.top)/rect.height*2+1), camera);
    // Include the shell as an occluder: a front click cannot select a back muscle.
    const hit = raycaster.intersectObjects(model.pickable.filter(mesh => mesh.visible), false)[0];
    if (hit?.object.userData.area) onSelect(hit.object.userData.area);
  }
  function cancel(event: PointerEvent) { pointers.delete(event.pointerId); moved = true; if (!pointers.size) controls.enabled = true; }
  function keydown(event: KeyboardEvent) {
    const angle = controls.getAzimuthalAngle(), polar = controls.getPolarAngle();
    switch (event.key) {
      case "ArrowLeft": setAngle(angle - Math.PI/12, polar); break;
      case "ArrowRight": setAngle(angle + Math.PI/12, polar); break;
      case "ArrowUp": setAngle(angle, polar - .12); break;
      case "ArrowDown": setAngle(angle, polar + .12); break;
      case "+": case "=": zoom(.85); break;
      case "-": zoom(1/.85); break;
      case "Home": setAngle(0, Math.PI/2, baseDistance); break;
      default: return;
    }
    event.preventDefault();
  }
  function lost(event: Event) { event.preventDefault(); onLost(); }
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("webglcontextlost", lost);

  return {
    update(areas: MuscleArea[], regions: boolean, selected: string | null) {
      const values = new Map(areas.map(area => [area.id, area]));
      model.setMode(regions);
      for (const patch of model.patches) {
        const id = patch.region ? `${patch.muscle}:${patch.region}` : patch.muscle;
        // Continuous back surfaces keep their fine head seams visible. Other
        // forms use the extra outline only when selected.
        if (patch.outline) patch.outline.visible = patch.mesh.visible && (id === selected || patch.mesh.userData.continuous === true);
        const area = values.get(id);
        const active = area && area.volume > 0;
        patch.mesh.material.color.set("#77818e");
        if (active) patch.mesh.material.color.lerp(new THREE.Color(area.color), .25 + .75 * area.intensity);
        patch.mesh.material.transparent = false;
        patch.mesh.material.opacity = 1;
        patch.mesh.material.emissive.set(id === selected ? "#b9d8ff" : "#000000");
        patch.mesh.material.emissiveIntensity = id === selected ? .18 : 0;
        // Source anatomy includes deep heads. Reveal a selected region through
        // covering surfaces so its real position remains inspectable.
        patch.mesh.material.depthTest = !(regions && id === selected);
        patch.mesh.material.depthWrite = !(regions && id === selected);
        patch.mesh.renderOrder = regions && id === selected ? 2 : 0;
        if (patch.outline) {
          const outline = patch.outline.material as THREE.MeshStandardMaterial;
          outline.color.set(id === selected ? "#f0f7ff" : "#65717e");
          outline.opacity = 1;
        }
      }
      requestRender();
    },
    view(back: boolean) { setAngle(back ? Math.PI : 0); },
    reset() { setAngle(0, Math.PI/2, baseDistance); },
    zoom,
    focus(muscle: string) {
      const back = ["lats","upper_back","lower_back","traps","rear_delts","triceps","glutes","hamstrings","calves"].includes(muscle);
      setAngle(back ? Math.PI : ["side_delts","abductors","brachialis"].includes(muscle) ? Math.PI/2 : 0);
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      resizeObserver.disconnect(); visibility.disconnect(); controls.dispose();
      canvas.removeEventListener("pointerdown",down); canvas.removeEventListener("pointermove",move);
      canvas.removeEventListener("pointerup",up); canvas.removeEventListener("pointercancel",cancel);
      canvas.removeEventListener("keydown",keydown); canvas.removeEventListener("webglcontextlost",lost);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
        }
      });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      model.fibers.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
