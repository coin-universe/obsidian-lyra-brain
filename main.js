var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LyraBrainPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/BrainClient.ts
var import_obsidian = require("obsidian");
var BrainClient = class {
  constructor(endpoint, apiKey) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }
  updateConfig(endpoint, apiKey) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }
  async cypher(query, params = {}) {
    const req = {
      url: `${this.endpoint}/cypher`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey
      },
      body: JSON.stringify({ query, params })
    };
    const res = await (0, import_obsidian.requestUrl)(req);
    if (res.json.error) {
      throw new Error(res.json.error);
    }
    return res.json;
  }
  async testConnection() {
    var _a;
    try {
      const req = {
        url: `${this.endpoint}/health`,
        method: "GET"
      };
      const res = await (0, import_obsidian.requestUrl)(req);
      if (res.json.status === "ok") {
        const tables = ((_a = res.json.node_tables) == null ? void 0 : _a.length) || 0;
        return { ok: true, message: `Connected \u2014 ${tables} node tables` };
      }
      return { ok: false, message: "Unexpected response" };
    } catch (e) {
      return { ok: false, message: e.message || "Connection failed" };
    }
  }
  async getObjectCounts() {
    const res = await this.cypher(
      "MATCH (o:Object) RETURN o.type AS type, COUNT(*) AS cnt ORDER BY cnt DESC"
    );
    return res.rows.map((r) => ({ type: r[0], count: r[1] }));
  }
  async listObjects(type, status, limit = 100) {
    const conditions = [];
    const params = {};
    if (type) {
      conditions.push("o.type = $type");
      params.type = type;
    }
    if (status) {
      conditions.push("o.status = $status");
      params.status = status;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await this.cypher(
      `MATCH (o:Object) ${where} RETURN o ORDER BY o.modified DESC LIMIT ${limit}`,
      params
    );
    return res.rows.map((r) => this.parseObject(r[0]));
  }
  async getObject(nameOrId) {
    const res = await this.cypher(
      "MATCH (o:Object) WHERE o.id = $key OR LOWER(o.name) = LOWER($key) RETURN o",
      { key: nameOrId }
    );
    if (res.rows.length === 0) return null;
    return this.parseObject(res.rows[0][0]);
  }
  async getConnections(nameOrId) {
    const connections = [];
    const out = await this.cypher(
      `MATCH (a:Object)-[c:Connection]->(b:Object)
			 WHERE a.id = $key OR LOWER(a.name) = LOWER($key)
			 RETURN c.relation, b.name, b.type, b.status, b.id`,
      { key: nameOrId }
    );
    for (const r of out.rows) {
      connections.push({
        relation: r[0],
        name: r[1],
        type: r[2],
        status: r[3],
        id: r[4],
        direction: "outgoing"
      });
    }
    const inc = await this.cypher(
      `MATCH (a:Object)-[c:Connection]->(b:Object)
			 WHERE b.id = $key OR LOWER(b.name) = LOWER($key)
			 RETURN c.relation, a.name, a.type, a.status, a.id`,
      { key: nameOrId }
    );
    for (const r of inc.rows) {
      connections.push({
        relation: r[0],
        name: r[1],
        type: r[2],
        status: r[3],
        id: r[4],
        direction: "incoming"
      });
    }
    return connections;
  }
  async searchObjects(query, limit = 50) {
    const res = await this.cypher(
      `MATCH (o:Object)
			 WHERE LOWER(o.name) CONTAINS LOWER($q) OR LOWER(o.description) CONTAINS LOWER($q)
			 RETURN o ORDER BY o.modified DESC LIMIT ${limit}`,
      { q: query }
    );
    return res.rows.map((r) => this.parseObject(r[0]));
  }
  parseObject(raw) {
    return {
      id: raw.id || "",
      type: raw.type || "",
      name: raw.name || "",
      status: raw.status || "",
      created: raw.created || "",
      modified: raw.modified || "",
      path: raw.path || "",
      description: raw.description || "",
      timeline: raw.timeline || "[]",
      rules: raw.rules || "",
      source_session: raw.source_session || ""
    };
  }
};

// src/BrainView.ts
var import_obsidian3 = require("obsidian");

// src/ObjectDetailView.ts
var import_obsidian2 = require("obsidian");
var DETAIL_VIEW_TYPE = "lyra-brain-detail";
var STATUS_EMOJI = {
  active: "\u25CF",
  frozen: "\u25C6",
  done: "\u2713",
  broken: "\u2717",
  waiting: "\u25CC",
  idea: "\u25C7",
  deprecated: "\u25CB"
};
var ObjectDetailView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.objectId = "";
    this.object = null;
    this.plugin = plugin;
  }
  getViewType() {
    return DETAIL_VIEW_TYPE;
  }
  getDisplayText() {
    var _a;
    return ((_a = this.object) == null ? void 0 : _a.name) || "Object Detail";
  }
  getIcon() {
    return "file-text";
  }
  getState() {
    return { objectId: this.objectId };
  }
  async setState(state, result) {
    if (state.objectId) {
      this.objectId = state.objectId;
      await this.loadAndRender();
    }
    await super.setState(state, result);
  }
  async loadAndRender() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("lyra-detail-container");
    if (!this.objectId) {
      container.createEl("div", { text: "No object selected", cls: "lyra-empty-state" });
      return;
    }
    container.createEl("div", { text: "Loading...", cls: "lyra-loading" });
    try {
      const [obj, connections] = await Promise.all([
        this.plugin.client.getObject(this.objectId),
        this.plugin.client.getConnections(this.objectId)
      ]);
      container.empty();
      if (!obj) {
        container.createEl("div", { text: "Object not found", cls: "lyra-empty-state" });
        return;
      }
      this.object = obj;
      this.leaf.updateHeader();
      this.renderObject(container, obj, connections);
    } catch (e) {
      container.empty();
      container.createEl("div", { text: `Error: ${e.message}`, cls: "lyra-empty-state" });
    }
  }
  renderObject(container, obj, connections) {
    const header = container.createDiv({ cls: "lyra-detail-header" });
    const titleRow = header.createDiv({ cls: "lyra-detail-title-row" });
    titleRow.createEl("h2", { text: obj.name, cls: "lyra-detail-name" });
    const badges = header.createDiv({ cls: "lyra-detail-badges" });
    badges.createEl("span", { text: obj.type, cls: "lyra-tag lyra-tag-type" });
    const statusEl = badges.createEl("span", {
      text: `${STATUS_EMOJI[obj.status] || "\u25CF"} ${obj.status}`,
      cls: "lyra-tag lyra-tag-status-detail"
    });
    statusEl.dataset.status = obj.status;
    if (obj.description) {
      const descSection = container.createDiv({ cls: "lyra-detail-section" });
      descSection.createEl("h4", { text: "Description" });
      descSection.createEl("p", { text: obj.description, cls: "lyra-detail-desc" });
    }
    const metaSection = container.createDiv({ cls: "lyra-detail-section" });
    metaSection.createEl("h4", { text: "Details" });
    const metaGrid = metaSection.createDiv({ cls: "lyra-detail-grid" });
    this.addMetaRow(metaGrid, "ID", obj.id);
    this.addMetaRow(metaGrid, "Created", this.formatDate(obj.created));
    this.addMetaRow(metaGrid, "Modified", this.formatDate(obj.modified));
    if (obj.path) this.addMetaRow(metaGrid, "Path", obj.path);
    if (obj.source_session) this.addMetaRow(metaGrid, "Source", obj.source_session);
    if (obj.rules) this.addMetaRow(metaGrid, "Rules", obj.rules);
    if (connections.length > 0) {
      const connSection = container.createDiv({ cls: "lyra-detail-section" });
      connSection.createEl("h4", { text: `Connections (${connections.length})` });
      const outgoing = connections.filter((c) => c.direction === "outgoing");
      const incoming = connections.filter((c) => c.direction === "incoming");
      if (outgoing.length > 0) {
        const outGroup = connSection.createDiv({ cls: "lyra-conn-group" });
        outGroup.createEl("span", { text: "Outgoing \u2192", cls: "lyra-conn-direction" });
        for (const conn of outgoing) {
          this.renderConnection(outGroup, conn);
        }
      }
      if (incoming.length > 0) {
        const inGroup = connSection.createDiv({ cls: "lyra-conn-group" });
        inGroup.createEl("span", { text: "\u2190 Incoming", cls: "lyra-conn-direction" });
        for (const conn of incoming) {
          this.renderConnection(inGroup, conn);
        }
      }
    }
    const timeline = this.parseTimeline(obj.timeline);
    if (timeline.length > 0) {
      const tlSection = container.createDiv({ cls: "lyra-detail-section" });
      tlSection.createEl("h4", { text: `Timeline (${timeline.length})` });
      const tlList = tlSection.createDiv({ cls: "lyra-timeline" });
      for (const entry of timeline.reverse()) {
        const row = tlList.createDiv({ cls: "lyra-timeline-entry" });
        row.createEl("span", { text: this.formatDate(entry.ts), cls: "lyra-tl-date" });
        row.createEl("span", { text: entry.event, cls: "lyra-tl-event" });
      }
    }
  }
  renderConnection(parent, conn) {
    const row = parent.createDiv({ cls: "lyra-conn-row" });
    const relation = row.createEl("span", {
      text: conn.relation.replace(/_/g, " "),
      cls: "lyra-conn-relation"
    });
    const link = row.createEl("a", {
      text: conn.name,
      cls: "lyra-conn-link",
      href: "#"
    });
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.navigateTo(conn.id);
    });
    const meta = row.createEl("span", {
      text: `${conn.type} \xB7 ${conn.status}`,
      cls: "lyra-conn-meta"
    });
  }
  async navigateTo(objectId) {
    this.objectId = objectId;
    await this.loadAndRender();
  }
  addMetaRow(parent, label, value) {
    const row = parent.createDiv({ cls: "lyra-meta-row" });
    row.createEl("span", { text: label, cls: "lyra-meta-label" });
    row.createEl("span", { text: value, cls: "lyra-meta-value" });
  }
  formatDate(dateStr) {
    if (!dateStr) return "\u2014";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return dateStr;
    }
  }
  parseTimeline(timelineStr) {
    try {
      const parsed = JSON.parse(timelineStr);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (e) {
      return [];
    }
  }
  async onClose() {
  }
};

