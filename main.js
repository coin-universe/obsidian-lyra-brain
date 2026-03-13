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
    const escaped = this.escapeStr(newStatus);
    const res = await this.cypher(
      `MATCH (o:Object) WHERE o.id = $id SET o.status = ${escaped} RETURN o.name`,
      { id: objectId }
    );
    return res.rows.length > 0;
  }
  async updateDescription(objectId, description) {
    const escaped = this.escapeStr(description);
    const res = await this.cypher(
      `MATCH (o:Object) WHERE o.id = $id SET o.description = ${escaped} RETURN o.name`,
      { id: objectId }
    );
    return res.rows.length > 0;
  }
  async deleteObject(objectId) {
    await this.cypher(
      `MATCH (a:Object)-[c:Connection]->(b:Object) WHERE a.id = $id DELETE c`,
      { id: objectId }
    );
    await this.cypher(
      `MATCH (a:Object)-[c:Connection]->(b:Object) WHERE b.id = $id DELETE c`,
      { id: objectId }
    );
    await this.cypher(
      `MATCH (o:Object) WHERE o.id = $id DELETE o`,
      { id: objectId }
    );
    return true;
  }
  async deleteConnection(fromId, relation, toId) {
    const escaped = this.escapeStr(relation);
    await this.cypher(
      `MATCH (a:Object)-[c:Connection]->(b:Object)
			 WHERE a.id = $fromId AND b.id = $toId AND c.relation = ${escaped}
			 DELETE c`,
      { fromId, toId }
    );
    return true;
  }
  escapeStr(value) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    return `"${escaped}"`;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzcmMvQnJhaW5DbGllbnQudHMiLCAic3JjL0JyYWluVmlldy50cyIsICJzcmMvT2JqZWN0RGV0YWlsVmlldy50cyIsICJzcmMvU2V0dGluZ3NUYWIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgQnJhaW5DbGllbnQgfSBmcm9tIFwiLi9zcmMvQnJhaW5DbGllbnRcIjtcbmltcG9ydCB7IEJyYWluVmlldywgQlJBSU5fVklFV19UWVBFIH0gZnJvbSBcIi4vc3JjL0JyYWluVmlld1wiO1xuaW1wb3J0IHsgT2JqZWN0RGV0YWlsVmlldywgREVUQUlMX1ZJRVdfVFlQRSB9IGZyb20gXCIuL3NyYy9PYmplY3REZXRhaWxWaWV3XCI7XG5pbXBvcnQge1xuXHRMeXJhQnJhaW5TZXR0aW5nVGFiLFxuXHRMeXJhQnJhaW5TZXR0aW5ncyxcblx0REVGQVVMVF9TRVRUSU5HUyxcbn0gZnJvbSBcIi4vc3JjL1NldHRpbmdzVGFiXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEx5cmFCcmFpblBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG5cdHNldHRpbmdzOiBMeXJhQnJhaW5TZXR0aW5ncztcblx0Y2xpZW50OiBCcmFpbkNsaWVudDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuXHRcdHRoaXMuY2xpZW50ID0gbmV3IEJyYWluQ2xpZW50KHRoaXMuc2V0dGluZ3MuZW5kcG9pbnQsIHRoaXMuc2V0dGluZ3MuYXBpS2V5KTtcblxuXHRcdC8vIFJlZ2lzdGVyIHZpZXdzXG5cdFx0dGhpcy5yZWdpc3RlclZpZXcoQlJBSU5fVklFV19UWVBFLCAobGVhZikgPT4gbmV3IEJyYWluVmlldyhsZWFmLCB0aGlzKSk7XG5cdFx0dGhpcy5yZWdpc3RlclZpZXcoREVUQUlMX1ZJRVdfVFlQRSwgKGxlYWYpID0+IG5ldyBPYmplY3REZXRhaWxWaWV3KGxlYWYsIHRoaXMpKTtcblxuXHRcdC8vIFNldHRpbmdzIHRhYlxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTHlyYUJyYWluU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG5cdFx0Ly8gUmliYm9uIGljb25cblx0XHR0aGlzLmFkZFJpYmJvbkljb24oXCJicmFpblwiLCBcIkx5cmEgQnJhaW5cIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZUJyYWluVmlldygpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ29tbWFuZFxuXHRcdHRoaXMuYWRkQ29tbWFuZCh7XG5cdFx0XHRpZDogXCJvcGVuLWx5cmEtYnJhaW5cIixcblx0XHRcdG5hbWU6IFwiT3BlbiBMeXJhIEJyYWluXCIsXG5cdFx0XHRjYWxsYmFjazogKCkgPT4gdGhpcy5hY3RpdmF0ZUJyYWluVmlldygpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgYWN0aXZhdGVCcmFpblZpZXcoKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKEJSQUlOX1ZJRVdfVFlQRSk7XG5cdFx0aWYgKGV4aXN0aW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGV4aXN0aW5nWzBdKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldFJpZ2h0TGVhZihmYWxzZSk7XG5cdFx0aWYgKGxlYWYpIHtcblx0XHRcdGF3YWl0IGxlYWYuc2V0Vmlld1N0YXRlKHsgdHlwZTogQlJBSU5fVklFV19UWVBFLCBhY3RpdmU6IHRydWUgfSk7XG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG5cdFx0dGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG5cdH1cblxuXHRhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0XHR0aGlzLmNsaWVudD8udXBkYXRlQ29uZmlnKHRoaXMuc2V0dGluZ3MuZW5kcG9pbnQsIHRoaXMuc2V0dGluZ3MuYXBpS2V5KTtcblx0fVxuXG5cdG9udW5sb2FkKCkge31cbn1cbiIsICJpbXBvcnQgeyByZXF1ZXN0VXJsLCBSZXF1ZXN0VXJsUGFyYW0gfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGludGVyZmFjZSBCcmFpbk9iamVjdCB7XG5cdGlkOiBzdHJpbmc7XG5cdHR5cGU6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHRzdGF0dXM6IHN0cmluZztcblx0Y3JlYXRlZDogc3RyaW5nO1xuXHRtb2RpZmllZDogc3RyaW5nO1xuXHRwYXRoOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHRpbWVsaW5lOiBzdHJpbmc7XG5cdHJ1bGVzOiBzdHJpbmc7XG5cdHNvdXJjZV9zZXNzaW9uOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnJhaW5Db25uZWN0aW9uIHtcblx0cmVsYXRpb246IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHR0eXBlOiBzdHJpbmc7XG5cdHN0YXR1czogc3RyaW5nO1xuXHRpZDogc3RyaW5nO1xuXHRkaXJlY3Rpb246IFwib3V0Z29pbmdcIiB8IFwiaW5jb21pbmdcIjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUeXBlQ291bnQge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGNvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDeXBoZXJSZXNwb25zZSB7XG5cdGNvbHVtbnM6IHN0cmluZ1tdO1xuXHRyb3dzOiBhbnlbXVtdO1xuXHRlcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEJyYWluQ2xpZW50IHtcblx0cHJpdmF0ZSBlbmRwb2ludDogc3RyaW5nO1xuXHRwcml2YXRlIGFwaUtleTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKGVuZHBvaW50OiBzdHJpbmcsIGFwaUtleTogc3RyaW5nKSB7XG5cdFx0dGhpcy5lbmRwb2ludCA9IGVuZHBvaW50LnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG5cdFx0dGhpcy5hcGlLZXkgPSBhcGlLZXk7XG5cdH1cblxuXHR1cGRhdGVDb25maWcoZW5kcG9pbnQ6IHN0cmluZywgYXBpS2V5OiBzdHJpbmcpIHtcblx0XHR0aGlzLmVuZHBvaW50ID0gZW5kcG9pbnQucmVwbGFjZSgvXFwvKyQvLCBcIlwiKTtcblx0XHR0aGlzLmFwaUtleSA9IGFwaUtleTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3lwaGVyKHF1ZXJ5OiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgYW55PiA9IHt9KTogUHJvbWlzZTxDeXBoZXJSZXNwb25zZT4ge1xuXHRcdGNvbnN0IHJlcTogUmVxdWVzdFVybFBhcmFtID0ge1xuXHRcdFx0dXJsOiBgJHt0aGlzLmVuZHBvaW50fS9jeXBoZXJgLFxuXHRcdFx0bWV0aG9kOiBcIlBPU1RcIixcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG5cdFx0XHRcdFwiWC1BUEktS2V5XCI6IHRoaXMuYXBpS2V5LFxuXHRcdFx0fSxcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcXVlcnksIHBhcmFtcyB9KSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlcXVlc3RVcmwocmVxKTtcblx0XHRpZiAocmVzLmpzb24uZXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihyZXMuanNvbi5lcnJvcik7XG5cdFx0fVxuXHRcdHJldHVybiByZXMuanNvbjtcblx0fVxuXG5cdGFzeW5jIHRlc3RDb25uZWN0aW9uKCk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgbWVzc2FnZTogc3RyaW5nIH0+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVxOiBSZXF1ZXN0VXJsUGFyYW0gPSB7XG5cdFx0XHRcdHVybDogYCR7dGhpcy5lbmRwb2ludH0vaGVhbHRoYCxcblx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHJlcXVlc3RVcmwocmVxKTtcblx0XHRcdGlmIChyZXMuanNvbi5zdGF0dXMgPT09IFwib2tcIikge1xuXHRcdFx0XHRjb25zdCB0YWJsZXMgPSByZXMuanNvbi5ub2RlX3RhYmxlcz8ubGVuZ3RoIHx8IDA7XG5cdFx0XHRcdHJldHVybiB7IG9rOiB0cnVlLCBtZXNzYWdlOiBgQ29ubmVjdGVkIFx1MjAxNCAke3RhYmxlc30gbm9kZSB0YWJsZXNgIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIG1lc3NhZ2U6IFwiVW5leHBlY3RlZCByZXNwb25zZVwiIH07XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIG1lc3NhZ2U6IGUubWVzc2FnZSB8fCBcIkNvbm5lY3Rpb24gZmFpbGVkXCIgfTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRPYmplY3RDb3VudHMoKTogUHJvbWlzZTxUeXBlQ291bnRbXT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0XCJNQVRDSCAobzpPYmplY3QpIFJFVFVSTiBvLnR5cGUgQVMgdHlwZSwgQ09VTlQoKikgQVMgY250IE9SREVSIEJZIGNudCBERVNDXCJcblx0XHQpO1xuXHRcdHJldHVybiByZXMucm93cy5tYXAoKHIpID0+ICh7IHR5cGU6IHJbMF0sIGNvdW50OiByWzFdIH0pKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RPYmplY3RzKFxuXHRcdHR5cGU/OiBzdHJpbmcsXG5cdFx0c3RhdHVzPzogc3RyaW5nLFxuXHRcdGxpbWl0OiBudW1iZXIgPSAxMDBcblx0KTogUHJvbWlzZTxCcmFpbk9iamVjdFtdPiB7XG5cdFx0Y29uc3QgY29uZGl0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fTtcblxuXHRcdGlmICh0eXBlKSB7XG5cdFx0XHRjb25kaXRpb25zLnB1c2goXCJvLnR5cGUgPSAkdHlwZVwiKTtcblx0XHRcdHBhcmFtcy50eXBlID0gdHlwZTtcblx0XHR9XG5cdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0Y29uZGl0aW9ucy5wdXNoKFwiby5zdGF0dXMgPSAkc3RhdHVzXCIpO1xuXHRcdFx0cGFyYW1zLnN0YXR1cyA9IHN0YXR1cztcblx0XHR9XG5cblx0XHRjb25zdCB3aGVyZSA9IGNvbmRpdGlvbnMubGVuZ3RoID4gMCA/IGBXSEVSRSAke2NvbmRpdGlvbnMuam9pbihcIiBBTkQgXCIpfWAgOiBcIlwiO1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChvOk9iamVjdCkgJHt3aGVyZX0gUkVUVVJOIG8gT1JERVIgQlkgby5tb2RpZmllZCBERVNDIExJTUlUICR7bGltaXR9YCxcblx0XHRcdHBhcmFtc1xuXHRcdCk7XG5cdFx0cmV0dXJuIHJlcy5yb3dzLm1hcCgocikgPT4gdGhpcy5wYXJzZU9iamVjdChyWzBdKSk7XG5cdH1cblxuXHRhc3luYyBnZXRPYmplY3QobmFtZU9ySWQ6IHN0cmluZyk6IFByb21pc2U8QnJhaW5PYmplY3QgfCBudWxsPiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRcIk1BVENIIChvOk9iamVjdCkgV0hFUkUgby5pZCA9ICRrZXkgT1IgTE9XRVIoby5uYW1lKSA9IExPV0VSKCRrZXkpIFJFVFVSTiBvXCIsXG5cdFx0XHR7IGtleTogbmFtZU9ySWQgfVxuXHRcdCk7XG5cdFx0aWYgKHJlcy5yb3dzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VPYmplY3QocmVzLnJvd3NbMF1bMF0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29ubmVjdGlvbnMobmFtZU9ySWQ6IHN0cmluZyk6IFByb21pc2U8QnJhaW5Db25uZWN0aW9uW10+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uczogQnJhaW5Db25uZWN0aW9uW10gPSBbXTtcblxuXHRcdC8vIE91dGdvaW5nXG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKGE6T2JqZWN0KS1bYzpDb25uZWN0aW9uXS0+KGI6T2JqZWN0KVxuXHRcdFx0IFdIRVJFIGEuaWQgPSAka2V5IE9SIExPV0VSKGEubmFtZSkgPSBMT1dFUigka2V5KVxuXHRcdFx0IFJFVFVSTiBjLnJlbGF0aW9uLCBiLm5hbWUsIGIudHlwZSwgYi5zdGF0dXMsIGIuaWRgLFxuXHRcdFx0eyBrZXk6IG5hbWVPcklkIH1cblx0XHQpO1xuXHRcdGZvciAoY29uc3QgciBvZiBvdXQucm93cykge1xuXHRcdFx0Y29ubmVjdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJlbGF0aW9uOiByWzBdLFxuXHRcdFx0XHRuYW1lOiByWzFdLFxuXHRcdFx0XHR0eXBlOiByWzJdLFxuXHRcdFx0XHRzdGF0dXM6IHJbM10sXG5cdFx0XHRcdGlkOiByWzRdLFxuXHRcdFx0XHRkaXJlY3Rpb246IFwib3V0Z29pbmdcIixcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEluY29taW5nXG5cdFx0Y29uc3QgaW5jID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKGE6T2JqZWN0KS1bYzpDb25uZWN0aW9uXS0+KGI6T2JqZWN0KVxuXHRcdFx0IFdIRVJFIGIuaWQgPSAka2V5IE9SIExPV0VSKGIubmFtZSkgPSBMT1dFUigka2V5KVxuXHRcdFx0IFJFVFVSTiBjLnJlbGF0aW9uLCBhLm5hbWUsIGEudHlwZSwgYS5zdGF0dXMsIGEuaWRgLFxuXHRcdFx0eyBrZXk6IG5hbWVPcklkIH1cblx0XHQpO1xuXHRcdGZvciAoY29uc3QgciBvZiBpbmMucm93cykge1xuXHRcdFx0Y29ubmVjdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJlbGF0aW9uOiByWzBdLFxuXHRcdFx0XHRuYW1lOiByWzFdLFxuXHRcdFx0XHR0eXBlOiByWzJdLFxuXHRcdFx0XHRzdGF0dXM6IHJbM10sXG5cdFx0XHRcdGlkOiByWzRdLFxuXHRcdFx0XHRkaXJlY3Rpb246IFwiaW5jb21pbmdcIixcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb25uZWN0aW9ucztcblx0fVxuXG5cdGFzeW5jIHNlYXJjaE9iamVjdHMocXVlcnk6IHN0cmluZywgbGltaXQ6IG51bWJlciA9IDUwKTogUHJvbWlzZTxCcmFpbk9iamVjdFtdPiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKG86T2JqZWN0KVxuXHRcdFx0IFdIRVJFIExPV0VSKG8ubmFtZSkgQ09OVEFJTlMgTE9XRVIoJHEpIE9SIExPV0VSKG8uZGVzY3JpcHRpb24pIENPTlRBSU5TIExPV0VSKCRxKVxuXHRcdFx0IFJFVFVSTiBvIE9SREVSIEJZIG8ubW9kaWZpZWQgREVTQyBMSU1JVCAke2xpbWl0fWAsXG5cdFx0XHR7IHE6IHF1ZXJ5IH1cblx0XHQpO1xuXHRcdHJldHVybiByZXMucm93cy5tYXAoKHIpID0+IHRoaXMucGFyc2VPYmplY3QoclswXSkpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlU3RhdHVzKG9iamVjdElkOiBzdHJpbmcsIG5ld1N0YXR1czogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZXNjYXBlZCA9IHRoaXMuZXNjYXBlU3RyKG5ld1N0YXR1cyk7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKG86T2JqZWN0KSBXSEVSRSBvLmlkID0gJGlkIFNFVCBvLnN0YXR1cyA9ICR7ZXNjYXBlZH0gUkVUVVJOIG8ubmFtZWAsXG5cdFx0XHR7IGlkOiBvYmplY3RJZCB9XG5cdFx0KTtcblx0XHRyZXR1cm4gcmVzLnJvd3MubGVuZ3RoID4gMDtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZURlc2NyaXB0aW9uKG9iamVjdElkOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBlc2NhcGVkID0gdGhpcy5lc2NhcGVTdHIoZGVzY3JpcHRpb24pO1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChvOk9iamVjdCkgV0hFUkUgby5pZCA9ICRpZCBTRVQgby5kZXNjcmlwdGlvbiA9ICR7ZXNjYXBlZH0gUkVUVVJOIG8ubmFtZWAsXG5cdFx0XHR7IGlkOiBvYmplY3RJZCB9XG5cdFx0KTtcblx0XHRyZXR1cm4gcmVzLnJvd3MubGVuZ3RoID4gMDtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZU9iamVjdChvYmplY3RJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gRGVsZXRlIG91dGdvaW5nIGNvbm5lY3Rpb25zXG5cdFx0YXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKGE6T2JqZWN0KS1bYzpDb25uZWN0aW9uXS0+KGI6T2JqZWN0KSBXSEVSRSBhLmlkID0gJGlkIERFTEVURSBjYCxcblx0XHRcdHsgaWQ6IG9iamVjdElkIH1cblx0XHQpO1xuXHRcdC8vIERlbGV0ZSBpbmNvbWluZyBjb25uZWN0aW9uc1xuXHRcdGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChhOk9iamVjdCktW2M6Q29ubmVjdGlvbl0tPihiOk9iamVjdCkgV0hFUkUgYi5pZCA9ICRpZCBERUxFVEUgY2AsXG5cdFx0XHR7IGlkOiBvYmplY3RJZCB9XG5cdFx0KTtcblx0XHQvLyBEZWxldGUgdGhlIG9iamVjdFxuXHRcdGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChvOk9iamVjdCkgV0hFUkUgby5pZCA9ICRpZCBERUxFVEUgb2AsXG5cdFx0XHR7IGlkOiBvYmplY3RJZCB9XG5cdFx0KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUNvbm5lY3Rpb24oZnJvbUlkOiBzdHJpbmcsIHJlbGF0aW9uOiBzdHJpbmcsIHRvSWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGVzY2FwZWQgPSB0aGlzLmVzY2FwZVN0cihyZWxhdGlvbik7XG5cdFx0YXdhaXQgdGhpcy5jeXBoZXIoXG5cdFx0XHRgTUFUQ0ggKGE6T2JqZWN0KS1bYzpDb25uZWN0aW9uXS0+KGI6T2JqZWN0KVxuXHRcdFx0IFdIRVJFIGEuaWQgPSAkZnJvbUlkIEFORCBiLmlkID0gJHRvSWQgQU5EIGMucmVsYXRpb24gPSAke2VzY2FwZWR9XG5cdFx0XHQgREVMRVRFIGNgLFxuXHRcdFx0eyBmcm9tSWQsIHRvSWQgfVxuXHRcdCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGVzY2FwZVN0cih2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBlc2NhcGVkID0gdmFsdWUucmVwbGFjZSgvXFxcXC9nLCBcIlxcXFxcXFxcXCIpLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKS5yZXBsYWNlKC9cXG4vZywgXCJcXFxcblwiKTtcblx0XHRyZXR1cm4gYFwiJHtlc2NhcGVkfVwiYDtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VPYmplY3QocmF3OiBhbnkpOiBCcmFpbk9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiByYXcuaWQgfHwgXCJcIixcblx0XHRcdHR5cGU6IHJhdy50eXBlIHx8IFwiXCIsXG5cdFx0XHRuYW1lOiByYXcubmFtZSB8fCBcIlwiLFxuXHRcdFx0c3RhdHVzOiByYXcuc3RhdHVzIHx8IFwiXCIsXG5cdFx0XHRjcmVhdGVkOiByYXcuY3JlYXRlZCB8fCBcIlwiLFxuXHRcdFx0bW9kaWZpZWQ6IHJhdy5tb2RpZmllZCB8fCBcIlwiLFxuXHRcdFx0cGF0aDogcmF3LnBhdGggfHwgXCJcIixcblx0XHRcdGRlc2NyaXB0aW9uOiByYXcuZGVzY3JpcHRpb24gfHwgXCJcIixcblx0XHRcdHRpbWVsaW5lOiByYXcudGltZWxpbmUgfHwgXCJbXVwiLFxuXHRcdFx0cnVsZXM6IHJhdy5ydWxlcyB8fCBcIlwiLFxuXHRcdFx0c291cmNlX3Nlc3Npb246IHJhdy5zb3VyY2Vfc2Vzc2lvbiB8fCBcIlwiLFxuXHRcdH07XG5cdH1cbn1cbiIsICJpbXBvcnQgeyBJdGVtVmlldywgV29ya3NwYWNlTGVhZiwgc2V0SWNvbiwgZGVib3VuY2UgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB0eXBlIEx5cmFCcmFpblBsdWdpbiBmcm9tIFwiLi4vbWFpblwiO1xuaW1wb3J0IHR5cGUgeyBCcmFpbk9iamVjdCwgVHlwZUNvdW50IH0gZnJvbSBcIi4vQnJhaW5DbGllbnRcIjtcbmltcG9ydCB7IERFVEFJTF9WSUVXX1RZUEUgfSBmcm9tIFwiLi9PYmplY3REZXRhaWxWaWV3XCI7XG5cbmV4cG9ydCBjb25zdCBCUkFJTl9WSUVXX1RZUEUgPSBcImx5cmEtYnJhaW4tdmlld1wiO1xuXG5jb25zdCBTVEFUVVNfQ09MT1JTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRhY3RpdmU6IFwidmFyKC0tY29sb3ItZ3JlZW4pXCIsXG5cdGZyb3plbjogXCJ2YXIoLS1jb2xvci1ibHVlKVwiLFxuXHRkb25lOiBcInZhcigtLXRleHQtbXV0ZWQpXCIsXG5cdGJyb2tlbjogXCJ2YXIoLS1jb2xvci1yZWQpXCIsXG5cdHdhaXRpbmc6IFwidmFyKC0tY29sb3IteWVsbG93KVwiLFxuXHRpZGVhOiBcInZhcigtLWNvbG9yLXB1cnBsZSlcIixcblx0ZGVwcmVjYXRlZDogXCJ2YXIoLS10ZXh0LWZhaW50KVwiLFxufTtcblxuZXhwb3J0IGNsYXNzIEJyYWluVmlldyBleHRlbmRzIEl0ZW1WaWV3IHtcblx0cGx1Z2luOiBMeXJhQnJhaW5QbHVnaW47XG5cdHByaXZhdGUgc2VhcmNoSW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQ7XG5cdHByaXZhdGUgdHlwZUNoaXBzRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIG9iamVjdExpc3RFbDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc3RhdHVzQmFyRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlbGVjdGVkVHlwZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdHlwZUNvdW50czogVHlwZUNvdW50W10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcihsZWFmOiBXb3Jrc3BhY2VMZWFmLCBwbHVnaW46IEx5cmFCcmFpblBsdWdpbikge1xuXHRcdHN1cGVyKGxlYWYpO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0Z2V0Vmlld1R5cGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQlJBSU5fVklFV19UWVBFO1xuXHR9XG5cblx0Z2V0RGlzcGxheVRleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gXCJMeXJhIEJyYWluXCI7XG5cdH1cblxuXHRnZXRJY29uKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFwiYnJhaW5cIjtcblx0fVxuXG5cdGFzeW5jIG9uT3BlbigpIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lckVsLmNoaWxkcmVuWzFdIGFzIEhUTUxFbGVtZW50O1xuXHRcdGNvbnRhaW5lci5lbXB0eSgpO1xuXHRcdGNvbnRhaW5lci5hZGRDbGFzcyhcImx5cmEtYnJhaW4tY29udGFpbmVyXCIpO1xuXG5cdFx0Ly8gSGVhZGVyXG5cdFx0Y29uc3QgaGVhZGVyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWJyYWluLWhlYWRlclwiIH0pO1xuXHRcdGhlYWRlci5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBcIkx5cmEgQnJhaW5cIiwgY2xzOiBcImx5cmEtYnJhaW4tdGl0bGVcIiB9KTtcblxuXHRcdGNvbnN0IHJlZnJlc2hCdG4gPSBoZWFkZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibHlyYS1idG4taWNvblwiLCBhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIlJlZnJlc2hcIiB9IH0pO1xuXHRcdHNldEljb24ocmVmcmVzaEJ0biwgXCJyZWZyZXNoLWN3XCIpO1xuXHRcdHJlZnJlc2hCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMucmVmcmVzaCgpKTtcblxuXHRcdC8vIFNlYXJjaFxuXHRcdGNvbnN0IHNlYXJjaFdyYXAgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtc2VhcmNoLXdyYXBcIiB9KTtcblx0XHR0aGlzLnNlYXJjaElucHV0ID0gc2VhcmNoV3JhcC5jcmVhdGVFbChcImlucHV0XCIsIHtcblx0XHRcdHR5cGU6IFwidGV4dFwiLFxuXHRcdFx0cGxhY2Vob2xkZXI6IFwiU2VhcmNoIG9iamVjdHMuLi5cIixcblx0XHRcdGNsczogXCJseXJhLXNlYXJjaC1pbnB1dFwiLFxuXHRcdH0pO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcblx0XHRcdFwiaW5wdXRcIixcblx0XHRcdGRlYm91bmNlKCgpID0+IHRoaXMub25TZWFyY2goKSwgMzAwLCB0cnVlKVxuXHRcdCk7XG5cblx0XHQvLyBUeXBlIGNoaXBzXG5cdFx0dGhpcy50eXBlQ2hpcHNFbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS10eXBlLWNoaXBzXCIgfSk7XG5cblx0XHQvLyBPYmplY3QgbGlzdFxuXHRcdHRoaXMub2JqZWN0TGlzdEVsID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW9iamVjdC1saXN0XCIgfSk7XG5cblx0XHQvLyBTdGF0dXMgYmFyXG5cdFx0dGhpcy5zdGF0dXNCYXJFbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1zdGF0dXMtYmFyXCIgfSk7XG5cblx0XHRhd2FpdCB0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2goKSB7XG5cdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KFwiTG9hZGluZy4uLlwiKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy50eXBlQ291bnRzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50LmdldE9iamVjdENvdW50cygpO1xuXHRcdFx0dGhpcy5yZW5kZXJUeXBlQ2hpcHMoKTtcblx0XHRcdGF3YWl0IHRoaXMubG9hZE9iamVjdHMoKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHtcblx0XHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChgRXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuXHRcdFx0dGhpcy5vYmplY3RMaXN0RWwuZW1wdHkoKTtcblx0XHRcdHRoaXMub2JqZWN0TGlzdEVsLmNyZWF0ZUVsKFwiZGl2XCIsIHtcblx0XHRcdFx0dGV4dDogXCJDb3VsZCBub3QgY29ubmVjdCB0byBicmFpbi4gQ2hlY2sgc2V0dGluZ3MuXCIsXG5cdFx0XHRcdGNsczogXCJseXJhLWVtcHR5LXN0YXRlXCIsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclR5cGVDaGlwcygpIHtcblx0XHR0aGlzLnR5cGVDaGlwc0VsLmVtcHR5KCk7XG5cblx0XHQvLyBcIkFsbFwiIGNoaXBcblx0XHRjb25zdCBhbGxDb3VudCA9IHRoaXMudHlwZUNvdW50cy5yZWR1Y2UoKHMsIHQpID0+IHMgKyB0LmNvdW50LCAwKTtcblx0XHRjb25zdCBhbGxDaGlwID0gdGhpcy50eXBlQ2hpcHNFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHR0ZXh0OiBgYWxsICgke2FsbENvdW50fSlgLFxuXHRcdFx0Y2xzOiBgbHlyYS1jaGlwICR7dGhpcy5zZWxlY3RlZFR5cGUgPT09IG51bGwgPyBcImx5cmEtY2hpcC1hY3RpdmVcIiA6IFwiXCJ9YCxcblx0XHR9KTtcblx0XHRhbGxDaGlwLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkVHlwZSA9IG51bGw7XG5cdFx0XHR0aGlzLnJlbmRlclR5cGVDaGlwcygpO1xuXHRcdFx0dGhpcy5sb2FkT2JqZWN0cygpO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCB0YyBvZiB0aGlzLnR5cGVDb3VudHMpIHtcblx0XHRcdGNvbnN0IGNoaXAgPSB0aGlzLnR5cGVDaGlwc0VsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdFx0dGV4dDogYCR7dGMudHlwZX0gKCR7dGMuY291bnR9KWAsXG5cdFx0XHRcdGNsczogYGx5cmEtY2hpcCAke3RoaXMuc2VsZWN0ZWRUeXBlID09PSB0Yy50eXBlID8gXCJseXJhLWNoaXAtYWN0aXZlXCIgOiBcIlwifWAsXG5cdFx0XHR9KTtcblx0XHRcdGNoaXAuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcblx0XHRcdFx0dGhpcy5zZWxlY3RlZFR5cGUgPSB0Yy50eXBlO1xuXHRcdFx0XHR0aGlzLnJlbmRlclR5cGVDaGlwcygpO1xuXHRcdFx0XHR0aGlzLmxvYWRPYmplY3RzKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRPYmplY3RzKCkge1xuXHRcdHRoaXMub2JqZWN0TGlzdEVsLmVtcHR5KCk7XG5cdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KFwiTG9hZGluZy4uLlwiKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvYmplY3RzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50Lmxpc3RPYmplY3RzKFxuXHRcdFx0XHR0aGlzLnNlbGVjdGVkVHlwZSB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0MjAwXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5yZW5kZXJPYmplY3RzKG9iamVjdHMpO1xuXHRcdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KGAke29iamVjdHMubGVuZ3RofSBvYmplY3RzYCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoYEVycm9yOiAke2UubWVzc2FnZX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uU2VhcmNoKCkge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hJbnB1dC52YWx1ZS50cmltKCk7XG5cdFx0aWYgKCFxdWVyeSkge1xuXHRcdFx0YXdhaXQgdGhpcy5sb2FkT2JqZWN0cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMub2JqZWN0TGlzdEVsLmVtcHR5KCk7XG5cdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KFwiU2VhcmNoaW5nLi4uXCIpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQuc2VhcmNoT2JqZWN0cyhxdWVyeSk7XG5cdFx0XHR0aGlzLnJlbmRlck9iamVjdHMocmVzdWx0cyk7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoYCR7cmVzdWx0cy5sZW5ndGh9IHJlc3VsdHMgZm9yIFwiJHtxdWVyeX1cImApO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KGBTZWFyY2ggZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyT2JqZWN0cyhvYmplY3RzOiBCcmFpbk9iamVjdFtdKSB7XG5cdFx0dGhpcy5vYmplY3RMaXN0RWwuZW1wdHkoKTtcblxuXHRcdGlmIChvYmplY3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5vYmplY3RMaXN0RWwuY3JlYXRlRWwoXCJkaXZcIiwge1xuXHRcdFx0XHR0ZXh0OiBcIk5vIG9iamVjdHMgZm91bmRcIixcblx0XHRcdFx0Y2xzOiBcImx5cmEtZW1wdHktc3RhdGVcIixcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgb2JqIG9mIG9iamVjdHMpIHtcblx0XHRcdGNvbnN0IHJvdyA9IHRoaXMub2JqZWN0TGlzdEVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW9iamVjdC1yb3dcIiB9KTtcblx0XHRcdHJvdy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5vcGVuT2JqZWN0KG9iaikpO1xuXG5cdFx0XHRjb25zdCBuYW1lRWwgPSByb3cuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtb2JqZWN0LW5hbWVcIiB9KTtcblx0XHRcdG5hbWVFbC5zZXRUZXh0KG9iai5uYW1lKTtcblxuXHRcdFx0Y29uc3QgbWV0YUVsID0gcm93LmNyZWF0ZURpdih7IGNsczogXCJseXJhLW9iamVjdC1tZXRhXCIgfSk7XG5cblx0XHRcdGNvbnN0IHR5cGVUYWcgPSBtZXRhRWwuY3JlYXRlRWwoXCJzcGFuXCIsIHtcblx0XHRcdFx0dGV4dDogb2JqLnR5cGUsXG5cdFx0XHRcdGNsczogXCJseXJhLXRhZyBseXJhLXRhZy10eXBlXCIsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3RhdHVzVGFnID0gbWV0YUVsLmNyZWF0ZUVsKFwic3BhblwiLCB7XG5cdFx0XHRcdHRleHQ6IG9iai5zdGF0dXMsXG5cdFx0XHRcdGNsczogYGx5cmEtdGFnIGx5cmEtdGFnLXN0YXR1c2AsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbG9yID0gU1RBVFVTX0NPTE9SU1tvYmouc3RhdHVzXSB8fCBcInZhcigtLXRleHQtbXV0ZWQpXCI7XG5cdFx0XHRzdGF0dXNUYWcuc3R5bGUuc2V0UHJvcGVydHkoXCItLXN0YXR1cy1jb2xvclwiLCBjb2xvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuT2JqZWN0KG9iajogQnJhaW5PYmplY3QpIHtcblx0XHRjb25zdCBsZWF2ZXMgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKERFVEFJTF9WSUVXX1RZUEUpO1xuXHRcdGxldCBsZWFmOiBXb3Jrc3BhY2VMZWFmO1xuXG5cdFx0aWYgKGxlYXZlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZWFmID0gbGVhdmVzWzBdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoXCJ0YWJcIik7XG5cdFx0fVxuXG5cdFx0YXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoe1xuXHRcdFx0dHlwZTogREVUQUlMX1ZJRVdfVFlQRSxcblx0XHRcdHN0YXRlOiB7IG9iamVjdElkOiBvYmouaWQgfSxcblx0XHR9KTtcblx0XHR0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcblx0fVxuXG5cdGFzeW5jIG9uQ2xvc2UoKSB7XG5cdFx0Ly8gY2xlYW51cFxuXHR9XG59XG4iLCAiaW1wb3J0IHsgSXRlbVZpZXcsIFdvcmtzcGFjZUxlYWYsIHNldEljb24sIE1vZGFsLCBBcHAsIFNldHRpbmcgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB0eXBlIEx5cmFCcmFpblBsdWdpbiBmcm9tIFwiLi4vbWFpblwiO1xuaW1wb3J0IHR5cGUgeyBCcmFpbk9iamVjdCwgQnJhaW5Db25uZWN0aW9uIH0gZnJvbSBcIi4vQnJhaW5DbGllbnRcIjtcblxuZXhwb3J0IGNvbnN0IERFVEFJTF9WSUVXX1RZUEUgPSBcImx5cmEtYnJhaW4tZGV0YWlsXCI7XG5cbmNvbnN0IEFMTF9TVEFUVVNFUyA9IFtcImFjdGl2ZVwiLCBcImZyb3plblwiLCBcImRvbmVcIiwgXCJicm9rZW5cIiwgXCJ3YWl0aW5nXCIsIFwiaWRlYVwiLCBcImRlcHJlY2F0ZWRcIl07XG5cbmludGVyZmFjZSBUaW1lbGluZUVudHJ5IHtcblx0dHM6IHN0cmluZztcblx0ZXZlbnQ6IHN0cmluZztcbn1cblxuY29uc3QgU1RBVFVTX0VNT0pJOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRhY3RpdmU6IFwiXHUyNUNGXCIsXG5cdGZyb3plbjogXCJcdTI1QzZcIixcblx0ZG9uZTogXCJcdTI3MTNcIixcblx0YnJva2VuOiBcIlx1MjcxN1wiLFxuXHR3YWl0aW5nOiBcIlx1MjVDQ1wiLFxuXHRpZGVhOiBcIlx1MjVDN1wiLFxuXHRkZXByZWNhdGVkOiBcIlx1MjVDQlwiLFxufTtcblxuLy8gLS0tLSBDb25maXJtYXRpb24gTW9kYWwgLS0tLVxuY2xhc3MgQ29uZmlybURlbGV0ZU1vZGFsIGV4dGVuZHMgTW9kYWwge1xuXHRwcml2YXRlIG9iamVjdE5hbWU6IHN0cmluZztcblx0cHJpdmF0ZSBvbkNvbmZpcm06ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIG9iamVjdE5hbWU6IHN0cmluZywgb25Db25maXJtOiAoKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoYXBwKTtcblx0XHR0aGlzLm9iamVjdE5hbWUgPSBvYmplY3ROYW1lO1xuXHRcdHRoaXMub25Db25maXJtID0gb25Db25maXJtO1xuXHR9XG5cblx0b25PcGVuKCkge1xuXHRcdGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuXHRcdGNvbnRlbnRFbC5jcmVhdGVFbChcImgzXCIsIHsgdGV4dDogXCJEZWxldGUgT2JqZWN0XCIgfSk7XG5cdFx0Y29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7XG5cdFx0XHR0ZXh0OiBgQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBcIiR7dGhpcy5vYmplY3ROYW1lfVwiPyBUaGlzIHdpbGwgYWxzbyByZW1vdmUgYWxsIGl0cyBjb25uZWN0aW9ucy4gVGhpcyBjYW5ub3QgYmUgdW5kb25lLmAsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBidG5Sb3cgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtbW9kYWwtYnV0dG9uc1wiIH0pO1xuXG5cdFx0Y29uc3QgY2FuY2VsQnRuID0gYnRuUm93LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJDYW5jZWxcIiB9KTtcblx0XHRjYW5jZWxCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuY2xvc2UoKSk7XG5cblx0XHRjb25zdCBkZWxldGVCdG4gPSBidG5Sb3cuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0dGV4dDogXCJEZWxldGVcIixcblx0XHRcdGNsczogXCJseXJhLWJ0bi1kYW5nZXJcIixcblx0XHR9KTtcblx0XHRkZWxldGVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcblx0XHRcdHRoaXMub25Db25maXJtKCk7XG5cdFx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRvbkNsb3NlKCkge1xuXHRcdHRoaXMuY29udGVudEVsLmVtcHR5KCk7XG5cdH1cbn1cblxuLy8gLS0tLSBFZGl0IERlc2NyaXB0aW9uIE1vZGFsIC0tLS1cbmNsYXNzIEVkaXREZXNjcmlwdGlvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xuXHRwcml2YXRlIGN1cnJlbnREZXNjOiBzdHJpbmc7XG5cdHByaXZhdGUgb25TYXZlOiAoZGVzYzogc3RyaW5nKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBjdXJyZW50RGVzYzogc3RyaW5nLCBvblNhdmU6IChkZXNjOiBzdHJpbmcpID0+IHZvaWQpIHtcblx0XHRzdXBlcihhcHApO1xuXHRcdHRoaXMuY3VycmVudERlc2MgPSBjdXJyZW50RGVzYztcblx0XHR0aGlzLm9uU2F2ZSA9IG9uU2F2ZTtcblx0fVxuXG5cdG9uT3BlbigpIHtcblx0XHRjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiRWRpdCBEZXNjcmlwdGlvblwiIH0pO1xuXG5cdFx0Y29uc3QgdGV4dGFyZWEgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJ0ZXh0YXJlYVwiLCB7XG5cdFx0XHRjbHM6IFwibHlyYS1lZGl0LXRleHRhcmVhXCIsXG5cdFx0fSk7XG5cdFx0dGV4dGFyZWEudmFsdWUgPSB0aGlzLmN1cnJlbnREZXNjO1xuXHRcdHRleHRhcmVhLnJvd3MgPSA4O1xuXG5cdFx0Y29uc3QgYnRuUm93ID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW1vZGFsLWJ1dHRvbnNcIiB9KTtcblxuXHRcdGNvbnN0IGNhbmNlbEJ0biA9IGJ0blJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ2FuY2VsXCIgfSk7XG5cdFx0Y2FuY2VsQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmNsb3NlKCkpO1xuXG5cdFx0Y29uc3Qgc2F2ZUJ0biA9IGJ0blJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHR0ZXh0OiBcIlNhdmVcIixcblx0XHRcdGNsczogXCJseXJhLWJ0bi1wcmltYXJ5XCIsXG5cdFx0fSk7XG5cdFx0c2F2ZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5vblNhdmUodGV4dGFyZWEudmFsdWUpO1xuXHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0b25DbG9zZSgpIHtcblx0XHR0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gQ29uZmlybSBEZWxldGUgQ29ubmVjdGlvbiBNb2RhbCAtLS0tXG5jbGFzcyBDb25maXJtRGVsZXRlQ29ubmVjdGlvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xuXHRwcml2YXRlIGNvbm5OYW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVsYXRpb246IHN0cmluZztcblx0cHJpdmF0ZSBvbkNvbmZpcm06ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIGNvbm5OYW1lOiBzdHJpbmcsIHJlbGF0aW9uOiBzdHJpbmcsIG9uQ29uZmlybTogKCkgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGFwcCk7XG5cdFx0dGhpcy5jb25uTmFtZSA9IGNvbm5OYW1lO1xuXHRcdHRoaXMucmVsYXRpb24gPSByZWxhdGlvbjtcblx0XHR0aGlzLm9uQ29uZmlybSA9IG9uQ29uZmlybTtcblx0fVxuXG5cdG9uT3BlbigpIHtcblx0XHRjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiRGVsZXRlIENvbm5lY3Rpb25cIiB9KTtcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHtcblx0XHRcdHRleHQ6IGBSZW1vdmUgXCIke3RoaXMucmVsYXRpb259XCIgY29ubmVjdGlvbiB0byBcIiR7dGhpcy5jb25uTmFtZX1cIj9gLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYnRuUm93ID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW1vZGFsLWJ1dHRvbnNcIiB9KTtcblxuXHRcdGNvbnN0IGNhbmNlbEJ0biA9IGJ0blJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ2FuY2VsXCIgfSk7XG5cdFx0Y2FuY2VsQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmNsb3NlKCkpO1xuXG5cdFx0Y29uc3QgZGVsZXRlQnRuID0gYnRuUm93LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdHRleHQ6IFwiRGVsZXRlXCIsXG5cdFx0XHRjbHM6IFwibHlyYS1idG4tZGFuZ2VyXCIsXG5cdFx0fSk7XG5cdFx0ZGVsZXRlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG5cdFx0XHR0aGlzLm9uQ29uZmlybSgpO1xuXHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0b25DbG9zZSgpIHtcblx0XHR0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIE9iamVjdERldGFpbFZpZXcgZXh0ZW5kcyBJdGVtVmlldyB7XG5cdHBsdWdpbjogTHlyYUJyYWluUGx1Z2luO1xuXHRwcml2YXRlIG9iamVjdElkOiBzdHJpbmcgPSBcIlwiO1xuXHRwcml2YXRlIG9iamVjdDogQnJhaW5PYmplY3QgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihsZWFmOiBXb3Jrc3BhY2VMZWFmLCBwbHVnaW46IEx5cmFCcmFpblBsdWdpbikge1xuXHRcdHN1cGVyKGxlYWYpO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuXHR9XG5cblx0Z2V0Vmlld1R5cGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gREVUQUlMX1ZJRVdfVFlQRTtcblx0fVxuXG5cdGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMub2JqZWN0Py5uYW1lIHx8IFwiT2JqZWN0IERldGFpbFwiO1xuXHR9XG5cblx0Z2V0SWNvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiBcImZpbGUtdGV4dFwiO1xuXHR9XG5cblx0Z2V0U3RhdGUoKSB7XG5cdFx0cmV0dXJuIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQgfTtcblx0fVxuXG5cdGFzeW5jIHNldFN0YXRlKHN0YXRlOiBhbnksIHJlc3VsdDogYW55KSB7XG5cdFx0aWYgKHN0YXRlLm9iamVjdElkKSB7XG5cdFx0XHR0aGlzLm9iamVjdElkID0gc3RhdGUub2JqZWN0SWQ7XG5cdFx0XHRhd2FpdCB0aGlzLmxvYWRBbmRSZW5kZXIoKTtcblx0XHR9XG5cdFx0YXdhaXQgc3VwZXIuc2V0U3RhdGUoc3RhdGUsIHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyBsb2FkQW5kUmVuZGVyKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY29udGFpbmVyRWwuY2hpbGRyZW5bMV0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0Y29udGFpbmVyLmVtcHR5KCk7XG5cdFx0Y29udGFpbmVyLmFkZENsYXNzKFwibHlyYS1kZXRhaWwtY29udGFpbmVyXCIpO1xuXG5cdFx0aWYgKCF0aGlzLm9iamVjdElkKSB7XG5cdFx0XHRjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyB0ZXh0OiBcIk5vIG9iamVjdCBzZWxlY3RlZFwiLCBjbHM6IFwibHlyYS1lbXB0eS1zdGF0ZVwiIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IHRleHQ6IFwiTG9hZGluZy4uLlwiLCBjbHM6IFwibHlyYS1sb2FkaW5nXCIgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgW29iaiwgY29ubmVjdGlvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLnBsdWdpbi5jbGllbnQuZ2V0T2JqZWN0KHRoaXMub2JqZWN0SWQpLFxuXHRcdFx0XHR0aGlzLnBsdWdpbi5jbGllbnQuZ2V0Q29ubmVjdGlvbnModGhpcy5vYmplY3RJZCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29udGFpbmVyLmVtcHR5KCk7XG5cblx0XHRcdGlmICghb2JqKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IHRleHQ6IFwiT2JqZWN0IG5vdCBmb3VuZFwiLCBjbHM6IFwibHlyYS1lbXB0eS1zdGF0ZVwiIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub2JqZWN0ID0gb2JqO1xuXHRcdFx0dGhpcy5sZWFmLnVwZGF0ZUhlYWRlcigpO1xuXHRcdFx0dGhpcy5yZW5kZXJPYmplY3QoY29udGFpbmVyLCBvYmosIGNvbm5lY3Rpb25zKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHtcblx0XHRcdGNvbnRhaW5lci5lbXB0eSgpO1xuXHRcdFx0Y29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgdGV4dDogYEVycm9yOiAke2UubWVzc2FnZX1gLCBjbHM6IFwibHlyYS1lbXB0eS1zdGF0ZVwiIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyT2JqZWN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9iajogQnJhaW5PYmplY3QsIGNvbm5lY3Rpb25zOiBCcmFpbkNvbm5lY3Rpb25bXSkge1xuXHRcdC8vIEhlYWRlciBzZWN0aW9uXG5cdFx0Y29uc3QgaGVhZGVyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1oZWFkZXJcIiB9KTtcblxuXHRcdGNvbnN0IHRpdGxlUm93ID0gaGVhZGVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC10aXRsZS1yb3dcIiB9KTtcblx0XHR0aXRsZVJvdy5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogb2JqLm5hbWUsIGNsczogXCJseXJhLWRldGFpbC1uYW1lXCIgfSk7XG5cblx0XHQvLyBBY3Rpb24gYnV0dG9uc1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aXRsZVJvdy5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtYWN0aW9uc1wiIH0pO1xuXG5cdFx0Y29uc3QgZGVsZXRlQnRuID0gYWN0aW9ucy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHRjbHM6IFwibHlyYS1idG4taWNvbiBseXJhLWJ0bi1kZWxldGVcIixcblx0XHRcdGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiRGVsZXRlIG9iamVjdFwiIH0sXG5cdFx0fSk7XG5cdFx0c2V0SWNvbihkZWxldGVCdG4sIFwidHJhc2gtMlwiKTtcblx0XHRkZWxldGVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuY29uZmlybURlbGV0ZShvYmopKTtcblxuXHRcdGNvbnN0IGJhZGdlcyA9IGhlYWRlci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtYmFkZ2VzXCIgfSk7XG5cdFx0YmFkZ2VzLmNyZWF0ZUVsKFwic3BhblwiLCB7IHRleHQ6IG9iai50eXBlLCBjbHM6IFwibHlyYS10YWcgbHlyYS10YWctdHlwZVwiIH0pO1xuXG5cdFx0Ly8gU3RhdHVzIGFzIGEgZHJvcGRvd25cblx0XHRjb25zdCBzdGF0dXNTZWxlY3QgPSBiYWRnZXMuY3JlYXRlRWwoXCJzZWxlY3RcIiwgeyBjbHM6IFwibHlyYS1zdGF0dXMtc2VsZWN0XCIgfSk7XG5cdFx0c3RhdHVzU2VsZWN0LmRhdGFzZXQuc3RhdHVzID0gb2JqLnN0YXR1cztcblx0XHRmb3IgKGNvbnN0IHMgb2YgQUxMX1NUQVRVU0VTKSB7XG5cdFx0XHRjb25zdCBvcHQgPSBzdGF0dXNTZWxlY3QuY3JlYXRlRWwoXCJvcHRpb25cIiwge1xuXHRcdFx0XHR0ZXh0OiBgJHtTVEFUVVNfRU1PSklbc10gfHwgXCJcdTI1Q0ZcIn0gJHtzfWAsXG5cdFx0XHRcdHZhbHVlOiBzLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocyA9PT0gb2JqLnN0YXR1cykgb3B0LnNlbGVjdGVkID0gdHJ1ZTtcblx0XHR9XG5cdFx0c3RhdHVzU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3U3RhdHVzID0gc3RhdHVzU2VsZWN0LnZhbHVlO1xuXHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50LnVwZGF0ZVN0YXR1cyhvYmouaWQsIG5ld1N0YXR1cyk7XG5cdFx0XHRhd2FpdCB0aGlzLmxvYWRBbmRSZW5kZXIoKTtcblx0XHR9KTtcblxuXHRcdC8vIERlc2NyaXB0aW9uICh3aXRoIGVkaXQgYnV0dG9uKVxuXHRcdGNvbnN0IGRlc2NTZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0Y29uc3QgZGVzY0hlYWRlciA9IGRlc2NTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXNlY3Rpb24taGVhZGVyXCIgfSk7XG5cdFx0ZGVzY0hlYWRlci5jcmVhdGVFbChcImg0XCIsIHsgdGV4dDogXCJEZXNjcmlwdGlvblwiIH0pO1xuXHRcdGNvbnN0IGVkaXREZXNjQnRuID0gZGVzY0hlYWRlci5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHRjbHM6IFwibHlyYS1idG4taWNvbiBseXJhLWJ0bi1lZGl0XCIsXG5cdFx0XHRhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIkVkaXQgZGVzY3JpcHRpb25cIiB9LFxuXHRcdH0pO1xuXHRcdHNldEljb24oZWRpdERlc2NCdG4sIFwicGVuY2lsXCIpO1xuXHRcdGVkaXREZXNjQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmVkaXREZXNjcmlwdGlvbihvYmopKTtcblxuXHRcdGlmIChvYmouZGVzY3JpcHRpb24pIHtcblx0XHRcdGRlc2NTZWN0aW9uLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IG9iai5kZXNjcmlwdGlvbiwgY2xzOiBcImx5cmEtZGV0YWlsLWRlc2NcIiB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVzY1NlY3Rpb24uY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogXCJObyBkZXNjcmlwdGlvblwiLCBjbHM6IFwibHlyYS1kZXRhaWwtZGVzYyBseXJhLXRleHQtZmFpbnRcIiB9KTtcblx0XHR9XG5cblx0XHQvLyBNZXRhZGF0YVxuXHRcdGNvbnN0IG1ldGFTZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0bWV0YVNlY3Rpb24uY3JlYXRlRWwoXCJoNFwiLCB7IHRleHQ6IFwiRGV0YWlsc1wiIH0pO1xuXHRcdGNvbnN0IG1ldGFHcmlkID0gbWV0YVNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLWdyaWRcIiB9KTtcblxuXHRcdHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJJRFwiLCBvYmouaWQpO1xuXHRcdHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJDcmVhdGVkXCIsIHRoaXMuZm9ybWF0RGF0ZShvYmouY3JlYXRlZCkpO1xuXHRcdHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJNb2RpZmllZFwiLCB0aGlzLmZvcm1hdERhdGUob2JqLm1vZGlmaWVkKSk7XG5cdFx0aWYgKG9iai5wYXRoKSB0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiUGF0aFwiLCBvYmoucGF0aCk7XG5cdFx0aWYgKG9iai5zb3VyY2Vfc2Vzc2lvbikgdGhpcy5hZGRNZXRhUm93KG1ldGFHcmlkLCBcIlNvdXJjZVwiLCBvYmouc291cmNlX3Nlc3Npb24pO1xuXHRcdGlmIChvYmoucnVsZXMpIHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJSdWxlc1wiLCBvYmoucnVsZXMpO1xuXG5cdFx0Ly8gQ29ubmVjdGlvbnNcblx0XHRpZiAoY29ubmVjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgY29ublNlY3Rpb24gPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLXNlY3Rpb25cIiB9KTtcblx0XHRcdGNvbm5TZWN0aW9uLmNyZWF0ZUVsKFwiaDRcIiwgeyB0ZXh0OiBgQ29ubmVjdGlvbnMgKCR7Y29ubmVjdGlvbnMubGVuZ3RofSlgIH0pO1xuXG5cdFx0XHRjb25zdCBvdXRnb2luZyA9IGNvbm5lY3Rpb25zLmZpbHRlcigoYykgPT4gYy5kaXJlY3Rpb24gPT09IFwib3V0Z29pbmdcIik7XG5cdFx0XHRjb25zdCBpbmNvbWluZyA9IGNvbm5lY3Rpb25zLmZpbHRlcigoYykgPT4gYy5kaXJlY3Rpb24gPT09IFwiaW5jb21pbmdcIik7XG5cblx0XHRcdGlmIChvdXRnb2luZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IG91dEdyb3VwID0gY29ublNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtY29ubi1ncm91cFwiIH0pO1xuXHRcdFx0XHRvdXRHcm91cC5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBcIk91dGdvaW5nIFx1MjE5MlwiLCBjbHM6IFwibHlyYS1jb25uLWRpcmVjdGlvblwiIH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbm4gb2Ygb3V0Z29pbmcpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlckNvbm5lY3Rpb24ob3V0R3JvdXAsIGNvbm4sIG9iaik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGluY29taW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgaW5Hcm91cCA9IGNvbm5TZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWNvbm4tZ3JvdXBcIiB9KTtcblx0XHRcdFx0aW5Hcm91cC5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBcIlx1MjE5MCBJbmNvbWluZ1wiLCBjbHM6IFwibHlyYS1jb25uLWRpcmVjdGlvblwiIH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbm4gb2YgaW5jb21pbmcpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlckNvbm5lY3Rpb24oaW5Hcm91cCwgY29ubiwgb2JqKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRpbWVsaW5lXG5cdFx0Y29uc3QgdGltZWxpbmUgPSB0aGlzLnBhcnNlVGltZWxpbmUob2JqLnRpbWVsaW5lKTtcblx0XHRpZiAodGltZWxpbmUubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgdGxTZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0XHR0bFNlY3Rpb24uY3JlYXRlRWwoXCJoNFwiLCB7IHRleHQ6IGBUaW1lbGluZSAoJHt0aW1lbGluZS5sZW5ndGh9KWAgfSk7XG5cdFx0XHRjb25zdCB0bExpc3QgPSB0bFNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtdGltZWxpbmVcIiB9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aW1lbGluZS5yZXZlcnNlKCkpIHtcblx0XHRcdFx0Y29uc3Qgcm93ID0gdGxMaXN0LmNyZWF0ZURpdih7IGNsczogXCJseXJhLXRpbWVsaW5lLWVudHJ5XCIgfSk7XG5cdFx0XHRcdHJvdy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiB0aGlzLmZvcm1hdERhdGUoZW50cnkudHMpLCBjbHM6IFwibHlyYS10bC1kYXRlXCIgfSk7XG5cdFx0XHRcdHJvdy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBlbnRyeS5ldmVudCwgY2xzOiBcImx5cmEtdGwtZXZlbnRcIiB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbm5lY3Rpb24ocGFyZW50OiBIVE1MRWxlbWVudCwgY29ubjogQnJhaW5Db25uZWN0aW9uLCBjdXJyZW50T2JqOiBCcmFpbk9iamVjdCkge1xuXHRcdGNvbnN0IHJvdyA9IHBhcmVudC5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1jb25uLXJvd1wiIH0pO1xuXG5cdFx0Y29uc3QgcmVsYXRpb24gPSByb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHtcblx0XHRcdHRleHQ6IGNvbm4ucmVsYXRpb24ucmVwbGFjZSgvXy9nLCBcIiBcIiksXG5cdFx0XHRjbHM6IFwibHlyYS1jb25uLXJlbGF0aW9uXCIsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBsaW5rID0gcm93LmNyZWF0ZUVsKFwiYVwiLCB7XG5cdFx0XHR0ZXh0OiBjb25uLm5hbWUsXG5cdFx0XHRjbHM6IFwibHlyYS1jb25uLWxpbmtcIixcblx0XHRcdGhyZWY6IFwiI1wiLFxuXHRcdH0pO1xuXHRcdGxpbmsuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRhd2FpdCB0aGlzLm5hdmlnYXRlVG8oY29ubi5pZCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBtZXRhID0gcm93LmNyZWF0ZUVsKFwic3BhblwiLCB7XG5cdFx0XHR0ZXh0OiBgJHtjb25uLnR5cGV9IFx1MDBCNyAke2Nvbm4uc3RhdHVzfWAsXG5cdFx0XHRjbHM6IFwibHlyYS1jb25uLW1ldGFcIixcblx0XHR9KTtcblxuXHRcdC8vIERlbGV0ZSBjb25uZWN0aW9uIGJ1dHRvblxuXHRcdGNvbnN0IGRlbEJ0biA9IHJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHRjbHM6IFwibHlyYS1idG4taWNvbiBseXJhLWJ0bi1jb25uLWRlbGV0ZVwiLFxuXHRcdFx0YXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJEZWxldGUgY29ubmVjdGlvblwiIH0sXG5cdFx0fSk7XG5cdFx0c2V0SWNvbihkZWxCdG4sIFwieFwiKTtcblx0XHRkZWxCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y29uc3QgZnJvbUlkID0gY29ubi5kaXJlY3Rpb24gPT09IFwib3V0Z29pbmdcIiA/IGN1cnJlbnRPYmouaWQgOiBjb25uLmlkO1xuXHRcdFx0Y29uc3QgdG9JZCA9IGNvbm4uZGlyZWN0aW9uID09PSBcIm91dGdvaW5nXCIgPyBjb25uLmlkIDogY3VycmVudE9iai5pZDtcblx0XHRcdG5ldyBDb25maXJtRGVsZXRlQ29ubmVjdGlvbk1vZGFsKFxuXHRcdFx0XHR0aGlzLmFwcCxcblx0XHRcdFx0Y29ubi5uYW1lLFxuXHRcdFx0XHRjb25uLnJlbGF0aW9uLFxuXHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50LmRlbGV0ZUNvbm5lY3Rpb24oZnJvbUlkLCBjb25uLnJlbGF0aW9uLCB0b0lkKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmxvYWRBbmRSZW5kZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0KS5vcGVuKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbmZpcm1EZWxldGUob2JqOiBCcmFpbk9iamVjdCkge1xuXHRcdG5ldyBDb25maXJtRGVsZXRlTW9kYWwodGhpcy5hcHAsIG9iai5uYW1lLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQuZGVsZXRlT2JqZWN0KG9iai5pZCk7XG5cdFx0XHQvLyBHbyBiYWNrIFx1MjAxNCBjbG9zZSB0aGlzIGxlYWZcblx0XHRcdHRoaXMubGVhZi5kZXRhY2goKTtcblx0XHR9KS5vcGVuKCk7XG5cdH1cblxuXHRwcml2YXRlIGVkaXREZXNjcmlwdGlvbihvYmo6IEJyYWluT2JqZWN0KSB7XG5cdFx0bmV3IEVkaXREZXNjcmlwdGlvbk1vZGFsKHRoaXMuYXBwLCBvYmouZGVzY3JpcHRpb24sIGFzeW5jIChuZXdEZXNjKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQudXBkYXRlRGVzY3JpcHRpb24ob2JqLmlkLCBuZXdEZXNjKTtcblx0XHRcdGF3YWl0IHRoaXMubG9hZEFuZFJlbmRlcigpO1xuXHRcdH0pLm9wZW4oKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbmF2aWdhdGVUbyhvYmplY3RJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5vYmplY3RJZCA9IG9iamVjdElkO1xuXHRcdGF3YWl0IHRoaXMubG9hZEFuZFJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRNZXRhUm93KHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcblx0XHRjb25zdCByb3cgPSBwYXJlbnQuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtbWV0YS1yb3dcIiB9KTtcblx0XHRyb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogbGFiZWwsIGNsczogXCJseXJhLW1ldGEtbGFiZWxcIiB9KTtcblx0XHRyb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogdmFsdWUsIGNsczogXCJseXJhLW1ldGEtdmFsdWVcIiB9KTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0RGF0ZShkYXRlU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICghZGF0ZVN0cikgcmV0dXJuIFwiXHUyMDE0XCI7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGQgPSBuZXcgRGF0ZShkYXRlU3RyKTtcblx0XHRcdHJldHVybiBkLnRvTG9jYWxlRGF0ZVN0cmluZyhcImVuLUdCXCIsIHtcblx0XHRcdFx0ZGF5OiBcIjItZGlnaXRcIixcblx0XHRcdFx0bW9udGg6IFwic2hvcnRcIixcblx0XHRcdFx0eWVhcjogXCJudW1lcmljXCIsXG5cdFx0XHRcdGhvdXI6IFwiMi1kaWdpdFwiLFxuXHRcdFx0XHRtaW51dGU6IFwiMi1kaWdpdFwiLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZGF0ZVN0cjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlVGltZWxpbmUodGltZWxpbmVTdHI6IHN0cmluZyk6IFRpbWVsaW5lRW50cnlbXSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodGltZWxpbmVTdHIpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkgcmV0dXJuIHBhcnNlZDtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBvbkNsb3NlKCkge1xuXHRcdC8vIGNsZWFudXBcblx0fVxufVxuIiwgImltcG9ydCB7IEFwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHR5cGUgTHlyYUJyYWluUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTHlyYUJyYWluU2V0dGluZ3Mge1xuXHRlbmRwb2ludDogc3RyaW5nO1xuXHRhcGlLZXk6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IEx5cmFCcmFpblNldHRpbmdzID0ge1xuXHRlbmRwb2ludDogXCJodHRwczovL2JyYWluLnNha3VyYS5leGNoYW5nZVwiLFxuXHRhcGlLZXk6IFwiXCIsXG59O1xuXG5leHBvcnQgY2xhc3MgTHlyYUJyYWluU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuXHRwbHVnaW46IEx5cmFCcmFpblBsdWdpbjtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBMeXJhQnJhaW5QbHVnaW4pIHtcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRkaXNwbGF5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKTtcblxuXHRcdGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkx5cmEgQnJhaW5cIiB9KTtcblx0XHRjb250YWluZXJFbC5jcmVhdGVFbChcInBcIiwge1xuXHRcdFx0dGV4dDogXCJDb25uZWN0IHRvIEx5cmEtU2V2ZW4ncyBrbm93bGVkZ2UgZ3JhcGguXCIsXG5cdFx0XHRjbHM6IFwic2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uXCIsXG5cdFx0fSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiQVBJIEVuZHBvaW50XCIpXG5cdFx0XHQuc2V0RGVzYyhcIlVSTCBvZiB0aGUgYnJhaW4gc2VydmVyXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCkgPT5cblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcImh0dHBzOi8vYnJhaW4uc2FrdXJhLmV4Y2hhbmdlXCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmVuZHBvaW50KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmVuZHBvaW50ID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJBUEkgS2V5XCIpXG5cdFx0XHQuc2V0RGVzYyhcIkF1dGhlbnRpY2F0aW9uIGtleSBmb3IgdGhlIGJyYWluIEFQSVwiKVxuXHRcdFx0LmFkZFRleHQoKHRleHQpID0+IHtcblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcIkVudGVyIEFQSSBrZXlcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBpS2V5KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmFwaUtleSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdHRleHQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuXHRcdFx0fSk7XG5cblx0XHQvLyBUZXN0IGNvbm5lY3Rpb24gYnV0dG9uXG5cdFx0Y29uc3QgdGVzdERpdiA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXRlc3QtY29ubmVjdGlvblwiIH0pO1xuXHRcdGNvbnN0IHRlc3RCdG4gPSB0ZXN0RGl2LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJUZXN0IENvbm5lY3Rpb25cIiB9KTtcblx0XHRjb25zdCB0ZXN0UmVzdWx0ID0gdGVzdERpdi5jcmVhdGVFbChcInNwYW5cIiwgeyBjbHM6IFwibHlyYS10ZXN0LXJlc3VsdFwiIH0pO1xuXG5cdFx0dGVzdEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdFJlc3VsdC5zZXRUZXh0KFwiVGVzdGluZy4uLlwiKTtcblx0XHRcdHRlc3RSZXN1bHQuY2xhc3NOYW1lID0gXCJseXJhLXRlc3QtcmVzdWx0XCI7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQudGVzdENvbm5lY3Rpb24oKTtcblx0XHRcdHRlc3RSZXN1bHQuc2V0VGV4dChyZXN1bHQubWVzc2FnZSk7XG5cdFx0XHR0ZXN0UmVzdWx0LmNsYXNzTmFtZSA9IGBseXJhLXRlc3QtcmVzdWx0ICR7cmVzdWx0Lm9rID8gXCJseXJhLXRlc3Qtb2tcIiA6IFwibHlyYS10ZXN0LWZhaWxcIn1gO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAi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QUFvQixPQUFPLEtBQUssaUJBQWlCLGdCQUFnQjtBQUFBLElBQ3pGLENBQUM7QUFBQSxFQUNGO0FBQ0Q7OztBSjdEQSxJQUFxQixrQkFBckIsY0FBNkMsd0JBQU87QUFBQSxFQUluRCxNQUFNLFNBQVM7QUFDZCxVQUFNLEtBQUssYUFBYTtBQUV4QixTQUFLLFNBQVMsSUFBSSxZQUFZLEtBQUssU0FBUyxVQUFVLEtBQUssU0FBUyxNQUFNO0FBRzFFLFNBQUssYUFBYSxpQkFBaUIsQ0FBQyxTQUFTLElBQUksVUFBVSxNQUFNLElBQUksQ0FBQztBQUN0RSxTQUFLLGFBQWEsa0JBQWtCLENBQUMsU0FBUyxJQUFJLGlCQUFpQixNQUFNLElBQUksQ0FBQztBQUc5RSxTQUFLLGNBQWMsSUFBSSxvQkFBb0IsS0FBSyxLQUFLLElBQUksQ0FBQztBQUcxRCxTQUFLLGNBQWMsU0FBUyxjQUFjLE1BQU07QUFDL0MsV0FBSyxrQkFBa0I7QUFBQSxJQUN4QixDQUFDO0FBR0QsU0FBSyxXQUFXO0FBQUEsTUFDZixJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixVQUFVLE1BQU0sS0FBSyxrQkFBa0I7QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxvQkFBb0I7QUFDekIsVUFBTSxXQUFXLEtBQUssSUFBSSxVQUFVLGdCQUFnQixlQUFlO0FBQ25FLFFBQUksU0FBUyxTQUFTLEdBQUc7QUFDeEIsV0FBSyxJQUFJLFVBQVUsV0FBVyxTQUFTLENBQUMsQ0FBQztBQUN6QztBQUFBLElBQ0Q7QUFFQSxVQUFNLE9BQU8sS0FBSyxJQUFJLFVBQVUsYUFBYSxLQUFLO0FBQ2xELFFBQUksTUFBTTtBQUNULFlBQU0sS0FBSyxhQUFhLEVBQUUsTUFBTSxpQkFBaUIsUUFBUSxLQUFLLENBQUM7QUFDL0QsV0FBSyxJQUFJLFVBQVUsV0FBVyxJQUFJO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGVBQWU7QUFDcEIsU0FBSyxXQUFXLE9BQU8sT0FBTyxDQUFDLEdBQUcsa0JBQWtCLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFBQSxFQUMxRTtBQUFBLEVBRUEsTUFBTSxlQUFlO0FBekR0QjtBQTBERSxVQUFNLEtBQUssU0FBUyxLQUFLLFFBQVE7QUFDakMsZUFBSyxXQUFMLG1CQUFhLGFBQWEsS0FBSyxTQUFTLFVBQVUsS0FBSyxTQUFTO0FBQUEsRUFDakU7QUFBQSxFQUVBLFdBQVc7QUFBQSxFQUFDO0FBQ2I7IiwKICAibmFtZXMiOiBbImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiJdCn0K
