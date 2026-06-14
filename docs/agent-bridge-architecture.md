# Agent 桥接架构：不建 Agent，做数据出口

> 核心决策：插件不做 AI 执行引擎，而是将批注数据结构化后「出口」给用户已有的 Agent 产品处理。

## 设计原则

- **插件壁垒**：批注采集 + 结构化 + Diff 预览，这三步别人做不了
- **Agent 不是壁垒**：Claude Code / WorkBuddy 已做得很好，不需要重复建设
- **用户零迁移**：不需要学新工具，现有 Agent 直接用

## 架构分层

```
┌─────────────────────────────────────────────────────┐
│  Agent 层（用户已有的，不建）                         │
│  Claude Code / WorkBuddy / ChatGPT / 任意 API Key    │
└──────────────────────┬──────────────────────────────┘
                       │ 读取批注
┌──────────────────────▼──────────────────────────────┐
│  桥接层（4 种出口，按优先级）                         │
│  P0: Prompt 文件导出                                 │
│  P1: CLI 命令（Claude Code 一键）                    │
│  P2: MCP Server                                     │
│  P3: Thin API 调用（兜底）                           │
└──────────────────────┬──────────────────────────────┘
                       │ apply_edit
┌──────────────────────▼──────────────────────────────┐
│  插件层（你的壁垒）                                  │
│  批注采集 → Prompt 生成 → Diff 预览 → 应用修改       │
└─────────────────────────────────────────────────────┘
```

## AI 执行的 4 种方式

4 种方式并列提供，用户按场景选择。方法 1 走自动闭环（含 Diff），方法 2 为兜底（低优先级），方法 3/4 为手动流程。

**实施优先级**：方法 3/4（P0）→ 方法 1（P1）→ 方法 2（P2 兜底）

```
                    ┌─────────────────────┐
                    │  批注数据 (sidecar)   │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │    Prompt 生成器      │
                    └──┬──────┬──────┬─────┘
                       │      │      │
          ┌────────────┤  ┌───┘      └────────────┐
          ▼            ▼  ▼                       ▼
   1.CLI一键执行  2.API直调(兜底)       3.导出文件  4.复制Prompt
   ┌────────┐   ┌────────┐          ┌────────┐  ┌────────┐
   │自定义   │   │保存Key │          │.md文件 │  │剪贴板  │
   │命令规则 │   │调模型  │          │.json   │  │粘贴    │
   └───┬────┘   └───┬────┘          └────────┘  └────────┘
       │            │                  手动流程    手动流程
       ▼            ▼(低优先级)
   ┌────────────────────┐
   │  Diff 预览 + 确认   │  ← 方法 1 闭环到这里；方法 2 兜底
   └────────┬───────────┘
            ▼
   ┌────────────────────┐
   │  应用修改到原文      │
   └────────────────────┘
```

---

### 方法 1：CLI 一键执行（自定义命令规则）

**核心**：插件检测已安装的 Agent CLI，自动拼接命令并执行。用户可自定义命令规则模板。

#### 预设命令规则

```typescript
interface CommandRule {
  id: string;           // 唯一标识
  label: string;        // 显示名
  detectCmd: string;    // 检测命令（which xxx）
  template: string;     // 命令模板，支持变量
  installHint: string;  // 未安装时的提示
}

const PRESET_RULES: CommandRule[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    detectCmd: 'claude',
    template: 'cd "{{vaultPath}}" && claude "读取 {{instructionFile}}，按批注指令修改对应文件"',
    installHint: 'npm i -g @anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    detectCmd: 'codex',
    template: 'cd "{{vaultPath}}" && codex "读取 {{instructionFile}}，按批注指令修改对应文件"',
    installHint: 'npm i -g @openai/codex',
  },
  {
    id: 'aider',
    label: 'Aider',
    detectCmd: 'aider',
    template: 'cd "{{vaultPath}}" && aider --msg "读取 {{instructionFile}}，按批注指令修改对应文件"',
    installHint: 'pip install aider-chat',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    detectCmd: 'gemini',
    template: 'cd "{{vaultPath}}" && gemini "读取 {{instructionFile}}，按批注指令修改对应文件"',
    installHint: 'npm i -g @google/gemini-cli',
  },
];
```

