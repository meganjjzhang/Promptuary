import { App } from "obsidian";
import { HighlightColor, ViewMode } from "../annotation/AnnotationModel";
import { PopoverCallbacks } from "./SelectionPopover";
import { ReviewModal } from "./NoteModal";

/**
 * Mobile bottom toolbar — a thin alternative to SelectionPopover that
 * lives at the bottom of the screen so it doesn't fight the OS selection
 * menu. See technical-design.md §6.2.
 */
export class BottomToolbar {
  private el: HTMLDivElement;
  private mode: ViewMode = "reading";
  private active = false;

  constructor(private app: App, private cb: PopoverCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "multiaiedit-bottom-toolbar";
    this.el.style.display = "none";
    document.body.appendChild(this.el);
  }

  destroy(): void {
    this.el.remove();
    this.active = false;
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    if (this.active) this.render();
  }

  show(): void {
    this.active = true;
    this.render();
    this.el.style.display = "flex";
  }

  hide(): void {
    this.active = false;
    this.el.style.display = "none";
  }

  private render(): void {
    this.el.empty();
    if (this.mode === "reviewing") {
      this.renderReviewing();
    } else {
      this.renderReading();
    }
  }

  private renderReading(): void {
    const colors: HighlightColor[] = ["yellow", "blue", "green", "purple"];
    for (const color of colors) {
      const dot = this.el.createDiv({ cls: `mae-color ${color}` });
      dot.title = `${color} 高亮`;
      dot.onclick = () => {
        this.cb.onHighlight(color);
        this.hide();
      };
    }
    const noteBtn = this.el.createEl("button", { text: "笔记" });
    noteBtn.onclick = () => {
      this.cb.onNote();
      this.hide();
    };
    const close = this.el.createEl("button", { text: "×", cls: "secondary" });
    close.onclick = () => this.hide();
  }

  private renderReviewing(): void {
    const strikeBtn = this.el.createEl("button", { text: "S 删除线" });
    strikeBtn.onclick = () => {
      this.cb.onStrike();
      this.hide();
    };
    const input = this.el.createEl("input", { type: "text" });
    input.placeholder = "输入批阅意见……";
    input.style.flex = "1";
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        const text = input.value.trim();
        if (text) {
          this.cb.onReview(text, false);
          this.hide();
        }
      }
    };
    const moreBtn = this.el.createEl("button", { text: "更多…" });
    moreBtn.onclick = () => {
      const m = new ReviewModal(this.app, {}, (text, strike) => {
        this.cb.onReview(text, strike);
      });
      this.hide();
      m.open();
    };
    const close = this.el.createEl("button", { text: "×" });
    close.onclick = () => this.hide();
  }
}
