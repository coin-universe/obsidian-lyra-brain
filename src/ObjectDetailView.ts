import { ItemView, WorkspaceLeaf, setIcon, Modal, App, Setting } from "obsidian";
import type LyraBrainPlugin from "../main";
import type { BrainObject, BrainConnection } from "./BrainClient";

export const DETAIL_VIEW_TYPE = "lyra-brain-detail";

const ALL_STATUSES = ["active", "frozen", "done", "broken", "waiting", "idea", "deprecated"];

interface TimelineEntry {
	ts: string;
	event: string;
}

const STATUS_EMOJI: Record<string, string> = {
	active: "●",
	frozen: "◆",
	done: "✓",
	broken: "✗",
	waiting: "◌",
	idea: "◇",
	deprecated: "○",
};

// ---- Confirmation Modal ----
class ConfirmDeleteModal extends Modal {
	private objectName: string;
	private onConfirm: () => void;

	constructor(app: App, objectName: string, onConfirm: () => void) {
		super(app);
		this.objectName = objectName;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Delete Object" });
		contentEl.createEl("p", {
			text: `Are you sure you want to delete "${this.objectName}"? This will also remove all its connections. This cannot be undone.`,
		});

		const btnRow = contentEl.createDiv({ cls: "lyra-modal-buttons" });

		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const deleteBtn = btnRow.createEl("button", {
			text: "Delete",
			cls: "lyra-btn-danger",
		});
		deleteBtn.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Edit Description Modal ----
class EditDescriptionModal extends Modal {
	private currentDesc: string;
	private onSave: (desc: string) => void;

	constructor(app: App, currentDesc: string, onSave: (desc: string) => void) {
		super(app);
		this.currentDesc = currentDesc;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Edit Description" });

		const textarea = contentEl.createEl("textarea", {
			cls: "lyra-edit-textarea",
		});
		textarea.value = this.currentDesc;
		textarea.rows = 8;

		const btnRow = contentEl.createDiv({ cls: "lyra-modal-buttons" });

		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = btnRow.createEl("button", {
			text: "Save",
			cls: "lyra-btn-primary",
		});
		saveBtn.addEventListener("click", () => {
			this.onSave(textarea.value);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// ---- Confirm Delete Connection Modal ----
class ConfirmDeleteConnectionModal extends Modal {
	private connName: string;
	private relation: string;
	private onConfirm: () => void;

	constructor(app: App, connName: string, relation: string, onConfirm: () => void) {
		super(app);
		this.connName = connName;
		this.relation = relation;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Delete Connection" });
		contentEl.createEl("p", {
			text: `Remove "${this.relation}" connection to "${this.connName}"?`,
		});

		const btnRow = contentEl.createDiv({ cls: "lyra-modal-buttons" });

		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const deleteBtn = btnRow.createEl("button", {
			text: "Delete",
			cls: "lyra-btn-danger",
		});
		deleteBtn.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}


export class ObjectDetailView extends ItemView {
	plugin: LyraBrainPlugin;
	private objectId: string = "";
	private object: BrainObject | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LyraBrainPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return DETAIL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.object?.name || "Object Detail";
	}

	getIcon(): string {
		return "file-text";
	}

	getState() {
		return { objectId: this.objectId };
	}

	async setState(state: any, result: any) {
		if (state.objectId) {
			this.objectId = state.objectId;
			await this.loadAndRender();
		}
		await super.setState(state, result);
	}

	async loadAndRender() {
		const container = this.containerEl.children[1] as HTMLElement;
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
				this.plugin.client.getConnections(this.objectId),
			]);

			container.empty();

			if (!obj) {
				container.createEl("div", { text: "Object not found", cls: "lyra-empty-state" });
				return;
			}

			this.object = obj;
			this.leaf.updateHeader();
			this.renderObject(container, obj, connections);
		} catch (e: any) {
			container.empty();
			container.createEl("div", { text: `Error: ${e.message}`, cls: "lyra-empty-state" });
		}
	}

	private renderObject(container: HTMLElement, obj: BrainObject, connections: BrainConnection[]) {
		// Header section
		const header = container.createDiv({ cls: "lyra-detail-header" });

		const titleRow = header.createDiv({ cls: "lyra-detail-title-row" });
		titleRow.createEl("h2", { text: obj.name, cls: "lyra-detail-name" });

		// Action buttons
		const actions = titleRow.createDiv({ cls: "lyra-detail-actions" });

		const deleteBtn = actions.createEl("button", {
			cls: "lyra-btn-icon lyra-btn-delete",
			attr: { "aria-label": "Delete object" },
		});
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", () => this.confirmDelete(obj));

		const badges = header.createDiv({ cls: "lyra-detail-badges" });
		badges.createEl("span", { text: obj.type, cls: "lyra-tag lyra-tag-type" });

		// Status as a dropdown
		const statusSelect = badges.createEl("select", { cls: "lyra-status-select" });
		statusSelect.dataset.status = obj.status;
		for (const s of ALL_STATUSES) {
			const opt = statusSelect.createEl("option", {
				text: `${STATUS_EMOJI[s] || "●"} ${s}`,
				value: s,
			});
			if (s === obj.status) opt.selected = true;
		}
		statusSelect.addEventListener("change", async () => {
			const newStatus = statusSelect.value;
			await this.plugin.client.updateStatus(obj.id, newStatus);
			await this.loadAndRender();
			this.plugin.refreshBrainView();
		});

		// Description (with edit button)
		const descSection = container.createDiv({ cls: "lyra-detail-section" });
		const descHeader = descSection.createDiv({ cls: "lyra-section-header" });
		descHeader.createEl("h4", { text: "Description" });
		const editDescBtn = descHeader.createEl("button", {
			cls: "lyra-btn-icon lyra-btn-edit",
			attr: { "aria-label": "Edit description" },
		});
		setIcon(editDescBtn, "pencil");
		editDescBtn.addEventListener("click", () => this.editDescription(obj));

		if (obj.description) {
			descSection.createEl("p", { text: obj.description, cls: "lyra-detail-desc" });
		} else {
			descSection.createEl("p", { text: "No description", cls: "lyra-detail-desc lyra-text-faint" });
		}

		// Metadata
		const metaSection = container.createDiv({ cls: "lyra-detail-section" });
		metaSection.createEl("h4", { text: "Details" });
		const metaGrid = metaSection.createDiv({ cls: "lyra-detail-grid" });

		this.addMetaRow(metaGrid, "ID", obj.id);
		this.addMetaRow(metaGrid, "Created", this.formatDate(obj.created));
		this.addMetaRow(metaGrid, "Modified", this.formatDate(obj.modified));
		if (obj.path) this.addMetaRow(metaGrid, "Path", obj.path);
		if (obj.source_session) this.addMetaRow(metaGrid, "Source", obj.source_session);
		if (obj.rules) this.addMetaRow(metaGrid, "Rules", obj.rules);

		// Connections
		if (connections.length > 0) {
			const connSection = container.createDiv({ cls: "lyra-detail-section" });
			connSection.createEl("h4", { text: `Connections (${connections.length})` });

			const outgoing = connections.filter((c) => c.direction === "outgoing");
			const incoming = connections.filter((c) => c.direction === "incoming");

			if (outgoing.length > 0) {
				const outGroup = connSection.createDiv({ cls: "lyra-conn-group" });
				outGroup.createEl("span", { text: "Outgoing →", cls: "lyra-conn-direction" });
				for (const conn of outgoing) {
					this.renderConnection(outGroup, conn, obj);
				}
			}

			if (incoming.length > 0) {
				const inGroup = connSection.createDiv({ cls: "lyra-conn-group" });
				inGroup.createEl("span", { text: "← Incoming", cls: "lyra-conn-direction" });
				for (const conn of incoming) {
					this.renderConnection(inGroup, conn, obj);
				}
			}
		}

		// Timeline
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

	private renderConnection(parent: HTMLElement, conn: BrainConnection, currentObj: BrainObject) {
		const row = parent.createDiv({ cls: "lyra-conn-row" });

		const relation = row.createEl("span", {
			text: conn.relation.replace(/_/g, " "),
			cls: "lyra-conn-relation",
		});

		const link = row.createEl("a", {
			text: conn.name,
			cls: "lyra-conn-link",
			href: "#",
		});
		link.addEventListener("click", async (e) => {
			e.preventDefault();
			await this.navigateTo(conn.id);
		});

		const meta = row.createEl("span", {
			text: `${conn.type} · ${conn.status}`,
			cls: "lyra-conn-meta",
		});

		// Delete connection button
		const delBtn = row.createEl("button", {
			cls: "lyra-btn-icon lyra-btn-conn-delete",
			attr: { "aria-label": "Delete connection" },
		});
		setIcon(delBtn, "x");
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

	private confirmDelete(obj: BrainObject) {
		new ConfirmDeleteModal(this.app, obj.name, async () => {
			await this.plugin.client.deleteObject(obj.id);
			this.plugin.refreshBrainView();
			this.leaf.detach();
		}).open();
	}

	private editDescription(obj: BrainObject) {
		new EditDescriptionModal(this.app, obj.description, async (newDesc) => {
			await this.plugin.client.updateDescription(obj.id, newDesc);
			await this.loadAndRender();
			this.plugin.refreshBrainView();
		}).open();
	}

	private async navigateTo(objectId: string) {
		this.objectId = objectId;
		await this.loadAndRender();
	}

	private addMetaRow(parent: HTMLElement, label: string, value: string) {
		const row = parent.createDiv({ cls: "lyra-meta-row" });
		row.createEl("span", { text: label, cls: "lyra-meta-label" });
		row.createEl("span", { text: value, cls: "lyra-meta-value" });
	}

	private formatDate(dateStr: string): string {
		if (!dateStr) return "—";
		try {
			const d = new Date(dateStr);
			return d.toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "short",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
		} catch {
			return dateStr;
		}
	}

	private parseTimeline(timelineStr: string): TimelineEntry[] {
		try {
			const parsed = JSON.parse(timelineStr);
			if (Array.isArray(parsed)) return parsed;
			return [];
		} catch {
			return [];
		}
	}

	async onClose() {
		// cleanup
	}
}
