# RAMP — 24 小时夺冠作战手册
### 网页无障碍的「检测 → 量化 → 自动修复 PR」闭环
HackBerkeley AI Hackathon 2026 · 2 人 · 你(Claude Code)+ 同学(Codex)
构建窗口:周六 ~11:00 开始 → 周日 11:00 提交(约 24h)

---

## 0. 三条铁律(先读,决定成败)

1. **薄切片优先 (thin slice first)**
   先让「**一个违规 → 一个修复 → 一个真实 PR**」端到端跑通,再 scale。
   优先级:跑通一条链 ≫ 功能多。demo 当天链路跑不通 = 直接出局。

2. **契约先行 (schema first)**
   开赛头 2h 两人一起把 4 个 JSON schema 定死(见 §2)。之后才能真并行、不互堵。

3. **数字是武器**
   一切为了拿到这两组数:① 同一模型「裸跑 vs 进 harness」检出率对比(对标 Codebreaker 的 35%→47%)② demo repo「修复前 → 修复后」合规分。没有数字 = 只能空口吹。

> 分工主轴:**你 = 活路径**(harness 审计→修复→PR,demo 脊梁);**同学 = 证明路径**(benchmark→打分→dashboard,数字来源)。两条路径可独立 demo,互为保险。

---

## 1. 系统架构总览

```
            ┌─────────────── 输入: GitHub repo / URL ───────────────┐
            ▼                                                        │
   ┌─────────────────┐   findings    ┌──────────────────┐   PR      │
   │  HARNESS 审计脑  │ ────────────► │  FIX LOOP 修复环  │ ────────► GitHub PR
   │  (你)           │               │  (你)            │           (artifact)
   └────────┬────────┘               └──────────────────┘
            │ 工具调用                         ▲
            ▼                                  │ Claude Code (headless) 改代码+验证
   Playwright → accessibility tree
   + axe-core + 对比度 + 读屏序列化
   + WCAG 规则知识库
            │
            │  (同一套 harness 也跑在 benchmark 上)
            ▼
   ┌─────────────────┐   scores     ┌──────────────────┐
   │  RAMP-BENCH     │ ───────────► │  SCORING 打分     │ ──┐
   │  (同学)         │              │  (同学)          │   │
   │  真实 a11y PR   │              │  裸跑 vs harness │   │
   │  → 标注成任务   │              │  修复前 vs 后     │   │
   └─────────────────┘              └──────────────────┘   │
                                                            ▼
                              ┌─────────────────────────────────────┐
                              │  DASHBOARD (同学) React+Tailwind     │
                              │  实时 agent trace + 分数 + PR 卡片    │
                              └─────────────────────────────────────┘
   横切全程: Arize Phoenix —— 追踪每一次 model 调用(reasoning/工具/token)
```

**一句话**:给一个前端 repo,Ramp 用「读得懂网页语义的 agent」审出所有 WCAG 无障碍违规、打出合规分,再让 Claude Code 自动改代码、验证、提交一个可直接合并的修复 PR。我们自建 benchmark 证明它比裸模型强多少。

**和现有工具(axe / Lighthouse)的根本差异**(这是你的 pitch 核心):
> axe / Lighthouse 只能自动查出约 30% 机器可判定的 WCAG 问题,而且**只报告、不修复**。
> 另外 ~70%(alt 文字是否有意义、标题层级是否合理、ARIA 语义是否正确、能否纯键盘操作)**需要人类级判断**。
> **Ramp-Bench 专测这 70% 的前沿,Ramp 的 harness 让 agent 能搞定它,而且直接交付可合并的修复 PR。**

---

## 2. 数据契约(头 2h 两人一起定死,之后不许随便改)

