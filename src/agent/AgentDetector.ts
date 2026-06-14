import { CommandRule } from "./CommandRuleStore";
import { isMobile } from "../utils/platform";

export interface AgentInfo {
	rule: CommandRule;
	installed: boolean;
}

/**
 * Detect which Agent CLIs are installed on the current machine.
 *
 * On mobile, always returns an empty list (no child_process).
 * On desktop, runs `which <cmd>` via child_process.execSync.
 */
export function detectAgents(rules: CommandRule[]): AgentInfo[] {
	if (isMobile()) return [];

	// Lazy-import to avoid bundling child_process on mobile
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { execSync } = require("child_process") as typeof import("child_process");

	return rules.map((rule) => {
		let installed = false;
		try {
			execSync(rule.detectCmd, {
				encoding: "utf-8",
				timeout: 5000,
				stdio: "pipe",
			});
			installed = true;
		} catch {
			// which returns non-zero when command not found
			installed = false;
		}
		return { rule, installed };
	});
}

/**
 * Re-detect a single agent by its detectCmd.
 */
export function isAgentInstalled(rule: CommandRule): boolean {
	if (isMobile()) return false;
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { execSync } = require("child_process") as typeof import("child_process");
	try {
		execSync(rule.detectCmd, { encoding: "utf-8", timeout: 5000, stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}
