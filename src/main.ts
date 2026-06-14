import {
  App,
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  Modal,
  Setting,
} from "obsidian";

import {
  Annotation,
  HighlightColor,
  ViewMode,
} from "./annotation/AnnotationModel";
import { AnnotationStore } from "./annotation/AnnotationStore";
import {
  computeLineHint,
  computeOccurrenceIndex,
  extractContext,
  locate,
} from "./annotation/AnnotationLocator";
import {
  annotationDecoratorExtension,
  setAnnotationsEffect,
} from "./editor/AnnotationDecorator";
import { SelectionPopover } from "./editor/SelectionPopover";
import { BottomToolbar } from "./editor/BottomToolbar";
import { NoteModal, ReviewModal } from "./editor/NoteModal";
import {
  DEFAULT_SETTINGS,
  MultiAIEditSettings,
  SettingsTab,
} from "./settings/SettingsTab";
import { SIDEBAR_VIEW_TYPE, SidebarView } from "./sidebar/SidebarView";
import {
  PromptExporter,
  ReviewExporter,
  buildPromptText,
  copyToClipboard as exportCopyToClipboard,
} from "./export/Exporters";
import { newAnnotationId, sha256 } from "./utils/hash";
import { isMobile } from "./utils/platform";
import { EditorView } from "@codemirror/view";

// v0.2 Agent bridge imports
import {
  CommandRuleStore,
  PRESET_RULES,
  CommandRule,
} from "./agent/CommandRuleStore";
import { detectAgents, AgentInfo } from "./agent/AgentDetector";
import { buildCommand, TemplateVars } from "./agent/CommandBuilder";
import {
  launchInTerminal,
  FileChangeMonitor,
  TerminalApp,
} from "./agent/TerminalLauncher";
import { CommandConfirmModal } from "./agent/CommandConfirmModal";
import { DiffModal, DiffModalResult } from "./diff/DiffModal";

export default class MultiAIEditPlugin extends Plugin {
  settings: MultiAIEditSettings = DEFAULT_SETTINGS;
  store!: AnnotationStore;
  private popover: SelectionPopover | null = null;
  private toolbar: BottomToolbar | null = null;
  private reviewExporter!: ReviewExporter;
  private promptExporter!: PromptExporter;

  // v0.2 Agent bridge state
  private commandRuleStore!: CommandRuleStore;
  private agentCache: AgentInfo[] | null = null;
  private fileChangeMonitor: FileChangeMonitor | null = null;
  private originalTextBeforeAgent: string | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.store = new AnnotationStore(this.app, () => this.settings.sidecarDir);
    this.store.registerVaultEvents();

    this.reviewExporter = new ReviewExporter(this.app, () => this.settings.exportDir);
    this.promptExporter = new PromptExporter(this.app);

    // v0.2: Initialize command rule store
    this.commandRuleStore = new CommandRuleStore();
    this.commandRuleStore.loadFromJSON(this.settings.customCommandRules);

    // CM6 decoration extension
    this.registerEditorExtension(annotationDecoratorExtension());