### 2.1 BenchTask(Ramp-Bench 的一道题,同学产出)
```json
{
  "id": "ramp-0001",
  "repo": "owner/name",
  "base_commit": "<修复前的 sha>",
  "fix_commit": "<修复 PR 的 sha>",
  "entry": "src/pages/Home.tsx 或可构建出的页面路径/URL",
  "wcag_criterion": "1.1.1 Non-text Content",
  "wcag_level": "A",
  "category": "alt-text",                // 见 §7.5 的 13 类
  "violation": "首屏 banner 的 <img> 缺少 alt 属性",
  "location": { "file": "src/Hero.tsx", "selector": "img.hero", "line": 42 },
  "gold_fix_diff": "<真实合并 PR 的 unified diff>",
  "hints": {
    "L0": "",
    "L1": "本页存在非文本内容(图片/图标)相关问题。",
    "L2": "检查 Hero 组件。",
    "L3": "src/Hero.tsx:42 的 <img> 缺 alt 属性。"
  },
  "machine_checkable": true               // axe 能否客观复检
}
```

### 2.2 Finding(harness 审计输出的一条违规,你产出)
```json
{
  "task_id": "ramp-0001 或 null(live 模式)",
  "wcag_criterion": "1.1.1",
  "category": "alt-text",
  "severity": "critical|serious|moderate|minor",
  "location": { "file": "src/Hero.tsx", "selector": "img.hero", "line": 42 },
  "evidence": {
    "screen_reader_before": "image",      // 读屏听到的(暴露问题)
    "contrast_ratio": null,
    "rule": "img-alt"
  },
  "description": "盲人读屏只会听到『image』,无法得知图片含义。",
  "suggested_fix": "为 <img> 添加描述性 alt 文本"
}
```

### 2.3 FixResult(修复环输出,你产出)
```json
{
  "finding_id": "...",
  "patch_diff": "<agent 生成的 diff>",
  "verified": true,
  "verification": {
    "axe_before": 12, "axe_after": 0,
    "build_ok": true,
    "screen_reader_after": "Logo, 公司主视觉横幅"
  },
  "pr_url": "https://github.com/.../pull/3"
}
```

### 2.4 Score(打分输出,同学产出)
```json
{
  "run_id": "...",
  "model": "claude-sonnet-4-6",
  "mode": "naked | harness",
  "detection": { "recall": 0.62, "precision": 0.71, "tasks": 30 },
  "fix": { "pass_rate": 0.48 },
  "compliance_before": 0.41,
  "compliance_after": 0.93
}
```

> 这 4 个 schema 是两人之间唯一的接口。各自只要保证「读得进、吐得出」这 4 种 JSON,内部怎么实现互不干涉。

---

## 3. 技术栈(都选「起步最快又够唬人」的)

| 层 | 选型 | 备注 |
|---|---|---|
| 后端/控制面 | Node + TypeScript + **Hono** | 轻、起得快;一个 monorepo |
| 模型层 | **Vercel AI SDK**(Anthropic/OpenAI/Google) | 一套接口切多家模型 → 直接支撑 leaderboard |
| 浏览器/工具 | **Playwright** + **@axe-core/playwright** | 取 accessibility tree、跑 axe 复检 |
| 沙箱执行 | **Docker**(MVP 阶段可先用普通 worker 进程) | 跑 repo 构建/Playwright,故事更硬 |
| 数据库 | **SQLite + Drizzle** | 零配置最快;来得及再换 Postgres |
| 前端 | **React + Vite + Tailwind + shadcn/ui** | 实时 trace + 分数 + PR 卡片 |
| 可观测性 | **Arize Phoenix**(开源,OpenTelemetry) | 赞助商钩子,见 §7.7 |
| 修复 agent | **Claude Code headless**(`claude -p`)+ **Octokit** 开 PR | 你的核武器,见 §7.8 |

> 具体 API 签名让你们的 agent(Claude Code / Codex)现查现写,本手册只定**做什么、怎么接**。不确定的 API 一律让 agent 读官方文档确认。

---

## 4. 赛前准备(只做 ideation / 账号 / 选题 —— 不写实现代码!)

