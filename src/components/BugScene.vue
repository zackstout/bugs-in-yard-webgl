<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { observations } from '../data/observations'
import type { Observation } from '../types/Observation'

// ─── Reactive UI state ────────────────────────────────────────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null)
const hoveredObs = ref<Observation | null>(null)
const focusedObs = ref<Observation | null>(null)
const mousePos = reactive({ x: 0, y: 0 })

// Atlas-level label opacity: 1.0 at overview distance, fades to 0 as the
// camera zooms in. This is the foundation for Phase 3 semantic zoom — the
// renderer already tracks zoom depth; the threshold logic moves here later.
const labelOpacity = ref(1)

// ─── Group label definitions (derived from observation data) ──────────────────

// Common names for order-level Atlas labels. These are what the user sees
// at the outermost zoom level. Scientific order names are used as the key.
const ORDER_DISPLAY_NAMES: Record<string, string> = {
  Coleoptera:   'Beetles',
  Lepidoptera:  'Butterflies & Moths',
  Hymenoptera:  'Bees & Wasps',
  Odonata:      'Dragonflies & Damselflies',
  Hemiptera:    'True Bugs',
}

interface GroupLabel {
  id: string
  name: string
  world: THREE.Vector3
  sx: number
  sy: number
}

// Build one label per order (or 'Unidentified') from the observation data.
// Label world position is placed above the topmost observation in each group,
// so it stays clear of the image planes regardless of cluster size.
function buildGroupLabels(): GroupLabel[] {
  const groups = new Map<string, { xs: number[]; ys: number[] }>()
  for (const obs of observations) {
    const key = obs.order ?? 'Unidentified'
    if (!groups.has(key)) groups.set(key, { xs: [], ys: [] })
    const g = groups.get(key)!
    g.xs.push(obs.x)
    g.ys.push(obs.y)
  }
  return [...groups.entries()].map(([key, g]) => {
    const cx = g.xs.reduce((a, b) => a + b, 0) / g.xs.length
    const maxY = Math.max(...g.ys)
    const name = ORDER_DISPLAY_NAMES[key] ?? key
    return { id: key, name, world: new THREE.Vector3(cx, maxY + 1.8, 0), sx: 0, sy: 0 }
  })
}

const groupLabels = ref<GroupLabel[]>(buildGroupLabels())

// ─── Three.js objects (not reactive) ──────────────────────────────────────────

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let controls: OrbitControls
let rafId: number

const meshes = new Map<string, THREE.Mesh>()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

// ─── Camera animation ─────────────────────────────────────────────────────────

const OVERVIEW_POS    = new THREE.Vector3(0, 0, 35)
const OVERVIEW_TARGET = new THREE.Vector3(0, 0,  0)
const FOCUS_OFFSET    = 8
const LERP_SPEED      = 0.07
const LERP_THRESHOLD  = 0.04

let targetPos    = OVERVIEW_POS.clone()
let targetLookAt = OVERVIEW_TARGET.clone()
let animating    = false

// ─── Fallback texture ─────────────────────────────────────────────────────────

function makeFallbackTexture(name: string): THREE.Texture {
  const w = 600, h = 400
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f0e9d8'
  ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = '#c4aa80'
  ctx.lineWidth = 5
  ctx.strokeRect(12, 12, w - 24, h - 24)

  ctx.fillStyle = '#1c1208'
  ctx.font = 'bold 38px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Simple word-wrap
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

function createMesh(obs: Observation): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(3, 2)
  const mat = new THREE.MeshBasicMaterial({
    map: makeFallbackTexture(obs.commonName),
    side: THREE.FrontSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(obs.x, obs.y, obs.z)
  mesh.userData.id = obs.id

  // Swap in the real photo if it exists; silently keep fallback on error
  new THREE.TextureLoader().load(
    `/images/${obs.imageFile}`,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      mat.map = tex
      mat.needsUpdate = true
    },
    undefined,
    () => { /* fallback stays */ },
  )

  return mesh
}

// ─── Hover helpers ────────────────────────────────────────────────────────────

function setHover(obs: Observation | null) {
  if (hoveredObs.value === obs) return

  if (hoveredObs.value) {
    meshes.get(hoveredObs.value.id)?.scale.setScalar(1)
  }
  hoveredObs.value = obs
  if (obs) {
    meshes.get(obs.id)?.scale.setScalar(1.1)
  }
  document.body.style.cursor = obs ? 'pointer' : 'default'
}

// ─── Camera focus / return ────────────────────────────────────────────────────

function focusOn(obs: Observation) {
  setHover(null)
  focusedObs.value = obs
  targetLookAt = new THREE.Vector3(obs.x, obs.y, obs.z)
  targetPos    = new THREE.Vector3(obs.x, obs.y, obs.z + FOCUS_OFFSET)
  animating = true
  controls.enabled = false
}

function returnToOverview() {
  setHover(null)
  focusedObs.value = null
  targetPos    = OVERVIEW_POS.clone()
  targetLookAt = OVERVIEW_TARGET.clone()
  animating = true
  controls.enabled = false
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

  if (focusedObs.value) return // no hover picking while focused

  pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)

  const hits = raycaster.intersectObjects([...meshes.values()])
  if (hits.length > 0) {
    const id  = hits[0].object.userData.id as string
    const obs = observations.find(o => o.id === id) ?? null
    setHover(obs)
  } else {
    setHover(null)
  }
}

function onClick(e: MouseEvent) {
  const dx = e.clientX - mouseDownX
  const dy = e.clientY - mouseDownY
  if (Math.hypot(dx, dy) > 5) return // was a pan, not a click

  if (hoveredObs.value) {
    focusOn(hoveredObs.value)
  } else if (focusedObs.value) {
    returnToOverview()
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') returnToOverview()
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

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('click',     onClick)
  window.addEventListener('keydown',   onKeyDown)
  window.addEventListener('resize',    onResize)
}

// ─── Render loop ──────────────────────────────────────────────────────────────

function updateGroupLabelPositions() {
  const w = window.innerWidth
  const h = window.innerHeight
  for (const label of groupLabels.value) {
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
      animating = false
      controls.enabled = true
    }
  }

  controls.update()
  updateGroupLabelPositions()

  // Atlas labels fade as the camera zooms toward a group.
  // Overview z=35; labels are fully visible above z=26, fully gone below z=16.
  // This gives a 10-unit fade window that matches the natural approach distance.
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

    <!-- Hover label -->
    <!-- Shows the finest taxonomy rank available for this observation.
         For species-level IDs: scientific name. For family-level: "Family X".
         For unidentified: no second line. -->
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

    <!-- Group labels — Atlas-level order labels.
         Hidden when focused on a specimen. Fade as camera zooms in toward
         a group (labelOpacity driven by camera.position.z in the render loop). -->
    <Transition name="fade">
      <div v-if="!focusedObs" class="group-labels">
        <div
          v-for="label in groupLabels"
          :key="label.id"
          class="group-label"
          :style="{ left: label.sx + 'px', top: label.sy + 'px', opacity: labelOpacity }"
        >
          {{ label.name }}
        </div>
      </div>
    </Transition>

    <!-- Bottom hint -->
    <div class="hint">
      <Transition name="fade" mode="out-in">
        <span v-if="!focusedObs" key="overview">Scroll to zoom &nbsp;·&nbsp; Click to focus</span>
        <span v-else key="focused">Press Escape or click the background to return</span>
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
