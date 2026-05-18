# FeedFlow

**FeedFlow** is a small, browser-only demo that simulates a **personalized news feed** backed by two classic computer-science ideas: **hash table indexing** (fast lookup by topic) and an **LRU cache** (keep recent users’ feeds in memory and evict the least recently used when space runs out).

There is **no server**, **no database**, and **no build step**—just open `index.html` in a web browser.

---

## What problem does it illustrate?

Imagine many users asking for “my feed” over and over. You could:

1. **Scan every article every time** (like linear search) — simple but slow as data grows.
2. **Index articles by topic** (hash table / map from topic → list of articles) — look up a user’s topics in **O(1)** per topic key.
3. **Cache whole feeds for recent users** — if the same user asks again soon, return the cached feed (**cache hit**) instead of rebuilding it (**cache miss**).

FeedFlow makes (2) and (3) visible: a topic index on screen, a fixed-size cache with LRU eviction, hit/miss counters, and logs.

---

## How it works (high level)

| Piece | Role |
|--------|------|
| **Articles** | A fixed list of sample news items, each with `id`, `topic`, and `title`. |
| **Users** | `U1`–`U4`, each prefers one topic (`sports`, `tech`, `movies`, `finance`). |
| **Topic index** | A JavaScript object: keys are topics, values are arrays of articles. Built once at load—same idea as a hash map for **O(1)** topic lookup. |
| **LRU cache** | Stores up to **N** entries (you choose 2–6 “frames”). Each entry is `{ user, feed, timestamp }`. On a **miss**, if the cache is full, the **least recently used** entry is removed (front of the list); new entry goes at the end. On a **hit**, that user’s entry is moved to the end (most recently used). |
| **Statistics** | Total requests, hits, misses, and hit ratio. |
| **Automation** | Replays a sequence of user requests so you can watch the cache fill, evict, and hit without clicking repeatedly. |

---

## Files in this project

| File | Purpose |
|------|---------|
| `index.html` | Page structure: hero, controls, cache visualization, stats, topic index, feed area, logs, complexity table. |
| `style.css` | Layout and styling (gradient background, cards, buttons, cache frames). |
| `script.js` | Data, topic index build, `requestFeed`, LRU logic, automation, `localStorage` persistence, keyboard shortcuts. |

---

## How to run it

1. Clone or download this folder.
2. Open **`index.html`** in Chrome, Edge, Firefox, or Safari (double-click or drag into the browser).

Optional: use any static file server if you prefer (not required for this project).

---

## Using the UI

- **Request U1–U4** — Simulates one user asking for their feed. Watch **cache hit** vs **cache miss** and the LRU frames update.
- **Cache frames** — Change how many users’ feeds can stay in cache at once. Shrinking the cache may evict entries (LRU from the “oldest” side of the structure used in code).
- **Start / Stop automation** — Runs a demo sequence (or your custom one) on a timer so eviction and hits are easy to see.
- **Custom sequence** — e.g. `U1,U2,U1,U3` (comma-separated `U1`–`U4`). Empty field uses the built-in default sequence.
- **Reset session** — Clears cache, stats, feed display, and logs (and updates stored state).

### Keyboard shortcuts

(When focus is not in an input or select.)

| Key | Action |
|-----|--------|
| `1`–`4` | Request `U1`–`U4` |
| `Space` | Start or stop automation |
| `R` | Reset session |

---

## Concepts (DAA / data structures)

- **Hash table indexing** — Topic → articles: average **O(1)** lookup by topic instead of scanning all articles (**O(n)**) for each topic.
- **Space–time tradeoff** — Extra memory (the cache) buys faster repeated access for hot users.
- **LRU (Least Recently Used)** — When the cache is full, evict the entry that has not been used for the longest time—similar in spirit to LRU page replacement in operating systems.

---

## Persistence

The app saves counters, cache contents, cache size, automation speed, and custom sequence text to **`localStorage`** under the key `feedflow_state`, so a refresh can restore the last session when the browser allows storage.

---

## Limitations (by design)

- Educational demo only: tiny dataset, no real APIs, no auth, no network.
- The “hash table” is a plain object mapping strings to arrays; the important lesson is **constant-time lookup by key**, not a production hashing implementation.

---

## License

If this repository was forked from another project, keep or add the license from the original source. If none is present, treat usage as at your own discretion for learning and demos.
