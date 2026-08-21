#!/usr/bin/env tsx
/**
 * Phase 2 layout script: refine seed positions with a force-directed simulation.
 *
 * Usage:
 *   tsx scripts/layout-observations.ts
 *   tsx scripts/layout-observations.ts --in src/data/observations.json --out src/data/observations.json
 *
 * Reads observations.json (produced by build-observations.ts), runs a
 * force-directed simulation to space observations within their order clusters,
 * then writes the refined x/y back. Z is not modified.
 *
 * Forces:
 *   - Pairwise repulsion between all observations (prevents overlap)
 *   - Attraction toward each observation's order ring centroid (anchors clusters)
 *
 * Order centroids are the same ring positions computed by build-observations.ts.
 * They act as anchors — the simulation spaces observations within each cluster
 * but does not let clusters drift.
 *
 * Tuning:
 *   Increase REPULSION_STRENGTH if observations overlap.
 *   Decrease ATTRACTION_K if clusters are too compressed.
 *   Increase ITERATIONS if the layout has not settled (check the max-velocity line).
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Simulation parameters ─────────────────────────────────────────────────────

const ORDER_RING_RADIUS = 40; // must match build-observations.ts
const REPULSION_STRENGTH = 8; // force magnitude at distance 1
const REPULSION_CUTOFF = 20; // skip pairs farther apart than this (world units)
const MIN_DIST = 3.0; // clamp distance to prevent force explosion at close range
const ATTRACTION_K = 0.04; // spring constant pulling obs toward order centroid
const DAMPING = 0.85; // velocity decay per step (0–1; lower = more damping)
const DT = 0.1; // time step — keep small relative to max repulsion force
const ITERATIONS = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Obs {
  id: string;
  order?: string;
  x: number;
  y: number;
  z: number;
  xSeed?: number;
  ySeed?: number;
  [key: string]: unknown;
}

// ── Order centroids ───────────────────────────────────────────────────────────
//
// Same formula as build-observations.ts — sorted alphabetically, placed on a
// ring starting at the top (−π/2) going clockwise.

function computeOrderCenters(
  orders: string[],
): Map<string, { x: number; y: number }> {
  const centers = new Map<string, { x: number; y: number }>();
  const sorted = [...orders].sort();
  sorted.forEach((order, i) => {
    const angle = (2 * Math.PI * i) / sorted.length - Math.PI / 2;
    centers.set(order, {
      x: ORDER_RING_RADIUS * Math.cos(angle),
      y: ORDER_RING_RADIUS * Math.sin(angle),
    });
  });
  return centers;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const inIdx = args.indexOf("--in");
  const outIdx = args.indexOf("--out");

  const inPath =
    inIdx !== -1 && args[inIdx + 1]
      ? resolve(args[inIdx + 1])
      : resolve(ROOT, "src/data/observations.json");
  const outPath =
    outIdx !== -1 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : inPath;

  console.log(`Reading ${inPath}`);
  const observations: Obs[] = JSON.parse(readFileSync(inPath, "utf-8"));
  console.log(`Loaded ${observations.length} observations`);

  // ── Build order centroids ─────────────────────────────────────────────────

  const orderSet = new Set<string>();
  for (const obs of observations) {
    if (obs.order) orderSet.add(obs.order);
  }
  const orderCenters = computeOrderCenters([...orderSet]);

  console.log(`\nOrder centroids (${orderSet.size} orders):`);
  for (const [order, c] of [...orderCenters.entries()].sort()) {
    console.log(
      `  ${order.padEnd(20)}  x=${c.x.toFixed(1).padStart(6)}  y=${c.y.toFixed(1).padStart(6)}`,
    );
  }

  // ── Preserve seed positions ───────────────────────────────────────────────

  for (const obs of observations) {
    obs.xSeed = obs.x;
    obs.ySeed = obs.y;
  }

  // ── Initialise state ──────────────────────────────────────────────────────

  const n = observations.length;
  const px = observations.map((o) => o.x);
  const py = observations.map((o) => o.y);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);

  // ── Simulation loop ───────────────────────────────────────────────────────

  console.log(`\nRunning ${ITERATIONS} iterations…`);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    // Pairwise repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[i] - px[j];
        const dy = py[i] - py[j];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0 || dist > REPULSION_CUTOFF) continue;
        const clamped = Math.max(dist, MIN_DIST);
        const f = REPULSION_STRENGTH / (clamped * clamped);
        const nx = dx / dist;
        const ny = dy / dist;
        fx[i] += f * nx;
        fy[i] += f * ny;
        fx[j] -= f * nx;
        fy[j] -= f * ny;
      }
    }

    // Attraction toward order centroid
    for (let i = 0; i < n; i++) {
      const center = observations[i].order
        ? orderCenters.get(observations[i].order!)
        : undefined;
      if (!center) continue;
      fx[i] += ATTRACTION_K * (center.x - px[i]);
      fy[i] += ATTRACTION_K * (center.y - py[i]);
    }

    // Euler integration with velocity damping
    let maxV = 0;
    for (let i = 0; i < n; i++) {
      vx[i] = (vx[i] + fx[i] * DT) * DAMPING;
      vy[i] = (vy[i] + fy[i] * DT) * DAMPING;
      px[i] += vx[i] * DT;
      py[i] += vy[i] * DT;
      const speed = vx[i] * vx[i] + vy[i] * vy[i];
      if (speed > maxV) maxV = speed;
    }

    // Progress every 100 iterations
    if ((iter + 1) % 100 === 0) {
      console.log(
        `  iter ${(iter + 1).toString().padStart(4)}  max-velocity=${Math.sqrt(maxV).toFixed(4)}`,
      );
    }
  }

  // ── Write results ─────────────────────────────────────────────────────────

  for (let i = 0; i < n; i++) {
    observations[i].x = Math.round(px[i] * 100) / 100;
    observations[i].y = Math.round(py[i] * 100) / 100;
  }

  writeFileSync(outPath, JSON.stringify(observations, null, 2), "utf-8");
  console.log(`\n✓ Wrote ${observations.length} observations → ${outPath}`);

  // ── Per-order spread summary ──────────────────────────────────────────────

  const groups = new Map<string, { xs: number[]; ys: number[] }>();
  for (const obs of observations) {
    const key = obs.order ?? "Unidentified";
    if (!groups.has(key)) groups.set(key, { xs: [], ys: [] });
    groups.get(key)!.xs.push(obs.x);
    groups.get(key)!.ys.push(obs.y);
  }

  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const std = (a: number[]) => {
    const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
  };

  console.log("\nPer-order spread (n, stddev x, stddev y):");
  for (const [order, { xs, ys }] of [...groups.entries()].sort()) {
    console.log(
      `  ${order.padEnd(20)}  n=${xs.length.toString().padStart(3)}` +
        `  σx=${std(xs).toFixed(2).padStart(5)}  σy=${std(ys).toFixed(2).padStart(5)}`,
    );
  }
}

main();
