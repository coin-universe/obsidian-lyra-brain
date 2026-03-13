import { App, PluginSettingTab, Setting } from "obsidian";
import type LyraBrainPlugin from "../main";

export interface LyraBrainSettings {
	endpoint: string;
	apiKey: string;
}

export const DEFAULT_SETTINGS: LyraBrainSettings = {
	endpoint: "https://brain.sakura.exchange",
	apiKey: "",
};

export class LyraBrainSettingTab extends PluginSettingTab {
	plugin: LyraBrainPlugin;

	constructor(app: App, plugin: LyraBrainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Lyra Brain" });
		containerEl.createEl("p", {
			text: "Connect to Lyra-Seven's knowledge graph.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("API Endpoint")
			.setDesc("URL of the brain server")
			.addText((text) =>
				text
					.setPlaceholder("https://brain.sakura.exchange")
					.setValue(this.plugin.settings.endpoint)
					.onChange(async (value) => {
						this.plugin.settings.endpoint = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API Key")
			.setDesc("Authentication key for the brain API")
			.addText((text) => {
				text
					.setPlaceholder("Enter API key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		// Test connection button
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
}
