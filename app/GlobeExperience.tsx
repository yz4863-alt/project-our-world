"use client";

/* eslint-disable @next/next/no-img-element */
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import tripData from "./tripData.json";

type Location = {
  id: string;
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  visitedBy: string;
  photos: Photo[];
};

type Photo = {
  id: string;
  title: string;
  src: string;
  thumb: string;
  caption: string;
  sourceName: string;
};

type TripData = {
  locations: Location[];
};

const EARTH_RADIUS = 1.55;
const PASSWORD = "08212000";
const UNLOCK_STORAGE_KEY = "jason-ania-globe-unlocked";
const UNLOCK_EVENT = "jason-ania-globe-unlock";
const PIN_VISUAL_SCALE = 0.3;
const DESKTOP_MIN_ZOOM_DISTANCE = 1.85;
const TOUCH_MIN_ZOOM_DISTANCE = 2.12;
const LOCATION_FOCUS_DISTANCE = 3.15;
const GLOBE_REST_DISTANCE = 4.55;
const MOBILE_GLOBE_REST_PADDING = 1.06;
const MOBILE_GLOBE_VISUAL_RADIUS = EARTH_RADIUS * 1.06;
const PIN_SURFACE_OFFSET = 0.012;
const PIN_TAP_MAX_DRAG_DISTANCE = 8;
const tripLocations = (tripData as TripData).locations;
const defaultLocation =
  tripLocations.find((location) => location.id === "shanghai") ?? tripLocations[0];

type EarthAssets = {
  materials: THREE.Material[];
  objects: THREE.Object3D[];
  textures: THREE.Texture[];
};

function latLngToVector3(lat: number, lng: number, radius: number) {
  const latRad = THREE.MathUtils.degToRad(lat);
  const lngRad = THREE.MathUtils.degToRad(lng);

  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.cos(lngRad),
    radius * Math.sin(latRad),
    -radius * Math.cos(latRad) * Math.sin(lngRad),
  );
}

function getMobileGlobeRestDistance(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);

  return (MOBILE_GLOBE_VISUAL_RADIUS / Math.sin(limitingHalfFov)) * MOBILE_GLOBE_REST_PADDING;
}

function readSavedUnlock() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(UNLOCK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeToSavedUnlock(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(UNLOCK_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(UNLOCK_EVENT, callback);
  };
}

function subscribeToHydration() {
  return () => undefined;
}

function saveUnlock() {
  try {
    window.localStorage.setItem(UNLOCK_STORAGE_KEY, "true");
    window.dispatchEvent(new Event(UNLOCK_EVENT));
  } catch {
    // The current session still unlocks even if browser storage is unavailable.
  }
}

function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
  maxAnisotropy: number,
  color = false,
) {
  const texture = loader.load(url);
  if (color) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.anisotropy = maxAnisotropy;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function createEarthMaterial(maxAnisotropy: number, mapUrl: string) {
  const loader = new THREE.TextureLoader();
  const map = loadTexture(loader, mapUrl, maxAnisotropy, true);
  const normalMap = loadTexture(loader, "/textures/earth_normal_2048.jpg", maxAnisotropy);
  const specularMap = loadTexture(loader, "/textures/earth_specular_2048.jpg", maxAnisotropy);

  const material = new THREE.MeshPhongMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    specularMap,
    specular: new THREE.Color("#5d6f74"),
    shininess: 10,
  });

  return { material, textures: [map, normalMap, specularMap] };
}

function createSingleTextureEarth(maxAnisotropy: number): EarthAssets {
  const earthAssets = createEarthMaterial(
    maxAnisotropy,
    "/textures/earth_blue_marble_8192.jpg",
  );
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 192, 192),
    earthAssets.material,
  );

  return {
    materials: [earthAssets.material],
    objects: [earth],
    textures: earthAssets.textures,
  };
}

function createEarthTileGeometry(
  latMin: number,
  latMax: number,
  lngMin: number,
  lngMax: number,
  segments = 64,
) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const lat = latMax - (latMax - latMin) * v;

    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const lng = lngMin + (lngMax - lngMin) * u;
      const point = latLngToVector3(lat, lng, EARTH_RADIUS);
      const normal = point.clone().normalize();

      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(u, 1 - v);
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * (segments + 1) + column;
      const b = a + 1;
      const c = (row + 1) * (segments + 1) + column;
      const d = c + 1;

      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

  return geometry;
}

