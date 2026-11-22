/**
 * bnu434 · 抽背 / 模考 出题内核（离线）
 * - 抽背：从知识点库随机抽题，答案直接用知识库内容（要点版）
 * - 模考：随机抽题 + 热点，离线给要点版；在线模式由 Host 调模型写完整答案
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadData, compute } from './analyzer.js'

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

const HERE = path.dirname(fileURLToPath(import.meta.url))

export async function loadHotTopics(dataDir) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, 'data', 'hot.json'), 'utf8'))
  } catch {
    return []
  }
}

export function questionFor(entry, qtype) {
  const name = entry.name
  if (qtype === '名词解释') return '请解释：' + name
  if (qtype === '简答题') {
    if (/类型|构成|分类|层次|内容|框架/.test(name)) return '简述' + name + '的主要内容。'
    if (/原因|动因|为什么|为何/.test(name)) return '分析' + name + '的主要原因。'
    if (/措施|路径|对策|如何/.test(name)) return '说明' + name + '的主要做法。'
    if (/影响|效应|作用|意义/.test(name)) return '分析' + name + '的影响。'
    return '简述' + name + '的主要内容。'
  }
  return '论述' + name + '的基本内容与要点。'
}

export function answerFor(entry) {
  return [
    '【参考答案（要点版）】',
    entry.summary || '',
    '要点：',
    ...(entry.outline || []).map((x) => '· ' + x),
    entry.key_points ? '易错与得分点：' + entry.key_points : '',
    entry.exam_analysis ? '真题考法：' + entry.exam_analysis : '',
  ].filter(Boolean).join('\n')
}

export async function sampleExam(dataDir, rows, opts = {}) {
  const seed = Number.isInteger(opts.seed) ? opts.seed : Math.floor(Math.random() * 1e9)
  const rnd = mulberry32(seed)
  const chapters = Array.isArray(opts.chapters) ? opts.chapters.filter((c) => c >= 1 && c <= 15) : []
  const counts = {
    名词解释: Number.isInteger(opts.mingjie) ? opts.mingjie : 4,
    简答题: Number.isInteger(opts.jianda) ? opts.jianda : 4,
    论述题: Number.isInteger(opts.lunshu) ? opts.lunshu : 2,
  }
  const scores = { 名词解释: 10, 简答题: 15, 论述题: 25 }

  const { questions } = await loadData(dataDir)
  const metrics = compute(questions)
  const hot = await loadHotTopics(dataDir)
  const byChapter = new Map()
  for (const r of rows) {
    if (chapters.length && !chapters.includes(r.chapter)) continue
    if (!byChapter.has(r.chapter)) byChapter.set(r.chapter, [])
    byChapter.get(r.chapter).push(r)
  }
  const poolChapters = Array.from(byChapter.keys())
  if (!poolChapters.length) throw new Error('所选章节没有知识点')
  const weights = poolChapters.map((c) => (chapters.length ? 1 : Math.max(1, (metrics.chapter_total || {})[c] || 0)))
  const used = new Set()
  const chapterUse = new Map()

  const pickEntry = (qtype) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      let ch
      if (chapters.length) ch = chapters[Math.floor(rnd() * chapters.length)]
      else {
        ch = weightedPick(poolChapters, weights, rnd)
        if ((chapterUse.get(ch) || 0) >= 2) ch = poolChapters[Math.floor(rnd() * poolChapters.length)]
      }
      const pool = (byChapter.get(ch) || []).filter((r) => !used.has(r.id) && (qtype !== '简答题' || String(r.level || '').startsWith('★')))
      if (!pool.length) continue
      const r = pool[Math.floor(rnd() * pool.length)]
      used.add(r.id)
      chapterUse.set(ch, (chapterUse.get(ch) || 0) + 1)
      return r
    }
    const rest = rows.filter((r) => !used.has(r.id) && (!chapters.length || chapters.includes(r.chapter)))
    if (!rest.length) return null
    const r = rest[Math.floor(rnd() * rest.length)]
    used.add(r.id)
    return r
  }

  const items = []
  let no = 0
  for (const qtype of ['名词解释', '简答题', '论述题']) {
    for (let i = 0; i < counts[qtype]; i++) {
      const entry = pickEntry(qtype)
      if (!entry) break
      no += 1
      const hotMatch = hot.filter((x) => (x.chapters || []).includes(entry.chapter))
      items.push({
        no,
        type: qtype,
        score: scores[qtype],
        chapter: entry.chapter,
        chapter_name: entry.chapter_name,
        name: entry.name,
        stem: qtype === '论述题'
          ? '（1）' + questionFor(entry, '论述题') + '（10分）\n（2）结合我国实际，分析' + (hotMatch[0] ? hotMatch[0].name + '背景下' : '') + entry.name + '相关的商务实践问题。（15分）'
          : questionFor(entry, qtype),
        entry,
        hot: hotMatch[0] || null,
        answer: answerFor(entry),
      })
    }
  }
  return { seed, chapters, counts, totalScore: items.reduce((s, x) => s + x.score, 0), items }
}

export async function buildAiPrompt(dataDir, sample) {
  let style = ''
  try {
    style = await readFile(path.join(HERE, 'prompts', 'mock-exam.md'), 'utf8')
  } catch {
    style = ''
  }
  const lines = []
  lines.push('请依据下面的封装提示词，命题并写出完整试卷与参考答案。')
  lines.push('')
  lines.push(style)
  lines.push('')
  lines.push('## 本次抽到的知识点（必须按这些考点命题，不得自行换题）')
  sample.items.forEach((it, i) => {
    const e = it.entry
    lines.push(`### ${i + 1}. ${e.id} ${e.name}（第${e.chapter}章 ${e.chapter_name || ''}）`)
    lines.push('定义：' + e.summary)
    lines.push('提纲：')
    ;(e.outline || []).forEach((x) => lines.push('- ' + x))
    lines.push('要点：' + e.key_points)
    lines.push('真题考法：' + e.exam_analysis)
    lines.push('')
  })
  const hotList = sample.items.map((x) => x.hot).filter(Boolean)
  if (hotList.length) {
    lines.push('## 热点素材（论述第二小问使用）')
    const seen = new Set()
    for (const h of hotList) {
      if (seen.has(h.id)) continue
      seen.add(h.id)
      lines.push(`### ${h.name}（关联第${h.chapters.join('、')}章）`)
      lines.push('含义：' + h.meaning)
      lines.push('我国现状：')
      ;(h.china || []).forEach((x) => lines.push('- ' + x))
      lines.push('可考角度：' + (h.angles || []).join('；'))
      lines.push('')
    }
  }
  lines.push('## 输出要求')
  lines.push('- 按封装提示词的题量输出：名解 ' + sample.counts['名词解释'] + '×10、简答 ' + sample.counts['简答题'] + '×15、论述 ' + sample.counts['论述题'] + '×(10+15)，合计 ' + sample.totalScore + ' 分；')
  lines.push('- 严格逐题输出：每题一个二级标题（如 ## 第1题 名词解释（10分）），标题下依次写 题目、参考答案、考点分析、答题思路 四段；不要单独列试卷、不要把答案集中放在最后；')
  lines.push('- 15 分小问必须结合我国实际，使用上面热点素材，不得编造数据；')
  lines.push('- 不使用双引号、不写页码、不使用英文缩写、不出现编者口吻。')
  return lines.join('\n')
}


/** 把 AI 逐题输出解析为结构化题目；解析失败返回空数组 */
export function parseAiText(text) {
  if (!text) return []
  const parts = String(text).split(/\n(?=##\s)/)
  const items = []
  for (const part of parts) {
    const m = part.match(/^##\s+(.+?)\s*\n([\s\S]*)$/)
    if (!m) continue
    const title = m[1].trim()
    if (!/题|名词解释|简答|论述/.test(title)) continue
    const body = m[2]
    const pick = (label, nextLabels) => {
      const i = body.indexOf(label)
      if (i < 0) return ''
      let j = body.indexOf('：', i)
      if (j < 0) j = body.indexOf(':', i)
      if (j < 0) return ''
      let start = j + 1
      let end = body.length
      for (const nl of nextLabels) {
        const k = body.indexOf(nl, start)
        if (k >= 0) end = Math.min(end, k)
      }
      return body.slice(start, end).replace(/^[\s*]+|[\s*]+$/g, '').trim()
    }
    const item = {
      title,
      question: pick('题目', ['参考答案', '考点分析', '答题思路']),
      answer: pick('参考答案', ['考点分析', '答题思路']),
      analysis: pick('考点分析', ['答题思路']),
      approach: pick('答题思路', []),
    }
    if (item.question || item.answer) items.push(item)
  }
  return items
}
