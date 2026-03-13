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
  async updateStatus(objectId, newStatus) {
    const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
    const res = await this.cypher(
      `MATCH (o:Object) WHERE o.id = $id
			 SET o.status = $status, o.modified = timestamp($now)
			 RETURN o.name`,
      { id: objectId, status: newStatus, now }
    );
    return res.rows.length > 0;
  }
  async updateDescription(objectId, description) {
    const now = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
    const res = await this.cypher(
      `MATCH (o:Object) WHERE o.id = $id
			 SET o.description = $desc, o.modified = timestamp($now)
			 RETURN o.name`,
      { id: objectId, desc: description, now }
    );
    return res.rows.length > 0;
  }
  async deleteObject(objectId) {
    await this.cypher(
      `MATCH (a:Object)-[c:Connection]-(b:Object) WHERE a.id = $id DELETE c`,
      { id: objectId }
    );
    const res = await this.cypher(
      `MATCH (o:Object) WHERE o.id = $id DELETE o RETURN true`,
      { id: objectId }
    );
    return true;
  }
  async deleteConnection(fromId, relation, toId) {
    await this.cypher(
      `MATCH (a:Object)-[c:Connection]->(b:Object)
			 WHERE a.id = $fromId AND b.id = $toId AND c.relation = $rel
			 DELETE c`,
      { fromId, toId, rel: relation }
    );
    return true;
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
var ALL_STATUSES = ["active", "frozen", "done", "broken", "waiting", "idea", "deprecated"];
var STATUS_EMOJI = {
  active: "\u25CF",
  frozen: "\u25C6",
  done: "\u2713",
  broken: "\u2717",
  waiting: "\u25CC",
  idea: "\u25C7",
  deprecated: "\u25CB"
};
var ConfirmDeleteModal = class extends import_obsidian2.Modal {
  constructor(app, objectName, onConfirm) {
    super(app);
    this.objectName = objectName;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Delete Object" });
    contentEl.createEl("p", {
      text: `Are you sure you want to delete "${this.objectName}"? This will also remove all its connections. This cannot be undone.`
    });
    const btnRow = contentEl.createDiv({ cls: "lyra-modal-buttons" });
    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    const deleteBtn = btnRow.createEl("button", {
      text: "Delete",
      cls: "lyra-btn-danger"
    });
    deleteBtn.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var EditDescriptionModal = class extends import_obsidian2.Modal {
  constructor(app, currentDesc, onSave) {
    super(app);
    this.currentDesc = currentDesc;
    this.onSave = onSave;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Edit Description" });
    const textarea = contentEl.createEl("textarea", {
      cls: "lyra-edit-textarea"
    });
    textarea.value = this.currentDesc;
    textarea.rows = 8;
    const btnRow = contentEl.createDiv({ cls: "lyra-modal-buttons" });
    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    const saveBtn = btnRow.createEl("button", {
      text: "Save",
      cls: "lyra-btn-primary"
    });
    saveBtn.addEventListener("click", () => {
      this.onSave(textarea.value);
      this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmDeleteConnectionModal = class extends import_obsidian2.Modal {
  constructor(app, connName, relation, onConfirm) {
    super(app);
    this.connName = connName;
    this.relation = relation;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Delete Connection" });
    contentEl.createEl("p", {
      text: `Remove "${this.relation}" connection to "${this.connName}"?`
    });
    const btnRow = contentEl.createDiv({ cls: "lyra-modal-buttons" });
    const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    const deleteBtn = btnRow.createEl("button", {
      text: "Delete",
      cls: "lyra-btn-danger"
    });
    deleteBtn.addEventListener("click", () => {
      this.onConfirm();
      this.close();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
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
    const actions = titleRow.createDiv({ cls: "lyra-detail-actions" });
    const deleteBtn = actions.createEl("button", {
      cls: "lyra-btn-icon lyra-btn-delete",
      attr: { "aria-label": "Delete object" }
    });
    (0, import_obsidian2.setIcon)(deleteBtn, "trash-2");
    deleteBtn.addEventListener("click", () => this.confirmDelete(obj));
    const badges = header.createDiv({ cls: "lyra-detail-badges" });
    badges.createEl("span", { text: obj.type, cls: "lyra-tag lyra-tag-type" });
    const statusSelect = badges.createEl("select", { cls: "lyra-status-select" });
    statusSelect.dataset.status = obj.status;
    for (const s of ALL_STATUSES) {
      const opt = statusSelect.createEl("option", {
        text: `${STATUS_EMOJI[s] || "\u25CF"} ${s}`,
        value: s
      });
      if (s === obj.status) opt.selected = true;
    }
    statusSelect.addEventListener("change", async () => {
      const newStatus = statusSelect.value;
      await this.plugin.client.updateStatus(obj.id, newStatus);
      await this.loadAndRender();
    });
    const descSection = container.createDiv({ cls: "lyra-detail-section" });
    const descHeader = descSection.createDiv({ cls: "lyra-section-header" });
    descHeader.createEl("h4", { text: "Description" });
    const editDescBtn = descHeader.createEl("button", {
      cls: "lyra-btn-icon lyra-btn-edit",
      attr: { "aria-label": "Edit description" }
    });
    (0, import_obsidian2.setIcon)(editDescBtn, "pencil");
    editDescBtn.addEventListener("click", () => this.editDescription(obj));
    if (obj.description) {
      descSection.createEl("p", { text: obj.description, cls: "lyra-detail-desc" });
    } else {
      descSection.createEl("p", { text: "No description", cls: "lyra-detail-desc lyra-text-faint" });
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
          this.renderConnection(outGroup, conn, obj);
        }
      }
      if (incoming.length > 0) {
        const inGroup = connSection.createDiv({ cls: "lyra-conn-group" });
        inGroup.createEl("span", { text: "\u2190 Incoming", cls: "lyra-conn-direction" });
        for (const conn of incoming) {
          this.renderConnection(inGroup, conn, obj);
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
  renderConnection(parent, conn, currentObj) {
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
    const delBtn = row.createEl("button", {
      cls: "lyra-btn-icon lyra-btn-conn-delete",
      attr: { "aria-label": "Delete connection" }
    });
    (0, import_obsidian2.setIcon)(delBtn, "x");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const fromId = conn.direction === "outgoing" ? currentObj.id : conn.id;
      const toId = conn.direction === "outgoing" ? conn.id : currentObj.id;
      new ConfirmDeleteConnectionModal(
        this.app,
        conn.name,
        conn.relation,
        async () => {
          await this.plugin.client.deleteConnection(fromId, conn.relation, toId);
          await this.loadAndRender();
        }
      ).open();
    });
  }
  confirmDelete(obj) {
    new ConfirmDeleteModal(this.app, obj.name, async () => {
      await this.plugin.client.deleteObject(obj.id);
      this.leaf.detach();
    }).open();
  }
  editDescription(obj) {
    new EditDescriptionModal(this.app, obj.description, async (newDesc) => {
      await this.plugin.client.updateDescription(obj.id, newDesc);
      await this.loadAndRender();
    }).open();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzcmMvQnJhaW5DbGllbnQudHMiLCAic3JjL0JyYWluVmlldy50cyIsICJzcmMvT2JqZWN0RGV0YWlsVmlldy50cyIsICJzcmMvU2V0dGluZ3NUYWIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgQnJhaW5DbGllbnQgfSBmcm9tIFwiLi9zcmMvQnJhaW5DbGllbnRcIjtcbmltcG9ydCB7IEJyYWluVmlldywgQlJBSU5fVklFV19UWVBFIH0gZnJvbSBcIi4vc3JjL0JyYWluVmlld1wiO1xuaW1wb3J0IHsgT2JqZWN0RGV0YWlsVmlldywgREVUQUlMX1ZJRVdfVFlQRSB9IGZyb20gXCIuL3NyYy9PYmplY3REZXRhaWxWaWV3XCI7XG5pbXBvcnQge1xuXHRMeXJhQnJhaW5TZXR0aW5nVGFiLFxuXHRMeXJhQnJhaW5TZXR0aW5ncyxcblx0REVGQVVMVF9TRVRUSU5HUyxcbn0gZnJvbSBcIi4vc3JjL1NldHRpbmdzVGFiXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEx5cmFCcmFpblBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG5cdHNldHRpbmdzOiBMeXJhQnJhaW5TZXR0aW5ncztcblx0Y2xpZW50OiBCcmFpbkNsaWVudDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuXHRcdHRoaXMuY2xpZW50ID0gbmV3IEJyYWluQ2xpZW50KHRoaXMuc2V0dGluZ3MuZW5kcG9pbnQsIHRoaXMuc2V0dGluZ3MuYXBpS2V5KTtcblxuXHRcdC8vIFJlZ2lzdGVyIHZpZXdzXG5cdFx0dGhpcy5yZWdpc3RlclZpZXcoQlJBSU5fVklFV19UWVBFLCAobGVhZikgPT4gbmV3IEJyYWluVmlldyhsZWFmLCB0aGlzKSk7XG5cdFx0dGhpcy5yZWdpc3RlclZpZXcoREVUQUlMX1ZJRVdfVFlQRSwgKGxlYWYpID0+IG5ldyBPYmplY3REZXRhaWxWaWV3KGxlYWYsIHRoaXMpKTtcblxuXHRcdC8vIFNldHRpbmdzIHRhYlxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTHlyYUJyYWluU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG5cdFx0Ly8gUmliYm9uIGljb25cblx0XHR0aGlzLmFkZFJpYmJvbkljb24oXCJicmFpblwiLCBcIkx5cmEgQnJhaW5cIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZUJyYWluVmlldygpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ29tbWFuZFxuXHRcdHRoaXMuYWRkQ29tbWFuZCh7XG5cdFx0XHRpZDogXCJvcGVuLWx5cmEtYnJhaW5cIixcblx0XHRcdG5hbWU6IFwiT3BlbiBMeXJhIEJyYWluXCIsXG5cdFx0XHRjYWxsYmFjazogKCkgPT4gdGhpcy5hY3RpdmF0ZUJyYWluVmlldygpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgYWN0aXZhdGVCcmFpblZpZXcoKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKEJSQUlOX1ZJRVdfVFlQRSk7XG5cdFx0aWYgKGV4aXN0aW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGV4aXN0aW5nWzBdKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldFJpZ2h0TGVhZihmYWxzZSk7XG5cdFx0aWYgKGxlYWYpIHtcblx0XHRcdGF3YWl0IGxlYWYuc2V0Vmlld1N0YXRlKHsgdHlwZTogQlJBSU5fVklFV19UWVBFLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG5cdH1cblxuXHRhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0XHR0aGlzLmNsaWVudD8udXBkYXRlQ29uZmlnKHRoaXMuc2V0dGluZ3MuZW5kcG9pbnQsIHRoaXMuc2V0dGluZ3MuYXBpS2V5KTtcblx0fVxuXG5cdG9udW5sb2FkKCkge31cbn1cbiIsICJpbXBvcnQgeyByZXF1ZXN0VXJsLCBSZXF1ZXN0VXJsUGFyYW0gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGludGVyZmFjZSBCcmFpbk9iamVjdCB7XG5cdGlkOiBzdHJpbmc7XG5cdHR5cGU6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHRzdGF0dXM6IHN0cmluZztcblx0Y3JlYXRlZDogc3RyaW5nO1xuXHRtb2RpZmllZDogc3RyaW5nO1xuXHRwYXRoOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHRpbWVsaW5lOiBzdHJpbmc7XG5cdHJ1bGVzOiBzdHJpbmc7XG5cdHNvdXJjZV9zZXNzaW9uOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnJhaW5Db25uZWN0aW9uIHtcblx0cmVsYXRpb246IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHR0eXBlOiBzdHJpbmc7XG5cdHN0YXR1czogc3RyaW5nO1xuXHRpZDogc3RyaW5nO1xuXHRkaXJlY3Rpb246IFwib3V0Z29pbmdcIiB8IFwiaW5jb21pbmdcIjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUeXBlQ291bnQge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGNvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDeXBoZXJSZXNwb25zZSB7XG5cdGNvbHVtbnM6IHN0cmluZ1tdO1xuXHRyb3dzOiBhbnlbXVtdO1xuXHRlcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEJyYWluQ2xpZW50IHtcblx0cHJpdmF0ZSBlbmRwb2ludDogc3RyaW5nO1xuXHRwcml2YXRlIGFwaUtleTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGVuZHBvaW50OiBzdHJpbmcsIGFwaUtleTogc3RyaW5nKSB7XG5cdFx0dGhpcy5lbmRwb2ludCA9IGVuZHBvaW50LnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG5cdFx0dGhpcy5hcGlLZXkgPSBhcGlLZXk7XG5cdH1cblxuXHR1cGRhdGVDb25maWcoZW5kcG9pbnQ6IHN0cmluZywgYXBpS2V5OiBzdHJpbmcpIHtcblx0XHR0aGlzLmVuZHBvaW50ID0gZW5kcG9pbnQucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcblx0XHR0aGlzLmFwaUtleSA9IGFwaUtleTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3lwaGVyKHF1ZXJ5OiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9KTogUHJvbWlzZTxDeXBoZXJSZXNwb25zZT4ge1xuXHRcdGNvbnN0IHJlcTogUmVxdWVzdFVybFBhcmFtID0ge1xuXHRcdFx0dXJsOiBgJHt0aGlzLmVuZHBvaW50fS9jeXBoZXJgLFxuXHRcdFx0bWV0aG9kOiBcIlBPU1RcIixcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG5cdFx0XHRcdFwiWC1BUEktS2V5XCI6IHRoaXMuYXBpS2V5LFxuXHRcdFx0fSxcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcXVlcnksIHBhcmFtcyB9KSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlcXVlc3RVcmwocmVxKTtcblx0XHRpZiAocmVzLmpzb24uZXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihyZXMuanNvbi5lcnJvcik7XG5cdFx0fVxuXHRcdHJldHVybiByZXMuanNvbjtcblx0fVxuXG5cdGFzeW5jIHRlc3RDb25uZWN0aW9uKCk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgbWVzc2FnZTogc3RyaW5nIH0+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVxOiBSZXF1ZXN0VXJsUGFyYW0gPSB7XG5cdFx0XHRcdHVybDogYCR7dGhpcy5lbmRwb2ludH0vaGVhbHRoYCxcblx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlcXVlc3RVcmwocmVxKTtcblx0XHRcdGlmIChyZXMuanNvbi5zdGF0dXMgPT09IFwib2tcIikge1xuXHRcdFx0XHRjb25zdCB0YWJsZXMgPSByZXMuanNvbi5ub2RlX3RhYmxlcz8ubGVuZ3RoIHx8IDA7XG5cdFx0XHRcdHJldHVybiB7IG9rOiB0cnVlLCBtZXNzYWdlOiBgQ29ubmVjdGVkIFx1MjAxNCAke3RhYmxlc30gbm9kZSB0YWJsZXNgIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIG1lc3NhZ2U6IFwiVW5leHBlY3RlZCByZXNwb25zZVwiIH07XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIG1lc3NhZ2U6IGUubWVzc2FnZSB8fCBcIkNvbm5lY3Rpb24gZmFpbGVkXCIgfTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRPYmplY3RDb3VudHMoKTogUHJvbWlzZTxUeXBlQ291bnRbXT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0XCJNQVRDSCAobzpPYmplY3QpIFJFVFVSTiBvLnR5cGUgQVMgdHlwZSwgQ09VTlQoKikgQVMgY250IE9SREVSIEJZIGNudCBERVNDXCJcblx0XHQpO1xuXHRcdHJldHVybiByZXMucm93cy5tYXAoKHIpID0+ICh7IHR5cGU6IHJbMF0sIGNvdW50OiByWzFdIH0pKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RPYmplY3RzKFxuXHRcdHR5cGU/OiBzdHJpbmcsXG5cdFx0c3RhdHVzPzogc3RyaW5nLFxuXHRcdGxpbWl0OiBudW1iZXIgPSAxMDBcblx0KTogUHJvbWlzZTxCcmFpbk9iamVjdFtdPiB7XG5cdFx0Y29uc3QgY29uZGl0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcblxuXHRcdGlmICh0eXBlKSB7XG5cdFx0XHRjb25kaXRpb25zLnB1c2goXCJvLnR5cGUgPSAkdHlwZVwiKTtcblx0XHRcdHBhcmFtcy50eXBlID0gdHlwZTtcblx0XHR9XG5cdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0Y29uZGl0aW9ucy5wdXNoKFwiby5zdGF0dXMgPSAkc3RhdHVzXCIpO1xuXHRcdFx0cGFyYW1zLnN0YXR1cyA9IHN0YXR1cztcblx0XHR9XG5cblx0XHRjb25zdCB3aGVyZSA9IGNvbmRpdGlvbnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke2NvbmRpdGlvbnMuam9pbihcIiBBTkQgXCIpfWAgOiBcIlwiO1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChvOk9iamVjdCkgJHt3aGVyZX0gUkVUVVJOIG8gT1JERVIgQlkgby5tb2RpZmllZCBERVNDIExJTUlUICR7bGltaXR9YCxcblx0XHRcdHBhcmFtc1xuXHRcdCk7XG5cdFx0cmV0dXJuIHJlcy5yb3dzLm1hcCgocikgPT4gdGhpcy5wYXJzZU9iamVjdChyWzBdKSk7XG5cdH1cblxuXHRhc3luYyBnZXRPYmplY3QobmFtZU9ySWQ6IHN0cmluZyk6IFByb21pc2U8QnJhaW5PYmplY3QgfCBudWxsPiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRcIk1BVENIIChvOk9iamVjdCkgV0hFUkUgby5pZCA9ICRrZXkgT1IgTE9XRVIoby5uYW1lKSA9IExPV0VSKCRrZXkpIFJFVFVSTiBvXCIsXG5cdFx0XHR7IGtleTogbmFtZU9ySWQgfVxuXHRcdCk7XG5cdFx0aWYgKHJlcy5yb3dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VPYmplY3QocmVzLnJvd3NbMF1bMF0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29ubmVjdGlvbnMobmFtZU9ySWQ6IHN0cmluZyk6IFByb21pc2U8QnJhaW5Db25uZWN0aW9uW10+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uczogQnJhaW5Db25uZWN0aW9uW10gPSBbXTtcblxuXHRcdC8vIE91dGdvaW5nXG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKGE6T2JqZWN0KS1bYzpDb25uZWN0aW9uXS0+KGI6T2JqZWN0KVxuXHRcdFx0IFdIRVJFIGEuaWQgPSAka2V5IE9SIExPV0VSKGEubmFtZSkgPSBMT1dFUigka2V5KVxuXHRcdFx0IFJFVFVSTiBjLnJlbGF0aW9uLCBiLm5hbWUsIGIudHlwZSwgYi5zdGF0dXMsIGIuaWRgLFxuXHRcdFx0eyBrZXk6IG5hbWVPcklkIH1cblx0XHQpO1xuXHRcdGZvciAoY29uc3QgciBvZiBvdXQucm93cykge1xuXHRcdFx0Y29ubmVjdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJlbGF0aW9uOiByWzBdLFxuXHRcdFx0XHRuYW1lOiByWzFdLFxuXHRcdFx0XHR0eXBlOiByWzJdLFxuXHRcdFx0XHRzdGF0dXM6IHJbM10sXG5cdFx0XHRcdGlkOiByWzRdLFxuXHRcdFx0XHRkaXJlY3Rpb246IFwib3V0Z29pbmdcIixcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEluY29taW5nXG5cdFx0Y29uc3QgaW5jID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKGE6T2JqZWN0KS1bYzpDb25uZWN0aW9uXS0+KGI6T2JqZWN0KVxuXHRcdFx0IFdIRVJFIGIuaWQgPSAka2V5IE9SIExPV0VSKGIubmFtZSkgPSBMT1dFUigka2V5KVxuXHRcdFx0IFJFVFVSTiBjLnJlbGF0aW9uLCBhLm5hbWUsIGEudHlwZSwgYS5zdGF0dXMsIGEuaWRgLFxuXHRcdFx0eyBrZXk6IG5hbWVPcklkIH1cblx0XHQpO1xuXHRcdGZvciAoY29uc3QgciBvZiBpbmMucm93cykge1xuXHRcdFx0Y29ubmVjdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJlbGF0aW9uOiByWzBdLFxuXHRcdFx0XHRuYW1lOiByWzFdLFxuXHRcdFx0XHR0eXBlOiByWzJdLFxuXHRcdFx0XHRzdGF0dXM6IHJbM10sXG5cdFx0XHRcdGlkOiByWzRdLFxuXHRcdFx0XHRkaXJlY3Rpb246IFwiaW5jb21pbmdcIixcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb25uZWN0aW9ucztcblx0fVxuXG5cdGFzeW5jIHNlYXJjaE9iamVjdHMocXVlcnk6IHN0cmluZywgbGltaXQ6IG51bWJlciA9IDUwKTogUHJvbWlzZTxCcmFpbk9iamVjdFtdPiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKG86T2JqZWN0KVxuXHRcdFx0IFdIRVJFIExPV0VSKG8ubmFtZSkgQ09OVEFJTlMgTE9XRVIoJHEpIE9SIExPV0VSKG8uZGVzY3JpcHRpb24pIENPTlRBSU5TIExPV0VSKCRxKVxuXHRcdFx0IFJFVFVSTiBvIE9SREVSIEJZIG8ubW9kaWZpZWQgREVTQyBMSU1JVCAke2xpbWl0fWAsXG5cdFx0XHR7IHE6IHF1ZXJ5IH1cblx0XHQpO1xuXHRcdHJldHVybiByZXMucm93cy5tYXAoKHIpID0+IHRoaXMucGFyc2VPYmplY3QoclswXSkpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlU3RhdHVzKG9iamVjdElkOiBzdHJpbmcsIG5ld1N0YXR1czogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnJlcGxhY2UoXCJUXCIsIFwiIFwiKS5zbGljZSgwLCAxOSk7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKG86T2JqZWN0KSBXSEVSRSBvLmlkID0gJGlkXG5cdFx0XHQgU0VUIG8uc3RhdHVzID0gJHN0YXR1cywgby5tb2RpZmllZCA9IHRpbWVzdGFtcCgkbm93KVxuXHRcdFx0IFJFVFVSTiBvLm5hbWVgLFxuXHRcdFx0eyBpZDogb2JqZWN0SWQsIHN0YXR1czogbmV3U3RhdHVzLCBub3c6IG5vdyB9XG5cdFx0KTtcblx0XHRyZXR1cm4gcmVzLnJvd3MubGVuZ3RoID4gMDtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZURlc2NyaXB0aW9uKG9iamVjdElkOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkucmVwbGFjZShcIlRcIiwgXCIgXCIpLnNsaWNlKDAsIDE5KTtcblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdGBNQVRDSCAobzpPYmplY3QpIFdIRVJFIG8uaWQgPSAkaWRcblx0XHRcdCBTRVQgby5kZXNjcmlwdGlvbiA9ICRkZXNjLCBvLm1vZGlmaWVkID0gdGltZXN0YW1wKCRub3cpXG5cdFx0XHQgUkVUVVJOIG8ubmFtZWAsXG5cdFx0XHR7IGlkOiBvYmplY3RJZCwgZGVzYzogZGVzY3JpcHRpb24sIG5vdzogbm93IH1cblx0XHQpO1xuXHRcdHJldHVybiByZXMucm93cy5sZW5ndGggPiAwO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlT2JqZWN0KG9iamVjdElkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyBEZWxldGUgYWxsIGNvbm5lY3Rpb25zIGZpcnN0LCB0aGVuIHRoZSBvYmplY3Rcblx0XHRhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdGBNQVRDSCAoYTpPYmplY3QpLVtjOkNvbm5lY3Rpb25dLShiOk9iamVjdCkgV0hFUkUgYS5pZCA9ICRpZCBERUxFVEUgY2AsXG5cdFx0XHR7IGlkOiBvYmplY3RJZCB9XG5cdFx0KTtcblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdGBNQVRDSCAobzpPYmplY3QpIFdIRVJFIG8uaWQgPSAkaWQgREVMRVRFIG8gUkVUVVJOIHRydWVgLFxuXHRcdFx0eyBpZDogb2JqZWN0SWQgfVxuXHRcdCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBkZWxldGVDb25uZWN0aW9uKGZyb21JZDogc3RyaW5nLCByZWxhdGlvbjogc3RyaW5nLCB0b0lkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdGBNQVRDSCAoYTpPYmplY3QpLVtjOkNvbm5lY3Rpb25dLT4oYjpPYmplY3QpXG5cdFx0XHQgV0hFUkUgYS5pZCA9ICRmcm9tSWQgQU5EIGIuaWQgPSAkdG9JZCBBTkQgYy5yZWxhdGlvbiA9ICRyZWxcblx0XHRcdCBERUxFVEUgY2AsXG5cdFx0XHR7IGZyb21JZCwgdG9JZCwgcmVsOiByZWxhdGlvbiB9XG5cdFx0KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VPYmplY3QocmF3OiBhbnkpOiBCcmFpbk9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiByYXcuaWQgfHwgXCJcIixcblx0XHRcdHR5cGU6IHJhdy50eXBlIHx8IFwiXCIsXG5cdFx0XHRuYW1lOiByYXcubmFtZSB8fCBcIlwiLFxuXHRcdFx0c3RhdHVzOiByYXcuc3RhdHVzIHx8IFwiXCIsXG5cdFx0XHRjcmVhdGVkOiByYXcuY3JlYXRlZCB8fCBcIlwiLFxuXHRcdFx0bW9kaWZpZWQ6IHJhdy5tb2RpZmllZCB8fCBcIlwiLFxuXHRcdFx0cGF0aDogcmF3LnBhdGggfHwgXCJcIixcblx0XHRcdGRlc2NyaXB0aW9uOiByYXcuZGVzY3JpcHRpb24gfHwgXCJcIixcblx0XHRcdHRpbWVsaW5lOiByYXcudGltZWxpbmUgfHwgXCJbXVwiLFxuXHRcdFx0cnVsZXM6IHJhdy5ydWxlcyB8fCBcIlwiLFxuXHRcdFx0c291cmNlX3Nlc3Npb246IHJhdy5zb3VyY2Vfc2Vzc2lvbiB8fCBcIlwiLFxuXHRcdH07XG5cdH1cbn1cbiIsICJpbXBvcnQgeyBJdGVtVmlldywgV29ya3NwYWNlTGVhZiwgc2V0SWNvbiwgZGVib3VuY2UgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB0eXBlIEx5cmFCcmFpblBsdWdpbiBmcm9tIFwiLi4vbWFpblwiO1xuaW1wb3J0IHR5cGUgeyBCcmFpbk9iamVjdCwgVHlwZUNvdW50IH0gZnJvbSBcIi4vQnJhaW5DbGllbnRcIjtcbmltcG9ydCB7IERFVEFJTF9WSUVXX1RZUEUgfSBmcm9tIFwiLi9PYmplY3REZXRhaWxWaWV3XCI7XG5cbmV4cG9ydCBjb25zdCBCUkFJTl9WSUVXX1RZUEUgPSBcImx5cmEtYnJhaW4tdmlld1wiO1xuXG5jb25zdCBTVEFUVVNfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRhY3RpdmU6IFwidmFyKC0tY29sb3ItZ3JlZW4pXCIsXG5cdGZyb3plbjogXCJ2YXIoLS1jb2xvci1ibHVlKVwiLFxuXHRkb25lOiBcInZhcigtLXRleHQtbXV0ZWQpXCIsXG5cdGJyb2tlbjogXCJ2YXIoLS1jb2xvci1yZWQpXCIsXG5cdHdhaXRpbmc6IFwidmFyKC0tY29sb3IteWVsbG93KVwiLFxuXHRpZGVhOiBcInZhcigtLWNvbG9yLXB1cnBsZSlcIixcblx0ZGVwcmVjYXRlZDogXCJ2YXIoLS10ZXh0LWZhaW50KVwiLFxufTtcblxuZXhwb3J0IGNsYXNzIEJyYWluVmlldyBleHRlbmRzIEl0ZW1WaWV3IHtcblx0cGx1Z2luOiBMeXJhQnJhaW5QbHVnaW47XG5cdHByaXZhdGUgc2VhcmNoSW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQ7XG5cdHByaXZhdGUgdHlwZUNoaXBzRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIG9iamVjdExpc3RFbDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc3RhdHVzQmFyRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlbGVjdGVkVHlwZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdHlwZUNvdW50czogVHlwZUNvdW50W10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcihsZWFmOiBXb3Jrc3BhY2VMZWFmLCBwbHVnaW46IEx5cmFCcmFpblBsdWdpbikge1xuXHRcdHN1cGVyKGxlYWYpO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0Z2V0Vmlld1R5cGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQlJBSU5fVklFV19UWVBFO1xuXHR9XG5cblx0Z2V0RGlzcGxheVRleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gXCJMeXJhIEJyYWluXCI7XG5cdH1cblxuXHRnZXRJY29uKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFwiYnJhaW5cIjtcblx0fVxuXG5cdGFzeW5jIG9uT3BlbigpIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lckVsLmNoaWxkcmVuWzFdIGFzIEhUTUxFbGVtZW50O1xuXHRcdGNvbnRhaW5lci5lbXB0eSgpO1xuXHRcdGNvbnRhaW5lci5hZGRDbGFzcyhcImx5cmEtYnJhaW4tY29udGFpbmVyXCIpO1xuXG5cdFx0Ly8gSGVhZGVyXG5cdFx0Y29uc3QgaGVhZGVyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWJyYWluLWhlYWRlclwiIH0pO1xuXHRcdGhlYWRlci5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBcIkx5cmEgQnJhaW5cIiwgY2xzOiBcImx5cmEtYnJhaW4tdGl0bGVcIiB9KTtcblxuXHRcdGNvbnN0IHJlZnJlc2hCdG4gPSBoZWFkZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibHlyYS1idG4taWNvblwiLCBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlJlZnJlc2hcIiB9IH0pO1xuXHRcdHNldEljb24ocmVmcmVzaEJ0biwgXCJyZWZyZXNoLWN3XCIpO1xuXHRcdHJlZnJlc2hCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMucmVmcmVzaCgpKTtcblxuXHRcdC8vIFNlYXJjaFxuXHRcdGNvbnN0IHNlYXJjaFdyYXAgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtc2VhcmNoLXdyYXBcIiB9KTtcblx0XHR0aGlzLnNlYXJjaElucHV0ID0gc2VhcmNoV3JhcC5jcmVhdGVFbChcImlucHV0XCIsIHtcblx0XHRcdHR5cGU6IFwidGV4dFwiLFxuXHRcdFx0cGxhY2Vob2xkZXI6IFwiU2VhcmNoIG9iamVjdHMuLi5cIixcblx0XHRcdGNsczogXCJseXJhLXNlYXJjaC1pbnB1dFwiLFxuXHRcdH0pO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcblx0XHRcdFwiaW5wdXRcIixcblx0XHRcdGRlYm91bmNlKCgpID0+IHRoaXMub25TZWFyY2goKSwgMzAwLCB0cnVlKVxuXHRcdCk7XG5cblx0XHQvLyBUeXBlIGNoaXBzXG5cdFx0dGhpcy50eXBlQ2hpcHNFbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS10eXBlLWNoaXBzXCIgfSk7XG5cblx0XHQvLyBPYmplY3QgbGlzdFxuXHRcdHRoaXMub2JqZWN0TGlzdEVsID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW9iamVjdC1saXN0XCIgfSk7XG5cblx0XHQvLyBTdGF0dXMgYmFyXG5cdFx0dGhpcy5zdGF0dXNCYXJFbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1zdGF0dXMtYmFyXCIgfSk7XG5cblx0XHRhd2FpdCB0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2goKSB7XG5cdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KFwiTG9hZGluZy4uLlwiKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy50eXBlQ291bnRzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50LmdldE9iamVjdENvdW50cygpO1xuXHRcdFx0dGhpcy5yZW5kZXJUeXBlQ2hpcHMoKTtcblx0XHRcdGF3YWl0IHRoaXMubG9hZE9iamVjdHMoKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHtcblx0XHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChgRXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuXHRcdFx0dGhpcy5vYmplY3RMaXN0RWwuZW1wdHkoKTtcblx0XHRcdHRoaXMub2JqZWN0TGlzdEVsLmNyZWF0ZUVsKFwiZGl2XCIsIHtcblx0XHRcdFx0dGV4dDogXCJDb3VsZCBub3QgY29ubmVjdCB0byBicmFpbi4gQ2hlY2sgc2V0dGluZ3MuXCIsXG5cdFx0XHRcdGNsczogXCJseXJhLWVtcHR5LXN0YXRlXCIsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclR5cGVDaGlwcygpIHtcblx0XHR0aGlzLnR5cGVDaGlwc0VsLmVtcHR5KCk7XG5cblx0XHQvLyBcIkFsbFwiIGNoaXBcblx0XHRjb25zdCBhbGxDb3VudCA9IHRoaXMudHlwZUNvdW50cy5yZWR1Y2UoKHMsIHQpID0+IHMgKyB0LmNvdW50LCAwKTtcblx0XHRjb25zdCBhbGxDaGlwID0gdGhpcy50eXBlQ2hpcHNFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHR0ZXh0OiBgYWxsICgke2FsbENvdW50fSlgLFxuXHRcdFx0Y2xzOiBgbHlyYS1jaGlwICR7dGhpcy5zZWxlY3RlZFR5cGUgPT09IG51bGwgPyBcImx5cmEtY2hpcC1hY3RpdmVcIiA6IFwiXCJ9YCxcblx0XHR9KTtcblx0XHRhbGxDaGlwLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkVHlwZSA9IG51bGw7XG5cdFx0XHR0aGlzLnJlbmRlclR5cGVDaGlwcygpO1xuXHRcdFx0dGhpcy5sb2FkT2JqZWN0cygpO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCB0YyBvZiB0aGlzLnR5cGVDb3VudHMpIHtcblx0XHRcdGNvbnN0IGNoaXAgPSB0aGlzLnR5cGVDaGlwc0VsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdFx0dGV4dDogYCR7dGMudHlwZX0gKCR7dGMuY291bnR9KWAsXG5cdFx0XHRcdGNsczogYGx5cmEtY2hpcCAke3RoaXMuc2VsZWN0ZWRUeXBlID09PSB0Yy50eXBlID8gXCJseXJhLWNoaXAtYWN0aXZlXCIgOiBcIlwifWAsXG5cdFx0XHR9KTtcblx0XHRcdGNoaXAuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcblx0XHRcdFx0dGhpcy5zZWxlY3RlZFR5cGUgPSB0Yy50eXBlO1xuXHRcdFx0XHR0aGlzLnJlbmRlclR5cGVDaGlwcygpO1xuXHRcdFx0XHR0aGlzLmxvYWRPYmplY3RzKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRPYmplY3RzKCkge1xuXHRcdHRoaXMub2JqZWN0TGlzdEVsLmVtcHR5KCk7XG5cdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KFwiTG9hZGluZy4uLlwiKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvYmplY3RzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50Lmxpc3RPYmplY3RzKFxuXHRcdFx0XHR0aGlzLnNlbGVjdGVkVHlwZSB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0MjAwXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5yZW5kZXJPYmplY3RzKG9iamVjdHMpO1xuXHRcdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KGAke29iamVjdHMubGVuZ3RofSBvYmplY3RzYCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoYEVycm9yOiAke2UubWVzc2FnZX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uU2VhcmNoKCkge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hJbnB1dC52YWx1ZS50cmltKCk7XG5cdFx0aWYgKCFxdWVyeSkge1xuXHRcdFx0YXdhaXQgdGhpcy5sb2FkT2JqZWN0cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMub2JqZWN0TGlzdEVsLmVtcHR5KCk7XG5cdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KFwiU2VhcmNoaW5nLi4uXCIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQuc2VhcmNoT2JqZWN0cyhxdWVyeSk7XG5cdFx0XHR0aGlzLnJlbmRlck9iamVjdHMocmVzdWx0cyk7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoYCR7cmVzdWx0cy5sZW5ndGh9IHJlc3VsdHMgZm9yIFwiJHtxdWVyeX1cImApO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KGBTZWFyY2ggZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyT2JqZWN0cyhvYmplY3RzOiBCcmFpbk9iamVjdFtdKSB7XG5cdFx0dGhpcy5vYmplY3RMaXN0RWwuZW1wdHkoKTtcblxuXHRcdGlmIChvYmplY3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5vYmplY3RMaXN0RWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuXHRcdFx0XHR0ZXh0OiBcIk5vIG9iamVjdHMgZm91bmRcIixcblx0XHRcdFx0Y2xzOiBcImx5cmEtZW1wdHktc3RhdGVcIixcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgb2JqIG9mIG9iamVjdHMpIHtcblx0XHRcdGNvbnN0IHJvdyA9IHRoaXMub2JqZWN0TGlzdEVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW9iamVjdC1yb3dcIiB9KTtcblx0XHRcdHJvdy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5vcGVuT2JqZWN0KG9iaikpO1xuXG5cdFx0XHRjb25zdCBuYW1lRWwgPSByb3cuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtb2JqZWN0LW5hbWVcIiB9KTtcblx0XHRcdG5hbWVFbC5zZXRUZXh0KG9iai5uYW1lKTtcblxuXHRcdFx0Y29uc3QgbWV0YUVsID0gcm93LmNyZWF0ZURpdih7IGNsczogXCJseXJhLW9iamVjdC1tZXRhXCIgfSk7XG5cblx0XHRcdGNvbnN0IHR5cGVUYWcgPSBtZXRhRWwuY3JlYXRlRWwoXCJzcGFuXCIsIHtcblx0XHRcdFx0dGV4dDogb2JqLnR5cGUsXG5cdFx0XHRcdGNsczogXCJseXJhLXRhZyBseXJhLXRhZy10eXBlXCIsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3RhdHVzVGFnID0gbWV0YUVsLmNyZWF0ZUVsKFwic3BhblwiLCB7XG5cdFx0XHRcdHRleHQ6IG9iai5zdGF0dXMsXG5cdFx0XHRcdGNsczogYGx5cmEtdGFnIGx5cmEtdGFnLXN0YXR1c2AsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbG9yID0gU1RBVFVTX0NPTE9SU1tvYmouc3RhdHVzXSB8fCBcInZhcigtLXRleHQtbXV0ZWQpXCI7XG5cdFx0XHRzdGF0dXNUYWcuc3R5bGUuc2V0UHJvcGVydHkoXCItLXN0YXR1cy1jb2xvclwiLCBjb2xvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuT2JqZWN0KG9iajogQnJhaW5PYmplY3QpIHtcblx0XHRjb25zdCBsZWF2ZXMgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKERFVEFJTF9WSUVXX1RZUEUpO1xuXHRcdGxldCBsZWFmOiBXb3Jrc3BhY2VMZWFmO1xuXG5cdFx0aWYgKGxlYXZlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZWFmID0gbGVhdmVzWzBdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoXCJ0YWJcIik7XG5cdFx0fVxuXG5cdFx0YXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoe1xuXHRcdFx0dHlwZTogREVUQUlMX1ZJRVdfVFlQRSxcblx0XHRcdHN0YXRlOiB7IG9iamVjdElkOiBvYmouaWQgfSxcblx0XHR9KTtcblx0XHR0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcblx0fVxuXG5cdGFzeW5jIG9uQ2xvc2UoKSB7XG5cdFx0Ly8gY2xlYW51cFxuXHR9XG59XG4iLCAiaW1wb3J0IHsgSXRlbVZpZXcsIFdvcmtzcGFjZUxlYWYsIHNldEljb24sIE1vZGFsLCBBcHAsIFNldHRpbmcgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB0eXBlIEx5cmFCcmFpblBsdWdpbiBmcm9tIFwiLi4vbWFpblwiO1xuaW1wb3J0IHR5cGUgeyBCcmFpbk9iamVjdCwgQnJhaW5Db25uZWN0aW9uIH0gZnJvbSBcIi4vQnJhaW5DbGllbnRcIjtcblxuZXhwb3J0IGNvbnN0IERFVEFJTF9WSUVXX1RZUEUgPSBcImx5cmEtYnJhaW4tZGV0YWlsXCI7XG5cbmNvbnN0IEFMTF9TVEFUVVNFUyA9IFtcImFjdGl2ZVwiLCBcImZyb3plblwiLCBcImRvbmVcIiwgXCJicm9rZW5cIiwgXCJ3YWl0aW5nXCIsIFwiaWRlYVwiLCBcImRlcHJlY2F0ZWRcIl07XG5cbmludGVyZmFjZSBUaW1lbGluZUVudHJ5IHtcblx0dHM6IHN0cmluZztcblx0ZXZlbnQ6IHN0cmluZztcbn1cblxuY29uc3QgU1RBVFVTX0VNT0pJOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRhY3RpdmU6IFwiXHUyNUNGXCIsXG5cdGZyb3plbjogXCJcdTI1QzZcIixcblx0ZG9uZTogXCJcdTI3MTNcIixcblx0YnJva2VuOiBcIlx1MjcxN1wiLFxuXHR3YWl0aW5nOiBcIlx1MjVDQ1wiLFxuXHRpZGVhOiBcIlx1MjVDN1wiLFxuXHRkZXByZWNhdGVkOiBcIlx1MjVDQlwiLFxufTtcblxuLy8gLS0tLSBDb25maXJtYXRpb24gTW9kYWwgLS0tLVxuY2xhc3MgQ29uZmlybURlbGV0ZU1vZGFsIGV4dGVuZHMgTW9kYWwge1xuXHRwcml2YXRlIG9iamVjdE5hbWU6IHN0cmluZztcblx0cHJpdmF0ZSBvbkNvbmZpcm06ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIG9iamVjdE5hbWU6IHN0cmluZywgb25Db25maXJtOiAoKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoYXBwKTtcblx0XHR0aGlzLm9iamVjdE5hbWUgPSBvYmplY3ROYW1lO1xuXHRcdHRoaXMub25Db25maXJtID0gb25Db25maXJtO1xuXHR9XG5cblx0b25PcGVuKCkge1xuXHRcdGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuXHRcdGNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogXCJEZWxldGUgT2JqZWN0XCIgfSk7XG5cdFx0Y29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7XG5cdFx0XHR0ZXh0OiBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBcIiR7dGhpcy5vYmplY3ROYW1lfVwiPyBUaGlzIHdpbGwgYWxzbyByZW1vdmUgYWxsIGl0cyBjb25uZWN0aW9ucy4gVGhpcyBjYW5ub3QgYmUgdW5kb25lLmAsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBidG5Sb3cgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtbW9kYWwtYnV0dG9uc1wiIH0pO1xuXG5cdFx0Y29uc3QgY2FuY2VsQnRuID0gYnRuUm93LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJDYW5jZWxcIiB9KTtcblx0XHRjYW5jZWxCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuY2xvc2UoKSk7XG5cblx0XHRjb25zdCBkZWxldGVCdG4gPSBidG5Sb3cuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0dGV4dDogXCJEZWxldGVcIixcblx0XHRcdGNsczogXCJseXJhLWJ0bi1kYW5nZXJcIixcblx0XHR9KTtcblx0XHRkZWxldGVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcblx0XHRcdHRoaXMub25Db25maXJtKCk7XG5cdFx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRvbkNsb3NlKCkge1xuXHRcdHRoaXMuY29udGVudEVsLmVtcHR5KCk7XG5cdH1cbn1cblxuLy8gLS0tLSBFZGl0IERlc2NyaXB0aW9uIE1vZGFsIC0tLS1cbmNsYXNzIEVkaXREZXNjcmlwdGlvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xuXHRwcml2YXRlIGN1cnJlbnREZXNjOiBzdHJpbmc7XG5cdHByaXZhdGUgb25TYXZlOiAoZGVzYzogc3RyaW5nKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBjdXJyZW50RGVzYzogc3RyaW5nLCBvblNhdmU6IChkZXNjOiBzdHJpbmcpID0+IHZvaWQpIHtcblx0XHRzdXBlcihhcHApO1xuXHRcdHRoaXMuY3VycmVudERlc2MgPSBjdXJyZW50RGVzYztcblx0XHR0aGlzLm9uU2F2ZSA9IG9uU2F2ZTtcblx0fVxuXG5cdG9uT3BlbigpIHtcblx0XHRjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiRWRpdCBEZXNjcmlwdGlvblwiIH0pO1xuXG5cdFx0Y29uc3QgdGV4dGFyZWEgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJ0ZXh0YXJlYVwiLCB7XG5cdFx0XHRjbHM6IFwibHlyYS1lZGl0LXRleHRhcmVhXCIsXG5cdFx0fSk7XG5cdFx0dGV4dGFyZWEudmFsdWUgPSB0aGlzLmN1cnJlbnREZXNjO1xuXHRcdHRleHRhcmVhLnJvd3MgPSA4O1xuXG5cdFx0Y29uc3QgYnRuUm93ID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW1vZGFsLWJ1dHRvbnNcIiB9KTtcblxuXHRcdGNvbnN0IGNhbmNlbEJ0biA9IGJ0blJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ2FuY2VsXCIgfSk7XG5cdFx0Y2FuY2VsQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmNsb3NlKCkpO1xuXG5cdFx0Y29uc3Qgc2F2ZUJ0biA9IGJ0blJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHR0ZXh0OiBcIlNhdmVcIixcblx0XHRcdGNsczogXCJseXJhLWJ0bi1wcmltYXJ5XCIsXG5cdFx0fSk7XG5cdFx0c2F2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5vblNhdmUodGV4dGFyZWEudmFsdWUpO1xuXHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0b25DbG9zZSgpIHtcblx0XHR0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gQ29uZmlybSBEZWxldGUgQ29ubmVjdGlvbiBNb2RhbCAtLS0tXG5jbGFzcyBDb25maXJtRGVsZXRlQ29ubmVjdGlvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xuXHRwcml2YXRlIGNvbm5OYW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVsYXRpb246IHN0cmluZztcblx0cHJpdmF0ZSBvbkNvbmZpcm06ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIGNvbm5OYW1lOiBzdHJpbmcsIHJlbGF0aW9uOiBzdHJpbmcsIG9uQ29uZmlybTogKCkgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGFwcCk7XG5cdFx0dGhpcy5jb25uTmFtZSA9IGNvbm5OYW1lO1xuXHRcdHRoaXMucmVsYXRpb24gPSByZWxhdGlvbjtcblx0XHR0aGlzLm9uQ29uZmlybSA9IG9uQ29uZmlybTtcblx0fVxuXG5cdG9uT3BlbigpIHtcblx0XHRjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiRGVsZXRlIENvbm5lY3Rpb25cIiB9KTtcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHtcblx0XHRcdHRleHQ6IGBSZW1vdmUgXCIke3RoaXMucmVsYXRpb259XCIgY29ubmVjdGlvbiB0byBcIiR7dGhpcy5jb25uTmFtZX1cIj9gLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYnRuUm93ID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW1vZGFsLWJ1dHRvbnNcIiB9KTtcblxuXHRcdGNvbnN0IGNhbmNlbEJ0biA9IGJ0blJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ2FuY2VsXCIgfSk7XG5cdFx0Y2FuY2VsQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmNsb3NlKCkpO1xuXG5cdFx0Y29uc3QgZGVsZXRlQnRuID0gYnRuUm93LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdHRleHQ6IFwiRGVsZXRlXCIsXG5cdFx0XHRjbHM6IFwibHlyYS1idG4tZGFuZ2VyXCIsXG5cdFx0fSk7XG5cdFx0ZGVsZXRlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG5cdFx0XHR0aGlzLm9uQ29uZmlybSgpO1xuXHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0b25DbG9zZSgpIHtcblx0XHR0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIE9iamVjdERldGFpbFZpZXcgZXh0ZW5kcyBJdGVtVmlldyB7XG5cdHBsdWdpbjogTHlyYUJyYWluUGx1Z2luO1xuXHRwcml2YXRlIG9iamVjdElkOiBzdHJpbmcgPSBcIlwiO1xuXHRwcml2YXRlIG9iamVjdDogQnJhaW5PYmplY3QgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihsZWFmOiBXb3Jrc3BhY2VMZWFmLCBwbHVnaW46IEx5cmFCcmFpblBsdWdpbikge1xuXHRcdHN1cGVyKGxlYWYpO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0Z2V0Vmlld1R5cGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gREVUQUlMX1ZJRVdfVFlQRTtcblx0fVxuXG5cdGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMub2JqZWN0Py5uYW1lIHx8IFwiT2JqZWN0IERldGFpbFwiO1xuXHR9XG5cblx0Z2V0SWNvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiBcImZpbGUtdGV4dFwiO1xuXHR9XG5cblx0Z2V0U3RhdGUoKSB7XG5cdFx0cmV0dXJuIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQgfTtcblx0fVxuXG5cdGFzeW5jIHNldFN0YXRlKHN0YXRlOiBhbnksIHJlc3VsdDogYW55KSB7XG5cdFx0aWYgKHN0YXRlLm9iamVjdElkKSB7XG5cdFx0XHR0aGlzLm9iamVjdElkID0gc3RhdGUub2JqZWN0SWQ7XG5cdFx0XHRhd2FpdCB0aGlzLmxvYWRBbmRSZW5kZXIoKTtcblx0XHR9XG5cdFx0YXdhaXQgc3VwZXIuc2V0U3RhdGUoc3RhdGUsIHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyBsb2FkQW5kUmVuZGVyKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY29udGFpbmVyRWwuY2hpbGRyZW5bMV0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0Y29udGFpbmVyLmVtcHR5KCk7XG5cdFx0Y29udGFpbmVyLmFkZENsYXNzKFwibHlyYS1kZXRhaWwtY29udGFpbmVyXCIpO1xuXG5cdFx0aWYgKCF0aGlzLm9iamVjdElkKSB7XG5cdFx0XHRjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyB0ZXh0OiBcIk5vIG9iamVjdCBzZWxlY3RlZFwiLCBjbHM6IFwibHlyYS1lbXB0eS1zdGF0ZVwiIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IHRleHQ6IFwiTG9hZGluZy4uLlwiLCBjbHM6IFwibHlyYS1sb2FkaW5nXCIgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgW29iaiwgY29ubmVjdGlvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLnBsdWdpbi5jbGllbnQuZ2V0T2JqZWN0KHRoaXMub2JqZWN0SWQpLFxuXHRcdFx0XHR0aGlzLnBsdWdpbi5jbGllbnQuZ2V0Q29ubmVjdGlvbnModGhpcy5vYmplY3RJZCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29udGFpbmVyLmVtcHR5KCk7XG5cblx0XHRcdGlmICghb2JqKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IHRleHQ6IFwiT2JqZWN0IG5vdCBmb3VuZFwiLCBjbHM6IFwibHlyYS1lbXB0eS1zdGF0ZVwiIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub2JqZWN0ID0gb2JqO1xuXHRcdFx0dGhpcy5sZWFmLnVwZGF0ZUhlYWRlcigpO1xuXHRcdFx0dGhpcy5yZW5kZXJPYmplY3QoY29udGFpbmVyLCBvYmosIGNvbm5lY3Rpb25zKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHtcblx0XHRcdGNvbnRhaW5lci5lbXB0eSgpO1xuXHRcdFx0Y29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgdGV4dDogYEVycm9yOiAke2UubWVzc2FnZX1gLCBjbHM6IFwibHlyYS1lbXB0eS1zdGF0ZVwiIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyT2JqZWN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9iajogQnJhaW5PYmplY3QsIGNvbm5lY3Rpb25zOiBCcmFpbkNvbm5lY3Rpb25bXSkge1xuXHRcdC8vIEhlYWRlciBzZWN0aW9uXG5cdFx0Y29uc3QgaGVhZGVyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1oZWFkZXJcIiB9KTtcblxuXHRcdGNvbnN0IHRpdGxlUm93ID0gaGVhZGVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC10aXRsZS1yb3dcIiB9KTtcblx0XHR0aXRsZVJvdy5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogb2JqLm5hbWUsIGNsczogXCJseXJhLWRldGFpbC1uYW1lXCIgfSk7XG5cblx0XHQvLyBBY3Rpb24gYnV0dG9uc1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aXRsZVJvdy5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtYWN0aW9uc1wiIH0pO1xuXG5cdFx0Y29uc3QgZGVsZXRlQnRuID0gYWN0aW9ucy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHRjbHM6IFwibHlyYS1idG4taWNvbiBseXJhLWJ0bi1kZWxldGVcIixcblx0XHRcdGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiRGVsZXRlIG9iamVjdFwiIH0sXG5cdFx0fSk7XG5cdFx0c2V0SWNvbihkZWxldGVCdG4sIFwidHJhc2gtMlwiKTtcblx0XHRkZWxldGVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuY29uZmlybURlbGV0ZShvYmopKTtcblxuXHRcdGNvbnN0IGJhZGdlcyA9IGhlYWRlci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtYmFkZ2VzXCIgfSk7XG5cdFx0YmFkZ2VzLmNyZWF0ZUVsKFwic3BhblwiLCB7IHRleHQ6IG9iai50eXBlLCBjbHM6IFwibHlyYS10YWcgbHlyYS10YWctdHlwZVwiIH0pO1xuXG5cdFx0Ly8gU3RhdHVzIGFzIGEgZHJvcGRvd25cblx0XHRjb25zdCBzdGF0dXNTZWxlY3QgPSBiYWRnZXMuY3JlYXRlRWwoXCJzZWxlY3RcIiwgeyBjbHM6IFwibHlyYS1zdGF0dXMtc2VsZWN0XCIgfSk7XG5cdFx0c3RhdHVzU2VsZWN0LmRhdGFzZXQuc3RhdHVzID0gb2JqLnN0YXR1cztcblx0XHRmb3IgKGNvbnN0IHMgb2YgQUxMX1NUQVRVU0VTKSB7XG5cdFx0XHRjb25zdCBvcHQgPSBzdGF0dXNTZWxlY3QuY3JlYXRlRWwoXCJvcHRpb25cIiwge1xuXHRcdFx0XHR0ZXh0OiBgJHtTVEFUVVNfRU1PSklbc10gfHwgXCJcdTI1Q0ZcIn0gJHtzfWAsXG5cdFx0XHRcdHZhbHVlOiBzLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocyA9PT0gb2JqLnN0YXR1cykgb3B0LnNlbGVjdGVkID0gdHJ1ZTtcblx0XHR9XG5cdFx0c3RhdHVzU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3U3RhdHVzID0gc3RhdHVzU2VsZWN0LnZhbHVlO1xuXHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50LnVwZGF0ZVN0YXR1cyhvYmouaWQsIG5ld1N0YXR1cyk7XG5cdFx0XHRhd2FpdCB0aGlzLmxvYWRBbmRSZW5kZXIoKTtcblx0XHR9KTtcblxuXHRcdC8vIERlc2NyaXB0aW9uICh3aXRoIGVkaXQgYnV0dG9uKVxuXHRcdGNvbnN0IGRlc2NTZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0Y29uc3QgZGVzY0hlYWRlciA9IGRlc2NTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXNlY3Rpb24taGVhZGVyXCIgfSk7XG5cdFx0ZGVzY0hlYWRlci5jcmVhdGVFbChcImg0XCIsIHsgdGV4dDogXCJEZXNjcmlwdGlvblwiIH0pO1xuXHRcdGNvbnN0IGVkaXREZXNjQnRuID0gZGVzY0hlYWRlci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHRjbHM6IFwibHlyYS1idG4taWNvbiBseXJhLWJ0bi1lZGl0XCIsXG5cdFx0XHRhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIkVkaXQgZGVzY3JpcHRpb25cIiB9LFxuXHRcdH0pO1xuXHRcdHNldEljb24oZWRpdERlc2NCdG4sIFwicGVuY2lsXCIpO1xuXHRcdGVkaXREZXNjQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmVkaXREZXNjcmlwdGlvbihvYmopKTtcblxuXHRcdGlmIChvYmouZGVzY3JpcHRpb24pIHtcblx0XHRcdGRlc2NTZWN0aW9uLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IG9iai5kZXNjcmlwdGlvbiwgY2xzOiBcImx5cmEtZGV0YWlsLWRlc2NcIiB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVzY1NlY3Rpb24uY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJObyBkZXNjcmlwdGlvblwiLCBjbHM6IFwibHlyYS1kZXRhaWwtZGVzYyBseXJhLXRleHQtZmFpbnRcIiB9KTtcblx0XHR9XG5cblx0XHQvLyBNZXRhZGF0YVxuXHRcdGNvbnN0IG1ldGFTZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0bWV0YVNlY3Rpb24uY3JlYXRlRWwoXCJoNFwiLCB7IHRleHQ6IFwiRGV0YWlsc1wiIH0pO1xuXHRcdGNvbnN0IG1ldGFHcmlkID0gbWV0YVNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLWdyaWRcIiB9KTtcblxuXHRcdHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJJRFwiLCBvYmouaWQpO1xuXHRcdHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJDcmVhdGVkXCIsIHRoaXMuZm9ybWF0RGF0ZShvYmouY3JlYXRlZCkpO1xuXHRcdHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJNb2RpZmllZFwiLCB0aGlzLmZvcm1hdERhdGUob2JqLm1vZGlmaWVkKSk7XG5cdFx0aWYgKG9iai5wYXRoKSB0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiUGF0aFwiLCBvYmoucGF0aCk7XG5cdFx0aWYgKG9iai5zb3VyY2Vfc2Vzc2lvbikgdGhpcy5hZGRNZXRhUm93KG1ldGFHcmlkLCBcIlNvdXJjZVwiLCBvYmouc291cmNlX3Nlc3Npb24pO1xuXHRcdGlmIChvYmoucnVsZXMpIHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJSdWxlc1wiLCBvYmoucnVsZXMpO1xuXG5cdFx0Ly8gQ29ubmVjdGlvbnNcblx0XHRpZiAoY29ubmVjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgY29ublNlY3Rpb24gPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLXNlY3Rpb25cIiB9KTtcblx0XHRcdGNvbm5TZWN0aW9uLmNyZWF0ZUVsKFwiaDRcIiwgeyB0ZXh0OiBgQ29ubmVjdGlvbnMgKCR7Y29ubmVjdGlvbnMubGVuZ3RofSlgIH0pO1xuXG5cdFx0XHRjb25zdCBvdXRnb2luZyA9IGNvbm5lY3Rpb25zLmZpbHRlcigoYykgPT4gYy5kaXJlY3Rpb24gPT09IFwib3V0Z29pbmdcIik7XG5cdFx0XHRjb25zdCBpbmNvbWluZyA9IGNvbm5lY3Rpb25zLmZpbHRlcigoYykgPT4gYy5kaXJlY3Rpb24gPT09IFwiaW5jb21pbmdcIik7XG5cblx0XHRcdGlmIChvdXRnb2luZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IG91dEdyb3VwID0gY29ublNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtY29ubi1ncm91cFwiIH0pO1xuXHRcdFx0XHRvdXRHcm91cC5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBcIk91dGdvaW5nIFx1MjE5MlwiLCBjbHM6IFwibHlyYS1jb25uLWRpcmVjdGlvblwiIH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbm4gb2Ygb3V0Z29pbmcpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlckNvbm5lY3Rpb24ob3V0R3JvdXAsIGNvbm4sIG9iaik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGluY29taW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgaW5Hcm91cCA9IGNvbm5TZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWNvbm4tZ3JvdXBcIiB9KTtcblx0XHRcdFx0aW5Hcm91cC5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBcIlx1MjE5MCBJbmNvbWluZ1wiLCBjbHM6IFwibHlyYS1jb25uLWRpcmVjdGlvblwiIH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbm4gb2YgaW5jb21pbmcpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlckNvbm5lY3Rpb24oaW5Hcm91cCwgY29ubiwgb2JqKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRpbWVsaW5lXG5cdFx0Y29uc3QgdGltZWxpbmUgPSB0aGlzLnBhcnNlVGltZWxpbmUob2JqLnRpbWVsaW5lKTtcblx0XHRpZiAodGltZWxpbmUubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgdGxTZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0XHR0bFNlY3Rpb24uY3JlYXRlRWwoXCJoNFwiLCB7IHRleHQ6IGBUaW1lbGluZSAoJHt0aW1lbGluZS5sZW5ndGh9KWAgfSk7XG5cdFx0XHRjb25zdCB0bExpc3QgPSB0bFNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtdGltZWxpbmVcIiB9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aW1lbGluZS5yZXZlcnNlKCkpIHtcblx0XHRcdFx0Y29uc3Qgcm93ID0gdGxMaXN0LmNyZWF0ZURpdih7IGNsczogXCJseXJhLXRpbWVsaW5lLWVudHJ5XCIgfSk7XG5cdFx0XHRcdHJvdy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiB0aGlzLmZvcm1hdERhdGUoZW50cnkudHMpLCBjbHM6IFwibHlyYS10bC1kYXRlXCIgfSk7XG5cdFx0XHRcdHJvdy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBlbnRyeS5ldmVudCwgY2xzOiBcImx5cmEtdGwtZXZlbnRcIiB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbm5lY3Rpb24ocGFyZW50OiBIVE1MRWxlbWVudCwgY29ubjogQnJhaW5Db25uZWN0aW9uLCBjdXJyZW50T2JqOiBCcmFpbk9iamVjdCkge1xuXHRcdGNvbnN0IHJvdyA9IHBhcmVudC5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1jb25uLXJvd1wiIH0pO1xuXG5cdFx0Y29uc3QgcmVsYXRpb24gPSByb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHtcblx0XHRcdHRleHQ6IGNvbm4ucmVsYXRpb24ucmVwbGFjZSgvXy9nLCBcIiBcIiksXG5cdFx0XHRjbHM6IFwibHlyYS1jb25uLXJlbGF0aW9uXCIsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBsaW5rID0gcm93LmNyZWF0ZUVsKFwiYVwiLCB7XG5cdFx0XHR0ZXh0OiBjb25uLm5hbWUsXG5cdFx0XHRjbHM6IFwibHlyYS1jb25uLWxpbmtcIixcblx0XHRcdGhyZWY6IFwiI1wiLFxuXHRcdH0pO1xuXHRcdGxpbmsuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRhd2FpdCB0aGlzLm5hdmlnYXRlVG8oY29ubi5pZCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtZXRhID0gcm93LmNyZWF0ZUVsKFwic3BhblwiLCB7XG5cdFx0XHR0ZXh0OiBgJHtjb25uLnR5cGV9IFx1MDBCNyAke2Nvbm4uc3RhdHVzfWAsXG5cdFx0XHRjbHM6IFwibHlyYS1jb25uLW1ldGFcIixcblx0XHR9KTtcblxuXHRcdC8vIERlbGV0ZSBjb25uZWN0aW9uIGJ1dHRvblxuXHRcdGNvbnN0IGRlbEJ0biA9IHJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHRjbHM6IFwibHlyYS1idG4taWNvbiBseXJhLWJ0bi1jb25uLWRlbGV0ZVwiLFxuXHRcdFx0YXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJEZWxldGUgY29ubmVjdGlvblwiIH0sXG5cdFx0fSk7XG5cdFx0c2V0SWNvbihkZWxCdG4sIFwieFwiKTtcblx0XHRkZWxCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y29uc3QgZnJvbUlkID0gY29ubi5kaXJlY3Rpb24gPT09IFwib3V0Z29pbmdcIiA/IGN1cnJlbnRPYmouaWQgOiBjb25uLmlkO1xuXHRcdFx0Y29uc3QgdG9JZCA9IGNvbm4uZGlyZWN0aW9uID09PSBcIm91dGdvaW5nXCIgPyBjb25uLmlkIDogY3VycmVudE9iai5pZDtcblx0XHRcdG5ldyBDb25maXJtRGVsZXRlQ29ubmVjdGlvbk1vZGFsKFxuXHRcdFx0XHR0aGlzLmFwcCxcblx0XHRcdFx0Y29ubi5uYW1lLFxuXHRcdFx0XHRjb25uLnJlbGF0aW9uLFxuXHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50LmRlbGV0ZUNvbm5lY3Rpb24oZnJvbUlkLCBjb25uLnJlbGF0aW9uLCB0b0lkKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmxvYWRBbmRSZW5kZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0KS5vcGVuKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbmZpcm1EZWxldGUob2JqOiBCcmFpbk9iamVjdCkge1xuXHRcdG5ldyBDb25maXJtRGVsZXRlTW9kYWwodGhpcy5hcHAsIG9iai5uYW1lLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQuZGVsZXRlT2JqZWN0KG9iai5pZCk7XG5cdFx0XHQvLyBHbyBiYWNrIFx1MjAxNCBjbG9zZSB0aGlzIGxlYWZcblx0XHRcdHRoaXMubGVhZi5kZXRhY2goKTtcblx0XHR9KS5vcGVuKCk7XG5cdH1cblxuXHRwcml2YXRlIGVkaXREZXNjcmlwdGlvbihvYmo6IEJyYWluT2JqZWN0KSB7XG5cdFx0bmV3IEVkaXREZXNjcmlwdGlvbk1vZGFsKHRoaXMuYXBwLCBvYmouZGVzY3JpcHRpb24sIGFzeW5jIChuZXdEZXNjKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQudXBkYXRlRGVzY3JpcHRpb24ob2JqLmlkLCBuZXdEZXNjKTtcblx0XHRcdGF3YWl0IHRoaXMubG9hZEFuZFJlbmRlcigpO1xuXHRcdH0pLm9wZW4oKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbmF2aWdhdGVUbyhvYmplY3RJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5vYmplY3RJZCA9IG9iamVjdElkO1xuXHRcdGF3YWl0IHRoaXMubG9hZEFuZFJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRNZXRhUm93KHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcblx0XHRjb25zdCByb3cgPSBwYXJlbnQuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtbWV0YS1yb3dcIiB9KTtcblx0XHRyb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogbGFiZWwsIGNsczogXCJseXJhLW1ldGEtbGFiZWxcIiB9KTtcblx0XHRyb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogdmFsdWUsIGNsczogXCJseXJhLW1ldGEtdmFsdWVcIiB9KTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0RGF0ZShkYXRlU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICghZGF0ZVN0cikgcmV0dXJuIFwiXHUyMDE0XCI7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGQgPSBuZXcgRGF0ZShkYXRlU3RyKTtcblx0XHRcdHJldHVybiBkLnRvTG9jYWxlRGF0ZVN0cmluZyhcImVuLUdCXCIsIHtcblx0XHRcdFx0ZGF5OiBcIjItZGlnaXRcIixcblx0XHRcdFx0bW9udGg6IFwic2hvcnRcIixcblx0XHRcdFx0eWVhcjogXCJudW1lcmljXCIsXG5cdFx0XHRcdGhvdXI6IFwiMi1kaWdpdFwiLFxuXHRcdFx0XHRtaW51dGU6IFwiMi1kaWdpdFwiLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZGF0ZVN0cjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlVGltZWxpbmUodGltZWxpbmVTdHI6IHN0cmluZyk6IFRpbWVsaW5lRW50cnlbXSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodGltZWxpbmVTdHIpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkgcmV0dXJuIHBhcnNlZDtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBvbkNsb3NlKCkge1xuXHRcdC8vIGNsZWFudXBcblx0fVxufVxuIiwgImltcG9ydCB7IEFwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHR5cGUgTHlyYUJyYWluUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTHlyYUJyYWluU2V0dGluZ3Mge1xuXHRlbmRwb2ludDogc3RyaW5nO1xuXHRhcGlLZXk6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IEx5cmFCcmFpblNldHRpbmdzID0ge1xuXHRlbmRwb2ludDogXCJodHRwczovL2JyYWluLnNha3VyYS5leGNoYW5nZVwiLFxuXHRhcGlLZXk6IFwiXCIsXG59O1xuXG5leHBvcnQgY2xhc3MgTHlyYUJyYWluU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuXHRwbHVnaW46IEx5cmFCcmFpblBsdWdpbjtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBMeXJhQnJhaW5QbHVnaW4pIHtcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRkaXNwbGF5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKTtcblxuXHRcdGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkx5cmEgQnJhaW5cIiB9KTtcblx0XHRjb250YWluZXJFbC5jcmVhdGVFbChcInBcIiwge1xuXHRcdFx0dGV4dDogXCJDb25uZWN0IHRvIEx5cmEtU2V2ZW4ncyBrbm93bGVkZ2UgZ3JhcGguXCIsXG5cdFx0XHRjbHM6IFwic2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uXCIsXG5cdFx0fSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiQVBJIEVuZHBvaW50XCIpXG5cdFx0XHQuc2V0RGVzYyhcIlVSTCBvZiB0aGUgYnJhaW4gc2VydmVyXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCkgPT5cblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcImh0dHBzOi8vYnJhaW4uc2FrdXJhLmV4Y2hhbmdlXCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmVuZHBvaW50KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmVuZHBvaW50ID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJBUEkgS2V5XCIpXG5cdFx0XHQuc2V0RGVzYyhcIkF1dGhlbnRpY2F0aW9uIGtleSBmb3IgdGhlIGJyYWluIEFQSVwiKVxuXHRcdFx0LmFkZFRleHQoKHRleHQpID0+IHtcblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcIkVudGVyIEFQSSBrZXlcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBpS2V5KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmFwaUtleSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdHRleHQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuXHRcdFx0fSk7XG5cblx0XHQvLyBUZXN0IGNvbm5lY3Rpb24gYnV0dG9uXG5cdFx0Y29uc3QgdGVzdERpdiA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXRlc3QtY29ubmVjdGlvblwiIH0pO1xuXHRcdGNvbnN0IHRlc3RCdG4gPSB0ZXN0RGl2LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJUZXN0IENvbm5lY3Rpb25cIiB9KTtcblx0XHRjb25zdCB0ZXN0UmVzdWx0ID0gdGVzdERpdi5jcmVhdGVFbChcInNwYW5cIiwgeyBjbHM6IFwibHlyYS10ZXN0LXJlc3VsdFwiIH0pO1xuXG5cdFx0dGVzdEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdFJlc3VsdC5zZXRUZXh0KFwiVGVzdGluZy4uLlwiKTtcblx0XHRcdHRlc3RSZXN1bHQuY2xhc3NOYW1lID0gXCJseXJhLXRlc3QtcmVzdWx0XCI7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQudGVzdENvbm5lY3Rpb24oKTtcblx0XHRcdHRlc3RSZXN1bHQuc2V0VGV4dChyZXN1bHQubWVzc2FnZSk7XG5cdFx0XHR0ZXN0UmVzdWx0LmNsYXNzTmFtZSA9IGBseXJhLXRlc3QtcmVzdWx0ICR7cmVzdWx0Lm9rID8gXCJseXJhLXRlc3Qtb2tcIiA6IFwibHlyYS10ZXN0LWZhaWxcIn1gO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBQUFBLG1CQUF1Qjs7O0FDQXZCLHNCQUE0QztBQW9DckMsSUFBTSxjQUFOLE1BQWtCO0FBQUEsRUFJeEIsWUFBWSxVQUFrQixRQUFnQjtBQUM3QyxTQUFLLFdBQVcsU0FBUyxRQUFRLFFBQVEsRUFBRTtBQUMzQyxTQUFLLFNBQVM7QUFBQSxFQUNm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aUJBQWlCLE1BQU0sSUFBSSxDQUFDO0FBRzlFLFNBQUssY0FBYyxJQUFJLG9CQUFvQixLQUFLLEtBQUssSUFBSSxDQUFDO0FBRzFELFNBQUssY0FBYyxTQUFTLGNBQWMsTUFBTTtBQUMvQyxXQUFLLGtCQUFrQjtBQUFBLElBQ3hCLENBQUM7QUFHRCxTQUFLLFdBQVc7QUFBQSxNQUNmLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFVBQVUsTUFBTSxLQUFLLGtCQUFrQjtBQUFBLElBQ3hDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLG9CQUFvQjtBQUN6QixVQUFNLFdBQVcsS0FBSyxJQUFJLFVBQVUsZ0JBQWdCLGVBQWU7QUFDbkUsUUFBSSxTQUFTLFNBQVMsR0FBRztBQUN4QixXQUFLLElBQUksVUFBVSxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQ3pDO0FBQUEsSUFDRDtBQUVBLFVBQU0sT0FBTyxLQUFLLElBQUksVUFBVSxhQUFhLEtBQUs7QUFDbEQsUUFBSSxNQUFNO0FBQ1QsWUFBTSxLQUFLLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixRQUFRLEtBQUssQ0FBQztBQUMvRCxXQUFLLElBQUksVUFBVSxXQUFXLElBQUk7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZUFBZTtBQUNwQixTQUFLLFdBQVcsT0FBTyxPQUFPLENBQUMsR0FBRyxrQkFBa0IsTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUFBLEVBQzFFO0FBQUEsRUFFQSxNQUFNLGVBQWU7QUF6RHRCO0FBMERFLFVBQU0sS0FBSyxTQUFTLEtBQUssUUFBUTtBQUNqQyxlQUFLLFdBQUwsbUJBQWEsYUFBYSxLQUFLLFNBQVMsVUFBVSxLQUFLLFNBQVM7QUFBQSxFQUNqRTtBQUFBLEVBRUEsV0FBVztBQUFBLEVBQUM7QUFDYjsiLAogICJuYW1lcyI6IFsiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIl0KfQo=
