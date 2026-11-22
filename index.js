/**
 * bnu434 · 北师大 434 国际商务真题分析与模拟题工具（Host 半）
 * 工具：zhenti_analyze / zhenti_report / zhenti_tag
 * 数据：首次运行从包内 core/data 复制到用户数据目录（默认 ~/.dsh/bnu434-data）
 * 内核：analyzer.js（纯 JavaScript，无 Python 依赖）
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAPTERS, ensureDataDir, analyzeDir, summarize } from './analyzer.js'
import { buildBlueprint } from './mock.js'
import { loadKnowledge, loadPapers, searchKnowledge, formatEntry } from './knowledge.js'
import { sampleExam, buildAiPrompt, parseAiText } from './drill.js'

export const name = 'bnu434'
export const inject = ['tools']

const PKG_DIR = path.dirname(fileURLToPath(import.meta.url))
const BUNDLED_CORE = path.join(PKG_DIR, 'core')

function resolveDataDir(config, argDir) {
  if (argDir) return path.resolve(argDir)
  if (config && config.dataDir) return path.resolve(config.dataDir)
  if (process.env.ZHENTI434_DIR) return path.resolve(process.env.ZHENTI434_DIR)
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'bnu434-data')
}

async function prepare(config, argDir) {
  const dir = resolveDataDir(config, argDir)
  await ensureDataDir(BUNDLED_CORE, dir)
  return dir
}

function tool(options) {
  const required = Object.entries(options.parameters)
    .filter(([, v]) => v.required === true)
    .map(([k]) => k)
  const properties = {}
  for (const [k, v] of Object.entries(options.parameters)) {
    const { required: _r, ...rest } = v
    properties[k] = rest
  }
  return {
    name: options.name,
    description: options.description,
    parameters: {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: options.execute,
  }
}

const dataDirParam = {
  type: 'string',
  description: '数据目录的绝对路径；缺省为 config.dataDir、环境变量 ZHENTI434_DIR，或 ~/.dsh/bnu434-data。',
}

let llmService = null
let defaultModelService = null
const aiJobs = new Map()
let aiJobSeq = 0

function listProviderIds() {
  try {
    const ps = llmService && typeof llmService.listProviders === 'function' ? llmService.listProviders() : []
    const ids = []
    for (const p of ps || []) {
      if (typeof p === 'string') ids.push(p)
      else if (p && typeof p === 'object') {
        const id = p.id || p.provider || p.name
        if (typeof id === 'string') ids.push(id)
      }
    }
    return ids
  } catch {
    return []
  }
}

async function pickModel(provider) {
  try {
    if (!llmService || typeof llmService.listModels !== 'function') return null
    const ms = await llmService.listModels(provider)
    for (const m of ms || []) {
      if (typeof m === 'string') return m
      if (m && typeof m === 'object') {
        const id = m.id || m.model || m.name
        if (typeof id === 'string') return id
      }
    }
  } catch { /* 忽略 */ }
  return null
}

function preferredSelection(config) {
  if (config && config.provider && config.model) return { provider: config.provider, model: config.model }
  try {
    if (defaultModelService && typeof defaultModelService.currentSelection === 'function') {
      const sel = defaultModelService.currentSelection()
      if (sel && sel.provider && sel.model) return { provider: sel.provider, model: sel.model }
    }
  } catch { /* 忽略 */ }
  return null
}

