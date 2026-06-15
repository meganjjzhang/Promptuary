import { App, Modal, setIcon, Notice } from "obsidian";
import { APIProviderConfig, APIProviderType, PROVIDER_DEFAULTS } from "./APIProvider";

export interface APIExecuteResult {
	action: "execute" | "cancel";
}

/** Provider initial → accent color bucket */
const PROVIDER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
	A: { bg: "rgba(96,165,250,0.10)",  border: "rgba(96,165,250,0.20)",  text: "rgba(96,165,250,0.90)" },  // Anthropic
	O: { bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.15)",  text: "rgba(74,222,128,0.80)" },  // OpenAI
	D: { bg: "rgba(96,165,250,0.10)",  border: "rgba(96,165,250,0.20)",  text: "rgba(96,165,250,0.90)" },  // DeepSeek
	G: { bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.15)",  text: "rgba(251,191,36,0.80)" },  // Gemini
	C: { bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.20)", text: "rgba(167,139,250,0.90)" }, // Custom
};

const PROVIDER_LABEL: Record<APIProviderType, string> = {
	anthropic: "Anthropic (Claude)",
	openai: "OpenAI (GPT)",
	deepseek: "DeepSeek",
	gemini: "Google Gemini",
	custom: "自定义端点",
};

function colorFor(provider: APIProviderType) {
	const key = provider[0]?.toUpperCase() ?? "C";
	return PROVIDER_COLORS[key] ?? PROVIDER_COLORS["C"];
}

/**
 * Pre-execution confirmation modal for API Key direct call.
 * Visual design matching API Confirm.html — same language as CommandConfirmModal.
 */
export class APIConfirmModal extends Modal {
	private resolve: ((r: APIExecuteResult) => void) | null = null;

	constructor(
		app: App,
		private config: APIProviderConfig,
		private estimatedTokens: number,
		private reviewCount: number,
	) {
		super(app);
	}

	openForResult(): Promise<APIExecuteResult> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { modalEl } = this;
		modalEl.empty();
		modalEl.addClass("mae-api-confirm-modal");

		const col = colorFor(this.config.provider);
		const providerName = PROVIDER_LABEL[this.config.provider];
		const modelName = this.config.model || PROVIDER_DEFAULTS[this.config.provider].model;

		// ── Header ──
		const header = modalEl.createDiv({ cls: "mae-apm-header" });
		const headerLeft = header.createDiv({ cls: "mae-apm-header-left" });
		const iconWrap = headerLeft.createDiv({ cls: "mae-apm-icon" });
		setIcon(iconWrap, "zap");
		const titleWrap = headerLeft.createDiv();
		titleWrap.createDiv({ cls: "mae-apm-title", text: "API 批阅确认" });
		titleWrap.createDiv({
			cls: "mae-apm-subtitle",
			text: `${providerName} · 即将发送至 API`,
		});

		const closeBtn = header.createEl("button", { cls: "mae-apm-close" });
		closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
		closeBtn.onclick = () => {
			this.resolve?.({ action: "cancel" });
			this.close();
		};

		// ── Provider badge row ──
		const badgeRow = modalEl.createDiv({ cls: "mae-apm-provider-row" });
		const providerAvatar = badgeRow.createDiv({ cls: "mae-apm-provider-avatar" });
		providerAvatar.style.background = col.bg;
		providerAvatar.style.borderColor = col.border;
		const avatarChar = providerAvatar.createSpan({ cls: "mae-apm-provider-char", text: providerName[0] });
		avatarChar.style.color = col.text;
		badgeRow.createSpan({ cls: "mae-apm-provider-name", text: providerName });
		const badge = badgeRow.createSpan({ cls: "mae-apm-provider-badge", text: "provider" });
		badge.style.background = col.bg;
		badge.style.borderColor = col.border;
		badge.style.color = col.text;

		// ── Info table ──
		const infoWrap = modalEl.createDiv({ cls: "mae-apm-info-wrap" });
		const infoBox = infoWrap.createDiv({ cls: "mae-apm-info-box" });

		const addRow = (label: string, value: string, warn = false) => {
			const row = infoBox.createDiv({ cls: "mae-apm-info-row" });
			row.createSpan({ cls: "mae-apm-info-label", text: label });
			const val = row.createSpan({ cls: warn ? "mae-apm-info-value mae-apm-info-warn" : "mae-apm-info-value", text: value });
			return val;
		};

		addRow("Model", modelName);
		addRow("Reviews", `${this.reviewCount} 条批阅`);
		addRow("Tokens", `~${this.estimatedTokens.toLocaleString()}`, this.estimatedTokens > 50_000);

		// ── Warning ──
		const warnBox = modalEl.createDiv({ cls: "mae-apm-warning" });
		const warnIcon = warnBox.createDiv({ cls: "mae-apm-warning-icon" });
		setIcon(warnIcon, "alert-triangle");
		warnBox.createEl("p", {
			cls: "mae-apm-warning-text",
			text: "原文与批阅意见将发送至所选 Provider，请确认不含敏感信息。数据将离开本地 Vault。",
		});

		// ── Footer ──
		const footer = modalEl.createDiv({ cls: "mae-apm-footer" });
		const cancelBtn = footer.createEl("button", { cls: "mae-apm-btn mae-apm-btn-cancel" });
		const cancelInner = cancelBtn.createSpan({ cls: "mae-apm-btn-inner" });
		const cancelIcon = cancelInner.createSpan({ cls: "mae-apm-btn-icon" });
		setIcon(cancelIcon, "x");
		cancelInner.createSpan({ text: "取消" });
		cancelBtn.onclick = () => {
			this.resolve?.({ action: "cancel" });
			this.close();
		};

