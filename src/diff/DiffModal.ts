import { App, Modal, Setting } from "obsidian";
import {
	DiffBlock,
	computeDiff,
	countChangedLines,
	applyPartialDiff,
} from "./DiffCalculator";

export interface DiffModalResult {
	action: "accept-all" | "accept-partial" | "reject";
	/** Only meaningful when action === "accept-partial" */
	mergedText?: string;
}

/**
 * Modal that shows a unified diff view with accept/reject controls.
 *
 * - Unified view: removed lines have red bg, added lines have green bg.
 * - Each changed hunk can be individually toggled.
 * - "全部接受" / "逐块选择" / "回滚" buttons at the bottom.
 */
export class DiffModal extends Modal {
	private blocks: DiffBlock[];
	private acceptMap: Map<number, boolean> = new Map();
	private result: DiffModalResult | null = null;
	private resolve: ((result: DiffModalResult) => void) | null = null;

	constructor(
		app: App,
		private originalText: string,
		private modifiedText: string,
		private fileName: string,
	) {
		super(app);
		this.blocks = computeDiff(originalText, modifiedText);
		// Default: accept all changes
		for (const b of this.blocks) {
			if (b.type === "added" || b.type === "removed") {
				this.acceptMap.set(b.index, true);
			}
		}
	}

	/**
	 * Open the modal and return a promise that resolves with the user's choice.
	 */
	openForResult(): Promise<DiffModalResult> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("mae-diff-modal");

		const { added, removed } = countChangedLines(this.blocks);

		// Header
		containerEl.createEl("h2", {
			text: `Diff 预览 — ${this.fileName}`,
		});
		containerEl.createEl("p", {
			cls: "mae-diff-summary",
			text: `+${added} 行添加 / -${removed} 行删除`,
		});

		// Diff view
		const diffContainer = containerEl.createDiv({
			cls: "mae-diff-container",
		});

		// Virtual scroll threshold: if >500 changed blocks, use a
		// simple windowed approach.
		const changedCount = this.blocks.filter(
			(b) => b.type !== "unchanged",
		).length;
		const useVirtual = changedCount > 500;

		if (useVirtual) {
			this.renderVirtualDiff(diffContainer);
		} else {
			this.renderFullDiff(diffContainer);
		}

		// Action buttons
		const actions = containerEl.createDiv({ cls: "mae-diff-actions" });

		new Setting(actions)
			.addButton((b) =>
				b
					.setButtonText("回滚（不应用任何修改）")
					.onClick(() => {
						this.result = { action: "reject" };
						this.close();
					}),
			)
			.addButton((b) =>
				b
					.setButtonText("逐块确认")
					.setWarning()
					.onClick(() => {
						const merged = applyPartialDiff(
							this.originalText,
							this.blocks,
							this.acceptMap,
						);
						this.result = {
							action: "accept-partial",
							mergedText: merged,
						};
						this.close();
					}),
			)
			.addButton((b) =>
				b
					.setButtonText("全部接受")
					.setCta()
					.onClick(() => {
						this.result = { action: "accept-all" };
						this.close();
					}),
			);
	}

	onClose(): void {
		if (this.resolve) {
			this.resolve(
				this.result ?? { action: "reject" },
			);
			this.resolve = null;
		}
	}

	// ---------- full render (small diffs) ----------

	private renderFullDiff(container: HTMLElement): void {
		for (const block of this.blocks) {
			const row = container.createDiv({
				cls: `mae-diff-row mae-diff-${block.type}`,
			});

			// Line numbers
			const nums = row.createDiv({ cls: "mae-diff-nums" });
			if (block.type === "removed" || block.type === "unchanged") {
				nums.createSpan({ text: String(block.oldLineNumber ?? "") });
			} else {
				nums.createSpan({ text: "" });
			}
			if (block.type === "added" || block.type === "unchanged") {
				nums.createSpan({ text: String(block.newLineNumber ?? "") });
			}

			// Content
			const content = row.createDiv({ cls: "mae-diff-content" });
			const prefix = block.type === "added" ? "+" : block.type === "removed" ? "-" : " ";
			content.createSpan({ cls: "mae-diff-prefix", text: prefix });
			content.createSpan({ text: block.content });

			// Toggle for changed lines
			if (block.type !== "unchanged") {
				const toggle = row.createDiv({ cls: "mae-diff-toggle" });
				const accepted = this.acceptMap.get(block.index) ?? true;
				const checkbox = toggle.createEl("input", {
					type: "checkbox",
				});
				checkbox.checked = accepted;
				checkbox.onchange = () => {
					this.acceptMap.set(block.index, checkbox.checked);
					row.toggleClass("rejected", !checkbox.checked);
				};
				if (!accepted) row.addClass("rejected");
			}
		}
	}

	// ---------- virtual scroll render (large diffs) ----------

	private renderVirtualDiff(container: HTMLElement): void {
		const LINE_HEIGHT = 24;
		const BUFFER = 50;
		const visibleBlocks = this.blocks;
		const totalHeight = visibleBlocks.length * LINE_HEIGHT;

		const scrollContainer = container.createDiv({
			cls: "mae-diff-virtual-scroll",
		});
		scrollContainer.style.height = "400px";
		scrollContainer.style.overflowY = "auto";
		scrollContainer.style.position = "relative";

		const inner = scrollContainer.createDiv();
		inner.style.height = `${totalHeight}px`;
		inner.style.position = "relative";

		const renderViewport = (): void => {
			const scrollTop = scrollContainer.scrollTop;
			const viewportHeight = scrollContainer.clientHeight;
			const startIdx = Math.max(
				0,
				Math.floor(scrollTop / LINE_HEIGHT) - BUFFER,
			);
			const endIdx = Math.min(
				visibleBlocks.length,
				Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + BUFFER,
			);

			inner.empty();
			for (let i = startIdx; i < endIdx; i++) {
				const block = visibleBlocks[i];
				const row = inner.createDiv({
					cls: `mae-diff-row mae-diff-${block.type}`,
				});
				row.style.position = "absolute";
				row.style.top = `${i * LINE_HEIGHT}px`;
				row.style.width = "100%";

				const content = row.createDiv({ cls: "mae-diff-content" });
				const prefix =
					block.type === "added"
						? "+"
						: block.type === "removed"
							? "-"
							: " ";
				content.createSpan({ cls: "mae-diff-prefix", text: prefix });
				content.createSpan({ text: block.content });
			}
		};

		scrollContainer.addEventListener("scroll", () => renderViewport());
		renderViewport();
	}
}