> 规则:ideation 允许,**所有实现代码必须开赛后写**。下面都是合规的「准备」。

**账号与密钥**(全部提前配好,开赛 0 浪费):
- [ ] Anthropic / OpenAI / Google 三家 API key
- [ ] GitHub:建一个**专用 GitHub App 或 PAT**,有 `repo` + 开 PR 权限
- [ ] **Fork 3 个目标 demo repo**(下条),PR 就开在自己的 fork 上,稳
- [ ] Arize Phoenix 账号(或确认本地 self-host 能跑)

**选定 3 个 demo repo**(关键):挑**真实、能本地构建、已知有 a11y 问题**的中小前端开源项目(React/Vue/静态站皆可)。标准:`npm i && npm run build/dev` 能在 2 分钟内跑起来。准备 1 个"主秀 repo" + 2 个备用。

**预读文档**(只读不写):WCAG 2.2 Quick Reference、axe-core 规则列表、Playwright 的 accessibility / CDP AXTree、Claude Code headless(`-p` print mode / SDK)、Arize Phoenix quickstart、Octokit 创建 PR。

**起草(文档,非代码)**:
- WCAG 规则知识库的内容大纲(13 类 × 每类:判定要点 + 常见失败 + 正确修法)。开赛后再把它做成喂给 model 的 context/skill。
- demo 剧本草稿 + 那句记忆点:**"我们不发报告,我们提交修复。"**

---

## 5. 分工总表

| 阶段(周六起算) | 你 — Claude Code(活路径) | 同学 — Codex(证明路径) |
|---|---|---|
| **P1 0–2h** 地基 | 一起:架构、4 个 schema、repo 骨架、端到端 stub、**最先验证开 PR 能成功** | 一起:同左;另起 dashboard 空壳 + DB |
| **P2 2–7h** 核心 | Harness:Playwright 取 a11y tree → 工具集 → agent 审计循环(对 1 个 repo 跑通) | Bench 采集管线:挖 a11y PR → 克隆 → 让 Codex 标注成 BenchTask;dashboard 接 DB 实时显示 |
| **P3 7–11h** 闭环 | Fix loop:findings → Claude Code 改码 → 验证 → 开真实 PR | Scoring:harness 跑 bench → 算 detection/fix 率 → **裸跑 vs harness 对比**;跑第一批(≥20 题) |
| 🔴 **11h 内部 demo** | 端到端走一遍:审计 → 修复 → PR | 出第一组真实数字 + dashboard 能看 |
| **P4 11–15h** 集成+放量 | 接 Arize trace;多 finding 并行修;PR body 模板化(before/after 证据) | benchmark 放量到 30–60 题;多模型 leaderboard;dashboard 打磨 |
| **睡 15–20h** | 错峰睡;留一人盯**长时 benchmark 跑批**(对标 Codebreaker 通宵烧 token) | 同左 |
| **P5 20–23h** 收尾 | 录 demo backup 视频;排练 3 分钟 | 写 Devpost(套 Codebreaker 结构);数字定稿入图 |
| **23–24h** | 一起:最后跑通验收 → **11:00 前提交 Devpost** | |

---

## 6. 逐小时计划(每步怎么做)

### Phase 1 · 0–2h · 地基(两人一起,这 2h 别分开)

1. **建 monorepo**(让 agent 起):`packages/control-plane`(后端)、`packages/harness`、`packages/bench`、`apps/dashboard`。pnpm workspace + TypeScript + Hono。
2. **把 §2 四个 schema 写成共享 types**(`packages/shared/schema.ts`),两人都 import。**这步定死后不许随便改。**
3. **端到端 stub**:写一条假链路——塞一个 hardcoded Finding → 调一个假的 fix → 在 fork 上**真的开出一个 PR**。
   🔴 **本阶段最重要的一件事:今天就验证「程序能成功开 GitHub PR」**。这是最容易卡权限/认证的地方,越早踩坑越好。用 Octokit:创建分支 → 提交一个改动 → 开 PR。能开出来,这条命脉就通了。
