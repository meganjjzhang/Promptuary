# MultiAIEdit 技术实现难点分析

> ⚠️ **本文档已废弃,内容已并入 [technical-design.md](technical-design.md) §6 §7,以那份为准。**
> 保留本文档仅用于追溯讨论历史。

> 基于 PRD v0.4 | 日期：2026-06-11 | 作者：檐灯

---

## 一、总体判断

PRD 的技术方案**整体可行**，但存在 2 个高风险模块（高亮渲染、选中文本浮层）和 1 个中高风险模块（CLI 跨平台执行）。低风险模块（侧边栏、导出、复制 Prompt、设置面板）均为 Obsidian 标准模式，竞品已验证。

**核心结论**：v0.1 的硬骨头是 **CM6 Decoration 高亮 + 选中文本浮层**，建议先做最小 PoC 验证，再进入完整开发。v0.2 的 CLI 执行是工程量最大的模块，建议先只支持 macOS。

---

## 二、难点逐模块分析

### 难点 1：高亮渲染与锚点定位（风险：高，工期：2-3 天）

#### 问题 A：Decoration 跨行高亮

CM6 的 Decoration 系统是基于字符偏移（from/to）的，而非行号。跨行选区需要拆分为多行独立 Decoration，每行有独立的 from/to：

- 首行：`from = selectionStart`，`to = 行末偏移`
- 中间行：`from = 行首偏移`，`to = 行末偏移`
- 尾行：`from = 行首偏移`，`to = selectionEnd`

视觉断裂风险：每行独立渲染背景色，首尾行半高亮。需要确保：
- 每行 Decoration 的 `class` 相同，CSS 使用 `background-color` 而非 `border` 或 `box-shadow`
- 行首行尾对齐到编辑器内容区边缘（需要 CSS `display: inline` 配合编辑器布局）

**Sidebar Highlights 插件已用此方案**，代码可参考。

#### 问题 B：锚点漂移

用户在文档其他位置编辑后，所有基于 from/to 的偏移量都会失效。PRD 决策是"不做逐条重锚定"，但**当前编辑会话内的高亮仍然需要跟随文本移动**，否则用户体验会很差（高亮飘走）。

解决方案：利用 CM6 的 `updateListener`，在每次 Transaction 后：
1. 获取 `changes`（ChangeSet）
2. 对每条 annotation 的 from/to 应用偏移调整
3. 重新生成 Decoration

这是 Obsidian 高亮类插件的标准做法，但逻辑较复杂（特别是插入/删除导致的偏移计算）。可以简化为：每次 Transaction 后完全重建 Decoration（性能可接受，单个 Markdown 文件通常 < 100 条批注）。

#### 问题 C：删除线渲染

`strike: true` 的 review 需要不同的 Decoration 样式：
- 文本加 `text-decoration: line-through`
- 背景色为 muted red
- 与高亮用不同的 CSS class 区分

技术上无额外难点，但需要与高亮共用同一套 Decoration 管理逻辑。

#### 关键 API

```typescript
// 获取选区
const { from, to } = view.state.selection.main;
const selectedText = view.state.sliceDoc(from, to);

// 创建高亮 Decoration
const decoration = Decoration.inline(from, to, {
  class: 'multiaiedit-highlight-yellow',
});

// 注册 Decoration StateField
const decorationField = StateField.define<RangeSet<Decoration>>({
  create: () => Decoration.none,
  update: (decorations, tr) => {
    // 处理文档变更 + 重建装饰
  },
  provide: (f) => EditorView.decorations.from(f),
});
```

#### MVP 简化建议

如果"编辑跟随"太复杂，v0.1 可以只做**切换文件时渲染高亮**（从 sidecar 读取 selectedText，用文本搜索定位 from/to），不做实时偏移跟随。配合 fileHash 横幅提醒，用户感知可接受。复杂度降 60%。

---

### 难点 2：选中文本浮层 Popover（风险：高，工期：2-3 天）

#### 问题 A：Popover 定位计算

