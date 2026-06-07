import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = dirname(dirname(fileURLToPath(import.meta.url)))
const redirectsPath = join(frontendDir, 'dist', '_redirects')

try {
  await rm(redirectsPath, { force: true })
  console.log('Removed dist/_redirects for Cloudflare Workers Assets deployment.')
} catch (error) {
  console.error(`Failed to remove ${redirectsPath}:`, error)
  process.exitCode = 1
}