		const execBtn = footer.createEl("button", { cls: "mae-apm-btn mae-apm-btn-exec" });
		const execInner = execBtn.createSpan({ cls: "mae-apm-btn-inner" });
		const execIcon = execInner.createSpan({ cls: "mae-apm-btn-icon" });
		setIcon(execIcon, "send");
		execInner.createSpan({ text: "确认执行" });
		execBtn.onclick = () => {
			this.resolve?.({ action: "execute" });
			this.close();
		};
	}

	onClose(): void {
		this.resolve?.({ action: "cancel" });
		this.resolve = null;
	}
}

// ---------- Progress / result modal ----------

export type APIProgressState =
	| { phase: "calling" }
	| { phase: "done"; text: string }
	| { phase: "error"; message: string };

/**
 * Modal shown while the API call is in progress.
 * Three visual states: calling (spinner), error, done.
 */
export class APIProgressModal extends Modal {
	private state: APIProgressState = { phase: "calling" };
	private contentArea!: HTMLElement;
	private resolve: ((text: string | null) => void) | null = null;

	constructor(app: App) {
		super(app);
		// Prevent accidental close while calling
		this.modalEl.addEventListener("keydown", (e) => {
			if (this.state.phase === "calling" && e.key === "Escape") {
				e.stopPropagation();
			}
		}, true);
	}

	openForResult(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { modalEl } = this;
		modalEl.empty();
		modalEl.addClass("mae-api-progress-modal");

		// ── Header ──
		const header = modalEl.createDiv({ cls: "mae-ppm-header" });
		const headerLeft = header.createDiv({ cls: "mae-ppm-header-left" });
		const iconWrap = headerLeft.createDiv({ cls: "mae-ppm-icon" });
		setIcon(iconWrap, "zap");
		const titleWrap = headerLeft.createDiv();
		titleWrap.createDiv({ cls: "mae-ppm-title", text: "API 批阅中…" });
		titleWrap.createDiv({ cls: "mae-ppm-subtitle", text: "正在调用 API" });

		// ── Content area (re-rendered by setState) ──
		this.contentArea = modalEl.createDiv({ cls: "mae-ppm-content" });

		// ── Footer ──
		const footer = modalEl.createDiv({ cls: "mae-ppm-footer" });
		const closeBtnWrap = footer.createDiv({ cls: "mae-ppm-footer-right" });
		const closeBtn = closeBtnWrap.createEl("button", { cls: "mae-ppm-btn mae-ppm-btn-close" });
		const closeInner = closeBtn.createSpan({ cls: "mae-ppm-btn-inner" });
		closeInner.createSpan({ text: "关闭" });
		closeBtn.onclick = () => {
			this.resolve?.(null);
			this.close();
		};
		closeBtn.style.display = "none"; // hidden during calling

		const diffBtn = closeBtnWrap.createEl("button", { cls: "mae-ppm-btn mae-ppm-btn-diff" });
		const diffInner = diffBtn.createSpan({ cls: "mae-ppm-btn-inner" });
		const diffIcon = diffInner.createSpan({ cls: "mae-ppm-btn-icon" });
		setIcon(diffIcon, "git-compare");
		diffInner.createSpan({ text: "查看 Diff" });
		diffBtn.onclick = () => {
			this.resolve?.(this.state.phase === "done" ? this.state.text : null);
			this.close();
		};
		diffBtn.style.display = "none";

		this.render();
	}

	setState(state: APIProgressState): void {
		this.state = state;
		this.render();
	}

	private render(): void {
		const area = this.contentArea;
		area.empty();

		// Footer buttons
		const footerRight = this.modalEl.querySelector(".mae-ppm-footer-right") as HTMLElement;
		const closeBtn = footerRight?.querySelector(".mae-ppm-btn-close") as HTMLElement;
		const diffBtn = footerRight?.querySelector(".mae-ppm-btn-diff") as HTMLElement;
		if (closeBtn) closeBtn.style.display = "none";
		if (diffBtn) diffBtn.style.display = "none";

		if (this.state.phase === "calling") {
			area.createDiv({ cls: "mae-ppm-spinner" });
			area.createEl("p", { cls: "mae-ppm-calling-text", text: "正在调用 API，请稍候…" });
			return;
		}

		if (this.state.phase === "error") {
			const errBox = area.createDiv({ cls: "mae-ppm-error" });
			const errIcon = errBox.createDiv({ cls: "mae-ppm-error-icon" });
			setIcon(errIcon, "x-circle");
			errBox.createEl("p", { cls: "mae-ppm-error-text", text: `调用失败：${this.state.message}` });
			if (closeBtn) closeBtn.style.display = "";
			return;
		}

		// done
		const doneBox = area.createDiv({ cls: "mae-ppm-success" });
		const doneIcon = doneBox.createDiv({ cls: "mae-ppm-success-icon" });
		setIcon(doneIcon, "check-circle");
		doneBox.createEl("p", { cls: "mae-ppm-success-text", text: "API 返回成功，即将打开 Diff 预览" });
		if (diffBtn) diffBtn.style.display = "";
	}

	onClose(): void {
		if (this.state.phase === "calling") {
			new Notice("API 调用已取消");
		}
		this.resolve?.(null);
		this.resolve = null;
	}
}