Obsidian 编辑器是 CM6 实例，不是普通 DOM 文本。选区坐标获取需用：

```typescript
const coords = view.coordsAtPos(from);
// 返回 { left, right, top, bottom, ... }
```

跨行选区：`from` 和 `to` 在不同行，需取 from 行的 bottom 作为锚点。

编辑器滚动时：Popover 需跟随或隐藏，否则漂浮在错误位置。需要：
- 监听 `view.scrollDOM` 的 `scroll` 事件
- 或使用 CM6 Panel Extension（类似 autocompletion 插件的做法）

**Obsidian 没有 Popover 官方 API**，需自建。

#### 问题 B：模式感知切换

阅读模式和批阅模式展示不同的浮层内容，需要全局状态管理当前模式：

| 模式 | 浮层内容 |
|------|---------|
| 阅读 | [黄][蓝][绿][紫][笔记] |
| 批阅 | [S 删除线][输入批阅意见...] |
| 全部 | 默认阅读模式浮层 |

浮层组件需要响应式渲染，监听模式切换事件。

#### 问题 C：移动端触屏选区

iOS/Android 的文本选区行为完全不同：
- 系统选区菜单（Copy/Paste/Share）会先弹出，遮挡自定义浮层
- 长按选中的触发时机与桌面 click 不同
- 需要 `preventDefault` 或使用 `selectionchange` 事件

**建议**：移动端 v0.1 先不做浮层，改用底部工具栏（Obsidian 移动端常见模式），用户选中文本后点击底部工具栏的操作按钮。

#### 推荐方案

1. **桌面端**：用 CM6 Panel Extension 或绝对定位 DOM + `coordsAtPos()`
2. **移动端**：底部工具栏，选中文本后自动显示操作选项
3. **备选**：右键菜单（`registerEvent` + `contextmenu`），不依赖浮层定位

---

### 难点 3：CLI 跨平台执行（风险：中高，v0.2 重点）

#### 问题 A：跨平台终端唤起

三套操作系统的终端唤起方式完全不同：

| 平台 | 方案 | 坑 |
|------|------|-----|
| macOS | `osascript -e 'tell app "Terminal"...'` | Terminal vs iTerm2 |
| Windows | `start cmd /k "..."` | cmd vs PowerShell vs Windows Terminal，编码风险 |
| Linux | `xdg-terminal` / `gnome-terminal` | 无统一标准，DE 差异大 |

**可行性分析建议 v0.2 先只支持 macOS**，Windows/Linux 以"复制命令"模式兜底。

#### 问题 B：命令注入风险

自定义模板 + 变量替换 = 命令注入面：
- 文件名含空格/引号/分号 → 命令解析错误
- vault 路径含中文 → shell 编码问题
- 必须对 **所有变量值** 做 `shellescape()` 处理
- 禁止 `sudo`，禁止管道符 `|`，禁止反引号

```typescript
function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
```

#### 问题 C：执行结果监听

终端唤起后插件无法获知执行状态（osascript 启动 Terminal 后即返回）。只能通过 `vault.on('modify')` 事件监听文件变更：

```
IDLE → 用户点击执行 → CONFIRMING (展示命令)
→ 用户确认 → RUNNING (保存 originalText, 开始监听)
→ vault.on('modify') → DIFF_PREVIEW (计算 diff, 展示 Modal)
→ 超时(5min) → 提示用户手动检查
```

Agent 可能修改多个文件（生成新文件、修改 CLAUDE.md 等），需要只监听目标文件的变更。

#### Obsidian 社区审核风险

社区对 `child_process` 有安全审查。建议 v0.1 提交审核时**不包含 CLI 模块**，v0.2 单独提交或在 README 中明确说明安全策略。

---

### 难点 4：Sidecar 存储与文件变更检测（风险：中，工期：1-2 天）

#### 问题 A：并发写入

用户快速连续添加多条批注时，每次 `vault.modify()` 是异步的，后一次可能覆盖前一次。解决方案：

