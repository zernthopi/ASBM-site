// Visionneuse 3D des trophées : chargée seulement quand un visiteur clique « Voir en 3D ».
import { THREE, construireTrophee, creerEnvironnement, cadrer, ombreContact, configurerRendu } from './trophees3d.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import specs from '../data/trophees.json';

let etat = null;

function initialiser(zone) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  configurerRendu(renderer);
  zone.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  scene.environment = creerEnvironnement(renderer);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  const controles = new OrbitControls(camera, renderer.domElement);
  controles.enableDamping = true;
  controles.enablePan = false;
  controles.minPolarAngle = 0.35;
  controles.maxPolarAngle = Math.PI / 2 + 0.05;
  const calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controles.autoRotate = !calme;
  controles.autoRotateSpeed = 1.4;
  controles.addEventListener('start', () => (controles.autoRotate = false));
  etat = { renderer, scene, camera, controles, zone, objet: null, actif: false };
  new ResizeObserver(redimensionner).observe(zone);
  redimensionner();
  return etat;
}

function redimensionner() {
  const { renderer, camera, zone } = etat;
  const l = zone.clientWidth;
  const h = zone.clientHeight;
  if (!l || !h) return;
  renderer.setSize(l, h, false);
  camera.aspect = l / h;
  camera.updateProjectionMatrix();
}

function boucle() {
  if (!etat.actif) return;
  etat.controles.update();
  etat.renderer.render(etat.scene, etat.camera);
  requestAnimationFrame(boucle);
}

/** Affiche le trophée `id` dans `zone` ; renvoie une fonction d'arrêt. */
export async function montrer(id, zone) {
  if (!etat || etat.zone !== zone) initialiser(zone);
  const spec = specs[id];
  if (!spec) throw new Error(`Trophée inconnu : ${id}`);
  if (etat.objet) {
    etat.scene.remove(etat.objet);
    etat.objet.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  const groupe = new THREE.Group();
  const objet = await construireTrophee(spec);
  groupe.add(objet);
  const b = new THREE.Box3().setFromObject(objet);
  groupe.add(ombreContact((b.max.x - b.min.x) * 1.5, Math.max((b.max.z - b.min.z) * 1.9, (b.max.x - b.min.x) * 0.4)));
  etat.scene.add(groupe);
  etat.objet = groupe;
  redimensionner();
  const centre = cadrer(etat.camera, objet, { azimut: spec.type === 'coupe' ? -0.25 : -0.15, elevation: 0.12, marge: 1.12 });
  etat.controles.target.copy(centre);
  etat.controles.minDistance = etat.camera.position.distanceTo(centre) * 0.45;
  etat.controles.maxDistance = etat.camera.position.distanceTo(centre) * 1.8;
  etat.controles.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  etat.controles.update();
  if (!etat.actif) {
    etat.actif = true;
    boucle();
  }
  return () => {
    etat.actif = false;
  };
}
