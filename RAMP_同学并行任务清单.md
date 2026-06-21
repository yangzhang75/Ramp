# RAMP · 同学(Codex)并行任务清单
你负责证明路径。下面把活拆成独立任务,标了【能否现在开】和【依赖】。
**能并行的就同时多开几个 Codex session 一起跑,别一条线慢慢走。**
你的目录:`packages/bench`、`packages/scoring`、`apps/dashboard`

> 队友进度(你可以直接用的):runAudit(审计功能)、/audit 接口、合规分都已在 main。
> 所以你的 scoring 不用搞假替身,直接调真的。

---

# 🔴 先做(5 分钟,所有任务的前提)

**P0 · 环境 + 字段对齐**
```
1. clone https://github.com/yangzhang75/Ramp.git,pnpm install,pnpm build 确认全绿。
2. 建 .env(repo 根,别提交):GITHUB_TOKEN、OPENAI_API_KEY(去 platform.openai.com 充$10~15)、
   GOOGLE_API_KEY(可选,Gemini 免费额度)、ANTHROPIC_API_KEY(用队友那个)。
3. 打印 packages/shared 里 ViolationType 的全部取值,和 BenchTask/AnnotatedFinding/
   Finding/Score 四个类型的字段。贴出来。
```
**记死**:违规类别 `type` 必须用 ViolationType 里的值,跟队友 harness 一致。队友现在在用的有:
`missing_alt_text`、`icon_button_accessible_names`、`low_color_contrast`、
`missing_form_labels`、`missing_landmarks`(完整以打印出来的为准)。
文件字段:你的 `file` ↔ 队友的 `sourceFile`。

---

# ===== 🟢 可立即并行的三个任务(P0 做完就同时开)=====

## 任务 A · 手挑 10 个种子【现在就能开 · 不依赖任何人 · 不花钱】
在 GitHub 找已合并的、真修无障碍的 PR(diff 含 aria-label/alt/role/contrast/label/tabindex),
把 `owner/repo#prnumber` 抄进 `packages/bench/data/seeds.txt`,一行一个,凑 10 个。
标准:真 a11y 修复、diff 小(1–3 文件)、前端仓库。
> 这是人工活,你自己做,不用 Codex。10 分钟。

## 任务 B · 挖候选脚本(mine)【现在就能开 · 不依赖 · 不烧 AI 钱】
```
在 packages/bench 写 src/mine.ts(ESM,tsx 跑)。用 octokit + GITHUB_TOKEN:
1. 搜已合并 PR,关键词:accessibility, a11y, aria-label, "alt text", wcag, "role=",
   "focus order", contrast。优先前端仓库。指数退避处理限速。
2. 同时读 data/seeds.txt(任务A的),无条件纳入。
3. 每个 PR 取:repo、pr_number、base_commit、fix_commit、标题、unified diff。
4. 追加写 data/candidates.jsonl,每行 {repo,pr_number,base_commit,fix_commit,title,diff}。
跑完告诉我多少条、种子占几条。
```

## 任务 C · dashboard 界面骨架【现在就能开 · 先用假数据 · 不依赖真数据】
```
把 apps/dashboard 搭成 Vite + React + TS + Tailwind + shadcn/ui(pnpm create vite 起标准结构)。
先用写死的假数据做出三个屏的 UI 骨架:
1. Live Run:列出 Finding(type/severity/evidence),重点显示 evidence 里的读屏证据和对比度。
2. Scores:柱状图 naked vs harness;合规分 before→after 大数字;leaderboard 表。
3. PR Card:展示一个修复 PR 卡片(标题/diff/before-after)。
深色、干净。先把样子做出来,真数据接口后面接。做完 pnpm dev 起来截图。
```

> A、B、C 互不依赖,**同时开三个 Codex session 跑**(C 是前端、B 是脚本、A 你手动)。

---

# ===== 🟡 有前置的任务(前置好了再开)=====

## 任务 D · curate 成测试题【等 B 挖到候选后开】
```
在 packages/bench 写 src/curate.ts(ESM/tsx)。对 data/candidates.jsonl 每行:
1. 浅克隆 repo,checkout 到 base_commit(修复前)。
2. 读 diff,用 OpenAI(便宜档模型即可)生成符合 shared 里 BenchTask 类型的对象:
   - id "ramp-"+编号;repoUrl/branch/framework
   - expectedFindings: 对 diff 每处修复一条 AnnotatedFinding:
     type(必须 ViolationType 合法值,和队友同一套)、wcagRule、file、line?、expectedFix
   - createdAt: ISO
3. 写成 data/tasks/<id>.json。
4. 按 type 分层,打印分布,别让 missing_alt_text 占满。
5. 多候选并行处理。
先冲 20~30 题,贴数量和分布给我。
```
✅ 抽 3 个生成的 task 人工看 type/wcagRule/file 对不对。

## 任务 E · scoring 打分【等 D 有题后开 · 出第一组真数字 🔴】
```
在 packages/scoring 写 src/score.ts(ESM/tsx)。import @ramp/shared 类型 + @ramp/harness 的 runAudit。
1. detection:遍历 data/tasks/ 每题,调 runAudit 拿 Finding[]。
   命中 = type 相等 且 wcagRule 相等 且 task.file === finding.sourceFile。算 recall/precision。
2. naked vs harness:naked=只丢 HTML 不给工具让模型直接列;harness=调完整 runAudit。
   各出一行 Score。
3. 写进 DB(getDb())。
跑完把 naked vs harness 的 recall/precision 对比贴给我。
```
✅ 这是你这条线最重要的产出:第一组「naked X% vs harness Y%」真实数字。

## 任务 F · 接通 dashboard 真数据【等 C+E 后开】
把任务 C 的假数据换成真的:Live Run 读 control-plane 的 GET /runs/:id;
Scores 读 scoring 写进 DB 的真实数字。

## 任务 G · Day2 深化【等 E 跑通后】
- leaderboard:Claude/GPT/Gemini × naked/harness 矩阵(Vercel AI SDK 切模型,Gemini 用免费额度)
- 消融:去掉读屏工具/去掉 WCAG 知识 各跑一遍,看 recall 掉多少
- benchmark 放量到几百题(夜间挂着跑)
- 写 Devpost

---

# 依赖关系图(一眼看懂先后)
```
P0(环境+字段) ──┬──► A 种子 ─┐
                 ├──► B 挖候选 ┴─► D curate ─► E scoring 🔴 ─► F 接dashboard
                 └──► C dashboard骨架 ───────────────────────┘   └─► G 深化
```
**现在立刻并行开:A + B + C。** 它们跑的同时,D 在等 B,E 在等 D。

# 你的紧急里程碑
- [ ] P0 环境跑起来 + 字段对齐
- [ ] A+B+C 并行启动
- [ ] 🔴 D→E:20~30 题 + 第一组 naked vs harness 数字(这是夺冠硬证据,最优先)
- [ ] F dashboard 接真数据
- [ ] G 深化(leaderboard/消融/放量/Devpost)

# 省钱提醒
curate 用便宜模型;leaderboard 最烧 token,先 20 题跑通再放大;各家 API 设 spending cap。