```typescript
// 内存缓存 + 延迟写入
private annotationsCache: Map<string, AnnotationFile> = new Map();
private writeQueue: Map<string, NodeJS.Timeout> = new Map();

saveAnnotation(filePath: string, annotation: Annotation): void {
  // 1. 更新内存缓存
  this.annotationsCache.get(filePath).annotations.push(annotation);

  // 2. Debounce 写入
  if (this.writeQueue.has(filePath)) {
    clearTimeout(this.writeQueue.get(filePath));
  }
  this.writeQueue.set(filePath, setTimeout(() => {
    this.flushToDisk(filePath);
  }, 300));
}
```

#### 问题 B：文件重命名追踪

Obsidian 提供 `vault.on('rename', file, oldPath)` 事件，需要：
1. 映射 oldPath 到 sidecar 文件
2. 重命名 sidecar 文件
3. 更新 sidecar 内的 `filePath` 字段

Axl Light 有类似实现可参考。

#### 问题 C：fileHash 变更检测

Hash 计算时机需要在两个场景触发：
1. `onActiveLeafChange`：切换到某文件时，计算当前 hash 与 sidecar 中的比对
2. `vault.on('modify')`：文件保存后，更新 sidecar 中的 hash

外部工具修改（Agent 执行后）也需要更新 hash，这需要在 Diff 确认流程中处理。

#### 存储架构

```
vault/
└── .multiaiedit/
    ├── annotations/
    │   ├── 产品定位.json      ← 与原文同名的 sidecar
    │   └── notes/
    │       └── meeting.json
    ├── config.json
    └── command-rules.json
```

注意：`.multiaiedit/` 以点开头，Obsidian 默认不显示，但 Obsidian Sync 会同步。

---

### 难点 5：移动端适配与平台差异（风险：中，持续）

#### Electron vs WebView 能力差异

| 能力 | 桌面端 Electron | 移动端 WebView |
|------|----------------|---------------|
| child_process | 可用 | 不可用 |
| fs | 完整 Node.js | 仅 vault 抽象 |
| CM6 API | 完整 | 可用但交互受限 |
| Popover | DOM 灵活 | 触屏选区冲突 |
| fetch | 无 CORS | 有 CORS |

#### 关键适配点

1. **Popover → 底部工具栏**：避免与系统选区菜单冲突
2. **CLI 执行 → 完全隐藏**：`Platform.isMobile` 判断后不渲染按钮
3. **Diff 预览 → 不支持**：用户回到桌面端确认
4. **API 直调 → requestUrl**：Obsidian 提供的 `requestUrl()` 可绕过 CORS

#### Platform.isMobile 陷阱

Obsidian 移动端是 Capacitor 包装的 WebView，部分 API 行为与桌面不同。**必须真机测试**，模拟器不够。

---

### 难点 6：Diff 预览与确认（风险：中低，工期：1-2 天，v0.2）

#### 技术选型

PRD 选择 jsdiff + 自定义 Modal，而非 CM6 MergeView。理由：
- 用户核心诉求是确认 AI 没改错，不是在 Diff 中编辑
- 逐块接受/拒绝更符合批阅粒度
- 开发量小

这是合理的。jsdiff（npm 周下载 20M+）计算 `diffLines()` 没有技术障碍。

#### 实现要点

```typescript
import * as Diff from 'diff';

const changes = Diff.diffLines(originalText, newText);

// 渲染到 Modal
// 每个变更块：
// - added: 绿色背景
// - removed: 红色背景
// - unchanged: 默认
```

逐块接受/拒绝需要维护一个 `acceptedChanges: Map<changeIndex, boolean>`，最终合并时只应用 accepted 的变更。

#### 边缘情况

- 模型返回内容被 ```markdown``` 包裹 → 需要 `cleanModelOutput()` 处理
- 模型返回内容过短（< 原文的 50%）→ 可能有截断，需提示用户
- Diff 过大（> 500 行变更）→ Modal 性能问题，需虚拟滚动

---

## 三、低风险模块（快速过）

