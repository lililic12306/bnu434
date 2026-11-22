/** 构建脚本：把知识库明文加密为 core/data/knowledge.enc（明文不进包） */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encryptBuffer } from '../crypto.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const CONTENT = path.resolve(PKG, '..', '..', 'bnu434_content')
const DATA = path.join(PKG, 'core', 'data')
const FILES = [
  ['knowledge.jsonl', 'knowledge.enc'],
  ['papers.jsonl', 'papers.enc'],
]

for (const [src, out] of FILES) {
  const plain = await readFile(path.join(CONTENT, src))
  await mkdir(DATA, { recursive: true })
  await writeFile(path.join(DATA, out), encryptBuffer(plain))
  console.log('encrypted:', src, '->', out, plain.length, 'bytes')
}