#### 自定义命令规则

用户可在设置中添加自己的命令模板：

```typescript
// 设置中的自定义规则示例
const customRule: CommandRule = {
  id: 'custom-1',
  label: '我的脚本',
  detectCmd: 'my-ai-script',       // 用于检测是否安装
  template: 'my-ai-script --vault "{{vaultPath}}" --instructions "{{instructionFile}}" --file "{{fileName}}"',
  installHint: '自定义安装方式',
};
```

#### 可用变量

| 变量 | 含义 | 示例值 |
|------|------|--------|
| `{{vaultPath}}` | vault 根目录绝对路径 | `/Users/foo/obsidian-vault` |
| `{{instructionFile}}` | 生成的批注指令文件路径 | `.annotations/note_EDIT.md` |
| `{{fileName}}` | 当前编辑的文件名 | `note.md` |
| `{{filePath}}` | 当前文件相对路径 | `notes/note.md` |
| `{{prompt}}` | 内联 prompt 文本（不生成文件） | `读取批注并修改...` |

#### 执行流程

```
1. 插件启动时扫描 PRESET_RULES + 用户自定义规则 → 检测已安装
2. 侧边栏显示已安装的 Agent 按钮（高亮）+ 未安装的（灰显 + 安装提示）
3. 用户点击 → 生成 instructionFile → 填充模板变量 → 生成完整命令
4. 弹出确认对话框：展示完整命令
5. 用户确认 → 唤起终端执行
6. 文件变更监听 → Diff 预览 → 确认/回滚
7. 兜底：始终可「复制命令」到剪贴板
```

#### 平台限制

- **桌面端**：完整功能（`child_process` 可用）
- **移动端**：不显示此按钮（`Platform.isMobile` 判断）

---

### 方法 2：API Key 直调模型（低优先级，兜底方案）

> **优先级说明**：此方法作为兜底，优先级低于方法 1（CLI 一键执行）。原因：
> 1. 大部分 Obsidian 用户没有 API Key，门槛高
> 2. 已有 Agent CLI（Claude Code / Aider 等）的用户不需要此方式
> 3. 模型返回内容替换策略复杂，开发成本高
> 4. 移动端虽有需求，但用户量小，可后置
>
> **核心价值**：为没有 Agent CLI 的桌面用户和移动端用户（WebView 支持 fetch）提供闭环能力。

**核心**：用户保存 API Key，插件拼装 prompt 调用模型，返回结果直接替换原文并展示 Diff。

#### API Key 存储

```typescript
// Obsidian 插件设置自动加密存储
interface AISettings {
  apiProvider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  apiKey: string;           // Obsidian localStorage 加密存储
  customEndpoint: string;   // 自定义 OpenAI 兼容端点
  model: string;            // 模型名，如 gpt-4o / claude-sonnet-4-20250514
}

// 存储到 plugin loadData（Obsidian 自动持久化）
async saveApiKey(provider: string, key: string): Promise<void> {
  await this.saveData({ ...this.settings, apiKey: key });
}

// 读取
async getApiKey(): Promise<string> {
  const data = await this.loadData();
  return data?.apiKey ?? '';
}
```

#### Prompt 设计

```
System Prompt:
─────────────
你是一个文档修改助手。用户会提供一份文档原文和若干批注指令。
请根据批注指令修改文档，返回完整修改后的文档内容。
规则：
1. 只修改批注指令明确指出的部分
2. 保持未标注段落的原文不变
3. 返回完整的修改后文档（不是 diff，不是片段）
4. 不要添加任何解释性文字，只返回文档本身

User Prompt:
────────────
## 原文

[完整文件内容]

## 修改指令

### 批注 1 [语义修改]
位置: 第 3 段 "产品定位应聚焦..."
原文: "产品定位应聚焦在效率工具上"
指令: 改为强调"安全网"定位

### 批注 2 [风格调整]
位置: 第 7 段
原文: "我们的核心功能包括..."
指令: 用更直接的方式重写

请返回完整修改后的文档。
```

