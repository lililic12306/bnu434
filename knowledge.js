/** bnu434 · 知识库加载与检索（支持明文 jsonl 与加密 enc） */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { readEncryptedText } from './crypto.js'

export async function loadKnowledge(dataDir) {
  const plain = path.join(dataDir, 'data', 'knowledge.jsonl')
  try {
    const raw = await readFile(plain, 'utf8')
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch {
    // 没有明文时读取加密文件
  }
  const enc = path.join(dataDir, 'data', 'knowledge.enc')
  const txt = await readEncryptedText(enc)
  return txt.split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

function score(row, q) {
  const name = row.name || ''
  const text = [name, row.summary, (row.outline || []).join(' '), row.key_points, row.exam_analysis].join(' ')
  if (name === q) return 100
  if (name.includes(q)) return 60
  if (text.includes(q)) return 30
  return 0
}

export function searchKnowledge(rows, opts = {}) {
  const q = (opts.query || '').trim()
  const chapter = Number.isInteger(opts.chapter) ? opts.chapter : null
  const level = (opts.level || '').trim()
  let list = rows.filter((r) => {
    if (chapter && r.chapter !== chapter) return false
    if (level && !String(r.level || '').startsWith(level)) return false
    if (q) return score(r, q) > 0
    return true
  })
  if (q) {
    list = list.map((r) => ({ r, s: score(r, q) })).sort((a, b) => b.s - a.s).map((x) => x.r)
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 5, 1), 20)
  return list.slice(0, limit)
}

export function formatEntry(r) {
  return [
    `## ${r.id} ${r.name}（第${r.chapter}章 ${r.chapter_name || ''}｜${r.level || ''}｜${r.source || ''}）`,
    `**定义**：${r.summary}`,
    '**提纲**：',
    ...(r.outline || []).map((x) => `- ${x}`),
    `**要点**：${r.key_points}`,
    `**真题考法**：${r.exam_analysis}`,
  ].join('\n')
}


export async function loadPapers(dataDir) {
  const plain = path.join(dataDir, 'data', 'papers.jsonl')
  try {
    const raw = await readFile(plain, 'utf8')
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch {
    // 没有明文时读取加密文件
  }
  const enc = path.join(dataDir, 'data', 'papers.enc')
  const txt = await readEncryptedText(enc)
  return txt.split('\n').filter(Boolean).map((l) => JSON.parse(l))
}
