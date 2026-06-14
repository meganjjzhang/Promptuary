# 代码 Review 报告 — MultiAIEdit v0.1

> Review 时间: 2026-06-14 | 范围: src/ 全部 14 个 .ts 文件
> 修复时间: 2026-06-14 | 已修复: BUG-01/03/04/05/06/07/09/11/17 + handleRename/Delete pending write

---

## 一、P0 — 数据丢失 / 崩溃级 Bug

### BUG-01: Sidecar 路径编码碰撞，可导致数据丢失

**文件**: `src/utils/path.ts`

`encodeSidecarName` 用 `__` 替换 `/`，但文件名本身可以包含 `__`。

```
a/b__c.md  →  a__b__c.json
a__b/c.md  →  a__b__c.json   ← 碰撞！
```

两个不同 vault 文件的 sidecar 会写入同一个 JSON，后者覆盖前者，**直接丢失批注数据**。

**修复方向**: 改用 URL-safe base64 编码，或用 `encodeURIComponent` 对路径整体编码，避免双下划线歧义。

---

### BUG-02: 重命名文件时，pending writes 会重建旧 sidecar

**文件**: `src/annotation/AnnotationStore.ts` → `handleRename` + `scheduleWrite`

当文件重命名时：
1. `handleRename` 移动磁盘上的 sidecar 到新路径
2. 更新 cache（oldPath → newPath）
3. 但 `writeTimers` 中可能还有旧路径的定时器

定时器触发时 `flush(oldPath)` 找到 cache 中已无 oldPath，直接 return。这看起来没问题。**但**：如果在步骤 2 之后、定时器触发之前，又有对 oldPath 的写入（理论上不应该，因为没有 md 文件对应旧路径了），这也不会出问题。

**然而**，真正的 bug 在 `handleDelete`：

1. `handleDelete` 把 sidecar 移到 orphans 目录
2. `cache.delete(file.path)` 清除缓存
3. 但 `pendingFlush` 中可能还有该路径
4. 定时器触发时 `flush` 查 cache 为空 → return，不写盘 → 安全

**重新评估**: 这个实际上是安全的，因为 `flush` 只在 cache 中有数据时才写盘。降级为 P2 注意事项。

---

### BUG-03: 重叠批注导致 RangeSetBuilder 抛异常

**文件**: `src/editor/AnnotationDecorator.ts` → `buildDecorations`

`RangeSetBuilder` 要求 ranges 按 from 排序且**不重叠**。当前代码只排序，不检查/合并重叠：

```ts
ranges.sort((a, b) => a.from - b.from || a.to - b.to);
for (const r of ranges) {
  if (r.from === r.to) continue;
  builder.add(r.from, r.to, r.deco);  // ← 重叠时抛异常
}
```

场景：用户选中 "hello world" 高亮黄色，再选中 "world foo" 添加批阅 → 两个 deco 的 [from, to] 重叠 → **CM6 内部报错**。

**修复方向**: 合并重叠 ranges（取并集，组合 CSS class），或拆分为不重叠子区间。

---

### BUG-04: 设置变更后 sidecarDir 不生效

**文件**: `src/main.ts` + `src/annotation/AnnotationStore.ts`

`AnnotationStore` 在构造时接收 `rootDir` 并一直持有：

```ts
this.store = new AnnotationStore(this.app, this.settings.sidecarDir);
```

用户在设置中修改 `sidecarDir` 后，`AnnotationStore` 仍使用旧目录读写。同理 `ReviewExporter` 的 `exportDir` 也不更新。

**后果**: 批注写入旧目录，用户以为改了位置但实际没有，可能误删旧目录丢失数据。

**修复方向**: 每次写盘时读取 `plugin.settings.sidecarDir`，或在 settings onChange 中重建 store 实例（需先 flush）。

---

## 二、P1 — 功能性 Bug

### BUG-05: 同一文件开两个编辑面板，装饰只在活动面板生效

**文件**: `src/main.ts` → `refreshDecorations`

```ts
async refreshDecorations(): Promise<void> {
  const md = this.app.workspace.getActiveViewOfType(MarkdownView);
  // 只更新了 active view 的 CM
  cm.dispatch({ effects: setAnnotationsEffect.of(data.annotations) });
}
```

如果同一文件在左右分屏都打开，只有当前 focus 的那个面板会收到 `setAnnotationsEffect`，另一边的装饰不刷新。

**修复方向**: 遍历所有 `getLeavesOfType("markdown")`，对每个匹配文件路径的 leaf 都 dispatch。

---

### BUG-06: 移动端 clipboard API 可能不可用

**文件**: `src/export/Exporters.ts` → `PromptExporter.copyToClipboard`

```ts
await navigator.clipboard.writeText(prompt);
```