function createTiledEarth(maxAnisotropy: number): EarthAssets {
  const loader = new THREE.TextureLoader();
  const materials: THREE.Material[] = [];
  const objects: THREE.Object3D[] = [];
  const textures: THREE.Texture[] = [];

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const texture = loadTexture(
        loader,
        `/textures/earth_tile_r${row}_c${column}.jpg`,
        maxAnisotropy,
        true,
      );
      const material = new THREE.MeshPhongMaterial({
        map: texture,
        shininess: 6,
        side: THREE.DoubleSide,
        specular: new THREE.Color("#495b62"),
      });
      const latMax = 90 - row * 90;
      const latMin = latMax - 90;
      const lngMin = -180 + column * 90;
      const lngMax = lngMin + 90;
      const mesh = new THREE.Mesh(
        createEarthTileGeometry(latMin, latMax, lngMin, lngMax),
        material,
      );

      materials.push(material);
      objects.push(mesh);
      textures.push(texture);
    }
  }

  return { materials, objects, textures };
}

function makePin(location: Location) {
  const normal = latLngToVector3(location.lat, location.lng, 1).normalize();
  const group = new THREE.Group();
  group.name = location.name;
  group.position.copy(normal.clone().multiplyScalar(EARTH_RADIUS + PIN_SURFACE_OFFSET));
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

  const pinMaterial = new THREE.MeshStandardMaterial({
    color: "#f7b94f",
    emissive: "#b95325",
    emissiveIntensity: 0.5,
    roughness: 0.34,
    metalness: 0.08,
  });
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: "#f7d488",
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.055 * PIN_VISUAL_SCALE, 28, 28),
    pinMaterial,
  );
  head.position.y = 0.07 * PIN_VISUAL_SCALE;

  const point = new THREE.Mesh(
    new THREE.ConeGeometry(0.038 * PIN_VISUAL_SCALE, 0.16 * PIN_VISUAL_SCALE, 28),
    pinMaterial,
  );
  point.rotation.x = Math.PI;
  point.position.y = -0.02 * PIN_VISUAL_SCALE;

  const pulse = new THREE.Mesh(
    new THREE.TorusGeometry(0.096 * PIN_VISUAL_SCALE, 0.006 * PIN_VISUAL_SCALE, 12, 52),
    haloMaterial,
  );
  pulse.rotation.x = Math.PI / 2;
  pulse.position.y = -0.072 * PIN_VISUAL_SCALE;

  const hitArea = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  hitArea.position.y = 0.02;

  group.add(head, point, pulse, hitArea);
  group.userData = { location };

  return { group, hitTargets: [head, point, hitArea], location };
}

