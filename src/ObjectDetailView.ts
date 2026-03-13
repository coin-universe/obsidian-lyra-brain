import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type LyraBrainPlugin from "../main";
import type { BrainObject, BrainConnection } from "./BrainClient";

export const DETAIL_VIEW_TYPE = "lyra-brain-detail";

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

		const badges = header.createDiv({ cls: "lyra-detail-badges" });
		badges.createEl("span", { text: obj.type, cls: "lyra-tag lyra-tag-type" });
		const statusEl = badges.createEl("span", {
			text: `${STATUS_EMOJI[obj.status] || "●"} ${obj.status}`,
			cls: "lyra-tag lyra-tag-status-detail",
		});
		statusEl.dataset.status = obj.status;

		// Description
		if (obj.description) {
			const descSection = container.createDiv({ cls: "lyra-detail-section" });
			descSection.createEl("h4", { text: "Description" });
			descSection.createEl("p", { text: obj.description, cls: "lyra-detail-desc" });
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
					this.renderConnection(outGroup, conn);
				}
			}

			if (incoming.length > 0) {
				const inGroup = connSection.createDiv({ cls: "lyra-conn-group" });
				inGroup.createEl("span", { text: "← Incoming", cls: "lyra-conn-direction" });
				for (const conn of incoming) {
					this.renderConnection(inGroup, conn);
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

	private renderConnection(parent: HTMLElement, conn: BrainConnection) {
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