`navigator.clipboard.writeText` 在非安全上下文（非 HTTPS）下可能抛异常。Obsidian 移动端的 webview 不一定是安全上下文。

**修复方向**: 用 try-catch 包裹，fallback 到 `document.execCommand("copy")`，或使用 Obsidian 的 `app.vault.adapter` + 手动复制方案。

---

### BUG-07: 导出批阅文件不含原文，AI 无法独立执行修改

**文件**: `src/export/Exporters.ts` → `buildReviewMarkdown`

`buildReviewMarkdown` 只包含片段引用（selectedText + contextBefore/After），不包含完整原文。虽然用 `[[wiki-link]]` 引用了原文件，但 AI 工具（ChatGPT/Claude）不会读 Obsidian 链接。

对比 `buildPromptText`（复制 Prompt 路径）是包含完整原文的。

**后果**: 用户导出文件后发给 AI，AI 只看到片段，无法准确修改。

**修复方向**: 在导出文件中也附加完整原文（和 `buildPromptText` 一致），或在导出时自动读取原文并追加。

---

### BUG-08: Popover 定位在嵌套滚动容器中偏移

**文件**: `src/editor/SelectionPopover.ts` → `position`

```ts
const top = coords.top - 44 + window.scrollY;
const left = Math.max(8, coords.left + window.scrollX);
```

Popover 挂载在 `document.body` 上，用 `position: absolute` + `window.scrollY/X` 做偏移。但 Obsidian 编辑区域可能在有自身滚动的容器内（如侧边栏编辑器），此时 `window.scrollY` 不反映容器内偏移，导致 Popover 位置错乱。

**修复方向**: 使用 `position: fixed` 并直接用 `coords` 的客户端坐标，或使用 CM6 的 `tooltip` 扩展机制。

---

### BUG-09: 删除线批注（review + strike）在侧边栏编辑后无法清空 strike

**文件**: `src/editor/NoteModal.ts` → `ReviewModal`

编辑已有批阅时，ReviewModal 可以修改文本和切换 strike。但如果用户想将 "删除线" 改为 "仅批阅"（取消 strike），UI 可以操作。但 `submit()` 中：

```ts
if (!this.value.trim() && !this.strike) { this.close(); return; }
```

当用户清空文本、取消 strike → 视为"无有效内容" → 直接关闭，**不保存修改**。实际上用户的意图可能是"去掉删除线，保留纯标记"。

**修复方向**: 编辑模式下不应跳过提交，应始终允许保存（因为是修改而非新建）。在 `editAnnotation` 路径下传入编辑模式标记。

---

### BUG-10: `locate()` 中 occurrenceIndex 在文档编辑后不可靠

**文件**: `src/annotation/AnnotationLocator.ts` → `locate`

`occurrenceIndex` 在创建时记录的是 selectedText 在文档中第几次出现。但文档被编辑后：
- 如果用户在前面插入了相同文本，occurrenceIndex 会偏移
- 如果前面的匹配被删除，occurrenceIndex 会越界

当前代码有越界保护（`ann.occurrenceIndex >= 0 && ann.occurrenceIndex < occ.length`），越界时 fallback 到 lineHint。但**偏移未越界时**会用错误的匹配。

**后果**: 批注高亮"跳"到错误的位置，且用户可能不注意到。

**修复方向**: 这在设计文档中已被识别为"交给 LLM"的权衡，但 v0.1 应至少在 occurrenceIndex 匹配到模糊结果时标记为 `fuzzy` 而非 `strict`。当前步骤 4 只在 selectedText 有多个匹配时返回 fuzzy，但不验证 occurrenceIndex 是否仍然准确。

---

## 三、P2 — 边界情况 / 性能 / 代码质量

### BUG-11: `loadFromDisk` 版本迁移过于激进

**文件**: `src/annotation/AnnotationStore.ts`

```ts
if (!json || json.version !== FILE_VERSION) {
  return { ...emptyAnnotationFile(filePath), ...json, version: FILE_VERSION };
}
```

如果 JSON 解析成功但结构完全不对（比如用户放了个随机 JSON 文件），spread 会把无关字段混入 `AnnotationFile`，导致后续代码读到意外属性。

**修复方向**: 对 `json` 做更严格的 schema 校验（至少检查 `annotations` 是否为数组）。

---

### BUG-12: 装饰在每次按键时全量重建

**文件**: `src/editor/AnnotationDecorator.ts` → `decorationField.update`

```ts
if (tr.docChanged) {
  return buildDecorations(tr.state.doc.toString(), tr.state.field(annotationsField));
}
```

每次文档变更（每次按键）都重建所有装饰，对每个 annotation 都跑一次 `locate()`。100 条批注 × 10KB 文档 = 每次按键 100 次文本搜索。

