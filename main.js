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
      this.plugin.refreshBrainView();
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
          this.plugin.refreshBrainView();
        }
      ).open();
    });
  }
  confirmDelete(obj) {
    new ConfirmDeleteModal(this.app, obj.name, async () => {
      await this.plugin.client.deleteObject(obj.id);
      this.plugin.refreshBrainView();
      this.leaf.detach();
    }).open();
  }
  editDescription(obj) {
    new EditDescriptionModal(this.app, obj.description, async (newDesc) => {
      await this.plugin.client.updateDescription(obj.id, newDesc);
      await this.loadAndRender();
      this.plugin.refreshBrainView();
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
  refreshBrainView() {
    const leaves = this.app.workspace.getLeavesOfType(BRAIN_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view == null ? void 0 : view.refresh) {
        view.refresh();
      }
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJzcmMvQnJhaW5DbGllbnQudHMiLCAic3JjL0JyYWluVmlldy50cyIsICJzcmMvT2JqZWN0RGV0YWlsVmlldy50cyIsICJzcmMvU2V0dGluZ3NUYWIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IFBsdWdpbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgQnJhaW5DbGllbnQgfSBmcm9tIFwiLi9zcmMvQnJhaW5DbGllbnRcIjtcbmltcG9ydCB7IEJyYWluVmlldywgQlJBSU5fVklFV19UWVBFIH0gZnJvbSBcIi4vc3JjL0JyYWluVmlld1wiO1xuaW1wb3J0IHsgT2JqZWN0RGV0YWlsVmlldywgREVUQUlMX1ZJRVdfVFlQRSB9IGZyb20gXCIuL3NyYy9PYmplY3REZXRhaWxWaWV3XCI7XG5pbXBvcnQge1xuXHRMeXJhQnJhaW5TZXR0aW5nVGFiLFxuXHRMeXJhQnJhaW5TZXR0aW5ncyxcblx0REVGQVVMVF9TRVRUSU5HUyxcbn0gZnJvbSBcIi4vc3JjL1NldHRpbmdzVGFiXCI7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEx5cmFCcmFpblBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG5cdHNldHRpbmdzOiBMeXJhQnJhaW5TZXR0aW5ncztcblx0Y2xpZW50OiBCcmFpbkNsaWVudDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0YXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuXHRcdHRoaXMuY2xpZW50ID0gbmV3IEJyYWluQ2xpZW50KHRoaXMuc2V0dGluZ3MuZW5kcG9pbnQsIHRoaXMuc2V0dGluZ3MuYXBpS2V5KTtcblxuXHRcdC8vIFJlZ2lzdGVyIHZpZXdzXG5cdFx0dGhpcy5yZWdpc3RlclZpZXcoQlJBSU5fVklFV19UWVBFLCAobGVhZikgPT4gbmV3IEJyYWluVmlldyhsZWFmLCB0aGlzKSk7XG5cdFx0dGhpcy5yZWdpc3RlclZpZXcoREVUQUlMX1ZJRVdfVFlQRSwgKGxlYWYpID0+IG5ldyBPYmplY3REZXRhaWxWaWV3KGxlYWYsIHRoaXMpKTtcblxuXHRcdC8vIFNldHRpbmdzIHRhYlxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTHlyYUJyYWluU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG5cdFx0Ly8gUmliYm9uIGljb25cblx0XHR0aGlzLmFkZFJpYmJvbkljb24oXCJicmFpblwiLCBcIkx5cmEgQnJhaW5cIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZUJyYWluVmlldygpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ29tbWFuZFxuXHRcdHRoaXMuYWRkQ29tbWFuZCh7XG5cdFx0XHRpZDogXCJvcGVuLWx5cmEtYnJhaW5cIixcblx0XHRcdG5hbWU6IFwiT3BlbiBMeXJhIEJyYWluXCIsXG5cdFx0XHRjYWxsYmFjazogKCkgPT4gdGhpcy5hY3RpdmF0ZUJyYWluVmlldygpLFxuXHRcdH0pO1xuXG5cdH1cblxuXHRyZWZyZXNoQnJhaW5WaWV3KCkge1xuXHRcdGNvbnN0IGxlYXZlcyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoQlJBSU5fVklFV19UWVBFKTtcblx0XHRmb3IgKGNvbnN0IGxlYWYgb2YgbGVhdmVzKSB7XG5cdFx0XHRjb25zdCB2aWV3ID0gbGVhZi52aWV3IGFzIEJyYWluVmlldztcblx0XHRcdGlmICh2aWV3Py5yZWZyZXNoKSB7XG5cdFx0XHRcdHZpZXcucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFjdGl2YXRlQnJhaW5WaWV3KCkge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShCUkFJTl9WSUVXX1RZUEUpO1xuXHRcdGlmIChleGlzdGluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihleGlzdGluZ1swXSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRSaWdodExlYWYoZmFsc2UpO1xuXHRcdGlmIChsZWFmKSB7XG5cdFx0XHRhd2FpdCBsZWFmLnNldFZpZXdTdGF0ZSh7IHR5cGU6IEJSQUlOX1ZJRVdfVFlQRSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5hcHAud29ya3NwYWNlLnJldmVhbExlYWYobGVhZik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgbG9hZFNldHRpbmdzKCkge1xuXHRcdHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuXHR9XG5cblx0YXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuXHRcdGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG5cdFx0dGhpcy5jbGllbnQ/LnVwZGF0ZUNvbmZpZyh0aGlzLnNldHRpbmdzLmVuZHBvaW50LCB0aGlzLnNldHRpbmdzLmFwaUtleSk7XG5cdH1cblxuXHRvbnVubG9hZCgpIHt9XG59XG4iLCAiaW1wb3J0IHsgcmVxdWVzdFVybCwgUmVxdWVzdFVybFBhcmFtIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnJhaW5PYmplY3Qge1xuXHRpZDogc3RyaW5nO1xuXHR0eXBlOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0c3RhdHVzOiBzdHJpbmc7XG5cdGNyZWF0ZWQ6IHN0cmluZztcblx0bW9kaWZpZWQ6IHN0cmluZztcblx0cGF0aDogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHR0aW1lbGluZTogc3RyaW5nO1xuXHRydWxlczogc3RyaW5nO1xuXHRzb3VyY2Vfc2Vzc2lvbjogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEJyYWluQ29ubmVjdGlvbiB7XG5cdHJlbGF0aW9uOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0dHlwZTogc3RyaW5nO1xuXHRzdGF0dXM6IHN0cmluZztcblx0aWQ6IHN0cmluZztcblx0ZGlyZWN0aW9uOiBcIm91dGdvaW5nXCIgfCBcImluY29taW5nXCI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHlwZUNvdW50IHtcblx0dHlwZTogc3RyaW5nO1xuXHRjb3VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQ3lwaGVyUmVzcG9uc2Uge1xuXHRjb2x1bW5zOiBzdHJpbmdbXTtcblx0cm93czogYW55W11bXTtcblx0ZXJyb3I/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBCcmFpbkNsaWVudCB7XG5cdHByaXZhdGUgZW5kcG9pbnQ6IHN0cmluZztcblx0cHJpdmF0ZSBhcGlLZXk6IHN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihlbmRwb2ludDogc3RyaW5nLCBhcGlLZXk6IHN0cmluZykge1xuXHRcdHRoaXMuZW5kcG9pbnQgPSBlbmRwb2ludC5yZXBsYWNlKC9cXC8rJC8sIFwiXCIpO1xuXHRcdHRoaXMuYXBpS2V5ID0gYXBpS2V5O1xuXHR9XG5cblx0dXBkYXRlQ29uZmlnKGVuZHBvaW50OiBzdHJpbmcsIGFwaUtleTogc3RyaW5nKSB7XG5cdFx0dGhpcy5lbmRwb2ludCA9IGVuZHBvaW50LnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG5cdFx0dGhpcy5hcGlLZXkgPSBhcGlLZXk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGN5cGhlcihxdWVyeTogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7fSk6IFByb21pc2U8Q3lwaGVyUmVzcG9uc2U+IHtcblx0XHRjb25zdCByZXE6IFJlcXVlc3RVcmxQYXJhbSA9IHtcblx0XHRcdHVybDogYCR7dGhpcy5lbmRwb2ludH0vY3lwaGVyYCxcblx0XHRcdG1ldGhvZDogXCJQT1NUXCIsXG5cdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuXHRcdFx0XHRcIlgtQVBJLUtleVwiOiB0aGlzLmFwaUtleSxcblx0XHRcdH0sXG5cdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IHF1ZXJ5LCBwYXJhbXMgfSksXG5cdFx0fTtcblx0XHRjb25zdCByZXMgPSBhd2FpdCByZXF1ZXN0VXJsKHJlcSk7XG5cdFx0aWYgKHJlcy5qc29uLmVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IocmVzLmpzb24uZXJyb3IpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzLmpzb247XG5cdH1cblxuXHRhc3luYyB0ZXN0Q29ubmVjdGlvbigpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IG1lc3NhZ2U6IHN0cmluZyB9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcTogUmVxdWVzdFVybFBhcmFtID0ge1xuXHRcdFx0XHR1cmw6IGAke3RoaXMuZW5kcG9pbnR9L2hlYWx0aGAsXG5cdFx0XHRcdG1ldGhvZDogXCJHRVRcIixcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCByZXF1ZXN0VXJsKHJlcSk7XG5cdFx0XHRpZiAocmVzLmpzb24uc3RhdHVzID09PSBcIm9rXCIpIHtcblx0XHRcdFx0Y29uc3QgdGFibGVzID0gcmVzLmpzb24ubm9kZV90YWJsZXM/Lmxlbmd0aCB8fCAwO1xuXHRcdFx0XHRyZXR1cm4geyBvazogdHJ1ZSwgbWVzc2FnZTogYENvbm5lY3RlZCBcdTIwMTQgJHt0YWJsZXN9IG5vZGUgdGFibGVzYCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCBtZXNzYWdlOiBcIlVuZXhwZWN0ZWQgcmVzcG9uc2VcIiB9O1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCBtZXNzYWdlOiBlLm1lc3NhZ2UgfHwgXCJDb25uZWN0aW9uIGZhaWxlZFwiIH07XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0T2JqZWN0Q291bnRzKCk6IFByb21pc2U8VHlwZUNvdW50W10+IHtcblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdFwiTUFUQ0ggKG86T2JqZWN0KSBSRVRVUk4gby50eXBlIEFTIHR5cGUsIENPVU5UKCopIEFTIGNudCBPUkRFUiBCWSBjbnQgREVTQ1wiXG5cdFx0KTtcblx0XHRyZXR1cm4gcmVzLnJvd3MubWFwKChyKSA9PiAoeyB0eXBlOiByWzBdLCBjb3VudDogclsxXSB9KSk7XG5cdH1cblxuXHRhc3luYyBsaXN0T2JqZWN0cyhcblx0XHR0eXBlPzogc3RyaW5nLFxuXHRcdHN0YXR1cz86IHN0cmluZyxcblx0XHRsaW1pdDogbnVtYmVyID0gMTAwXG5cdCk6IFByb21pc2U8QnJhaW5PYmplY3RbXT4ge1xuXHRcdGNvbnN0IGNvbmRpdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG5cblx0XHRpZiAodHlwZSkge1xuXHRcdFx0Y29uZGl0aW9ucy5wdXNoKFwiby50eXBlID0gJHR5cGVcIik7XG5cdFx0XHRwYXJhbXMudHlwZSA9IHR5cGU7XG5cdFx0fVxuXHRcdGlmIChzdGF0dXMpIHtcblx0XHRcdGNvbmRpdGlvbnMucHVzaChcIm8uc3RhdHVzID0gJHN0YXR1c1wiKTtcblx0XHRcdHBhcmFtcy5zdGF0dXMgPSBzdGF0dXM7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2hlcmUgPSBjb25kaXRpb25zLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHtjb25kaXRpb25zLmpvaW4oXCIgQU5EIFwiKX1gIDogXCJcIjtcblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdGBNQVRDSCAobzpPYmplY3QpICR7d2hlcmV9IFJFVFVSTiBvIE9SREVSIEJZIG8ubW9kaWZpZWQgREVTQyBMSU1JVCAke2xpbWl0fWAsXG5cdFx0XHRwYXJhbXNcblx0XHQpO1xuXHRcdHJldHVybiByZXMucm93cy5tYXAoKHIpID0+IHRoaXMucGFyc2VPYmplY3QoclswXSkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0T2JqZWN0KG5hbWVPcklkOiBzdHJpbmcpOiBQcm9taXNlPEJyYWluT2JqZWN0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0XCJNQVRDSCAobzpPYmplY3QpIFdIRVJFIG8uaWQgPSAka2V5IE9SIExPV0VSKG8ubmFtZSkgPSBMT1dFUigka2V5KSBSRVRVUk4gb1wiLFxuXHRcdFx0eyBrZXk6IG5hbWVPcklkIH1cblx0XHQpO1xuXHRcdGlmIChyZXMucm93cy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXHRcdHJldHVybiB0aGlzLnBhcnNlT2JqZWN0KHJlcy5yb3dzWzBdWzBdKTtcblx0fVxuXG5cdGFzeW5jIGdldENvbm5lY3Rpb25zKG5hbWVPcklkOiBzdHJpbmcpOiBQcm9taXNlPEJyYWluQ29ubmVjdGlvbltdPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbnM6IEJyYWluQ29ubmVjdGlvbltdID0gW107XG5cblx0XHQvLyBPdXRnb2luZ1xuXHRcdGNvbnN0IG91dCA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChhOk9iamVjdCktW2M6Q29ubmVjdGlvbl0tPihiOk9iamVjdClcblx0XHRcdCBXSEVSRSBhLmlkID0gJGtleSBPUiBMT1dFUihhLm5hbWUpID0gTE9XRVIoJGtleSlcblx0XHRcdCBSRVRVUk4gYy5yZWxhdGlvbiwgYi5uYW1lLCBiLnR5cGUsIGIuc3RhdHVzLCBiLmlkYCxcblx0XHRcdHsga2V5OiBuYW1lT3JJZCB9XG5cdFx0KTtcblx0XHRmb3IgKGNvbnN0IHIgb2Ygb3V0LnJvd3MpIHtcblx0XHRcdGNvbm5lY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRyZWxhdGlvbjogclswXSxcblx0XHRcdFx0bmFtZTogclsxXSxcblx0XHRcdFx0dHlwZTogclsyXSxcblx0XHRcdFx0c3RhdHVzOiByWzNdLFxuXHRcdFx0XHRpZDogcls0XSxcblx0XHRcdFx0ZGlyZWN0aW9uOiBcIm91dGdvaW5nXCIsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBJbmNvbWluZ1xuXHRcdGNvbnN0IGluYyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChhOk9iamVjdCktW2M6Q29ubmVjdGlvbl0tPihiOk9iamVjdClcblx0XHRcdCBXSEVSRSBiLmlkID0gJGtleSBPUiBMT1dFUihiLm5hbWUpID0gTE9XRVIoJGtleSlcblx0XHRcdCBSRVRVUk4gYy5yZWxhdGlvbiwgYS5uYW1lLCBhLnR5cGUsIGEuc3RhdHVzLCBhLmlkYCxcblx0XHRcdHsga2V5OiBuYW1lT3JJZCB9XG5cdFx0KTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgaW5jLnJvd3MpIHtcblx0XHRcdGNvbm5lY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRyZWxhdGlvbjogclswXSxcblx0XHRcdFx0bmFtZTogclsxXSxcblx0XHRcdFx0dHlwZTogclsyXSxcblx0XHRcdFx0c3RhdHVzOiByWzNdLFxuXHRcdFx0XHRpZDogcls0XSxcblx0XHRcdFx0ZGlyZWN0aW9uOiBcImluY29taW5nXCIsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29ubmVjdGlvbnM7XG5cdH1cblxuXHRhc3luYyBzZWFyY2hPYmplY3RzKHF1ZXJ5OiBzdHJpbmcsIGxpbWl0OiBudW1iZXIgPSA1MCk6IFByb21pc2U8QnJhaW5PYmplY3RbXT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChvOk9iamVjdClcblx0XHRcdCBXSEVSRSBMT1dFUihvLm5hbWUpIENPTlRBSU5TIExPV0VSKCRxKSBPUiBMT1dFUihvLmRlc2NyaXB0aW9uKSBDT05UQUlOUyBMT1dFUigkcSlcblx0XHRcdCBSRVRVUk4gbyBPUkRFUiBCWSBvLm1vZGlmaWVkIERFU0MgTElNSVQgJHtsaW1pdH1gLFxuXHRcdFx0eyBxOiBxdWVyeSB9XG5cdFx0KTtcblx0XHRyZXR1cm4gcmVzLnJvd3MubWFwKChyKSA9PiB0aGlzLnBhcnNlT2JqZWN0KHJbMF0pKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVN0YXR1cyhvYmplY3RJZDogc3RyaW5nLCBuZXdTdGF0dXM6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGVzY2FwZWQgPSB0aGlzLmVzY2FwZVN0cihuZXdTdGF0dXMpO1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChvOk9iamVjdCkgV0hFUkUgby5pZCA9ICRpZCBTRVQgby5zdGF0dXMgPSAke2VzY2FwZWR9IFJFVFVSTiBvLm5hbWVgLFxuXHRcdFx0eyBpZDogb2JqZWN0SWQgfVxuXHRcdCk7XG5cdFx0cmV0dXJuIHJlcy5yb3dzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVEZXNjcmlwdGlvbihvYmplY3RJZDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZXNjYXBlZCA9IHRoaXMuZXNjYXBlU3RyKGRlc2NyaXB0aW9uKTtcblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdGBNQVRDSCAobzpPYmplY3QpIFdIRVJFIG8uaWQgPSAkaWQgU0VUIG8uZGVzY3JpcHRpb24gPSAke2VzY2FwZWR9IFJFVFVSTiBvLm5hbWVgLFxuXHRcdFx0eyBpZDogb2JqZWN0SWQgfVxuXHRcdCk7XG5cdFx0cmV0dXJuIHJlcy5yb3dzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRhc3luYyBkZWxldGVPYmplY3Qob2JqZWN0SWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIERlbGV0ZSBvdXRnb2luZyBjb25uZWN0aW9uc1xuXHRcdGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChhOk9iamVjdCktW2M6Q29ubmVjdGlvbl0tPihiOk9iamVjdCkgV0hFUkUgYS5pZCA9ICRpZCBERUxFVEUgY2AsXG5cdFx0XHR7IGlkOiBvYmplY3RJZCB9XG5cdFx0KTtcblx0XHQvLyBEZWxldGUgaW5jb21pbmcgY29ubmVjdGlvbnNcblx0XHRhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdGBNQVRDSCAoYTpPYmplY3QpLVtjOkNvbm5lY3Rpb25dLT4oYjpPYmplY3QpIFdIRVJFIGIuaWQgPSAkaWQgREVMRVRFIGNgLFxuXHRcdFx0eyBpZDogb2JqZWN0SWQgfVxuXHRcdCk7XG5cdFx0Ly8gRGVsZXRlIHRoZSBvYmplY3Rcblx0XHRhd2FpdCB0aGlzLmN5cGhlcihcblx0XHRcdGBNQVRDSCAobzpPYmplY3QpIFdIRVJFIG8uaWQgPSAkaWQgREVMRVRFIG9gLFxuXHRcdFx0eyBpZDogb2JqZWN0SWQgfVxuXHRcdCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBkZWxldGVDb25uZWN0aW9uKGZyb21JZDogc3RyaW5nLCByZWxhdGlvbjogc3RyaW5nLCB0b0lkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBlc2NhcGVkID0gdGhpcy5lc2NhcGVTdHIocmVsYXRpb24pO1xuXHRcdGF3YWl0IHRoaXMuY3lwaGVyKFxuXHRcdFx0YE1BVENIIChhOk9iamVjdCktW2M6Q29ubmVjdGlvbl0tPihiOk9iamVjdClcblx0XHRcdCBXSEVSRSBhLmlkID0gJGZyb21JZCBBTkQgYi5pZCA9ICR0b0lkIEFORCBjLnJlbGF0aW9uID0gJHtlc2NhcGVkfVxuXHRcdFx0IERFTEVURSBjYCxcblx0XHRcdHsgZnJvbUlkLCB0b0lkIH1cblx0XHQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBlc2NhcGVTdHIodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZXNjYXBlZCA9IHZhbHVlLnJlcGxhY2UoL1xcXFwvZywgXCJcXFxcXFxcXFwiKS5yZXBsYWNlKC9cIi9nLCAnXFxcXFwiJykucmVwbGFjZSgvXFxuL2csIFwiXFxcXG5cIik7XG5cdFx0cmV0dXJuIGBcIiR7ZXNjYXBlZH1cImA7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlT2JqZWN0KHJhdzogYW55KTogQnJhaW5PYmplY3Qge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogcmF3LmlkIHx8IFwiXCIsXG5cdFx0XHR0eXBlOiByYXcudHlwZSB8fCBcIlwiLFxuXHRcdFx0bmFtZTogcmF3Lm5hbWUgfHwgXCJcIixcblx0XHRcdHN0YXR1czogcmF3LnN0YXR1cyB8fCBcIlwiLFxuXHRcdFx0Y3JlYXRlZDogcmF3LmNyZWF0ZWQgfHwgXCJcIixcblx0XHRcdG1vZGlmaWVkOiByYXcubW9kaWZpZWQgfHwgXCJcIixcblx0XHRcdHBhdGg6IHJhdy5wYXRoIHx8IFwiXCIsXG5cdFx0XHRkZXNjcmlwdGlvbjogcmF3LmRlc2NyaXB0aW9uIHx8IFwiXCIsXG5cdFx0XHR0aW1lbGluZTogcmF3LnRpbWVsaW5lIHx8IFwiW11cIixcblx0XHRcdHJ1bGVzOiByYXcucnVsZXMgfHwgXCJcIixcblx0XHRcdHNvdXJjZV9zZXNzaW9uOiByYXcuc291cmNlX3Nlc3Npb24gfHwgXCJcIixcblx0XHR9O1xuXHR9XG59XG4iLCAiaW1wb3J0IHsgSXRlbVZpZXcsIFdvcmtzcGFjZUxlYWYsIHNldEljb24sIGRlYm91bmNlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgdHlwZSBMeXJhQnJhaW5QbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcbmltcG9ydCB0eXBlIHsgQnJhaW5PYmplY3QsIFR5cGVDb3VudCB9IGZyb20gXCIuL0JyYWluQ2xpZW50XCI7XG5pbXBvcnQgeyBERVRBSUxfVklFV19UWVBFIH0gZnJvbSBcIi4vT2JqZWN0RGV0YWlsVmlld1wiO1xuXG5leHBvcnQgY29uc3QgQlJBSU5fVklFV19UWVBFID0gXCJseXJhLWJyYWluLXZpZXdcIjtcblxuY29uc3QgU1RBVFVTX0NPTE9SUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0YWN0aXZlOiBcInZhcigtLWNvbG9yLWdyZWVuKVwiLFxuXHRmcm96ZW46IFwidmFyKC0tY29sb3ItYmx1ZSlcIixcblx0ZG9uZTogXCJ2YXIoLS10ZXh0LW11dGVkKVwiLFxuXHRicm9rZW46IFwidmFyKC0tY29sb3ItcmVkKVwiLFxuXHR3YWl0aW5nOiBcInZhcigtLWNvbG9yLXllbGxvdylcIixcblx0aWRlYTogXCJ2YXIoLS1jb2xvci1wdXJwbGUpXCIsXG5cdGRlcHJlY2F0ZWQ6IFwidmFyKC0tdGV4dC1mYWludClcIixcbn07XG5cbmV4cG9ydCBjbGFzcyBCcmFpblZpZXcgZXh0ZW5kcyBJdGVtVmlldyB7XG5cdHBsdWdpbjogTHlyYUJyYWluUGx1Z2luO1xuXHRwcml2YXRlIHNlYXJjaElucHV0OiBIVE1MSW5wdXRFbGVtZW50O1xuXHRwcml2YXRlIHR5cGVDaGlwc0VsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBvYmplY3RMaXN0RWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHN0YXR1c0JhckVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWxlY3RlZFR5cGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHR5cGVDb3VudHM6IFR5cGVDb3VudFtdID0gW107XG5cblx0Y29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcGx1Z2luOiBMeXJhQnJhaW5QbHVnaW4pIHtcblx0XHRzdXBlcihsZWFmKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdGdldFZpZXdUeXBlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEJSQUlOX1ZJRVdfVFlQRTtcblx0fVxuXG5cdGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFwiTHlyYSBCcmFpblwiO1xuXHR9XG5cblx0Z2V0SWNvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiBcImJyYWluXCI7XG5cdH1cblxuXHRhc3luYyBvbk9wZW4oKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5jb250YWluZXJFbC5jaGlsZHJlblsxXSBhcyBIVE1MRWxlbWVudDtcblx0XHRjb250YWluZXIuZW1wdHkoKTtcblx0XHRjb250YWluZXIuYWRkQ2xhc3MoXCJseXJhLWJyYWluLWNvbnRhaW5lclwiKTtcblxuXHRcdC8vIEhlYWRlclxuXHRcdGNvbnN0IGhlYWRlciA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1icmFpbi1oZWFkZXJcIiB9KTtcblx0XHRoZWFkZXIuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogXCJMeXJhIEJyYWluXCIsIGNsczogXCJseXJhLWJyYWluLXRpdGxlXCIgfSk7XG5cblx0XHRjb25zdCByZWZyZXNoQnRuID0gaGVhZGVyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcImx5cmEtYnRuLWljb25cIiwgYXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJSZWZyZXNoXCIgfSB9KTtcblx0XHRzZXRJY29uKHJlZnJlc2hCdG4sIFwicmVmcmVzaC1jd1wiKTtcblx0XHRyZWZyZXNoQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLnJlZnJlc2goKSk7XG5cblx0XHQvLyBTZWFyY2hcblx0XHRjb25zdCBzZWFyY2hXcmFwID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXNlYXJjaC13cmFwXCIgfSk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dCA9IHNlYXJjaFdyYXAuY3JlYXRlRWwoXCJpbnB1dFwiLCB7XG5cdFx0XHR0eXBlOiBcInRleHRcIixcblx0XHRcdHBsYWNlaG9sZGVyOiBcIlNlYXJjaCBvYmplY3RzLi4uXCIsXG5cdFx0XHRjbHM6IFwibHlyYS1zZWFyY2gtaW5wdXRcIixcblx0XHR9KTtcblx0XHR0aGlzLnNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoXG5cdFx0XHRcImlucHV0XCIsXG5cdFx0XHRkZWJvdW5jZSgoKSA9PiB0aGlzLm9uU2VhcmNoKCksIDMwMCwgdHJ1ZSlcblx0XHQpO1xuXG5cdFx0Ly8gVHlwZSBjaGlwc1xuXHRcdHRoaXMudHlwZUNoaXBzRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtdHlwZS1jaGlwc1wiIH0pO1xuXG5cdFx0Ly8gT2JqZWN0IGxpc3Rcblx0XHR0aGlzLm9iamVjdExpc3RFbCA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1vYmplY3QtbGlzdFwiIH0pO1xuXG5cdFx0Ly8gU3RhdHVzIGJhclxuXHRcdHRoaXMuc3RhdHVzQmFyRWwgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtc3RhdHVzLWJhclwiIH0pO1xuXG5cdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoKCkge1xuXHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChcIkxvYWRpbmcuLi5cIik7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudHlwZUNvdW50cyA9IGF3YWl0IHRoaXMucGx1Z2luLmNsaWVudC5nZXRPYmplY3RDb3VudHMoKTtcblx0XHRcdHRoaXMucmVuZGVyVHlwZUNoaXBzKCk7XG5cdFx0XHRhd2FpdCB0aGlzLmxvYWRPYmplY3RzKCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVsLnNldFRleHQoYEVycm9yOiAke2UubWVzc2FnZX1gKTtcblx0XHRcdHRoaXMub2JqZWN0TGlzdEVsLmVtcHR5KCk7XG5cdFx0XHR0aGlzLm9iamVjdExpc3RFbC5jcmVhdGVFbChcImRpdlwiLCB7XG5cdFx0XHRcdHRleHQ6IFwiQ291bGQgbm90IGNvbm5lY3QgdG8gYnJhaW4uIENoZWNrIHNldHRpbmdzLlwiLFxuXHRcdFx0XHRjbHM6IFwibHlyYS1lbXB0eS1zdGF0ZVwiLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUeXBlQ2hpcHMoKSB7XG5cdFx0dGhpcy50eXBlQ2hpcHNFbC5lbXB0eSgpO1xuXG5cdFx0Ly8gXCJBbGxcIiBjaGlwXG5cdFx0Y29uc3QgYWxsQ291bnQgPSB0aGlzLnR5cGVDb3VudHMucmVkdWNlKChzLCB0KSA9PiBzICsgdC5jb3VudCwgMCk7XG5cdFx0Y29uc3QgYWxsQ2hpcCA9IHRoaXMudHlwZUNoaXBzRWwuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0dGV4dDogYGFsbCAoJHthbGxDb3VudH0pYCxcblx0XHRcdGNsczogYGx5cmEtY2hpcCAke3RoaXMuc2VsZWN0ZWRUeXBlID09PSBudWxsID8gXCJseXJhLWNoaXAtYWN0aXZlXCIgOiBcIlwifWAsXG5cdFx0fSk7XG5cdFx0YWxsQ2hpcC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5zZWxlY3RlZFR5cGUgPSBudWxsO1xuXHRcdFx0dGhpcy5yZW5kZXJUeXBlQ2hpcHMoKTtcblx0XHRcdHRoaXMubG9hZE9iamVjdHMoKTtcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgdGMgb2YgdGhpcy50eXBlQ291bnRzKSB7XG5cdFx0XHRjb25zdCBjaGlwID0gdGhpcy50eXBlQ2hpcHNFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHRcdHRleHQ6IGAke3RjLnR5cGV9ICgke3RjLmNvdW50fSlgLFxuXHRcdFx0XHRjbHM6IGBseXJhLWNoaXAgJHt0aGlzLnNlbGVjdGVkVHlwZSA9PT0gdGMudHlwZSA/IFwibHlyYS1jaGlwLWFjdGl2ZVwiIDogXCJcIn1gLFxuXHRcdFx0fSk7XG5cdFx0XHRjaGlwLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRUeXBlID0gdGMudHlwZTtcblx0XHRcdFx0dGhpcy5yZW5kZXJUeXBlQ2hpcHMoKTtcblx0XHRcdFx0dGhpcy5sb2FkT2JqZWN0cygpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkT2JqZWN0cygpIHtcblx0XHR0aGlzLm9iamVjdExpc3RFbC5lbXB0eSgpO1xuXHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChcIkxvYWRpbmcuLi5cIik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb2JqZWN0cyA9IGF3YWl0IHRoaXMucGx1Z2luLmNsaWVudC5saXN0T2JqZWN0cyhcblx0XHRcdFx0dGhpcy5zZWxlY3RlZFR5cGUgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdDIwMFxuXHRcdFx0KTtcblx0XHRcdHRoaXMucmVuZGVyT2JqZWN0cyhvYmplY3RzKTtcblx0XHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChgJHtvYmplY3RzLmxlbmd0aH0gb2JqZWN0c2ApO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KGBFcnJvcjogJHtlLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblNlYXJjaCgpIHtcblx0XHRjb25zdCBxdWVyeSA9IHRoaXMuc2VhcmNoSW5wdXQudmFsdWUudHJpbSgpO1xuXHRcdGlmICghcXVlcnkpIHtcblx0XHRcdGF3YWl0IHRoaXMubG9hZE9iamVjdHMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm9iamVjdExpc3RFbC5lbXB0eSgpO1xuXHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChcIlNlYXJjaGluZy4uLlwiKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5wbHVnaW4uY2xpZW50LnNlYXJjaE9iamVjdHMocXVlcnkpO1xuXHRcdFx0dGhpcy5yZW5kZXJPYmplY3RzKHJlc3VsdHMpO1xuXHRcdFx0dGhpcy5zdGF0dXNCYXJFbC5zZXRUZXh0KGAke3Jlc3VsdHMubGVuZ3RofSByZXN1bHRzIGZvciBcIiR7cXVlcnl9XCJgKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHtcblx0XHRcdHRoaXMuc3RhdHVzQmFyRWwuc2V0VGV4dChgU2VhcmNoIGVycm9yOiAke2UubWVzc2FnZX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck9iamVjdHMob2JqZWN0czogQnJhaW5PYmplY3RbXSkge1xuXHRcdHRoaXMub2JqZWN0TGlzdEVsLmVtcHR5KCk7XG5cblx0XHRpZiAob2JqZWN0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMub2JqZWN0TGlzdEVsLmNyZWF0ZUVsKFwiZGl2XCIsIHtcblx0XHRcdFx0dGV4dDogXCJObyBvYmplY3RzIGZvdW5kXCIsXG5cdFx0XHRcdGNsczogXCJseXJhLWVtcHR5LXN0YXRlXCIsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IG9iaiBvZiBvYmplY3RzKSB7XG5cdFx0XHRjb25zdCByb3cgPSB0aGlzLm9iamVjdExpc3RFbC5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1vYmplY3Qtcm93XCIgfSk7XG5cdFx0XHRyb3cuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMub3Blbk9iamVjdChvYmopKTtcblxuXHRcdFx0Y29uc3QgbmFtZUVsID0gcm93LmNyZWF0ZURpdih7IGNsczogXCJseXJhLW9iamVjdC1uYW1lXCIgfSk7XG5cdFx0XHRuYW1lRWwuc2V0VGV4dChvYmoubmFtZSk7XG5cblx0XHRcdGNvbnN0IG1ldGFFbCA9IHJvdy5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1vYmplY3QtbWV0YVwiIH0pO1xuXG5cdFx0XHRjb25zdCB0eXBlVGFnID0gbWV0YUVsLmNyZWF0ZUVsKFwic3BhblwiLCB7XG5cdFx0XHRcdHRleHQ6IG9iai50eXBlLFxuXHRcdFx0XHRjbHM6IFwibHlyYS10YWcgbHlyYS10YWctdHlwZVwiLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN0YXR1c1RhZyA9IG1ldGFFbC5jcmVhdGVFbChcInNwYW5cIiwge1xuXHRcdFx0XHR0ZXh0OiBvYmouc3RhdHVzLFxuXHRcdFx0XHRjbHM6IGBseXJhLXRhZyBseXJhLXRhZy1zdGF0dXNgLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb2xvciA9IFNUQVRVU19DT0xPUlNbb2JqLnN0YXR1c10gfHwgXCJ2YXIoLS10ZXh0LW11dGVkKVwiO1xuXHRcdFx0c3RhdHVzVGFnLnN0eWxlLnNldFByb3BlcnR5KFwiLS1zdGF0dXMtY29sb3JcIiwgY29sb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk9iamVjdChvYmo6IEJyYWluT2JqZWN0KSB7XG5cdFx0Y29uc3QgbGVhdmVzID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShERVRBSUxfVklFV19UWVBFKTtcblx0XHRsZXQgbGVhZjogV29ya3NwYWNlTGVhZjtcblxuXHRcdGlmIChsZWF2ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0bGVhZiA9IGxlYXZlc1swXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKFwidGFiXCIpO1xuXHRcdH1cblxuXHRcdGF3YWl0IGxlYWYuc2V0Vmlld1N0YXRlKHtcblx0XHRcdHR5cGU6IERFVEFJTF9WSUVXX1RZUEUsXG5cdFx0XHRzdGF0ZTogeyBvYmplY3RJZDogb2JqLmlkIH0sXG5cdFx0fSk7XG5cdFx0dGhpcy5hcHAud29ya3NwYWNlLnJldmVhbExlYWYobGVhZik7XG5cdH1cblxuXHRhc3luYyBvbkNsb3NlKCkge1xuXHRcdC8vIGNsZWFudXBcblx0fVxufVxuIiwgImltcG9ydCB7IEl0ZW1WaWV3LCBXb3Jrc3BhY2VMZWFmLCBzZXRJY29uLCBNb2RhbCwgQXBwLCBTZXR0aW5nIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgdHlwZSBMeXJhQnJhaW5QbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcbmltcG9ydCB0eXBlIHsgQnJhaW5PYmplY3QsIEJyYWluQ29ubmVjdGlvbiB9IGZyb20gXCIuL0JyYWluQ2xpZW50XCI7XG5cbmV4cG9ydCBjb25zdCBERVRBSUxfVklFV19UWVBFID0gXCJseXJhLWJyYWluLWRldGFpbFwiO1xuXG5jb25zdCBBTExfU1RBVFVTRVMgPSBbXCJhY3RpdmVcIiwgXCJmcm96ZW5cIiwgXCJkb25lXCIsIFwiYnJva2VuXCIsIFwid2FpdGluZ1wiLCBcImlkZWFcIiwgXCJkZXByZWNhdGVkXCJdO1xuXG5pbnRlcmZhY2UgVGltZWxpbmVFbnRyeSB7XG5cdHRzOiBzdHJpbmc7XG5cdGV2ZW50OiBzdHJpbmc7XG59XG5cbmNvbnN0IFNUQVRVU19FTU9KSTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0YWN0aXZlOiBcIlx1MjVDRlwiLFxuXHRmcm96ZW46IFwiXHUyNUM2XCIsXG5cdGRvbmU6IFwiXHUyNzEzXCIsXG5cdGJyb2tlbjogXCJcdTI3MTdcIixcblx0d2FpdGluZzogXCJcdTI1Q0NcIixcblx0aWRlYTogXCJcdTI1QzdcIixcblx0ZGVwcmVjYXRlZDogXCJcdTI1Q0JcIixcbn07XG5cbi8vIC0tLS0gQ29uZmlybWF0aW9uIE1vZGFsIC0tLS1cbmNsYXNzIENvbmZpcm1EZWxldGVNb2RhbCBleHRlbmRzIE1vZGFsIHtcblx0cHJpdmF0ZSBvYmplY3ROYW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgb25Db25maXJtOiAoKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBvYmplY3ROYW1lOiBzdHJpbmcsIG9uQ29uZmlybTogKCkgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGFwcCk7XG5cdFx0dGhpcy5vYmplY3ROYW1lID0gb2JqZWN0TmFtZTtcblx0XHR0aGlzLm9uQ29uZmlybSA9IG9uQ29uZmlybTtcblx0fVxuXG5cdG9uT3BlbigpIHtcblx0XHRjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcblx0XHRjb250ZW50RWwuY3JlYXRlRWwoXCJoM1wiLCB7IHRleHQ6IFwiRGVsZXRlIE9iamVjdFwiIH0pO1xuXHRcdGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwge1xuXHRcdFx0dGV4dDogYEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgXCIke3RoaXMub2JqZWN0TmFtZX1cIj8gVGhpcyB3aWxsIGFsc28gcmVtb3ZlIGFsbCBpdHMgY29ubmVjdGlvbnMuIFRoaXMgY2Fubm90IGJlIHVuZG9uZS5gLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYnRuUm93ID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLW1vZGFsLWJ1dHRvbnNcIiB9KTtcblxuXHRcdGNvbnN0IGNhbmNlbEJ0biA9IGJ0blJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ2FuY2VsXCIgfSk7XG5cdFx0Y2FuY2VsQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmNsb3NlKCkpO1xuXG5cdFx0Y29uc3QgZGVsZXRlQnRuID0gYnRuUm93LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcblx0XHRcdHRleHQ6IFwiRGVsZXRlXCIsXG5cdFx0XHRjbHM6IFwibHlyYS1idG4tZGFuZ2VyXCIsXG5cdFx0fSk7XG5cdFx0ZGVsZXRlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG5cdFx0XHR0aGlzLm9uQ29uZmlybSgpO1xuXHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0b25DbG9zZSgpIHtcblx0XHR0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuXHR9XG59XG5cbi8vIC0tLS0gRWRpdCBEZXNjcmlwdGlvbiBNb2RhbCAtLS0tXG5jbGFzcyBFZGl0RGVzY3JpcHRpb25Nb2RhbCBleHRlbmRzIE1vZGFsIHtcblx0cHJpdmF0ZSBjdXJyZW50RGVzYzogc3RyaW5nO1xuXHRwcml2YXRlIG9uU2F2ZTogKGRlc2M6IHN0cmluZykgPT4gdm9pZDtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgY3VycmVudERlc2M6IHN0cmluZywgb25TYXZlOiAoZGVzYzogc3RyaW5nKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoYXBwKTtcblx0XHR0aGlzLmN1cnJlbnREZXNjID0gY3VycmVudERlc2M7XG5cdFx0dGhpcy5vblNhdmUgPSBvblNhdmU7XG5cdH1cblxuXHRvbk9wZW4oKSB7XG5cdFx0Y29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG5cdFx0Y29udGVudEVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiBcIkVkaXQgRGVzY3JpcHRpb25cIiB9KTtcblxuXHRcdGNvbnN0IHRleHRhcmVhID0gY29udGVudEVsLmNyZWF0ZUVsKFwidGV4dGFyZWFcIiwge1xuXHRcdFx0Y2xzOiBcImx5cmEtZWRpdC10ZXh0YXJlYVwiLFxuXHRcdH0pO1xuXHRcdHRleHRhcmVhLnZhbHVlID0gdGhpcy5jdXJyZW50RGVzYztcblx0XHR0ZXh0YXJlYS5yb3dzID0gODtcblxuXHRcdGNvbnN0IGJ0blJvdyA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1tb2RhbC1idXR0b25zXCIgfSk7XG5cblx0XHRjb25zdCBjYW5jZWxCdG4gPSBidG5Sb3cuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNhbmNlbFwiIH0pO1xuXHRcdGNhbmNlbEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5jbG9zZSgpKTtcblxuXHRcdGNvbnN0IHNhdmVCdG4gPSBidG5Sb3cuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0dGV4dDogXCJTYXZlXCIsXG5cdFx0XHRjbHM6IFwibHlyYS1idG4tcHJpbWFyeVwiLFxuXHRcdH0pO1xuXHRcdHNhdmVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcblx0XHRcdHRoaXMub25TYXZlKHRleHRhcmVhLnZhbHVlKTtcblx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdG9uQ2xvc2UoKSB7XG5cdFx0dGhpcy5jb250ZW50RWwuZW1wdHkoKTtcblx0fVxufVxuXG4vLyAtLS0tIENvbmZpcm0gRGVsZXRlIENvbm5lY3Rpb24gTW9kYWwgLS0tLVxuY2xhc3MgQ29uZmlybURlbGV0ZUNvbm5lY3Rpb25Nb2RhbCBleHRlbmRzIE1vZGFsIHtcblx0cHJpdmF0ZSBjb25uTmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHJlbGF0aW9uOiBzdHJpbmc7XG5cdHByaXZhdGUgb25Db25maXJtOiAoKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBjb25uTmFtZTogc3RyaW5nLCByZWxhdGlvbjogc3RyaW5nLCBvbkNvbmZpcm06ICgpID0+IHZvaWQpIHtcblx0XHRzdXBlcihhcHApO1xuXHRcdHRoaXMuY29ubk5hbWUgPSBjb25uTmFtZTtcblx0XHR0aGlzLnJlbGF0aW9uID0gcmVsYXRpb247XG5cdFx0dGhpcy5vbkNvbmZpcm0gPSBvbkNvbmZpcm07XG5cdH1cblxuXHRvbk9wZW4oKSB7XG5cdFx0Y29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG5cdFx0Y29udGVudEVsLmNyZWF0ZUVsKFwiaDNcIiwgeyB0ZXh0OiBcIkRlbGV0ZSBDb25uZWN0aW9uXCIgfSk7XG5cdFx0Y29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7XG5cdFx0XHR0ZXh0OiBgUmVtb3ZlIFwiJHt0aGlzLnJlbGF0aW9ufVwiIGNvbm5lY3Rpb24gdG8gXCIke3RoaXMuY29ubk5hbWV9XCI/YCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGJ0blJvdyA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1tb2RhbC1idXR0b25zXCIgfSk7XG5cblx0XHRjb25zdCBjYW5jZWxCdG4gPSBidG5Sb3cuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNhbmNlbFwiIH0pO1xuXHRcdGNhbmNlbEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5jbG9zZSgpKTtcblxuXHRcdGNvbnN0IGRlbGV0ZUJ0biA9IGJ0blJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG5cdFx0XHR0ZXh0OiBcIkRlbGV0ZVwiLFxuXHRcdFx0Y2xzOiBcImx5cmEtYnRuLWRhbmdlclwiLFxuXHRcdH0pO1xuXHRcdGRlbGV0ZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5vbkNvbmZpcm0oKTtcblx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdG9uQ2xvc2UoKSB7XG5cdFx0dGhpcy5jb250ZW50RWwuZW1wdHkoKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBPYmplY3REZXRhaWxWaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xuXHRwbHVnaW46IEx5cmFCcmFpblBsdWdpbjtcblx0cHJpdmF0ZSBvYmplY3RJZDogc3RyaW5nID0gXCJcIjtcblx0cHJpdmF0ZSBvYmplY3Q6IEJyYWluT2JqZWN0IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcGx1Z2luOiBMeXJhQnJhaW5QbHVnaW4pIHtcblx0XHRzdXBlcihsZWFmKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcblx0fVxuXG5cdGdldFZpZXdUeXBlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIERFVEFJTF9WSUVXX1RZUEU7XG5cdH1cblxuXHRnZXREaXNwbGF5VGV4dCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm9iamVjdD8ubmFtZSB8fCBcIk9iamVjdCBEZXRhaWxcIjtcblx0fVxuXG5cdGdldEljb24oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gXCJmaWxlLXRleHRcIjtcblx0fVxuXG5cdGdldFN0YXRlKCkge1xuXHRcdHJldHVybiB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkIH07XG5cdH1cblxuXHRhc3luYyBzZXRTdGF0ZShzdGF0ZTogYW55LCByZXN1bHQ6IGFueSkge1xuXHRcdGlmIChzdGF0ZS5vYmplY3RJZCkge1xuXHRcdFx0dGhpcy5vYmplY3RJZCA9IHN0YXRlLm9iamVjdElkO1xuXHRcdFx0YXdhaXQgdGhpcy5sb2FkQW5kUmVuZGVyKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHN1cGVyLnNldFN0YXRlKHN0YXRlLCByZXN1bHQpO1xuXHR9XG5cblx0YXN5bmMgbG9hZEFuZFJlbmRlcigpIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lckVsLmNoaWxkcmVuWzFdIGFzIEhUTUxFbGVtZW50O1xuXHRcdGNvbnRhaW5lci5lbXB0eSgpO1xuXHRcdGNvbnRhaW5lci5hZGRDbGFzcyhcImx5cmEtZGV0YWlsLWNvbnRhaW5lclwiKTtcblxuXHRcdGlmICghdGhpcy5vYmplY3RJZCkge1xuXHRcdFx0Y29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgdGV4dDogXCJObyBvYmplY3Qgc2VsZWN0ZWRcIiwgY2xzOiBcImx5cmEtZW1wdHktc3RhdGVcIiB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyB0ZXh0OiBcIkxvYWRpbmcuLi5cIiwgY2xzOiBcImx5cmEtbG9hZGluZ1wiIH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFtvYmosIGNvbm5lY3Rpb25zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5wbHVnaW4uY2xpZW50LmdldE9iamVjdCh0aGlzLm9iamVjdElkKSxcblx0XHRcdFx0dGhpcy5wbHVnaW4uY2xpZW50LmdldENvbm5lY3Rpb25zKHRoaXMub2JqZWN0SWQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnRhaW5lci5lbXB0eSgpO1xuXG5cdFx0XHRpZiAoIW9iaikge1xuXHRcdFx0XHRjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyB0ZXh0OiBcIk9iamVjdCBub3QgZm91bmRcIiwgY2xzOiBcImx5cmEtZW1wdHktc3RhdGVcIiB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm9iamVjdCA9IG9iajtcblx0XHRcdHRoaXMubGVhZi51cGRhdGVIZWFkZXIoKTtcblx0XHRcdHRoaXMucmVuZGVyT2JqZWN0KGNvbnRhaW5lciwgb2JqLCBjb25uZWN0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHRjb250YWluZXIuZW1wdHkoKTtcblx0XHRcdGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IHRleHQ6IGBFcnJvcjogJHtlLm1lc3NhZ2V9YCwgY2xzOiBcImx5cmEtZW1wdHktc3RhdGVcIiB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck9iamVjdChjb250YWluZXI6IEhUTUxFbGVtZW50LCBvYmo6IEJyYWluT2JqZWN0LCBjb25uZWN0aW9uczogQnJhaW5Db25uZWN0aW9uW10pIHtcblx0XHQvLyBIZWFkZXIgc2VjdGlvblxuXHRcdGNvbnN0IGhlYWRlciA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtaGVhZGVyXCIgfSk7XG5cblx0XHRjb25zdCB0aXRsZVJvdyA9IGhlYWRlci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtdGl0bGUtcm93XCIgfSk7XG5cdFx0dGl0bGVSb3cuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IG9iai5uYW1lLCBjbHM6IFwibHlyYS1kZXRhaWwtbmFtZVwiIH0pO1xuXG5cdFx0Ly8gQWN0aW9uIGJ1dHRvbnNcblx0XHRjb25zdCBhY3Rpb25zID0gdGl0bGVSb3cuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLWFjdGlvbnNcIiB9KTtcblxuXHRcdGNvbnN0IGRlbGV0ZUJ0biA9IGFjdGlvbnMuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0Y2xzOiBcImx5cmEtYnRuLWljb24gbHlyYS1idG4tZGVsZXRlXCIsXG5cdFx0XHRhdHRyOiB7IFwiYXJpYS1sYWJlbFwiOiBcIkRlbGV0ZSBvYmplY3RcIiB9LFxuXHRcdH0pO1xuXHRcdHNldEljb24oZGVsZXRlQnRuLCBcInRyYXNoLTJcIik7XG5cdFx0ZGVsZXRlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmNvbmZpcm1EZWxldGUob2JqKSk7XG5cblx0XHRjb25zdCBiYWRnZXMgPSBoZWFkZXIuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtZGV0YWlsLWJhZGdlc1wiIH0pO1xuXHRcdGJhZGdlcy5jcmVhdGVFbChcInNwYW5cIiwgeyB0ZXh0OiBvYmoudHlwZSwgY2xzOiBcImx5cmEtdGFnIGx5cmEtdGFnLXR5cGVcIiB9KTtcblxuXHRcdC8vIFN0YXR1cyBhcyBhIGRyb3Bkb3duXG5cdFx0Y29uc3Qgc3RhdHVzU2VsZWN0ID0gYmFkZ2VzLmNyZWF0ZUVsKFwic2VsZWN0XCIsIHsgY2xzOiBcImx5cmEtc3RhdHVzLXNlbGVjdFwiIH0pO1xuXHRcdHN0YXR1c1NlbGVjdC5kYXRhc2V0LnN0YXR1cyA9IG9iai5zdGF0dXM7XG5cdFx0Zm9yIChjb25zdCBzIG9mIEFMTF9TVEFUVVNFUykge1xuXHRcdFx0Y29uc3Qgb3B0ID0gc3RhdHVzU2VsZWN0LmNyZWF0ZUVsKFwib3B0aW9uXCIsIHtcblx0XHRcdFx0dGV4dDogYCR7U1RBVFVTX0VNT0pJW3NdIHx8IFwiXHUyNUNGXCJ9ICR7c31gLFxuXHRcdFx0XHR2YWx1ZTogcyxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHMgPT09IG9iai5zdGF0dXMpIG9wdC5zZWxlY3RlZCA9IHRydWU7XG5cdFx0fVxuXHRcdHN0YXR1c1NlbGVjdC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1N0YXR1cyA9IHN0YXR1c1NlbGVjdC52YWx1ZTtcblx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLmNsaWVudC51cGRhdGVTdGF0dXMob2JqLmlkLCBuZXdTdGF0dXMpO1xuXHRcdFx0YXdhaXQgdGhpcy5sb2FkQW5kUmVuZGVyKCk7XG5cdFx0XHR0aGlzLnBsdWdpbi5yZWZyZXNoQnJhaW5WaWV3KCk7XG5cdFx0fSk7XG5cblx0XHQvLyBEZXNjcmlwdGlvbiAod2l0aCBlZGl0IGJ1dHRvbilcblx0XHRjb25zdCBkZXNjU2VjdGlvbiA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtc2VjdGlvblwiIH0pO1xuXHRcdGNvbnN0IGRlc2NIZWFkZXIgPSBkZXNjU2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1zZWN0aW9uLWhlYWRlclwiIH0pO1xuXHRcdGRlc2NIZWFkZXIuY3JlYXRlRWwoXCJoNFwiLCB7IHRleHQ6IFwiRGVzY3JpcHRpb25cIiB9KTtcblx0XHRjb25zdCBlZGl0RGVzY0J0biA9IGRlc2NIZWFkZXIuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0Y2xzOiBcImx5cmEtYnRuLWljb24gbHlyYS1idG4tZWRpdFwiLFxuXHRcdFx0YXR0cjogeyBcImFyaWEtbGFiZWxcIjogXCJFZGl0IGRlc2NyaXB0aW9uXCIgfSxcblx0XHR9KTtcblx0XHRzZXRJY29uKGVkaXREZXNjQnRuLCBcInBlbmNpbFwiKTtcblx0XHRlZGl0RGVzY0J0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdGhpcy5lZGl0RGVzY3JpcHRpb24ob2JqKSk7XG5cblx0XHRpZiAob2JqLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRkZXNjU2VjdGlvbi5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBvYmouZGVzY3JpcHRpb24sIGNsczogXCJseXJhLWRldGFpbC1kZXNjXCIgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlc2NTZWN0aW9uLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IFwiTm8gZGVzY3JpcHRpb25cIiwgY2xzOiBcImx5cmEtZGV0YWlsLWRlc2MgbHlyYS10ZXh0LWZhaW50XCIgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWV0YWRhdGFcblx0XHRjb25zdCBtZXRhU2VjdGlvbiA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtc2VjdGlvblwiIH0pO1xuXHRcdG1ldGFTZWN0aW9uLmNyZWF0ZUVsKFwiaDRcIiwgeyB0ZXh0OiBcIkRldGFpbHNcIiB9KTtcblx0XHRjb25zdCBtZXRhR3JpZCA9IG1ldGFTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1ncmlkXCIgfSk7XG5cblx0XHR0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiSURcIiwgb2JqLmlkKTtcblx0XHR0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiQ3JlYXRlZFwiLCB0aGlzLmZvcm1hdERhdGUob2JqLmNyZWF0ZWQpKTtcblx0XHR0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiTW9kaWZpZWRcIiwgdGhpcy5mb3JtYXREYXRlKG9iai5tb2RpZmllZCkpO1xuXHRcdGlmIChvYmoucGF0aCkgdGhpcy5hZGRNZXRhUm93KG1ldGFHcmlkLCBcIlBhdGhcIiwgb2JqLnBhdGgpO1xuXHRcdGlmIChvYmouc291cmNlX3Nlc3Npb24pIHRoaXMuYWRkTWV0YVJvdyhtZXRhR3JpZCwgXCJTb3VyY2VcIiwgb2JqLnNvdXJjZV9zZXNzaW9uKTtcblx0XHRpZiAob2JqLnJ1bGVzKSB0aGlzLmFkZE1ldGFSb3cobWV0YUdyaWQsIFwiUnVsZXNcIiwgb2JqLnJ1bGVzKTtcblxuXHRcdC8vIENvbm5lY3Rpb25zXG5cdFx0aWYgKGNvbm5lY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGNvbm5TZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWRldGFpbC1zZWN0aW9uXCIgfSk7XG5cdFx0XHRjb25uU2VjdGlvbi5jcmVhdGVFbChcImg0XCIsIHsgdGV4dDogYENvbm5lY3Rpb25zICgke2Nvbm5lY3Rpb25zLmxlbmd0aH0pYCB9KTtcblxuXHRcdFx0Y29uc3Qgb3V0Z29pbmcgPSBjb25uZWN0aW9ucy5maWx0ZXIoKGMpID0+IGMuZGlyZWN0aW9uID09PSBcIm91dGdvaW5nXCIpO1xuXHRcdFx0Y29uc3QgaW5jb21pbmcgPSBjb25uZWN0aW9ucy5maWx0ZXIoKGMpID0+IGMuZGlyZWN0aW9uID09PSBcImluY29taW5nXCIpO1xuXG5cdFx0XHRpZiAob3V0Z29pbmcubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBvdXRHcm91cCA9IGNvbm5TZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLWNvbm4tZ3JvdXBcIiB9KTtcblx0XHRcdFx0b3V0R3JvdXAuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogXCJPdXRnb2luZyBcdTIxOTJcIiwgY2xzOiBcImx5cmEtY29ubi1kaXJlY3Rpb25cIiB9KTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25uIG9mIG91dGdvaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJDb25uZWN0aW9uKG91dEdyb3VwLCBjb25uLCBvYmopO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbmNvbWluZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGluR3JvdXAgPSBjb25uU2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1jb25uLWdyb3VwXCIgfSk7XG5cdFx0XHRcdGluR3JvdXAuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogXCJcdTIxOTAgSW5jb21pbmdcIiwgY2xzOiBcImx5cmEtY29ubi1kaXJlY3Rpb25cIiB9KTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25uIG9mIGluY29taW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJDb25uZWN0aW9uKGluR3JvdXAsIGNvbm4sIG9iaik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUaW1lbGluZVxuXHRcdGNvbnN0IHRpbWVsaW5lID0gdGhpcy5wYXJzZVRpbWVsaW5lKG9iai50aW1lbGluZSk7XG5cdFx0aWYgKHRpbWVsaW5lLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHRsU2VjdGlvbiA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS1kZXRhaWwtc2VjdGlvblwiIH0pO1xuXHRcdFx0dGxTZWN0aW9uLmNyZWF0ZUVsKFwiaDRcIiwgeyB0ZXh0OiBgVGltZWxpbmUgKCR7dGltZWxpbmUubGVuZ3RofSlgIH0pO1xuXHRcdFx0Y29uc3QgdGxMaXN0ID0gdGxTZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXRpbWVsaW5lXCIgfSk7XG5cblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGltZWxpbmUucmV2ZXJzZSgpKSB7XG5cdFx0XHRcdGNvbnN0IHJvdyA9IHRsTGlzdC5jcmVhdGVEaXYoeyBjbHM6IFwibHlyYS10aW1lbGluZS1lbnRyeVwiIH0pO1xuXHRcdFx0XHRyb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogdGhpcy5mb3JtYXREYXRlKGVudHJ5LnRzKSwgY2xzOiBcImx5cmEtdGwtZGF0ZVwiIH0pO1xuXHRcdFx0XHRyb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogZW50cnkuZXZlbnQsIGNsczogXCJseXJhLXRsLWV2ZW50XCIgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb25uZWN0aW9uKHBhcmVudDogSFRNTEVsZW1lbnQsIGNvbm46IEJyYWluQ29ubmVjdGlvbiwgY3VycmVudE9iajogQnJhaW5PYmplY3QpIHtcblx0XHRjb25zdCByb3cgPSBwYXJlbnQuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtY29ubi1yb3dcIiB9KTtcblxuXHRcdGNvbnN0IHJlbGF0aW9uID0gcm93LmNyZWF0ZUVsKFwic3BhblwiLCB7XG5cdFx0XHR0ZXh0OiBjb25uLnJlbGF0aW9uLnJlcGxhY2UoL18vZywgXCIgXCIpLFxuXHRcdFx0Y2xzOiBcImx5cmEtY29ubi1yZWxhdGlvblwiLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGluayA9IHJvdy5jcmVhdGVFbChcImFcIiwge1xuXHRcdFx0dGV4dDogY29ubi5uYW1lLFxuXHRcdFx0Y2xzOiBcImx5cmEtY29ubi1saW5rXCIsXG5cdFx0XHRocmVmOiBcIiNcIixcblx0XHR9KTtcblx0XHRsaW5rLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0YXdhaXQgdGhpcy5uYXZpZ2F0ZVRvKGNvbm4uaWQpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWV0YSA9IHJvdy5jcmVhdGVFbChcInNwYW5cIiwge1xuXHRcdFx0dGV4dDogYCR7Y29ubi50eXBlfSBcdTAwQjcgJHtjb25uLnN0YXR1c31gLFxuXHRcdFx0Y2xzOiBcImx5cmEtY29ubi1tZXRhXCIsXG5cdFx0fSk7XG5cblx0XHQvLyBEZWxldGUgY29ubmVjdGlvbiBidXR0b25cblx0XHRjb25zdCBkZWxCdG4gPSByb3cuY3JlYXRlRWwoXCJidXR0b25cIiwge1xuXHRcdFx0Y2xzOiBcImx5cmEtYnRuLWljb24gbHlyYS1idG4tY29ubi1kZWxldGVcIixcblx0XHRcdGF0dHI6IHsgXCJhcmlhLWxhYmVsXCI6IFwiRGVsZXRlIGNvbm5lY3Rpb25cIiB9LFxuXHRcdH0pO1xuXHRcdHNldEljb24oZGVsQnRuLCBcInhcIik7XG5cdFx0ZGVsQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNvbnN0IGZyb21JZCA9IGNvbm4uZGlyZWN0aW9uID09PSBcIm91dGdvaW5nXCIgPyBjdXJyZW50T2JqLmlkIDogY29ubi5pZDtcblx0XHRcdGNvbnN0IHRvSWQgPSBjb25uLmRpcmVjdGlvbiA9PT0gXCJvdXRnb2luZ1wiID8gY29ubi5pZCA6IGN1cnJlbnRPYmouaWQ7XG5cdFx0XHRuZXcgQ29uZmlybURlbGV0ZUNvbm5lY3Rpb25Nb2RhbChcblx0XHRcdFx0dGhpcy5hcHAsXG5cdFx0XHRcdGNvbm4ubmFtZSxcblx0XHRcdFx0Y29ubi5yZWxhdGlvbixcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLmNsaWVudC5kZWxldGVDb25uZWN0aW9uKGZyb21JZCwgY29ubi5yZWxhdGlvbiwgdG9JZCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5sb2FkQW5kUmVuZGVyKCk7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4ucmVmcmVzaEJyYWluVmlldygpO1xuXHRcdFx0XHR9XG5cdFx0XHQpLm9wZW4oKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY29uZmlybURlbGV0ZShvYmo6IEJyYWluT2JqZWN0KSB7XG5cdFx0bmV3IENvbmZpcm1EZWxldGVNb2RhbCh0aGlzLmFwcCwgb2JqLm5hbWUsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLmNsaWVudC5kZWxldGVPYmplY3Qob2JqLmlkKTtcblx0XHRcdHRoaXMucGx1Z2luLnJlZnJlc2hCcmFpblZpZXcoKTtcblx0XHRcdHRoaXMubGVhZi5kZXRhY2goKTtcblx0XHR9KS5vcGVuKCk7XG5cdH1cblxuXHRwcml2YXRlIGVkaXREZXNjcmlwdGlvbihvYmo6IEJyYWluT2JqZWN0KSB7XG5cdFx0bmV3IEVkaXREZXNjcmlwdGlvbk1vZGFsKHRoaXMuYXBwLCBvYmouZGVzY3JpcHRpb24sIGFzeW5jIChuZXdEZXNjKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQudXBkYXRlRGVzY3JpcHRpb24ob2JqLmlkLCBuZXdEZXNjKTtcblx0XHRcdGF3YWl0IHRoaXMubG9hZEFuZFJlbmRlcigpO1xuXHRcdFx0dGhpcy5wbHVnaW4ucmVmcmVzaEJyYWluVmlldygpO1xuXHRcdH0pLm9wZW4oKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbmF2aWdhdGVUbyhvYmplY3RJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5vYmplY3RJZCA9IG9iamVjdElkO1xuXHRcdGF3YWl0IHRoaXMubG9hZEFuZFJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRNZXRhUm93KHBhcmVudDogSFRNTEVsZW1lbnQsIGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcblx0XHRjb25zdCByb3cgPSBwYXJlbnQuY3JlYXRlRGl2KHsgY2xzOiBcImx5cmEtbWV0YS1yb3dcIiB9KTtcblx0XHRyb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogbGFiZWwsIGNsczogXCJseXJhLW1ldGEtbGFiZWxcIiB9KTtcblx0XHRyb3cuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogdmFsdWUsIGNsczogXCJseXJhLW1ldGEtdmFsdWVcIiB9KTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0RGF0ZShkYXRlU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICghZGF0ZVN0cikgcmV0dXJuIFwiXHUyMDE0XCI7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGQgPSBuZXcgRGF0ZShkYXRlU3RyKTtcblx0XHRcdHJldHVybiBkLnRvTG9jYWxlRGF0ZVN0cmluZyhcImVuLUdCXCIsIHtcblx0XHRcdFx0ZGF5OiBcIjItZGlnaXRcIixcblx0XHRcdFx0bW9udGg6IFwic2hvcnRcIixcblx0XHRcdFx0eWVhcjogXCJudW1lcmljXCIsXG5cdFx0XHRcdGhvdXI6IFwiMi1kaWdpdFwiLFxuXHRcdFx0XHRtaW51dGU6IFwiMi1kaWdpdFwiLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZGF0ZVN0cjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlVGltZWxpbmUodGltZWxpbmVTdHI6IHN0cmluZyk6IFRpbWVsaW5lRW50cnlbXSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodGltZWxpbmVTdHIpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkgcmV0dXJuIHBhcnNlZDtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBvbkNsb3NlKCkge1xuXHRcdC8vIGNsZWFudXBcblx0fVxufVxuIiwgImltcG9ydCB7IEFwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHR5cGUgTHlyYUJyYWluUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTHlyYUJyYWluU2V0dGluZ3Mge1xuXHRlbmRwb2ludDogc3RyaW5nO1xuXHRhcGlLZXk6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0VUVElOR1M6IEx5cmFCcmFpblNldHRpbmdzID0ge1xuXHRlbmRwb2ludDogXCJodHRwczovL2JyYWluLnNha3VyYS5leGNoYW5nZVwiLFxuXHRhcGlLZXk6IFwiXCIsXG59O1xuXG5leHBvcnQgY2xhc3MgTHlyYUJyYWluU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuXHRwbHVnaW46IEx5cmFCcmFpblBsdWdpbjtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBMeXJhQnJhaW5QbHVnaW4pIHtcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG5cdH1cblxuXHRkaXNwbGF5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKTtcblxuXHRcdGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkx5cmEgQnJhaW5cIiB9KTtcblx0XHRjb250YWluZXJFbC5jcmVhdGVFbChcInBcIiwge1xuXHRcdFx0dGV4dDogXCJDb25uZWN0IHRvIEx5cmEtU2V2ZW4ncyBrbm93bGVkZ2UgZ3JhcGguXCIsXG5cdFx0XHRjbHM6IFwic2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uXCIsXG5cdFx0fSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiQVBJIEVuZHBvaW50XCIpXG5cdFx0XHQuc2V0RGVzYyhcIlVSTCBvZiB0aGUgYnJhaW4gc2VydmVyXCIpXG5cdFx0XHQuYWRkVGV4dCgodGV4dCkgPT5cblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcImh0dHBzOi8vYnJhaW4uc2FrdXJhLmV4Y2hhbmdlXCIpXG5cdFx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmVuZHBvaW50KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmVuZHBvaW50ID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJBUEkgS2V5XCIpXG5cdFx0XHQuc2V0RGVzYyhcIkF1dGhlbnRpY2F0aW9uIGtleSBmb3IgdGhlIGJyYWluIEFQSVwiKVxuXHRcdFx0LmFkZFRleHQoKHRleHQpID0+IHtcblx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcIkVudGVyIEFQSSBrZXlcIilcblx0XHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXBpS2V5KVxuXHRcdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmFwaUtleSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdHRleHQuaW5wdXRFbC50eXBlID0gXCJwYXNzd29yZFwiO1xuXHRcdFx0fSk7XG5cblx0XHQvLyBUZXN0IGNvbm5lY3Rpb24gYnV0dG9uXG5cdFx0Y29uc3QgdGVzdERpdiA9IGNvbnRhaW5lckVsLmNyZWF0ZURpdih7IGNsczogXCJseXJhLXRlc3QtY29ubmVjdGlvblwiIH0pO1xuXHRcdGNvbnN0IHRlc3RCdG4gPSB0ZXN0RGl2LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJUZXN0IENvbm5lY3Rpb25cIiB9KTtcblx0XHRjb25zdCB0ZXN0UmVzdWx0ID0gdGVzdERpdi5jcmVhdGVFbChcInNwYW5cIiwgeyBjbHM6IFwibHlyYS10ZXN0LXJlc3VsdFwiIH0pO1xuXG5cdFx0dGVzdEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGVzdFJlc3VsdC5zZXRUZXh0KFwiVGVzdGluZy4uLlwiKTtcblx0XHRcdHRlc3RSZXN1bHQuY2xhc3NOYW1lID0gXCJseXJhLXRlc3QtcmVzdWx0XCI7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnBsdWdpbi5jbGllbnQudGVzdENvbm5lY3Rpb24oKTtcblx0XHRcdHRlc3RSZXN1bHQuc2V0VGV4dChyZXN1bHQubWVzc2FnZSk7XG5cdFx0XHR0ZXN0UmVzdWx0LmNsYXNzTmFtZSA9IGBseXJhLXRlc3QtcmVzdWx0ICR7cmVzdWx0Lm9rID8gXCJseXJhLXRlc3Qtb2tcIiA6IFwibHlyYS10ZXN0LWZhaWxcIn1gO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBQUFBLG1CQUF1Qjs7O0FDQXZCLHNCQUE0QztBQW9DckMsSUFBTSxjQUFOLE1BQWtCO0FBQUEsRUFJeEIsWUFBWSxVQUFrQixRQUFnQjtBQUM3QyxTQUFLLFdBQVcsU0FBUyxRQUFRLFFBQVEsRUFBRTtBQUMzQyxTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFQSxhQUFhLFVBQWtCLFFBQWdCO0FBQzlDLFNBQUssV0FBVyxTQUFTLFFBQVEsUUFBUSxFQUFFO0FBQzNDLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVBLE1BQWMsT0FBTyxPQUFlLFNBQThCLENBQUMsR0FBNEI7QUFDOUYsVUFBTSxNQUF1QjtBQUFBLE1BQzVCLEtBQUssR0FBRyxLQUFLLFFBQVE7QUFBQSxNQUNyQixRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsUUFDUixnQkFBZ0I7QUFBQSxRQUNoQixhQUFhLEtBQUs7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsTUFBTSxLQUFLLFVBQVUsRUFBRSxPQUFPLE9BQU8sQ0FBQztBQUFBLElBQ3ZDO0FBQ0EsVUFBTSxNQUFNLFVBQU0sNEJBQVcsR0FBRztBQUNoQyxRQUFJLElBQUksS0FBSyxPQUFPO0FBQ25CLFlBQU0sSUFBSSxNQUFNLElBQUksS0FBSyxLQUFLO0FBQUEsSUFDL0I7QUFDQSxXQUFPLElBQUk7QUFBQSxFQUNaO0FBQUEsRUFFQSxNQUFNLGlCQUE0RDtBQW5FbkU7QUFvRUUsUUFBSTtBQUNILFlBQU0sTUFBdUI7QUFBQSxRQUM1QixLQUFLLEdBQUcsS0FBSyxRQUFRO0FBQUEsUUFDckIsUUFBUTtBQUFBLE1BQ1Q7QUFDQSxZQUFNLE1BQU0sVUFBTSw0QkFBVyxHQUFHO0FBQ2hDLFVBQUksSUFBSSxLQUFLLFdBQVcsTUFBTTtBQUM3QixjQUFNLFdBQVMsU0FBSSxLQUFLLGdCQUFULG1CQUFzQixXQUFVO0FBQy9DLGVBQU8sRUFBRSxJQUFJLE1BQU0sU0FBUyxvQkFBZSxNQUFNLGVBQWU7QUFBQSxNQUNqRTtBQUNBLGFBQU8sRUFBRSxJQUFJLE9BQU8sU0FBUyxzQkFBc0I7QUFBQSxJQUNwRCxTQUFTLEdBQVE7QUFDaEIsYUFBTyxFQUFFLElBQUksT0FBTyxTQUFTLEVBQUUsV0FBVyxvQkFBb0I7QUFBQSxJQUMvRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sa0JBQXdDO0FBQzdDLFVBQU0sTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFDQSxXQUFPLElBQUksS0FBSyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLEdBQUcsT0FBTyxFQUFFLENBQUMsRUFBRSxFQUFFO0FBQUEsRUFDekQ7QUFBQSxFQUVBLE1BQU0sWUFDTCxNQUNBLFFBQ0EsUUFBZ0IsS0FDUztBQUN6QixVQUFNLGFBQXVCLENBQUM7QUFDOUIsVUFBTSxTQUE4QixDQUFDO0FBRXJDLFFBQUksTUFBTTtBQUNULGlCQUFXLEtBQUssZ0JBQWdCO0FBQ2hDLGFBQU8sT0FBTztBQUFBLElBQ2Y7QUFDQSxRQUFJLFFBQVE7QUFDWCxpQkFBVyxLQUFLLG9CQUFvQjtBQUNwQyxhQUFPLFNBQVM7QUFBQSxJQUNqQjtBQUVBLFVBQU0sUUFBUSxXQUFXLFNBQVMsSUFBSSxTQUFTLFdBQVcsS0FBSyxPQUFPLENBQUMsS0FBSztBQUM1RSxVQUFNLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDdEIsb0JBQW9CLEtBQUssNENBQTRDLEtBQUs7QUFBQSxNQUMxRTtBQUFBLElBQ0Q7QUFDQSxXQUFPLElBQUksS0FBSyxJQUFJLENBQUMsTUFBTSxLQUFLLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ2xEO0FBQUEsRUFFQSxNQUFNLFVBQVUsVUFBK0M7QUFDOUQsVUFBTSxNQUFNLE1BQU0sS0FBSztBQUFBLE1BQ3RCO0FBQUEsTUFDQSxFQUFFLEtBQUssU0FBUztBQUFBLElBQ2pCO0FBQ0EsUUFBSSxJQUFJLEtBQUssV0FBVyxFQUFHLFFBQU87QUFDbEMsV0FBTyxLQUFLLFlBQVksSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7QUFBQSxFQUN2QztBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQThDO0FBQ2xFLFVBQU0sY0FBaUMsQ0FBQztBQUd4QyxVQUFNLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDdEI7QUFBQTtBQUFBO0FBQUEsTUFHQSxFQUFFLEtBQUssU0FBUztBQUFBLElBQ2pCO0FBQ0EsZUFBVyxLQUFLLElBQUksTUFBTTtBQUN6QixrQkFBWSxLQUFLO0FBQUEsUUFDaEIsVUFBVSxFQUFFLENBQUM7QUFBQSxRQUNiLE1BQU0sRUFBRSxDQUFDO0FBQUEsUUFDVCxNQUFNLEVBQUUsQ0FBQztBQUFBLFFBQ1QsUUFBUSxFQUFFLENBQUM7QUFBQSxRQUNYLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDUCxXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRjtBQUdBLFVBQU0sTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUN0QjtBQUFBO0FBQUE7QUFBQSxNQUdBLEVBQUUsS0FBSyxTQUFTO0FBQUEsSUFDakI7QUFDQSxlQUFXLEtBQUssSUFBSSxNQUFNO0FBQ3pCLGtCQUFZLEtBQUs7QUFBQSxRQUNoQixVQUFVLEVBQUUsQ0FBQztBQUFBLFFBQ2IsTUFBTSxFQUFFLENBQUM7QUFBQSxRQUNULE1BQU0sRUFBRSxDQUFDO0FBQUEsUUFDVCxRQUFRLEVBQUUsQ0FBQztBQUFBLFFBQ1gsSUFBSSxFQUFFLENBQUM7QUFBQSxRQUNQLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sY0FBYyxPQUFlLFFBQWdCLElBQTRCO0FBQzlFLFVBQU0sTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUN0QjtBQUFBO0FBQUEsOENBRTJDLEtBQUs7QUFBQSxNQUNoRCxFQUFFLEdBQUcsTUFBTTtBQUFBLElBQ1o7QUFDQSxXQUFPLElBQUksS0FBSyxJQUFJLENBQUMsTUFBTSxLQUFLLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ2xEO0FBQUEsRUFFQSxNQUFNLGFBQWEsVUFBa0IsV0FBcUM7QUFDekUsVUFBTSxVQUFVLEtBQUssVUFBVSxTQUFTO0FBQ3hDLFVBQU0sTUFBTSxNQUFNLEtBQUs7QUFBQSxNQUN0QixvREFBb0QsT0FBTztBQUFBLE1BQzNELEVBQUUsSUFBSSxTQUFTO0FBQUEsSUFDaEI7QUFDQSxXQUFPLElBQUksS0FBSyxTQUFTO0FBQUEsRUFDMUI7QUFBQSxFQUVBLE1BQU0sa0JBQWtCLFVBQWtCLGFBQXVDO0FBQ2hGLFVBQU0sVUFBVSxLQUFLLFVBQVUsV0FBVztBQUMxQyxVQUFNLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDdEIseURBQXlELE9BQU87QUFBQSxNQUNoRSxFQUFFLElBQUksU0FBUztBQUFBLElBQ2hCO0FBQ0EsV0FBTyxJQUFJLEtBQUssU0FBUztBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFNLGFBQWEsVUFBb0M7QUFFdEQsVUFBTSxLQUFLO0FBQUEsTUFDVjtBQUFBLE1BQ0EsRUFBRSxJQUFJLFNBQVM7QUFBQSxJQUNoQjtBQUVBLFVBQU0sS0FBSztBQUFBLE1BQ1Y7QUFBQSxNQUNBLEVBQUUsSUFBSSxTQUFTO0FBQUEsSUFDaEI7QUFFQSxVQUFNLEtBQUs7QUFBQSxNQUNWO0FBQUEsTUFDQSxFQUFFLElBQUksU0FBUztBQUFBLElBQ2hCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0saUJBQWlCLFFBQWdCLFVBQWtCLE1BQWdDO0FBQ3hGLFVBQU0sVUFBVSxLQUFLLFVBQVUsUUFBUTtBQUN2QyxVQUFNLEtBQUs7QUFBQSxNQUNWO0FBQUEsNkRBQzBELE9BQU87QUFBQTtBQUFBLE1BRWpFLEVBQUUsUUFBUSxLQUFLO0FBQUEsSUFDaEI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsVUFBVSxPQUF1QjtBQUN4QyxVQUFNLFVBQVUsTUFBTSxRQUFRLE9BQU8sTUFBTSxFQUFFLFFBQVEsTUFBTSxLQUFLLEVBQUUsUUFBUSxPQUFPLEtBQUs7QUFDdEYsV0FBTyxJQUFJLE9BQU87QUFBQSxFQUNuQjtBQUFBLEVBRVEsWUFBWSxLQUF1QjtBQUMxQyxXQUFPO0FBQUEsTUFDTixJQUFJLElBQUksTUFBTTtBQUFBLE1BQ2QsTUFBTSxJQUFJLFFBQVE7QUFBQSxNQUNsQixNQUFNLElBQUksUUFBUTtBQUFBLE1BQ2xCLFFBQVEsSUFBSSxVQUFVO0FBQUEsTUFDdEIsU0FBUyxJQUFJLFdBQVc7QUFBQSxNQUN4QixVQUFVLElBQUksWUFBWTtBQUFBLE1BQzFCLE1BQU0sSUFBSSxRQUFRO0FBQUEsTUFDbEIsYUFBYSxJQUFJLGVBQWU7QUFBQSxNQUNoQyxVQUFVLElBQUksWUFBWTtBQUFBLE1BQzFCLE9BQU8sSUFBSSxTQUFTO0FBQUEsTUFDcEIsZ0JBQWdCLElBQUksa0JBQWtCO0FBQUEsSUFDdkM7QUFBQSxFQUNEO0FBQ0Q7OztBQ3JQQSxJQUFBQyxtQkFBMkQ7OztBQ0EzRCxJQUFBQyxtQkFBc0U7QUFJL0QsSUFBTSxtQkFBbUI7QUFFaEMsSUFBTSxlQUFlLENBQUMsVUFBVSxVQUFVLFFBQVEsVUFBVSxXQUFXLFFBQVEsWUFBWTtBQU8zRixJQUFNLGVBQXVDO0FBQUEsRUFDNUMsUUFBUTtBQUFBLEVBQ1IsUUFBUTtBQUFBLEVBQ1IsTUFBTTtBQUFBLEVBQ04sUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUFBLEVBQ1QsTUFBTTtBQUFBLEVBQ04sWUFBWTtBQUNiO0FBR0EsSUFBTSxxQkFBTixjQUFpQyx1QkFBTTtBQUFBLEVBSXRDLFlBQVksS0FBVSxZQUFvQixXQUF1QjtBQUNoRSxVQUFNLEdBQUc7QUFDVCxTQUFLLGFBQWE7QUFDbEIsU0FBSyxZQUFZO0FBQUEsRUFDbEI7QUFBQSxFQUVBLFNBQVM7QUFDUixVQUFNLEVBQUUsVUFBVSxJQUFJO0FBQ3RCLGNBQVUsU0FBUyxNQUFNLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNsRCxjQUFVLFNBQVMsS0FBSztBQUFBLE1BQ3ZCLE1BQU0sb0NBQW9DLEtBQUssVUFBVTtBQUFBLElBQzFELENBQUM7QUFFRCxVQUFNLFNBQVMsVUFBVSxVQUFVLEVBQUUsS0FBSyxxQkFBcUIsQ0FBQztBQUVoRSxVQUFNLFlBQVksT0FBTyxTQUFTLFVBQVUsRUFBRSxNQUFNLFNBQVMsQ0FBQztBQUM5RCxjQUFVLGlCQUFpQixTQUFTLE1BQU0sS0FBSyxNQUFNLENBQUM7QUFFdEQsVUFBTSxZQUFZLE9BQU8sU0FBUyxVQUFVO0FBQUEsTUFDM0MsTUFBTTtBQUFBLE1BQ04sS0FBSztBQUFBLElBQ04sQ0FBQztBQUNELGNBQVUsaUJBQWlCLFNBQVMsTUFBTTtBQUN6QyxXQUFLLFVBQVU7QUFDZixXQUFLLE1BQU07QUFBQSxJQUNaLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxVQUFVO0FBQ1QsU0FBSyxVQUFVLE1BQU07QUFBQSxFQUN0QjtBQUNEO0FBR0EsSUFBTSx1QkFBTixjQUFtQyx1QkFBTTtBQUFBLEVBSXhDLFlBQVksS0FBVSxhQUFxQixRQUFnQztBQUMxRSxVQUFNLEdBQUc7QUFDVCxTQUFLLGNBQWM7QUFDbkIsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRUEsU0FBUztBQUNSLFVBQU0sRUFBRSxVQUFVLElBQUk7QUFDdEIsY0FBVSxTQUFTLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRXJELFVBQU0sV0FBVyxVQUFVLFNBQVMsWUFBWTtBQUFBLE1BQy9DLEtBQUs7QUFBQSxJQUNOLENBQUM7QUFDRCxhQUFTLFFBQVEsS0FBSztBQUN0QixhQUFTLE9BQU87QUFFaEIsVUFBTSxTQUFTLFVBQVUsVUFBVSxFQUFFLEtBQUsscUJBQXFCLENBQUM7QUFFaEUsVUFBTSxZQUFZLE9BQU8sU0FBUyxVQUFVLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDOUQsY0FBVSxpQkFBaUIsU0FBUyxNQUFNLEtBQUssTUFBTSxDQUFDO0FBRXRELFVBQU0sVUFBVSxPQUFPLFNBQVMsVUFBVTtBQUFBLE1BQ3pDLE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxJQUNOLENBQUM7QUFDRCxZQUFRLGlCQUFpQixTQUFTLE1BQU07QUFDdkMsV0FBSyxPQUFPLFNBQVMsS0FBSztBQUMxQixXQUFLLE1BQU07QUFBQSxJQUNaLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxVQUFVO0FBQ1QsU0FBSyxVQUFVLE1BQU07QUFBQSxFQUN0QjtBQUNEO0FBR0EsSUFBTSwrQkFBTixjQUEyQyx1QkFBTTtBQUFBLEVBS2hELFlBQVksS0FBVSxVQUFrQixVQUFrQixXQUF1QjtBQUNoRixVQUFNLEdBQUc7QUFDVCxTQUFLLFdBQVc7QUFDaEIsU0FBSyxXQUFXO0FBQ2hCLFNBQUssWUFBWTtBQUFBLEVBQ2xCO0FBQUEsRUFFQSxTQUFTO0FBQ1IsVUFBTSxFQUFFLFVBQVUsSUFBSTtBQUN0QixjQUFVLFNBQVMsTUFBTSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDdEQsY0FBVSxTQUFTLEtBQUs7QUFBQSxNQUN2QixNQUFNLFdBQVcsS0FBSyxRQUFRLG9CQUFvQixLQUFLLFFBQVE7QUFBQSxJQUNoRSxDQUFDO0FBRUQsVUFBTSxTQUFTLFVBQVUsVUFBVSxFQUFFLEtBQUsscUJBQXFCLENBQUM7QUFFaEUsVUFBTSxZQUFZLE9BQU8sU0FBUyxVQUFVLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDOUQsY0FBVSxpQkFBaUIsU0FBUyxNQUFNLEtBQUssTUFBTSxDQUFDO0FBRXRELFVBQU0sWUFBWSxPQUFPLFNBQVMsVUFBVTtBQUFBLE1BQzNDLE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxJQUNOLENBQUM7QUFDRCxjQUFVLGlCQUFpQixTQUFTLE1BQU07QUFDekMsV0FBSyxVQUFVO0FBQ2YsV0FBSyxNQUFNO0FBQUEsSUFDWixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsVUFBVTtBQUNULFNBQUssVUFBVSxNQUFNO0FBQUEsRUFDdEI7QUFDRDtBQUdPLElBQU0sbUJBQU4sY0FBK0IsMEJBQVM7QUFBQSxFQUs5QyxZQUFZLE1BQXFCLFFBQXlCO0FBQ3pELFVBQU0sSUFBSTtBQUpYLFNBQVEsV0FBbUI7QUFDM0IsU0FBUSxTQUE2QjtBQUlwQyxTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFQSxjQUFzQjtBQUNyQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsaUJBQXlCO0FBN0oxQjtBQThKRSxhQUFPLFVBQUssV0FBTCxtQkFBYSxTQUFRO0FBQUEsRUFDN0I7QUFBQSxFQUVBLFVBQWtCO0FBQ2pCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxXQUFXO0FBQ1YsV0FBTyxFQUFFLFVBQVUsS0FBSyxTQUFTO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE1BQU0sU0FBUyxPQUFZLFFBQWE7QUFDdkMsUUFBSSxNQUFNLFVBQVU7QUFDbkIsV0FBSyxXQUFXLE1BQU07QUFDdEIsWUFBTSxLQUFLLGNBQWM7QUFBQSxJQUMxQjtBQUNBLFVBQU0sTUFBTSxTQUFTLE9BQU8sTUFBTTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxNQUFNLGdCQUFnQjtBQUNyQixVQUFNLFlBQVksS0FBSyxZQUFZLFNBQVMsQ0FBQztBQUM3QyxjQUFVLE1BQU07QUFDaEIsY0FBVSxTQUFTLHVCQUF1QjtBQUUxQyxRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CLGdCQUFVLFNBQVMsT0FBTyxFQUFFLE1BQU0sc0JBQXNCLEtBQUssbUJBQW1CLENBQUM7QUFDakY7QUFBQSxJQUNEO0FBRUEsY0FBVSxTQUFTLE9BQU8sRUFBRSxNQUFNLGNBQWMsS0FBSyxlQUFlLENBQUM7QUFFckUsUUFBSTtBQUNILFlBQU0sQ0FBQyxLQUFLLFdBQVcsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQzVDLEtBQUssT0FBTyxPQUFPLFVBQVUsS0FBSyxRQUFRO0FBQUEsUUFDMUMsS0FBSyxPQUFPLE9BQU8sZUFBZSxLQUFLLFFBQVE7QUFBQSxNQUNoRCxDQUFDO0FBRUQsZ0JBQVUsTUFBTTtBQUVoQixVQUFJLENBQUMsS0FBSztBQUNULGtCQUFVLFNBQVMsT0FBTyxFQUFFLE1BQU0sb0JBQW9CLEtBQUssbUJBQW1CLENBQUM7QUFDL0U7QUFBQSxNQUNEO0FBRUEsV0FBSyxTQUFTO0FBQ2QsV0FBSyxLQUFLLGFBQWE7QUFDdkIsV0FBSyxhQUFhLFdBQVcsS0FBSyxXQUFXO0FBQUEsSUFDOUMsU0FBUyxHQUFRO0FBQ2hCLGdCQUFVLE1BQU07QUFDaEIsZ0JBQVUsU0FBUyxPQUFPLEVBQUUsTUFBTSxVQUFVLEVBQUUsT0FBTyxJQUFJLEtBQUssbUJBQW1CLENBQUM7QUFBQSxJQUNuRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQWEsV0FBd0IsS0FBa0IsYUFBZ0M7QUFFOUYsVUFBTSxTQUFTLFVBQVUsVUFBVSxFQUFFLEtBQUsscUJBQXFCLENBQUM7QUFFaEUsVUFBTSxXQUFXLE9BQU8sVUFBVSxFQUFFLEtBQUssd0JBQXdCLENBQUM7QUFDbEUsYUFBUyxTQUFTLE1BQU0sRUFBRSxNQUFNLElBQUksTUFBTSxLQUFLLG1CQUFtQixDQUFDO0FBR25FLFVBQU0sVUFBVSxTQUFTLFVBQVUsRUFBRSxLQUFLLHNCQUFzQixDQUFDO0FBRWpFLFVBQU0sWUFBWSxRQUFRLFNBQVMsVUFBVTtBQUFBLE1BQzVDLEtBQUs7QUFBQSxNQUNMLE1BQU0sRUFBRSxjQUFjLGdCQUFnQjtBQUFBLElBQ3ZDLENBQUM7QUFDRCxrQ0FBUSxXQUFXLFNBQVM7QUFDNUIsY0FBVSxpQkFBaUIsU0FBUyxNQUFNLEtBQUssY0FBYyxHQUFHLENBQUM7QUFFakUsVUFBTSxTQUFTLE9BQU8sVUFBVSxFQUFFLEtBQUsscUJBQXFCLENBQUM7QUFDN0QsV0FBTyxTQUFTLFFBQVEsRUFBRSxNQUFNLElBQUksTUFBTSxLQUFLLHlCQUF5QixDQUFDO0FBR3pFLFVBQU0sZUFBZSxPQUFPLFNBQVMsVUFBVSxFQUFFLEtBQUsscUJBQXFCLENBQUM7QUFDNUUsaUJBQWEsUUFBUSxTQUFTLElBQUk7QUFDbEMsZUFBVyxLQUFLLGNBQWM7QUFDN0IsWUFBTSxNQUFNLGFBQWEsU0FBUyxVQUFVO0FBQUEsUUFDM0MsTUFBTSxHQUFHLGFBQWEsQ0FBQyxLQUFLLFFBQUcsSUFBSSxDQUFDO0FBQUEsUUFDcEMsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUNELFVBQUksTUFBTSxJQUFJLE9BQVEsS0FBSSxXQUFXO0FBQUEsSUFDdEM7QUFDQSxpQkFBYSxpQkFBaUIsVUFBVSxZQUFZO0FBQ25ELFlBQU0sWUFBWSxhQUFhO0FBQy9CLFlBQU0sS0FBSyxPQUFPLE9BQU8sYUFBYSxJQUFJLElBQUksU0FBUztBQUN2RCxZQUFNLEtBQUssY0FBYztBQUN6QixXQUFLLE9BQU8saUJBQWlCO0FBQUEsSUFDOUIsQ0FBQztBQUdELFVBQU0sY0FBYyxVQUFVLFVBQVUsRUFBRSxLQUFLLHNCQUFzQixDQUFDO0FBQ3RFLFVBQU0sYUFBYSxZQUFZLFVBQVUsRUFBRSxLQUFLLHNCQUFzQixDQUFDO0FBQ3ZFLGVBQVcsU0FBUyxNQUFNLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDakQsVUFBTSxjQUFjLFdBQVcsU0FBUyxVQUFVO0FBQUEsTUFDakQsS0FBSztBQUFBLE1BQ0wsTUFBTSxFQUFFLGNBQWMsbUJBQW1CO0FBQUEsSUFDMUMsQ0FBQztBQUNELGtDQUFRLGFBQWEsUUFBUTtBQUM3QixnQkFBWSxpQkFBaUIsU0FBUyxNQUFNLEtBQUssZ0JBQWdCLEdBQUcsQ0FBQztBQUVyRSxRQUFJLElBQUksYUFBYTtBQUNwQixrQkFBWSxTQUFTLEtBQUssRUFBRSxNQUFNLElBQUksYUFBYSxLQUFLLG1CQUFtQixDQUFDO0FBQUEsSUFDN0UsT0FBTztBQUNOLGtCQUFZLFNBQVMsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLEtBQUssbUNBQW1DLENBQUM7QUFBQSxJQUM5RjtBQUdBLFVBQU0sY0FBYyxVQUFVLFVBQVUsRUFBRSxLQUFLLHNCQUFzQixDQUFDO0FBQ3RFLGdCQUFZLFNBQVMsTUFBTSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQzlDLFVBQU0sV0FBVyxZQUFZLFVBQVUsRUFBRSxLQUFLLG1CQUFtQixDQUFDO0FBRWxFLFNBQUssV0FBVyxVQUFVLE1BQU0sSUFBSSxFQUFFO0FBQ3RDLFNBQUssV0FBVyxVQUFVLFdBQVcsS0FBSyxXQUFXLElBQUksT0FBTyxDQUFDO0FBQ2pFLFNBQUssV0FBVyxVQUFVLFlBQVksS0FBSyxXQUFXLElBQUksUUFBUSxDQUFDO0FBQ25FLFFBQUksSUFBSSxLQUFNLE1BQUssV0FBVyxVQUFVLFFBQVEsSUFBSSxJQUFJO0FBQ3hELFFBQUksSUFBSSxlQUFnQixNQUFLLFdBQVcsVUFBVSxVQUFVLElBQUksY0FBYztBQUM5RSxRQUFJLElBQUksTUFBTyxNQUFLLFdBQVcsVUFBVSxTQUFTLElBQUksS0FBSztBQUczRCxRQUFJLFlBQVksU0FBUyxHQUFHO0FBQzNCLFlBQU0sY0FBYyxVQUFVLFVBQVUsRUFBRSxLQUFLLHNCQUFzQixDQUFDO0FBQ3RFLGtCQUFZLFNBQVMsTUFBTSxFQUFFLE1BQU0sZ0JBQWdCLFlBQVksTUFBTSxJQUFJLENBQUM7QUFFMUUsWUFBTSxXQUFXLFlBQVksT0FBTyxDQUFDLE1BQU0sRUFBRSxjQUFjLFVBQVU7QUFDckUsWUFBTSxXQUFXLFlBQVksT0FBTyxDQUFDLE1BQU0sRUFBRSxjQUFjLFVBQVU7QUFFckUsVUFBSSxTQUFTLFNBQVMsR0FBRztBQUN4QixjQUFNLFdBQVcsWUFBWSxVQUFVLEVBQUUsS0FBSyxrQkFBa0IsQ0FBQztBQUNqRSxpQkFBUyxTQUFTLFFBQVEsRUFBRSxNQUFNLG1CQUFjLEtBQUssc0JBQXNCLENBQUM7QUFDNUUsbUJBQVcsUUFBUSxVQUFVO0FBQzVCLGVBQUssaUJBQWlCLFVBQVUsTUFBTSxHQUFHO0FBQUEsUUFDMUM7QUFBQSxNQUNEO0FBRUEsVUFBSSxTQUFTLFNBQVMsR0FBRztBQUN4QixjQUFNLFVBQVUsWUFBWSxVQUFVLEVBQUUsS0FBSyxrQkFBa0IsQ0FBQztBQUNoRSxnQkFBUSxTQUFTLFFBQVEsRUFBRSxNQUFNLG1CQUFjLEtBQUssc0JBQXNCLENBQUM7QUFDM0UsbUJBQVcsUUFBUSxVQUFVO0FBQzVCLGVBQUssaUJBQWlCLFNBQVMsTUFBTSxHQUFHO0FBQUEsUUFDekM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFVBQU0sV0FBVyxLQUFLLGNBQWMsSUFBSSxRQUFRO0FBQ2hELFFBQUksU0FBUyxTQUFTLEdBQUc7QUFDeEIsWUFBTSxZQUFZLFVBQVUsVUFBVSxFQUFFLEtBQUssc0JBQXNCLENBQUM7QUFDcEUsZ0JBQVUsU0FBUyxNQUFNLEVBQUUsTUFBTSxhQUFhLFNBQVMsTUFBTSxJQUFJLENBQUM7QUFDbEUsWUFBTSxTQUFTLFVBQVUsVUFBVSxFQUFFLEtBQUssZ0JBQWdCLENBQUM7QUFFM0QsaUJBQVcsU0FBUyxTQUFTLFFBQVEsR0FBRztBQUN2QyxjQUFNLE1BQU0sT0FBTyxVQUFVLEVBQUUsS0FBSyxzQkFBc0IsQ0FBQztBQUMzRCxZQUFJLFNBQVMsUUFBUSxFQUFFLE1BQU0sS0FBSyxXQUFXLE1BQU0sRUFBRSxHQUFHLEtBQUssZUFBZSxDQUFDO0FBQzdFLFlBQUksU0FBUyxRQUFRLEVBQUUsTUFBTSxNQUFNLE9BQU8sS0FBSyxnQkFBZ0IsQ0FBQztBQUFBLE1BQ2pFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlCQUFpQixRQUFxQixNQUF1QixZQUF5QjtBQUM3RixVQUFNLE1BQU0sT0FBTyxVQUFVLEVBQUUsS0FBSyxnQkFBZ0IsQ0FBQztBQUVyRCxVQUFNLFdBQVcsSUFBSSxTQUFTLFFBQVE7QUFBQSxNQUNyQyxNQUFNLEtBQUssU0FBUyxRQUFRLE1BQU0sR0FBRztBQUFBLE1BQ3JDLEtBQUs7QUFBQSxJQUNOLENBQUM7QUFFRCxVQUFNLE9BQU8sSUFBSSxTQUFTLEtBQUs7QUFBQSxNQUM5QixNQUFNLEtBQUs7QUFBQSxNQUNYLEtBQUs7QUFBQSxNQUNMLE1BQU07QUFBQSxJQUNQLENBQUM7QUFDRCxTQUFLLGlCQUFpQixTQUFTLE9BQU8sTUFBTTtBQUMzQyxRQUFFLGVBQWU7QUFDakIsWUFBTSxLQUFLLFdBQVcsS0FBSyxFQUFFO0FBQUEsSUFDOUIsQ0FBQztBQUVELFVBQU0sT0FBTyxJQUFJLFNBQVMsUUFBUTtBQUFBLE1BQ2pDLE1BQU0sR0FBRyxLQUFLLElBQUksU0FBTSxLQUFLLE1BQU07QUFBQSxNQUNuQyxLQUFLO0FBQUEsSUFDTixDQUFDO0FBR0QsVUFBTSxTQUFTLElBQUksU0FBUyxVQUFVO0FBQUEsTUFDckMsS0FBSztBQUFBLE1BQ0wsTUFBTSxFQUFFLGNBQWMsb0JBQW9CO0FBQUEsSUFDM0MsQ0FBQztBQUNELGtDQUFRLFFBQVEsR0FBRztBQUNuQixXQUFPLGlCQUFpQixTQUFTLENBQUMsTUFBTTtBQUN2QyxRQUFFLGdCQUFnQjtBQUNsQixZQUFNLFNBQVMsS0FBSyxjQUFjLGFBQWEsV0FBVyxLQUFLLEtBQUs7QUFDcEUsWUFBTSxPQUFPLEtBQUssY0FBYyxhQUFhLEtBQUssS0FBSyxXQUFXO0FBQ2xFLFVBQUk7QUFBQSxRQUNILEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLFlBQVk7QUFDWCxnQkFBTSxLQUFLLE9BQU8sT0FBTyxpQkFBaUIsUUFBUSxLQUFLLFVBQVUsSUFBSTtBQUNyRSxnQkFBTSxLQUFLLGNBQWM7QUFDekIsZUFBSyxPQUFPLGlCQUFpQjtBQUFBLFFBQzlCO0FBQUEsTUFDRCxFQUFFLEtBQUs7QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxjQUFjLEtBQWtCO0FBQ3ZDLFFBQUksbUJBQW1CLEtBQUssS0FBSyxJQUFJLE1BQU0sWUFBWTtBQUN0RCxZQUFNLEtBQUssT0FBTyxPQUFPLGFBQWEsSUFBSSxFQUFFO0FBQzVDLFdBQUssT0FBTyxpQkFBaUI7QUFDN0IsV0FBSyxLQUFLLE9BQU87QUFBQSxJQUNsQixDQUFDLEVBQUUsS0FBSztBQUFBLEVBQ1Q7QUFBQSxFQUVRLGdCQUFnQixLQUFrQjtBQUN6QyxRQUFJLHFCQUFxQixLQUFLLEtBQUssSUFBSSxhQUFhLE9BQU8sWUFBWTtBQUN0RSxZQUFNLEtBQUssT0FBTyxPQUFPLGtCQUFrQixJQUFJLElBQUksT0FBTztBQUMxRCxZQUFNLEtBQUssY0FBYztBQUN6QixXQUFLLE9BQU8saUJBQWlCO0FBQUEsSUFDOUIsQ0FBQyxFQUFFLEtBQUs7QUFBQSxFQUNUO0FBQUEsRUFFQSxNQUFjLFdBQVcsVUFBa0I7QUFDMUMsU0FBSyxXQUFXO0FBQ2hCLFVBQU0sS0FBSyxjQUFjO0FBQUEsRUFDMUI7QUFBQSxFQUVRLFdBQVcsUUFBcUIsT0FBZSxPQUFlO0FBQ3JFLFVBQU0sTUFBTSxPQUFPLFVBQVUsRUFBRSxLQUFLLGdCQUFnQixDQUFDO0FBQ3JELFFBQUksU0FBUyxRQUFRLEVBQUUsTUFBTSxPQUFPLEtBQUssa0JBQWtCLENBQUM7QUFDNUQsUUFBSSxTQUFTLFFBQVEsRUFBRSxNQUFNLE9BQU8sS0FBSyxrQkFBa0IsQ0FBQztBQUFBLEVBQzdEO0FBQUEsRUFFUSxXQUFXLFNBQXlCO0FBQzNDLFFBQUksQ0FBQyxRQUFTLFFBQU87QUFDckIsUUFBSTtBQUNILFlBQU0sSUFBSSxJQUFJLEtBQUssT0FBTztBQUMxQixhQUFPLEVBQUUsbUJBQW1CLFNBQVM7QUFBQSxRQUNwQyxLQUFLO0FBQUEsUUFDTCxPQUFPO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsTUFDVCxDQUFDO0FBQUEsSUFDRixTQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLGFBQXNDO0FBQzNELFFBQUk7QUFDSCxZQUFNLFNBQVMsS0FBSyxNQUFNLFdBQVc7QUFDckMsVUFBSSxNQUFNLFFBQVEsTUFBTSxFQUFHLFFBQU87QUFDbEMsYUFBTyxDQUFDO0FBQUEsSUFDVCxTQUFRO0FBQ1AsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sVUFBVTtBQUFBLEVBRWhCO0FBQ0Q7OztBRDlaTyxJQUFNLGtCQUFrQjtBQUUvQixJQUFNLGdCQUF3QztBQUFBLEVBQzdDLFFBQVE7QUFBQSxFQUNSLFFBQVE7QUFBQSxFQUNSLE1BQU07QUFBQSxFQUNOLFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFBQSxFQUNULE1BQU07QUFBQSxFQUNOLFlBQVk7QUFDYjtBQUVPLElBQU0sWUFBTixjQUF3QiwwQkFBUztBQUFBLEVBU3ZDLFlBQVksTUFBcUIsUUFBeUI7QUFDekQsVUFBTSxJQUFJO0FBSlgsU0FBUSxlQUE4QjtBQUN0QyxTQUFRLGFBQTBCLENBQUM7QUFJbEMsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRUEsY0FBc0I7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGlCQUF5QjtBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsVUFBa0I7QUFDakIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sU0FBUztBQUNkLFVBQU0sWUFBWSxLQUFLLFlBQVksU0FBUyxDQUFDO0FBQzdDLGNBQVUsTUFBTTtBQUNoQixjQUFVLFNBQVMsc0JBQXNCO0FBR3pDLFVBQU0sU0FBUyxVQUFVLFVBQVUsRUFBRSxLQUFLLG9CQUFvQixDQUFDO0FBQy9ELFdBQU8sU0FBUyxRQUFRLEVBQUUsTUFBTSxjQUFjLEtBQUssbUJBQW1CLENBQUM7QUFFdkUsVUFBTSxhQUFhLE9BQU8sU0FBUyxVQUFVLEVBQUUsS0FBSyxpQkFBaUIsTUFBTSxFQUFFLGNBQWMsVUFBVSxFQUFFLENBQUM7QUFDeEcsa0NBQVEsWUFBWSxZQUFZO0FBQ2hDLGVBQVcsaUJBQWlCLFNBQVMsTUFBTSxLQUFLLFFBQVEsQ0FBQztBQUd6RCxVQUFNLGFBQWEsVUFBVSxVQUFVLEVBQUUsS0FBSyxtQkFBbUIsQ0FBQztBQUNsRSxTQUFLLGNBQWMsV0FBVyxTQUFTLFNBQVM7QUFBQSxNQUMvQyxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixLQUFLO0FBQUEsSUFDTixDQUFDO0FBQ0QsU0FBSyxZQUFZO0FBQUEsTUFDaEI7QUFBQSxVQUNBLDJCQUFTLE1BQU0sS0FBSyxTQUFTLEdBQUcsS0FBSyxJQUFJO0FBQUEsSUFDMUM7QUFHQSxTQUFLLGNBQWMsVUFBVSxVQUFVLEVBQUUsS0FBSyxrQkFBa0IsQ0FBQztBQUdqRSxTQUFLLGVBQWUsVUFBVSxVQUFVLEVBQUUsS0FBSyxtQkFBbUIsQ0FBQztBQUduRSxTQUFLLGNBQWMsVUFBVSxVQUFVLEVBQUUsS0FBSyxrQkFBa0IsQ0FBQztBQUVqRSxVQUFNLEtBQUssUUFBUTtBQUFBLEVBQ3BCO0FBQUEsRUFFQSxNQUFNLFVBQVU7QUFDZixTQUFLLFlBQVksUUFBUSxZQUFZO0FBQ3JDLFFBQUk7QUFDSCxXQUFLLGFBQWEsTUFBTSxLQUFLLE9BQU8sT0FBTyxnQkFBZ0I7QUFDM0QsV0FBSyxnQkFBZ0I7QUFDckIsWUFBTSxLQUFLLFlBQVk7QUFBQSxJQUN4QixTQUFTLEdBQVE7QUFDaEIsV0FBSyxZQUFZLFFBQVEsVUFBVSxFQUFFLE9BQU8sRUFBRTtBQUM5QyxXQUFLLGFBQWEsTUFBTTtBQUN4QixXQUFLLGFBQWEsU0FBUyxPQUFPO0FBQUEsUUFDakMsTUFBTTtBQUFBLFFBQ04sS0FBSztBQUFBLE1BQ04sQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0I7QUFDekIsU0FBSyxZQUFZLE1BQU07QUFHdkIsVUFBTSxXQUFXLEtBQUssV0FBVyxPQUFPLENBQUMsR0FBRyxNQUFNLElBQUksRUFBRSxPQUFPLENBQUM7QUFDaEUsVUFBTSxVQUFVLEtBQUssWUFBWSxTQUFTLFVBQVU7QUFBQSxNQUNuRCxNQUFNLFFBQVEsUUFBUTtBQUFBLE1BQ3RCLEtBQUssYUFBYSxLQUFLLGlCQUFpQixPQUFPLHFCQUFxQixFQUFFO0FBQUEsSUFDdkUsQ0FBQztBQUNELFlBQVEsaUJBQWlCLFNBQVMsTUFBTTtBQUN2QyxXQUFLLGVBQWU7QUFDcEIsV0FBSyxnQkFBZ0I7QUFDckIsV0FBSyxZQUFZO0FBQUEsSUFDbEIsQ0FBQztBQUVELGVBQVcsTUFBTSxLQUFLLFlBQVk7QUFDakMsWUFBTSxPQUFPLEtBQUssWUFBWSxTQUFTLFVBQVU7QUFBQSxRQUNoRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEtBQUssR0FBRyxLQUFLO0FBQUEsUUFDN0IsS0FBSyxhQUFhLEtBQUssaUJBQWlCLEdBQUcsT0FBTyxxQkFBcUIsRUFBRTtBQUFBLE1BQzFFLENBQUM7QUFDRCxXQUFLLGlCQUFpQixTQUFTLE1BQU07QUFDcEMsYUFBSyxlQUFlLEdBQUc7QUFDdkIsYUFBSyxnQkFBZ0I7QUFDckIsYUFBSyxZQUFZO0FBQUEsTUFDbEIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGNBQWM7QUFDM0IsU0FBSyxhQUFhLE1BQU07QUFDeEIsU0FBSyxZQUFZLFFBQVEsWUFBWTtBQUVyQyxRQUFJO0FBQ0gsWUFBTSxVQUFVLE1BQU0sS0FBSyxPQUFPLE9BQU87QUFBQSxRQUN4QyxLQUFLLGdCQUFnQjtBQUFBLFFBQ3JCO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGNBQWMsT0FBTztBQUMxQixXQUFLLFlBQVksUUFBUSxHQUFHLFFBQVEsTUFBTSxVQUFVO0FBQUEsSUFDckQsU0FBUyxHQUFRO0FBQ2hCLFdBQUssWUFBWSxRQUFRLFVBQVUsRUFBRSxPQUFPLEVBQUU7QUFBQSxJQUMvQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsV0FBVztBQUN4QixVQUFNLFFBQVEsS0FBSyxZQUFZLE1BQU0sS0FBSztBQUMxQyxRQUFJLENBQUMsT0FBTztBQUNYLFlBQU0sS0FBSyxZQUFZO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFNBQUssYUFBYSxNQUFNO0FBQ3hCLFNBQUssWUFBWSxRQUFRLGNBQWM7QUFFdkMsUUFBSTtBQUNILFlBQU0sVUFBVSxNQUFNLEtBQUssT0FBTyxPQUFPLGNBQWMsS0FBSztBQUM1RCxXQUFLLGNBQWMsT0FBTztBQUMxQixXQUFLLFlBQVksUUFBUSxHQUFHLFFBQVEsTUFBTSxpQkFBaUIsS0FBSyxHQUFHO0FBQUEsSUFDcEUsU0FBUyxHQUFRO0FBQ2hCLFdBQUssWUFBWSxRQUFRLGlCQUFpQixFQUFFLE9BQU8sRUFBRTtBQUFBLElBQ3REO0FBQUEsRUFDRDtBQUFBLEVBRVEsY0FBYyxTQUF3QjtBQUM3QyxTQUFLLGFBQWEsTUFBTTtBQUV4QixRQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCLFdBQUssYUFBYSxTQUFTLE9BQU87QUFBQSxRQUNqQyxNQUFNO0FBQUEsUUFDTixLQUFLO0FBQUEsTUFDTixDQUFDO0FBQ0Q7QUFBQSxJQUNEO0FBRUEsZUFBVyxPQUFPLFNBQVM7QUFDMUIsWUFBTSxNQUFNLEtBQUssYUFBYSxVQUFVLEVBQUUsS0FBSyxrQkFBa0IsQ0FBQztBQUNsRSxVQUFJLGlCQUFpQixTQUFTLE1BQU0sS0FBSyxXQUFXLEdBQUcsQ0FBQztBQUV4RCxZQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsS0FBSyxtQkFBbUIsQ0FBQztBQUN4RCxhQUFPLFFBQVEsSUFBSSxJQUFJO0FBRXZCLFlBQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxLQUFLLG1CQUFtQixDQUFDO0FBRXhELFlBQU0sVUFBVSxPQUFPLFNBQVMsUUFBUTtBQUFBLFFBQ3ZDLE1BQU0sSUFBSTtBQUFBLFFBQ1YsS0FBSztBQUFBLE1BQ04sQ0FBQztBQUVELFlBQU0sWUFBWSxPQUFPLFNBQVMsUUFBUTtBQUFBLFFBQ3pDLE1BQU0sSUFBSTtBQUFBLFFBQ1YsS0FBSztBQUFBLE1BQ04sQ0FBQztBQUNELFlBQU0sUUFBUSxjQUFjLElBQUksTUFBTSxLQUFLO0FBQzNDLGdCQUFVLE1BQU0sWUFBWSxrQkFBa0IsS0FBSztBQUFBLElBQ3BEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxXQUFXLEtBQWtCO0FBQzFDLFVBQU0sU0FBUyxLQUFLLElBQUksVUFBVSxnQkFBZ0IsZ0JBQWdCO0FBQ2xFLFFBQUk7QUFFSixRQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLGFBQU8sT0FBTyxDQUFDO0FBQUEsSUFDaEIsT0FBTztBQUNOLGFBQU8sS0FBSyxJQUFJLFVBQVUsUUFBUSxLQUFLO0FBQUEsSUFDeEM7QUFFQSxVQUFNLEtBQUssYUFBYTtBQUFBLE1BQ3ZCLE1BQU07QUFBQSxNQUNOLE9BQU8sRUFBRSxVQUFVLElBQUksR0FBRztBQUFBLElBQzNCLENBQUM7QUFDRCxTQUFLLElBQUksVUFBVSxXQUFXLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRUEsTUFBTSxVQUFVO0FBQUEsRUFFaEI7QUFDRDs7O0FFdE5BLElBQUFDLG1CQUErQztBQVF4QyxJQUFNLG1CQUFzQztBQUFBLEVBQ2xELFVBQVU7QUFBQSxFQUNWLFFBQVE7QUFDVDtBQUVPLElBQU0sc0JBQU4sY0FBa0Msa0NBQWlCO0FBQUEsRUFHekQsWUFBWSxLQUFVLFFBQXlCO0FBQzlDLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsVUFBTSxFQUFFLFlBQVksSUFBSTtBQUN4QixnQkFBWSxNQUFNO0FBRWxCLGdCQUFZLFNBQVMsTUFBTSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ2pELGdCQUFZLFNBQVMsS0FBSztBQUFBLE1BQ3pCLE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxJQUNOLENBQUM7QUFFRCxRQUFJLHlCQUFRLFdBQVcsRUFDckIsUUFBUSxjQUFjLEVBQ3RCLFFBQVEseUJBQXlCLEVBQ2pDO0FBQUEsTUFBUSxDQUFDLFNBQ1QsS0FDRSxlQUFlLCtCQUErQixFQUM5QyxTQUFTLEtBQUssT0FBTyxTQUFTLFFBQVEsRUFDdEMsU0FBUyxPQUFPLFVBQVU7QUFDMUIsYUFBSyxPQUFPLFNBQVMsV0FBVztBQUNoQyxjQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDaEMsQ0FBQztBQUFBLElBQ0g7QUFFRCxRQUFJLHlCQUFRLFdBQVcsRUFDckIsUUFBUSxTQUFTLEVBQ2pCLFFBQVEsc0NBQXNDLEVBQzlDLFFBQVEsQ0FBQyxTQUFTO0FBQ2xCLFdBQ0UsZUFBZSxlQUFlLEVBQzlCLFNBQVMsS0FBSyxPQUFPLFNBQVMsTUFBTSxFQUNwQyxTQUFTLE9BQU8sVUFBVTtBQUMxQixhQUFLLE9BQU8sU0FBUyxTQUFTO0FBQzlCLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNoQyxDQUFDO0FBQ0YsV0FBSyxRQUFRLE9BQU87QUFBQSxJQUNyQixDQUFDO0FBR0YsVUFBTSxVQUFVLFlBQVksVUFBVSxFQUFFLEtBQUssdUJBQXVCLENBQUM7QUFDckUsVUFBTSxVQUFVLFFBQVEsU0FBUyxVQUFVLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN0RSxVQUFNLGFBQWEsUUFBUSxTQUFTLFFBQVEsRUFBRSxLQUFLLG1CQUFtQixDQUFDO0FBRXZFLFlBQVEsaUJBQWlCLFNBQVMsWUFBWTtBQUM3QyxpQkFBVyxRQUFRLFlBQVk7QUFDL0IsaUJBQVcsWUFBWTtBQUN2QixZQUFNLFNBQVMsTUFBTSxLQUFLLE9BQU8sT0FBTyxlQUFlO0FBQ3ZELGlCQUFXLFFBQVEsT0FBTyxPQUFPO0FBQ2pDLGlCQUFXLFlBQVksb0JBQW9CLE9BQU8sS0FBSyxpQkFBaUIsZ0JBQWdCO0FBQUEsSUFDekYsQ0FBQztBQUFBLEVBQ0Y7QUFDRDs7O0FKN0RBLElBQXFCLGtCQUFyQixjQUE2Qyx3QkFBTztBQUFBLEVBSW5ELE1BQU0sU0FBUztBQUNkLFVBQU0sS0FBSyxhQUFhO0FBRXhCLFNBQUssU0FBUyxJQUFJLFlBQVksS0FBSyxTQUFTLFVBQVUsS0FBSyxTQUFTLE1BQU07QUFHMUUsU0FBSyxhQUFhLGlCQUFpQixDQUFDLFNBQVMsSUFBSSxVQUFVLE1BQU0sSUFBSSxDQUFDO0FBQ3RFLFNBQUssYUFBYSxrQkFBa0IsQ0FBQyxTQUFTLElBQUksaUJBQWlCLE1BQU0sSUFBSSxDQUFDO0FBRzlFLFNBQUssY0FBYyxJQUFJLG9CQUFvQixLQUFLLEtBQUssSUFBSSxDQUFDO0FBRzFELFNBQUssY0FBYyxTQUFTLGNBQWMsTUFBTTtBQUMvQyxXQUFLLGtCQUFrQjtBQUFBLElBQ3hCLENBQUM7QUFHRCxTQUFLLFdBQVc7QUFBQSxNQUNmLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFVBQVUsTUFBTSxLQUFLLGtCQUFrQjtBQUFBLElBQ3hDLENBQUM7QUFBQSxFQUVGO0FBQUEsRUFFQSxtQkFBbUI7QUFDbEIsVUFBTSxTQUFTLEtBQUssSUFBSSxVQUFVLGdCQUFnQixlQUFlO0FBQ2pFLGVBQVcsUUFBUSxRQUFRO0FBQzFCLFlBQU0sT0FBTyxLQUFLO0FBQ2xCLFVBQUksNkJBQU0sU0FBUztBQUNsQixhQUFLLFFBQVE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sb0JBQW9CO0FBQ3pCLFVBQU0sV0FBVyxLQUFLLElBQUksVUFBVSxnQkFBZ0IsZUFBZTtBQUNuRSxRQUFJLFNBQVMsU0FBUyxHQUFHO0FBQ3hCLFdBQUssSUFBSSxVQUFVLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFDekM7QUFBQSxJQUNEO0FBRUEsVUFBTSxPQUFPLEtBQUssSUFBSSxVQUFVLGFBQWEsS0FBSztBQUNsRCxRQUFJLE1BQU07QUFDVCxZQUFNLEtBQUssYUFBYSxFQUFFLE1BQU0saUJBQWlCLFFBQVEsS0FBSyxDQUFDO0FBQy9ELFdBQUssSUFBSSxVQUFVLFdBQVcsSUFBSTtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxlQUFlO0FBQ3BCLFNBQUssV0FBVyxPQUFPLE9BQU8sQ0FBQyxHQUFHLGtCQUFrQixNQUFNLEtBQUssU0FBUyxDQUFDO0FBQUEsRUFDMUU7QUFBQSxFQUVBLE1BQU0sZUFBZTtBQXBFdEI7QUFxRUUsVUFBTSxLQUFLLFNBQVMsS0FBSyxRQUFRO0FBQ2pDLGVBQUssV0FBTCxtQkFBYSxhQUFhLEtBQUssU0FBUyxVQUFVLEtBQUssU0FBUztBQUFBLEVBQ2pFO0FBQUEsRUFFQSxXQUFXO0FBQUEsRUFBQztBQUNiOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiIsICJpbXBvcnRfb2JzaWRpYW4iXQp9Cg==