async function aiGenerate(config, text, onDelta) {
  if (!llmService) throw new Error('当前 DSH 环境未提供模型服务，无法使用在线模式')
  const messages = [{ role: 'user', content: [{ type: 'text', text }] }]

  const tried = []
  const candidates = []
  const seen = new Set()
  const push = (provider, model) => {
    if (!provider || seen.has(provider + '|' + (model || ''))) return
    seen.add(provider + '|' + (model || ''))
    candidates.push({ provider, model })
  }
  const sel = preferredSelection(config)
  if (sel) push(sel.provider, sel.model)
  const ids = listProviderIds()
  const ordered = [
    ...ids.filter((id) => /account/i.test(id)),
    ...ids.filter((id) => !/account/i.test(id)),
  ]
  for (const pid of ordered) push(pid, null)
  if (!candidates.length) push('deepseek-account', 'deepseek-flash')

  let lastFailure = null
  for (const cand of candidates) {
    const provider = cand.provider
    const model = cand.model || (await pickModel(provider)) || 'deepseek-flash'
    let out = ''
    let failure = null
    let finish = null
    try {
      for await (const ev of llmService.stream({ provider, model, messages })) {
        const ch = ev && ev.chunk ? ev.chunk : ev
        if (!ch) continue
        const type = ch.type || ch.kind
        if (type === 'text-delta' && typeof ch.text === 'string') {
          out += ch.text
          if (typeof onDelta === 'function') onDelta(ch.text)
        }
        if (type === 'finish') {
          finish = ch
          if (ch.reason && ch.reason.kind && ch.reason.kind !== 'done' && ch.reason.failure) failure = ch.reason.failure
        }
      }
    } catch (err) {
      failure = { code: 'THROWN', message: String((err && err.message) || err) }
    }
    if (failure) {
      const code = failure.code || 'unknown'
      tried.push(provider + '/' + model + ' → ' + code)
      lastFailure = failure
      if (['MISSING_CREDENTIAL', 'AUTH', 'NO_ADAPTER', 'INVALID_CREDENTIAL'].includes(code)) continue
      throw new Error('模型调用失败：' + code + ' ' + (failure.message || '') + '（' + provider + '/' + model + '）')
    }
    if (out.trim()) return out
    tried.push(provider + '/' + model + ' → 空响应')
    lastFailure = { code: 'EMPTY', message: 'finish=' + JSON.stringify(finish).slice(0, 160) }
  }
  throw new Error('模型调用失败：已尝试 ' + candidates.length + ' 个提供方/模型组合，均不可用：' + tried.join('；') + '；最后错误：' + (lastFailure ? lastFailure.code + ' ' + (lastFailure.message || '') : '未知'))
}

