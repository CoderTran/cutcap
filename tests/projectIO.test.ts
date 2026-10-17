import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyProject } from '@shared/project/factory'
import { readProjectFile, writeProjectFile } from '../src/main/project/projectIO'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cutcap-test-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('projectIO (ghi file thật)', () => {
  it('ghi và đọc lại; ghi đè file cũ; không để lại file .tmp', async () => {
    const file = join(dir, 'Dự án thử.cutcap')
    const p = createEmptyProject('Lần 1')
    await writeProjectFile(file, p)
    await writeProjectFile(file, { ...p, name: 'Lần 2' })

    expect((await readProjectFile(file)).name).toBe('Lần 2')
    expect(await readdir(dir)).toEqual(['Dự án thử.cutcap'])
    expect(await readFile(file, 'utf8')).toContain('\n  "formatVersion"') // JSON có thụt lề, dễ đọc
  })

  it('đọc được file có BOM (đã mở bằng Notepad)', async () => {
    const file = join(dir, 'bom.cutcap')
    await writeFile(file, '﻿' + JSON.stringify(createEmptyProject('BOM')), 'utf8')
    expect((await readProjectFile(file)).name).toBe('BOM')
  })
})