| 模块 | 风险 | 工期 | 说明 |
|------|------|------|------|
| 侧边栏 ItemView | 低 | 1 天 | Obsidian 标准 API，`addLeaf()` + `ItemView` |
| 导出 Markdown | 低 | 0.5 天 | 纯字符串拼接 + `vault.create()` |
| 复制 Prompt | 低 | 0.5 天 | `navigator.clipboard.writeText()` |
| 设置面板 | 低 | 0.5 天 | `PluginSettingTab` 标准模式 |
| API Key 存储 | 低 | 0.5 天 | `plugin.saveData()` 自动持久化 |
| 模式胶囊切换 | 低 | 0.5 天 | 全局状态 + 侧边栏条件渲染 |

---

## 四、风险矩阵与优先级

| 模块 | 风险 | v0.1 必须? | 建议 |
|------|------|-----------|------|
| 高亮渲染 | 高 | 是 | **先做 PoC**，验证跨行高亮 + 简化编辑跟随 |
| 选中文本浮层 | 高 | 是 | 桌面端优先，移动端用底部工具栏降级 |
| Sidecar 存储 | 中 | 是 | debounce 写入 + rename 监听 |
| 侧边栏 | 低 | 是 | 标准实现 |
| 导出 + 复制 | 低 | 是 | 标准实现 |
| CLI 执行 | 中高 | 否(v0.2) | 先只支持 macOS，Windows/Linux 复制命令 |
| Diff 预览 | 中低 | 否(v0.2) | jsdiff + Modal，标准实现 |
| API 直调 | 低 | 否(v0.4) | requestUrl + 多 Provider 适配 |

---

## 五、v0.1 开发顺序建议

```
Day 1-2: PoC — CM6 高亮渲染 + 选中文本浮层（验证核心可行性）
Day 3:   Sidecar 存储层（AnnotationModel + AnnotationStore + debounce）
Day 4:   侧边栏（ItemView + 胶囊切换 + 批注列表 + 跳转/删除）
Day 5:   导出 Markdown + 复制 Prompt
Day 6:   集成测试 + 交互打磨 + 移动端基础适配
Day 7:   Buffer（修复 + 优化）
```

**PoC 验证清单**：
- [ ] 跨行文本选中后高亮渲染正确
- [ ] 文档编辑后高亮位置跟随（简化版即可）
- [ ] 浮层定位到选区上方，滚动时跟随
- [ ] 阅读/批阅模式切换后浮层内容变化
- [ ] sidecar JSON 正确读写
- [ ] 侧边栏列表实时反映批注变更

---

## 六、PRD 补充建议

### 1. 高亮 from/to 持久化策略

PRD 数据模型中只有 `selectedText` + `contextBefore/After` + `lineHint`，没有持久化 `from/to`。这是正确的——因为 from/to 在每次打开文件时都会变。**建议在 sidecar 中只存文本锚点（selectedText + context），from/to 在加载文件时通过文本搜索动态计算**。

### 2. 批注去重

同一段文本可能被多次批注（先高亮再批阅），需要：
- 同一 from/to 范围内的高亮和批阅可以共存
- 侧边栏的"全部"模式需要合并显示

### 3. 导出 Prompt 的 token 限制

复制 Prompt 包含完整原文 + 批阅意见，长文档可能超过 LLM 的上下文窗口。建议：
- 显示预估 token 数
- 超限时提示用户分段导出

### 4. Obsidian 主题兼容性

高亮颜色需要在深色和浅色主题下都清晰可见。建议使用 CSS 变量 + `rgba` 透明度，而非硬编码色值：

```css
.cm-multiaiedit-highlight-yellow {
  background-color: rgba(244, 211, 94, 0.32);
}
.theme-dark .cm-multiaiedit-highlight-yellow {
  background-color: rgba(244, 211, 94, 0.25);
}
```

---

*相关文档：[PRD v0.4](PRD.md)，[可行性分析](feasibility-analysis.md)，[Agent 桥接架构](agent-bridge-architecture.md)*
