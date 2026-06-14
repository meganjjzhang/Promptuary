# MultiAIEdit 外部设计工具 Brief

> 用途：将本文档输入 Figma AI、MasterGo AI、Motiff、UXPilot、Galileo、v0 等外部设计工具，生成 MultiAIEdit 的 Obsidian 插件 UI 设计方案。
>
> 日期：2026-06-11

---

## 1. 设计任务概述

请为一个 Obsidian 插件设计 UI/UX。插件名为 **MultiAIEdit**。

它不是通用高亮插件，而是一个“阅读标注 + AI 批阅”的插件：

- 阅读时：用户选中文本后可以快速高亮或添加笔记。
- 批阅时：用户选中文本后可以添加删除线或输入自然语言批阅意见。
- 侧边栏以“阅读 / 批阅 / 全部”胶囊切换不同列表。
- 批阅意见可以导出为 AI 修改指令，或在桌面端一键唤起 Claude Code / Codex / Aider / Gemini CLI 执行。

设计目标：

1. 让用户在阅读模式下低打扰地做高亮和笔记。
2. 让用户在批阅模式下快速表达“这里要改”的自然语言意见。
3. 让阅读和批阅两种状态清晰但不割裂。
4. 适配 Obsidian 的原生视觉风格，避免像独立 SaaS。

---

## 2. 产品结构

### 2.1 核心界面

需要输出以下界面/状态：

1. Obsidian 编辑器中选中文本后的阅读模式浮层。
2. Obsidian 编辑器中选中文本后的批阅模式浮层。
3. 右侧插件侧边栏：阅读模式列表。
4. 右侧插件侧边栏：批阅模式列表。
5. 右侧插件侧边栏：全部列表。
6. 导出/执行操作区。
7. 桌面端 Agent 执行选择面板。
8. Diff 预览 Modal（v0.2 功能，可作为设计延展）。

优先级最高的是 1-5。

### 2.2 信息架构

插件右侧侧边栏顶部：

```text
MultiAIEdit
[阅读] [批阅] [全部]
```

胶囊含义：

| 胶囊 | 侧边栏内容 | 选中文本后的默认浮层 |
|------|------------|----------------------|
| 阅读 | 高亮 + 笔记 | 高亮颜色 + 笔记按钮 |
| 批阅 | 批阅意见 | 删除线按钮 + 批阅文本框 |
| 全部 | 所有标注 | 默认阅读模式浮层 |

注意：
- “全部”只是查看筛选，不是操作模式。
- 当用户处于“全部”时，选中文本后的浮层仍然按阅读模式处理。

---

## 3. 核心交互 1：阅读模式

### 3.1 使用场景

用户正在阅读一篇产品文档、报告或技术方案，希望快速标记重点或记录一句想法。

### 3.2 选中文本浮层

当用户选中文本时，显示轻量浮层：

```text
[黄] [蓝] [绿] [紫] [笔记]
```

设计要求：

- 浮层非常轻，不要像复杂表单。
- 颜色选择是圆点按钮或小色块。
- 点击颜色后立即高亮，不弹二次确认。
- 点击“笔记”后展开一个小输入框。
- 浮层位置靠近选中文本上方或下方。
- 风格贴近 Obsidian：低饱和、克制、清晰。

### 3.3 高亮颜色

预置 4 色：

| 颜色 | 建议色值 | 用途 |
|------|----------|------|
| Yellow | `#F4D35E` / 低透明度 | 重点 |
| Blue | `#7DB7E8` / 低透明度 | 引用 |
| Green | `#8FD6B5` / 低透明度 | 灵感 |
| Purple | `#B99CE5` / 低透明度 | 待确认 |

在正文中的高亮不要过重，建议透明度 25%-35%。

### 3.4 阅读侧边栏

阅读模式下侧边栏只展示高亮和笔记。

结构：

```text
MultiAIEdit
[阅读] [批阅] [全部]

当前文档
3 条阅读标注

[高亮] 面向0-3岁宝宝的家长
       黄色 · 第 3 段

[笔记] 这个例子可以放到开头
       关联原文：帮助家庭记录成长...

[高亮] 留作后续引用
       蓝色 · 第 7 段

底部操作：导出阅读笔记 / 复制
```

卡片设计要求：

- 卡片紧凑，适合 Obsidian 侧边栏窄宽度。
- 高亮卡片显示颜色条或色点。
- 笔记卡片显示笔记正文，原文作为次级信息。
- 卡片 hover 时显示操作：跳转、编辑、删除。

---