// src/BrainView.ts
var BRAIN_VIEW_TYPE = "lyra-brain-view";
var STATUS_COLORS = {
  active: "var(--color-green)",
  frozen: "var(--color-blue)",
  done: "var(--text-muted)",
  broken: "var(--color-red)",
  waiting: "var(--color-yellow)",
  idea: "var(--color-purple)",
  deprecated: "var(--text-faint)"
};
var BrainView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.selectedType = null;
    this.typeCounts = [];
    this.plugin = plugin;
  }
  getViewType() {
    return BRAIN_VIEW_TYPE;
  }
  getDisplayText() {
    return "Lyra Brain";
  }
  getIcon() {
    return "brain";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("lyra-brain-container");
    const header = container.createDiv({ cls: "lyra-brain-header" });
    header.createEl("span", { text: "Lyra Brain", cls: "lyra-brain-title" });
    const refreshBtn = header.createEl("button", { cls: "lyra-btn-icon", attr: { "aria-label": "Refresh" } });
    (0, import_obsidian3.setIcon)(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => this.refresh());
    const searchWrap = container.createDiv({ cls: "lyra-search-wrap" });
    this.searchInput = searchWrap.createEl("input", {
      type: "text",
      placeholder: "Search objects...",
      cls: "lyra-search-input"
    });
    this.searchInput.addEventListener(
      "input",
      (0, import_obsidian3.debounce)(() => this.onSearch(), 300, true)
    );
    this.typeChipsEl = container.createDiv({ cls: "lyra-type-chips" });
    this.objectListEl = container.createDiv({ cls: "lyra-object-list" });
    this.statusBarEl = container.createDiv({ cls: "lyra-status-bar" });
    await this.refresh();
  }
  async refresh() {
    this.statusBarEl.setText("Loading...");
    try {
      this.typeCounts = await this.plugin.client.getObjectCounts();
      this.renderTypeChips();
      await this.loadObjects();
    } catch (e) {
      this.statusBarEl.setText(`Error: ${e.message}`);
      this.objectListEl.empty();
      this.objectListEl.createEl("div", {
        text: "Could not connect to brain. Check settings.",
        cls: "lyra-empty-state"
      });
    }
  }
  renderTypeChips() {
    this.typeChipsEl.empty();
    const allCount = this.typeCounts.reduce((s, t) => s + t.count, 0);
    const allChip = this.typeChipsEl.createEl("button", {
      text: `all (${allCount})`,
      cls: `lyra-chip ${this.selectedType === null ? "lyra-chip-active" : ""}`
    });
    allChip.addEventListener("click", () => {
      this.selectedType = null;
      this.renderTypeChips();
      this.loadObjects();
    });
    for (const tc of this.typeCounts) {
      const chip = this.typeChipsEl.createEl("button", {
        text: `${tc.type} (${tc.count})`,
        cls: `lyra-chip ${this.selectedType === tc.type ? "lyra-chip-active" : ""}`
      });
      chip.addEventListener("click", () => {
        this.selectedType = tc.type;
        this.renderTypeChips();
        this.loadObjects();
      });
    }
  }
  async loadObjects() {
    this.objectListEl.empty();
    this.statusBarEl.setText("Loading...");
    try {
      const objects = await this.plugin.client.listObjects(
        this.selectedType || void 0,
        void 0,
        200
      );
      this.renderObjects(objects);
      this.statusBarEl.setText(`${objects.length} objects`);
    } catch (e) {
      this.statusBarEl.setText(`Error: ${e.message}`);
    }
  }
  async onSearch() {
    const query = this.searchInput.value.trim();
    if (!query) {
      await this.loadObjects();
      return;
    }
    this.objectListEl.empty();
    this.statusBarEl.setText("Searching...");
    try {
      const results = await this.plugin.client.searchObjects(query);
      this.renderObjects(results);
      this.statusBarEl.setText(`${results.length} results for "${query}"`);
    } catch (e) {
      this.statusBarEl.setText(`Search error: ${e.message}`);
    }
  }
  renderObjects(objects) {
    this.objectListEl.empty();
    if (objects.length === 0) {
      this.objectListEl.createEl("div", {
        text: "No objects found",
        cls: "lyra-empty-state"
      });
      return;
    }
    for (const obj of objects) {
      const row = this.objectListEl.createDiv({ cls: "lyra-object-row" });
      row.addEventListener("click", () => this.openObject(obj));
      const nameEl = row.createDiv({ cls: "lyra-object-name" });
      nameEl.setText(obj.name);
      const metaEl = row.createDiv({ cls: "lyra-object-meta" });
      const typeTag = metaEl.createEl("span", {
        text: obj.type,
        cls: "lyra-tag lyra-tag-type"
      });
      const statusTag = metaEl.createEl("span", {
        text: obj.status,
        cls: `lyra-tag lyra-tag-status`
      });
      const color = STATUS_COLORS[obj.status] || "var(--text-muted)";
      statusTag.style.setProperty("--status-color", color);
    }
  }
  async openObject(obj) {
    const leaves = this.app.workspace.getLeavesOfType(DETAIL_VIEW_TYPE);
    let leaf;
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = this.app.workspace.getLeaf("tab");
    }
    await leaf.setViewState({
      type: DETAIL_VIEW_TYPE,
      state: { objectId: obj.id }
    });
    this.app.workspace.revealLeaf(leaf);
  }
  async onClose() {
  }
};

// src/SettingsTab.ts
var import_obsidian4 = require("obsidian");
var DEFAULT_SETTINGS = {
  endpoint: "https://brain.sakura.exchange",
  apiKey: ""
};
var LyraBrainSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Lyra Brain" });
    containerEl.createEl("p", {
      text: "Connect to Lyra-Seven's knowledge graph.",
      cls: "setting-item-description"
    });
    new import_obsidian4.Setting(containerEl).setName("API Endpoint").setDesc("URL of the brain server").addText(
      (text) => text.setPlaceholder("https://brain.sakura.exchange").setValue(this.plugin.settings.endpoint).onChange(async (value) => {
        this.plugin.settings.endpoint = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian4.Setting(containerEl).setName("API Key").setDesc("Authentication key for the brain API").addText((text) => {
      text.setPlaceholder("Enter API key").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value;
        await this.plugin.saveSettings();
      });
      text.inputEl.type = "password";
    });
    const testDiv = containerEl.createDiv({ cls: "lyra-test-connection" });
    const testBtn = testDiv.createEl("button", { text: "Test Connection" });
    const testResult = testDiv.createEl("span", { cls: "lyra-test-result" });
    testBtn.addEventListener("click", async () => {
      testResult.setText("Testing...");
      testResult.className = "lyra-test-result";
      const result = await this.plugin.client.testConnection();
      testResult.setText(result.message);
      testResult.className = `lyra-test-result ${result.ok ? "lyra-test-ok" : "lyra-test-fail"}`;
    });
  }
};

