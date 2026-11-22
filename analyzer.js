/**
 * dsh-zhenti434 · 分析内核（JavaScript 版）
 * 输入：data/questions.jsonl + data/exams.json + data/tags.json
 * 输出：metrics.json + report.html（自包含、离线可开）
 */
import { readFile, writeFile, mkdir, access, cp, readdir, copyFile } from 'node:fs/promises'
import { constants as FS } from 'node:fs'
import path from 'node:path'

export const CHAPTERS = {
  1: '全球化', 2: '国家差异', 3: '国际商务制度环境', 4: '国际贸易理论与政策',
  5: '区域经济一体化', 6: '对外直接投资', 7: '外汇市场', 8: '国际货币体系',
  9: '全球资本市场', 10: '国际企业战略与组织', 11: '出口、进口与对等贸易',
  12: '全球生产与供应链管理', 13: '全球营销与商业分析', 14: '全球人力资源管理',
  15: '国际企业的会计和财务',
}
export const MODULES = ['企业', '贸易', '金融', '投资']
const YEARS = [2022, 2023, 2024, 2025, 2026]
const DATA_SCOPE = '2022—2026 现行版式 60 个设问；2020—2021 旧版式仅作考点年表参考'

const r1 = (x) => Math.round(x * 10) / 10

async function exists(p) {
  try { await access(p, FS.F_OK); return true } catch { return false }
}

/** 首次运行或升级时，把包内 core/data 中缺失的文件补齐到用户数据目录 */
export async function ensureDataDir(bundledCore, dataDir) {
  const dst = path.join(dataDir, 'data')
  const src = path.join(bundledCore, 'data')
  await mkdir(dst, { recursive: true })
  for (const name of await readdir(src)) {
    const target = path.join(dst, name)
    const alwaysRefresh = name.endsWith('.enc') || name === 'hot.json'
    if (alwaysRefresh || !(await exists(target))) await copyFile(path.join(src, name), target)
  }
  return dataDir
}

export async function loadData(dataDir) {
  const questions = (await readFile(path.join(dataDir, 'data', 'questions.jsonl'), 'utf8'))
    .split('\n').filter(Boolean).map((line) => JSON.parse(line))
  let exams = []
  try { exams = JSON.parse(await readFile(path.join(dataDir, 'data', 'exams.json'), 'utf8')) } catch { /* 可缺省 */ }
  if (!questions.length) throw new Error('questions.jsonl 为空')
  return { questions, exams }
}