#### API 调用

```typescript
async function callAPI(settings: AISettings, prompt: string, originalContent: string): Promise<string> {
  const endpoints: Record<string, string> = {
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
    gemini: `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent`,
    custom: settings.customEndpoint,
  };

  // OpenAI 兼容格式（覆盖大多数提供商）
  const response = await fetch(endpoints[settings.apiProvider], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  return extractContent(data, settings.apiProvider);
}
```

#### 内容替换策略

**核心问题**：模型返回的是完整修改后文件，怎么替换到当前编辑器？

```typescript
import * as Diff from 'diff';  // jsdiff 库

async function applyAIResult(originalContent: string, newContent: string): Promise<void> {
  // 1. 用 jsdiff 计算差异
  const changes = Diff.diffLines(originalContent, newContent);

  // 2. 弹出 Diff 预览 Modal
  const userChoice = await showDiffModal(changes, originalContent, newContent);

  if (userChoice === 'accept') {
    // 3a. 整体替换：直接用新内容覆盖文件
    await this.app.vault.modify(currentFile, newContent);
  } else if (userChoice === 'accept-partial') {
    // 3b. 逐块替换：用户在 Diff Modal 中选择接受哪些变更
    const merged = applyPartialChanges(originalContent, userChoice.acceptedChanges);
    await this.app.vault.modify(currentFile, merged);
  } else {
    // 3c. 回滚：不做任何修改
    new Notice('已取消修改');
  }
}
```

#### 模型返回解析