4. **dashboard 空壳上线**:Vite + Tailwind + shadcn,先能从 DB 读出 stub 数据并显示一张卡片。
5. **DB 起好**:SQLite + Drizzle,建 runs / findings / fixes / scores 表。

✅ Phase 1 验收:一条假数据能从「审计输出」流到「dashboard 显示」并「开出一个真 PR」。骨架通了。

---

### Phase 2 · 2–7h · 核心

#### 你(Harness 审计脑)—— 这是技术含量的集中地
1. **Playwright 起页面**:`page.goto(url)`,拿到渲染后的 DOM。
2. **取 accessibility tree**(核心武器):用 Playwright 的 accessibility snapshot,或经 Chrome DevTools Protocol 取完整 AX 树。**这棵树就是读屏软件实际消费的语义结构** —— 喂这个给 model,而不是裸 HTML,是 agent 能"像盲人一样理解页面"的关键。
3. **做 4 个工具函数**(暴露给 model 调用):
   - `get_accessibility_tree()` → 返回语义树
   - `get_screen_reader_output()` → 把 AX 树深度遍历,序列化成读屏会念出的**线性序列**(role+name+state)。例:三个无标签按钮 → `["button","button","button"]`,一念就知道问题在哪(§7.2)
   - `check_contrast(selector)` → 取 computed color/background,按 WCAG 公式算对比度(§7.3)
   - `get_focus_order()` → 模拟连续 Tab,记录 `activeElement` 顺序与焦点是否可见
   - `query_dom(selector)` / `submit_finding(finding)`
4. **接 axe-core**(`@axe-core/playwright`):先跑一遍拿机器可判定违规,作为 agent 的"起点线索",也作为后面客观复检的锚。
5. **WCAG 知识库注入**:把赛前起草的 13 类规则做成 system prompt context / skill 文件,让 model 知道每条标准的判定与修法。
6. **审计 agent 循环**:给 model 上面的工具,让它对页面探索 → 按 WCAG 推理 → 用 `submit_finding` 吐出结构化 Finding(符合 §2.2)。先用 Claude(Anthropic)跑通。

✅ 你的 Phase 2 验收:对主秀 repo 跑一次,输出一组真实 Findings(JSON),且 dashboard 能显示其中的 `screen_reader_before` 证据。

#### 同学(Bench 采集 + dashboard)
1. **挖真实 a11y 修复 PR**(对标 Codebreaker 用 GHSA):GitHub Search API 搜已合并 PR/commit,关键词:`accessibility` / `a11y` / `aria-label` / `alt text` / `wcag` / `role=` / `focus` / `contrast`,限 `is:merged`、限前端语言仓库。
   ⚠️ 搜索 API 有限速且 PR 搜索受限 —— **同时手挑 10 个已知优质 a11y 修复 PR 作为保底种子**,保证不空仓。
2. **克隆 + 取 diff**:对每个候选 PR,克隆 repo 到**父 commit(修复前 = 不可访问状态)**,取 diff(= 黄金修复)。改动的文件/行 = 违规位置;diff = gold fix。
3. **让 Codex 标注成 BenchTask**:把 repo + diff 丢给 Codex,让它判定 WCAG 准则、定位元素、生成符合 §2.1 的 task JSON,并写 L0–L3 提示。**每个 task 当成一个普通 PR 提交进 bench 仓**,可人工 review,质量可审计(完全照搬 Codebreaker)。
4. **按 13 类分层抽样**(§7.5),别让"缺 alt"一类占满。
5. **dashboard 接真 DB**:实时显示 runs / findings,做出"trace 时间线"雏形。

✅ 同学 Phase 2 验收:≥10 个可用 BenchTask 入库;dashboard 能实时刷新。

---

### Phase 3 · 7–11h · 闭环 + 首批数字

