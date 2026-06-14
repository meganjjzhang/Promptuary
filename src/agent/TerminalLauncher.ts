import { App, Notice, TFile } from "obsidian";
import { isMobile } from "../utils/platform";
import { copyToClipboard } from "../export/Exporters";

export type TerminalApp = "Terminal" | "iTerm2";

export interface LaunchOptions {
	command: string;
	vaultPath: string;
	terminalApp: TerminalApp;
	/** Called when the command has been launched (macOS only) */
	onLaunched?: () => void;
	/** Called when the command was copied instead of launched (fallback) */
	onCopied?: () => void;
}

/**
 * Launch a command in the system terminal (macOS) or copy it to
 * clipboard as a fallback (Windows / Linux / mobile).
 */
export function launchInTerminal(opts: LaunchOptions): void {
	if (isMobile()) {
		copyToClipboard(opts.command);
		new Notice("命令已复制到剪贴板");
		opts.onCopied?.();
		return;
	}

	// Lazy-import to avoid bundling child_process on mobile
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { execSync } = require("child_process") as typeof import("child_process");

	// Detect platform
	const isMac = process.platform === "darwin";
	const isWindows = process.platform === "win32";

	if (isMac) {
		launchMacOS(opts);
	} else if (isWindows) {
		// Windows: just copy the command
		copyToClipboard(opts.command);
		new Notice("命令已复制到剪贴板（Windows 暂不支持一键执行）");
		opts.onCopied?.();
	} else {
		// Linux: just copy the command
		copyToClipboard(opts.command);
		new Notice("命令已复制到剪贴板（Linux 暂不支持一键执行）");
		opts.onCopied?.();
	}
}

function launchMacOS(opts: LaunchOptions): void {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { execSync } = require("child_process") as typeof import("child_process");

	const app = opts.terminalApp === "iTerm2" ? "iTerm2" : "Terminal";
	const escapedCmd = opts.command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

	const script = `
tell application "${app}"
	activate
	if application "${app}" is running then
		tell application "System Events"
			keystroke "t" using command down
		end tell
		delay 0.3
		do script "${escapedCmd}" in front window
	else
		do script "${escapedCmd}"
	end if
end tell`;

	try {
		execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
			encoding: "utf-8",
			timeout: 10000,
		});
		new Notice(`已通过 ${app} 执行命令`);
		opts.onLaunched?.();
	} catch (err) {
		// Fallback: copy to clipboard
		copyToClipboard(opts.command);
		new Notice(`终端启动失败，命令已复制到剪贴板`);
		opts.onCopied?.();
	}
}

// ---------- file change monitor ----------

export type ChangeStatus = "idle" | "running" | "detected" | "timeout";

export class FileChangeMonitor {
	private status: ChangeStatus = "idle";
	private timer: ReturnType<typeof setTimeout> | null = null;
	private resolve: ((detected: boolean) => void) | null = null;

	/**
	 * Start monitoring a file for changes. Resolves `true` if the file
	 * changes within the timeout, `false` on timeout.
	 */
	startMonitor(
		app: App,
		filePath: string,
		timeoutMs = 5 * 60 * 1000, // 5 min
	): Promise<boolean> {
		this.status = "running";

		return new Promise<boolean>((resolve) => {
			this.resolve = resolve;

			// Timeout
			this.timer = setTimeout(() => {
				this.cleanup();
				this.status = "timeout";
				resolve(false);
			}, timeoutMs);

			// Listen for vault modify events
			const handler = (file: TFile) => {
				if (file.path === filePath && this.status === "running") {
					this.cleanup();
					this.status = "detected";
					resolve(true);
				}
			};

			// We use vault.on but need to clean up — store a ref
			app.vault.on("modify", handler);
			// Store cleanup
			const origCleanup = this.cleanup.bind(this);
			this.cleanup = () => {
				origCleanup();
				app.vault.off("modify", handler);
			};
		});
	}

	/** Cancel an in-progress monitor */
	cancel(): void {
		if (this.status === "running") {
			this.cleanup();
			this.status = "idle";
			this.resolve?.(false);
		}
	}

	getStatus(): ChangeStatus {
		return this.status;
	}

	private cleanup = (): void => {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	};
}
