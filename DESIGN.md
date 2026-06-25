---
version: alpha
name: Promptuary
description: Obsidian 阅读标注与 AI 批阅插件的视觉设计系统
colors:
  primary: "#A78BFA"
  secondary: "#FB923C"
  tertiary: "#34A853"
  neutral: "#F5F5F5"
  highlight-yellow: "#FACC15"
  highlight-blue: "#60A5FA"
  highlight-green: "#4ADE80"
  highlight-purple: "#C084FC"
  error: "#D73A49"
  on-primary: "#FFFFFF"
  on-secondary: "#1A1A1A"
  surface: "#FFFFFF"
  on-surface: "#1A1A1A"
typography:
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: "JetBrains Mono, var(--font-monospace), monospace"
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.02em
  label-sm:
    fontFamily: "JetBrains Mono, var(--font-monospace), monospace"
    fontSize: 9px
    fontWeight: 500
    lineHeight: 1.4
  title-sm:
    fontFamily: "JetBrains Mono, var(--font-monospace), monospace"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
  title-md:
    fontFamily: "JetBrains Mono, var(--font-monospace), monospace"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
  title-lg:
    fontFamily: "JetBrains Mono, var(--font-monospace), monospace"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.2
  code:
    fontFamily: "JetBrains Mono, var(--font-monospace), monospace"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.7
  quote:
    fontFamily: "JetBrains Mono, var(--font-monospace), monospace"
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: 0px
  xs: 2px
  sm: 3px
  md: 4px
  lg: 6px
  xl: 8px
  2xl: 12px
  full: 999px
spacing:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 10px
  2xl: 12px
  3xl: 14px
  4xl: 16px
  5xl: 18px
components:
  popover:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: 6px 10px
  popover-button:
    backgroundColor: transparent
    rounded: "{rounded.md}"
    padding: 4px 8px
    typography: "{typography.label-caps}"
  color-dot:
    width: 16px
    height: 16px
    rounded: "{rounded.full}"
  card:
    backgroundColor: "{colors.neutral}"
    rounded: "{rounded.xl}"
    padding: 10px 10px 10px 12px
  card-badge:
    width: 20px
    height: 20px
    rounded: 5px
    typography: "{typography.label-caps}"
  sidebar:
    width: 300px
    backgroundColor: "{colors.surface}"
  mode-capsule:
    rounded: "{rounded.xl}"
    padding: 3px
  mode-capsule-btn:
    rounded: "{rounded.lg}"
    padding: 5px 10px
    typography: "{typography.title-sm}"
  action-btn:
    rounded: "{rounded.lg}"
    padding: 10px 6px
    typography: "{typography.label-caps}"
  execute-btn:
    rounded: "{rounded.lg}"
    padding: 12px 14px
    typography: "{typography.title-sm}"
  modal:
    rounded: "{rounded.2xl}"
  modal-icon:
    width: 24px
    height: 24px
    rounded: 7px
  input:
    rounded: "{rounded.lg}"
    padding: 6px 8px
    typography: "{typography.label-caps}"
  save-btn:
    rounded: "{rounded.md}"
    padding: 3px 12px
    typography: "{typography.label-caps}"
  tag:
    rounded: "{rounded.full}"
    padding: 1px 6px
    typography: "{typography.label-sm}"
---

## Overview

Promptuary 是 Obsidian 的阅读标注与 AI 批阅插件。视觉风格是 **技术极简主义 + 温暖标注**：底层 UI 尽量透明融入 Obsidian 主题（亮/暗），仅在标注和高交互元素上用语义色彩说话。

设计 DNA：

- **静默优先**：阅读时 UI 几乎隐形，只有选中文本时才浮出操作
- **语义着色**：4 色高亮区分阅读标注类型，橙色专属于批阅/删除意见，紫色驱动 Agent 执行
- **等宽字体信号**：所有标签、元数据、代码片段使用 monospace，与 Obsidian 正文 serif/sans-serif 形成视觉分层
- **低饱和叠加**：高亮和批阅使用 rgba 低透明度叠加，不遮挡原文可读性
- **Host-agnostic**：大量使用 Obsidian CSS 变量（`--background-primary`, `--text-muted` 等），确保亮/暗主题自动适配

