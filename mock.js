/**
 * bnu434 · 模拟题命题蓝图生成器
 * 按真题章权重抽样，产出命题卡（题型、分值、考纲章、候选考点、命题角度），
 * 并附封装提示词，交给安装者的模型生成试卷与答案。
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadData, compute, CHAPTERS } from './analyzer.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_COUNTS = { 名解: 4, 简答: 4, 论述: 2 }

const COLD_CANDIDATES = [
  '乌普萨拉模型', '莱萨德·洛朗热模型', '管理信息系统与信息管理', '提单',
  '国家的总体吸引力', '经验曲线效应', '国际避税与避税港',
]

const HOT_BY_CHAPTER = {
  1: ['制度型开放', '新质生产力'],
  4: ['数字贸易', '绿色贸易壁垒', '制度型开放'],
  5: ['区域全面经济伙伴关系协定', '制度型开放'],
  9: ['耐心资本'],
  12: ['产业链供应链韧性'],
  13: ['民族品牌国际化', '数字贸易'],
}
const HOT_CANDIDATES = Object.values(HOT_BY_CHAPTER).flat()

const ASK_ANGLES = ['原因', '内容构成', '措施', '效应影响', '必要性/选择']

function cleanName(name) {
  return String(name).replace(/〔[^〕]*〕/g, '').replace(/（拓展）$/, '').trim()
}

function angleFor(name) {
  if (/原因|为何|为什么|成因/.test(name)) return '原因'
  if (/类型|构成|内容|框架|要素|层次|分类|特征/.test(name)) return '内容构成'
  if (/措施|如何|路径|对策|管理|防范|设计/.test(name)) return '措施'
  if (/效应|影响|作用|意义|利弊|优缺点/.test(name)) return '效应影响'
  if (/必要|选择|如何选/.test(name)) return '必要性/选择'
  return '内容构成'
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function weightedPick(items, weights, rnd) {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rnd() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function shuffle(arr, rnd) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function loadTopics(dataDir) {
  const raw = await readFile(path.join(dataDir, 'data', 'topics.jsonl'), 'utf8')
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

function topicScore(t, rnd) {
  let s = 1
  if (t.level && t.level.startsWith('★')) s += 2
  else if (t.level && t.level.startsWith('○')) s += 1
  if (t.source === '补') s -= 1
  return Math.max(0.5, s) * (0.5 + rnd())
}

/**
 * @param {string} dataDir
 * @param {{seed?:number, counts?:object, withPrompt?:boolean}} opts
 */
