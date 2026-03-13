import { Plugin } from "obsidian";
import { BrainClient } from "./src/BrainClient";
import { BrainView, BRAIN_VIEW_TYPE } from "./src/BrainView";
import { ObjectDetailView, DETAIL_VIEW_TYPE } from "./src/ObjectDetailView";
import {
	LyraBrainSettingTab,
	LyraBrainSettings,
	DEFAULT_SETTINGS,
} from "./src/SettingsTab";

export default class LyraBrainPlugin extends Plugin {
	settings: LyraBrainSettings;
	client: BrainClient;

	async onload() {
		await this.loadSettings();

		this.client = new BrainClient(this.settings.endpoint, this.settings.apiKey);

		// Register views
		this.registerView(BRAIN_VIEW_TYPE, (leaf) => new BrainView(leaf, this));
		this.registerView(DETAIL_VIEW_TYPE, (leaf) => new ObjectDetailView(leaf, this));

		// Settings tab
		this.addSettingTab(new LyraBrainSettingTab(this.app, this));

		// Ribbon icon
		this.addRibbonIcon("brain", "Lyra Brain", () => {
			this.activateBrainView();
		});

		// Command
		this.addCommand({
			id: "open-lyra-brain",
			name: "Open Lyra Brain",
			callback: () => this.activateBrainView(),
		});

	}

	refreshBrainView() {
		const leaves = this.app.workspace.getLeavesOfType(BRAIN_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as BrainView;
			if (view?.refresh) {
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
		await this.saveData(this.settings);
		this.client?.updateConfig(this.settings.endpoint, this.settings.apiKey);
	}

	onunload() {}
}