export default function GlobeExperience() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const photoDrawerRef = useRef<HTMLElement | null>(null);
  const photoDetailRef = useRef<HTMLElement | null>(null);
  const resetViewRef = useRef<(location?: Location | null) => void>(() => undefined);
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const hasSavedUnlock = useSyncExternalStore(
    subscribeToSavedUnlock,
    readSavedUnlock,
    () => false,
  );
  const [hasSessionUnlock, setHasSessionUnlock] = useState(false);
  const isUnlocked = hasSessionUnlock || hasSavedUnlock;
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    if (!selectedPhoto || !window.matchMedia("(max-width: 760px)").matches) {
      return;
    }

    const animationFrame = requestAnimationFrame(() => {
      const drawer = photoDrawerRef.current;
      const detail = photoDetailRef.current;

      if (!drawer || !detail) {
        return;
      }

      const drawerBounds = drawer.getBoundingClientRect();
      const detailBounds = detail.getBoundingClientRect();
      const detailTop = detailBounds.top - drawerBounds.top + drawer.scrollTop;

      drawer.scrollTo({
        top: Math.max(detailTop - 10, 0),
        behavior: "smooth",
      });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [selectedPhoto]);

  useEffect(() => {
    if (!isUnlocked) {
      return;
    }

    const host = hostRef.current;
    if (!host) {
      return;
    }

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const prefersTouchLayout =
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760;
    const getViewportSize = () => ({
      width: host.clientWidth || window.innerWidth || 1,
      height: host.clientHeight || window.innerHeight || 1,
    });
    const getRestDistance = () => {
      if (!prefersTouchLayout) {
        return GLOBE_REST_DISTANCE;
      }

      const { width, height } = getViewportSize();
      return Math.max(
        GLOBE_REST_DISTANCE,
        getMobileGlobeRestDistance(camera, width, height),
      );
    };

    const scene = new THREE.Scene();
    scene.fog = prefersTouchLayout
      ? new THREE.Fog(0x050509, 9.5, 17)
      : new THREE.Fog(0x050509, 4.8, 9);

    const homeNormal = latLngToVector3(
      defaultLocation.lat,
      defaultLocation.lng,
      1,
    ).normalize();
    const homePosition = homeNormal.clone().multiplyScalar(getRestDistance());
    camera.position.copy(homePosition);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x050509, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const getPixelRatioCap = () => {
      const compactViewport = host.clientWidth < 760 || prefersTouchLayout;
      return compactViewport ? 1.75 : 3;
    };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, getPixelRatioCap()));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = prefersTouchLayout ? 0.07 : 0.055;
    controls.enablePan = false;
    const useHighResolutionTiles =
      renderer.capabilities.maxTextureSize >= 4096 &&
      !prefersTouchLayout &&
      window.innerWidth >= 900;
    controls.minDistance = useHighResolutionTiles
      ? DESKTOP_MIN_ZOOM_DISTANCE
      : TOUCH_MIN_ZOOM_DISTANCE;
    controls.maxDistance = prefersTouchLayout
      ? Math.max(6.1, getRestDistance() + 1.1)
      : 6.1;
    controls.rotateSpeed = prefersTouchLayout ? 0.44 : 0.52;
    controls.zoomSpeed = prefersTouchLayout ? 0.58 : 0.72;

    const ambientLight = new THREE.AmbientLight(0x9ed8d0, 1.35);
    const keyLight = new THREE.DirectionalLight(0xffe5bf, 3.4);
    keyLight.position.set(3.8, 2.2, 3);
    const rimLight = new THREE.DirectionalLight(0x7ad3ff, 1.8);
    rimLight.position.set(-4, 1, -3);
    scene.add(ambientLight, keyLight, rimLight);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const earthAssets = useHighResolutionTiles
      ? createTiledEarth(maxAnisotropy)
      : createSingleTextureEarth(maxAnisotropy);
    earthAssets.objects.forEach((object) => scene.add(object));

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.026, 96, 96),
      new THREE.MeshBasicMaterial({
        color: "#6fd4df",
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide,
      }),
    );
    scene.add(atmosphere);

    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(prefersTouchLayout ? 450 : 900);
    for (let i = 0; i < starPositions.length; i += 3) {
      const vector = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 12,
      )
        .normalize()
        .multiplyScalar(6 + Math.random() * 6);
      starPositions[i] = vector.x;
      starPositions[i + 1] = vector.y;
      starPositions[i + 2] = vector.z;
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: "#f1ead8",
        size: 0.018,
        transparent: true,
        opacity: 0.72,
      }),
    );
    scene.add(stars);

    const pins = tripLocations.map(makePin);
    pins.forEach((pin) => scene.add(pin.group));

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerStart = new THREE.Vector2();
    let animationFrame = 0;
    let cameraAnimation:
      | {
          startedAt: number;
          duration: number;
          fromPosition: THREE.Vector3;
          toPosition: THREE.Vector3;
          fromTarget: THREE.Vector3;
          toTarget: THREE.Vector3;
        }
      | null = null;

    const cancelCameraAnimation = () => {
      cameraAnimation = null;
    };

    const resize = () => {
      const { clientWidth, clientHeight } = host;
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, getPixelRatioCap()));
      renderer.setSize(clientWidth, clientHeight, false);
      if (prefersTouchLayout) {
        controls.maxDistance = Math.max(6.1, getRestDistance() + 1.1);
      }
    };

    const animateCameraTo = (toPosition: THREE.Vector3, toTarget: THREE.Vector3) => {
      cameraAnimation = {
        startedAt: performance.now(),
        duration: 1050,
        fromPosition: camera.position.clone(),
        toPosition,
        fromTarget: controls.target.clone(),
        toTarget,
      };
    };

    const focusLocation = (location: Location) => {
      const locationNormal = latLngToVector3(location.lat, location.lng, 1).normalize();
      const currentDistance = camera.position.distanceTo(controls.target);
      const focusDistance = Math.min(currentDistance, LOCATION_FOCUS_DISTANCE);
      animateCameraTo(
        locationNormal.clone().multiplyScalar(focusDistance),
        new THREE.Vector3(0, 0, 0),
      );
      setSelectedLocation(location);
      setSelectedPhoto(null);
    };
    resetViewRef.current = (location) => {
      const restNormal = location
        ? latLngToVector3(location.lat, location.lng, 1).normalize()
        : homeNormal;
      animateCameraTo(
        restNormal.clone().multiplyScalar(getRestDistance()),
        new THREE.Vector3(0, 0, 0),
      );
    };

    const setPointerFromEvent = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    };

    const handlePointerDown = (event: PointerEvent) => {
      cancelCameraAnimation();
      pointerStart.set(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragDistance = pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
      if (dragDistance > PIN_TAP_MAX_DRAG_DISTANCE) {
        return;
      }

      setPointerFromEvent(event);
      raycaster.setFromCamera(pointer, camera);
      const hitTargets = pins.flatMap((pin) => pin.hitTargets);
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      const selectedPin = pins.find((pin) => pin.hitTargets.includes(hit?.object));
      if (selectedPin) {
        focusLocation(selectedPin.location);
      }
    };

    const handleManualControlStart = () => {
      cancelCameraAnimation();
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleManualControlStart, { passive: true });
    controls.addEventListener("start", handleManualControlStart);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const tick = () => {
      const elapsed = performance.now();
      pins.forEach((pin) => {
        const pinDistance = camera.position.distanceTo(pin.group.position);
        const pinScale = THREE.MathUtils.clamp(pinDistance * 0.34, 0.34, 1.15);
        pin.group.scale.setScalar(pinScale);
        pin.group.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry) {
            const scale = 1 + Math.sin(elapsed * 0.003) * 0.12;
            child.scale.setScalar(scale);
          }
        });
      });
      stars.rotation.y += 0.00035;

      if (cameraAnimation) {
        const progress = Math.min(
          (performance.now() - cameraAnimation.startedAt) / cameraAnimation.duration,
          1,
        );
        const eased = 1 - Math.pow(1 - progress, 3);
        camera.position.lerpVectors(
          cameraAnimation.fromPosition,
          cameraAnimation.toPosition,
          eased,
        );
        controls.target.lerpVectors(
          cameraAnimation.fromTarget,
          cameraAnimation.toTarget,
          eased,
        );

        if (progress === 1) {
          cameraAnimation = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleManualControlStart);
      controls.removeEventListener("start", handleManualControlStart);
      controls.dispose();
      earthAssets.objects.forEach((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
        }
      });
      earthAssets.textures.forEach((texture) => texture.dispose());
      earthAssets.materials.forEach((material) => material.dispose());
      starsGeometry.dispose();
      renderer.dispose();
      resetViewRef.current = () => undefined;
      host.replaceChildren();
    };
  }, [isUnlocked]);

  const handleUnlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password === PASSWORD) {
      saveUnlock();
      setPassword("");
      setPasswordError("");
      setHasSessionUnlock(true);
      return;
    }

    setPasswordError("Wrong password");
  };

  if (!hasHydrated) {
    return <main className="password-gate" aria-label="Loading globe" />;
  }

  if (!isUnlocked) {
    return (
      <main className="password-gate">
        <form className="password-panel" onSubmit={handleUnlock} aria-label="Password gate">
          <div className="gate-title">
            <p>Jason + Ania</p>
            <h1>
              Our World <span aria-hidden="true">♥</span>
            </h1>
          </div>
          <label className="password-field">
            <span>Password</span>
            <input
              autoFocus
              inputMode="numeric"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError("");
              }}
            />
          </label>
          <button className="password-submit" type="submit">
            Unlock
          </button>
          {passwordError ? <p className="password-error">{passwordError}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="experience-shell">
      <div
        ref={hostRef}
        className="globe-stage"
        aria-label="Interactive 3D globe"
        data-testid="globe-stage"
      />

      <header className="title-lockup" aria-label="Trip map title">
        <p>Jason + Ania</p>
        <h1>
          Our World <span aria-hidden="true">♥</span>
        </h1>
      </header>

      <aside className="location-readout" aria-label="Highlighted location">
        <span>{selectedLocation ? "Current pin" : "Our map"}</span>
        <strong>{selectedLocation?.name ?? `${tripLocations.length} pins`}</strong>
      </aside>

      <section
        ref={photoDrawerRef}
        className={`photo-drawer ${selectedLocation ? "is-open" : ""} ${
          selectedPhoto ? "has-photo" : ""
        }`}
        aria-label={`${selectedLocation?.name ?? "Selected location"} photos`}
        aria-hidden={!selectedLocation}
        data-testid="photo-drawer"
      >
        <div className="drawer-copy">
          <h2>{selectedLocation?.name ?? "Selected place"}</h2>
          <p className="drawer-country">
            {selectedLocation?.country ?? selectedLocation?.region}
          </p>
        </div>
        <div className="photo-strip">
          {(selectedLocation?.photos ?? []).map((photo) => (
            <button
              className="photo-tile"
              key={photo.id}
              type="button"
              onClick={() => setSelectedPhoto(photo)}
              aria-label={`Open ${photo.title}`}
            >
              <img className="photo-fill" src={photo.thumb} alt="" loading="lazy" />
            </button>
          ))}
        </div>
        {selectedPhoto ? (
          <article
            ref={photoDetailRef}
            className={`photo-detail ${selectedPhoto.caption ? "" : "is-image-only"}`}
            aria-live="polite"
          >
            <img
              className="photo-detail-image"
              src={selectedPhoto.src}
              alt={selectedPhoto.caption || selectedPhoto.title}
            />
            {selectedPhoto.caption ? <p>{selectedPhoto.caption}</p> : null}
          </article>
        ) : null}
        <button
          className="drawer-close"
          type="button"
          onClick={() => {
            const locationToCenter = selectedLocation;
            setSelectedLocation(null);
            setSelectedPhoto(null);
            resetViewRef.current(locationToCenter);
          }}
          aria-label="Back to globe"
        >
          Back to globe
        </button>
      </section>
    </main>
  );
}