export async function buildBlueprint(dataDir, opts = {}) {
  const seed = Number.isFinite(opts.seed) ? opts.seed : Math.floor(Math.random() * 1e9)
  const rnd = mulberry32(seed)
  const counts = { ...DEFAULT_COUNTS, ...(opts.counts || {}) }
  const { questions } = await loadData(dataDir)
  const metrics = compute(questions)
  const topics = await loadTopics(dataDir)

  const chapterTotal = metrics.chapter_total
  const chapters = Object.keys(CHAPTERS).map(Number)
  const weights = chapters.map((ch) => Math.max(1, chapterTotal[ch] || 0))
  const byChapter = new Map()
  for (const t of topics) {
    if (!byChapter.has(t.chapter)) byChapter.set(t.chapter, [])
    byChapter.get(t.chapter).push(t)
  }
  const used = new Set()
  const recentItems = questions.filter((q) => q.year >= 2024 && q.format === '现行版式')
  const recentHit = (name) => recentItems.some((q) =>
    q.detail === name || q.detail.includes(name) || name.includes(q.detail) || q.stem.includes(name))


  const chapterUse = new Map()
  const pickChapter = () => {
    for (let i = 0; i < 20; i++) {
      const ch = weightedPick(chapters, weights, rnd)
      if ((chapterUse.get(ch) || 0) < 2) {
        chapterUse.set(ch, (chapterUse.get(ch) || 0) + 1)
        return ch
      }
    }
    const ch = weightedPick(chapters, weights, rnd)
    chapterUse.set(ch, (chapterUse.get(ch) || 0) + 1)
    return ch
  }

  const pickTopic = (ch, filter, excludeCold = true) => {
    let pool = (byChapter.get(ch) || []).filter((t) => !used.has(t.name) && filter(t))
    if (!pool.length) pool = (byChapter.get(ch) || []).filter((t) => !used.has(t.name))
    if (!pool.length) return null
    pool = pool.slice(0, 80)
    const picked = weightedPick(pool, pool.map((t) => topicScore(t, rnd)), rnd)
    used.add(picked.name)
    return picked
  }

  const isColdTopic = (t) => COLD_CANDIDATES.includes(t.name)
  const isHotTopic = (t) => HOT_CANDIDATES.includes(t.name) || t.source === '补'

  const slots = []
  let coldAssigned = false

  // 名词解释
  for (let i = 1; i <= counts['名解']; i++) {
    let ch = pickChapter()
    let t
    let chUsed = ch
    if (!coldAssigned && i === counts['名解']) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const c2 = attempt === 0 ? ch : pickChapter()
        const cands = (byChapter.get(c2) || []).filter((x) => isColdTopic(x) && !used.has(x.name) && !recentHit(x.name))
        if (cands.length) {
          t = cands[Math.floor(rnd() * cands.length)]
          used.add(t.name)
          chUsed = c2
          break
        }
      }
      if (!t) {
        const coldPool = topics.filter((x) => COLD_CANDIDATES.includes(x.name) && !used.has(x.name) && !recentHit(x.name))
        if (coldPool.length) {
          t = coldPool[Math.floor(rnd() * coldPool.length)]
          used.add(t.name)
          chUsed = t.chapter
        } else {
          t = pickTopic(ch, () => true)
          chUsed = ch
        }
      }
      coldAssigned = true
    } else {
      t = pickTopic(ch, (x) => !isColdTopic(x))
    }
    ch = chUsed
    if (!t) continue
    slots.push({
      type: '名词解释', no: i, score: 10, chapter: ch, chapter_name: CHAPTERS[ch],
      topic: cleanName(t.name), level: t.level, exam: t.exam, source: t.source,
      cold: isColdTopic(t),
      hot: false,
      prompt: '按定义—关键要素—一句延伸（作用/分类/评价）组织，不超过 300 字。',
      recent: recentHit(t.name) ? '近三年已考同名考点，需换角度' : '近三年未考',
    })
  }

  // 简答题
  const angles = shuffle(ASK_ANGLES, rnd)
  for (let i = 1; i <= counts['简答']; i++) {
    const ch = pickChapter()
    const t = pickTopic(ch, (x) => x.level && x.level.startsWith('★')) || pickTopic(ch, () => true)
    if (!t) continue
    slots.push({
      type: '简答题', no: i, score: 15, chapter: ch, chapter_name: CHAPTERS[ch],
      topic: cleanName(t.name), level: t.level, exam: t.exam, source: t.source,
      angle: angleFor(t.name),
      cold: false, hot: false,
      prompt: '按指定设问角度分点作答，每点带小标题，450—650 字。',
      recent: recentHit(t.name) ? '近三年已考，建议换角度' : '近三年未考',
    })
  }

  // 论述题（每题 10+15 两小问）
  for (let i = 1; i <= counts['论述']; i++) {
    const ch = pickChapter()
    const t = pickTopic(ch, (x) => x.level && x.level.startsWith('★')) || pickTopic(ch, () => true)
    if (!t) continue
    const withHot = i === counts['论述']
    const hotPool = HOT_BY_CHAPTER[ch] || []
    const hotTopic = withHot && hotPool.length ? hotPool[Math.floor(rnd() * hotPool.length)] : ''
    slots.push({
      type: '论述题', no: i, score: 25, chapter: ch, chapter_name: CHAPTERS[ch],
      topic: cleanName(t.name), level: t.level, exam: t.exam, source: t.source,
      cold: false,
      hot: !!hotTopic,
      hotTopic,
      sub1: `（1）${cleanName(t.name)}：教材默写（10 分，定义—分类—要点）`,
      sub2: `（2）结合我国实际，说明${cleanName(t.name)}相关的商务实践问题（15 分，${hotTopic ? '热点位：' + hotTopic + '；' : ''}我国现状—路径/影响—结论）`,
      prompt: '小问 1 按教材框架默写；小问 2 必须落到我国企业或政策实践，550—800 字。',
      recent: recentHit(t.name) ? '近三年已考，需换角度与设问' : '近三年未考',
    })
  }

  const totalScore = slots.reduce((s, x) => s + x.score, 0)
  const lines = []
  lines.push(`# 模拟题命题蓝图（seed=${seed}）`)
  lines.push('')
  lines.push(`- 结构：名词解释 ${counts['名解']}×10 ＋ 简答题 ${counts['简答']}×15 ＋ 论述题 ${counts['论述']}×25，合计 ${totalScore} 分`)
  lines.push(`- 章分布：${slots.map((s) => `第${s.chapter}章`).join('、')}`)
  lines.push(`- 冷门位：${slots.filter((s) => s.cold).map((s) => s.topic).join('、') || '无'}`)
  lines.push(`- 热点位：${slots.filter((s) => s.hot).map((s) => s.hotTopic || s.topic).join('、') || '无'}`)
  lines.push('')
  lines.push('## 命题卡')
  for (const s of slots) {
    if (s.type === '论述题') {
      lines.push(`- 论述题 ${s.no}（25 分）｜第${s.chapter}章 ${s.chapter_name}｜考点：${s.topic}（${s.level || ''}，${s.source || ''}）`)
      lines.push(`  - ${s.sub1}`)
      lines.push(`  - ${s.sub2}`)
      lines.push(`  - 提示：${s.prompt}；真题情况：${s.recent}`)
    } else {
      lines.push(`- ${s.type} ${s.no}（${s.score} 分）｜第${s.chapter}章 ${s.chapter_name}｜考点：${s.topic}（${s.level || ''}，${s.source || ''}）` +
        `${s.angle ? '｜设问角度：' + s.angle : ''}${s.cold ? '｜冷门位' : ''}${s.hot ? '｜热点位' : ''}`)
      lines.push(`  - 提示：${s.prompt}；真题情况：${s.recent}`)
    }
  }

  let promptText = ''
  if (opts.withPrompt !== false) {
    try {
      promptText = await readFile(path.join(HERE, 'prompts', 'mock-exam.md'), 'utf8')
    } catch {
      promptText = ''
    }
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('## 封装提示词（交给模型生成试卷与答案）')
    lines.push('')
    lines.push(promptText || '（提示词文件缺失）')
  }

  return { seed, counts, totalScore, slots, text: lines.join('\n') }
}