#### 你(Fix Loop + 开 PR)—— demo 的 money shot
1. **派活给 Claude Code**:对每条 Finding,在沙箱里 checkout 该 repo,用 **Claude Code headless**(`claude -p "修复以下 WCAG 违规:<finding>;只改最小范围;改完运行 <build/test> 验证"`)生成补丁。Claude Code 能多文件改 + 跑命令自检,正好当"自主修复 agent"(§7.8)。
2. **验证**:改完**重跑 axe-core**(机器可判定的看违规是否归零)+ 跑项目原有构建/测试,确认没改坏。把 before/after 写进 FixResult.verification。
3. **开 PR**(Octokit):在 fork 上建分支、提交补丁、开 PR。**PR body 模板化**,放:违规摘要 + WCAG 准则 + 读屏 before/after + 对比度 before/after + axe before/after + diff。**让这个 PR 看起来像专业 a11y 工程师手写的** —— 这是 demo 最炸的一幕。
4. **先把"图片缺 alt"这一种**从审计→修复→PR 完整跑通一遍,再加别的类别。

#### 同学(Scoring + 第一批跑批)
1. **Detection 打分**:对每个 BenchTask,看 harness 的 findings 是否命中 gold 违规(按 location + criterion 匹配)→ 算 recall(找到/应找)与 precision(正确/上报)。
2. **Fix 打分**:把 agent 补丁打上去 → 机器可判定的用 axe 复检(客观);需判断的用 LLM-judge 对比 gold fix(主观)→ pass/fail。
3. **跑出头号对比**:同一模型 **裸跑(只给 HTML、无工具)vs 进 harness(给全套工具)** 的 detection 率 → 这就是你的"35%→47%"。
4. **合规分**:对 demo repo,定义合规分 = 通过的检查项 / 总检查项,记录修复前→后。
5. 第一批至少 20 题跑出数。

🔴 **11h 内部 demo(全员停下来走一遍)**:输入主秀 repo → 看到审计 findings + 读屏证据 → 看到自动修复 → 弹出**真实 PR** → 看到 bench 上"裸跑 vs harness"第一组数字。**这一刻链路必须通。不通就停止加功能,全力补这条链。**

---

### Phase 4 · 11–15h · 集成 / 放量 / Arize / 打磨

- **你**:接 **Arize Phoenix** trace(§7.7),让 dashboard/Arize 能看 agent 实时 reasoning 与 token;支持多 finding 并行修;PR 模板美化;补 2–3 个违规类别(对比度、表单标签、按钮命名)。
- **同学**:benchmark 放量到 **30–60 题**;跑 **多模型 leaderboard**(Claude / GPT / Gemini × naked/harness);dashboard 做出"分数对比图 + leaderboard + PR 卡片"三屏。
- **一起**:把 demo 主秀 repo 的"修复前→后合规分"做成一张干净的对比图。

✅ Phase 4 验收:数字成图、leaderboard 成形、Arize 能现场展示、PR 漂亮。

---

### 睡眠 · 15–20h · 错峰

- 两人**错峰各睡 3–4h**,始终留一人盯**长时 benchmark 跑批**(放量跑 + 重跑增量)。这既是产出更大数字(对标 Codebreaker 通宵烧 token 的 280M/36h 叙事),也避免清晨手忙脚乱。
- 睡前确保 demo 的"已跑通版本"已 commit + 有 backup。

---

### Phase 5 · 20–23h · 收尾

- **你**:用主秀 repo 完整录一段 **backup demo 视频**(防止现场网络/构建翻车);排练 3 分钟讲法(§8)。
- **同学**:写 **Devpost**(套 §9 结构);把最终数字、leaderboard、合规分对比图、PR 截图放进去。
- **一起**:最后端到端验收一次;`Built With` 列全(cloudflare 替换成你们实际用的:playwright / axe-core / arize / claude-code / vercel-ai-sdk / react / typescript / docker / github)。