```typescript
function extractContent(data: any, provider: string): string {
  switch (provider) {
    case 'openai':
    case 'custom':
      return data.choices[0].message.content;
    case 'anthropic':
      return data.content[0].text;
    case 'gemini':
      return data.candidates[0].content.parts[0].text;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// 清理模型返回中可能的 markdown 代码块包裹
function cleanModelOutput(raw: string): string {
  // 去掉 ```markdown ... ``` 包裹
  return raw
    .replace(/^```(?:markdown|md)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
}
```

#### 错误处理

```typescript
async function callWithRetry(settings: AISettings, prompt: string, original: string, maxRetries = 2): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rawResult = await callAPI(settings, prompt, original);
      const cleaned = cleanModelOutput(rawResult);

      // 基本校验：返回内容不应过短
      if (cleaned.length < original.length * 0.5) {
        throw new Error('模型返回内容异常过短，可能被截断');
      }

      return cleaned;
    } catch (err) {
      if (attempt === maxRetries) {
        new Notice(`API 调用失败: ${err.message}`);
        throw err;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}
```

#### 平台支持

- **桌面端**：完整功能（`fetch` 可用）
- **移动端**：可用（WebView 支持 `fetch`），但需注意 CORS 策略

---

### 方法 3：导出批注文件

**核心**：生成结构化文件，用户手动喂给任意 AI 工具。

```typescript
async function exportAnnotationFile(annotations: Annotation[], filePath: string): Promise<string> {
  const content = generateAnnotationMarkdown(annotations);
  const exportPath = filePath.replace(/\.md$/, '_EDIT.md');
  await this.app.vault.create(exportPath, content);
  new Notice(`批注文件已导出: ${exportPath}`);
  return exportPath;
}
```

导出格式见上文 P0 部分。

---

### 方法 4：复制 Prompt 到剪贴板

**核心**：一键生成 prompt 文本并复制，零开发成本覆盖所有场景。

```typescript
function copyPromptToClipboard(annotations: Annotation[], fileContent: string): void {
  const prompt = buildPrompt(annotations, fileContent);
  navigator.clipboard.writeText(prompt);
  new Notice('Prompt 已复制到剪贴板');
}
```

---

### 4 种方式对比

| 维度 | 1. CLI 一键执行 | 2. API 直调(兜底) | 3. 导出文件 | 4. 复制 Prompt |
|------|---------------|------------------|-----------|---------------|
| 自动化程度 | 全自动 | 全自动 | 手动 | 手动 |
| Diff 预览 | ✅ | ✅ | ❌ | ❌ |
| 需要安装 | Agent CLI | 无 | 无 | 无 |
| 需要 API Key | 不需要（Agent 自带） | 需要 | 不需要 | 不需要 |
| 优先级 | P1 | P2（兜底） | P0 | P0 |
| 桌面端 | ✅ | ✅ | ✅ | ✅ |
| 移动端 | ❌ | ✅ | ✅ | ✅ |
| 自定义能力 | 命令规则模板 | 模型+端点 | 格式 | 无 |
| 目标用户 | 开发者 | 无 Agent 的用户 | 通用 | 通用 |

## Agent 产品全景（2026-06 调研）

### 第一层：CLI 直调（插件一键唤起）

插件通过 `which` 检测 + 命令拼接 + 终端唤起，用户一键触发。

| Agent | 厂商 | 检测命令 | 安装方式 | 费用 | vault 兼容性 | 推荐度 |
|-------|------|---------|---------|------|-------------|-------|
| **Claude Code** | Anthropic | `which claude` | `npm i -g @anthropic-ai/claude-code` | $20/月或按量 | 最佳（CLAUDE.md + MCP） | ★★★★★ |
| **Codex CLI** | OpenAI | `which codex` | `npm i -g @openai/codex` | 按 API 量 | 好（三种模式） | ★★★★ |
| **Aider** | 开源 | `which aider` | `pip install aider-chat` | BYOK 免费 | 好（auto git + 100+ 模型） | ★★★★ |
| **Gemini CLI** | Google | `which gemini` | `npm i -g @google/gemini-cli` | **免费** 1000次/天 | 好（GEMINI.md + MCP） | ★★★★ |

**Claude Code 最佳搭档理由**：
- 文件系统天然兼容 vault 目录结构
- `CLAUDE.md` 机制让 Agent 自动理解批注格式
- MCP 原生支持，未来可对接插件 MCP Server
- 目标用户重叠度最高（开发者 + Obsidian 重度用户）

### 第二层：MCP 协议（插件暴露 MCP Server 后自动发现）

插件实现 MCP Server 后，以下 Agent 可自动发现 `list_annotations` / `apply_edit` 等工具。

| Agent | MCP 支持度 | 特点 | 推荐度 |
|-------|-----------|------|-------|
| **Goose** | MCP 原生，70+ 扩展 | Block 开源，Apache 2.0，Rust，唯一 MCP-first Agent | ★★★★★ |
| **Claude Desktop** | MCP 原生 | Anthropic 官方桌面端，MCP 发明者 | ★★★★ |
| **Amazon Q** | MCP 支持 | AWS 生态，Rust 构建，DevOps 场景 | ★★★ |
| **Cline** | MCP 支持 | 开源，61k+ stars，VSCode/JetBrains/CLI | ★★★★ |

### 第三层：IDE Agent（需在 IDE 内使用）

需要打开 vault 目录才能工作，部分有 CLI 可被插件唤起。

| Agent | CLI 可用 | 检测命令 | 与插件协作方式 |
|-------|---------|---------|--------------|
| **Cursor** | ✅ 有 CLI | `which cursor` | `cursor agent chat "prompt"` 可被插件唤起 |
| **Windsurf** | ✅ Devin CLI | `which devin` | `devin` 可被唤起，支持云端交接 |
| **Copilot** | ❌ 无独立 CLI | — | 只能在 VSCode 中使用 |
| **Cline** | ✅ CLI preview | `which cline` | VSCode 插件或独立 CLI |

### 第四层：Web / API（手动复制粘贴）

零门槛但体验最差，P0 必须支持。

| Agent | 集成方式 | 体验 |
|-------|---------|------|
| ChatGPT | 复制 Prompt + 上传原文 → 粘贴结果 | 手动 |
| Claude.ai | 同上 | 手动 |
| Gemini | 同上 | 手动 |
| 任意 API | 插件内 Thin API 直调 | 需 API Key |

### 插件内置按钮计划

**MVP（v0.3 Agent 桥接）**——4 个 CLI 按钮 + 1 个兜底：

```
✅ Claude Code  —— which claude
✅ Codex CLI    —— which codex
✅ Aider        —— which aider
✅ Gemini CLI   —— which gemini
📋 复制命令     —— 兜底，始终可用
```

**进阶（v0.4+）**——增加 IDE Agent + MCP：

```
✅ Cursor CLI   —— which cursor
✅ Devin CLI    —— which devin
✅ Cline CLI    —— which cline
🔗 MCP Server   —— 面向 Goose / Claude Desktop / Cline
```

**始终显示**——Web 层：

```
📋 复制 Prompt 到剪贴板 —— 覆盖所有用户
```

## 各 Agent 桥接对比

| Agent | 最佳桥接路径 | 体验评级 | 实现难度 |
|-------|-------------|---------|---------|
| Claude Code | CLI 命令 / CLAUDE.md | ★★★★★ | ⭐ |
| Gemini CLI | CLI 命令 / GEMINI.md | ★★★★ | ⭐ |
| Aider | CLI 命令 | ★★★★ | ⭐ |
| Codex CLI | CLI 命令 | ★★★★ | ⭐ |
| Goose | MCP Server | ★★★★★ | ⭐⭐⭐ |
| Claude Desktop | MCP Server | ★★★★★ | ⭐⭐⭐ |
| Cursor | CLI 命令 | ★★★★ | ⭐⭐ |
| Windsurf/Devin | CLI 命令 | ★★★ | ⭐⭐ |
| ChatGPT | Prompt 文件上传 | ★★★ | ⭐ |
| 任意 API Key | Thin API 调用 | ★★★ | ⭐⭐ |

## 平台策略

### 移动端：只做批注器 + Prompt 出口

移动端（iOS/Android）运行在 WebView 中，无 Node.js / `child_process`，无法执行 CLI 命令或启动 MCP Server。
**决策**：移动端只提供批注采集 + 侧边栏 + 导出/复制 Prompt，不提供 AI 执行和 Diff 确认。

```
移动端功能边界：
  ✅ 批注采集 + sidecar 存储
  ✅ 侧边栏汇总 + 筛选
  ✅ P0：导出 Prompt 文件
  ✅ P0：复制 Prompt 到剪贴板
  ❌ P1：Agent 检测 / CLI 执行
  ❌ P2：MCP Server
  ❌ P3：Thin API 调用
  ❌ Diff 预览 / 确认回滚
```

移动端用户的工作流：在手机上批注 → 复制 Prompt → 切到 ChatGPT App 或桌面端继续。

### 桌面端：全功能

桌面端（macOS/Windows/Linux）运行在 Electron 中，可访问 Node.js API，提供完整闭环。

### 实现方式

```typescript
import { Platform } from 'obsidian';

const isDesktop = !Platform.isMobile;

// 侧边栏渲染时，根据平台显示不同按钮
if (isDesktop) {
  // 显示：执行修改 | Agent 选择 | Diff 预览
} else {
  // 显示：复制 Prompt | 导出文件
}
```

`manifest.json` 不设 `isDesktopOnly: true`，让移动端也能安装，只是功能子集。

## 为什么不建 Agent

1. **Agent 能力不是壁垒**——Claude Code、WorkBuddy 已经做得很好，追不上也不需要追
2. **壁垒是「批注 → Diff」闭环**——采集、结构化、验证，这三步别人做不了
3. **用户已有 Agent 的迁移成本为零**——不用教新工具，让现有工具更好用
4. **API Key 门槛比想象中高**——大部分 Obsidian 用户不是开发者，有 API Key 是少数

## MVP 实施建议

1. **v0.1**：批注采集 + 侧边栏 + 方法 3（导出文件）+ 方法 4（复制 Prompt），覆盖 100% 用户
2. **v0.2**：方法 1（CLI 一键执行 + 自定义命令规则 + Diff 预览），面向开发者
3. **v0.3**：增强视图（全库/搜索/JSON 导出）
4. **v0.4**：方法 2（API 直调，兜底方案）+ MCP Server，完善生态
5. **v0.5**：协作与迁移

---

*文档日期：2026-06-10*
