import { EditorView } from "@codemirror/view";
import { App } from "obsidian";
import { HighlightColor, ViewMode } from "../annotation/AnnotationModel";
import { ReviewModal } from "./NoteModal";

export interface PopoverCallbacks {
  onHighlight: (color: HighlightColor) => void;
  onNote: () => void;
  onReview: (text: string, strike: boolean) => void;
  onStrike: () => void; // quick strike-only review
}

/**
 * Desktop selection popover — a single absolutely-positioned DOM element
 * inserted into the editor's parent. The plugin owns lifecycle and updates
 * its position as the selection changes.
 */
export class SelectionPopover {
  private el: HTMLDivElement;
  private mode: ViewMode = "reading";
  private current: { view: EditorView; from: number; to: number } | null = null;
  /** The mode that the current DOM was built for. When `mode === renderedMode`
   * a `show()` call only repositions the popover instead of rebuilding the
   * DOM — critical during a mouse-drag selection where `selectionchange`
   * fires on every pixel and a rebuild would steal focus from the editor. */
  private renderedMode: ViewMode | null = null;

  constructor(private app: App, private cb: PopoverCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "multiaiedit-popover";
    this.el.style.display = "none";
    document.body.appendChild(this.el);
  }

  destroy(): void {
    this.el.remove();
    this.current = null;
    this.renderedMode = null;
  }

  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // Mode changed → DOM is stale, force re-render on the next show().
    this.renderedMode = null;
    if (this.current) this.render();
  }

  /** Show popover for a given selection. Returns false if there is no real
   * selection. */
  show(view: EditorView, from: number, to: number): boolean {
    if (from === to) {
      this.hide();
      return false;
    }
    this.current = { view, from, to };
    if (this.renderedMode !== this.mode) this.render();
    this.position(view, from);
    return true;
  }

  hide(): void {
    this.el.style.display = "none";
    this.current = null;
  }

  private position(view: EditorView, from: number): void {
    const coords = view.coordsAtPos(from);
    if (!coords) return;
    const top = coords.top - 44 + window.scrollY;
    const left = Math.max(8, coords.left + window.scrollX);
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
    this.el.style.display = "flex";
  }

  private render(): void {
    this.el.empty();
    if (this.mode === "reviewing") {
      this.renderReviewing();
    } else {
      // "reading" and "all" both show the reading toolbar (PRD §4.1)
      this.renderReading();
    }
    this.renderedMode = this.mode;
  }

  private renderReading(): void {
    const colors: HighlightColor[] = ["yellow", "blue", "green", "purple"];
    for (const color of colors) {
      const dot = this.el.createDiv({ cls: `mae-color ${color}` });
      dot.title = `${color} 高亮`;
      dot.onmousedown = (e) => {
        // mousedown so the editor selection isn't lost before we read it
        e.preventDefault();
        this.cb.onHighlight(color);
        this.hide();
      };
    }
    const noteBtn = this.el.createEl("button", { text: "笔记" });
    noteBtn.onmousedown = (e) => {
      e.preventDefault();
      this.cb.onNote();
      this.hide();
    };
  }

  private renderReviewing(): void {
    const strikeBtn = this.el.createEl("button", { text: "S 删除线" });
    strikeBtn.title = "标记为删除线";
    strikeBtn.onmousedown = (e) => {
      e.preventDefault();
      this.cb.onStrike();
      this.hide();
    };

    const input = this.el.createEl("input", { type: "text" });
    input.placeholder = "输入批阅意见……";
    // No auto-focus: stealing focus from the editor while the user is still
    // dragging to select would terminate the selection. The user clicks the
    // input when ready to type.
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          this.cb.onReview(text, false);
          this.hide();
        }
      } else if (e.key === "Escape") {
        this.hide();
      }
    };

    const moreBtn = this.el.createEl("button", { text: "更多…" });
    moreBtn.title = "打开批阅弹窗";
    moreBtn.onmousedown = (e) => {
      e.preventDefault();
      const modal = new ReviewModal(this.app, {}, (text, strike) => {
        this.cb.onReview(text, strike);
      });
      this.hide();
      modal.open();
    };
  }
}
