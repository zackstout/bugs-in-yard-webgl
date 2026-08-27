# Digital Signage Applicability

## What this project actually is

A Vue 3 + Three.js "specimen cabinet": a WebGL scene where photographs are arranged in 3D space by taxonomic relationship (order → family → genus → species), laid out at build time by a force-directed physics simulation, and explored at runtime via a stack-based semantic zoom (Atlas → Group → Specimen) driven by `OrbitControls` and click. Positions and taxonomy structure are precomputed into static JSON; the renderer just consumes it. See `docs/vision.md`, `docs/zoom-levels-and-taxonomy-depth.md`, `docs/image-layout-physics.md`.

None of that is bug-specific. Strip out "insect" and "taxonomy" and what's left is a general pattern: **a large photo collection, organized by any hierarchy, browsable by flying through space instead of scrolling a grid, with detail density that scales with proximity.** That pattern is genuinely useful for signage.

---

## Why the core mechanism generalizes

Three ideas from this codebase are the reusable part, independent of insects:

1. **Space-as-navigation instead of search-as-navigation.** No search box, no filters, no pagination — you move toward what looks interesting and it resolves. For a passive or semi-passive viewer (someone walking past a screen), this is a much better fit than a UI built around typing or scrolling.
2. **Zoom-gated information density** (`zoom-levels-and-taxonomy-depth.md`). Far away you see categories; closer you see individuals. This maps directly onto the signage problem of "readable from 15 feet, informative up close" without maintaining two separate layouts.
3. **Build-time layout, runtime playback.** The force simulation (`image-layout-physics.md`) runs once and produces a static position map. The player just renders it. This is exactly the operating model signage wants: content updates weekly/monthly, not per-request, and the player shouldn't depend on a live backend.

---

## Where this pattern fits as signage

- **Museum / nature center / aquarium lobby** — the most literal reuse. A specimen or species collection, browsable ambiently on a large screen or as a touch kiosk. This is close enough to the existing content that it's nearly a direct port.
- **Retail showroom / flagship store display** — replace taxonomy with product hierarchy (department → category → subcategory → SKU). The force-directed "specimens in a drawer" layout is a more distinctive alternative to a grid catalog, and "cluster size shows what you carry a lot of" is a nice incidental merchandising signal.
- **Corporate lobby directory** — company → division → team → person, camera zooming from an org-wide view down to headshots. The stack-based navigation (`[] → [division] → [team] → [person]`) maps onto org charts almost without modification.
- **Restaurant / menu board** — category → subcategory → dish. Vision.md's "photography is primary, metadata serves the photograph" principle is arguably a better fit for food photography than it is for taxonomy.
- **Real estate portfolio board** — region → building → unit, in a leasing office or developer lobby.
- **Trade show sponsor / conference wall** — tier → sponsor logos, where cluster size visibly communicates tier depth ("the shape of the collection is visible" — vision.md's own words, repurposed as an incidental sponsorship-value signal).
- **University / research campus directory** — college → department → lab → researcher, similar shape to the corporate lobby case.

---

## What has to change to work as signage

This is the part worth taking seriously — the interaction model here is built entirely around a mouse-driven desktop user, and most signage has no mouse.

- **No pointer input, most of the time.** `OrbitControls` assumes a mouse or touch drag. Two real modes to design for instead:
  - *Passive / attract-mode signage*: no viewer input at all. The stack-based zoom model (Atlas → Group → Specimen) becomes a **scripted camera tour** instead of a user-driven one — drift across the Atlas, ease into a cluster, hold at Specimen depth, pull back, pick the next cluster, repeat. The navigation stack already defines valid stopping points; a tour is just an autoplayed sequence of stack pushes/pops with timed dwell.
  - *Kiosk / touchscreen signage*: `OrbitControls`-equivalent touch (drag to orbit, pinch to zoom) maps onto the existing zoom-level thresholds almost directly, since those thresholds are already defined as normalized camera distance, not literal mouse deltas.
- **Idle timeout back to Atlas.** Signage can't have a dead-end state waiting on a user who leaves. The existing Escape-pops-one-level model needs an additional "no interaction for N seconds → animate back to Atlas → resume attract mode" rule, which doesn't currently exist (the app assumes a continuously present desktop user).
- **Proximity as an alternative input.** Many signage installs already have a person sensor or camera for dwell detection. That maps naturally onto this app's core metaphor: "zoom controls what you know" could become "distance from the screen controls what you know" — someone approaching pushes the camera from Atlas toward Group, exactly the semantic transition this app already models, just driven by a sensor instead of a scroll wheel.
- **Orientation.** The force-directed layout and cluster footprints (`image-layout-physics.md`) are implicitly landscape-shaped. A lot of signage is portrait (elevator lobbies, retail columns). The simulation's anchor/gravity model would need bounds-aware footprints rather than assuming a wide canvas — not a redesign, but not free either.
- **Hardware headroom.** The current renderer creates one `PlaneGeometry` + one `TextureLoader().load()` call per image (`BugScene.vue`), not instanced or atlased. Fine for a desktop browser with a few hundred images; a constrained signage media player (Android STB, BrightSign, low-power NUC) driving a 4K panel with a few thousand images would need texture atlasing or instanced meshes to stay smooth. This is a real engineering cost, not a config flag.
- **Never-broken loop.** Signage content has to run unattended for weeks. The build-time/runtime split already helps here (no live backend to go down), but the *runtime* needs to be bulletproof against getting stuck mid-transition with no user around to hit Escape — worth explicit state-machine testing, not just relying on the interaction model that works fine with a person at a keyboard.

---

## Where the fit is weaker

Worth naming honestly, since vision.md is opinionated about what this app deliberately is *not*:

- **"Not a data visualization."** Vision.md is explicit that the app shouldn't produce charts or stats — the shape should just be *felt*. Plenty of real signage briefs want the opposite: an explicit "500+ SKUs" or "12 departments" counter. That's a values conflict with the source project, not a technical one — a signage fork would need to decide whether to keep that restraint or add it back for stakeholders who want numbers on the wall.
- **"Not a mobile app... requires a mouse."** The existing app treats keyboard/mouse as load-bearing to "feel like a space." That instinct is right for a desktop browsing experience and wrong for signage, where you're designing for someone who is walking, standing 10 feet back, or has both hands full. The interaction model would need to be rebuilt around dwell/attract/touch from scratch rather than adapted incrementally.
- **Single-collection, single-owner framing** ("no other users") actually fits signage well — signage is inherently one-audience-facing with no accounts — so this isn't a real gap, just worth flagging as an assumption that happens to transfer cleanly.

---

## If this were worth prototyping

The cheapest way to test the idea isn't a new data domain — it's building the **attract-mode camera tour** on top of the existing insect data, since the navigation stack and zoom thresholds already exist and don't need touching. That alone would validate whether "a scripted flythrough of a force-directed photo space" reads as compelling ambient content on a screen nobody is touching, before investing in touch/proximity input or a different content domain.
