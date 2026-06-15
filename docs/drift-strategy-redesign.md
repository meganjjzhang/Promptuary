# 漂移策略重构：批阅批注用后即焚

> 日期：2026-06-15
> 状态：设计草案

## 1. 核心洞察

**批阅（review）批注和阅读（highlight/note）批注的生命周期完全不同：**

| 维度 | 阅读批注（highlight/note） | 批阅批注（review） |
|------|---------------------------|-------------------|
| 本质 | 书签/标记，长期保留 | 待办指令，执行后失效 |
| 漂移后价值 | 仍有——用户想找到那段文字 | 为零——文字已被改/删，批阅意见已执行 |
| 正确处理 | 尽力回锚（当前策略） | **用后即焚：引用文字被改/删 → 自动删除批注** |

当前实现对所有类型一视同仁地做回锚/模糊修复，对批阅场景是过度工程：
- Agent 改完文件 → 批阅意见已执行 → 还在尝试回锚一条已无意义的记录
- 用户手动删除了原文 → 批阅意见所指的内容已经不在了 → 留着 `drifted` 记录只是噪音

## 2. 新策略

### 2.1 规则

1. **Agent 执行后**：Diff 确认后，批阅批注如果仍能被方案 B 映射为 `healed` 就保留；只有 `drifted` 才删除。阅读批注如果可回锚/模糊定位就保留，否则删除。
2. **相似度边界**：`similarity >= 0.3` 视为 `healed`，包括 0.3~0.7 的部分改写批阅，都保留；`similarity < 0.3` 才视为完全漂移。
3. **用户手动编辑后**：侧边栏 refresh 时检测到 `drifted` 的批阅批注，直接删除（不尝试 fuzzyLocate）；阅读批注先尝试 fuzzyLocate，失败也删除。
4. **不提示“漂移”**：原文被删/找不到时自动移除失效批注，不让用户处理无意义的 drifted 状态。
5. **只提示真正歧义**：当原文仍存在，但存在多个候选位置、插件无法判断该锚到哪一处时，才提示用户检查位置。

### 2.2 为什么不做"保留但标记为已执行"？

- 批阅批注的语义就是"改这里"，执行后没有持续价值
- 保留已执行批注会让侧边栏和 sidecar 膨胀，干扰用户判断"还有哪些没处理"
- 如果用户想回顾"做过什么修改"，应该看 Diff 历史/版本控制，不是看批注列表

### 2.3 边界情况

| 场景 | 处理 |
|------|------|
| Agent 只改了周围文字，批阅引用的原文完全没动 | 方案 B 回锚成功 → **保留**（因为批阅目标还在） |
| Agent 改了引用文字本身 | 方案 B similarity < 0.3 → drifted → **删除** |
| Agent 部分改了引用文字 | 方案 B similarity 0.3~0.7 → healed → **保留**（谨慎） |
| 用户删了引用段落 | locate() → drifted → **删除**，不提示偏移 |
| 阅读批注引用文本也被删除 | fuzzyLocate 失败 → **删除**，不提示偏移 |
| selectedText 仍存在但上下文失效，且只有一个候选 | 自动刷新上下文锚点 → **保留** |
| selectedText 在多处出现，无法判断是哪一处 | **提示用户检查位置歧义** |
| 批阅批注的 selectedText 在新文件中完全匹配 | locate() → strict → **保留** |

## 3. Axl Light 的漂移处理（对比参考）

