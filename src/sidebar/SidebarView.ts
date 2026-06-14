import { ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { Annotation, ViewMode } from "../annotation/AnnotationModel";
import { AnnotationStore } from "../annotation/AnnotationStore";
import { locate } from "../annotation/AnnotationLocator";
import type MultiAIEditPlugin from "../main";
import { isMobile } from "../utils/platform";

export const SIDEBAR_VIEW_TYPE = "multiaiedit-sidebar";

export class SidebarView extends ItemView {
  private mode: ViewMode = "reading";
  private currentFilePath: string | null = null;
  private currentHash: string | null = null;
  private baselineMismatch = false;
  private container!: HTMLElement;
  private refreshSeq = 0;
  private modifyDebounceTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: MultiAIEditPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }
  getDisplayText(): string {
    return "MultiAIEdit";
  }
  getIcon(): string {
    return "highlighter";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.container = this.contentEl.createDiv({ cls: "multiaiedit-sidebar" });
    this.mode = this.plugin.settings.defaultMode;

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.onActiveLeafChange()),
    );
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file.path === this.currentFilePath) {
          // Debounce: don't refresh on every keystroke, wait 300ms of silence.
          if (this.modifyDebounceTimer !== null) window.clearTimeout(this.modifyDebounceTimer);
          this.modifyDebounceTimer = window.setTimeout(async () => {
            this.modifyDebounceTimer = null;
            this.currentHash = await this.plugin.store.fileHash(file.path);
            await this.refresh();
          }, 300);
        }
      }),
    );
    this.registerEvent(
      this.plugin.store.on("change", (path: string) => {
        if (path === this.currentFilePath) this.refresh();
      }),
    );
    await this.onActiveLeafChange();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.plugin.onModeChange(mode);
    this.refresh();
  }

  getMode(): ViewMode {
    return this.mode;
  }

  /** Public getter so external code (e.g. main.ts currentMode()) can
   *  read the current mode without bracket-accessing private fields. */
  getCurrentFilePath(): string | null {
    return this.currentFilePath;
  }

  private async onActiveLeafChange(): Promise<void> {
    // The sidebar itself is a leaf, so when the user clicks it the active leaf
    // changes and `getActiveViewOfType(MarkdownView)` returns null. Fall back
    // to the most recent markdown leaf so the sidebar keeps showing the file
    // the user was working on.
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    let path: string | null = null;
    if (active?.file) {
      path = active.file.path;
    } else {
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      for (const leaf of leaves) {
        const v = leaf.view as MarkdownView;
        if (v?.file) {
          path = v.file.path;
          break;
        }
      }
    }
    this.currentFilePath = path;
    this.currentHash = path ? await this.plugin.store.fileHash(path) : null;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const myToken = ++this.refreshSeq;
    // Don't empty the container yet — we may yield on `await` below and a
    // newer refresh may take over. Only the winner empties + paints.
    if (!this.currentFilePath) {
      if (myToken !== this.refreshSeq) return;
      this.container.empty();
      this.renderModeCapsule();
      this.container.createDiv({ cls: "mae-empty", text: "请打开一个 Markdown 文件" });
      return;
    }
    const data = await this.plugin.store.getFile(this.currentFilePath);
    if (myToken !== this.refreshSeq) return;

    // Auto-heal baseline:
    // 1. hash unchanged → nothing to do.
    // 2. hash changed but every annotation still resolves to `strict` → silently
    //    advance baseline. The user did edit the doc but no annotation is at risk.
    // 3. hash changed AND ≥1 annotation is fuzzy/drifted → show the banner with a
    //    one-click "全部确认" that advances baseline.
    let affected: { fuzzy: number; drifted: number } = { fuzzy: 0, drifted: 0 };
    const hashChanged =
      !!data.baselineHash && !!this.currentHash && data.baselineHash !== this.currentHash;
    if (hashChanged) {
      const docText = lastDocText(this);
      if (docText !== null) {
        for (const ann of data.annotations) {
          const r = locate(docText, ann);
          if (r.status === "fuzzy") affected.fuzzy++;
          else if (r.status === "drifted") affected.drifted++;
        }
        if (affected.fuzzy === 0 && affected.drifted === 0 && this.currentHash) {
          // Self-heal silently — pass `silent` so the store doesn't fire a
          // `change` event that would re-trigger refresh and double-paint.
          await this.plugin.store.confirmBaseline(this.currentFilePath, this.currentHash, true);
          if (myToken !== this.refreshSeq) return;
          this.baselineMismatch = false;
        } else {
          this.baselineMismatch = true;
        }
      } else {
        // No doc text yet (probably switching files) — skip check this round
        this.baselineMismatch = false;
      }
    } else {
      this.baselineMismatch = false;
    }

    // We are the winner — paint.
    if (myToken !== this.refreshSeq) return;
    this.container.empty();
    this.renderModeCapsule();
    if (this.baselineMismatch) this.renderBanner(affected);
    const reviewCount = data.annotations.filter((a) => a.type === "review").length;
    // 导出/复制 Prompt 只在批阅与全部模式下出现 —— 阅读模式聚焦阅读，
    // 不引入 AI 批阅相关动作。
    if (this.mode !== "reading") this.renderToolbar(reviewCount);
    this.renderList(data.annotations);
  }

  private renderModeCapsule(): void {
    const wrap = this.container.createDiv({ cls: "mae-mode-capsule" });
    const modes: Array<[ViewMode, string]> = [
      ["reading", "阅读"],
      ["reviewing", "批阅"],
      ["all", "全部"],
    ];
    for (const [m, label] of modes) {
      const btn = wrap.createEl("button", { text: label });
      if (this.mode === m) btn.addClass("active");
      btn.onclick = () => this.setMode(m);
    }
  }

  private renderBanner(affected: { fuzzy: number; drifted: number }): void {
    const banner = this.container.createDiv({ cls: "mae-banner" });
    const parts: string[] = [];
    if (affected.drifted > 0) parts.push(`${affected.drifted} 条已漂移`);
    if (affected.fuzzy > 0) parts.push(`${affected.fuzzy} 条位置存在歧义`);
    const msg = parts.length > 0
      ? `原文变更后有 ${parts.join("、")}，请检查后确认`
      : "原文已变更，请检查批注";
    banner.createSpan({ text: msg });
    const btn = banner.createEl("button", { text: "全部确认" });
    btn.onclick = async () => {
      if (!this.currentFilePath || !this.currentHash) return;
      await this.plugin.store.confirmBaseline(this.currentFilePath, this.currentHash);
      this.refresh();
      new Notice("baseline 已更新");
    };
  }

  private renderToolbar(count: number): void {
    const bar = this.container.createDiv({ cls: "mae-toolbar" });
    const exportBtn = bar.createEl("button", { text: `导出批阅 (${count})` });
    exportBtn.onclick = () => {
      if (this.currentFilePath) this.plugin.runExport(this.currentFilePath);
      else this.plugin.runExport();
    };
    const copyBtn = bar.createEl("button", { text: "复制 Prompt", cls: "secondary" });
    copyBtn.onclick = () => {
      if (this.currentFilePath) this.plugin.runCopyPrompt(this.currentFilePath);
      else this.plugin.runCopyPrompt();
    };
  }

  private renderList(all: Annotation[]): void {
    const filtered = all.filter((a) => {
      if (this.mode === "reading") return a.type === "highlight" || a.type === "note";
      if (this.mode === "reviewing") return a.type === "review";
      return true;
    });
    if (filtered.length === 0) {
      this.container.createDiv({ cls: "mae-empty", text: emptyText(this.mode) });
      return;
    }
    // Sort by line position when possible, fallback to createdAt
    const docText = lastDocText(this);
    const sorted = [...filtered].sort((a, b) => {
      if (docText) {
        const ra = locate(docText, a);
        const rb = locate(docText, b);
        const fa = ra.from ?? Number.MAX_SAFE_INTEGER;
        const fb = rb.from ?? Number.MAX_SAFE_INTEGER;
        if (fa !== fb) return fa - fb;
      }
      return a.createdAt - b.createdAt;
    });
    for (const ann of sorted) this.renderCard(ann, docText);
  }

  private renderCard(ann: Annotation, docText: string | null): void {
    const r = docText ? locate(docText, ann) : null;
    const card = this.container.createDiv({ cls: "mae-card" });
    if (r) {
      if (r.status === "fuzzy") card.addClass("fuzzy");
      if (r.status === "drifted") card.addClass("drifted");
    }

    const meta = card.createDiv({ cls: "mae-card-meta" });
    if (ann.type === "highlight") {
      const tag = meta.createSpan({ cls: `mae-tag ${ann.highlightColor ?? "yellow"}` });
      tag.setText("高亮");
    } else if (ann.type === "note") {
      meta.createSpan({ cls: "mae-tag", text: "笔记" });
    } else {
      meta.createSpan({ cls: "mae-tag", text: ann.strike ? "删除" : "批阅" });
    }
    if (r?.status === "fuzzy") meta.createSpan({ text: "⚠️ 位置存在歧义" });
    if (r?.status === "drifted") meta.createSpan({ text: "⚠️ 已漂移" });

    const txt = card.createDiv({
      cls: "mae-card-text" + (ann.strike ? " strike" : ""),
      text: ann.selectedText,
    });
    if (ann.type === "note" && ann.noteText) {
      card.createDiv({ cls: "mae-card-review", text: ann.noteText });
    }
    if (ann.type === "review" && ann.reviewText) {
      card.createDiv({ cls: "mae-card-review", text: ann.reviewText });
    }

    const actions = card.createDiv({ cls: "mae-card-actions" });
    const jumpBtn = actions.createEl("button", { text: "跳转" });
    jumpBtn.onclick = (e) => {
      e.stopPropagation();
      this.jumpTo(ann);
    };
    const editBtn = actions.createEl("button", { text: "编辑" });
    editBtn.onclick = (e) => {
      e.stopPropagation();
      this.plugin.editAnnotation(ann);
    };
    const delBtn = actions.createEl("button", { text: "删除" });
    delBtn.onclick = (e) => {
      e.stopPropagation();
      this.plugin.deleteAnnotation(ann);
    };

    card.onclick = () => this.jumpTo(ann);
  }

  private async jumpTo(ann: Annotation): Promise<void> {
    if (!this.currentFilePath) return;
    const file = this.app.vault.getAbstractFileByPath(this.currentFilePath);
    if (!(file instanceof TFile)) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const doc = view.editor.getValue();
    const r = locate(doc, ann);
    if (r.status === "drifted" || r.from === undefined || r.to === undefined) {
      new Notice("无法定位该批注，可能已漂移");
      return;
    }
    const fromPos = view.editor.offsetToPos(r.from);
    const toPos = view.editor.offsetToPos(r.to);
    view.editor.setSelection(fromPos, toPos);
    view.editor.scrollIntoView({ from: fromPos, to: toPos }, true);
  }
}

function emptyText(mode: ViewMode): string {
  if (mode === "reading") return "还没有阅读标注。选中文字试试。";
  if (mode === "reviewing") return "还没有批阅意见。切到批阅模式后选中文字试试。";
  return "这个文档还没有任何标注。";
}

/** Get the editor text of the markdown leaf that owns the sidebar's
 * `currentFilePath`, regardless of whether it is the active view. Returns
 * null when no such leaf is open. */
function lastDocText(view: SidebarView): string | null {
  const path = view.getCurrentFilePath();
  if (!path) return null;
  const leaves = view.app.workspace.getLeavesOfType("markdown");
  for (const leaf of leaves) {
    const md = leaf.view as MarkdownView;
    if (md?.file?.path === path) return md.editor.getValue();
  }
  return null;
}