export function apply(ctx, config) {
  ctx.tools.register(tool({
    name: 'zhenti_analyze',
    description: '运行北师国商 434 真题分析：重建 metrics.json 与 report.html，返回关键指标摘要。数据缺省自动初始化。',
    parameters: { dataDir: dataDirParam },
    async execute(args) {
      const dir = await prepare(config, args.dataDir)
      const metrics = await analyzeDir(dir)
      return `${summarize(metrics)}\n\n输出：${path.join(dir, 'report.html')}`
    },
  }))

  ctx.tools.register(tool({
    name: 'zhenti_report',
    description: '生成并返回 434 真题分析报告：报告文件路径与指标摘要（报告为离线可开 HTML）。',
    parameters: {
      dataDir: dataDirParam,
      refresh: { type: 'boolean', description: '是否先重建数据与报告；默认 true。' },
    },
    async execute(args) {
      const dir = await prepare(config, args.dataDir)
      let metrics
      if (args.refresh === false) {
        metrics = JSON.parse(await readFile(path.join(dir, 'metrics.json'), 'utf8'))
      } else {
        metrics = await analyzeDir(dir)
      }
      return `报告文件：${path.join(dir, 'report.html')}\n\n${summarize(metrics)}`
    },
  }))

  ctx.tools.register(tool({
    name: 'zhenti_tag',
    description: '修改一道真题的考纲章标签并重算报告，用于修正统计口径（可审计）。',
    parameters: {
      questionId: { type: 'string', required: true, description: '题目 id，例如 2023-S2。' },
      chapter: { type: 'integer', required: true, description: '考纲章号 1—15。' },
      dataDir: dataDirParam,
    },
    async execute(args) {
      const ch = Number(args.chapter)
      if (!Number.isInteger(ch) || ch < 1 || ch > 15) throw new Error('chapter 必须是 1—15 的整数')
      const dir = await prepare(config, args.dataDir)
      const file = path.join(dir, 'data', 'questions.jsonl')
      const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean)
      let hit = null
      const out = lines.map((line) => {
        const rec = JSON.parse(line)
        if (rec.id === args.questionId) {
          rec.chapter = ch
          rec.chapter_name = CHAPTERS[ch]
          hit = rec
        }
        return JSON.stringify(rec)
      })
      if (!hit) throw new Error(`未找到题目 id：${args.questionId}`)
      await writeFile(file, out.join('\n') + '\n', 'utf8')
      await analyzeDir(dir)
      return `已修改 ${args.questionId}：${hit.stem} → 第${ch}章 ${CHAPTERS[ch]}。报告已重算。`
    },
  }))

  ctx.tools.register(tool({
    name: 'zhenti_mock',
    description: '生成模拟题命题蓝图与封装提示词：按真题章权重随机抽题，输出题型、分值、考纲章、候选考点与命题角度，并附写作提示词，由当前模型据此生成试卷与答案。',
    parameters: {
      seed: { type: 'integer', description: '随机种子；相同种子生成同一套蓝图，便于复现。' },
      mingjie: { type: 'integer', description: '名词解释题数，默认 4。' },
      jianda: { type: 'integer', description: '简答题数，默认 4。' },
      lunshu: { type: 'integer', description: '论述题大题数，默认 2（每题两小问 10+15）。' },
      withPrompt: { type: 'boolean', description: '是否附封装提示词，默认 true。' },
      dataDir: dataDirParam,
    },
    async execute(args) {
      const dir = await prepare(config, args.dataDir)
      const counts = {}
      if (Number.isInteger(args.mingjie)) counts['名解'] = args.mingjie
      if (Number.isInteger(args.jianda)) counts['简答'] = args.jianda
      if (Number.isInteger(args.lunshu)) counts['论述'] = args.lunshu
      const bp = await buildBlueprint(dir, {
        seed: args.seed,
        counts,
        withPrompt: args.withPrompt !== false,
      })
      return bp.text
    },
  }))

  ctx.tools.register(tool({
    name: 'zhenti_search',
    description: '检索 434 知识点库（888 条，含 370 ★；四段式：定义、提纲、要点、真题考法）；可按关键词、考纲章、层级筛选。',
    parameters: {
      query: { type: 'string', description: '关键词，如 乌普萨拉、五力、区域一体化；为空则按章/层级列出。' },
      chapter: { type: 'integer', description: '考纲章号 1—15；可选。' },
      level: { type: 'string', description: '层级筛选，★ 或 ○ 或 ·；可选。' },
      limit: { type: 'integer', description: '返回条数，默认 5，最多 20。' },
      dataDir: dataDirParam,
    },
    async execute(args) {
      const dir = await prepare(config, args.dataDir)
      const rows = await loadKnowledge(dir)
      const hits = searchKnowledge(rows, args)
      if (!hits.length) return '未找到匹配的知识点。可换关键词，或按章号检索。'
      return `共 ${hits.length} 条：\n\n` + hits.map(formatEntry).join('\n\n---\n\n')
    },
  }))

  ctx.inject(['llm'], (c) => {
    try { llmService = c.get('llm') } catch { /* 无模型服务 */ }
  })
  ctx.inject(['agentDefaultModel'], (c) => {
    try { defaultModelService = c.get('agentDefaultModel') } catch { /* 无默认模型服务 */ }
  })

  ctx.tools.register(tool({
    name: 'zhenti_ai_probe',
    description: '诊断在线 AI 模式：逐个尝试可用的模型提供方与模型，返回成功文本或失败原因，用于排查在线生成问题。',
    parameters: {},
    async execute() {
      const lines = []
      if (!llmService) {
        lines.push('llmService: 未注入')
        return lines.join('\n')
      }
      lines.push('llmService: 已注入')
      try {
        const sel = preferredSelection(config)
        lines.push('默认选择: ' + (sel ? sel.provider + '/' + sel.model : '无'))
      } catch { lines.push('默认选择: 读取失败') }
      let ids = []
      try { ids = listProviderIds() } catch { ids = [] }
      lines.push('已注册提供方: ' + (ids.join(', ') || '无'))
      const candidates = []
      const seen = new Set()
      const push = (provider, model) => {
        if (!provider) return
        const key = provider + '|' + (model || '')
        if (seen.has(key)) return
        seen.add(key)
        candidates.push({ provider, model })
      }
      const sel = preferredSelection(config)
      if (sel) push(sel.provider, sel.model)
      for (const id of ids) push(id, null)
      if (!candidates.length) push('deepseek-account', 'deepseek-flash')
      const messages = [{ role: 'user', content: [{ type: 'text', text: '请只回复四个字：测试成功' }] }]
      for (const cand of candidates.slice(0, 6)) {
        const provider = cand.provider
        const model = cand.model || (await pickModel(provider)) || 'deepseek-flash'
        let out = ''
        let failure = null
        try {
          for await (const ev of llmService.stream({ provider, model, messages })) {
            const ch = ev && ev.chunk ? ev.chunk : ev
            if (!ch) continue
            const type = ch.type || ch.kind
            if (type === 'text-delta' && typeof ch.text === 'string') out += ch.text
            if (type === 'finish' && ch.reason && ch.reason.kind && ch.reason.kind !== 'done' && ch.reason.failure) failure = ch.reason.failure
          }
        } catch (err) {
          failure = { code: 'THROWN', message: String((err && err.message) || err) }
        }
        if (failure) lines.push(provider + '/' + model + ' → 失败 ' + (failure.code || '?') + ' ' + (failure.message || ''))
        else lines.push(provider + '/' + model + ' → ' + (out.trim() ? '成功：' + out.trim().slice(0, 40) : '空响应'))
        if (out.trim() && !failure) break
      }
      return lines.join('\n')
    },
  }))

  // 面板数据接口（本地、仅当前 DSH 会话可用）
  ctx.inject(['connection'], (c) => {
    const connection = c.get('connection')
    if (!connection || !connection.fetch || typeof connection.fetch.register !== 'function') return
    const register = (routePath, label, fetch) => c.effect(() => connection.fetch.register({
      path: routePath,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch,
    }), label)

    register('/api/bnu434/summary', 'bnu434: summary route', async () => {
      const dir = await prepare(config)
      let metrics
      try {
        metrics = JSON.parse(await readFile(path.join(dir, 'metrics.json'), 'utf8'))
      } catch {
        metrics = await analyzeDir(dir)
      }
      const heat = metrics.heat || {}
      const first = heat[Object.keys(heat)[0]] || {}
      return Response.json({
        ok: true,
        value: {
          dataScope: metrics.data_scope,
          years: Object.keys(first),
          chapters: metrics.chapter_total,
          heat,
          chapterNames: CHAPTERS,
          repeatRate: metrics.repeat_rate,
          candidates: (metrics.candidates_2027 || []).slice(0, 8),
          reportPath: path.join(dir, 'report.html'),
        },
      })
    })

    register('/api/bnu434/knowledge', 'bnu434: knowledge route', async () => {
      const dir = await prepare(config)
      const rows = await loadKnowledge(dir)
      return Response.json({ ok: true, value: { total: rows.length, entries: rows } })
    })

    register('/api/bnu434/papers', 'bnu434: papers route', async () => {
      const dir = await prepare(config)
      const rows = await loadPapers(dir)
      return Response.json({ ok: true, value: { total: rows.length, entries: rows } })
    })

    register('/api/bnu434/drill', 'bnu434: drill route', async (req) => {
      let body = {}
      try { body = await req.json() } catch { body = {} }
      const dir = await prepare(config)
      const rows = await loadKnowledge(dir)
      const sample = await sampleExam(dir, rows, {
        seed: Number.isInteger(body.seed) ? body.seed : undefined,
        chapters: Array.isArray(body.chapters) ? body.chapters : [],
        mingjie: Number.isInteger(body.mingjie) ? body.mingjie : 0,
        jianda: 0,
        lunshu: 0,
      })
      return Response.json({ ok: true, value: { seed: sample.seed, items: sample.items } })
    })

    register('/api/bnu434/exam', 'bnu434: exam route', async (req) => {
      try {
        let body = {}
        try { body = await req.json() } catch { body = {} }
        const dir = await prepare(config)
        const rows = await loadKnowledge(dir)
        const sample = await sampleExam(dir, rows, {
          seed: Number.isInteger(body.seed) ? body.seed : undefined,
          chapters: Array.isArray(body.chapters) ? body.chapters : [],
          mingjie: Number.isInteger(body.mingjie) ? body.mingjie : 4,
          jianda: Number.isInteger(body.jianda) ? body.jianda : 4,
          lunshu: Number.isInteger(body.lunshu) ? body.lunshu : 2,
        })
        if (body.mode === 'ai') {
          const jobId = 'ai-' + (++aiJobSeq)
          const job = { status: 'running', text: '', error: '', createdAt: Date.now() }
          aiJobs.set(jobId, job)
          ;(async () => {
            try {
              const prompt = await buildAiPrompt(dir, sample)
              await aiGenerate(config, prompt, (delta) => { job.text += delta; job.updatedAt = Date.now() })
              job.status = 'done'
            } catch (err) {
              job.status = 'error'
              job.error = String((err && err.message) || err)
            }
          })()
          const clean = () => {
            const now = Date.now()
            for (const [id, job] of aiJobs) if (now - job.createdAt > 30 * 60 * 1000) aiJobs.delete(id)
          }
          clean()
          return Response.json({ ok: true, value: { mode: 'ai', jobId, seed: sample.seed } })
        }
        return Response.json({ ok: true, value: { mode: 'offline', seed: sample.seed, totalScore: sample.totalScore, items: sample.items } })
      } catch (err) {
        const message = String((err && err.message) || err || '未知错误')
        return Response.json({ ok: false, error: { code: 'bnu434/exam', message } }, { status: 200 })
      }
    })

    register('/api/bnu434/save', 'bnu434: save route', async (req) => {
      let body = {}
      try { body = await req.json() } catch { body = {} }
      const content = String(body.content || '')
      if (!content.trim()) throw new Error('内容为空，未保存')
      if (content.length > 2 * 1024 * 1024) throw new Error('内容超过 2MB，未保存')
      const dir = await prepare(config)
      const outDir = path.join(dir, 'exports')
      await mkdir(outDir, { recursive: true })
      let name = path.basename(String(body.filename || 'bnu434-export.md')).replace(/[^0-9A-Za-z\u4e00-\u9fa5._-]/g, '_')
      if (!name.toLowerCase().endsWith('.md')) name += '.md'
      const file = path.join(outDir, name)
      await writeFile(file, content, 'utf8')
      return Response.json({ ok: true, value: { path: file } })
    })

    register('/api/bnu434/exam/status', 'bnu434: exam status route', async (req) => {
      let body = {}
      try { body = await req.json() } catch { body = {} }
      const job = aiJobs.get(body.jobId)
      if (!job) return Response.json({ ok: true, value: { status: 'missing' } })
      const items = job.status === 'done' ? parseAiText(job.text) : []
      return Response.json({ ok: true, value: { status: job.status, text: job.text, items, error: job.error } })
    })
  })
}