    // Sidebar view
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new SidebarView(leaf, this));
    this.addRibbonIcon("highlighter", "MultiAIEdit 侧边栏", () => this.openSidebar());
    this.addCommand({
      id: "open-sidebar",
      name: "打开 MultiAIEdit 侧边栏",
      callback: () => this.openSidebar(),
    });

    // Settings
    this.addSettingTab(new SettingsTab(this.app, this));

    // Selection UI
    if (isMobile()) {
      this.toolbar = new BottomToolbar(this.app, this.popoverCallbacks());
    } else {
      this.popover = new SelectionPopover(this.app, this.popoverCallbacks());
    }

    // Editor selection listener
    this.registerDomEvent(document, "selectionchange", () => this.onSelectionChange());
    this.registerDomEvent(document, "mousedown", (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".multiaiedit-popover")) return;
      if (target.closest(".cm-editor")) {
        this.isDraggingSelection = true;
        this.popover?.hide();
      }
    });
    this.registerDomEvent(document, "mouseup", () => {
      if (this.isDraggingSelection) {
        this.isDraggingSelection = false;
        window.setTimeout(() => this.onSelectionChange(), 0);
      }
    });

    // Re-decorate when active leaf changes or annotations change
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refreshDecorations()),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshDecorations()),
    );
    this.store.on("change", (path: string) => {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (md?.file?.path === path) this.refreshDecorations();
    });

    // v0.1 commands
    this.addCommand({
      id: "highlight-yellow",
      name: "高亮（黄）",
      editorCheckCallback: (checking, _ed, view) => {
        if (!view.file) return false;
        if (checking) return true;
        this.createHighlightFromSelection("yellow");
        return true;
      },
    });
    this.addCommand({
      id: "create-note",
      name: "添加笔记",
      editorCheckCallback: (checking, _ed, view) => {
        if (!view.file) return false;
        if (checking) return true;
        this.openNoteModalForSelection();
        return true;
      },
    });
    this.addCommand({
      id: "create-review",
      name: "添加批阅意见",
      editorCheckCallback: (checking, _ed, view) => {
        if (!view.file) return false;
        if (checking) return true;
        this.openReviewModalForSelection();
        return true;
      },
    });
    this.addCommand({
      id: "export-review",
      name: "导出批阅文件",
      callback: () => this.runExport(),
    });
    this.addCommand({
      id: "copy-prompt",
      name: "复制 Prompt",
      callback: () => this.runCopyPrompt(),
    });

    // v0.2: Agent commands
    this.registerAgentCommands();

    // Open sidebar on first install
    this.app.workspace.onLayoutReady(() => {
      if (this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE).length === 0) {
        this.openSidebar();
      } else {
        this.refreshDecorations();
      }
    });
  }

  async onunload(): Promise<void> {
    await this.store.flushAll();
    this.store.destroy();
    this.popover?.destroy();
    this.toolbar?.destroy();
    this.fileChangeMonitor?.cancel();
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ---------- v0.2: Agent bridge ----------

  private registerAgentCommands(): void {
    // Register a command for each preset agent
    for (const rule of PRESET_RULES) {
      this.addCommand({
        id: `agent-${rule.id}`,
        name: `使用 ${rule.label} 执行`,
        callback: () => this.runAgent(rule.id),
      });
    }
    // Register "copy command" as a universal fallback
    this.addCommand({
      id: "agent-copy-command",
      name: "复制 Agent 命令",
      callback: () => this.runCopyAgentCommand(),
    });
  }

  /** Get cached agent info, or detect fresh */
  getAgentInfo(): AgentInfo[] {
    if (!this.agentCache) {
      this.agentCache = detectAgents(this.commandRuleStore.allRules());
    }
    return this.agentCache;
  }

  /** Invalidate agent cache (e.g. after settings change) */
  invalidateAgentCache(): void {
    this.agentCache = null;
  }

  /**
   * Main entry point for v0.2 Agent execution:
   * 1. Generate instruction file (or inline prompt)
   * 2. Build command from template
   * 3. Show confirmation modal
   * 4. Launch in terminal
   * 5. Monitor file for changes
   * 6. Show diff on change detection
   */
  async runAgent(ruleId: string): Promise<void> {
    if (isMobile()) {
      new Notice("移动端暂不支持 Agent 执行，请使用「复制 Prompt」");
      return;
    }

    const rule = this.commandRuleStore.getById(ruleId);
    if (!rule) {
      new Notice(`未找到规则: ${ruleId}`);
      return;
    }

    const targetPath = this.resolveTargetMarkdownPath();
    if (!targetPath) {
      new Notice("请先打开一个 Markdown 文件");
      return;
    }

    // Check for review annotations
    await this.store.flushAll();
    const data = await this.store.getFile(targetPath);
    if (data.annotations.filter((a) => a.type === "review").length === 0) {
      new Notice("当前文件没有批阅意见");
      return;
    }

    // Generate instruction file
    const file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof TFile)) {
      new Notice("找不到原文件");
      return;
    }
    const originalText = await this.app.vault.read(file);
    const fileName = file.basename;

    // Build instruction file path
    const instructionFilePath = `${this.settings.exportDir}/${fileName}-agent-instruction.md`;
    const instructionContent = buildPromptText(
      fileName,
      originalText,
      data,
      { includeReadingNotes: this.settings.includeReadingNotesInExport },
    );

    // Write instruction file to vault
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.settings.exportDir))) {
      await adapter.mkdir(this.settings.exportDir);
    }
    await adapter.write(instructionFilePath, instructionContent);

    // Build command
    const vaultPath = (this.app.vault.adapter as unknown as { basePath?: string }).basePath
      ?? this.app.vault.getRoot().path;
    const templateVars: TemplateVars = {
      vaultPath,
      instructionFile: instructionFilePath,
      filePath: targetPath,
      fileName: file.name,
      prompt: instructionContent,
    };
    const command = buildCommand(rule, templateVars);

    // Show confirmation modal
    const confirmed = await new CommandConfirmModal(
      this.app,
      command,
      rule.label,
    ).openForConfirmation();

    if (!confirmed) return;

    // Save original text for diff
    this.originalTextBeforeAgent = originalText;

    // Launch in terminal
    launchInTerminal({
      command,
      vaultPath,
      terminalApp: this.settings.terminalApp,
      onLaunched: () => {
        this.startFileMonitoring(targetPath);
      },
      onCopied: () => {
        this.startFileMonitoring(targetPath);
      },
    });
  }

  /** Copy the full command to clipboard without executing */
  async runCopyAgentCommand(): Promise<void> {
    const targetPath = this.resolveTargetMarkdownPath();
    if (!targetPath) {
      new Notice("请先打开一个 Markdown 文件");
      return;
    }

    // Show agent selection — for now, use the first installed agent
    // or show all with a Notice
    const agents = this.getAgentInfo();
    const installed = agents.filter((a) => a.installed);

    if (installed.length === 0) {
      new Notice("未检测到已安装的 Agent CLI，请先安装 Claude Code / Codex / Aider / Gemini CLI");
      return;
    }

    // If only one agent, use it directly
    if (installed.length === 1) {
      await this.buildAndCopyCommand(installed[0].rule);
      return;
    }

    // Multiple agents: for now, just use the first one
    // A proper UI with selection would be in the sidebar
    await this.buildAndCopyCommand(installed[0].rule);
  }

  private async buildAndCopyCommand(rule: CommandRule): Promise<void> {
    const targetPath = this.resolveTargetMarkdownPath();
    if (!targetPath) return;

    await this.store.flushAll();
    const data = await this.store.getFile(targetPath);
    const file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof TFile)) return;

    const originalText = await this.app.vault.read(file);
    const fileName = file.basename;

    const instructionFilePath = `${this.settings.exportDir}/${fileName}-agent-instruction.md`;
    const instructionContent = buildPromptText(
      fileName,
      originalText,
      data,
      { includeReadingNotes: this.settings.includeReadingNotesInExport },
    );

    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.settings.exportDir))) {
      await adapter.mkdir(this.settings.exportDir);
    }
    await adapter.write(instructionFilePath, instructionContent);

    const vaultPath = (this.app.vault.adapter as unknown as { basePath?: string }).basePath
      ?? this.app.vault.getRoot().path;
    const templateVars: TemplateVars = {
      vaultPath,
      instructionFile: instructionFilePath,
      filePath: targetPath,
      fileName: file.name,
      prompt: instructionContent,
    };
    const command = buildCommand(rule, templateVars);
    exportCopyToClipboard(command);
    new Notice(`${rule.label} 命令已复制到剪贴板`);
  }

  /** Start monitoring a file for changes after CLI execution */
  private startFileMonitoring(filePath: string): void {
    this.fileChangeMonitor?.cancel();
    this.fileChangeMonitor = new FileChangeMonitor();

    new Notice("正在监听文件变更（5 分钟超时）…");

    this.fileChangeMonitor.startMonitor(this.app, filePath).then(async (detected) => {
      if (detected) {
        new Notice("检测到文件变更，正在生成 Diff…");
        await this.showDiffForFile(filePath);
      } else {
        new Notice("未检测到文件变更，请手动检查");
      }
      this.fileChangeMonitor = null;
    });
  }

  /**
   * Show Diff modal for a file, comparing the saved original text
   * with the current file content.
   */
  async showDiffForFile(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return;

    const original = this.originalTextBeforeAgent;
    if (!original) {
      new Notice("没有保存的原文快照");
      return;
    }

    const modified = await this.app.vault.read(file);
    this.originalTextBeforeAgent = null;

    // Quick check: any changes?
    if (original === modified) {
      new Notice("文件内容未发生变化");
      return;
    }

    const fileName = file.basename;
    const result = await new DiffModal(
      this.app,
      original,
      modified,
      fileName,
    ).openForResult();

    switch (result.action) {
      case "accept-all": {
        // File already has the new content, just update baseline
        const newHash = await sha256(modified);
        await this.store.confirmBaseline(filePath, newHash);
        this.refreshDecorations();
        new Notice("已接受所有修改");
        break;
      }
      case "accept-partial": {
        if (result.mergedText !== undefined) {
          await this.app.vault.modify(file, result.mergedText);
          const newHash = await sha256(result.mergedText);
          await this.store.confirmBaseline(filePath, newHash);
          this.refreshDecorations();
          new Notice("已应用选中的修改");
        }
        break;
      }
      case "reject": {
        // Restore original
        await this.app.vault.modify(file, original);
        this.refreshDecorations();
        new Notice("已回滚所有修改");
        break;
      }
    }
  }

  // ---------- mode propagation ----------

  private lastSelection: { cm: EditorView; from: number; to: number } | null = null;
  private isDraggingSelection = false;

  onModeChange(mode: ViewMode): void {
    this.popover?.setMode(mode);
    this.toolbar?.setMode(mode);
    if (this.lastSelection) {
      const { cm, from, to } = this.lastSelection;
      if (this.popover) this.popover.show(cm, from, to);
      if (this.toolbar) this.toolbar.show();
    }
  }

  private currentMode(): ViewMode {
    const leaves = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    if (leaves.length === 0) return this.settings.defaultMode;
    const view = leaves[0].view as SidebarView;
    return view.getMode();
  }

  // ---------- selection handling ----------

  private onSelectionChange(): void {
    if (this.isDraggingSelection) return;
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!md) return;
    const editor = md.editor;
    const selText = editor.getSelection();
    if (!selText || selText.length === 0) {
      this.lastSelection = null;
      this.popover?.hide();
      return;
    }
    const cm: EditorView | undefined = (editor as unknown as { cm?: EditorView }).cm;
    if (!cm) return;
    const sel = cm.state.selection.main;
    if (sel.from === sel.to) return;
    this.lastSelection = { cm, from: sel.from, to: sel.to };
    const mode = this.currentMode();
    if (this.popover) {
      this.popover.setMode(mode);
      this.popover.show(cm, sel.from, sel.to);
    }
    if (this.toolbar) {
      this.toolbar.setMode(mode);
      this.toolbar.show();
    }
  }

  private popoverCallbacks() {
    return {
      onHighlight: (color: HighlightColor) => {
        this.lastSelection = null;
        this.createHighlightFromSelection(color);
      },
      onNote: () => {
        this.lastSelection = null;
        this.openNoteModalForSelection();
      },
      onReview: (text: string, strike: boolean) => {
        this.lastSelection = null;
        this.createReviewFromSelection(text, strike);
      },
      onStrike: () => {
        this.lastSelection = null;
        this.createReviewFromSelection("", true);
      },
    };
  }

  // ---------- annotation creation ----------

  private getActiveSelectionContext(): {
    view: MarkdownView;
    file: TFile;
    editor: Editor;
    cm: EditorView;
    from: number;
    to: number;
    selectedText: string;
    doc: string;
  } | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return null;
    const cm: EditorView | undefined = (view.editor as unknown as { cm?: EditorView }).cm;
    if (!cm) return null;
    const sel = cm.state.selection.main;
    if (sel.from === sel.to) return null;
    const doc = cm.state.doc.toString();
    const selectedText = doc.slice(sel.from, sel.to);
    return {
      view,
      file: view.file,
      editor: view.editor,
      cm,
      from: sel.from,
      to: sel.to,
      selectedText,
      doc,
    };
  }

  private async buildAnchor(
    file: TFile,
    doc: string,
    from: number,
    to: number,
    selectedText: string,
  ): Promise<Pick<
    Annotation,
    "id"
    | "filePath"
    | "selectedText"
    | "contextBefore"
    | "contextAfter"
    | "lineHint"
    | "occurrenceIndex"
    | "baselineHash"
    | "createdAt"
    | "updatedAt"
  >> {
    const span = this.settings.contextSpan;
    const { contextBefore, contextAfter } = extractContext(doc, from, to, span);
    const lineHint = computeLineHint(doc, from);
    const occurrenceIndex = computeOccurrenceIndex(doc, selectedText, from);
    const baselineHash = await sha256(doc);
    const now = Date.now();
    return {
      id: newAnnotationId(),
      filePath: file.path,
      selectedText,
      contextBefore,
      contextAfter,
      lineHint,
      occurrenceIndex,
      baselineHash,
      createdAt: now,
      updatedAt: now,
    };
  }

  async createHighlightFromSelection(color: HighlightColor): Promise<void> {
    const ctx = this.getActiveSelectionContext();
    if (!ctx) return;
    const anchor = await this.buildAnchor(
      ctx.file,
      ctx.doc,
      ctx.from,
      ctx.to,
      ctx.selectedText,
    );
    const ann: Annotation = {
      ...anchor,
      type: "highlight",
      highlightColor: color,
    };
    await this.store.addAnnotation(ctx.file.path, ann);
    this.refreshDecorations();
  }

  async openNoteModalForSelection(): Promise<void> {
    const ctx = this.getActiveSelectionContext();
    if (!ctx) {
      new Notice("请先选中要批注的文字");
      return;
    }
    const anchor = await this.buildAnchor(
      ctx.file,
      ctx.doc,
      ctx.from,
      ctx.to,
      ctx.selectedText,
    );
    new NoteModal(this.app, "", async (text) => {
      const ann: Annotation = { ...anchor, type: "note", noteText: text };
      await this.store.addAnnotation(ctx.file.path, ann);
      this.refreshDecorations();
    }).open();
  }

  async openReviewModalForSelection(): Promise<void> {
    const ctx = this.getActiveSelectionContext();
    if (!ctx) {
      new Notice("请先选中要批阅的文字");
      return;
    }
    const anchor = await this.buildAnchor(
      ctx.file,
      ctx.doc,
      ctx.from,
      ctx.to,
      ctx.selectedText,
    );
    new ReviewModal(this.app, {}, async (text, strike) => {
      const ann: Annotation = {
        ...anchor,
        type: "review",
        reviewText: text || undefined,
        strike,
      };
      await this.store.addAnnotation(ctx.file.path, ann);
      this.refreshDecorations();
    }).open();
  }

  async createReviewFromSelection(text: string, strike: boolean): Promise<void> {
    const ctx = this.getActiveSelectionContext();
    if (!ctx) {
      new Notice("请先选中要批阅的文字");
      return;
    }
    const anchor = await this.buildAnchor(
      ctx.file,
      ctx.doc,
      ctx.from,
      ctx.to,
      ctx.selectedText,
    );
    const ann: Annotation = {
      ...anchor,
      type: "review",
      reviewText: text || undefined,
      strike,
    };
    await this.store.addAnnotation(ctx.file.path, ann);
    this.refreshDecorations();
  }

  // ---------- annotation editing ----------

  async editAnnotation(ann: Annotation): Promise<void> {
    if (ann.type === "note") {
      new NoteModal(this.app, ann.noteText ?? "", async (text) => {
        await this.store.updateAnnotation(ann.filePath, ann.id, { noteText: text });
      }).open();
    } else if (ann.type === "review") {
      new ReviewModal(
        this.app,
        { text: ann.reviewText ?? "", strike: ann.strike, isEdit: true },
        async (text, strike) => {
          await this.store.updateAnnotation(ann.filePath, ann.id, {
            reviewText: text || undefined,
            strike,
          });
        },
      ).open();
    } else if (ann.type === "highlight") {
      const order: HighlightColor[] = ["yellow", "blue", "green", "purple"];
      const next = order[(order.indexOf(ann.highlightColor ?? "yellow") + 1) % order.length];
      await this.store.updateAnnotation(ann.filePath, ann.id, { highlightColor: next });
    }
  }

  async deleteAnnotation(ann: Annotation): Promise<void> {
    new ConfirmModal(this.app, "删除该批注？", async () => {
      await this.store.removeAnnotation(ann.filePath, ann.id);
      this.refreshDecorations();
    }).open();
  }

  // ---------- decorations refresh ----------

  async refreshDecorations(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const md = leaf.view as MarkdownView;
      if (!md?.file) continue;
      const cm: EditorView | undefined = (md.editor as unknown as { cm?: EditorView }).cm;
      if (!cm) continue;
      const data = await this.store.getFile(md.file.path);
      cm.dispatch({ effects: setAnnotationsEffect.of(data.annotations) });
    }
  }

  // ---------- export commands ----------

  async runExport(filePath?: string): Promise<void> {
    const path = filePath ?? this.resolveTargetMarkdownPath();
    if (!path) {
      new Notice("请先打开一个 Markdown 文件");
      return;
    }
    await this.store.flushAll();
    const data = await this.store.getFile(path);
    if (data.annotations.filter((a) => a.type === "review").length === 0) {
      new Notice("当前文件没有批阅意见");
      return;
    }
    const target = await this.reviewExporter.exportToVault(path, data, {
      includeReadingNotes: this.settings.includeReadingNotesInExport,
    });
    if (target) {
      const f = this.app.vault.getAbstractFileByPath(target);
      if (f instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(f);
      }
    }
  }

  async runCopyPrompt(filePath?: string): Promise<void> {
    const path = filePath ?? this.resolveTargetMarkdownPath();
    if (!path) {
      new Notice("请先打开一个 Markdown 文件");
      return;
    }
    await this.store.flushAll();
    const data = await this.store.getFile(path);
    await this.promptExporter.copyToClipboard(path, data, {
      includeReadingNotes: this.settings.includeReadingNotesInExport,
    });
  }

  private resolveTargetMarkdownPath(): string | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active?.file) return active.file.path;
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves) {
      const v = leaf.view as MarkdownView;
      if (v?.file) return v.file.path;
    }
    return null;
  }

  // ---------- sidebar plumbing ----------

  async openSidebar(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (!leaf) {
      const right = this.app.workspace.getRightLeaf(false);
      if (right) {
        await right.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
        leaf = right;
      }
    }
    if (leaf) this.app.workspace.revealLeaf(leaf);
  }
}

class ConfirmModal extends Modal {
  constructor(app: App, private message: string, private onConfirm: () => void) {
    super(app);
  }
  onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("取消").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("确认")
          .setWarning()
          .onClick(() => {
            this.onConfirm();
            this.close();
          }),
      );
  }
}