[Axl Light](https://github.com/Antony-bit375/axl-light) 是目前唯一同样使用 sidecar JSON + 不改原文的 Obsidian 批注插件。其漂移策略如下：

### 3.1 锚点模型

```typescript
// Axl Light 的 TextAnchor
interface TextAnchor {
  startOffset: number;   // 持久化偏移量
  endOffset: number;
  selectedText: string;
  prefix: string;        // 20 字符上下文（我们用 50）
  suffix: string;
  isCode?: boolean;
}
```

**关键差异**：Axl Light **持久化偏移量**，我们**不持久化偏移量**（每次从文本搜索动态计算）。

### 3.2 三级定位（`resolveTextAnchor`）

```
1. 直接偏移匹配：source[startOffset:endOffset] === selectedText ?
   → confidence = 1，orphaned = false

2. 上下文匹配（findContextualMatch）：
   - 遍历所有 selectedText 出现位置
   - 计算 prefix + suffix 的 contextScore
   - confidence = 0.45 * prefixScore + 0.45 * suffixScore + 0.1
   - threshold ≥ 0.5 → orphaned = false

3. 模糊匹配（findBestFuzzyMatch）：
   - 先尝试精确搜索
   - 失败则以 expectedStart 为中心 ±300 字符扫描
   - 再失败则全文档扫描
   - Levenshtein 距离 → similarity = 1 - distance/maxLen
   - candidate length 在 ±25%~+35% 范围搜索
   - confidence ≥ 0.55 → orphaned = false
   - confidence 0.55~0.6 → orphaned = true（保留但标记孤立）
```

### 3.3 孤立批注处理

- `orphaned = true` → **只标记，不删除**
- 没有自动删除逻辑，用户需手动处理
- UI 层面只是视觉区分（灰色/半透明）

### 3.4 与我们的对比

| 维度 | Axl Light | 我们（当前） | 我们（新策略） |
|------|-----------|-------------|--------------|
| 偏移量 | 持久化 | 不持久化 | 不持久化 |
| 上下文长度 | 20 字符 | 50 字符 | 50 字符 |
| 精确定位 | offset 直接匹配 | 四级文本搜索 | 同 |
| 模糊算法 | Levenshtein（慢但准） | Trigram Jaccard（快但粗） | 同 |
| 模糊阈值 | 0.55 | 0.5 | 同 |
| 孤立/漂移处理 | 标记不删 | 标记 + 尝试修复 | **阅读：修复；批阅：删除** |
| Diff 回锚 | 无 | 方案 B（LCS） | 仅阅读批注 |
| Agent 集成 | 无 | CLI/API 直调 | 同 |

### 3.5 Axl Light 值得借鉴的点

1. **`orphaned` + `confidence` 双字段**：比我们的 `MatchStrategy` 枚举更细粒度，`confidence` 可以在 UI 上展示"修复可信度"
2. **Levenshtein vs Trigram**：Levenshtein 更准但 O(n²)，我们选 Trigram 是因为性能。可以在 selectedText ≤ 200 字符时切换 Levenshtein
3. **先搜局部再搜全局**：Axl Light 先以 expectedStart 为中心 ±300 字符搜索，失败再全文档。我们的 lineHint ±50 行等价，但字符级窗口可能比行级更精确

### 3.6 Axl Light 的不足（我们已有优势）

1. **无 Diff 回锚**：Agent 改完文件只能靠模糊匹配，我们方案 B 精确得多
2. **持久化偏移量是负债**：任何插入/删除都会让所有后续偏移失效，必须每次全量 resolve
3. **无自动修复**：只标记不修复，用户手动负担重
4. **无类型区分**：所有批注统一处理，没有阅读/批阅的生命周期差异

## 4. 实施方案

### 4.1 改动范围

| 文件 | 改动 |
|------|------|
| `main.ts` → `reanchorAndConfirm()` | 区分 review vs 阅读批注：review drifted → 删除；阅读 drifted 且 fuzzyLocate 失败 → 删除 |
| `sidebar/SidebarView.ts` → `refresh()` | drifted review 直接删除；阅读 drifted 先 fuzzyLocate，失败删除；单候选 fuzzy 静默更新，多候选 fuzzy 才提示 |
| `sidebar/SidebarView.ts` → UI | 不再显示"已漂移"；仅在多候选歧义时显示检查横幅 |

### 4.2 伪代码

```typescript
// main.ts → reanchorAndConfirm()
async reanchorAndConfirm(filePath, oldText, finalText) {
  const data = await this.store.getFile(filePath);
  const updates = reanchorAnnotations(oldText, finalText, data.annotations);

  let healed = 0, reviewsDeleted = 0, readingDeleted = 0;

  for (const update of updates) {
    const ann = data.annotations.find(a => a.id === update.id)!;

    if (update.status === "healed" && Object.keys(update.patch).length > 0) {
      // 阅读批注：正常回锚
      // 批阅批注：只要方案 B 能映射成功就保留；similarity 0.3~0.7
      // 的部分改写也保留，避免误删未完全执行的批阅意见。
      await this.store.updateAnnotation(filePath, update.id, update.patch);
      healed++;
    } else if (update.status === "drifted") {
      if (ann.type === "review") {
        // 批阅批注漂移 = 引用文字已被改/删 → 删除
        await this.store.removeAnnotation(filePath, ann.id);
        reviewsDeleted++;
      } else {
        // 阅读批注：尝试 fuzzyLocate 兜底
        const fuzzyResult = fuzzyLocate(finalText, ann);
        if (fuzzyResult.status === "auto-healed" && ...) {
          // ... 同现有逻辑
          healed++;
        } else {
          // 阅读批注引用文本也找不到，说明原文已删除/替换，直接移除
          await this.store.removeAnnotation(filePath, ann.id);
          readingDeleted++;
        }
      }
    }
  }

  // Notice
  if (reviewsDeleted > 0) {
    new Notice(`${reviewsDeleted} 条批阅意见已执行，自动移除`);
  }
  // ...
}

// SidebarView.ts → refresh()
// 只有多候选 fuzzy 才需要用户检查；单候选 fuzzy 静默刷新上下文。
if (r.status === "fuzzy" && r.candidates.length > 0) {
  affected.fuzzy++;
}

// drifted 表示引用文本无法定位：批阅直接删，阅读先 fuzzyLocate，失败也删。
if (ann.type === "review") {
  await this.plugin.store.removeAnnotation(this.currentFilePath, ann.id);
  reviewsDeleted++;
} else {
  const fuzzyResult = fuzzyLocate(docText, ann);
  if (fuzzyResult.status === "auto-healed") updateAnchor();
  else await this.plugin.store.removeAnnotation(this.currentFilePath, ann.id);
}
```

## 5. 风险与权衡

| 风险 | 缓解 |
|------|------|
| 用户想保留批阅记录做审计 | 可在删除前写一条日志到 sidecar 的 `executionLog` 数组（可选增强） |
| Agent 只做了部分修改，批阅意见未完全执行 | similarity 0.3~0.7 的 healed 批阅保留，只有完全 drifted 才删 |
| 用户误删了段落又想恢复 | Obsidian 有撤销 + 文件版本，批注已删除但 reviewText 可从版本历史找回 |
| 批阅批注的 selectedText 恰好在新文件中仍精确匹配 | locate() → strict → 保留（正确行为：引用文字还在） |