### 23–24h · 提交

- **周日 11:00 PDT 前**提交 Devpost,**务必把两人都加进 team**(Devpost 加人才算正式组队)。

---

## 7. 难点逐个拆解(怎么做)

### 7.1 取 accessibility tree(核心)
用 Playwright 渲染页面后取「可访问性树」(浏览器暴露给辅助技术消费的语义结构),或经 CDP 取完整 AX 树。**喂这个给 model 而非裸 HTML**,是它能像读屏用户一样理解页面的关键。具体 API 让 agent 按当前 Playwright 版本文档实现。

### 7.2 读屏序列化(demo 最直观的一招)
深度遍历 AX 树,按出现顺序拼出读屏会念出的线性串:`role + 可访问名 + 状态`。无标签按钮就会得到 `["button","button","button"]` —— 现场念出来,评委立刻"听懂"了无障碍问题。这是 §8 demo 的杀招。

### 7.3 对比度
取元素 computed 的前景色与背景色 → 算相对亮度 → 按 WCAG 对比度公式得比值,对照 4.5:1(正文)/3:1(大字)阈值。

### 7.4 harness = 让通用模型变专家
= system prompt 注入 WCAG 知识库 + 上面那套工具(tree / 读屏 / 对比度 / 焦点顺序 / DOM 查询 / 提交 finding)。**核心论点:同一个模型,配上领域专用 harness,表现天差地别** —— 这正是你"裸跑 vs harness"数字的来源,也是 Codebreaker 反复强调的 insight。

### 7.5 Ramp-Bench 的 13 类(分层抽样,对标 CWE Top 25)
1 缺 alt/非文本内容 · 2 颜色对比度 · 3 表单标签 · 4 键盘可操作/焦点顺序 · 5 链接与按钮命名 · 6 标题层级/地标 · 7 ARIA 误用 · 8 页面语言 · 9 焦点可见 · 10 name/role/value · 11 错误提示 · 12 reflow/响应式 · 13 动效控制。

### 7.6 L0–L3 难度层(同一道题测不同能力)
L0 纯发现(无提示)→ L1 给类别 → L2 给文件/区域 → L3 精确定位。让同一条记录干净地度量"开放式狩猎 → 辅助分诊"全谱。

### 7.7 Arize Phoenix 接入(赞助商钩子)
用 Phoenix(开源)经 OpenTelemetry / OpenInference 追踪所有 model 调用。给 harness 的每次调用打 trace,使每个审计 run 的 reasoning、工具调用、token 可见、可比、可复盘。demo 里一句:"全程可观测,基于 Arize。"具体用其对 Vercel AI SDK / Anthropic 的 instrumentation,按 quickstart 接。

### 7.8 Claude Code 当修复 agent(你的核武器,对标 Codebreaker 的 Devin)
不要把 Claude Code 只当"帮我打字"。在修复环里用 **headless 模式**(`claude -p` / SDK)让它**自主**:checkout repo → 读 finding → 改最小范围代码 → 跑构建/测试自检 → 把验证证据回填。它是"产品里跑着的那个 agent",不是建造者。**约束每次只修一个 finding、限定改动范围**,稳定性更好。

### 7.9 开 PR(money shot)
Octokit:建分支 → 提交补丁 → 开 PR。Body 放 before/after 全套证据。**PR 即交付物** —— 评审、CI、合并都用开发者现成的 GitHub 流程,不需要新平台。这正是 Codebreaker"PR 才是正确接口"的打法。

---

## 8. Demo 3 分钟逐段脚本

