# Sidecar 锚点定位机制设计

> ⚠️ **本文档已废弃,内容已并入 [technical-design.md](technical-design.md) §2 §4 §5,以那份为准。**
> 保留本文档仅用于追溯讨论历史。

> 讨论日期：2026-06-11 | 基于 PRD v0.4、技术难点分析

---

## 一、核心设计原则

**文本锚点，不存偏移量。** Sidecar JSON 里只存纯文本定位信息，CM6 的字符偏移量（from/to）不持久化，加载时动态计算。

理由：from/to 是编辑器内部状态，每次编辑后都会变化，保存没有意义。文本锚点在编辑后仍可通过搜索重新定位。

---

## 二、Sidecar 数据结构

### 2.1 定位相关字段

```jsonc
{
  "id": "ann_1718096000_a3f2",
  "selectedText": "面向0-3岁宝宝的家长",
  "contextBefore": "我们的使命是帮助家庭记录成长。",
  "contextAfter": "强调宝宝的第一次理念。",
  "lineHint": 42,
  "occurrenceIndex": 1,
  "matchStrategy": "strict",
  "fileHash": "sha256:abc123...",
  "type": "review",
  "strike": false,
  "comment": "改成\"新生代妈妈\"，更聚焦",
  "createdAt": "2026-06-11T10:30:00Z"
}
```

### 2.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `selectedText` | string | 是 | 被标注的原文片段 |
| `contextBefore` | string | 是 | 选区前的上下文（约 50 字符） |
| `contextAfter` | string | 是 | 选区后的上下文（约 50 字符） |
| `lineHint` | number | 是 | 创建时的近似行号，辅助搜索 |
| `occurrenceIndex` | number | 是 | selectedText 在文档中第几次出现（0-based），用于区分重复文本 |
| `matchStrategy` | enum | 是 | 定位结果：`strict`（唯一命中）/ `fuzzy`（歧义）/ `drifted`（漂移） |
| `fileHash` | string | 是 | 创建时原文的 SHA256 哈希，用于变更检测 |

### 2.3 不持久化的字段

| 字段 | 原因 |
|------|------|
| `from` / `to` | 编辑器内部偏移量，每次编辑后失效，加载时动态计算 |
| `line` | 行号在编辑后偏移，`lineHint` 只做搜索辅助 |

---

## 三、定位流程

### 3.1 创建批注时

```
用户选中文本
  ↓
获取 selectedText + from/to + lineHint
  ↓
从原文截取 contextBefore（from 前 ~50 字符）和 contextAfter（to 后 ~50 字符）
  ↓
计算 occurrenceIndex：统计 selectedText 在文档中第几次出现
  ↓
计算 fileHash：SHA256(当前文件全文)
  ↓
写入 sidecar JSON（不含 from/to）
```

### 3.2 打开文件时（重新定位）

```
读取 sidecar JSON
  ↓
用 contextBefore + selectedText 拼成搜索串
  ↓
在 CM6 编辑器内容中做文本搜索（优先从 lineHint 附近开始）
  ↓
搜索算法分级（见第四节）
  ↓
得到当前 from/to → 渲染 Decoration 高亮
```

### 3.3 编辑会话内

- **v0.1 简化版**：不做实时偏移跟随，切换文件时重新搜索定位
- **完整版**：利用 CM6 的 `updateListener`，每次 Transaction 后全量重建 Decoration（单文件批注 < 100 条，性能可接受）

---

## 四、搜索算法（分级定位）

```typescript
function locateAnnotation(
  doc: string,
  ann: Annotation
): LocateResult {
  // 第 1 步：全量拼接，最严格匹配
  const fullSearch = ann.contextBefore + ann.selectedText + ann.contextAfter;
  let matches = findAll(doc, fullSearch);

  if (matches.length === 1) {
    return { status: 'strict', from: matches[0].from, to: matches[0].to };
  }

  // 第 2 步：多匹配时，结合 lineHint 选最近的
  if (matches.length > 1 && ann.lineHint) {
    const nearest = matches
      .sort((a, b) =>
        Math.abs(a.line - ann.lineHint) - Math.abs(b.line - ann.lineHint)
      )[0];
    // 如果最近匹配的序号与 occurrenceIndex 一致，信任它
    const matchIndex = matches.indexOf(nearest);
    if (matchIndex === ann.occurrenceIndex) {
      return { status: 'strict', from: nearest.from, to: nearest.to };
    }
  }

  // 第 3 步：降级为 contextBefore + selectedText
  const shortSearch = ann.contextBefore + ann.selectedText;
  matches = findAll(doc, shortSearch);

  if (matches.length === 1) {
    return { status: 'strict', from: matches[0].from, to: matches[0].to };
  }

  // 第 4 步：用 occurrenceIndex 消歧
  if (matches.length > 1 && ann.occurrenceIndex < matches.length) {
    return {
      status: 'fuzzy',
      from: matches[ann.occurrenceIndex].from,
      to: matches[ann.occurrenceIndex].to,
    };
  }

  // 第 5 步：仍然多匹配 → 标记歧义
  if (matches.length > 1) {
    return { status: 'fuzzy', matches };
  }

  // 第 6 步：完全找不到 → 标记漂移
  return { status: 'drifted' };
}
```