**修复方向**: 短期可加 debounce（CM6 `EditorView.updateListener` + debounce），中期可在 annotationsField 不变时复用上次 locate 结果。

---

### BUG-13: `NoteModal` 允许空内容提交时静默吞掉

**文件**: `src/editor/NoteModal.ts`

用户打开 NoteModal，清空内容，点保存 → `submit()` 检测到空字符串 → `this.close()` → 无任何反馈。用户不知道"没保存"。

**修复方向**: 显示 Notice 提示"笔记内容为空，未保存"。

---

### BUG-14: `lastDocText` 通过方括号访问私有属性

**文件**: `src/sidebar/SidebarView.ts`

```ts
function lastDocText(view: SidebarView): string | null {
  const path = view["currentFilePath"] as string | null;
```

TypeScript `strictNullChecks` 下通过 `[]` 访问 private 字段，虽然运行时可以但类型不安全，且重构时容易遗漏。

**修复方向**: 在 SidebarView 上暴露 `getCurrentFilePath()` getter，或将 `lastDocText` 改为实例方法。

---

### BUG-15: `sha256` 在 baselineHash 中包含了整个文档

**文件**: `src/main.ts` → `buildAnchor` + `src/utils/hash.ts`

每次创建批注都 `sha256(doc)` 计算整篇文档哈希。对于大文档（>100KB），每次高亮都要跑一次 SHA-256。

**修复方向**: 缓存当前文档的 hash，在 `refreshDecorations` 或文件变更时计算一次。

---

### BUG-16: `AnnotationStore.fileHash` 读取整个文件内容

**文件**: `src/annotation/AnnotationStore.ts`

```ts
async fileHash(filePath: string): Promise<string> {
  const text = await this.app.vault.read(f);
  return sha256(text);
}
```

`app.vault.read` 对大文件很慢，且侧边栏 `onActiveLeafChange` 和 `modify` 事件都会调用它。

**修复方向**: 复用 editor 内容（已在内存中）而非重新从磁盘读取；或缓存 hash 值。

---

### BUG-17: 侧边栏 `modify` 事件对每个按键都刷新

**文件**: `src/sidebar/SidebarView.ts`

```ts
this.registerEvent(
  this.app.vault.on("modify", async (file) => {
    if (file.path === this.currentFilePath) {
      this.currentHash = await this.plugin.store.fileHash(file.path);
      await this.refresh();
    }
  }),
);
```

每次按键都：读文件 → sha256 → refresh() → locate 所有批注 → 重建 DOM。严重影响性能。

**修复方向**: 加 debounce（至少 300ms），或只在 `active-leaf-change` 和 store `change` 时刷新侧边栏，不监听 `modify`。

---

### BUG-18: `handleRename` 只检查 oldPath 的 .md 后缀

**文件**: `src/annotation/AnnotationStore.ts`

```ts
if (!oldPath.endsWith(".md")) return;
```

如果用户把一个非 .md 文件重命名为 .md（例如 `.txt` → `.md`），不会处理 sidecar。虽然 Obsidian 场景中少见，但逻辑不完整。

---

## 四、架构 / 设计层面建议

| # | 建议 | 理由 |
|---|------|------|
| A1 | **CM6 extension 改为 per-editor state** | 当前用全局 `setAnnotationsEffect`，多面板场景根本无法正确工作。应改为每个 CM view 实例持有自己的 annotation state |
| A2 | **Popover 改用 CM6 Tooltip 机制** | 自定义 DOM 定位与 Obsidian 内部布局冲突频繁，CM6 有官方 tooltip 扩展 |
| A3 | **侧边栏加 debounce** | `modify` + `refresh` 的每次按键全量刷新需要 debounce |
| A4 | **Sidecar 路径编码改方案** | 当前 `__` 替换有碰撞风险，建议 base64url 或 `encodeURIComponent` |
| A5 | **Store 与 Settings 解耦** | Store 构造时固化 `sidecarDir`，改为每次操作时读取 settings |

---

## 五、优先修复建议

**立即修（P0）**:
1. BUG-01: 路径编码碰撞 → 改用 base64url 编码
2. BUG-03: 重叠批注崩溃 → 合并/拆分重叠区间
3. BUG-04: sidecarDir 设置不生效 → settings → store 联动

**尽快修（P1）**:
4. BUG-05: 多面板装饰不同步 → 遍历所有 leaf dispatch
5. BUG-07: 导出文件缺原文 → 追加原文段落
6. BUG-09: 编辑模式下无法清空 strike → 区分新建/编辑
7. BUG-17: 侧边栏按键全量刷新 → 加 debounce

**可延后（P2）**:
8. BUG-12/16: 性能优化 → debounce + hash 缓存
9. BUG-06: 移动端 clipboard → fallback
10. BUG-11: 版本迁移校验 → schema 检查
