import { App, Modal, Setting, Notice } from "obsidian";
import { copyToClipboard } from "../export/Exporters";

/**
 * Modal that shows the full command about to be executed and asks
 * the user to confirm.  Also offers a "复制命令" fallback so the user
 * can paste it into their own terminal.
 */
export class CommandConfirmModal extends Modal {
	private resolve: ((confirmed: boolean) => void) | null = null;

	constructor(
		app: App,
		private command: string,
		private agentLabel: string,
	) {
		super(app);
	}

	/**
	 * Open the modal and return a promise that resolves with
	 * `true` if the user confirmed, `false` if cancelled.
	 */
	openForConfirmation(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("mae-confirm-modal");

		containerEl.createEl("h2", {
			text: `确认执行 — ${this.agentLabel}`,
		});

		// Command display (monospace, scrollable)
		const codeWrap = containerEl.createDiv({
			cls: "mae-confirm-command",
		});
		codeWrap.createEl("code", { text: this.command });

		containerEl.createEl("p", {
			cls: "mae-confirm-warning",
			text: "请仔细检查命令内容，确认后将在终端中执行。",
		});

		// Action buttons
		new Setting(containerEl)
			.addButton((b) =>
				b.setButtonText("取消").onClick(() => {
					this.resolve?.(false);
					this.close();
				}),
			)
			.addButton((b) =>
				b
					.setButtonText("复制命令")
					.onClick(() => {
						copyToClipboard(this.command);
						new Notice("命令已复制到剪贴板");
						this.resolve?.(false);
						this.close();
					}),
			)
			.addButton((b) =>
				b
					.setButtonText("确认执行")
					.setCta()
					.onClick(() => {
						this.resolve?.(true);
						this.close();
					}),
			);
	}

	onClose(): void {
		// If the modal is closed without a choice, treat as cancel.
		this.resolve?.(false);
		this.resolve = null;
	}
}