export function compute(questions) {
  const cur = questions.filter((q) => q.format === '现行版式')

  const structure = YEARS.map((y) => {
    const rows = cur.filter((q) => q.year === y)
    const by = {}
    for (const q of rows) {
      const b = by[q.qtype] || (by[q.qtype] = { n: 0, score: 0 })
      b.n += 1
      b.score += q.score
    }
    const total = Object.values(by).reduce((s, v) => s + v.score, 0)
    return { year: y, name: by, total }
  })

  const heat = {}
  for (const ch of Object.keys(CHAPTERS)) {
    heat[ch] = {}
    for (const y of YEARS) heat[ch][y] = 0
  }
  for (const q of cur) heat[q.chapter][q.year] += q.score
  const chapterTotal = {}
  for (const ch of Object.keys(CHAPTERS)) {
    chapterTotal[ch] = YEARS.reduce((s, y) => s + heat[ch][y], 0)
  }

  const moduleByYear = {}
  for (const y of YEARS) {
    const d = { 企业: 0, 贸易: 0, 金融: 0, 投资: 0 }
    for (const q of cur) if (q.year === y) d[q.module] = (d[q.module] || 0) + q.score
    moduleByYear[y] = d
  }

  const tagMap = new Map()
  for (const q of questions) {
    const key = q.cluster || q.detail
    if (!tagMap.has(key)) tagMap.set(key, [])
    tagMap.get(key).push(q)
  }
  let freq = []
  for (const [tag, items] of tagMap) {
    const curItems = items.filter((it) => it.format === '现行版式')
    const ysAll = [...new Set(items.map((it) => it.year))].sort((a, b) => a - b)
    const ysCur = [...new Set(curItems.map((it) => it.year))].sort((a, b) => a - b)
    const gaps = ysCur.slice(1).map((y, i) => y - ysCur[i])
    const ch = (curItems[0] || items[0]).chapter
    freq.push({
      tag, ch,
      count_all: items.length,
      count: curItems.length,
      years_all: ysAll,
      years: ysCur,
      gaps,
      last: ysCur.length ? ysCur[ysCur.length - 1] : null,
      score_sum: curItems.reduce((s, it) => s + (it.score || 0), 0),
      details: [...new Set(items.map((it) => it.detail))].sort(),
    })
  }
  freq.sort((a, b) => (b.count - a.count) || (b.score_sum - a.score_sum) || ((b.last || 0) - (a.last || 0)))

  const repeated = freq.filter((f) => f.count >= 2 && f.years.length >= 2)
  const involved = repeated.reduce((s, f) => s + f.count, 0)
  const repeatRate = cur.length ? involved / cur.length : 0

  const chapterRecent = Object.keys(CHAPTERS).map((ch) => {
    const total = chapterTotal[ch]
    const avg = total / 5
    const recent2 = (heat[ch][2025] + heat[ch][2026]) / 2
    return { ch: Number(ch), name: CHAPTERS[ch], total, avg: r1(avg), recent2: r1(recent2), gap: r1(avg - recent2) }
  })

  let cand = []
  for (const f of freq) {
    if (f.count >= 2 && f.last && f.last <= 2024) {
      const ch = f.ch
      const weight = chapterTotal[ch] / 750
      const score = r1(f.count * (2027 - f.last) * (0.5 + weight) * 10)
      cand.push({
        tag: f.tag, ch, chapter_name: CHAPTERS[ch], years: f.years, count: f.count,
        last: f.last, weight: Math.round(weight * 1000) / 1000, score, details: f.details,
      })
    }
  }
  cand.sort((a, b) => b.score - a.score)

  const askCount = {}
  const askScore = {}
  for (const q of cur) {
    askCount[q.ask] = (askCount[q.ask] || 0) + 1
    askScore[q.ask] = (askScore[q.ask] || 0) + q.score
  }
  const style = {
    ask: Object.keys(askCount).map((k) => ({ ask: k, count: askCount[k], score: askScore[k] }))
      .sort((a, b) => b.count - a.count),
    cn_questions: cur.filter((q) => q.cn).length,
    cn_score: cur.filter((q) => q.cn).reduce((s, q) => s + q.score, 0),
    cold: cur.filter((q) => q.cold).map((q) => ({ year: q.year, stem: q.stem, detail: q.detail })),
    hot: cur.filter((q) => q.hot).map((q) => ({ year: q.year, stem: q.stem, detail: q.detail })),
  }

  const typeModule = {}
  for (const t of ['名解', '简答', '论述']) {
    const d = { 企业: 0, 贸易: 0, 金融: 0, 投资: 0 }
    for (const q of cur) if (q.qtype === t) d[q.module] = (d[q.module] || 0) + q.score
    typeModule[t] = d
  }

  return {
    generated_for: '北京师范大学 434 国际商务（2027 备考）',
    data_scope: DATA_SCOPE,
    structure,
    heat,
    chapter_total: chapterTotal,
    module_by_year: moduleByYear,
    freq: freq.slice(0, 40),
    repeat_rate: Math.round(repeatRate * 10000) / 10000,
    repeated_tags: repeated.map((f) => ({ tag: f.tag, count: f.count, years: f.years, details: f.details })),
    chapter_recent: chapterRecent,
    candidates_2027: cand.slice(0, 15),
    style,
    type_module: typeModule,
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function heatClass(v) {
  if (!v) return 'h0'
  if (v <= 10) return 'h1'
  if (v <= 20) return 'h2'
  if (v <= 35) return 'h3'
  if (v <= 50) return 'h4'
  return 'h5'
}

export function renderReport(m) {
  const h = []
  const heat = m.heat
  const years = YEARS.map(String)
  h.push(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>北师国商 434 真题分析报告</title>
<style>
:root{--fg:#1f2328;--muted:#6b7280;--line:#e5e7eb;--brand:#1f6feb}
*{box-sizing:border-box}body{margin:0;background:#f6f7f9;color:var(--fg);
font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;line-height:1.65}
.wrap{max-width:1080px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:34px 0 10px;padding-left:10px;border-left:4px solid var(--brand)}
h3{font-size:15px;margin:18px 0 8px;color:#374151}
.sub{color:var(--muted);font-size:13px}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:12px 0}
.warn{background:#fff8e6;border:1px solid #f5d78e;border-radius:8px;padding:10px 14px;font-size:13px;margin:14px 0}
table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:center}
th{background:#f3f4f6;font-weight:600}td.name{text-align:left}
.h0{background:#fff}.h1{background:#eef6ff}.h2{background:#dbeafe}.h3{background:#bfdbfe}
.h4{background:#93c5fd}.h5{background:#60a5fa;color:#fff}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:760px){.grid2{grid-template-columns:1fr}}
.tag{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:999px;padding:1px 9px;font-size:12px;margin:2px}
.k{color:var(--muted);font-size:12px}
</style></head><body><div class="wrap">`)
  h.push('<h1>北师国商 434 真题分析报告</h1>')
  h.push(`<div class="sub">数据范围：${esc(m.data_scope)}。生成工具：dsh-zhenti434（JavaScript 内核）</div>`)
  h.push('<div class="warn"><b>使用声明：</b>本报告为<b>统计描述与概率排序</b>，不是押题。候补清单只表示"历史频次×轮空年数×章权重"的排序，样本量仅 5 年，任何一条都可能不考；请按考纲全面复习。</div>')

  h.push('<h2>一、试卷结构（2022 起固定）</h2>')
  h.push('<div class="card"><table><tr><th>年份</th><th>名解</th><th>简答</th><th>论述</th><th>合计</th></tr>')
  for (const s of m.structure) {
    const n = s.name
    h.push(`<tr><td>${s.year}</td><td>${(n['名解'] || {}).n || 0} 题 / ${(n['名解'] || {}).score || 0} 分</td>` +
      `<td>${(n['简答'] || {}).n || 0} 题 / ${(n['简答'] || {}).score || 0} 分</td>` +
      `<td>${(n['论述'] || {}).n || 0} 问 / ${(n['论述'] || {}).score || 0} 分</td><td>${s.total}</td></tr>`)
  }
  h.push('</table></div>')

  h.push('<h2>二、考纲章分值热力（2022—2026）</h2>')
  h.push('<div class="card"><table><tr><th>考纲章</th>' + years.map((y) => `<th>${y}</th>`).join('') + '<th>五年合计</th><th>年均</th></tr>')
  for (const ch of Object.keys(CHAPTERS)) {
    h.push(`<tr><td class="name">${ch} ${esc(CHAPTERS[ch])}</td>`)
    for (const y of years) {
      const v = heat[ch][y] || 0
      h.push(v ? `<td class="${heatClass(v)}">${v}</td>` : '<td class="h0">-</td>')
    }
    h.push(`<td><b>${m.chapter_total[ch]}</b></td><td>${(m.chapter_total[ch] / 5).toFixed(1)}</td></tr>`)
  }
  h.push('</table></div>')

  h.push('<h2>三、四大模块分值（按卷面完整归位）</h2>')
  h.push('<div class="card"><table><tr><th>年份</th>' + MODULES.map((x) => `<th>${x}</th>`).join('') + '<th>合计</th></tr>')
  for (const y of years) {
    const d = m.module_by_year[y]
    const sum = MODULES.reduce((s, x) => s + (d[x] || 0), 0)
    h.push(`<tr><td>${y}</td>` + MODULES.map((x) => `<td>${d[x] || 0}</td>`).join('') + `<td>${sum}</td></tr>`)
  }
  h.push('<tr><td><b>五年合计</b></td>' + MODULES.map((x) => {
    const sum = years.reduce((s, y) => s + (m.module_by_year[y][x] || 0), 0)
    return `<td><b>${sum}</b></td>`
  }).join('') + '<td><b>750</b></td></tr>')
  h.push('</table></div>')

  h.push('<h3>题型 × 模块（五年合计，分）</h3>')
  h.push('<div class="card"><table><tr><th>题型</th>' + MODULES.map((x) => `<th>${x}</th>`).join('') + '</tr>')
  for (const t of ['名解', '简答', '论述']) {
    h.push(`<tr><td>${t}</td>` + MODULES.map((x) => `<td>${(m.type_module[t] || {})[x] || 0}</td>`).join('') + '</tr>')
  }
  h.push('</table></div>')

  h.push('<h2>四、考点族频次与轮考间隔</h2>')
  h.push('<div class="card"><div class="k">按"考点族"归并同类考点，同族换题型/换角度也计入；"代表设问"列给出具体题。</div>')
  h.push('<table><tr><th>考点族</th><th>考纲章</th><th>现行版式年份</th><th>次数</th><th>间隔</th><th>最近</th><th>代表设问</th></tr>')
  for (const f of m.freq.slice(0, 16)) {
    h.push(`<tr><td class="name">${esc(f.tag)}</td><td>${f.ch}</td><td>${f.years.join('、')}</td><td>${f.count}</td>` +
      `<td>${f.gaps.length ? f.gaps.join('、') : '-'}</td><td>${f.last ?? '-'}</td>` +
      `<td class="name">${esc(f.details.slice(0, 3).join('；'))}</td></tr>`)
  }
  h.push('</table></div>')

  h.push('<h3>重复与换角度重考</h3>')
  h.push(`<div class="card">同一考点族在 2022—2026 重复出现的设问占比：<b>${(m.repeat_rate * 100).toFixed(1)}%</b>（${Math.round(m.repeat_rate * 60)} / 60）。` +
    '<div class="sub">口径：按"考点族"归并，同一族换题型、换角度也计为重复；公式=重复族涉及设问数/现行版式设问数。</div>')
  h.push('<table><tr><th>考点族</th><th>次数</th><th>年份</th><th>代表设问</th></tr>')
  for (const r of m.repeated_tags.slice(0, 12)) {
    h.push(`<tr><td class="name">${esc(r.tag)}</td><td>${r.count}</td><td>${r.years.join('、')}</td><td class="name">${esc(r.details.slice(0, 2).join('；'))}</td></tr>`)
  }
  h.push('</table></div>')

  h.push('<h2>五、章级轮空观察（近两年 vs 五年均值）</h2>')
  h.push('<div class="card"><table><tr><th>考纲章</th><th>五年合计</th><th>年均</th><th>近两年均值</th><th>差（正=近两年偏冷）</th></tr>')
  for (const c of [...m.chapter_recent].sort((a, b) => b.gap - a.gap)) {
    h.push(`<tr><td class="name">${c.ch} ${esc(c.name)}</td><td>${c.total}</td><td>${c.avg}</td><td>${c.recent2}</td><td>${c.gap >= 0 ? '+' : ''}${c.gap}</td></tr>`)
  }
  h.push('</table></div>')

  h.push('<h2>六、2027 候补排序（统计推断，非押题）</h2>')
  h.push('<div class="card"><div class="k">排序公式：出现次数 ×（2027−最近出现年）×（0.5＋该章五年分值权重）×10；只纳入 2024 年及以前出现过、且出现≥2 次的考点族。</div>')
  h.push('<table><tr><th>#</th><th>考点族</th><th>考纲章</th><th>历史年份</th><th>次数</th><th>最近</th><th>得分</th></tr>')
  m.candidates_2027.slice(0, 15).forEach((c, i) => {
    h.push(`<tr><td>${i + 1}</td><td class="name">${esc(c.tag)}</td><td>${c.ch} ${esc(c.chapter_name)}</td>` +
      `<td>${c.years.join('、')}</td><td>${c.count}</td><td>${c.last}</td><td>${c.score.toFixed(1)}</td></tr>`)
  })
  h.push('</table><div class="sub">再次提醒：样本仅 5 年（60 个设问），本表只用于安排复习优先级，不能替代全面覆盖。</div></div>')

  h.push('<h2>七、命题风格画像</h2>')
  h.push('<div class="grid2">')
  h.push('<div class="card"><h3>设问类型</h3><table><tr><th>设问</th><th>次数</th><th>分值</th></tr>')
  for (const a of m.style.ask) h.push(`<tr><td class="name">${esc(a.ask)}</td><td>${a.count}</td><td>${a.score}</td></tr>`)
  h.push('</table></div>')
  h.push(`<div class="card"><h3>结合我国实际类</h3><div style="font-size:28px;font-weight:700">${m.style.cn_questions} 问 / ${m.style.cn_score} 分</div>` +
    '<div class="sub">2024 起每年 2 问、合计 30 分；2026 起转向"路径/影响"式设问，纯理论罗列不得分。</div></div>')
  h.push('</div>')
  h.push('<div class="grid2"><div class="card"><h3>冷门题（每年 1 个）</h3>')
  for (const c of m.style.cold) h.push(`<div><span class="tag">${c.year}</span> ${esc(c.stem)}</div>`)
  h.push('</div><div class="card"><h3>课本外热点</h3>')
  for (const c of m.style.hot) h.push(`<div><span class="tag">${c.year}</span> ${esc(c.stem)}</div>`)
  h.push('</div></div>')

  h.push('<h2>八、数据口径与已知差异</h2>')
  h.push('<div class="card"><ul style="margin:0;padding-left:18px;font-size:13px">' +
    '<li>卷面题与分值以《0820 真题解析》为准，讲义交叉验证。</li>' +
    '<li>论述题按两个小问拆为两条记录（10 分 + 15 分），因此"60 个设问"＝20 名解＋20 简答＋20 论述小问。</li>' +
    '<li>2020—2021 为旧版式，只进入考点年表，不计入分值热力与结构统计。</li>' +
    '<li>热力按"考点标签"计算；改标签后重跑即可更新。</li>' +
    '<li>数据文件：data/questions.jsonl、data/exams.json；指标：metrics.json。</li>' +
    '</ul></div>')
  h.push('</div></body></html>')
  return h.join('\n')
}

export async function analyzeDir(dataDir) {
  const { questions } = await loadData(dataDir)
  const metrics = compute(questions)
  await writeFile(path.join(dataDir, 'metrics.json'), JSON.stringify(metrics, null, 1), 'utf8')
  await writeFile(path.join(dataDir, 'report.html'), renderReport(metrics), 'utf8')
  return metrics
}

export function summarize(m) {
  const chapters = m.chapter_total || {}
  const total = Object.values(chapters).reduce((a, b) => a + b, 0)
  const topChapters = Object.entries(chapters)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([ch, v]) => `第${ch}章${CHAPTERS[ch] ? `（${CHAPTERS[ch]}）` : ''} ${v} 分`).join('；')
  const topTags = (m.freq || []).slice(0, 6)
    .map((f) => `${f.tag}（${f.count} 次，${(f.years || []).join('/')}）`).join('；')
  const candidates = (m.candidates_2027 || []).slice(0, 5)
    .map((c) => `${c.tag}（最近 ${c.last}，得分 ${c.score}）`).join('；')
  const ask = (m.style?.ask || []).slice(0, 4)
    .map((a) => `${a.ask} ${a.count} 次/${a.score} 分`).join('；')
  return [
    `数据范围：${m.data_scope || '—'}`,
    `章合计校验：${total} 分`,
    `分最高的章：${topChapters}`,
    `考点族 Top：${topTags}`,
    `重复率：${Math.round((m.repeat_rate || 0) * 100)}%`,
    `2027 候补（统计推断，非押题）：${candidates || '无'}`,
    `设问结构：${ask}`,
  ].join('\n')
}