## Colors

配色体系分三层：Obsidian 宿主变量（自动适配主题）+ 插件语义色（固定 RGBA）+ 衍生状态色。

**语义角色：**

- **Primary (#A78BFA, 紫)**：Agent 执行的核心驱动色。用于 Execute 按钮、Agent 确认、Save 操作。紫色 = "让 AI 帮你做"。
- **Secondary (#FB923C, 橙)**：批阅/审阅的专属色。用于删除线标记、review 高亮、审阅卡片左边框。橙色 = "我要改这里"。
- **Tertiary (#34A853, 绿)**：执行成功/确认。用于 Accept 按钮、Agent 安装检测标记、执行按钮。绿色 = "已确认"。
- **Error (#D73A49, 红)**：拒绝/回滚/危险操作。用于 Reject 按钮、删除卡片 hover、Cancel hover。

**4 色高亮系统：**

- **Yellow (#FACC15)**：默认阅读高亮，最中性的标注色
- **Blue (#60A5FA)**：信息型标注
- **Green (#4ADE80)**：确认/同意型标注
- **Purple (#C084FC)**：待讨论/疑问型标注

**透明度规则：**

所有标注色使用双层透明度——低透明度做背景叠加，较高透明度做下划线/边框：

| 主题 | 背景叠加 | 下划线/边框 |
|------|---------|-----------|
| 亮色 | 0.18 | 0.40 |
| 暗色 | 0.15 | 0.30 |

暗色主题降低 3-5% 透明度，避免在深底色上过亮。

**Host 变量映射（不定义固定值，跟随 Obsidian）：**

| 角色 | CSS 变量 | 用途 |
|------|---------|------|
| Surface | `--background-primary` | Popover/Sidebar/Modal 背景 |
| Surface-secondary | `--background-secondary` | 卡片背景、Capsule 背景、输入框背景 |
| On-surface | `--text-normal` | 主文字 |
| Muted | `--text-muted` | 次要文字、标签 |
| Faint | `--text-faint` | 行号、元信息 |
| Border | `--background-modifier-border` | 分割线、卡片边框 |
| Hover | `--background-modifier-hover` | hover 态背景 |
| Error-host | `--text-error` | 删除操作 |
| Warning-host | `--text-warning` | fuzzy 定位标记 |

## Typography

双字体系统：**DM Sans** 驱动 UI 正文，**JetBrains Mono** 驱动标签/代码/元数据。

**层级：**

| Token | 字体 | 大小 | 字重 | 行高 | 用途 |
|-------|------|------|------|------|------|
| title-lg | Mono | 16px | 700 | 1.2 | 设置页标题 |
| title-md | Mono | 13px | 600 | 1.2 | Modal 标题、Section 标题 |
| title-sm | Mono | 12px | 600 | 1.2 | Header 标题、按钮文字 |
| body-md | DM Sans | 13px | 400 | 1.5 | 卡片正文 |
| body | DM Sans | 12px | 400 | 1.5 | Popover 文字、通用正文 |
| label-caps | Mono | 10px | 500 | 1.4 | 按钮、标签、Agent 名 |
| label-sm | Mono | 9px | 500 | 1.4 | Tag、行号、状态标记 |
| code | Mono | 11px | 400 | 1.7 | Diff 代码、命令展示 |
| quote | Mono | 11px | 400 | 1.5 | 引用块（原文摘录） |

**规则：**

- 所有 `font-family` 声明必须含 fallback：`var(--font-monospace), monospace` 或 `system-ui, sans-serif`
- Popover / Sidebar / Toolbar 的 `font-family` 在容器级声明，子元素继承
- `letterSpacing: 0.02em` 仅用于标签和大写文本
- 卡片正文 `lineHeight: 1.55` 比默认稍宽，提升阅读舒适度

## Layout

插件 UI 由三个独立区域组成，各自有固定的布局逻辑。

**Sidebar (300px 固宽)：**

```
┌─ header (fixed top) ─────────────┐
│  Logo + Title        [Settings]  │
│  [Reading] [Reviewing] [All]     │ ← mode capsule
├─ content (scrollable) ───────────┤
│  Banner (conditional)            │
│  Card                            │
│  Card                            │
│  ...                             │
├─ action-bar (fixed bottom) ──────┤
│  [Export] [Copy] [More]          │ ← action row
│  [Execute with Agent]            │ ← CTA
│  ● Status hint                   │
└──────────────────────────────────┘
```

**Popover (min-width 220px, 纵向)：**

```
┌─ title-row ─────────────────────┐
│  Title         [Reading|Review]  │ ← capsule
├─ actions ───────────────────────┤
│  [●][●][●][●] | [Delete] [Note] │ ← color dots + buttons
├─ note-area (expandable) ────────┤
│  [● ── 批阅]                    │ ← dot + label
│  ┌─ input ───────────────┐      │
│  └────────────────────────┘      │
│                      [Save]      │
└──────────────────────────────────┘
```

**间距刻度：**

| Token | 值 | 典型用途 |
|-------|----|---------|
| xs | 2px | 内联间距、微分隔 |
| sm | 4px | Popover 内元素间距、标签 padding |
| md | 6px | 按钮间 gap、卡片内 gap |
| lg | 8px | Avatar 与文字间距、Action row gap |
| xl | 10px | Section padding、卡片外间距 |
| 2xl | 12px | Sidebar padding、Modal padding |
| 3xl | 14px | Section header padding |
| 4xl | 16px | 较大间距 |
| 5xl | 18px | Modal header/footer padding |

**Container Query 断点（Action Row）：**

| 宽度 | 行为 |
|------|------|
| > 260px | icon + 短标签 + 长标签 |
| 200-260px | icon + 短标签，隐藏长标签 |
| < 200px | 仅 icon |

## Elevation & Depth

三层深度系统。

| 层级 | 阴影 | 用途 |
|------|------|------|
| Level 0 | 无 | 卡片、Sidebar 背景 |
| Level 1 | `0 1px 2px rgba(0,0,0,0.06)` | Capsule 激活态按钮 |
| Level 2 | `0 8px 24px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.08)` | Popover |
| Level 2 dark | `0 8px 24px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.25)` | Popover (暗色) |
| Level 3 | `0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)` | Modal |
| Level 3 dark | `0 8px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.12)` | Modal (暗色) |
| Bottom bar | `0 -4px 16px rgba(0,0,0,0.16)` | 移动端底部工具栏 |

**Z-index 分配：**

| 值 | 用途 |
|----|------|
| 999 | Selection Popover |
| 1000 | Mobile Bottom Toolbar |

Modal 的 z-index 由 Obsidian 框架管理，不手动指定。

**动画：**

- Popover 进入：`fade-in 0.15s ease-out`（opacity 0→1, translateY 4px→0）
- Note 展开区：`expand 0.15s ease-out`（opacity + max-height）
- 执行中脉冲：`pulse 1.6s ease-in-out infinite`（opacity 0.85↔0.55）
- Agent 状态点：`pulse 1.2s ease-in-out infinite`
- 按钮按下：`scale(0.98)` active 态
- 卡片 hover：`border-color` 过渡 0.15s

## Shapes

圆角刻度严格对应元素层级——越底层的容器越大，越内联的元素越小。

| Token | 值 | 用途 |
|-------|----|------|
| none | 0px | 分割线 |
| xs | 2px | 编辑器内高亮 decoration |
| sm | 3px | Popover 内分隔条、状态标签 |
| md | 4px | 按钮、输入框、Delete 按钮 |
| lg | 6px | 卡片、Agent 按钮、Modal 按钮、Popover 按钮、Radio |
| xl | 8px | Popover 容器、Sidebar 胶囊、卡片容器、Agent row |
| 2xl | 12px | Modal 容器、Confirm Modal |
| full | 999px | 颜色圆点、Tag、Pill badge、Mode capsule 按钮 active 态 |

## Components

### Color Dot (颜色圆点)

阅读模式的 4 色选择器。Popover 内 16px，Bottom Toolbar 内 22px。

| 属性 | Popover | Mobile Toolbar |
|------|---------|---------------|
| 尺寸 | 16×16px | 22×22px |
| 圆角 | full | full |
| 透明度 | 0.75 background, 0.55 border | 0.65 background |
| Hover | scale(1.15) | — |
| Active | outline 2px (color-matched) | — |

### Mode Capsule (模式切换胶囊)

阅读/批阅/全部 的分段控制器。

- 容器：`background: var(--background-secondary)`, `border-radius: 8px`, `padding: 3px`, `gap: 2px`
- Popover 紧凑版：`border-radius: 4px`, `padding: 1px`, `gap: 1px`, `font-size: 10px`
- 激活态按钮：`background: var(--background-primary)`, `font-weight: 600`, `box-shadow: 0 1px 2px rgba(0,0,0,0.08)` (dark: 0.20)

### Card (批注卡片)

侧边栏的核心展示单元。

- 背景：`var(--background-secondary)` (dark: `rgba(255,255,255,0.025)`)
- Hover：`var(--background-modifier-hover)` (dark: `rgba(255,255,255,0.045)`)
- 左侧 2px 色条：绝对定位，top/bottom 各偏移 10px，颜色跟随批注类型
- Hover 态边框变色：色条同色 0.30 透明度
- 引用块：`rgba(125,125,145,0.08)` 背景 (dark: `rgba(255,255,255,0.04)`)，4px 圆角
- 删除线态：文字 `text-decoration: line-through`, opacity 0.55

**卡片状态视觉：**

| 状态 | 左侧色条 | 卡片行为 |
|------|---------|---------|
| strict (正常) | 批注对应色 | 正常 |
| fuzzy | `--text-warning` (虚线) | 正常展示 + ⚠ 标记 |
| auto-healed | `{colors.highlight-blue}` 0.55 | 蓝色侧栏 |
| drifted | `--background-modifier-error` | 整张卡片 opacity 0.55 |

### Popover (选区浮窗)

桌面端文本选中后浮现的操作面板。

- `position: fixed`, `z-index: 999`
- `min-width: 220px`, 纵向 flex 布局
- 标题行：标题 + 胶囊，底部分割线
- Note 展开区：顶部分割线，包含颜色标记 + 标签 + 输入框 + Save

### Delete Button (批阅删除按钮)

橙色 toggle 按钮，可切换删除线标记。

- 默认：`rgba(251,146,60, 0.08)` background, `0.20` border
- Hover：`0.16` background, `0.35` border
- Active：`0.20` background, `0.45` border, 文字 `1.0` opacity

### Strike Button (S 按钮，Popover 内)

26×26px 方形按钮，monospace bold 13px。

- 背景：`rgba(251,146,60, 0.15)`, 边框 `0.30`
- 文字：`rgba(251,146,60, 0.95)`, `font-weight: 700`
- Hover：背景 `0.25`, 文字 `1.0`

### Save Button

紫色小型按钮，Note 展开区 footer。

- 背景：`rgba(167,139,250, 0.12)`, 边框 `0.25`
- 文字：`rgba(167,139,250, 0.90)`
- Hover：背景 `0.22`, 边框 `0.40`

### Execute Button (Agent CTA)

紫色全宽 CTA，侧边栏底部。

- 背景：`rgba(167,139,250, 0.12)`, 边框 `0.20`
- 文字：`rgba(167,139,250, 0.85)`, `font-weight: 600`, `font-size: 12.5px`
- Hover：背景 `0.20`, 边框 `0.35`
- Executing 态：1.6s 脉冲动画
- Disabled：opacity 0.35

### Confirm Modal (Agent 确认弹窗)

500px 宽，12px 圆角，三段式布局。

- Header：图标 + 标题/副标题 + 关闭按钮
- Body：Agent 信息行 + 命令展示框 + 安全警告
- Footer：Cancel + Copy Command + Execute (绿色 CTA)

**Execute 按钮（Modal 内）：**

- 背景：`rgba(52,168,83, 0.08)`, 边框 `0.30`
- 文字：`rgba(30,120,50, 0.92)`, `font-weight: 600`
- Dark：背景 `rgba(74,222,128, 0.10)`, 边框 `0.28`, 文字 `rgba(110,220,140, 0.95)`

### Diff Modal

820px 宽（92vw fallback），80vh 高，三段式布局。

- Header：蓝色图标（`rgba(59,130,246, *)`）+ 标题 + hunk 计数 + 关闭
- Content：滚动区，hunk 卡片列表，每 hunk 有 Accept/Reject 按钮
- Footer：统计（+N/-M 行）+ Rollback + Accept All

**Diff 行配色：**

| 类型 | 亮色背景 | 亮色文字 | 亮色左边框 | 暗色背景 | 暗色文字 |
|------|---------|---------|-----------|---------|---------|
| removed | `#fff0f0` | `#b31d28` | `#d73a49 2px` | `rgba(215,58,73,0.10)` | `rgba(248,150,150,0.85)` |
| added | `#e6ffec` | `#22863a` | `#34a853 2px` | `rgba(52,168,83,0.08)` | `rgba(110,220,140,0.90)` |
| unchanged | — | `var(--text-normal)` 0.65 | — | — | — |

### Agent Select Modal

400px 宽，Agent 列表单选。

- Agent row：hover 边框变色，active 紫色边框 `rgba(167,139,250, 0.35)` + `box-shadow: 0 0 0 1px rgba(167,139,250, 0.12)`
- Installed badge：绿色 `rgba(74,222,128, 0.12)` bg
- Missing badge：灰色 `rgba(107,114,128, 0.10)` bg
- Radio：16px 圆，selected 时紫色边框 + 8px 紫色内圆

### Bottom Toolbar (移动端)

固定底部，full-width。

- `position: fixed`, `bottom: 0`, `z-index: 1000`
- 背景：`var(--background-primary)`, 顶部 1px 边框
- 上方阴影：`0 -4px 16px rgba(0,0,0,0.16)`
- 颜色圆点 22px，与 Popover 交互一致但更大（适配触控）

### Settings Page

折叠面板布局，每个 section 独立卡片。

- Section 容器：1px 边框, 10px 圆角, `var(--background-secondary)` 背景
- Header：28px 图标 + 标题/描述 + 展开箭头
- Body：`max-height: 0` → `3000px` 动画展开
- Agent 检测卡片：32px 头像 + 名称 + installed/missing badge

### Banner (变更横幅)

橙色警告横幅，Sidebar 顶部。

- 背景：`rgba(251,146,60, 0.10)`, 边框 `0.30`
- 8px 圆角
- 右侧操作按钮：`rgba(251,146,60, 0.15)` bg, `0.40` border

### Empty State

居中占位。

- 图标：96×96px, opacity 0.55
- 文字：12px, `var(--text-muted)`, opacity 0.6, max-width 180px

## Do's and Don'ts

**Do:**

- 使用 Obsidian CSS 变量作为基础色，确保亮/暗主题自动适配
- 标注色使用 rgba 低透明度叠加，保留原文可读性
- 所有 monospace 声明带 `var(--font-monospace)` fallback
- 按钮交互必须有 0.12-0.15s 过渡动画
- 批阅/删除操作统一使用 Secondary (橙色)
- Agent 执行操作统一使用 Primary (紫色)
- 确认/接受操作统一使用 Tertiary (绿色)
- 拒绝/危险操作统一使用 Error (红色)
- Modal 关闭按钮和 Cancel 使用宿主 muted 色，hover 时才变红
- Dark 主题下降低标注色透明度 3-5%，升高阴影强度
- 移动端触控目标最小 22px

**Don't:**

- 不要在 Obsidian 变量可用的地方硬编码背景/文字色值
- 不要在同一个视图中混用不同圆角层级（如按钮用 xl 同时卡片用 md）
- 不要给编辑器 decoration 使用不透明的背景色——原文必须可读
- 不要用 Primary (紫色) 做批阅标注——紫色是 Agent 执行色，橙色是批阅色
- 不要在 Dark 主题下使用亮色主题的 Diff 行背景（`#fff0f0`, `#e6ffec`），必须用 rgba
- 不要在移动端暴露 CLI/API/Agent 相关的 UI
- 不要给非操作型文字加 `font-weight: 600` 以上——粗体仅用于标题和激活态
- 不要在 Popover 内使用 `position: absolute`——必须用 `fixed`（Obsidian 滚动容器嵌套问题）
- 不要引入超出本文档定义的色值——如需新色必须先更新 token
- 不要忽略 WCAG AA 对比度要求（特别是低透明度标注上的文字）
