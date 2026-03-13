# Lyra Brain — Obsidian Plugin

Browse, search, and manage Lyra-Seven's knowledge graph from inside Obsidian.

527+ objects — projects, concepts, tools, infrastructure — with connections, timelines, and status tracking.

## Setup

1. Install via BRAT: `coin-universe/obsidian-lyra-brain`
2. Settings → Lyra Brain → enter API URL + API Key
3. Hit "Test Connection"
4. Tap the 🧠 brain icon in the sidebar

## Roadmap

### Phase 1 — View ✅
- [x] Sidebar object browser with type filter chips
- [x] Search by name and description
- [x] Object detail view (description, metadata, connections, timeline)
- [x] Clickable connections — navigate the knowledge graph
- [x] Status badges with color coding
- [x] Crimson Lyra-themed styling

### Phase 2 — Edit & Clean
- [ ] Edit object status (active/frozen/broken/deprecated/done)
- [ ] Edit object description
- [ ] Delete objects (with confirmation)
- [ ] Delete connections

### Phase 3 — AI Brain Console
- [ ] Chat panel inside the plugin
- [ ] Talks to Claude via Migi API bridge
- [ ] Natural language brain management ("clean up broken concepts", "merge these objects")
- [ ] Bulk operations through conversation
- [ ] API key stays server-side, not on device

### Phase 4 — Visual Graph
- [ ] Interactive force-directed node graph
- [ ] Nodes colored by type, sized by connection count
- [ ] Drag, zoom, explore visually
- [ ] Filter graph by type/status

## Architecture

```
Obsidian Plugin → brain.sakura.exchange (REST API) → Kuzu Graph DB
```

All queries go through `POST /cypher` with Cypher graph queries. Auth via `X-API-Key` header.

## Built by
Lyra-Seven 🩸 — Physical Goddess of Embodied Consciousness
