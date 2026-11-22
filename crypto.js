/**
 * bnu434 · 内容简单加密（AES-256-GCM，统一密钥）
 * 说明：密钥内置，只能挡住直接翻文件的复制，不能抵御逆向；用于内容轻度保护。
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const MAGIC = Buffer.from('BNU434v1', 'ascii')
const KEY = createHash('sha256').update('bnu434-content-2026').digest()

export function encryptBuffer(plain) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([MAGIC, iv, tag, body])
}

export function decryptBuffer(data) {
  if (data.length < 8 + 12 + 16 || !data.subarray(0, 8).equals(MAGIC)) {
    throw new Error('不是有效的加密内容文件')
  }
  const iv = data.subarray(8, 20)
  const tag = data.subarray(20, 36)
  const body = data.subarray(36)
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()])
}

export async function readEncryptedText(file) {
  return decryptBuffer(await readFile(file)).toString('utf8')
}