## 4. 核心交互 2：批阅模式

### 4.1 使用场景

用户进入审稿/批阅状态，希望快速指出文本哪里需要修改，但不想判断“这是修改、删除、补充还是疑问”。

### 4.2 选中文本浮层

当用户选中文本时，显示：

```text
[S 删除线]  [输入批阅意见……]
```

设计要求：

- 删除线按钮使用 `S` 或带删除线的 `S` 图标。
- 文本框是一行输入，用户可以直接输入自然语言意见。
- 支持只点删除线、不输入文字。
- 支持删除线 + 批阅意见同时存在。
- 输入框 placeholder：`输入批阅意见，AI 会判断如何修改…`
- 提交方式：Enter 保存，Esc 取消。

### 4.3 批阅侧边栏

批阅模式下侧边栏只展示批阅列表。

结构：

```text
MultiAIEdit
[阅读] [批阅] [全部]

当前文档
4 条批阅意见

[批阅] 面向0-3岁宝宝的家长
       改成“新生代妈妈”，更聚焦

[删除线] 帮助家庭记录宝宝的成长瞬间...
         用户标记为删除线

[批阅] 覆盖80%的新生代家庭
       数据来源不清楚，需要补充依据

底部主操作：
[导出批阅文件] [复制 Prompt]
桌面端增强：
[用 Claude Code 执行]
```

卡片设计要求：

- 批阅卡片比阅读卡片更强调“意见文本”。
- 删除线卡片要有明显但不刺眼的删除线标识。
- 原文摘录与批阅意见要区分层级。
- 批阅意见为空但 strike=true 时，显示“用户标记为删除线”。

---

## 5. 核心交互 3：全部模式

### 5.1 使用场景

用户想查看当前文档所有记录：高亮、笔记、批阅意见。

### 5.2 侧边栏结构

```text
MultiAIEdit
[阅读] [批阅] [全部]

当前文档
全部标注 7 条

[高亮] ...
[笔记] ...
[批阅] ...
[删除线] ...
```

设计要求：

- 每张卡片有类型标签。
- 列表可以按文档顺序展示，也可以按创建时间展示；MVP 默认按文档位置。
- 选中文本后的浮层仍使用阅读模式浮层：高亮颜色 + 笔记。
- “全部”不要暗示用户进入复杂编辑模式。

---

## 6. 桌面端 Agent 执行选择面板

这是 v0.2 功能，但可以在设计中作为延展状态。

### 6.1 入口

批阅模式侧边栏底部：

```text
[导出批阅文件] [复制 Prompt]
[执行修改]
```

点击“执行修改”后打开 Agent 选择面板。

### 6.2 面板内容

```text
选择外部 Agent 执行批阅意见

已检测到：
[Claude Code] 已安装
[Gemini CLI] 已安装

未安装：
[Codex CLI] 安装说明
[Aider] 安装说明

[复制命令] [取消]
```

设计要求：

- 已安装工具高亮可点击。
- 未安装工具灰显，但提供安装提示。
- 执行前要展示完整命令确认。
- 面板应像 Obsidian 原生 Modal，而不是大型 SaaS 弹窗。

---

## 7. Diff 预览 Modal

这是 v0.2 功能，用于 Agent 执行后确认修改。

### 7.1 结构

```text
AI 修改预览

摘要：检测到 5 处变更

变更块 1
- 原文：面向0-3岁宝宝的家长
+ 新文：面向新生代妈妈
[接受此处] [拒绝此处]

变更块 2
...

底部：
[全部接受] [全部回滚] [关闭]
```

设计要求：

- 使用红/绿或 Obsidian 主题变量表达删除/新增。
- 遵守中国用户金融色彩无关，这里按常见 Diff 习惯即可：删除红、增加绿。
- 逐块操作按钮要清晰。
- 不需要在 Diff 中直接编辑。

---

## 8. 视觉风格要求

### 8.1 总体风格

- 贴近 Obsidian 原生：克制、轻量、内容优先。
- 支持深色和浅色主题。
- 不使用重品牌色，不做大面积渐变。
- 卡片和浮层要适应窄侧边栏。

### 8.2 推荐设计语言

关键词：

```text
Obsidian native, compact, calm, annotation-first, low distraction, markdown editor plugin, side panel, lightweight popover, productivity tool
```

### 8.3 色彩

基础颜色尽量使用 Obsidian CSS 变量思想：

- 背景：`var(--background-primary)` / `var(--background-secondary)`
- 文字：`var(--text-normal)` / `var(--text-muted)`
- 边框：`var(--background-modifier-border)`
- 主强调：低饱和紫色或蓝紫色

