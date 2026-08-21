<script setup lang="ts">
import { ref, watch, reactive, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { observations } from '../data/observations'
import type { Observation } from '../types/Observation'

// ─── Navigation stack ─────────────────────────────────────────────────────────
//
// Each entry represents one zoom level into a sub-cluster.
// Examples (from zoom-levels-and-taxonomy-depth.md):
//
//   []                                → Atlas
//   [{ order, 'Coleoptera' }]         → inside Beetles order cluster
//   [{ order }, { family, 'Coccinellidae' }] → inside Ladybug family cluster
//   [{ order }, { family }, { specimen, obs }] → Specimen
//
// Rules encoded here:
//   1. Always enter via order first from Atlas.
//   2. Skip any node with exactly 1 observation (fast path to next level).
//   3. Escape / background click pops one level.

type NavEntry =
  | { type: 'order';    key: string }
  | { type: 'family';   order: string; key: string }
  | { type: 'specimen'; obs: Observation }

// ─── Reactive UI state ────────────────────────────────────────────────────────

const canvasRef  = ref<HTMLCanvasElement | null>(null)
const hoveredObs = ref<Observation | null>(null)
const navStack   = ref<NavEntry[]>([])
const mousePos   = reactive({ x: 0, y: 0 })

// Derived from the stack — avoids passing the stack around everywhere
const stackTop   = () => navStack.value[navStack.value.length - 1] ?? null
const focusedObs = () => { const t = stackTop(); return t?.type === 'specimen' ? t.obs : null }

// ─── Label types and opacity ──────────────────────────────────────────────────

// Atlas labels fade as the camera zooms toward a group.
// Overview z=35; labels are fully visible above z=26, fully gone below z=16.
const labelOpacity = ref(1)

interface ScreenLabel {
  id:    string
  name:  string
  world: THREE.Vector3
  sx:    number
  sy:    number
}

// ─── Order labels (Atlas level, derived from observation data) ─────────────────

const ORDER_DISPLAY_NAMES: Record<string, string> = {
  Araneae:           'Spiders',
  Coleoptera:        'Beetles',
  Decapoda:          'Crabs & Crayfish',
  Diptera:           'Flies',
  Ephemeroptera:     'Mayflies',
  Hemiptera:         'True Bugs',
  Hymenoptera:       'Bees & Wasps',
  Isopoda:           'Pill Bugs',
  Julida:            'Millipedes',
  Lepidoptera:       'Butterflies & Moths',
  Lithobiomorpha:    'Centipedes',
  Neuroptera:        'Lacewings',
  Nudibranchia:      'Nudibranchs',
  Odonata:           'Dragonflies & Damselflies',
  Opiliones:         'Harvestmen',
  Orthoptera:        'Grasshoppers & Crickets',
  Pollicipedomorpha: 'Gooseneck Barnacles',
  Stylommatophora:   'Snails & Slugs',
  Thysanoptera:      'Thrips',
}

function buildOrderLabels(): ScreenLabel[] {
  const groups = new Map<string, { xs: number[]; ys: number[] }>()
  for (const obs of observations) {
    const key = obs.order ?? 'Unidentified'
    if (!groups.has(key)) groups.set(key, { xs: [], ys: [] })
    const g = groups.get(key)!
    g.xs.push(obs.x)
    g.ys.push(obs.y)
  }
  return [...groups.entries()].map(([key, g]) => {
    const cx   = g.xs.reduce((a, b) => a + b, 0) / g.xs.length
    const maxY = Math.max(...g.ys)
    const name = ORDER_DISPLAY_NAMES[key] ?? key
    return { id: key, name, world: new THREE.Vector3(cx, maxY + 1.8, 0), sx: 0, sy: 0 }
  })
}

const orderLabels = ref<ScreenLabel[]>(buildOrderLabels())

// ─── Family labels (Group level, rebuilt when stack top changes to 'order') ───

// Uses ref + watch (not computed) so the render loop can mutate sx/sy on the
// label objects and trigger Vue reactivity — same pattern as orderLabels.

const familyLabels = ref<ScreenLabel[]>([])

watch(navStack, (stack) => {
  updateVisibility()

  const top = stack[stack.length - 1] ?? null
  if (top?.type !== 'order') {
    familyLabels.value = []
    return
  }
  const order = top.key
  const groups = new Map<string, { xs: number[]; ys: number[] }>()
  for (const obs of observations.filter(o => o.order === order)) {
    const key = obs.family ?? 'Unknown'
    if (!groups.has(key)) groups.set(key, { xs: [], ys: [] })
    const g = groups.get(key)!
    g.xs.push(obs.x)
    g.ys.push(obs.y)
  }
  familyLabels.value = [...groups.entries()].map(([key, g]) => {
    const cx   = g.xs.reduce((a, b) => a + b, 0) / g.xs.length
    const maxY = Math.max(...g.ys)
    return { id: key, name: key, world: new THREE.Vector3(cx, maxY + 1.5, 0), sx: 0, sy: 0 }
  })
})

// ─── Data helpers ─────────────────────────────────────────────────────────────

function obsForOrder(order: string): Observation[] {
  return observations.filter(o => o.order === order)
}

function obsForFamily(order: string, family: string): Observation[] {
  return observations.filter(o => o.order === order && o.family === family)
}

// ─── Atlas representatives ────────────────────────────────────────────────────
//
// One observation per family, chosen deterministically by hashing the family
// name into the group. Shown at Atlas level instead of all 430 observations.

function computeAtlasRepresentatives(): Set<string> {
  const groups = new Map<string, Observation[]>()
  for (const obs of observations) {
    const key = `${obs.order ?? ''}|${obs.family ?? ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(obs)
  }
  const reps = new Set<string>()
  for (const [key, group] of groups) {
    let hash = 0
    for (let i = 0; i < key.length; i++) hash = (Math.imul(hash, 31) + key.charCodeAt(i)) | 0
    reps.add(group[Math.abs(hash) % group.length].id)
  }
  return reps
}

const atlasRepresentatives = computeAtlasRepresentatives()

// ─── Visibility management ────────────────────────────────────────────────────

function updateVisibility() {
  const top = stackTop()
  for (const obs of observations) {
    const mesh = meshes.get(obs.id)
    if (!mesh) continue
    if (!top) {
      mesh.visible = atlasRepresentatives.has(obs.id)
    } else if (top.type === 'order') {
      mesh.visible = obs.order === top.key
    } else if (top.type === 'family') {
      mesh.visible = obs.order === top.order && obs.family === top.key
    } else {
      // Specimen: keep family siblings visible as context
      mesh.visible = obs.order === top.obs.order && obs.family === top.obs.family
    }
  }
}

function centroidOf(obs: Observation[]): THREE.Vector3 {
  return new THREE.Vector3(
    obs.reduce((s, o) => s + o.x, 0) / obs.length,
    obs.reduce((s, o) => s + o.y, 0) / obs.length,
    obs.reduce((s, o) => s + o.z, 0) / obs.length,
  )
}

// ─── Three.js objects (not reactive) ──────────────────────────────────────────

let renderer: THREE.WebGLRenderer
let scene:    THREE.Scene
let camera:   THREE.PerspectiveCamera
let controls: OrbitControls
let rafId:    number

const meshes    = new Map<string, THREE.Mesh>()
const raycaster = new THREE.Raycaster()
const pointer   = new THREE.Vector2()

// ─── Camera animation ─────────────────────────────────────────────────────────

const OVERVIEW_POS    = new THREE.Vector3(0, 0, 70)
const OVERVIEW_TARGET = new THREE.Vector3(0, 0,  0)

// Z offsets from each cluster's centroid. Chosen so each level transition
// covers a meaningful fraction of the remaining depth:
//   Atlas z≈35 → Order z≈22 → Family z≈14 → Specimen z≈8
const ORDER_Z_OFFSET   = 22
const FAMILY_Z_OFFSET  = 14
const SPECIMEN_Z_OFFSET = 8

const LERP_SPEED     = 0.07
const LERP_THRESHOLD = 0.04

let targetPos    = OVERVIEW_POS.clone()
let targetLookAt = OVERVIEW_TARGET.clone()
let animating    = false

function cameraForEntry(entry: NavEntry): { pos: THREE.Vector3; lookAt: THREE.Vector3 } {
  if (entry.type === 'specimen') {
    const { obs } = entry
    return {
      pos:    new THREE.Vector3(obs.x, obs.y, obs.z + SPECIMEN_Z_OFFSET),
      lookAt: new THREE.Vector3(obs.x, obs.y, obs.z),
    }
  }
  if (entry.type === 'order') {
    const c = centroidOf(obsForOrder(entry.key))
    return {
      pos:    new THREE.Vector3(c.x, c.y, c.z + ORDER_Z_OFFSET),
      lookAt: c.clone(),
    }
  }
  // family
  const c = centroidOf(obsForFamily(entry.order, entry.key))
  return {
    pos:    new THREE.Vector3(c.x, c.y, c.z + FAMILY_Z_OFFSET),
    lookAt: c.clone(),
  }
}

// ─── Fallback texture ─────────────────────────────────────────────────────────

function makeFallbackTexture(name: string): THREE.Texture {
  const w = 600, h = 400
  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f0e9d8'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#c4aa80'
  ctx.lineWidth = 5
  ctx.strokeRect(12, 12, w - 24, h - 24)
  ctx.fillStyle = '#1c1208'
  ctx.font = 'bold 38px Georgia, serif'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  const words = name.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width < w - 80) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)

  const lh = 52
  const startY = h / 2 - ((lines.length - 1) * lh) / 2
  lines.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * lh))

  return new THREE.CanvasTexture(canvas)
}

// ─── Mesh creation ────────────────────────────────────────────────────────────

const MESH_HEIGHT = 6  // world units; adjust to taste

function createMesh(obs: Observation): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(MESH_HEIGHT * 1.5, MESH_HEIGHT)
  const mat = new THREE.MeshBasicMaterial({
    map:  makeFallbackTexture(obs.commonName),
    side: THREE.FrontSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(obs.x, obs.y, obs.z)
  mesh.userData.id = obs.id

  new THREE.TextureLoader().load(
    obs.imageFile,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      const aspect = tex.image.width / tex.image.height
      mesh.geometry.dispose()
      mesh.geometry = new THREE.PlaneGeometry(MESH_HEIGHT * aspect, MESH_HEIGHT)
      mat.map = tex
      mat.needsUpdate = true
    },
    undefined,
    () => {},
  )

  return mesh
}

// ─── Hover helpers ────────────────────────────────────────────────────────────

function setHover(obs: Observation | null) {
  if (hoveredObs.value === obs) return
  if (hoveredObs.value) meshes.get(hoveredObs.value.id)?.scale.setScalar(1)
  hoveredObs.value = obs
  if (obs) meshes.get(obs.id)?.scale.setScalar(1.1)
  document.body.style.cursor = obs ? 'pointer' : 'default'
}

// ─── Navigation ───────────────────────────────────────────────────────────────

// Observations eligible for hover / click at the current stack level.
// Restricts picking to the active group — avoids inconsistent stack states
// from clicking observations that belong to a different branch.
function eligibleObs(): Observation[] {
  const top = stackTop()
  if (!top)                 return observations.filter(o => atlasRepresentatives.has(o.id))
  if (top.type === 'order') return obsForOrder(top.key)
  if (top.type === 'family') return obsForFamily(top.order, top.key)
  return []                                               // specimen: nothing pickable
}

function animateTo(pos: THREE.Vector3, lookAt: THREE.Vector3) {
  targetPos    = pos
  targetLookAt = lookAt
  animating    = true
  controls.enabled = false
}

function pushEntry(entry: NavEntry) {
  navStack.value = [...navStack.value, entry]
  setHover(null)
  const { pos, lookAt } = cameraForEntry(entry)
  animateTo(pos, lookAt)
}

function popEntry() {
  const next = navStack.value.slice(0, -1)
  navStack.value = next
  setHover(null)
  if (next.length === 0) {
    animateTo(OVERVIEW_POS.clone(), OVERVIEW_TARGET.clone())
  } else {
    const { pos, lookAt } = cameraForEntry(next[next.length - 1])
    animateTo(pos, lookAt)
  }
}

// Determine what to push when an observation is clicked at the current level.
function pushNext(obs: Observation) {
  const top = stackTop()

  if (!top) {
    // ── Atlas ──────────────────────────────────────────────────────────────────
    if (!obs.order) {
      // Unidentified: no order, go straight to specimen
      pushEntry({ type: 'specimen', obs })
      return
    }
    if (obsForOrder(obs.order).length <= 1) {
      // Fast path: single-observation order (Case 1 — Odonata)
      pushEntry({ type: 'specimen', obs })
    } else {
      pushEntry({ type: 'order', key: obs.order })
    }
    return
  }

  if (top.type === 'order') {
    // ── Inside order group ────────────────────────────────────────────────────
    if (!obs.family) {
      // No family data — go to specimen
      pushEntry({ type: 'specimen', obs })
      return
    }
    if (obsForFamily(top.key, obs.family).length <= 1) {
      // Fast path: single-observation family within this order (e.g. Elateridae)
      pushEntry({ type: 'specimen', obs })
    } else {
      pushEntry({ type: 'family', order: top.key, key: obs.family })
    }
    return
  }

  if (top.type === 'family') {
    // ── Inside family group — always go to specimen ───────────────────────────
    pushEntry({ type: 'specimen', obs })
    return
  }
}

// ─── Input handlers ───────────────────────────────────────────────────────────

let mouseDownX = 0
let mouseDownY = 0

function onMouseDown(e: MouseEvent) {
  mouseDownX = e.clientX
  mouseDownY = e.clientY
}

function onMouseMove(e: MouseEvent) {
  mousePos.x = e.clientX
  mousePos.y = e.clientY

  if (stackTop()?.type === 'specimen') return  // no picking at specimen level

  const eligible = eligibleObs()
    .map(o => meshes.get(o.id))
    .filter((m): m is THREE.Mesh => m !== undefined)

  pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)

  const hits = raycaster.intersectObjects(eligible)
  if (hits.length > 0) {
    const id  = hits[0].object.userData.id as string
    setHover(observations.find(o => o.id === id) ?? null)
  } else {
    setHover(null)
  }
}

function onClick(e: MouseEvent) {
  const dx = e.clientX - mouseDownX
  const dy = e.clientY - mouseDownY
  if (Math.hypot(dx, dy) > 5) return  // was a pan, not a click

  if (hoveredObs.value) {
    pushNext(hoveredObs.value)
  } else if (navStack.value.length > 0) {
    popEntry()
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && navStack.value.length > 0) popEntry()
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  const canvas = canvasRef.value!

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(0x0d0c0a)

  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x0d0c0a, 0.018)

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200)
  camera.position.copy(OVERVIEW_POS)

  controls = new OrbitControls(camera, canvas)
  controls.enableRotate  = false
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.minDistance   = 3
  controls.maxDistance   = 60
  controls.target.copy(OVERVIEW_TARGET)
  controls.update()

  for (const obs of observations) {
    const mesh = createMesh(obs)
    scene.add(mesh)
    meshes.set(obs.id, mesh)
  }

  updateVisibility()

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('click',     onClick)
  window.addEventListener('keydown',   onKeyDown)
  window.addEventListener('resize',    onResize)
}

// ─── Render loop ──────────────────────────────────────────────────────────────

function projectLabels(labels: ScreenLabel[]) {
  const w = window.innerWidth
  const h = window.innerHeight
  for (const label of labels) {
    const p = label.world.clone().project(camera)
    label.sx = (p.x * 0.5 + 0.5) * w
    label.sy = (-p.y * 0.5 + 0.5) * h
  }
}

function animate() {
  rafId = requestAnimationFrame(animate)

  if (animating) {
    camera.position.lerp(targetPos, LERP_SPEED)
    controls.target.lerp(targetLookAt, LERP_SPEED)

    if (camera.position.distanceTo(targetPos) < LERP_THRESHOLD) {
      camera.position.copy(targetPos)
      controls.target.copy(targetLookAt)
      animating        = false
      controls.enabled = true
    }
  }

  controls.update()
  projectLabels(orderLabels.value)
  projectLabels(familyLabels.value)

  // Atlas labels fade as the camera approaches. Overview z=35; fully visible
  // above z=26, fully gone below z=16.
  const z = camera.position.z
  labelOpacity.value = Math.max(0, Math.min(1, (z - 16) / 10))

  renderer.render(scene, camera)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(() => {
  init()
  animate()
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  const canvas = canvasRef.value
  canvas?.removeEventListener('mousedown', onMouseDown)
  canvas?.removeEventListener('mousemove', onMouseMove)
  canvas?.removeEventListener('click',     onClick)
  window.removeEventListener('keydown',   onKeyDown)
  window.removeEventListener('resize',    onResize)
  controls.dispose()
  renderer.dispose()
  document.body.style.cursor = 'default'
})
</script>

<template>
  <div class="scene">
    <canvas ref="canvasRef" />

    <!-- Hover label ────────────────────────────────────────────────────────── -->
    <!-- Shows the finest taxonomy rank available for this observation. -->
    <Transition name="fade">
      <div
        v-if="hoveredObs"
        class="hover-label"
        :style="{ left: mousePos.x + 'px', top: mousePos.y + 'px' }"
      >
        <div class="hover-label__name">{{ hoveredObs.commonName }}</div>
        <div v-if="hoveredObs.scientificName" class="hover-label__sci">
          {{ hoveredObs.scientificName }}
        </div>
        <div v-else-if="hoveredObs.genus" class="hover-label__sci">
          Genus {{ hoveredObs.genus }}
        </div>
        <div v-else-if="hoveredObs.family" class="hover-label__sci">
          Family {{ hoveredObs.family }}
        </div>
        <div v-else-if="hoveredObs.order" class="hover-label__sci">
          Order {{ hoveredObs.order }}
        </div>
      </div>
    </Transition>

    <!-- Order labels (Atlas level) ─────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="navStack.length === 0" class="group-labels">
        <div
          v-for="label in orderLabels"
          :key="label.id"
          class="group-label"
          :style="{ left: label.sx + 'px', top: label.sy + 'px', opacity: labelOpacity }"
        >
          {{ label.name }}
        </div>
      </div>
    </Transition>

    <!-- Family labels (inside an order group) ──────────────────────────────── -->
    <Transition name="fade">
      <div v-if="stackTop()?.type === 'order'" class="group-labels">
        <div
          v-for="label in familyLabels"
          :key="label.id"
          class="group-label family-label"
          :style="{ left: label.sx + 'px', top: label.sy + 'px' }"
        >
          {{ label.name }}
        </div>
      </div>
    </Transition>

    <!-- Bottom hint ─────────────────────────────────────────────────────────── -->
    <div class="hint">
      <Transition name="fade" mode="out-in">
        <span v-if="navStack.length === 0"        key="atlas">    Scroll to zoom &nbsp;·&nbsp; Click to enter a group</span>
        <span v-else-if="stackTop()?.type !== 'specimen'" key="group">    Click an observation &nbsp;·&nbsp; Escape to go back</span>
        <span v-else                              key="specimen"> Escape or click background to go back</span>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.scene {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* ── Hover label ─────────────────────────────────────────────────────────── */

.hover-label {
  position: fixed;
  pointer-events: none;
  transform: translate(14px, calc(-100% - 10px));
  background: rgba(8, 7, 5, 0.88);
  border: 1px solid rgba(196, 170, 120, 0.25);
  border-radius: 3px;
  padding: 6px 12px;
  backdrop-filter: blur(8px);
  white-space: nowrap;
}

.hover-label__name {
  color: #ece3d0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.025em;
}

.hover-label__sci {
  color: #8a7a5a;
  font-size: 11px;
  font-style: italic;
  margin-top: 3px;
}

/* ── Group labels ────────────────────────────────────────────────────────── */

.group-labels {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.group-label {
  position: absolute;
  transform: translate(-50%, -50%);
  color: rgba(196, 178, 140, 0.45);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
}

/* Family labels are slightly smaller and dimmer than order labels */
.family-label {
  font-size: 9px;
  color: rgba(180, 160, 120, 0.35);
  letter-spacing: 0.14em;
}

/* ── Hint ────────────────────────────────────────────────────────────────── */

.hint {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(170, 155, 120, 0.38);
  font-size: 11px;
  letter-spacing: 0.1em;
  pointer-events: none;
}

/* ── Transitions ─────────────────────────────────────────────────────────── */

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
