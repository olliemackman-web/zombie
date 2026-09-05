import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

export const MODEL_NAMES = [
  'Characters_Matt',
  'Characters_Lis',
  'Characters_GermanShepherd',
  'Zombie_Basic',
  'Zombie_Ribcage',
  'Guitar',
  'Knife',
  'Shotgun',
  'Rifle',
  'SMG',
  'Vehicle_Pickup',
  'Vehicle_Pickup_Armored',
  'Vehicle_Sports',
  'Vehicle_Sports_Armored',
  'Vehicle_Truck_Armored',
  'TrafficCone_1',
  'TrafficCone_2',
  'Pallet_Broken',
  'TrashBag_1',
];

const gltfs = new Map();

function prepareScene(scene) {
  let skinned = false;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) {
        skinned = true;
        // Skinned meshes get culled wrongly because their bounds don't follow the skeleton.
        o.frustumCulled = false;
      }
      if (o.material) {
        o.material.side = THREE.FrontSide;
        if (o.material.map) {
          o.material.map.colorSpace = THREE.SRGBColorSpace;
          o.material.map.anisotropy = 4;
        }
      }
    }
  });
  scene.userData.skinned = skinned;
}

export async function loadAll(onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  const total = MODEL_NAMES.length;

  await Promise.all(
    MODEL_NAMES.map(async (name) => {
      const gltf = await loader.loadAsync(`assets/models/${name}.gltf`);
      prepareScene(gltf.scene);
      gltfs.set(name, gltf);
      done++;
      onProgress?.(done / total, name);
    })
  );
}

export function getGLTF(name) {
  const g = gltfs.get(name);
  if (!g) throw new Error(`Model not loaded: ${name}`);
  return g;
}

/** Returns a fresh instance of a model. Skinned models are cloned with their skeleton. */
export function cloneModel(name) {
  const gltf = getGLTF(name);
  const scene = gltf.scene.userData.skinned ? skeletonClone(gltf.scene) : gltf.scene.clone();
  return { scene, animations: gltf.animations };
}

/** Bounding box of a model's untransformed geometry. */
export function modelBounds(name) {
  const box = new THREE.Box3().setFromObject(getGLTF(name).scene);
  return box;
}