1. **(20s)钩子 + 问题**:"全球 13 亿残障用户被代码挡在门外。现有工具只会丢给你一份 87 条违规的报告,然后……就没了。"
2. **(40s)实时审计**:输入主秀 repo,dashboard 实时显示 agent 用 accessibility tree 审计。**现场播放读屏序列**:"听,盲人用户听到的是——button、button、button。没有一个按钮有名字。"
3. **(40s)自动修复 → PR**:agent 改代码,屏幕弹出**真实 GitHub PR**,展示 before/after 读屏 + 对比度 + diff。**"我们不发报告,我们提交修复。"**
4. **(40s)数字**:Ramp-Bench 上 **裸跑 X% vs 进 harness Y%**;主秀 repo 合规分 **41% → 93%**;多模型 leaderboard 一屏;Arize trace 一闪而过("全程可观测")。
5. **(20s)愿景**:"接进 CI,任何新披露的无障碍问题都被自动复现、修复、提 PR 回上游 —— 让无障碍平权,变成开发者 review 一个 PR 的事。"

---

## 9. Devpost 写法(套 Codebreaker 结构)

按这几节写,每节都塞数字与"agent 做了人做不到的事":
- **Inspiration**:13 亿用户 + 现有工具只报告不修复 + 70% 的 WCAG 问题需人类级判断。
- **What it does**:三支柱(Ramp-Bench / harness / 自动修复闭环)各一段,配核心数字。
- **How Claude Code powered Ramp**(对标 Codebreaker 的 "How Devin powered"):写它**curate 了什么、并行建了什么、是哪个核心功能的 agent**。
- **How we built it**:技术栈 + 数据流。
- **Challenges**:大规模标注 benchmark、把 Playwright/沙箱/Claude Code/GitHub 缝成一个可复现闭环。
- **Accomplishments / What we learned**:"工具与 prompt 是能力的真实杠杆"、"PR 是无障碍工作的正确接口"。
- **What's next**:接 live repo,从 benchmark 走向自动修复上游。
- **Built With**:列全实际用到的。

---

## 10. 砍单清单(时间不够,从下往上砍 —— 上面三条永不砍)

🔴 永不砍:① 一次 live 审计(含读屏证据)② 一个真实修复 PR ③ 一组"修复前→后"或"裸跑 vs harness"数字。

可砍(按此顺序):
- 多模型 leaderboard → 只留 Claude 的「裸跑 vs harness」
- Docker 沙箱 → 直接在 worker 进程跑 Playwright
- 多个 demo repo → 只保主秀 1 个
- benchmark 60 题 → 缩到 20–30 题,甚至全手挑
- 花哨 diff 可视化 → 纯文本 diff
- 违规类别 → 先只做「缺 alt + 对比度 + 表单标签」3 类

---

## 11. 风险 & 应对

| 风险 | 应对 |
|---|---|
| GitHub PR 权限/认证卡住 | **Phase 1 就先验证开 PR**;PR 开在自己 fork 上 |
| Playwright 在任意站点不稳 | 只用**能本地构建**的 repo + 几个静态页;主秀 repo 提前验证可跑 |
| Claude Code headless 输出不稳定 | 每次只修 1 个 finding、限定改动范围、加重试;修不动就跳过记为 fail(诚实反而加分) |
| benchmark 采集慢/噪声大 | 手挑 10 个优质 PR 保底;自动挖的当增量 |
| Fix 打分主观 | 机器可判定的用 axe 客观复检当锚,judgment 类才用 LLM-judge |
| 现场网络/构建翻车 | Phase 5 录 **backup demo 视频** |
| 摊子铺太大做不完 | 铁律①:薄切片优先,11h 必须有端到端跑通版 |

---

## 12. 一句话记住整件事
**Ramp = 网页无障碍的「自动审计 + 自动修复」系统:用自建 benchmark 证明它有多强,用领域 harness 把 agent 变成无障碍专家,最后直接提交可合并的修复 PR —— 把残障平权,变成开发者 review 一个 PR 就能完成的事。**

冠军公式:真痛点 + 三支柱(可量化 bench / 领域 harness / 产出真 artifact 的闭环)+ 深度绑赞助商(Arize + Claude Code)+ agent 是产品核心 + 一句记忆点("我们不发报告,我们提交修复")。