标注颜色：

| 类型 | 颜色建议 |
|------|----------|
| 黄色高亮 | `rgba(244, 211, 94, 0.32)` |
| 蓝色高亮 | `rgba(125, 183, 232, 0.30)` |
| 绿色高亮 | `rgba(143, 214, 181, 0.30)` |
| 紫色高亮 | `rgba(185, 156, 229, 0.30)` |
| 批阅强调 | 低饱和橙色或紫色 |
| 删除线 | muted red / text-muted + strike |

### 8.4 字体与密度

- 使用系统字体，接近 Obsidian 默认。
- 侧边栏卡片标题 13-14px。
- 原文摘录 12-13px。
- 次级信息 11-12px。
- 卡片 padding 8-10px。
- 卡片间距 6-8px。

---

## 9. 组件清单

请输出以下组件：

1. `ModeCapsule`：阅读 / 批阅 / 全部。
2. `SelectionPopoverReading`：高亮颜色 + 笔记按钮。
3. `SelectionPopoverReviewing`：删除线按钮 + 批阅意见输入框。
4. `AnnotationCardHighlight`：高亮卡片。
5. `AnnotationCardNote`：笔记卡片。
6. `AnnotationCardReview`：批阅卡片。
7. `SidebarEmptyState`：空状态。
8. `ExportActionBar`：导出文件 / 复制 Prompt / 执行修改。
9. `AgentPickerModal`：Agent 选择面板。
10. `DiffPreviewModal`：Diff 预览。

---

## 10. 空状态文案

### 阅读模式空状态

```text
还没有阅读标注
选中文本后，可以高亮或添加笔记。
```

### 批阅模式空状态

```text
还没有批阅意见
选中文本后，添加删除线或写一句批阅意见。
```

### 全部模式空状态

```text
还没有任何标注
从阅读模式开始，高亮一段重要内容。
```

---

## 11. 外部设计工具生成提示词

可以直接复制下面的 Prompt 到设计工具：

```text
Design a native Obsidian plugin UI for “MultiAIEdit”, a reading annotation and AI review plugin.

The plugin lives in Obsidian’s right sidebar and should look native to Obsidian: compact, calm, low-distraction, dark/light theme friendly, markdown-editor style, no heavy SaaS branding.

Core concept:
- Users switch between three capsule tabs: Reading, Reviewing, All.
- Reading mode is for highlights and notes.
- Reviewing mode is for AI-review comments that will be exported to external AI tools.
- All mode shows everything, but selecting text still behaves like Reading mode.

Design screens/states:
1. Editor text selected in Reading mode: show a small floating popover with four color dots (yellow, blue, green, purple) and a “Note” button. Clicking color creates highlight immediately. Clicking Note opens a small input.
2. Editor text selected in Reviewing mode: show a floating popover with a strikethrough S button and a one-line input: “Add review comment, AI will infer the edit…”.
3. Right sidebar Reading tab: list highlight and note cards only. Highlight cards show color marker and excerpt. Note cards show note text and linked excerpt.
4. Right sidebar Reviewing tab: list review cards only. Cards show selected excerpt, review comment, and optional strikethrough state.
5. Right sidebar All tab: mixed list with type labels.
6. Bottom action bar: Export review file, Copy Prompt, Execute with Agent (desktop only).
7. Agent picker modal: Claude Code, Codex CLI, Aider, Gemini CLI; installed items active, missing items disabled with install hint.
8. Diff preview modal: show changed blocks with accept/reject per block and bottom actions accept all / rollback all.

Use compact card layout suitable for narrow sidebars. Use Obsidian-like CSS variables, subtle borders, soft shadows, muted colors. Highlight colors should be translucent. Reviewing mode can use a muted orange or purple accent. Avoid bright gradients.

Please output a coherent UI design system and screen mockups for desktop Obsidian.
```

---

## 12. 设计验收标准

设计稿需要满足：

- 用户一眼能理解阅读/批阅/全部三个胶囊的差异。
- 阅读模式选中文本的操作足够快，颜色高亮不需要二次确认。
- 批阅模式不出现“修改/删除/补充/疑问”分类，只出现删除线和文本框。
- 侧边栏阅读列表和批阅列表视觉上有明显区分。
- 全部模式不显得像复杂管理后台。
- 导出/复制/执行三个主操作不会抢夺阅读过程注意力。
- 视觉贴近 Obsidian 原生插件，而不是独立网页应用。