---

## 五、原文变动处理

### 5.1 变更检测：fileHash 比对

检测时机：
- `onActiveLeafChange`：切换到某文件时，计算当前 hash 与 sidecar 中的比对
- `vault.on('modify')`：文件保存后，更新 sidecar 中的 hash

Hash 不匹配 → 侧边栏顶部显示横幅：**"原文已变更，部分标注可能需要调整"**

### 5.2 变动场景分析

| 场景 | 发生概率 | 文本搜索能否命中 | 处理方式 |
|------|---------|-----------------|---------|
| 变动远离批注区域 | 最常见 | `selectedText` 原样命中 | 正常渲染高亮，matchStrategy = strict |
| 批注文本被轻微修改 | 偶尔 | `selectedText` 找不到，但 context 仍在 | 用 context 定位，高亮可能偏移，matchStrategy = fuzzy |
| 批注区域被大改或删除 | 少见 | 整个锚点都找不到 | 标记为"漂移"，不高亮渲染，matchStrategy = drifted |

### 5.3 不做的事

**不做逐条状态机和自动重锚定**，理由：

1. 技术 ROI 太低：文本漂移检测是经典难题，做对需要大量工程，做错比不做更糟
2. LLM 是更好的漂移处理器：上下文快照 + 自然语言指令，LLM 的语义理解远超正则匹配
3. fileHash 横幅 + 导出快照已覆盖 90% 场景

---

## 六、重复段落问题

### 6.1 问题

当原文存在重复段落时，纯文本锚点无法唯一定位：

- **短文本重复**（高风险）：如"请确认以上内容。"出现多次
- **整段/整块重复**（中风险）：如周报模板中结构相同的段落
- **完全相同重复段落**（极端）：如合同条款完全一样

### 6.2 实际发生概率

**很低**。原因：
1. 批注的 selectedText 通常是完整句子，自然语言中完整句子重复概率远低于短语
2. contextBefore + contextAfter 各 ~50 字符，3 段拼接约 150 字符完全重复在真实文档中极罕见
3. 周报/合同模板类文档虽结构重复，但填充内容通常不同

### 6.3 消歧策略

1. **occurrenceIndex 字段**：创建批注时自动计算（统计 selectedText 在文档中第几次出现），搜索时作为优先级参考
2. **lineHint 辅助**：多匹配时优先选择离 lineHint 最近的
3. **分级搜索**：从最严格的全量拼接逐步降级
4. **歧义标记**：仍无法区分时标记为 fuzzy，侧边栏条目显示 ⚠️

### 6.4 歧义高亮方案

**推荐方案 B**：高亮第一个匹配 + 侧边栏标注歧义状态。

| 方案 | 用户体验 | 实现成本 |
|------|---------|---------|
| A. 全部高亮（匹配到几处就高亮几处） | 直观但有误导 | 极低 |
| **B. 只高亮第一个 + 歧义标记** | 侧边栏条目标记⚠️，用户点击可跳转其他候选位置 | 低 |
| C. 不高亮 + 横幅提示"存在歧义" | 安全但丢失信息 | 低 |

---

## 七、锚点方案对比

| 锚点类型 | 唯一性 | 抗编辑能力 | 实现成本 | 采用 |
|---------|--------|-----------|---------|------|
| 字符偏移 from/to | 唯一 | 编辑即失效 | 零 | 仅内存 |
| 文本锚点（selectedText + context） | 通常唯一 | 编辑后可重定位 | 低 | ✅ 采用 |
| 文本锚点 + occurrenceIndex | 几乎唯一 | 更强的重定位能力 | 低 | ✅ 采用 |
| AST/语义锚点 | 唯一 | 抗结构性编辑 | 极高 | 不采用 |

---

## 八、与导出的关系

即使原文已经变动，导出的批注文件仍包含**创建批注时的完整上下文快照**：

```markdown
### 1. 批阅
原文：
> 面向0-3岁宝宝的家长

意见：
> 改成"新生代妈妈"，更聚焦

上下文（前）：
> 我们的使命是帮助家庭记录成长。

上下文（后）：
> 强调宝宝的第一次理念。
```

快照是自包含的，LLM 天然擅长语义匹配——即使原文已变，LLM 也能理解"用户想改的是这一段"。

---

## 九、实现优先级

| 版本 | 范围 |
|------|------|
| v0.1 | 基础文本搜索定位（selectedText + context + lineHint），fileHash 变更检测 + 横幅，不做实时编辑跟随 |
| v0.2 | 增加 occurrenceIndex 消歧，歧义标记⚠️，updateListener 实时重建 Decoration |
| v0.3 | 模糊匹配增强（Levenshtein 距离容错），漂移批注的 LLM 辅助重定位 |