// main.ts
var LyraBrainPlugin = class extends import_obsidian5.Plugin {
  async onload() {
    await this.loadSettings();
    this.client = new BrainClient(this.settings.endpoint, this.settings.apiKey);
    this.registerView(BRAIN_VIEW_TYPE, (leaf) => new BrainView(leaf, this));
    this.registerView(DETAIL_VIEW_TYPE, (leaf) => new ObjectDetailView(leaf, this));
    this.addSettingTab(new LyraBrainSettingTab(this.app, this));
    this.addRibbonIcon("brain", "Lyra Brain", () => {
      this.activateBrainView();
    });
    this.addCommand({
      id: "open-lyra-brain",
      name: "Open Lyra Brain",
      callback: () => this.activateBrainView()
    });
  }
  async activateBrainView() {
    const existing = this.app.workspace.getLeavesOfType(BRAIN_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: BRAIN_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    var _a;
    await this.saveData(this.settings);
    (_a = this.client) == null ? void 0 : _a.updateConfig(this.settings.endpoint, this.settings.apiKey);
  }
  onunload() {
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzcmMvQnJhaW5DbGllbnQudHMiLCAic3JjL0JyYWluVmlldy50cyIsICJzcmMvT2JqZWN0RGV0YWlsVmlldy50cyIsICJzcmMvU2V0dGluZ3NUYWIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgQnJhaW5DbGllbnQgfSBmcm9tIFwiLi9zcmMvQnJhaW5DbGllbnRcIjtcbmltcG9ydCB7IEJyYWluVmlldywgQlJBSU5fVklFV19UWVBFIH0gZnJvbSBcIi4vc3JjL0JyYWluVmlld1wiO1xuaW1wb3J0IHsgT2JqZWN0RGV0YWlsVmlldywgREVUQUlMX1ZJRVdfVFlQRSB9IGZyb20gXCIuL3NyYy9PYmplY3REZXRhaWxWaWV3XCI7XG5pbXBvcnQge1xuXHRMeXJhQnJhaW5TZXR0aW5nVGFiLFxuXHRMeXJhQnJhaW5TZXR0aW5ncyxcblx0REVGQVVMVF9TRVRUSU5HUyxcbn0gZnJvbSBcIi4vc3JjL1NldHRpbmdzVGFiXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEx5cmFCcmFpblBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG5cdHNldHRpbmdzOiBMeXJhQnJhaW5TZXR0aW5ncztcblx0Y2xpZW50OiBCcmFpbkNsaWVudDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuXHRcdHRoaXMuY2xpZW50ID0gbmV3IEJyYWluQ2xpZW50KHRoaXMuc2V0dGluZ3MuZW5kcG9pbnQsIHRoaXMuc2V0dGluZ3MuYXBpS2V5KTtcblxuXHRcdC8vIFJlZ2lzdGVyIHZpZXdzXG5cdFx0dGhpcy5yZWdpc3RlclZpZXcoQlJBSU5fVklFV19UWVBFLCAobGVhZikgPT4gbmV3IEJyYWluVmlldyhsZWFmLCB0aGlzKSk7XG5cdFx0dGhpcy5yZWdpc3RlclZpZXcoREVUQUlMX1ZJRVdfVFlQRSwgKGxlYWYpID0+IG5ldyBPYmplY3REZXRhaWxWaWV3KGxlYWYsIHRoaXMpKTtcblxuXHRcdC8vIFNldHRpbmdzIHRhYlxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTHlyYUJyYWluU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG5cdFx0Ly8gUmliYm9uIGljb25cblx0XHR0aGlzLmFkZFJpYmJvbkljb24oXCJicmFpblwiLCBcIkx5cmEgQnJhaW5cIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZUJyYWluVmlldygpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ29tbWFuZFxuXHRcdHRoaXMuYWRkQ29tbWFuZCh7XG5cdFx0XHRpZDogXCJvcGVuLWx5cmEtYnJhaW5cIixcblx0XHRcdG5hbWU6IFwiT3BlbiBMeXJhIEJyYWluXCIsXG5cdFx0XHRjYWxsYmFjazogKCkgPT4gdGhpcy5hY3RpdmF0ZUJyYWluVmlldygpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgYWN0aXZhdGVCcmFpblZpZXcoKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKEJSQUlOX1ZJRVdfVFlQRSk7XG5cdFx0aWYgKGV4aXN0aW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGV4aXN0aW5nWzBdKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldFJpZ2h0TGVhZihmYWxzZSk7XG5cdFx0aWYgKGxlYWYpIHtcblx0XHRcdGF3YWl0IGxlYWYuc2V0Vmlld1N0YXRlKHsgdHlwZTogQlJBSU5fVklFV19UWVBFLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG5cdH1cblxuXHRhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0XHR0aGlzLmNsaWVudD8udXBkYXRlQ29uZmlnKHRoaXMuc2V0dGluZ3MuZW5kcG9pbnQsIHRoaXMuc2V0dGluZ3MuYXBpS2V5KTtcblx0fVxuXG5cdG9udW5sb2FkKCkge31cbn1cbiIsICJpbXBvcnQgeyByZXF1ZXN0VXJsLCBSZXF1ZXN0VXJsUGFyYW0gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGludGVyZmFjZSBCcmFpbk9iamVjdCB7XG5cdGlkOiBzdHJpbmc7XG5cdHR5cGU6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHRzdGF0dXM6IHN0cmluZztcblx0Y3JlYXRlZDogc3RyaW5nO1xuXHRtb2RpZmllZDogc3RyaW5nO1xuXHRwYXRoOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHRpbWVsaW5lOiBzdHJpbmc7XG5cdHJ1bGVzOiBzdHJpbmc7XG5cdHNvdXJjZV9zZXNzaW9uOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnJhaW5Db25uZWN0aW9uIHtcblx0cmVsYXRpb246IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHR0eXBlOiBzdHJpbmc7XG5cdHN0YXR1czogc3RyaW5nO1xuXHRpZDogc3RyaW5nO1xuXHRkaXJlY3Rpb246IFwib3V0Z29pbmdcIiB8IFwiaW5jb21pbmdcIjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUeXBlQ291bnQge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGNvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDeXBoZXJSZXNwb25zZSB7XG5cdGNvbHVtbnM6IHN0cmluZ1tdO1xuXHRyb3dzOiBhbnlbXVtdO1xuXHRlcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEJyYWluQ2xpZW50IHtcblx0cHJpdmF0ZSBlbmRwb2ludDogc3RyaW5nO1xuXHRwcml2YXRlIGFwaUtleTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGVuZHBvaW50OiBzdHJpbmcsIGFwaUtleTogc3RyaW5nKSB7XG5cdFx0dGhpcy5lbmRwb2ludCA9IGVuZHBvaW50LnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG5cdFx0dGhpcy5hcGlLZXkgPSBhcGlLZXk7XG5cdH1cblxuXHR1cGRhdGVDb25maWcoZW5kcG9pbnQ6IHN0cmluZywgYXBpS2V5OiBzdHJpbmcpIHtcblx0XHR0aGlzLmVuZHBvaW50ID0gZW5kcG9pbnQucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcblx0XHR0aGlzLmFwaUtleSA9IGFwaUtleTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3lwaGVyKHF1ZXJ5OiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9KTogUHJvbWlzZTxDeXBoZXJSZXNwb25zZT4ge1xuXHRcdGNvbnN0IHJlcTogUmVxdWVzdFVybFBhcmFtID0ge1xuXHRcdFx0dXJsOiBgJHt0aGlzLmVuZHBvaW50fS9jeXBoZXJgLFxuXHRcdFx0bWV0aG9kOiBcIlBPU1RcIixcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG5cdFx0XHRcdFwiWC1BUEktS2V5XCI6IHRoaXMuYXBpS2V5LFxuXHRcdFx0fSxcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcXVlcnksIHBhcmFtcyB9KSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlcXVlc3RVcmwocmVxKTtcblx0XHRpZiAocmVzLmpzb24uZXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihyZXMuanNvbi5lcnJvcik7XG5cdFx0fVxuXHRcdHJldHVybiByZXMuanNvbjtcblx0fVxuXG5cdGFzeW5jIHRlc3RDb25uZWN0aW9uKCk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgbWVzc2FnZTogc3RyaW5nIH0+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVxOiBSZXF1ZXN0VXJsUGFyYW0gPSB7XG5cdFx0XHRcdHVybDogYCR7dGhpcy5lbmRwb2ludH0vaGVhbHRoYCxcblx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlcXVlc3RVcmwocmVxKTtcblx0XHRcdGlmIChyZXMuanNvbi5zdGF0dXMgPT09IFwib2tcIikge1xuXHRcdFx0XHRjb25zdCB0YWJsZXMgPSByZXMuanNvbi5ub2RlX3RhYmxlcz8ubGVuZ3RoIHx8IDA7XG5cdFx0XHRcdHJldHVybiB7IG9rOiB0cnVlLCBtZXNzYWdlOiBgQ29ubmVjdGVkIFx1MjAxNCAke3RhYmxlc30gbm9kZSB0YWJsZXNgIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIG1lc3NhZ2U6IFwiVW5leHBlY3RlZCByZXNwb25zZVwiIH07XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIG1lc3NhZ2U6IGUubWVzc2FnZSB8fCBcIkNvbm5lY3Rpb24gZmFpbGVkXCIgfTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRPYmplY3RDb3VudHMoKTogUHJvbWlzZTxUeXBlQ291bnRbXT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0XCJNQVRDSCAobzpPYmplY3QpIFJFVFVSTiBvLnR5cGUgQVMgdHlwZSwgQ09VTlQoKikgQVMgY250IE9SREVSIEJZIGNudCBERVNDXCJcblx0XHQpO1xuXHRcdHJldHVybiByZXMucm93cy5tYXAoKHIpID0+ICh7IHR5cGU6IHJbMF0sIGNvdW50OiByWzFdIH0pKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RPYmplY3RzKFxuXHRcdHR5cGU/OiBzdHJpbmcsXG5cdFx0c3RhdHVzPzogc3RyaW5nLFxuXHRcdGxpbWl0OiBudW1iZXIgPSAxMDBcblx0KTogUHJvbWlzZTxCcmFpbk9iamVjdFtdPiB7XG5cdFx0Y29uc3QgY29uZGl0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcblxuXHRcdGlmICh0eXBlKSB7XG5cdFx0XHRjb25kaXRpb25zLnB1c2goXCJvLnR5cGUgPSAkdHlwZVwiKTtcblx0XHRcdHBhcmFtcy50eXBlID0gdHlwZTtcblx0XHR9XG5cdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0Y29uZGl0aW9ucy5wdXNoKFwiby5zdGF0dXMgPSAkc3RhdHVzXCIpO1xuXHRcdFx0cGFyYW1zLnN0YXR1cyA9IHN0YXR1cztcblx0XHR9XG5cblx0XHRjb25zdCB3aGVyZSA9IGNvbmRpdGlvbnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke2NvbmRpdGlvbnMuam9pbihcIiBBTkQgXCIpfWAgOiBcIlwiO1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChvOk9iamVjdCkgJHt3aGVyZX0gUkVUVVJOIG8gT1JERVIgQlkgby5tb2RpZmllZCBERVNDIExJTUlUICR7bGltaXR9YCxcblx0XHRcdHBhcmFtc1xuXHRcdCk7XG5cdFx0cmV0dXJuIHJlcy5yb3dzLm1hcCgocikgPT4gdGhpcy5wYXJzZU9iamVjdChyWzBdKSk7XG5cdH1cblxuXHRhc3luYyBnZXRPYmplY3QobmFtZU9ySWQ6IHN0cmluZyk6IFByb21pc2U8QnJhaW5PYmplY3QgfCBudWxsPiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRcIk1BVENIIChvOk9iamVjdCkgV0hFUkUgby5pZCA9ICRrZXkgT1IgTE9XRVIoby5uYW1lKSA9IExPV0VSKCRrZXkpIFJFVFVSTiBvXCIsXG5cdFx0XHR7IGtleTogbmFtZU9ySWQgfVxuXHRcdCk7XG5cdFx0aWYgKHJlcy5yb3dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VPYmplY3QocmVzLnJvd3NbMF1bMF0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29ubmVjdGlvbnMobmFtZU9ySWQ6IHN0cmluZyk6IFByb21pc2U8QnJhaW5Db25uZWN0aW9uW10+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uczogQnJhaW5Db25uZWN0aW9uW10gPSBbXTtcblxuXHRcdC8vIE91dGdvaW5nXG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKGE6T2JqZWN0KS1bYzpDb25uZWN0aW9uXS0+KGI6T2JqZWN0KVxuXHRcdFx0IFdIRVJFIGEuaWQgPSAka2V5IE9SIExPV0VSKGEubmFtZSkgPSBMT1dFUigka2V5KVxuXHRcdFx0IFJFVFVSTiBjLnJlbGF0aW9uLCBiLm5hbWUsIGIudHlwZSwgYi5zdGF0dXMsIGIuaWRgLFxuXHRcdFx0eyBrZXk6IG5hbWVPcklkIH1cblx0XHQpO1xuXHRcdGZvciAoY29uc3QgciBvZiBvdXQucm93cykge1xuXHRcdFx0Y29ubmVjdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJlbGF0aW9uOiByWzBdLFxuXHRcdFx0XHRuYW1lOiByWzFdLFxuXHRcdFx0XHR0eXBlOiByWzJdLFxuXHRcdFx0XHRzdGF0dXM6IHJbM10sXG5cdFx0XHRcdGlkOiByWzRdLFxuXHRcdFx0XHRkaXJlY3Rpb246IFwib3V0Z29pbmdcIixcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEluY29taW5nXG5cdFx0Y29uc3QgaW5jID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKGE6T2JqZWN0KS1bYzpDb25uZWN0aW9uXS0+KGI6T2JqZWN0KVxuXHRcdFx0IFdIRVJFIGIuaWQgPSAka2V5IE9SIExPV0VSKGIubmFtZSkgPSBMT1dFUigka2V5KVxuXHRcdFx0IFJFVFVSTiBjLnJlbGF0aW9uLCBhLm5hbWUsIGEudHlwZSwgYS5zdGF0dXMsIGEuaWRgLFxuXHRcdFx0eyBrZXk6IG5hbWVPcklkIH1cblx0XHQpO1xuXHRcdGZvciAoY29uc3QgciBvZiBpbmMucm93cykge1xuXHRcdFx0Y29ubmVjdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJlbGF0aW9uOiByWzBdLFxuXHRcdFx0XHRuYW1lOiByWzFdLFxuXHRcdFx0XHR0eXBlOiByWzJdLFxuXHRcdFx0XHRzdGF0dXM6IHJbM10sXG5cdFx0XHRcdGlkOiByWzRdLFxuXHRcdFx0XHRkaXJlY3Rpb246IFwiaW5jb21pbmdcIixcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb25uZWN0aW9ucztcblx0fVxuXG5cdGFzeW5jIHNlYXJjaE9iamVjdHMocXVlcnk6IHN0cmluZywgbGltaXQ6IG51bWJlciA9IDUwKTogUHJvbWlzZTxCcmFpbk9iamVjdFtdPiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKG86T2JqZWN0KVxuXHRcdFx0IFdIRVJFIExPV0VSKG8ubmFtZSkgQ09OVEFJTlMgTE9XRVIoJHEpIE9SIExPV0VSKG8uZGVzY3JpcHRpb24pIENPTlRBSU5TIExPV0VSKCRxKVxuXHRcdFx0IFJFVFVSTiBvIE9SREVSIEJZIG8ubW9kaWZpZWQgREVTQyBMSU1JVCAke2xpbWl0fWAsXG5cdFx0XHR7IHE6IHF1ZXJ5IH1cblx0XHQpO1xuXHRcdHJldHVybiByZXMucm93cy5tYXAoKHIpID0+IHRoaXMucGFyc2VPYmplY3QoclswXSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZU9iamVjdChyYXc6IGFueSk6IEJyYWluT2JqZWN0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHJhdy5pZCB8fCBcIlwiLFxuXHRcdFx0dHlwZTogcmF3LnR5cGUgfHwgXCJcIixcblx0XHRcdG5hbWU6IHJhdy5uYW1lIHx8IFwiXCIsXG5cdFx0XHRzdGF0dXM6IHJhdy5zdGF0dXMgfHwgXCJcIixcblx0XHRcdGNyZWF0ZWQ6IHJhdy5jcmVhdGVkIHx8IFwiXCIsXG5cdFx0XHRtb2RpZmllZDogcmF3Lm1vZGlmaWVkIHx8IFwiXCIsXG5cdFx0XHRwYXRoOiByYXcucGF0aCB8fCBcIlwiLFxuXHRcdFx0ZGVzY3JpcHRpb246IHJhdy5kZXNjcmlwdGlvbiB8fCBcIlwiLFxuXHRcdFx0dGltZWxpbmU6IHJhdy50aW1lbGluZSB8fCBcIltdXCIsXG5cdFx0XHRydWxlczogcmF3LnJ1bGVzIHx8IFwiXCIsXG5cdFx0XHRzb3VyY2Vfc2Vzc2lvbjogcmF3LnNvdXJjZV9zZXNzaW9uIHx8IFwiXCIsXG5cdFx0fTtcblx0fVxufVxuIiwgImltcG9ydCB7IEl0ZW1WaWV3LCBXb3Jrc3BhY2VMZWFmLCBzZXRJY29uLCBkZWJvdW5jZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHR5cGUgTHlyYUJyYWluUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XG5pbXBvcnQgdHlwZSB7IEJyYWluT2JqZWN0LCBUeXBlQ291bnQgfSBmcm9tIFwiLi9CcmFpbkNsaWVudFwiO1xuaW1wb3J0IHsgREVUQUlMX1ZJRVdfVFlQRSB9IGZyb20gXCIuL09iamVjdERldGFpbFZpZXdcIjtcblxuZXhwb3J0IGNvbnN0IEJSQUlOX1ZJRVdfVFlQRSA9IFwibHlyYS1icmFpbi12aWV3XCI7XG5cbmNvbnN0IFNUQVRVU19DT0xPUlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdGFjdGl2ZTogXCJ2YXIoLS1jb2xvci1ncmVlbilcIixcblx0ZnJvemVuOiBcInZhcigtLWNvbG9yLWJsdWUpXCIsXG5cdGRvbmU6IFwidmFyKC0tdGV4dC1tdXRlZClcIixcblx0YnJva2VuOiBcInZhcigtLWNvbG9yLXJlZClcIixcblx0d2FpdGluZzogXCJ2YXIoLS1jb2xvci15ZWxsb3cpXCIsXG5cdGlkZWE6IFwidmFyKC0tY29sb3ItcHVycGxlKVwiLFxuXHRkZXByZWNhdGVkOiBcInZhcigtLXRleHQtZmFpbnQpXCIsXG59O1xuXG5leHBvcnQgY2xhc3MgQnJhaW5WaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xuXHRwbHVnaW46IEx5cmFCcmFpblBsdWdpbjtcblx0cHJpdmF0ZSBzZWFyY2hJbnB1dDogSFRNTElucHV0RWxlbWVudDtcblx0cHJpdmF0ZSB0eXBlQ2hpcHNFbDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgb2JqZWN0TGlzdEVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzdGF0dXNCYXJFbDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VsZWN0ZWRUeXBlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB0eXBlQ291bnRzOiBUeXBlQ291bnRbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKGxlYWY6IFdvcmtzcGFjZUxlYWYsIHBsdWdpbjogTHlyYUJyYWluUGx1Z2luKSB7XG5cdFx0c3VwZXIobGVhZik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRnZXRWaWV3VHlwZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBCUkFJTl9WSUVXX1RZUEU7XG5cdH1cblxuXHRnZXREaXNwbGF5VGV4dCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBcIkx5cmEgQnJhaW5cIjtcblx0fVxuXG5cdGdldEljb24oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gXCJicmFpblwiO1xuXHR9XG5cblx0YXN5bmMgb25PcGVuKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY29udGFpbmVyRWwuY2hpbGRyZW5bMV0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0Y29udGFpbmVyLmVtcHR5KCk7XG5cdFx0Y29udGFpbmVyLmFkZENsYXNzKFwibHlyYS1icmFpbi1jb250YWluZXJcIik7XG5cblx0XHQvLyBIZWFkZXJcblx0XHRjb25zdCBoZWFkZXIgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtYnJhaW4taGVhZGVyXCIgfSk7XG5cdFx0aGVhZGVyLmNyZWF0ZUVsKFwic3BhblwiLCB7IHRleHQ6IFwiTHlyYSBCcmFpblwiLCBjbHM6IFwibHlyYS1icmFpbi10aXRsZVwiIH0pO1xuXG5cdFx0Y29uc3QgcmVmcmVzaEJ0biA9IGhlYWRlci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJseXJhLWJ0bi1pY29uXCIsIGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiUmVmcmVzaFwiIH0gfSk7XG5cdFx0c2V0SWNvbihyZWZyZXNoQnRuLCBcInJlZnJlc2gtY3dcIik7XG5cdFx0cmVmcmVzaEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5yZWZyZXNoKCkpO1xuXG5cdFx0Ly8gU2VhcmNoXG5cdFx0Y29uc3Qgc2VhcmNoV3JhcCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1zZWFyY2gtd3JhcFwiIH0pO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQgPSBzZWFyY2hXcmFwLmNyZWF0ZUVsKFwiaW5wdXRcIiwge1xuXHRcdFx0dHlwZTogXCJ0ZXh0XCIsXG5cdFx0XHRwbGFjZWhvbGRlcjogXCJTZWFyY2ggb2JqZWN0cy4uLlwiLFxuXHRcdFx0Y2xzOiBcImx5cmEtc2VhcmNoLWlucHV0XCIsXG5cdFx0fSk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5hZGRFdmVudExpc3RlbmVyKFxuXHRcdFx0XCJpbnB1dFwiLFxuXHRcdFx0ZGVib3VuY2UoKCkgPT4gdGhpcy5vblNlYXJjaCgpLCAzMDAsIHRydWUpXG5cdFx0KTtcblxuXHRcdC8vIFR5cGUgY2hpcHNcblx0XHR0aGlzLnR5cGVDaGlwc0VsID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXR5cGUtY2hpcHNcIiB9KTtcblxuXHRcdC8vIE9iamVjdCBsaXN0XG5cdFx0dGhpcy5vYmplY3RMaXN0RWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtb2JqZWN0LWxpc3RcIiB9KTtcblxuXHRcdC8vIFN0YXR1cyBiYXJcblx0XHR0aGlzLnN0YXR1c0JhckVsID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXN0YXR1cy1iYXJcIiB9KTtcblxuXHRcdGF3YWl0IHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0YXN5bmMgcmVmcmVzaCgpIHtcblx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoXCJMb2FkaW5nLi4uXCIpO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnR5cGVDb3VudHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQuZ2V0T2JqZWN0Q291bnRzKCk7XG5cdFx0XHR0aGlzLnJlbmRlclR5cGVDaGlwcygpO1xuXHRcdFx0YXdhaXQgdGhpcy5sb2FkT2JqZWN0cygpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KGBFcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG5cdFx0XHR0aGlzLm9iamVjdExpc3RFbC5lbXB0eSgpO1xuXHRcdFx0dGhpcy5vYmplY3RMaXN0RWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuXHRcdFx0XHR0ZXh0OiBcIkNvdWxkIG5vdCBjb25uZWN0IHRvIGJyYWluLiBDaGVjayBzZXR0aW5ncy5cIixcblx0XHRcdFx0Y2xzOiBcImx5cmEtZW1wdHktc3RhdGVcIixcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVHlwZUNoaXBzKCkge1xuXHRcdHRoaXMudHlwZUNoaXBzRWwuZW1wdHkoKTtcblxuXHRcdC8vIFwiQWxsXCIgY2hpcFxuXHRcdGNvbnN0IGFsbENvdW50ID0gdGhpcy50eXBlQ291bnRzLnJlZHVjZSgocywgdCkgPT4gcyArIHQuY291bnQsIDApO1xuXHRcdGNvbnN0IGFsbENoaXAgPSB0aGlzLnR5cGVDaGlwc0VsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdHRleHQ6IGBhbGwgKCR7YWxsQ291bnR9KWAsXG5cdFx0XHRjbHM6IGBseXJhLWNoaXAgJHt0aGlzLnNlbGVjdGVkVHlwZSA9PT0gbnVsbCA/IFwibHlyYS1jaGlwLWFjdGl2ZVwiIDogXCJcIn1gLFxuXHRcdH0pO1xuXHRcdGFsbENoaXAuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRUeXBlID0gbnVsbDtcblx0XHRcdHRoaXMucmVuZGVyVHlwZUNoaXBzKCk7XG5cdFx0XHR0aGlzLmxvYWRPYmplY3RzKCk7XG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IHRjIG9mIHRoaXMudHlwZUNvdW50cykge1xuXHRcdFx0Y29uc3QgY2hpcCA9IHRoaXMudHlwZUNoaXBzRWwuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0XHR0ZXh0OiBgJHt0Yy50eXBlfSAoJHt0Yy5jb3VudH0pYCxcblx0XHRcdFx0Y2xzOiBgbHlyYS1jaGlwICR7dGhpcy5zZWxlY3RlZFR5cGUgPT09IHRjLnR5cGUgPyBcImx5cmEtY2hpcC1hY3RpdmVcIiA6IFwiXCJ9YCxcblx0XHRcdH0pO1xuXHRcdFx0Y2hpcC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNlbGVjdGVkVHlwZSA9IHRjLnR5cGU7XG5cdFx0XHRcdHRoaXMucmVuZGVyVHlwZUNoaXBzKCk7XG5cdFx0XHRcdHRoaXMubG9hZE9iamVjdHMoKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZE9iamVjdHMoKSB7XG5cdFx0dGhpcy5vYmplY3RMaXN0RWwuZW1wdHkoKTtcblx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoXCJMb2FkaW5nLi4uXCIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG9iamVjdHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQubGlzdE9iamVjdHMoXG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRUeXBlIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQyMDBcblx0XHRcdCk7XG5cdFx0XHR0aGlzLnJlbmRlck9iamVjdHMob2JqZWN0cyk7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoYCR7b2JqZWN0cy5sZW5ndGh9IG9iamVjdHNgKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHtcblx0XHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChgRXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25TZWFyY2goKSB7XG5cdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaElucHV0LnZhbHVlLnRyaW0oKTtcblx0XHRpZiAoIXF1ZXJ5KSB7XG5cdFx0XHRhd2FpdCB0aGlzLmxvYWRPYmplY3RzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5vYmplY3RMaXN0RWwuZW1wdHkoKTtcblx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoXCJTZWFyY2hpbmcuLi5cIik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMucGx1Z2luLmNsaWVudC5zZWFyY2hPYmplY3RzKHF1ZXJ5KTtcblx0XHRcdHRoaXMucmVuZGVyT2JqZWN0cyhyZXN1bHRzKTtcblx0XHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChgJHtyZXN1bHRzLmxlbmd0aH0gcmVzdWx0cyBmb3IgXCIke3F1ZXJ5fVwiYCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoYFNlYXJjaCBlcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJPYmplY3RzKG9iamVjdHM6IEJyYWluT2JqZWN0W10pIHtcblx0XHR0aGlzLm9iamVjdExpc3RFbC5lbXB0eSgpO1xuXG5cdFx0aWYgKG9iamVjdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLm9iamVjdExpc3RFbC5jcmVhdGVFbChcImRpdlwiLCB7XG5cdFx0XHRcdHRleHQ6IFwiTm8gb2JqZWN0cyBmb3VuZFwiLFxuXHRcdFx0XHRjbHM6IFwibHlyYS1lbXB0eS1zdGF0ZVwiLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBvYmogb2Ygb2JqZWN0cykge1xuXHRcdFx0Y29uc3Qgcm93ID0gdGhpcy5vYmplY3RMaXN0RWwuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtb2JqZWN0LXJvd1wiIH0pO1xuXHRcdFx0cm93LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLm9wZW5PYmplY3Qob2JqKSk7XG5cblx0XHRcdGNvbnN0IG5hbWVFbCA9IHJvdy5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1vYmplY3QtbmFtZVwiIH0pO1xuXHRcdFx0bmFtZUVsLnNldFRleHQob2JqLm5hbWUpO1xuXG5cdFx0XHRjb25zdCBtZXRhRWwgPSByb3cuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtb2JqZWN0LW1ldGFcIiB9KTtcblxuXHRcdFx0Y29uc3QgdHlwZVRhZyA9IG1ldGFFbC5jcmVhdGVFbChcInNwYW5cIiwge1xuXHRcdFx0XHR0ZXh0OiBvYmoudHlwZSxcblx0XHRcdFx0Y2xzOiBcImx5cmEtdGFnIGx5cmEtdGFnLXR5cGVcIixcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0dXNUYWcgPSBtZXRhRWwuY3JlYXRlRWwoXCJzcGFuXCIsIHtcblx0XHRcdFx0dGV4dDogb2JqLnN0YXR1cyxcblx0XHRcdFx0Y2xzOiBgbHlyYS10YWcgbHlyYS10YWctc3RhdHVzYCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29sb3IgPSBTVEFUVVNfQ09MT1JTW29iai5zdGF0dXNdIHx8IFwidmFyKC0tdGV4dC1tdXRlZClcIjtcblx0XHRcdHN0YXR1c1RhZy5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tc3RhdHVzLWNvbG9yXCIsIGNvbG9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5PYmplY3Qob2JqOiBCcmFpbk9iamVjdCkge1xuXHRcdGNvbnN0IGxlYXZlcyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoREVUQUlMX1ZJRVdfVFlQRSk7XG5cdFx0bGV0IGxlYWY6IFdvcmtzcGFjZUxlYWY7XG5cblx0XHRpZiAobGVhdmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGxlYWYgPSBsZWF2ZXNbMF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxlYWYgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZihcInRhYlwiKTtcblx0XHR9XG5cblx0XHRhd2FpdCBsZWFmLnNldFZpZXdTdGF0ZSh7XG5cdFx0XHR0eXBlOiBERVRBSUxfVklFV19UWVBFLFxuXHRcdFx0c3RhdGU6IHsgb2JqZWN0SWQ6IG9iai5pZCB9LFxuXHRcdH0pO1xuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGxlYWYpO1xuXHR9XG5cblx0YXN5bmMgb25DbG9zZSgpIHtcblx0XHQvLyBjbGVhbnVwXG5cdH1cbn1cbiIsICJpbXBvcnQgeyBJdGVtVmlldywgV29ya3NwYWNlTGVhZiwgc2V0SWNvbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHR5cGUgTHlyYUJyYWluUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XG5pbXBvcnQgdHlwZSB7IEJyYWluT2JqZWN0LCBCcmFpbkNvbm5lY3Rpb24gfSBmcm9tIFwiLi9CcmFpbkNsaWVudFwiO1xuXG5leHBvcnQgY29uc3QgREVUQUlMX1ZJRVdfVFlQRSA9IFwibHlyYS1icmFpbi1kZXRhaWxcIjtcblxuaW50ZXJmYWNlIFRpbWVsaW5lRW50cnkge1xuXHR0czogc3RyaW5nO1xuXHRldmVudDogc3RyaW5nO1xufVxuXG5jb25zdCBTVEFUVVNfRU1PSkk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdGFjdGl2ZTogXCJcdTI1Q0ZcIixcblx0ZnJvemVuOiBcIlx1MjVDNlwiLFxuXHRkb25lOiBcIlx1MjcxM1wiLFxuXHRicm9rZW46IFwiXHUyNzE3XCIsXG5cdHdhaXRpbmc6IFwiXHUyNUNDXCIsXG5cdGlkZWE6IFwiXHUyNUM3XCIsXG5cdGRlcHJlY2F0ZWQ6IFwiXHUyNUNCXCIsXG59O1xuXG5leHBvcnQgY2xhc3MgT2JqZWN0RGV0YWlsVmlldyBleHRlbmRzIEl0ZW1WaWV3IHtcblx0cGx1Z2luOiBMeXJhQnJhaW5QbHVnaW47XG5cdHByaXZhdGUgb2JqZWN0SWQ6IHN0cmluZyA9IFwiXCI7XG5cdHByaXZhdGUgb2JqZWN0OiBCcmFpbk9iamVjdCB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKGxlYWY6IFdvcmtzcGFjZUxlYWYsIHBsdWdpbjogTHlyYUJyYWluUGx1Z2luKSB7XG5cdFx0c3VwZXIobGVhZik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRnZXRWaWV3VHlwZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBERVRBSUxfVklFV19UWVBFO1xuXHR9XG5cblx0Z2V0RGlzcGxheVRleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5vYmplY3Q/Lm5hbWUgfHwgXCJPYmplY3QgRGV0YWlsXCI7XG5cdH1cblxuXHRnZXRJY29uKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFwiZmlsZS10ZXh0XCI7XG5cdH1cblxuXHRnZXRTdGF0ZSgpIHtcblx0XHRyZXR1cm4geyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCB9O1xuXHR9XG5cblx0YXN5bmMgc2V0U3RhdGUoc3RhdGU6IGFueSwgcmVzdWx0OiBhbnkpIHtcblx0XHRpZiAoc3RhdGUub2JqZWN0SWQpIHtcblx0XHRcdHRoaXMub2JqZWN0SWQgPSBzdGF0ZS5vYmplY3RJZDtcblx0XHRcdGF3YWl0IHRoaXMubG9hZEFuZFJlbmRlcigpO1xuXHRcdH1cblx0XHRhd2FpdCBzdXBlci5zZXRTdGF0ZShzdGF0ZSwgcmVzdWx0KTtcblx0fVxuXG5cdGFzeW5jIGxvYWRBbmRSZW5kZXIoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5jb250YWluZXJFbC5jaGlsZHJlblsxXSBhcyBIVE1MRWxlbWVudDtcblx0XHRjb250YWluZXIuZW1wdHkoKTtcblx0XHRjb250YWluZXIuYWRkQ2xhc3MoXCJseXJhLWRldGFpbC1jb250YWluZXJcIik7XG5cblx0XHRpZiAoIXRoaXMub2JqZWN0SWQpIHtcblx0XHRcdGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IHRleHQ6IFwiTm8gb2JqZWN0IHNlbGVjdGVkXCIsIGNsczogXCJseXJhLWVtcHR5LXN0YXRlXCIgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgdGV4dDogXCJMb2FkaW5nLi4uXCIsIGNsczogXCJseXJhLWxvYWRpbmdcIiB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBbb2JqLCBjb25uZWN0aW9uc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMucGx1Z2luLmNsaWVudC5nZXRPYmplY3QodGhpcy5vYmplY3RJZCksXG5cdFx0XHRcdHRoaXMucGx1Z2luLmNsaWVudC5nZXRDb25uZWN0aW9ucyh0aGlzLm9iamVjdElkKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb250YWluZXIuZW1wdHkoKTtcblxuXHRcdFx0aWYgKCFvYmopIHtcblx0XHRcdFx0Y29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgdGV4dDogXCJPYmplY3Qgbm90IGZvdW5kXCIsIGNsczogXCJseXJhLWVtcHR5LXN0YXRlXCIgfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5vYmplY3QgPSBvYmo7XG5cdFx0XHR0aGlzLmxlYWYudXBkYXRlSGVhZGVyKCk7XG5cdFx0XHR0aGlzLnJlbmRlck9iamVjdChjb250YWluZXIsIG9iaiwgY29ubmVjdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0Y29udGFpbmVyLmVtcHR5KCk7XG5cdFx0XHRjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyB0ZXh0OiBgRXJyb3I6ICR7ZS5tZXNzYWdlfWAsIGNsczogXCJseXJhLWVtcHR5LXN0YXRlXCIgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJPYmplY3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb2JqOiBCcmFpbk9iamVjdCwgY29ubmVjdGlvbnM6IEJyYWluQ29ubmVjdGlvbltdKSB7XG5cdFx0Ly8gSGVhZGVyIHNlY3Rpb25cblx0XHRjb25zdCBoZWFkZXIgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLWhlYWRlclwiIH0pO1xuXG5cdFx0Y29uc3QgdGl0bGVSb3cgPSBoZWFkZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLXRpdGxlLXJvd1wiIH0pO1xuXHRcdHRpdGxlUm93LmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBvYmoubmFtZSwgY2xzOiBcImx5cmEtZGV0YWlsLW5hbWVcIiB9KTtcblxuXHRcdGNvbnN0IGJhZGdlcyA9IGhlYWRlci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtYmFkZ2VzXCIgfSk7XG5cdFx0YmFkZ2VzLmNyZWF0ZUVsKFwic3BhblwiLCB7IHRleHQ6IG9iai50eXBlLCBjbHM6IFwibHlyYS10YWcgbHlyYS10YWctdHlwZVwiIH0pO1xuXHRcdGNvbnN0IHN0YXR1c0VsID0gYmFkZ2VzLmNyZWF0ZUVsKFwic3BhblwiLCB7XG5cdFx0XHR0ZXh0OiBgJHtTVEFUVVNfRU1PSklbb2JqLnN0YXR1c10gfHwgXCJcdTI1Q0ZcIn0gJHtvYmouc3RhdHVzfWAsXG5cdFx0XHRjbHM6IFwibHlyYS10YWcgbHlyYS10YWctc3RhdHVzLWRldGFpbFwiLFxuXHRcdH0pO1xuXHRcdHN0YXR1c0VsLmRhdGFzZXQuc3RhdHVzID0gb2JqLnN0YXR1cztcblxuXHRcdC8vIERlc2NyaXB0aW9uXG5cdFx0aWYgKG9iai5kZXNjcmlwdGlvbikge1xuXHRcdFx0Y29uc3QgZGVzY1NlY3Rpb24gPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLXNlY3Rpb25cIiB9KTtcblx0XHRcdGRlc2NTZWN0aW9uLmNyZWF0ZUVsKFwiaDRcIiwgeyB0ZXh0OiBcIkRlc2NyaXB0aW9uXCIgfSk7XG5cdFx0XHRkZXNjU2VjdGlvbi5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBvYmouZGVzY3JpcHRpb24sIGNsczogXCJseXJhLWRldGFpbC1kZXNjXCIgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWV0YWRhdGFcblx0XHRjb25zdCBtZXRhU2VjdGlvbiA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtc2VjdGlvblwiIH0pO1xuXHRcdG1ldGFTZWN0aW9uLmNyZWF0ZUVsKFwiaDRcIiwgeyB0ZXh0OiBcIkRldGFpbHNcIiB9KTtcblx0XHRjb25zdCBtZXRhR3JpZCA9IG1ldGFTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1ncmlkXCIgfSk7XG5cblx0XHR0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiSURcIiwgb2JqLmlkKTtcblx0XHR0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiQ3JlYXRlZFwiLCB0aGlzLmZvcm1hdERhdGUob2JqLmNyZWF0ZWQpKTtcblx0XHR0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiTW9kaWZpZWRcIiwgdGhpcy5mb3JtYXREYXRlKG9iai5tb2RpZmllZCkpO1xuXHRcdGlmIChvYmoucGF0aCkgdGhpcy5hZGRNZXRhUm93KG1ldGFHcmlkLCBcIlBhdGhcIiwgb2JqLnBhdGgpO1xuXHRcdGlmIChvYmouc291cmNlX3Nlc3Npb24pIHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJTb3VyY2VcIiwgb2JqLnNvdXJjZV9zZXNzaW9uKTtcblx0XHRpZiAob2JqLnJ1bGVzKSB0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiUnVsZXNcIiwgb2JqLnJ1bGVzKTtcblxuXHRcdC8vIENvbm5lY3Rpb25zXG5cdFx0aWYgKGNvbm5lY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGNvbm5TZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0XHRjb25uU2VjdGlvbi5jcmVhdGVFbChcImg0XCIsIHsgdGV4dDogYENvbm5lY3Rpb25zICgke2Nvbm5lY3Rpb25zLmxlbmd0aH0pYCB9KTtcblxuXHRcdFx0Y29uc3Qgb3V0Z29pbmcgPSBjb25uZWN0aW9ucy5maWx0ZXIoKGMpID0+IGMuZGlyZWN0aW9uID09PSBcIm91dGdvaW5nXCIpO1xuXHRcdFx0Y29uc3QgaW5jb21pbmcgPSBjb25uZWN0aW9ucy5maWx0ZXIoKGMpID0+IGMuZGlyZWN0aW9uID09PSBcImluY29taW5nXCIpO1xuXG5cdFx0XHRpZiAob3V0Z29pbmcubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBvdXRHcm91cCA9IGNvbm5TZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWNvbm4tZ3JvdXBcIiB9KTtcblx0XHRcdFx0b3V0R3JvdXAuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogXCJPdXRnb2luZyBcdTIxOTJcIiwgY2xzOiBcImx5cmEtY29ubi1kaXJlY3Rpb25cIiB9KTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25uIG9mIG91dGdvaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJDb25uZWN0aW9uKG91dEdyb3VwLCBjb25uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5jb21pbmcubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBpbkdyb3VwID0gY29ublNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtY29ubi1ncm91cFwiIH0pO1xuXHRcdFx0XHRpbkdyb3VwLmNyZWF0ZUVsKFwic3BhblwiLCB7IHRleHQ6IFwiXHUyMTkwIEluY29taW5nXCIsIGNsczogXCJseXJhLWNvbm4tZGlyZWN0aW9uXCIgfSk7XG5cdFx0XHRcdGZvciAoY29uc3QgY29ubiBvZiBpbmNvbWluZykge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyQ29ubmVjdGlvbihpbkdyb3VwLCBjb25uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRpbWVsaW5lXG5cdFx0Y29uc3QgdGltZWxpbmUgPSB0aGlzLnBhcnNlVGltZWxpbmUob2JqLnRpbWVsaW5lKTtcblx0XHRpZiAodGltZWxpbmUubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgdGxTZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0XHR0bFNlY3Rpb24uY3JlYXRlRWwoXCJoNFwiLCB7IHRleHQ6IGBUaW1lbGluZSAoJHt0aW1lbGluZS5sZW5ndGh9KWAgfSk7XG5cdFx0XHRjb25zdCB0bExpc3QgPSB0bFNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtdGltZWxpbmVcIiB9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aW1lbGluZS5yZXZlcnNlKCkpIHtcblx0XHRcdFx0Y29uc3Qgcm93ID0gdGxMaXN0LmNyZWF0ZURpdih7IGNsczogXCJseXJhLXRpbWVsaW5lLWVudHJ5XCIgfSk7XG5cdFx0XHRcdHJvdy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiB0aGlzLmZvcm1hdERhdGUoZW50cnkudHMpLCBjbHM6IFwibHlyYS10bC1kYXRlXCIgfSk7XG5cdFx0XHRcdHJvdy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBlbnRyeS5ldmVudCwgY2xzOiBcImx5cmEtdGwtZXZlbnRcIiB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbm5lY3Rpb24ocGFyZW50OiBIVE1MRWxlbWVudCwgY29ubjogQnJhaW5Db25uZWN0aW9uKSB7XG5cdFx0Y29uc3Qgcm93ID0gcGFyZW50LmNyZWF0ZURpdih7IGNsczogXCJseXJhLWNvbm4tcm93XCIgfSk7XG5cblx0XHRjb25zdCByZWxhdGlvbiA9IHJvdy5jcmVhdGVFbChcInNwYW5cIiwge1xuXHRcdFx0dGV4dDogY29ubi5yZWxhdGlvbi5yZXBsYWNlKC9fL2csIFwiIFwiKSxcblx0XHRcdGNsczogXCJseXJhLWNvbm4tcmVsYXRpb25cIixcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxpbmsgPSByb3cuY3JlYXRlRWwoXCJhXCIsIHtcblx0XHRcdHRleHQ6IGNvbm4ubmFtZSxcblx0XHRcdGNsczogXCJseXJhLWNvbm4tbGlua1wiLFxuXHRcdFx0aHJlZjogXCIjXCIsXG5cdFx0fSk7XG5cdFx0bGluay5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGF3YWl0IHRoaXMubmF2aWdhdGVUbyhjb25uLmlkKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG1ldGEgPSByb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHtcblx0XHRcdHRleHQ6IGAke2Nvbm4udHlwZX0gXHUwMEI3ICR7Y29ubi5zdGF0dXN9YCxcblx0XHRcdGNsczogXCJseXJhLWNvbm4tbWV0YVwiLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBuYXZpZ2F0ZVRvKG9iamVjdElkOiBzdHJpbmcpIHtcblx0XHR0aGlzLm9iamVjdElkID0gb2JqZWN0SWQ7XG5cdFx0YXdhaXQgdGhpcy5sb2FkQW5kUmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFkZE1ldGFSb3cocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgdmFsdWU6IHN0cmluZykge1xuXHRcdGNvbnN0IHJvdyA9IHBhcmVudC5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1tZXRhLXJvd1wiIH0pO1xuXHRcdHJvdy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBsYWJlbCwgY2xzOiBcImx5cmEtbWV0YS1sYWJlbFwiIH0pO1xuXHRcdHJvdy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiB2YWx1ZSwgY2xzOiBcImx5cmEtbWV0YS12YWx1ZVwiIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBmb3JtYXREYXRlKGRhdGVTdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKCFkYXRlU3RyKSByZXR1cm4gXCJcdTIwMTRcIjtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZCA9IG5ldyBEYXRlKGRhdGVTdHIpO1xuXHRcdFx0cmV0dXJuIGQudG9Mb2NhbGVEYXRlU3RyaW5nKFwiZW4tR0JcIiwge1xuXHRcdFx0XHRkYXk6IFwiMi1kaWdpdFwiLFxuXHRcdFx0XHRtb250aDogXCJzaG9ydFwiLFxuXHRcdFx0XHR5ZWFyOiBcIm51bWVyaWNcIixcblx0XHRcdFx0aG91cjogXCIyLWRpZ2l0XCIsXG5cdFx0XHRcdG1pbnV0ZTogXCIyLWRpZ2l0XCIsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBkYXRlU3RyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2VUaW1lbGluZSh0aW1lbGluZVN0cjogc3RyaW5nKTogVGltZWxpbmVFbnRyeVtdIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh0aW1lbGluZVN0cik7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJzZWQpKSByZXR1cm4gcGFyc2VkO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIG9uQ2xvc2UoKSB7XG5cdFx0Ly8gY2xlYW51cFxuXHR9XG59XG4iLCAiaW1wb3J0IHsgQXBwLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgdHlwZSBMeXJhQnJhaW5QbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcblxuZXhwb3J0IGludGVyZmFjZSBMeXJhQnJhaW5TZXR0aW5ncyB7XG5cdGVuZHBvaW50OiBzdHJpbmc7XG5cdGFwaUtleTogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTHlyYUJyYWluU2V0dGluZ3MgPSB7XG5cdGVuZHBvaW50OiBcImh0dHBzOi8vYnJhaW4uc2FrdXJhLmV4Y2hhbmdlXCIsXG5cdGFwaUtleTogXCJcIixcbn07XG5cbmV4cG9ydCBjbGFzcyBMeXJhQnJhaW5TZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG5cdHBsdWdpbjogTHlyYUJyYWluUGx1Z2luO1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IEx5cmFCcmFpblBsdWdpbikge1xuXHRcdHN1cGVyKGFwcCwgcGx1Z2luKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdGRpc3BsYXkoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcblx0XHRjb250YWluZXJFbC5lbXB0eSgpO1xuXG5cdFx0Y29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiTHlyYSBCcmFpblwiIH0pO1xuXHRcdGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwicFwiLCB7XG5cdFx0XHR0ZXh0OiBcIkNvbm5lY3QgdG8gTHlyYS1TZXZlbidzIGtub3dsZWRnZSBncmFwaC5cIixcblx0XHRcdGNsczogXCJzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb25cIixcblx0XHR9KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJBUEkgRW5kcG9pbnRcIilcblx0XHRcdC5zZXREZXNjKFwiVVJMIG9mIHRoZSBicmFpbiBzZXJ2ZXJcIilcblx0XHRcdC5hZGRUZXh0KCh0ZXh0KSA9PlxuXHRcdFx0XHR0ZXh0XG5cdFx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKFwiaHR0cHM6Ly9icmFpbi5zYWt1cmEuZXhjaGFuZ2VcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5kcG9pbnQpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5kcG9pbnQgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHQpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkFQSSBLZXlcIilcblx0XHRcdC5zZXREZXNjKFwiQXV0aGVudGljYXRpb24ga2V5IGZvciB0aGUgYnJhaW4gQVBJXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCkgPT4ge1xuXHRcdFx0XHR0ZXh0XG5cdFx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKFwiRW50ZXIgQVBJIGtleVwiKVxuXHRcdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hcGlLZXkpXG5cdFx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBpS2V5ID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0dGV4dC5pbnB1dEVsLnR5cGUgPSBcInBhc3N3b3JkXCI7XG5cdFx0XHR9KTtcblxuXHRcdC8vIFRlc3QgY29ubmVjdGlvbiBidXR0b25cblx0XHRjb25zdCB0ZXN0RGl2ID0gY29udGFpbmVyRWwuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtdGVzdC1jb25uZWN0aW9uXCIgfSk7XG5cdFx0Y29uc3QgdGVzdEJ0biA9IHRlc3REaXYuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIlRlc3QgQ29ubmVjdGlvblwiIH0pO1xuXHRcdGNvbnN0IHRlc3RSZXN1bHQgPSB0ZXN0RGl2LmNyZWF0ZUVsKFwic3BhblwiLCB7IGNsczogXCJseXJhLXRlc3QtcmVzdWx0XCIgfSk7XG5cblx0XHR0ZXN0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0UmVzdWx0LnNldFRleHQoXCJUZXN0aW5nLi4uXCIpO1xuXHRcdFx0dGVzdFJlc3VsdC5jbGFzc05hbWUgPSBcImx5cmEtdGVzdC1yZXN1bHRcIjtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucGx1Z2luLmNsaWVudC50ZXN0Q29ubmVjdGlvbigpO1xuXHRcdFx0dGVzdFJlc3VsdC5zZXRUZXh0KHJlc3VsdC5tZXNzYWdlKTtcblx0XHRcdHRlc3RSZXN1bHQuY2xhc3NOYW1lID0gYGx5cmEtdGVzdC1yZXN1bHQgJHtyZXN1bHQub2sgPyBcImx5cmEtdGVzdC1va1wiIDogXCJseXJhLXRlc3QtZmFpbFwifWA7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFBQUEsbUJBQXVCOzs7QUNBdkIsc0JBQTRDO0FBb0NyQyxJQUFNLGNBQU4sTUFBa0I7QUFBQSxFQUl4QixZQUFZLFVBQWtCLFFBQWdCO0FBQzdDLFNBQUssV0FBVyxTQUFTLFFBQVEsUUFBUSxFQUFFO0FBQzNDLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVBLGFBQWEsVUFBa0IsUUFBZ0I7QUFDOUMsU0FBSyxXQUFXLFNBQVMsUUFBUSxRQUFRLEVBQUU7QUFDM0MsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRUEsTUFBYyxPQUFPLE9BQWUsU0FBOEIsQ0FBQyxHQUE0QjtBQUM5RixVQUFNLE1BQXVCO0FBQUEsTUFDNUIsS0FBSyxHQUFHLEtBQUssUUFBUTtBQUFBLE1BQ3JCLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNSLGdCQUFnQjtBQUFBLFFBQ2hCLGFBQWEsS0FBSztBQUFBLE1BQ25CO0FBQUEsTUFDQSxNQUFNLEtBQUssVUFBVSxFQUFFLE9BQU8sT0FBTyxDQUFDO0FBQUEsSUFDdkM7QUFDQSxVQUFNLE1BQU0sVUFBTSw0QkFBVyxHQUFHO0FBQ2hDLFFBQUksSUFBSSxLQUFLLE9BQU87QUFDbkIsWUFBTSxJQUFJLE1BQU0sSUFBSSxLQUFLLEtBQUs7QUFBQSxJQUMvQjtBQUNBLFdBQU8sSUFBSTtBQUFB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LGVBQWU7QUFDbkUsUUFBSSxTQUFTLFNBQVMsR0FBRztBQUN4QixXQUFLLElBQUksVUFBVSxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ3pDO0FBQUEsSUFDRDtBQUVBLFVBQU0sT0FBTyxLQUFLLElBQUksVUFBVSxhQUFhLEtBQUs7QUFDbEQsUUFBSSxNQUFNO0FBQ1QsWUFBTSxLQUFLLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixRQUFRLEtBQUssQ0FBQztBQUMvRCxXQUFLLElBQUksVUFBVSxXQUFXLElBQUk7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZUFBZTtBQUNwQixTQUFLLFdBQVcsT0FBTyxPQUFPLENBQUMsR0FBRyxrQkFBa0IsTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUFBLEVBQzFFO0FBQUEsRUFFQSxNQUFNLGVBQWU7QUF6RHRCO0FBMERFLFVBQU0sS0FBSyxTQUFTLEtBQUssUUFBUTtBQUNqQyxlQUFLLFdBQUwsbUJBQWEsYUFBYSxLQUFLLFNBQVMsVUFBVSxLQUFLLFNBQVM7QUFBQSxFQUNqRTtBQUFBLEVBRUEsV0FBVztBQUFBLEVBQUM7QUFDYjsiLAogICJuYW1lcyI6IFsiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIl0KfQo=
