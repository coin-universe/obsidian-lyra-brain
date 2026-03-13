import { ItemView, WorkspaceLeaf, setIcon, debounce } from "obsidian";
import type LyraBrainPlugin from "../main";
import type { BrainObject, TypeCount } from "./BrainClient";
import { DETAIL_VIEW_TYPE } from "./ObjectDetailView";

export const BRAIN_VIEW_TYPE = "lyra-brain-view";

const STATUS_COLORS: Record<string, string> = {
	active: "var(--color-green)",
	frozen: "var(--color-blue)",
	done: "var(--text-muted)",
	broken: "var(--color-red)",
	waiting: "var(--color-yellow)",
	idea: "var(--color-purple)",
	deprecated: "var(--text-faint)",
};

export class BrainView extends ItemView {
	plugin: LyraBrainPlugin;
	private searchInput: HTMLInputElement;
	private typeChipsEl: HTMLElement;
	private objectListEl: HTMLElement;
	private statusBarEl: HTMLElement;
	private selectedType: string | null = null;
	private typeCounts: TypeCount[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: LyraBrainPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return BRAIN_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Lyra Brain";
	}

	getIcon(): string {
		return "brain";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("lyra-brain-container");

		// Header
		const header = container.createDiv({ cls: "lyra-brain-header" });
		header.createEl("span", { text: "Lyra Brain", cls: "lyra-brain-title" });

		const refreshBtn = header.createEl("button", { cls: "lyra-btn-icon", attr: { "aria-label": "Refresh" } });
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", () => this.refresh());

		// Search
		const searchWrap = container.createDiv({ cls: "lyra-search-wrap" });
		this.searchInput = searchWrap.createEl("input", {
			type: "text",
			placeholder: "Search objects...",
			cls: "lyra-search-input",
		});
		this.searchInput.addEventListener(
			"input",
			debounce(() => this.onSearch(), 300, true)
		);

		// Type chips
		this.typeChipsEl = container.createDiv({ cls: "lyra-type-chips" });

		// Object list
		this.objectListEl = container.createDiv({ cls: "lyra-object-list" });

		// Status bar
		this.statusBarEl = container.createDiv({ cls: "lyra-status-bar" });

		await this.refresh();
	}

	async refresh() {
		this.statusBarEl.setText("Loading...");
		try {
			this.typeCounts = await this.plugin.client.getObjectCounts();
			this.renderTypeChips();
			await this.loadObjects();
		} catch (e: any) {
			this.statusBarEl.setText(`Error: ${e.message}`);
			this.objectListEl.empty();
			this.objectListEl.createEl("div", {
				text: "Could not connect to brain. Check settings.",
				cls: "lyra-empty-state",
			});
		}
	}

	private renderTypeChips() {
		this.typeChipsEl.empty();

		// "All" chip
		const allCount = this.typeCounts.reduce((s, t) => s + t.count, 0);
		const allChip = this.typeChipsEl.createEl("button", {
			text: `all (${allCount})`,
			cls: `lyra-chip ${this.selectedType === null ? "lyra-chip-active" : ""}`,
		});
		allChip.addEventListener("click", () => {
			this.selectedType = null;
			this.renderTypeChips();
			this.loadObjects();
		});

		for (const tc of this.typeCounts) {
			const chip = this.typeChipsEl.createEl("button", {
				text: `${tc.type} (${tc.count})`,
				cls: `lyra-chip ${this.selectedType === tc.type ? "lyra-chip-active" : ""}`,
			});
			chip.addEventListener("click", () => {
				this.selectedType = tc.type;
				this.renderTypeChips();
				this.loadObjects();
			});
		}
	}

	private async loadObjects() {
		this.objectListEl.empty();
		this.statusBarEl.setText("Loading...");

		try {
			const objects = await this.plugin.client.listObjects(
				this.selectedType || undefined,
				undefined,
				200
			);
			this.renderObjects(objects);
			this.statusBarEl.setText(`${objects.length} objects`);
		} catch (e: any) {
			this.statusBarEl.setText(`Error: ${e.message}`);
		}
	}

	private async onSearch() {
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
		} catch (e: any) {
			this.statusBarEl.setText(`Search error: ${e.message}`);
		}
	}

	private renderObjects(objects: BrainObject[]) {
		this.objectListEl.empty();

		if (objects.length === 0) {
			this.objectListEl.createEl("div", {
				text: "No objects found",
				cls: "lyra-empty-state",
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
				cls: "lyra-tag lyra-tag-type",
			});

			const statusTag = metaEl.createEl("span", {
				text: obj.status,
				cls: `lyra-tag lyra-tag-status`,
			});
			const color = STATUS_COLORS[obj.status] || "var(--text-muted)";
			statusTag.style.setProperty("--status-color", color);
		}
	}

	private async openObject(obj: BrainObject) {
		const leaves = this.app.workspace.getLeavesOfType(DETAIL_VIEW_TYPE);
		let leaf: WorkspaceLeaf;

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = this.app.workspace.getLeaf("tab");
		}

		await leaf.setViewState({
			type: DETAIL_VIEW_TYPE,
			state: { objectId: obj.id },
		});
		this.app.workspace.revealLeaf(leaf);
	}

	async onClose() {
		// cleanup
	}
}
