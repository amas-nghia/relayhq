import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

import { createError, defineEventHandler, readFormData } from 'h3'

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
}

export default defineEventHandler(async (event) => {
  const formData = await readFormData(event)
  const file = formData.get('file')

  if (!(file instanceof File)) {
    throw createError({ statusCode: 400, statusMessage: 'Avatar file is required.' })
  }

  if (!file.type.startsWith('image/')) {
    throw createError({ statusCode: 400, statusMessage: 'Avatar must be an image file.' })
  }

  const cwd = process.cwd()
  const repoRoot = basename(cwd) === 'app' ? join(cwd, '..') : cwd
  const assetDir = join(repoRoot, 'web', 'public', 'assets', 'agents')
  await mkdir(assetDir, { recursive: true })

  const extension = MIME_TO_EXTENSION[file.type] ?? extname(file.name) ?? '.png'
  const fileName = `agent-avatar-${randomUUID()}${extension.startsWith('.') ? extension : `.${extension}`}`
  const filePath = join(assetDir, fileName)

  await writeFile(filePath, Buffer.from(await file.arrayBuffer()))

  return {
    path: `/assets/agents/${fileName}`,
    fileName,
    contentType: file.type,
  }
})
