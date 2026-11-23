#!/usr/bin/env node
/**
 * Foldframe Host Local Bridge
 *
 * Runs on macOS host (loopback only, token-authenticated) so Dockerized
 * `aitoearn-ai` can invoke local CLI engines (`agy`, `codex`, `dreamina`,
 * `grok`, `workbuddy`), including native Agent runs with Foldframe MCP tools.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

const HOST = process.env.LOCAL_BRIDGE_HOST || '127.0.0.1'
const PORT = Number.parseInt(process.env.LOCAL_BRIDGE_PORT || '18787', 10)
const TOKEN = (process.env.LOCAL_BRIDGE_TOKEN || '').trim()
const LOCAL_WEB_PORT = Number.parseInt(process.env.LOCAL_WEB_PORT || '8080', 10)
const DATA_DIR = resolve(process.env.FOLDFRAME_DATA_DIR || join(REPO_ROOT, '.local-run', 'bridge'))
const WORKBUDDY_HOME = resolve(process.env.FOLDFRAME_WORKBUDDY_HOME || join(DATA_DIR, 'workbuddy-home'))
const WORKBUDDY_META_PATH = join(DATA_DIR, 'workbuddy-meta.json')
const WORKBUDDY_DEFAULT_MODELS = [
  'auto',
  'glm-5v-turbo',
  'glm-5.1',
  'glm-5.0-turbo',
  'glm-5.0',
  'glm-4.7',
  'kimi-k2.5',
  'minimax-m2.7',
  'deepseek-v3-2-volc',
]
const GROK_FALLBACK_MODELS = ['grok-4.7', 'grok-4.7-build-fast', 'grok-4.6', 'grok-4.5']
const DEFAULT_SKILLS_DIR = resolve(
  process.env.FOLDFRAME_SKILLS_DIR
  || join(REPO_ROOT, 'project', 'aitoearn-backend', 'apps', 'aitoearn-ai', 'src', 'core', 'agent', 'skills'),
)

const DREAMINA_IMAGE_MODELS = ['5.0', '5.0Pro', '4.7', '4.6', '4.5', '4.1', '4.0', '3.1', '3.0']
const DREAMINA_VIDEO_MODELS = [
  'seedance2.0fast',
  'seedance2.0',
  'seedance2.0_vip',
  'seedance2.0fast_vip',
  'seedance2.0mini',
  'seedance2.5',
  'seedance1.5pro',
  'seedance1.0fast',
]
const DREAMINA_RATIOS = new Set(['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'])
const DREAMINA_VIDEO_RATIOS = new Set(['1:1', '3:4', '16:9', '4:3', '9:16', '21:9'])

const activeRuns = new Map()
const activeAuthProcesses = new Map()
const activeAuthStates = new Map()
const fileRegistry = new Map()
const FILE_TTL_MS = 30 * 60 * 1000
const CODEX_COMPAT_PATH = join(DATA_DIR, 'codex-compat.json')

let codexBinaryCache = { fetchedAt: 0, bin: null, version: '' }
let grokBinaryCache = { fetchedAt: 0, bin: null, version: '' }
let workbuddyBinaryCache = { fetchedAt: 0, bin: null, version: '', isNodeScript: false }

function parseSemverTuple(versionStr) {
  const m = String(versionStr || '').match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return [0, 0, 0]
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function compareSemver(a, b) {
  const ta = parseSemverTuple(a)
  const tb = parseSemverTuple(b)
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] - tb[i]
  }
  return String(a || '').localeCompare(String(b || ''))
}

export function findCodexBinaryInfo() {
  if (codexBinaryCache.bin && (Date.now() - codexBinaryCache.fetchedAt) < 5 * 60 * 1000 && isExecutable(codexBinaryCache.bin)) {
    return { bin: codexBinaryCache.bin, version: codexBinaryCache.version }
  }

  const envPath = process.env.CODEX_BIN
  if (envPath && isExecutable(envPath)) {
    const out = spawnSync(envPath, ['--version'], { encoding: 'utf8', timeout: 3000 })
    const ver = `${out.stdout || ''}\n${out.stderr || ''}`.split(/\r?\n/).find(l => l.trim() && !l.startsWith('WARNING:'))?.trim() || ''
    codexBinaryCache = { fetchedAt: Date.now(), bin: envPath, version: ver }
    return { bin: envPath, version: ver }
  }

  const candidates = [
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    ...buildSearchPaths().map(dir => join(dir, 'codex')),
  ]
  const uniqueBins = [...new Set(candidates)].filter(isExecutable)
  if (uniqueBins.length === 0) {
    codexBinaryCache = { fetchedAt: Date.now(), bin: null, version: '' }
    return { bin: null, version: '' }
  }

  let bestBin = uniqueBins[0]
  let bestVer = ''
  for (const cand of uniqueBins) {
    const out = spawnSync(cand, ['--version'], { encoding: 'utf8', timeout: 3000 })
    const ver = `${out.stdout || ''}\n${out.stderr || ''}`.split(/\r?\n/).find(l => l.trim() && !l.startsWith('WARNING:'))?.trim() || ''
    if (!bestVer || compareSemver(ver, bestVer) > 0) {
      bestBin = cand
      bestVer = ver
    }
  }

  codexBinaryCache = { fetchedAt: Date.now(), bin: bestBin, version: bestVer }
  return { bin: bestBin, version: bestVer }
}

export function findCodexBinary() {
  return findCodexBinaryInfo().bin
}

function loadCodexCompatState(expectedVersion = '') {
  try {
    if (existsSync(CODEX_COMPAT_PATH)) {
      const parsed = JSON.parse(readFileSync(CODEX_COMPAT_PATH, 'utf8'))
      const savedVer = typeof parsed?.codexVersion === 'string' ? parsed.codexVersion : ''
      if (expectedVersion && savedVer !== expectedVersion) {
        return { codexVersion: expectedVersion, verifiedModel: null, unsupportedModels: new Set() }
      }
      return {
        codexVersion: expectedVersion || savedVer,
        verifiedModel: typeof parsed?.verifiedModel === 'string' && parsed.verifiedModel ? parsed.verifiedModel : null,
        unsupportedModels: new Set(Array.isArray(parsed?.unsupportedModels) ? parsed.unsupportedModels.map(String) : []),
      }
    }
  }
  catch {}
  return { codexVersion: expectedVersion, verifiedModel: null, unsupportedModels: new Set() }
}

let codexCompatState = loadCodexCompatState()

function ensureCodexCompatForVersion(versionStr) {
  const v = String(versionStr || '').trim()
  if (v && codexCompatState.codexVersion !== v) {
    codexCompatState = loadCodexCompatState(v)
    saveCodexCompatState()
  }
}

function saveCodexCompatState() {
  try {
    ensureDir(DATA_DIR)
    writeFileSync(CODEX_COMPAT_PATH, JSON.stringify({
      codexVersion: codexCompatState.codexVersion || '',
      verifiedModel: codexCompatState.verifiedModel,
      unsupportedModels: [...codexCompatState.unsupportedModels],
    }, null, 2), 'utf8')
  }
  catch {}
}

function recordCodexModelUnsupported(modelName) {
  const m = String(modelName || '').trim()
  if (!m) return
  codexCompatState.unsupportedModels.add(m)
  if (codexCompatState.verifiedModel === m) {
    codexCompatState.verifiedModel = null
  }
  saveCodexCompatState()
}

function recordCodexModelVerified(modelName) {
  const m = String(modelName || '').trim()
  if (!m) return
  codexCompatState.unsupportedModels.delete(m)
  codexCompatState.verifiedModel = m
  saveCodexCompatState()
}

// ==================== Path & Binary Discovery ====================

export function buildSearchPaths() {
  const home = homedir()
  const inherited = (process.env.PATH || '').split(':').filter(Boolean)
  const common = [
    join(home, '.local', 'bin'),
    join(home, '.antigravity', 'bin'),
    join(home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
  return [...new Set([...common, ...inherited])]
}

function isExecutable(filePath) {
  if (!filePath) return false
  try {
    const stat = statSync(filePath)
    return stat.isFile() && Boolean(stat.mode & 0o111)
  }
  catch {
    return false
  }
}

export function findBinary(name, envVar, extraCandidates = []) {
  const envPath = envVar ? process.env[envVar] : ''
  if (envPath && isExecutable(envPath)) return envPath
  for (const dir of buildSearchPaths()) {
    const candidate = join(dir, name)
    if (isExecutable(candidate)) return candidate
  }
  for (const candidate of extraCandidates) {
    if (isExecutable(candidate)) return candidate
  }
  return null
}

function childEnv(extra = {}) {
  const merged = {
    ...process.env,
    PATH: buildSearchPaths().join(':'),
    ...extra,
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete merged[k]
  }
  return merged
}

function execCapture(bin, args, options = {}) {
  return new Promise((resolvePromise) => {
    const timeoutMs = options.timeoutMs ?? 8000
    const child = spawn(bin, args, {
      cwd: options.cwd || REPO_ROOT,
      env: options.rawEnv || childEnv(options.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 1000)
      resolvePromise({ code: -1, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim(), timedOut: true })
    }, timeoutMs)

    if (options.stdinText !== undefined) {
      child.stdin.write(options.stdinText)
      child.stdin.end()
    }
    else {
      child.stdin.end()
    }

    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code: -1, stdout, stderr: error.message, timedOut: false })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code: code ?? -1, stdout, stderr, timedOut: false })
    })
  })
}

export function extractJsonFromOutput(rawText) {
  const text = (rawText || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  }
  catch {
    // Strip log prefix lines and try to find the outermost JSON object or array
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const candidate = lines.slice(i).join('\n').trim()
      if (candidate.startsWith('{') || candidate.startsWith('[')) {
        try {
          return JSON.parse(candidate)
        }
        catch {
          // try shrinking from the end
          const lastBrace = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
          if (lastBrace > 0) {
            try {
              return JSON.parse(candidate.slice(0, lastBrace + 1))
            }
            catch {}
          }
        }
      }
    }
  }
  return null
}

let agyModelsCache = { fetchedAt: 0, bin: '', models: ['default'] }

export function findAgyBinary() {
  const home = homedir()
  const extra = [
    '/Applications/Antigravity.app/Contents/Resources/app/bin/agy',
    '/Applications/Antigravity.app/Contents/MacOS/agy',
  ]
  // Discover Orca / Antigravity managed runtimes under ~/Library/Application Support/orca/agent-runtimes/agy/<version>/agy
  const orcaBase = join(home, 'Library', 'Application Support', 'orca', 'agent-runtimes', 'agy')
  try {
    if (existsSync(orcaBase)) {
      const versions = readdirSync(orcaBase)
        .filter(name => !name.startsWith('.'))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      for (const ver of versions) {
        extra.push(join(orcaBase, ver, 'agy'))
      }
    }
  }
  catch {}
  return findBinary('agy', 'AGY_BIN', extra)
}

async function detectAgy() {
  const bin = findAgyBinary()
  if (!bin) {
    return {
      id: 'agy',
      name: 'Antigravity CLI (agy)',
      installed: false,
      path: null,
      version: null,
      models: ['default'],
      installHint: '请先安装 Antigravity CLI (agy) 并在终端执行一次 agy 完成登录授权',
    }
  }
  const ver = await execCapture(bin, ['--version'], { timeoutMs: 4000 })
  const versionLine = (ver.stdout || ver.stderr).split(/\r?\n/).find(l => l.trim()) || ''
  let models = agyModelsCache.bin === bin && (Date.now() - agyModelsCache.fetchedAt) < 5 * 60 * 1000
    ? agyModelsCache.models
    : ['default']
  if (models.length <= 1 || agyModelsCache.bin !== bin || (Date.now() - agyModelsCache.fetchedAt) >= 5 * 60 * 1000) {
    const modelsRes = await execCapture(bin, ['models'], { timeoutMs: 15000 })
    if (modelsRes.code === 0 && modelsRes.stdout.trim()) {
      const cleaned = modelsRes.stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[^\n]*\r/g, '')
      const parsed = extractJsonFromOutput(cleaned)
      if (Array.isArray(parsed)) {
        const names = parsed.map(item => typeof item === 'string' ? item : item?.id || item?.name).filter(Boolean)
        if (names.length) models = ['default', ...new Set(names)]
      }
      else {
        const names = cleaned
          .split(/\r?\n/)
          .map(line => line.trim().replace(/^[-*•]\s*/, '').split(/\s+/)[0])
          .filter(line => line && /^[a-z0-9][a-z0-9._:/-]+$/i.test(line) && !/^(models?:?|fetching)$/i.test(line))
        if (names.length) models = ['default', ...new Set(names)]
      }
      agyModelsCache = { fetchedAt: Date.now(), bin, models }
    }
  }
  return {
    id: 'agy',
    name: 'Antigravity CLI (agy)',
    installed: true,
    path: bin,
    version: versionLine.trim(),
    models,
  }
}

function readCodexLocalMetadata() {
  const codexHome = join(homedir(), '.codex')
  let visibleModels = []
  let cacheClientVersion = ''
  try {
    const cachePath = join(codexHome, 'models_cache.json')
    if (existsSync(cachePath)) {
      const parsed = JSON.parse(readFileSync(cachePath, 'utf8'))
      if (typeof parsed?.client_version === 'string') {
        cacheClientVersion = parsed.client_version.trim()
      }
      const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.models) ? parsed.models : [])
      visibleModels = items
        .filter(item => item && (item.visibility == null || item.visibility === 'list'))
        .map(item => ({
          slug: String(item.slug || item.id || '').trim(),
          defaultEffort: String(item.default_reasoning_level || 'medium').trim() || 'medium',
          supportedEfforts: Array.isArray(item.supported_reasoning_levels)
            ? item.supported_reasoning_levels.map(r => (typeof r === 'string' ? r : r?.effort || r?.level)).filter(Boolean)
            : [],
        }))
        .filter(item => Boolean(item.slug))
    }
  }
  catch {}

  let configuredModel = ''
  let configuredEffort = ''
  try {
    const cfgPath = join(codexHome, 'config.toml')
    if (existsSync(cfgPath)) {
      const raw = readFileSync(cfgPath, 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        if (trimmed.startsWith('[')) break
        const modelMatch = trimmed.match(/^model\s*=\s*["']([^"']+)["']/)
        if (modelMatch) configuredModel = modelMatch[1].trim()
        const effortMatch = trimmed.match(/^model_reasoning_effort\s*=\s*["']([^"']+)["']/)
        if (effortMatch) configuredEffort = effortMatch[1].trim()
      }
    }
  }
  catch {}

  return { visibleModels, cacheClientVersion, configuredModel, configuredEffort }
}

export function resolveCodexInvocationOptions(requestedModel) {
  const { version: binVersion } = findCodexBinaryInfo()
  ensureCodexCompatForVersion(binVersion)
  const meta = readCodexLocalMetadata()
  const binShortVer = (binVersion.match(/(\d+\.\d+\.\d+[^\s]*)/)?.[1] || '').trim()
  const cacheMatchesBinary = !meta.cacheClientVersion || !binShortVer || meta.cacheClientVersion === binShortVer
  const allSlugs = meta.visibleModels.map(m => m.slug)
  const slugs = allSlugs.filter(s => !codexCompatState.unsupportedModels.has(s))
  const findEntry = slug => meta.visibleModels.find(m => m.slug === slug)

  let modelArg = requestedModel ? String(requestedModel).trim() : undefined
  let fallbackFrom
  const defaultUnsupported = Boolean(
    meta.configuredModel
    && (
      codexCompatState.unsupportedModels.has(meta.configuredModel)
      || (cacheMatchesBinary && allSlugs.length > 0 && !allSlugs.includes(meta.configuredModel))
    ),
  )

  if (!modelArg || modelArg === 'default') {
    modelArg = undefined
    if (codexCompatState.verifiedModel && (!slugs.length || slugs.includes(codexCompatState.verifiedModel))) {
      if (defaultUnsupported || codexCompatState.verifiedModel !== meta.configuredModel) {
        modelArg = codexCompatState.verifiedModel
        if (defaultUnsupported) fallbackFrom = meta.configuredModel
      }
    }
    else if (defaultUnsupported && slugs.length > 0) {
      modelArg = slugs[0]
      fallbackFrom = meta.configuredModel
    }
  }

  const effectiveModel = modelArg || meta.configuredModel || slugs[0] || ''
  const entry = findEntry(effectiveModel)
  let effortArg
  if (meta.configuredEffort && entry) {
    if (entry.supportedEfforts.length > 0 && !entry.supportedEfforts.includes(meta.configuredEffort)) {
      effortArg = entry.defaultEffort || 'medium'
    }
  }
  else if (meta.configuredEffort === 'ultra' && modelArg && modelArg !== meta.configuredModel) {
    effortArg = entry?.defaultEffort || 'medium'
  }

  const candidates = [...new Set([
    ...(modelArg ? [modelArg] : []),
    ...(meta.configuredModel && !codexCompatState.unsupportedModels.has(meta.configuredModel) ? [meta.configuredModel] : []),
    ...(codexCompatState.verifiedModel ? [codexCompatState.verifiedModel] : []),
    ...slugs,
  ])].filter(Boolean)

  return {
    modelArg,
    effortArg,
    effectiveModel,
    fallbackFrom,
    configuredModel: meta.configuredModel || undefined,
    candidates,
  }
}

async function detectCodex() {
  const { bin, version: cachedVer } = findCodexBinaryInfo()
  if (!bin) {
    return {
      id: 'codex',
      name: 'Codex CLI',
      installed: false,
      loggedIn: false,
      path: null,
      version: null,
      models: ['default'],
      installHint: '安装 Codex CLI 后即可在本页点击「一键网页登录」完成授权',
    }
  }
  const [ver, loginRes] = await Promise.all([
    cachedVer ? Promise.resolve({ stdout: cachedVer, stderr: '' }) : execCapture(bin, ['--version'], { timeoutMs: 4000 }),
    execCapture(bin, ['login', 'status'], { timeoutMs: 4000 }),
  ])
  const versionLine = (ver.stdout || ver.stderr).split(/\r?\n/).find(l => l.trim() && !l.startsWith('WARNING:')) || ''
  ensureCodexCompatForVersion(versionLine.trim())
  const loginText = `${loginRes.stdout}\n${loginRes.stderr}`.trim()
  const loggedIn = loginRes.code === 0 && /logged in/i.test(loginText)
  const accountLabel = /chatgpt/i.test(loginText)
    ? 'ChatGPT 账号'
    : /api key/i.test(loginText)
      ? 'OpenAI API Key'
      : (loggedIn ? '已登录' : undefined)

  const meta = readCodexLocalMetadata()
  const resolved = resolveCodexInvocationOptions(undefined)
  const slugs = meta.visibleModels
    .map(m => m.slug)
    .filter(s => !codexCompatState.unsupportedModels.has(s))
  const orderedSlugs = meta.configuredModel && !codexCompatState.unsupportedModels.has(meta.configuredModel)
    ? [meta.configuredModel, ...slugs]
    : slugs
  const models = orderedSlugs.length > 0 ? ['default', ...new Set(orderedSlugs)].slice(0, 12) : ['default']

  return {
    id: 'codex',
    name: 'Codex CLI',
    installed: true,
    loggedIn,
    accountLabel,
    path: bin,
    version: versionLine.trim(),
    models,
    effectiveDefaultModel: resolved.effectiveModel || undefined,
    autoFallbackNotice: resolved.fallbackFrom
      ? `本机 Codex 配置的默认模型 ${resolved.fallbackFrom} 当前账号不支持，Foldframe 已自动切换至 ${resolved.effectiveModel}`
      : undefined,
    loginHint: loggedIn ? undefined : '点击「一键网页登录 Codex」即可在浏览器完成登录授权',
  }
}

async function detectDreamina() {
  const bin = findBinary('dreamina', 'DREAMINA_BIN')
  if (!bin) {
    return {
      id: 'dreamina',
      name: '即梦 AI CLI (dreamina)',
      installed: false,
      loggedIn: false,
      path: null,
      version: null,
      credits: null,
      imageModels: DREAMINA_IMAGE_MODELS,
      videoModels: DREAMINA_VIDEO_MODELS,
      installHint: '请安装即梦官方 dreamina CLI 到 ~/.local/bin/dreamina 并执行 dreamina login',
    }
  }
  const ver = await execCapture(bin, ['--version'], { timeoutMs: 4000 })
  const verJson = extractJsonFromOutput(ver.stdout)
  const version = verJson?.version || (ver.stdout || ver.stderr).split(/\r?\n/).find(l => l.trim() && !l.includes('initialize logs failed')) || ''

  const creditRes = await execCapture(bin, ['user_credit'], { timeoutMs: 6000 })
  const creditJson = extractJsonFromOutput(creditRes.stdout) || extractJsonFromOutput(creditRes.stderr)
  const combinedText = `${creditRes.stdout}\n${creditRes.stderr}`.toLowerCase()
  const looksLoggedOut = /not logged in|please login|unauthorized|login required|未登录|请先登录/.test(combinedText)
  const loggedIn = creditRes.code === 0 && !looksLoggedOut

  let credits = null
  if (creditJson && typeof creditJson === 'object') {
    const rawCredit = creditJson.total_credit
      ?? creditJson.credit
      ?? creditJson.credits
      ?? creditJson.remaining_credit
      ?? creditJson.data?.total_credit
      ?? creditJson.data?.credit
      ?? creditJson.data?.credits
    if (typeof rawCredit === 'number' || typeof rawCredit === 'string') {
      credits = rawCredit
    }
  }

  return {
    id: 'dreamina',
    name: '即梦 AI CLI (dreamina)',
    installed: true,
    loggedIn,
    path: bin,
    version: String(version).trim(),
    credits,
    creditDetail: creditJson || undefined,
    imageModels: DREAMINA_IMAGE_MODELS,
    videoModels: DREAMINA_VIDEO_MODELS,
    loginHint: loggedIn ? undefined : '点击下方「一键网页登录即梦」，在浏览器确认授权即可完成登录',
  }
}

export function findGrokBinaryInfo() {
  if (grokBinaryCache.bin && (Date.now() - grokBinaryCache.fetchedAt) < 5 * 60 * 1000 && isExecutable(grokBinaryCache.bin)) {
    return { bin: grokBinaryCache.bin, version: grokBinaryCache.version }
  }

  const readVersion = (binPath) => {
    const out = spawnSync(binPath, ['--version'], { encoding: 'utf8', timeout: 3000 })
    return `${out.stdout || ''}\n${out.stderr || ''}`.split(/\r?\n/).find(l => l.trim())?.trim() || ''
  }

  const envPath = process.env.GROK_BIN
  if (envPath && isExecutable(envPath)) {
    const ver = readVersion(envPath)
    grokBinaryCache = { fetchedAt: Date.now(), bin: envPath, version: ver }
    return { bin: envPath, version: ver }
  }

  const home = homedir()
  const candidates = [
    ...buildSearchPaths().map(dir => join(dir, 'grok')),
  ]

  // Orca managed runtime: ~/Library/Application Support/orca/agent-runtimes/grok/<ver>/bin/grok
  const orcaGrokBase = join(home, 'Library', 'Application Support', 'orca', 'agent-runtimes', 'grok')
  try {
    if (existsSync(orcaGrokBase)) {
      for (const ver of readdirSync(orcaGrokBase).filter(n => !n.startsWith('.'))) {
        candidates.push(join(orcaGrokBase, ver, 'bin', 'grok'))
        candidates.push(join(orcaGrokBase, ver, 'grok'))
      }
    }
  }
  catch {}

  // OpenBot managed runtime: ~/Library/Application Support/OpenBot/provider-runtimes/grok/<platform>/<ver>/bin/grok
  const openbotGrokBase = join(home, 'Library', 'Application Support', 'OpenBot', 'provider-runtimes', 'grok')
  try {
    if (existsSync(openbotGrokBase)) {
      for (const entry of readdirSync(openbotGrokBase).filter(n => !n.startsWith('.'))) {
        const subDir = join(openbotGrokBase, entry)
        candidates.push(join(subDir, 'bin', 'grok'))
        try {
          for (const ver of readdirSync(subDir).filter(n => !n.startsWith('.'))) {
            candidates.push(join(subDir, ver, 'bin', 'grok'))
            candidates.push(join(subDir, ver, 'grok'))
          }
        }
        catch {}
      }
    }
  }
  catch {}

  const uniqueBins = [...new Set(candidates)].filter(isExecutable)
  if (uniqueBins.length === 0) {
    grokBinaryCache = { fetchedAt: Date.now(), bin: null, version: '' }
    return { bin: null, version: '' }
  }

  let bestBin = uniqueBins[0]
  let bestVer = ''
  for (const cand of uniqueBins) {
    const ver = readVersion(cand)
    if (!bestVer || compareSemver(ver, bestVer) > 0) {
      bestBin = cand
      bestVer = ver
    }
  }

  grokBinaryCache = { fetchedAt: Date.now(), bin: bestBin, version: bestVer }
  return { bin: bestBin, version: bestVer }
}

export function findGrokBinary() {
  return findGrokBinaryInfo().bin
}

function readGrokLocalMetadata() {
  const grokHome = join(homedir(), '.grok')
  const authPath = join(grokHome, 'auth.json')
  let loggedIn = Boolean(process.env.XAI_API_KEY)
  let authMtimeMs = 0
  try {
    if (existsSync(authPath)) {
      const stat = statSync(authPath)
      authMtimeMs = stat.mtimeMs
      if (stat.size > 20) {
        loggedIn = true
      }
    }
  }
  catch {}

  let visibleModels = []
  let authMethod = ''
  try {
    const cachePath = join(grokHome, 'models_cache.json')
    if (existsSync(cachePath)) {
      const parsed = JSON.parse(readFileSync(cachePath, 'utf8'))
      if (typeof parsed?.auth_method === 'string') {
        authMethod = parsed.auth_method.trim()
      }
      if (Array.isArray(parsed?.models)) {
        visibleModels = parsed.models
          .filter(m => m && !m.hidden)
          .map(m => String(m.id || m.slug || m.model || '').trim())
          .filter(Boolean)
      }
      else if (parsed?.models && typeof parsed.models === 'object') {
        visibleModels = Object.entries(parsed.models)
          .filter(([, entry]) => !entry?.info?.hidden)
          .map(([id, entry]) => String(entry?.info?.id || id).trim())
          .filter(Boolean)
      }
    }
  }
  catch {}

  let configuredModel = ''
  try {
    const cfgPath = join(grokHome, 'config.toml')
    if (existsSync(cfgPath)) {
      const raw = readFileSync(cfgPath, 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        if (trimmed.startsWith('[')) break
        const m = trimmed.match(/^model\s*=\s*["']([^"']+)["']/)
        if (m) configuredModel = m[1].trim()
      }
    }
  }
  catch {}

  return { loggedIn, authMtimeMs, authMethod, visibleModels, configuredModel }
}

async function detectGrok() {
  const { bin, version } = findGrokBinaryInfo()
  if (!bin) {
    return {
      id: 'grok',
      name: 'Grok CLI',
      installed: false,
      loggedIn: false,
      path: null,
      version: null,
      models: ['default', ...GROK_FALLBACK_MODELS],
      installHint: '安装本机 Grok CLI 后即可在本页点击「一键网页登录」完成 xAI / Grok 账号授权',
    }
  }

  const meta = readGrokLocalMetadata()
  const modelSlugs = meta.visibleModels.length > 0 ? meta.visibleModels : GROK_FALLBACK_MODELS
  const ordered = meta.configuredModel ? [meta.configuredModel, ...modelSlugs] : modelSlugs
  const models = ['default', ...new Set(ordered)].slice(0, 12)
  const effectiveDefaultModel = meta.configuredModel || modelSlugs[0] || 'grok-4.7'
  const accountLabel = meta.loggedIn
    ? (process.env.XAI_API_KEY ? 'xAI API Key' : 'xAI / Grok 账号')
    : undefined

  return {
    id: 'grok',
    name: 'Grok CLI',
    installed: true,
    loggedIn: meta.loggedIn,
    accountLabel,
    path: bin,
    version: version || undefined,
    models,
    effectiveDefaultModel,
    loginHint: meta.loggedIn ? undefined : '点击「一键网页登录」在浏览器确认授权即可使用 Grok',
  }
}

function workbuddyChildEnv(extra = {}) {
  ensureDir(WORKBUDDY_HOME)
  const env = childEnv({
    HOME: WORKBUDDY_HOME,
    CODEBUDDY_FORCE_LITE_WB_BUNDLE: '1',
    CODEBUDDY_DISABLE_PROXY_CONFIG_FILE: '1',
    ...extra,
  })
  // WorkBuddy's bundled Axios proxy helper throws TypeError when HTTP_PROXY/ALL_PROXY is set on Node 22+
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    delete env[key]
  }
  return env
}

export function findWorkBuddyBinaryInfo() {
  if (workbuddyBinaryCache.bin && (Date.now() - workbuddyBinaryCache.fetchedAt) < 5 * 60 * 1000 && existsSync(workbuddyBinaryCache.bin)) {
    return { bin: workbuddyBinaryCache.bin, version: workbuddyBinaryCache.version, isNodeScript: workbuddyBinaryCache.isNodeScript }
  }

  const readPkgVersion = (binPath) => {
    try {
      const pkgPath = resolve(dirname(binPath), '..', 'package.json')
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
        const ver = pkg?.publishConfig?.customPackage?.version || pkg?.version
        if (ver) return String(ver).trim()
      }
    }
    catch {}
    try {
      const isJs = /\.(?:m?js|cjs)$/i.test(binPath) || binPath.includes('/WorkBuddy.app/')
      const out = isJs
        ? spawnSync(process.execPath, [binPath, '--version'], { encoding: 'utf8', timeout: 4000, env: workbuddyChildEnv() })
        : spawnSync(binPath, ['--version'], { encoding: 'utf8', timeout: 4000, env: workbuddyChildEnv() })
      return `${out.stdout || ''}\n${out.stderr || ''}`.split(/\r?\n/).find(l => /^\d+\.\d+\.\d+/.test(l.trim()))?.trim() || ''
    }
    catch {
      return ''
    }
  }

  const envPath = process.env.WORKBUDDY_BIN
  if (envPath && existsSync(envPath)) {
    const isNodeScript = /\.(?:m?js|cjs)$/i.test(envPath) || envPath.includes('/WorkBuddy.app/')
    const ver = readPkgVersion(envPath)
    workbuddyBinaryCache = { fetchedAt: Date.now(), bin: envPath, version: ver, isNodeScript }
    return { bin: envPath, version: ver, isNodeScript }
  }

  const appCliBin = '/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy'
  const appCliLite = '/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/dist/codebuddy-lite-wb.mjs'
  const pathCandidates = [
    ...buildSearchPaths().map(dir => join(dir, 'workbuddy')),
    ...buildSearchPaths().map(dir => join(dir, 'codebuddy')),
    ...buildSearchPaths().map(dir => join(dir, 'cbc')),
  ]

  const orderedCandidates = [
    { path: appCliBin, isNodeScript: true },
    { path: appCliLite, isNodeScript: true },
    ...pathCandidates.map(p => ({ path: p, isNodeScript: false })),
  ]

  for (const cand of orderedCandidates) {
    if (cand.isNodeScript ? existsSync(cand.path) : isExecutable(cand.path)) {
      const ver = readPkgVersion(cand.path)
      workbuddyBinaryCache = { fetchedAt: Date.now(), bin: cand.path, version: ver, isNodeScript: cand.isNodeScript }
      return { bin: cand.path, version: ver, isNodeScript: cand.isNodeScript }
    }
  }

  workbuddyBinaryCache = { fetchedAt: Date.now(), bin: null, version: '', isNodeScript: false }
  return { bin: null, version: '', isNodeScript: false }
}

function getWorkBuddyAuthDir() {
  return join(WORKBUDDY_HOME, 'Library', 'Application Support', 'CodeBuddyExtension', 'Data', 'Public', 'auth')
}

function readWorkBuddyMeta() {
  try {
    if (existsSync(WORKBUDDY_META_PATH)) {
      return JSON.parse(readFileSync(WORKBUDDY_META_PATH, 'utf8'))
    }
  }
  catch {}
  return {}
}

function saveWorkBuddyMeta(patch) {
  try {
    ensureDir(DATA_DIR)
    const next = { ...readWorkBuddyMeta(), ...patch }
    writeFileSync(WORKBUDDY_META_PATH, JSON.stringify(next, null, 2), 'utf8')
  }
  catch {}
}

function isWorkBuddyLoggedIn() {
  const authDir = getWorkBuddyAuthDir()
  try {
    if (!existsSync(authDir)) return false
    const files = readdirSync(authDir).filter(f => f.endsWith('.info'))
    for (const file of files) {
      const full = join(authDir, file)
      const logoutMarker = `${full}.logout`
      if (existsSync(logoutMarker)) continue
      const stat = statSync(full)
      if (stat.isFile() && stat.size > 20) return true
    }
  }
  catch {}
  return false
}

function spawnWorkBuddyProcess(args, options = {}) {
  const info = findWorkBuddyBinaryInfo()
  if (!info.bin) return null
  const cmd = info.isNodeScript ? process.execPath : info.bin
  const finalArgs = info.isNodeScript ? [info.bin, ...args] : args
  return spawn(cmd, finalArgs, {
    cwd: options.cwd || REPO_ROOT,
    env: workbuddyChildEnv(options.env),
    stdio: options.stdio || ['pipe', 'pipe', 'pipe'],
  })
}

async function detectWorkBuddy() {
  const info = findWorkBuddyBinaryInfo()
  if (!info.bin) {
    return {
      id: 'workbuddy',
      name: 'WorkBuddy',
      installed: false,
      loggedIn: false,
      path: null,
      version: null,
      models: ['default', ...WORKBUDDY_DEFAULT_MODELS],
      installHint: '请先安装腾讯 WorkBuddy 桌面客户端（/Applications/WorkBuddy.app），安装后即可在本页一键网页登录',
    }
  }

  const loggedIn = isWorkBuddyLoggedIn()
  const meta = readWorkBuddyMeta()
  return {
    id: 'workbuddy',
    name: 'WorkBuddy',
    installed: true,
    loggedIn,
    accountLabel: loggedIn ? (meta.accountLabel || 'WorkBuddy 账号') : undefined,
    path: info.bin,
    version: info.version || undefined,
    models: ['default', ...WORKBUDDY_DEFAULT_MODELS],
    effectiveDefaultModel: 'auto',
    loginHint: loggedIn ? undefined : '点击「一键网页登录」在浏览器扫码或确认即可连接 WorkBuddy 模型',
  }
}

let enginesSnapshotCache = { fetchedAt: 0, data: null }
let enginesInflightPromise = null

function invalidateEnginesCache() {
  enginesSnapshotCache = { fetchedAt: 0, data: null }
}

export async function detectAllEngines(forceRefresh = false) {
  if (!forceRefresh && enginesSnapshotCache.data && (Date.now() - enginesSnapshotCache.fetchedAt) < 10000) {
    return enginesSnapshotCache.data
  }
  if (enginesInflightPromise) {
    return await enginesInflightPromise
  }
  enginesInflightPromise = (async () => {
    const [agy, codex, dreamina, grok, workbuddy] = await Promise.all([
      detectAgy(),
      detectCodex(),
      detectDreamina(),
      detectGrok(),
      detectWorkBuddy(),
    ])
    const result = { agy, codex, dreamina, grok, workbuddy }
    enginesSnapshotCache = { fetchedAt: Date.now(), data: result }
    return result
  })()
  try {
    return await enginesInflightPromise
  }
  finally {
    enginesInflightPromise = null
  }
}

// ==================== Normalization & Mapping Helpers ====================

export function rewriteHostAccessibleUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
  try {
    const parsed = new URL(rawUrl)
    if (['aitoearn-nginx', 'nginx', 'aitoearn-web', 'host.docker.internal'].includes(parsed.hostname)) {
      parsed.hostname = '127.0.0.1'
      parsed.port = String(LOCAL_WEB_PORT)
      return parsed.toString()
    }
    if (parsed.hostname === 'aitoearn-rustfs' || parsed.hostname === 'rustfs.local') {
      const path = parsed.pathname.replace(/^\/aitoearn\//, '/oss/')
      return `http://127.0.0.1:${LOCAL_WEB_PORT}${path}${parsed.search}`
    }
    return rawUrl
  }
  catch {
    if (rawUrl.startsWith('/')) {
      return `http://127.0.0.1:${LOCAL_WEB_PORT}${rawUrl}`
    }
    return rawUrl
  }
}

export function normalizeDreaminaImageModel(model, isEdit = false) {
  const raw = String(model || '5.0').replace(/^dreamina[-_:/]?/i, '').trim()
  const aliases = {
    '5.0-pro': '5.0Pro',
    '5.0pro': '5.0Pro',
    '5pro': '5.0Pro',
    '5': '5.0',
    '4': '4.0',
    '3': '3.0',
  }
  let resolved = aliases[raw.toLowerCase()] || raw
  if (!DREAMINA_IMAGE_MODELS.includes(resolved)) {
    resolved = '5.0'
  }
  if (isEdit && (resolved === '3.0' || resolved === '3.1')) {
    resolved = '5.0'
  }
  return resolved
}

export function normalizeDreaminaImageResolution(resolution, modelVersion) {
  const lower = String(resolution || '2k').trim().toLowerCase()
  const normalized = lower === '1k' || lower === '1.5k' || lower === '2k' || lower === '4k' ? lower : '2k'
  if (modelVersion === '3.0' || modelVersion === '3.1') {
    return normalized === '1k' ? '1k' : '2k'
  }
  if (modelVersion === '5.0Pro') {
    // Dreamina CLI 1.4.22 strictly validates 5.0Pro -> 1.5k, 2k, or 4k
    return normalized === '1k' ? '1.5k' : normalized
  }
  // 4.0 .. 5.0 support 2k or 4k only
  return normalized === '4k' ? '4k' : '2k'
}

export function normalizeDreaminaRatio(ratio, forVideo = false) {
  const raw = String(ratio || '').trim()
  if (!raw || raw === 'adaptive') return forVideo ? '16:9' : '1:1'
  const allowed = forVideo ? DREAMINA_VIDEO_RATIOS : DREAMINA_RATIOS
  if (allowed.has(raw)) return raw
  const map = {
    '4:5': '3:4',
    '5:4': '4:3',
    '2:3': forVideo ? '3:4' : '2:3',
    '3:2': forVideo ? '4:3' : '3:2',
  }
  return map[raw] || '16:9'
}

export function normalizeDreaminaVideoModel(model) {
  const raw = String(model || 'seedance2.0fast').replace(/^dreamina[-_:/]?/i, '').trim()
  const lower = raw.toLowerCase().replace(/\s+/g, '')
  const aliases = {
    'seedance-2.0-fast': 'seedance2.0fast',
    'seedance-2-fast': 'seedance2.0fast',
    'seedance-2-fast-beta': 'seedance2.0fast',
    'seedance2.0fast': 'seedance2.0fast',
    'seedance-2.0': 'seedance2.0',
    'seedance-2-beta': 'seedance2.0',
    'seedance2.0': 'seedance2.0',
    'seedance-2.0-vip': 'seedance2.0_vip',
    'seedance2.0_vip': 'seedance2.0_vip',
    'seedance-2.0-fast-vip': 'seedance2.0fast_vip',
    'seedance2.0fast_vip': 'seedance2.0fast_vip',
    'seedance-2.0-mini': 'seedance2.0mini',
    'seedance2.0mini': 'seedance2.0mini',
    'seedance-2.5': 'seedance2.5',
    'seedance2.5': 'seedance2.5',
    'seedance-1.5-pro': 'seedance1.5pro',
    'seedance1.5pro': 'seedance1.5pro',
    'seedance-1.0-fast': 'seedance1.0fast',
    'seedance1.0fast': 'seedance1.0fast',
  }
  const resolved = aliases[lower] || raw
  return DREAMINA_VIDEO_MODELS.includes(resolved) ? resolved : 'seedance2.0fast'
}

export function normalizeDreaminaVideoResolution(resolution, modelVersion) {
  const lower = String(resolution || '720p').trim().toLowerCase()
  if (modelVersion === 'seedance2.5') {
    if (lower === '480p' || lower === '1080p') return lower
    return '720p'
  }
  if (modelVersion === 'seedance2.0_vip') {
    if (lower === '1080p' || lower === '4k') return lower
    return '720p'
  }
  return '720p'
}

export function normalizeDreaminaVideoDuration(duration, modelVersion) {
  const num = Number.parseInt(String(duration ?? 5), 10)
  const value = Number.isFinite(num) ? num : 5
  if (modelVersion === 'seedance2.5') return Math.min(30, Math.max(4, value))
  if (modelVersion === 'seedance1.5pro') return Math.min(12, Math.max(5, value))
  if (modelVersion === 'seedance1.0fast') return Math.min(10, Math.max(5, value))
  return Math.min(15, Math.max(4, value))
}

export function parseLocalModelTarget(modelName) {
  const raw = String(modelName || '').trim()
  if (/^agy(?:[:/]|$)/i.test(raw)) {
    const sub = raw.replace(/^agy[:/]?/i, '').trim()
    return { engine: 'agy', model: (!sub || sub === 'default') ? undefined : sub }
  }
  if (/^codex(?:[:/]|$)/i.test(raw)) {
    const sub = raw.replace(/^codex[:/]?/i, '').trim()
    return { engine: 'codex', model: (!sub || sub === 'default') ? undefined : sub }
  }
  if (/^grok(?:[:/]|$)/i.test(raw)) {
    const sub = raw.replace(/^grok[:/]?/i, '').trim()
    return { engine: 'grok', model: (!sub || sub === 'default') ? undefined : sub }
  }
  if (/^workbuddy(?:[:/]|$)/i.test(raw)) {
    const sub = raw.replace(/^workbuddy[:/]?/i, '').trim()
    return { engine: 'workbuddy', model: (!sub || sub === 'default') ? undefined : sub }
  }
  return { engine: 'unknown', model: raw }
}

export function normalizeEngineModel(engine, rawModel) {
  const raw = String(rawModel || '').trim()
  if (!raw || raw === 'default') return undefined
  const parsed = parseLocalModelTarget(raw)
  if (parsed.engine === engine || parsed.engine !== 'unknown') {
    return parsed.model
  }
  return raw
}

function summarizeCliError(stderr, stdout, exitCode) {
  const combined = `${stderr || ''}\n${stdout || ''}`.trim()
  const msgMatch = combined.match(/"message"\s*:\s*"([^"]+)"/)
  if (msgMatch?.[1]) {
    return msgMatch[1].slice(0, 320)
  }
  const errLines = combined.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const lastErr = [...errLines].reverse().find(l => /error|fail|unauthorized|not found|not supported|login/i.test(l))
  if (lastErr) return lastErr.slice(0, 320)
  return combined.slice(-320) || `退出码 ${exitCode}`
}

// ==================== Media Download / Temp Storage ====================

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true, mode: 0o700 })
}

function guessExtensionFromMime(mimeType, fallback = '.bin') {
  const clean = (mimeType || '').split(';')[0].trim().toLowerCase()
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
  }
  return map[clean] || fallback
}

function guessMimeFromPath(filePath, fallback = 'application/octet-stream') {
  const ext = extname(filePath).toLowerCase()
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
  }
  return map[ext] || fallback
}

async function materializeMediaUrl(urlOrDataUri, targetDir, prefix, fallbackExt = '.png') {
  ensureDir(targetDir)
  if (urlOrDataUri.startsWith('data:')) {
    const match = urlOrDataUri.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) throw new Error('Invalid data URI')
    const ext = guessExtensionFromMime(match[1], fallbackExt)
    const filePath = join(targetDir, `${prefix}${ext}`)
    writeFileSync(filePath, Buffer.from(match[2], 'base64'))
    return filePath
  }
  const fetchUrl = rewriteHostAccessibleUrl(urlOrDataUri)
  const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) {
    throw new Error(`Failed to download media ${fetchUrl}: HTTP ${response.status}`)
  }
  const urlExt = extname(new URL(fetchUrl).pathname)
  const mime = response.headers.get('content-type') || ''
  const ext = urlExt && urlExt.length <= 5 ? urlExt : guessExtensionFromMime(mime, fallbackExt)
  const filePath = join(targetDir, `${prefix}${ext}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  writeFileSync(filePath, buffer)
  return filePath
}

function registerHostedFile(filePath, mimeType) {
  const token = randomBytes(16).toString('hex')
  fileRegistry.set(token, {
    filePath,
    mimeType: mimeType || guessMimeFromPath(filePath),
    expiresAt: Date.now() + FILE_TTL_MS,
  })
  return token
}

function cleanupExpiredFiles() {
  const now = Date.now()
  for (const [token, entry] of fileRegistry.entries()) {
    if (entry.expiresAt <= now) {
      fileRegistry.delete(token)
    }
  }
}

// ==================== CLI Stream Parsers (Agy & Codex) ====================

export function parseAgyEventLine(line) {
  const trimmed = (line || '').trim()
  if (!trimmed) return []
  let obj
  try {
    obj = JSON.parse(trimmed)
  }
  catch {
    return [{ type: 'text_delta', text: `${trimmed}\n` }]
  }

  const events = []
  const kind = obj.event || obj.type
  const sessionId = obj.conversation_id
    || obj.conversationId
    || obj.session_id
    || obj.sessionId
    || obj.result?.conversation_id
    || obj.step_update?.conversation_id
  if (sessionId && (kind === 'init' || kind === 'session' || kind === 'system')) {
    events.push({ type: 'session', sessionId: String(sessionId) })
  }

  // Incremental delta formats
  if (typeof obj.delta === 'string' && obj.delta) {
    events.push({ type: 'text_delta', text: obj.delta })
  }
  else if (obj.delta && typeof obj.delta === 'object' && typeof obj.delta.text === 'string' && obj.delta.text) {
    events.push({ type: 'text_delta', text: obj.delta.text })
  }
  else if (kind === 'text' || kind === 'text_delta' || kind === 'content_delta') {
    const text = obj.text || obj.content || ''
    if (text) events.push({ type: 'text_delta', text })
  }

  // Step / tool updates from agy stream-json (v1.5+ uses {"event":"step_update","step_update":{...}})
  const step = obj.step || obj.step_update || (kind === 'step_update' ? obj : null)
  if (step && typeof step === 'object') {
    const stepType = String(step.step_type || step.stepType || step.kind || '').toLowerCase()
    const stepState = String(step.state || '').toUpperCase()
    const toolName = step.tool_name || step.toolName || step.mcp_tool?.tool_name || step.tool_call?.name || step.name
    const toolId = step.id || step.tool_call_id || step.call_id || step.tool_call?.id || (step.step_index != null ? `agy-step-${step.step_index}` : `agy-tool-${Date.now()}`)

    if (step.usage) {
      events.push({ type: 'usage', usage: normalizeUsage(step.usage) })
    }

    if (stepType.includes('mcp') || stepType.includes('tool') || toolName) {
      const toolInfo = step.tool_info && typeof step.tool_info === 'object' ? step.tool_info : null
      const toolParams = toolInfo?.parameters && typeof toolInfo.parameters === 'object' ? toolInfo.parameters : null
      const resolvedToolName = (toolName === 'call_mcp_tool' && toolParams?.ToolName)
        ? String(toolParams.ToolName)
        : String(toolName || toolInfo?.name || 'tool')
      const args = (toolName === 'call_mcp_tool' && toolParams?.Arguments !== undefined)
        ? toolParams.Arguments
        : (step.args || step.input || step.arguments || toolParams || step.mcp_tool?.arguments || step.tool_call?.arguments || {})
      const output = step.result ?? step.output ?? step.response ?? toolInfo?.output ?? step.mcp_tool?.result ?? step.tool_result
      if (output !== undefined) {
        events.push({
          type: 'tool_result',
          toolUseId: String(toolId),
          name: resolvedToolName,
          content: typeof output === 'string' ? output : JSON.stringify(output),
          isError: Boolean(step.is_error || step.error || stepState === 'ERROR'),
        })
      }
      else if (resolvedToolName && stepState !== 'DONE') {
        events.push({
          type: 'tool_use',
          id: String(toolId),
          name: resolvedToolName,
          input: typeof args === 'object' && args !== null ? args : { value: args },
        })
      }
    }
    const stepText = step.text_delta ?? step.text ?? step.message ?? step.assistant_text ?? step.response_text
    if (typeof stepText === 'string' && stepText && !stepType.includes('tool') && stepType !== 'user_input') {
      events.push({ type: 'text_delta', text: stepText })
    }
  }

  // Assistant / tool_use blocks (Claude-like or OpenAI-like envelopes)
  if (kind === 'tool_use' || kind === 'tool_call') {
    events.push({
      type: 'tool_use',
      id: String(obj.id || obj.tool_use_id || `agy-tool-${Date.now()}`),
      name: String(obj.name || obj.tool_name || 'tool'),
      input: obj.input || obj.arguments || {},
    })
  }
  else if (kind === 'tool_result') {
    const content = obj.content ?? obj.output ?? obj.result ?? ''
    events.push({
      type: 'tool_result',
      toolUseId: String(obj.tool_use_id || obj.id || ''),
      name: String(obj.name || obj.tool_name || 'tool'),
      content: typeof content === 'string' ? content : JSON.stringify(content),
      isError: Boolean(obj.is_error || obj.error),
    })
  }
  else if (kind === 'assistant' && obj.message?.content) {
    const blocks = Array.isArray(obj.message.content) ? obj.message.content : [{ type: 'text', text: String(obj.message.content) }]
    for (const block of blocks) {
      if (block?.type === 'text' && block.text) {
        events.push({ type: 'text_delta', text: block.text })
      }
      else if (block?.type === 'tool_use') {
        events.push({
          type: 'tool_use',
          id: String(block.id || `agy-tool-${Date.now()}`),
          name: String(block.name || 'tool'),
          input: block.input || {},
        })
      }
    }
  }

  // Terminal result event (supports both flat {type:'result', response:...} and agy v1.5 {event:'result', result:{response:...}})
  if (kind === 'result' || kind === 'done' || kind === 'final' || (obj.response !== undefined && !kind)) {
    const payload = (obj.result && typeof obj.result === 'object') ? obj.result : obj
    const structured = payload.structured_output ?? payload.structuredOutput ?? obj.structured_output ?? obj.structuredOutput
    const finalText = structured !== undefined
      ? (typeof structured === 'string' ? structured : JSON.stringify(structured))
      : (typeof payload.response === 'string'
          ? payload.response
          : typeof payload.result === 'string'
            ? payload.result
            : typeof payload.text === 'string'
              ? payload.text
              : '')
    const isErr = Boolean(
      payload.is_error
      || payload.error
      || obj.is_error
      || obj.error
      || (typeof payload.status === 'string' && payload.status.toUpperCase() === 'ERROR'),
    )
    events.push({
      type: 'result',
      text: finalText,
      sessionId: sessionId ? String(sessionId) : undefined,
      usage: normalizeUsage(payload.usage || payload.stats || payload.token_usage || obj.usage),
      costUsd: typeof payload.total_cost_usd === 'number' ? payload.total_cost_usd : (typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined),
      isError: isErr,
      error: typeof payload.error === 'string' ? payload.error : payload.error?.message || (typeof obj.error === 'string' ? obj.error : obj.error?.message),
    })
  }
  else if (kind === 'error') {
    const errPayload = (obj.error && typeof obj.error === 'object') ? obj.error : obj
    events.push({
      type: 'error',
      message: typeof obj.error === 'string' ? obj.error : errPayload.message || obj.message || 'Antigravity CLI error',
    })
  }

  return events
}

export function parseCodexEventLine(line) {
  const trimmed = (line || '').trim()
  if (!trimmed || trimmed.startsWith('WARNING:')) return []
  let obj
  try {
    obj = JSON.parse(trimmed)
  }
  catch {
    return []
  }

  const events = []
  if (obj.type === 'thread.started' && obj.thread_id) {
    events.push({ type: 'session', sessionId: String(obj.thread_id) })
  }
  else if (obj.type === 'item.started' && obj.item) {
    const item = obj.item
    if (item.type === 'mcp_tool_call') {
      const toolLabel = item.server ? `mcp__${item.server}__${item.tool}` : (item.tool || 'mcp_tool')
      events.push({
        type: 'tool_use',
        id: String(item.id || `codex-tool-${Date.now()}`),
        name: toolLabel,
        input: item.arguments || {},
      })
    }
  }
  else if (obj.type === 'item.completed' && obj.item) {
    const item = obj.item
    if (item.type === 'agent_message') {
      const text = typeof item.text === 'string'
        ? item.text
        : Array.isArray(item.content)
          ? item.content.map(c => c.text || '').join('')
          : ''
      if (text) {
        events.push({ type: 'text_delta', text })
      }
    }
    else if (item.type === 'mcp_tool_call') {
      const toolLabel = item.server ? `mcp__${item.server}__${item.tool}` : (item.tool || 'mcp_tool')
      const out = item.error
        ? (typeof item.error === 'string' ? item.error : JSON.stringify(item.error))
        : (typeof item.result === 'string' ? item.result : JSON.stringify(item.result ?? {}))
      events.push({
        type: 'tool_result',
        toolUseId: String(item.id || ''),
        name: toolLabel,
        content: out,
        isError: Boolean(item.error || item.status === 'failed'),
      })
    }
  }
  else if (obj.type === 'turn.completed') {
    events.push({
      type: 'usage',
      usage: normalizeUsage(obj.usage),
    })
  }
  else if (obj.type === 'turn.failed' || obj.type === 'error') {
    const message = obj.error?.message || obj.message || 'Codex execution failed'
    events.push({ type: 'error', message })
  }

  return events
}

export function parseGrokEventLine(line) {
  const trimmed = (line || '').trim()
  if (!trimmed || trimmed === 'Finishing session…' || trimmed === 'Finishing session...') return []
  let obj
  try {
    obj = JSON.parse(trimmed)
  }
  catch {
    return []
  }

  const events = []
  const kind = obj.type || obj.event
  if (kind === 'text') {
    const text = typeof obj.data === 'string' ? obj.data : (typeof obj.text === 'string' ? obj.text : '')
    if (text) events.push({ type: 'text_delta', text })
  }
  else if (kind === 'tool_use' || kind === 'tool_call') {
    events.push({
      type: 'tool_use',
      id: String(obj.id || obj.tool_call_id || `grok-tool-${Date.now()}`),
      name: String(obj.name || obj.tool || obj.tool_name || 'tool'),
      input: obj.input || obj.arguments || obj.args || {},
    })
  }
  else if (kind === 'tool_result') {
    const content = obj.content ?? obj.output ?? obj.result ?? ''
    events.push({
      type: 'tool_result',
      toolUseId: String(obj.tool_call_id || obj.tool_use_id || obj.id || ''),
      name: String(obj.name || obj.tool || obj.tool_name || 'tool'),
      content: typeof content === 'string' ? content : JSON.stringify(content),
      isError: Boolean(obj.is_error || obj.error),
    })
  }
  else if (kind === 'usage' && obj.usage) {
    events.push({ type: 'usage', usage: normalizeUsage(obj.usage) })
  }
  else if (kind === 'end' || kind === 'result') {
    const structured = obj.structuredOutput ?? obj.structured_output
    const text = structured !== undefined
      ? (typeof structured === 'string' ? structured : JSON.stringify(structured))
      : (typeof obj.text === 'string' ? obj.text : typeof obj.result === 'string' ? obj.result : '')
    if (obj.sessionId || obj.session_id) {
      events.push({ type: 'session', sessionId: String(obj.sessionId || obj.session_id) })
    }
    events.push({
      type: 'result',
      text,
      sessionId: obj.sessionId || obj.session_id ? String(obj.sessionId || obj.session_id) : undefined,
      usage: normalizeUsage(obj.usage),
      costUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined,
      isError: Boolean(obj.is_error || obj.error),
      error: typeof obj.error === 'string' ? obj.error : obj.error?.message,
    })
  }
  else if (kind === 'error') {
    events.push({
      type: 'error',
      message: typeof obj.error === 'string' ? obj.error : obj.error?.message || obj.message || 'Grok execution failed',
    })
  }
  else if (!kind && (obj.stopReason !== undefined || obj.structuredOutput !== undefined || typeof obj.text === 'string')) {
    // Single-JSON response from `grok --output-format json` or `--json-schema`
    const structured = obj.structuredOutput ?? obj.structured_output
    const text = structured !== undefined
      ? (typeof structured === 'string' ? structured : JSON.stringify(structured))
      : String(obj.text || '')
    if (obj.sessionId) {
      events.push({ type: 'session', sessionId: String(obj.sessionId) })
    }
    events.push({
      type: 'result',
      text,
      sessionId: obj.sessionId ? String(obj.sessionId) : undefined,
      usage: normalizeUsage(obj.usage),
      costUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined,
      isError: Boolean(obj.error),
      error: typeof obj.error === 'string' ? obj.error : obj.error?.message,
    })
  }

  return events
}

export function parseWorkBuddyEventLine(line) {
  const trimmed = (line || '').trim()
  if (!trimmed) return []
  if (/Authentication required\. Please use \/login/i.test(trimmed)) {
    return [{ type: 'error', message: 'WorkBuddy 尚未登录，请在「模型接入」页面点击 WorkBuddy「一键网页登录」完成授权。' }]
  }
  let obj
  try {
    obj = JSON.parse(trimmed)
  }
  catch {
    return []
  }

  const events = []
  const kind = obj.type
  if (kind === 'system' && obj.session_id) {
    events.push({ type: 'session', sessionId: String(obj.session_id) })
  }
  else if (kind === 'stream_event' && obj.event) {
    const ev = obj.event
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
      events.push({ type: 'text_delta', text: ev.delta.text })
    }
  }
  else if (kind === 'assistant' && obj.message?.content) {
    const blocks = Array.isArray(obj.message.content)
      ? obj.message.content
      : [{ type: 'text', text: String(obj.message.content) }]
    for (const block of blocks) {
      if (block?.type === 'text' && block.text) {
        events.push({ type: 'text_delta', text: block.text })
      }
      else if (block?.type === 'tool_use') {
        events.push({
          type: 'tool_use',
          id: String(block.id || `wb-tool-${Date.now()}`),
          name: String(block.name || 'tool'),
          input: block.input || {},
        })
      }
    }
  }
  else if (kind === 'user' && Array.isArray(obj.message?.content)) {
    for (const block of obj.message.content) {
      if (block?.type === 'tool_result') {
        const content = block.content ?? ''
        events.push({
          type: 'tool_result',
          toolUseId: String(block.tool_use_id || ''),
          name: String(block.name || 'tool'),
          content: typeof content === 'string' ? content : JSON.stringify(content),
          isError: Boolean(block.is_error),
        })
      }
    }
  }
  else if (kind === 'result') {
    const structured = obj.structured_output ?? obj.structuredOutput
    const finalText = structured !== undefined
      ? (typeof structured === 'string' ? structured : JSON.stringify(structured))
      : (typeof obj.result === 'string' ? obj.result : typeof obj.text === 'string' ? obj.text : '')
    events.push({
      type: 'result',
      text: finalText,
      sessionId: obj.session_id ? String(obj.session_id) : undefined,
      usage: normalizeUsage(obj.usage),
      costUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : undefined,
      isError: Boolean(obj.is_error || obj.subtype === 'error_during_execution'),
      error: typeof obj.error === 'string' ? obj.error : obj.error?.message || (Array.isArray(obj.errors) ? obj.errors.join('; ') : undefined),
    })
  }
  else if (kind === 'error') {
    events.push({
      type: 'error',
      message: typeof obj.error === 'string' ? obj.error : obj.error?.message || obj.message || 'WorkBuddy execution failed',
    })
  }

  return events
}

function parseEngineStreamLine(engine, line) {
  if (engine === 'agy') return parseAgyEventLine(line)
  if (engine === 'codex') return parseCodexEventLine(line)
  if (engine === 'grok') return parseGrokEventLine(line)
  if (engine === 'workbuddy') return parseWorkBuddyEventLine(line)
  return []
}

function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const input = raw.input_tokens ?? raw.prompt_tokens ?? raw.inputTokens ?? 0
  const output = raw.output_tokens ?? raw.completion_tokens ?? raw.outputTokens ?? 0
  const cached = raw.cached_input_tokens ?? raw.cache_read_input_tokens ?? raw.cache_read_tokens ?? raw.cachedTokens ?? 0
  const total = raw.total_tokens ?? raw.totalTokens ?? (input + output)
  return {
    prompt_tokens: Number(input) || 0,
    completion_tokens: Number(output) || 0,
    total_tokens: Number(total) || (Number(input) || 0) + (Number(output) || 0),
    input_tokens: Number(input) || 0,
    output_tokens: Number(output) || 0,
    cache_read_input_tokens: Number(cached) || 0,
  }
}

// ==================== Chat Completions Implementation ====================

function formatOpenAIMessagesToPrompt(messages, imageCollector) {
  const parts = []
  for (const msg of messages || []) {
    const role = (msg.role || 'user').toUpperCase()
    if (typeof msg.content === 'string') {
      parts.push(`[${role}]\n${msg.content}`)
    }
    else if (Array.isArray(msg.content)) {
      const textSegments = []
      for (const block of msg.content) {
        if (typeof block === 'string') {
          textSegments.push(block)
        }
        else if (block?.type === 'text' && block.text) {
          textSegments.push(block.text)
        }
        else if (block?.type === 'image_url') {
          const url = typeof block.image_url === 'string' ? block.image_url : block.image_url?.url
          if (url) {
            imageCollector.push(url)
            textSegments.push(`[Attached image #${imageCollector.length}]`)
          }
        }
      }
      parts.push(`[${role}]\n${textSegments.join('\n')}`)
    }
  }
  return parts.join('\n\n')
}

async function handleChatCompletions(body, res) {
  const requestedModel = body.model || 'agy:default'
  const { engine, model } = parseLocalModelTarget(requestedModel)
  const stream = Boolean(body.stream)

  if (!['agy', 'codex', 'grok', 'workbuddy'].includes(engine)) {
    sendJson(res, 400, { error: { message: `Unsupported local model target: ${requestedModel}. Use agy:<model>, codex:<model>, grok:<model>, or workbuddy:<model>.` } })
    return
  }

  const bin = engine === 'agy'
    ? findAgyBinary()
    : engine === 'codex'
      ? findCodexBinary()
      : engine === 'grok'
        ? findGrokBinary()
        : findWorkBuddyBinaryInfo().bin

  if (!bin) {
    sendJson(res, 503, { error: { message: `本机未检测到 ${engine} CLI，请先安装并登录后重试。` } })
    return
  }

  const scratch = mkdtempSync(join(tmpdir(), `foldframe-chat-${engine}-`))
  try {
    const imageUrls = []
    let promptText = formatOpenAIMessagesToPrompt(body.messages, imageUrls)

    const schemaObj = body.response_format?.type === 'json_schema'
      ? body.response_format?.json_schema?.schema
      : null
    let schemaFile = null
    if (schemaObj) {
      schemaFile = join(scratch, 'schema.json')
      writeFileSync(schemaFile, JSON.stringify(schemaObj, null, 2), 'utf8')
    }
    else if (body.response_format?.type === 'json_object') {
      promptText += '\n\nReturn ONLY a valid JSON object without markdown fences.'
    }

    const downloadedImages = []
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const localPath = await materializeMediaUrl(imageUrls[i], join(scratch, 'images'), `img-${i}`)
        downloadedImages.push(localPath)
      }
      catch {}
    }

    if ((engine === 'agy' || engine === 'grok' || engine === 'workbuddy') && downloadedImages.length > 0) {
      promptText += `\n\nLocal reference image files:\n${downloadedImages.map((p, idx) => `- Image ${idx + 1}: ${p}`).join('\n')}`
    }

    const outLastFile = join(scratch, 'last-message.txt')
    const workdir = join(scratch, 'work')
    ensureDir(workdir)

    const codexSpec = engine === 'codex' ? resolveCodexInvocationOptions(model) : null
    let args
    if (engine === 'agy') {
      args = [
        '--output-format', 'stream-json',
        '--disable-slash-commands',
        ...(model ? ['--model', model] : []),
        ...(schemaFile ? ['--json-schema', schemaFile] : []),
        '-p', promptText,
      ]
    }
    else if (engine === 'codex') {
      args = [
        '--ask-for-approval', 'never',
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox', 'read-only',
        '--disable', 'plugins',
        '--disable', 'apps',
        '--disable', 'computer_use',
        '--disable', 'multi_agent',
        '--disable', 'hooks',
        '--disable', 'memories',
        '--disable', 'shell_tool',
        '--disable', 'unified_exec',
        '--json',
        '--output-last-message', outLastFile,
        ...(codexSpec?.effortArg ? ['-c', `model_reasoning_effort="${codexSpec.effortArg}"`] : []),
        ...(codexSpec?.modelArg ? ['--model', codexSpec.modelArg] : []),
        ...(schemaFile ? ['--output-schema', schemaFile] : []),
        ...downloadedImages.flatMap(file => ['--image', file]),
        '-',
      ]
    }
    else if (engine === 'grok') {
      args = [
        ...(schemaObj
          ? ['--json-schema', JSON.stringify(schemaObj)]
          : ['--output-format', 'streaming-json']),
        '--no-memory',
        '--no-subagents',
        '--disable-web-search',
        '--tools', '',
        ...(model ? ['--model', model] : []),
        '-p', promptText,
      ]
    }
    else {
      // workbuddy
      args = [
        '-p', promptText,
        '--output-format', schemaObj ? 'json' : 'stream-json',
        ...(!schemaObj ? ['--include-partial-messages'] : []),
        '--tools', '',
        ...(model && model !== 'auto' ? ['--model', model] : []),
        ...(schemaObj ? ['--json-schema', JSON.stringify(schemaObj)] : []),
      ]
    }

    const completionId = `chatcmpl-${randomBytes(8).toString('hex')}`
    const created = Math.floor(Date.now() / 1000)

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      })
    }

    const child = engine === 'workbuddy'
      ? spawnWorkBuddyProcess(args, { cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn(bin, args, {
          cwd: workdir,
          env: childEnv(),
          stdio: ['pipe', 'pipe', 'pipe'],
        })

    if (engine === 'codex') {
      child.stdin.write(promptText)
      child.stdin.end()
    }
    else {
      child.stdin.end()
    }

    let stderr = ''
    let rawStdout = ''
    let buffer = ''
    let fullText = ''
    let finalResultText = ''
    let streamError = ''
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    let emittedAnyDelta = false

    const emitDelta = (text) => {
      if (!text) return
      fullText += text
      emittedAnyDelta = true
      if (stream && !res.writableEnded) {
        const chunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: requestedModel,
          choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    }

    const handleParsedEvent = (ev) => {
      if (ev.type === 'text_delta') emitDelta(ev.text)
      else if (ev.type === 'usage' && ev.usage) usage = ev.usage
      else if (ev.type === 'result') {
        if (ev.usage) usage = ev.usage
        if (ev.text) finalResultText = ev.text
        if (ev.isError && ev.error) streamError = ev.error
      }
      else if (ev.type === 'error' && ev.message) {
        streamError = ev.message
      }
    }

    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
    child.stdout.on('data', (chunk) => {
      const textChunk = chunk.toString('utf8')
      rawStdout += textChunk
      buffer += textChunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        for (const ev of parseEngineStreamLine(engine, line)) {
          handleParsedEvent(ev)
        }
      }
    })

    const exitCode = await new Promise((resolveExit) => {
      child.on('error', err => { stderr += `\n${err.message}`; resolveExit(-1) })
      child.on('close', code => resolveExit(code ?? -1))
    })

    if (buffer.trim()) {
      for (const ev of parseEngineStreamLine(engine, buffer)) {
        handleParsedEvent(ev)
      }
    }

    if (engine === 'codex' && existsSync(outLastFile)) {
      const last = readFileSync(outLastFile, 'utf8').trim()
      if (last) finalResultText = last
    }

    // Multi-line JSON fallback (e.g. grok --json-schema or workbuddy --output-format json)
    if (!finalResultText && !fullText && rawStdout.trim()) {
      if (/Authentication required\. Please use \/login/i.test(rawStdout)) {
        streamError = 'WorkBuddy 尚未登录，请在「模型接入」页面点击 WorkBuddy「一键网页登录」完成授权。'
      }
      else {
        const parsedJson = extractJsonFromOutput(rawStdout)
        if (parsedJson && typeof parsedJson === 'object') {
          if (parsedJson.usage) usage = normalizeUsage(parsedJson.usage) || usage
          const structured = parsedJson.structuredOutput ?? parsedJson.structured_output
          if (structured !== undefined) {
            finalResultText = typeof structured === 'string' ? structured : JSON.stringify(structured)
          }
          else if (typeof parsedJson.text === 'string' && parsedJson.text.trim()) {
            finalResultText = parsedJson.text.trim()
          }
          else if (typeof parsedJson.result === 'string' && parsedJson.result.trim()) {
            finalResultText = parsedJson.result.trim()
          }
        }
      }
    }

    const answer = (finalResultText || fullText).trim()
    if ((exitCode !== 0 || streamError) && !answer) {
      const errMsg = streamError || summarizeCliError(stderr, rawStdout, exitCode)
      if (stream) {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: { message: errMsg } })}\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
        }
      }
      else {
        sendJson(res, 502, { error: { message: errMsg } })
      }
      return
    }

    if (stream) {
      if (!emittedAnyDelta && answer) emitDelta(answer)
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: requestedModel,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage,
        })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      }
      return
    }

    sendJson(res, 200, {
      id: completionId,
      object: 'chat.completion',
      created,
      model: requestedModel,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: answer },
        finish_reason: 'stop',
      }],
      usage,
    })
  }
  finally {
    try { rmSync(scratch, { recursive: true, force: true }) } catch {}
  }
}

// ==================== Native Local Agent Runtime (with MCP!) ====================

function prepareAgentWorkspace(runId, mcpUrl, skillsDir) {
  const safeId = String(runId || randomBytes(8).toString('hex')).replace(/[^a-zA-Z0-9_-]/g, '_')
  const workspace = join(DATA_DIR, 'workspaces', safeId)
  ensureDir(workspace)
  // Mark isolated workspace boundary so agy discovers workspace plugins right here instead of walking up to parent repos
  ensureDir(join(workspace, '.git'))

  // Official Antigravity workspace plugin bundle (.agents/plugins/foldframe/mcp_config.json)
  // Uses Streamable HTTP `url` (with legacy `serverUrl` kept in fallback root config)
  const agyPluginMcpConfig = {
    mcpServers: {
      foldframe: {
        url: mcpUrl,
      },
    },
  }
  const agyPluginDir = join(workspace, '.agents', 'plugins', 'foldframe')
  ensureDir(agyPluginDir)
  writeFileSync(join(agyPluginDir, 'plugin.json'), JSON.stringify({ name: 'foldframe' }, null, 2), 'utf8')
  if (mcpUrl) {
    writeFileSync(join(agyPluginDir, 'mcp_config.json'), JSON.stringify(agyPluginMcpConfig, null, 2), 'utf8')
  }
  const pluginSkillsTarget = join(agyPluginDir, 'skills')
  if (skillsDir && existsSync(skillsDir) && !existsSync(pluginSkillsTarget)) {
    try { symlinkSync(skillsDir, pluginSkillsTarget, 'dir') } catch {}
  }

  for (const dirName of ['.agents', '.antigravity']) {
    const dir = join(workspace, dirName)
    ensureDir(dir)
    if (mcpUrl) {
      writeFileSync(join(dir, 'mcp_config.json'), JSON.stringify(agyPluginMcpConfig, null, 2), 'utf8')
    }
    const skillsTarget = join(dir, 'skills')
    if (skillsDir && existsSync(skillsDir) && !existsSync(skillsTarget)) {
      try { symlinkSync(skillsDir, skillsTarget, 'dir') } catch {}
    }
  }

  // Codex workspace skills symlink
  const codexDir = join(workspace, '.codex')
  ensureDir(codexDir)
  const codexSkills = join(codexDir, 'skills')
  if (skillsDir && existsSync(skillsDir) && !existsSync(codexSkills)) {
    try { symlinkSync(skillsDir, codexSkills, 'dir') } catch {}
  }

  // Grok workspace MCP project config (.grok/config.toml)
  if (mcpUrl) {
    const grokDir = join(workspace, '.grok')
    ensureDir(grokDir)
    const escapedUrl = mcpUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    writeFileSync(
      join(grokDir, 'config.toml'),
      `[mcp_servers.foldframe]\nurl = "${escapedUrl}"\nenabled = true\n`,
      'utf8',
    )
    // WorkBuddy MCP JSON config
    writeFileSync(
      join(workspace, 'workbuddy-mcp.json'),
      JSON.stringify({
        mcpServers: {
          foldframe: {
            type: 'http',
            url: mcpUrl,
          },
        },
      }, null, 2),
      'utf8',
    )
  }

  return workspace
}

async function handleAgentRun(body, req, res) {
  const runId = String(body.runId || randomBytes(8).toString('hex'))
  const engine = ['agy', 'codex', 'grok', 'workbuddy'].includes(body.engine) ? body.engine : 'agy'
  const model = normalizeEngineModel(engine, body.model)
  const sessionId = body.sessionId ? String(body.sessionId) : undefined
  const mcpUrl = String(body.mcpUrl || '')
  const skillsDir = body.skillsDir && existsSync(body.skillsDir) ? body.skillsDir : DEFAULT_SKILLS_DIR

  const bin = engine === 'agy'
    ? findAgyBinary()
    : engine === 'codex'
      ? findCodexBinary()
      : engine === 'grok'
        ? findGrokBinary()
        : findWorkBuddyBinaryInfo().bin

  if (!bin) {
    sendJson(res, 503, { error: { message: `本机未安装 ${engine} CLI，请先在宿主机安装并登录后重试。` } })
    return
  }

  const workspace = prepareAgentWorkspace(runId, mcpUrl, skillsDir)
  const attachmentsDir = join(workspace, 'attachments')
  const downloadedImages = []
  for (let i = 0; i < (body.imageUrls || []).length; i++) {
    try {
      const localPath = await materializeMediaUrl(body.imageUrls[i], attachmentsDir, `ref-${i}`)
      downloadedImages.push(localPath)
    }
    catch {}
  }

  let combinedPrompt = ''
  if (body.systemPrompt && !sessionId) {
    combinedPrompt += `${body.systemPrompt}\n\n---\n\n`
  }
  combinedPrompt += String(body.prompt || '')
  if ((engine === 'agy' || engine === 'grok' || engine === 'workbuddy') && downloadedImages.length > 0) {
    combinedPrompt += `\n\nLocal reference media files:\n${downloadedImages.map((p, idx) => `- File ${idx + 1}: ${p}`).join('\n')}`
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  })

  const sendEvent = (event) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  }

  const keepaliveTimer = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n')
    }
  }, 15000)
  keepaliveTimer.unref?.()

  const outLastFile = join(workspace, `last-${Date.now()}.txt`)
  let args
  if (engine === 'agy') {
    args = [
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      ...(model ? ['--model', model] : []),
      ...(sessionId ? ['--conversation', sessionId] : []),
      '-p', combinedPrompt,
    ]
  }
  else if (engine === 'grok') {
    args = [
      '--output-format', 'streaming-json',
      '--always-approve',
      '--cwd', workspace,
      ...(model ? ['--model', model] : []),
      ...(sessionId ? ['--resume', sessionId] : []),
      '-p', combinedPrompt,
    ]
  }
  else if (engine === 'workbuddy') {
    const wbMcpFile = join(workspace, 'workbuddy-mcp.json')
    args = [
      '-p', combinedPrompt,
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '-y',
      ...(mcpUrl && existsSync(wbMcpFile) ? ['--mcp-config', wbMcpFile] : []),
      ...(model && model !== 'auto' ? ['--model', model] : []),
      ...(sessionId ? ['--resume', sessionId] : []),
    ]
  }
  else {
    const codexSpec = resolveCodexInvocationOptions(model)
    const mcpOverride = mcpUrl
      ? [
          '-c', `mcp_servers.foldframe.url="${mcpUrl.replace(/"/g, '\\"')}"`,
          '-c', 'mcp_servers.foldframe.default_tools_approval_mode="approve"',
          '-c', 'mcp_servers.foldframe.tool_timeout_sec=300',
        ]
      : []
    const effortOverride = codexSpec.effortArg
      ? ['-c', `model_reasoning_effort="${codexSpec.effortArg}"`]
      : []
    const codexSafetyFlags = [
      '--disable', 'computer_use',
      '--disable', 'shell_tool',
      '--disable', 'unified_exec',
    ]
    if (sessionId) {
      args = [
        '--ask-for-approval', 'never',
        'exec', 'resume',
        '--json',
        '--skip-git-repo-check',
        ...codexSafetyFlags,
        '--output-last-message', outLastFile,
        ...mcpOverride,
        ...effortOverride,
        ...(codexSpec.modelArg ? ['--model', codexSpec.modelArg] : []),
        ...downloadedImages.flatMap(file => ['--image', file]),
        sessionId,
        '-',
      ]
    }
    else {
      args = [
        '--ask-for-approval', 'never',
        'exec',
        '--json',
        '--skip-git-repo-check',
        '--sandbox', 'read-only',
        ...codexSafetyFlags,
        '-C', workspace,
        '--output-last-message', outLastFile,
        ...mcpOverride,
        ...effortOverride,
        ...(codexSpec.modelArg ? ['--model', codexSpec.modelArg] : []),
        ...downloadedImages.flatMap(file => ['--image', file]),
        '-',
      ]
    }
  }

  const child = engine === 'workbuddy'
    ? spawnWorkBuddyProcess(args, { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(bin, args, {
        cwd: workspace,
        env: childEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
  activeRuns.set(runId, child)

  req.on('close', () => {
    if (!res.writableEnded && activeRuns.get(runId) === child) {
      try { child.kill('SIGTERM') } catch {}
    }
  })

  if (engine === 'codex') {
    child.stdin.write(combinedPrompt)
    child.stdin.end()
  }
  else {
    child.stdin.end()
  }

  let stderr = ''
  let stdoutBuf = ''
  let capturedSessionId = sessionId
  let capturedUsage
  let finalText = ''
  let sawResultEvent = false
  let streamedAnyText = false

  const dispatchParsed = (ev) => {
    if (ev.type === 'session' && ev.sessionId) {
      capturedSessionId = ev.sessionId
      sendEvent({ type: 'session', sessionId: ev.sessionId })
    }
    else if (ev.type === 'text_delta' && ev.text) {
      streamedAnyText = true
      finalText += ev.text
      sendEvent(ev)
    }
    else if (ev.type === 'tool_use' || ev.type === 'tool_result') {
      sendEvent(ev)
    }
    else if (ev.type === 'usage' && ev.usage) {
      capturedUsage = ev.usage
    }
    else if (ev.type === 'result') {
      sawResultEvent = true
      if (ev.sessionId) capturedSessionId = ev.sessionId
      if (ev.usage) capturedUsage = ev.usage
      if (ev.text && !streamedAnyText) {
        sendEvent({ type: 'text_delta', text: ev.text })
        finalText = ev.text
      }
      sendEvent({
        type: 'result',
        text: ev.text || finalText,
        sessionId: capturedSessionId,
        usage: capturedUsage,
        costUsd: ev.costUsd,
        isError: ev.isError,
        error: ev.error,
      })
    }
    else if (ev.type === 'error') {
      sendEvent(ev)
    }
  }

  child.stderr.on('data', chunk => { stderr += chunk.toString('utf8') })
  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString('utf8')
    const lines = stdoutBuf.split(/\r?\n/)
    stdoutBuf = lines.pop() || ''
    for (const line of lines) {
      for (const ev of parseEngineStreamLine(engine, line)) dispatchParsed(ev)
    }
  })

  const exitCode = await new Promise((resolveExit) => {
    child.on('error', err => { stderr += `\n${err.message}`; resolveExit(-1) })
    child.on('close', code => resolveExit(code ?? -1))
  })
  activeRuns.delete(runId)
  clearInterval(keepaliveTimer)

  if (stdoutBuf.trim()) {
    for (const ev of parseEngineStreamLine(engine, stdoutBuf)) dispatchParsed(ev)
  }

  if (engine === 'codex' && existsSync(outLastFile)) {
    const last = readFileSync(outLastFile, 'utf8').trim()
    if (last) {
      if (!streamedAnyText) sendEvent({ type: 'text_delta', text: last })
      finalText = last
    }
  }

  if (!sawResultEvent) {
    if (exitCode !== 0 && !finalText) {
      sendEvent({
        type: 'error',
        message: summarizeCliError(stderr, '', exitCode),
      })
    }
    else {
      sendEvent({
        type: 'result',
        text: finalText,
        sessionId: capturedSessionId,
        usage: capturedUsage,
        isError: false,
      })
    }
  }

  if (!res.writableEnded) {
    res.write('data: [DONE]\n\n')
    res.end()
  }
}

// ==================== Dreamina (即梦 AI CLI) Image & Video ====================

const dreaminaVideoCreditBefore = new Map()

async function probeDreaminaCredits(bin) {
  try {
    const creditRes = await execCapture(bin, ['user_credit'], { timeoutMs: 5000 })
    const creditJson = extractJsonFromOutput(creditRes.stdout) || extractJsonFromOutput(creditRes.stderr)
    if (!creditJson || typeof creditJson !== 'object') return null
    const rawCredit = creditJson.total_credit
      ?? creditJson.credit
      ?? creditJson.credits
      ?? creditJson.remaining_credit
      ?? creditJson.data?.total_credit
      ?? creditJson.data?.credit
      ?? creditJson.data?.credits
    const num = Number(rawCredit)
    return Number.isFinite(num) ? num : null
  }
  catch {
    return null
  }
}

export function computeCreditsDelta(before, after, nativeCost) {
  if (typeof nativeCost === 'number' && Number.isFinite(nativeCost) && nativeCost >= 0) {
    return Math.round(nativeCost * 100) / 100
  }
  if (typeof before === 'number' && typeof after === 'number' && Number.isFinite(before) && Number.isFinite(after) && before >= after) {
    return Math.round((before - after) * 100) / 100
  }
  return undefined
}

export function parseDreaminaTaskResponse(rawText) {
  const json = extractJsonFromOutput(rawText)
  if (!json || typeof json !== 'object') {
    const submitMatch = String(rawText || '').match(/submit_id["'\s:=]+([a-zA-Z0-9_-]{8,})/i)
    return {
      raw: rawText,
      submitId: submitMatch?.[1] || null,
      status: null,
      urls: [],
      error: null,
    }
  }

  const root = json.data && typeof json.data === 'object' ? json.data : json
  const submitId = root.submit_id || json.submit_id || root.task_id || json.task_id || root.id || null
  const rawStatus = root.gen_status || root.status || json.gen_status || json.status || ''
  const statusLower = String(rawStatus).toLowerCase()

  let status = 'in_progress'
  if (['success', 'succeeded', 'completed', 'done', 'finish', 'finished'].includes(statusLower)) {
    status = 'completed'
  }
  else if (['fail', 'failed', 'error', 'canceled', 'cancelled', 'rejected'].includes(statusLower)) {
    status = 'failed'
  }

  const urls = []
  const collectUrls = (node) => {
    if (!node) return
    if (typeof node === 'string' && /^https?:\/\//i.test(node)) {
      urls.push(node)
      return
    }
    if (Array.isArray(node)) {
      for (const item of node) collectUrls(item)
      return
    }
    if (typeof node === 'object') {
      for (const key of ['video_url', 'image_url', 'url', 'download_url', 'file_url', 'play_url']) {
        if (typeof node[key] === 'string' && /^https?:\/\//i.test(node[key])) {
          urls.push(node[key])
        }
      }
      for (const key of ['results', 'images', 'videos', 'items', 'list', 'outputs', 'media', 'files', 'data']) {
        if (node[key] !== undefined && node[key] !== node) collectUrls(node[key])
      }
    }
  }
  collectUrls(root)

  const errMsg = root.fail_msg || root.error_msg || root.error?.message || json.error?.message || json.message
  const isErrorObj = Boolean(status === 'failed' || (json.code && json.code !== 0 && !submitId))

  const rawCreditsCost = root.commerce_info?.credit_count
    ?? json.commerce_info?.credit_count
    ?? root.cost_credit
    ?? root.credit_cost
    ?? root.used_credit
    ?? root.credits_used
    ?? json.cost_credit
    ?? json.credit_cost
  const nativeCreditsCost = rawCreditsCost != null && Number.isFinite(Number(rawCreditsCost)) ? Number(rawCreditsCost) : undefined

  return {
    raw: json,
    submitId: submitId ? String(submitId) : null,
    status: rawStatus ? status : null,
    urls: [...new Set(urls)],
    duration: Number(root.duration || root.video_duration || 0) || undefined,
    creditsCost: nativeCreditsCost,
    error: isErrorObj ? String(errMsg || '即梦生成失败') : null,
  }
}

async function lookupDreaminaTaskCredit(bin, submitId) {
  if (!bin || !submitId) return undefined
  try {
    const listRes = await execCapture(bin, ['list_task'], { timeoutMs: 6000 })
    const parsed = extractJsonFromOutput(listRes.stdout)
    const tasks = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : [])
    const matched = tasks.find(t => t && String(t.submit_id || '') === String(submitId))
    const raw = matched?.commerce_info?.credit_count
    if (raw != null && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
      return Number(raw)
    }
  }
  catch {}
  return undefined
}

function collectLocalFiles(dir, extensions) {
  if (!existsSync(dir)) return []
  const results = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && extensions.includes(extname(entry.name).toLowerCase())) {
        results.push(full)
      }
    }
  }
  walk(dir)
  return results.sort()
}

async function handleDreaminaImageGenerate(body, res) {
  const bin = findBinary('dreamina', 'DREAMINA_BIN')
  if (!bin) {
    sendJson(res, 503, { error: { message: '本机未检测到即梦 dreamina CLI，请先安装并执行 dreamina login。' } })
    return
  }

  const prompt = String(body.prompt || '').trim()
  if (!prompt) {
    sendJson(res, 400, { error: { message: 'Missing prompt' } })
    return
  }

  const refUrls = Array.isArray(body.referenceImageUrls) ? body.referenceImageUrls.filter(Boolean).slice(0, 10) : []
  const isEdit = refUrls.length > 0
  const modelVersion = normalizeDreaminaImageModel(body.modelVersion || body.model, isEdit)
  const resolutionType = normalizeDreaminaImageResolution(body.resolutionType || body.imageSize || '2k', modelVersion)
  const ratio = normalizeDreaminaRatio(body.aspectRatio, false)
  const count = Math.min(10, Math.max(1, Number.parseInt(String(body.count ?? body.n ?? 1), 10) || 1))

  const scratch = mkdtempSync(join(tmpdir(), 'foldframe-dreamina-img-'))
  const outDir = join(scratch, 'out')
  ensureDir(outDir)

  try {
    const creditsBefore = await probeDreaminaCredits(bin)
    const args = []
    if (isEdit) {
      const localRefs = []
      for (let i = 0; i < refUrls.length; i++) {
        localRefs.push(await materializeMediaUrl(refUrls[i], join(scratch, 'refs'), `ref-${i}`, '.png'))
      }
      args.push('image2image')
      for (const refPath of localRefs) {
        args.push('--images', refPath)
      }
    }
    else {
      args.push('text2image')
    }

    args.push(
      '--prompt', prompt,
      '--ratio', ratio,
      '--resolution_type', resolutionType,
      '--model_version', modelVersion,
      '--generate_num', String(count),
      '--poll', '90',
    )

    const submitRes = await execCapture(bin, args, { timeoutMs: 130000 })
    const parsedSubmit = parseDreaminaTaskResponse(`${submitRes.stdout}\n${submitRes.stderr}`)
    if (!parsedSubmit.submitId) {
      const rawMsg = parsedSubmit.error || submitRes.stderr.trim() || submitRes.stdout.trim() || `dreamina exited with code ${submitRes.code}`
      const msg = /未检测到有效登录态|not logged in|please login/i.test(rawMsg)
        ? '即梦账号尚未登录或登录已失效，请前往「模型接入」点击「一键网页登录」完成授权'
        : `即梦生图提交失败：${rawMsg.slice(0, 500)}`
      sendJson(res, 502, { error: { message: msg } })
      return
    }

    const submitId = parsedSubmit.submitId
    let status = parsedSubmit.status || 'in_progress'
    let remoteUrls = parsedSubmit.urls || []
    let lastError = parsedSubmit.error
    let nativeCreditsCost = parsedSubmit.creditsCost

    const deadline = Date.now() + 240000
    while (Date.now() < deadline) {
      const qRes = await execCapture(bin, ['query_result', `--submit_id=${submitId}`, `--download_dir=${outDir}`], { timeoutMs: 30000 })
      const parsedQ = parseDreaminaTaskResponse(`${qRes.stdout}\n${qRes.stderr}`)
      if (parsedQ.urls.length > 0) remoteUrls = parsedQ.urls
      if (parsedQ.status) status = parsedQ.status
      if (parsedQ.error) lastError = parsedQ.error
      if (parsedQ.creditsCost != null) nativeCreditsCost = parsedQ.creditsCost

      const localFiles = collectLocalFiles(outDir, ['.png', '.jpg', '.jpeg', '.webp'])
      if (status === 'completed' || localFiles.length > 0) {
        status = 'completed'
        break
      }
      if (status === 'failed') {
        break
      }
      await new Promise(r => setTimeout(r, 2500))
    }

    if (status === 'failed') {
      sendJson(res, 502, { error: { message: `即梦生图失败：${lastError || '任务失败'}` } })
      return
    }

    const localFiles = collectLocalFiles(outDir, ['.png', '.jpg', '.jpeg', '.webp'])
    const images = []

    for (const filePath of localFiles) {
      const buf = readFileSync(filePath)
      images.push({
        b64_json: buf.toString('base64'),
        mimeType: guessMimeFromPath(filePath, 'image/png'),
        filename: filePath.split('/').pop(),
      })
    }

    if (images.length === 0 && remoteUrls.length > 0) {
      for (let i = 0; i < Math.min(remoteUrls.length, count); i++) {
        const fetched = await fetch(remoteUrls[i], { signal: AbortSignal.timeout(30000) })
        if (fetched.ok) {
          const buf = Buffer.from(await fetched.arrayBuffer())
          images.push({
            b64_json: buf.toString('base64'),
            mimeType: fetched.headers.get('content-type') || 'image/png',
            filename: `dreamina-${i}.png`,
          })
        }
      }
    }

    if (images.length === 0) {
      sendJson(res, 504, { error: { message: `即梦生图超时或未返回图片（submit_id: ${submitId}）` } })
      return
    }

    const officialTaskCost = nativeCreditsCost ?? await lookupDreaminaTaskCredit(bin, submitId)
    const creditsAfter = await probeDreaminaCredits(bin)
    const creditsUsed = computeCreditsDelta(creditsBefore, creditsAfter, officialTaskCost)
    invalidateEnginesCache()

    sendJson(res, 200, {
      submitId,
      modelVersion,
      images,
      ...(creditsUsed !== undefined ? { creditsUsed } : {}),
      ...(creditsAfter != null ? { creditsRemaining: creditsAfter } : {}),
    })
  }
  finally {
    try { rmSync(scratch, { recursive: true, force: true }) } catch {}
  }
}

async function handleDreaminaVideoSubmit(body, res) {
  const bin = findBinary('dreamina', 'DREAMINA_BIN')
  if (!bin) {
    sendJson(res, 503, { error: { message: '本机未检测到即梦 dreamina CLI，请先安装并执行 dreamina login。' } })
    return
  }

  const prompt = String(body.prompt || '').trim()
  const modelVersion = normalizeDreaminaVideoModel(body.modelVersion || body.model)
  const videoResolution = normalizeDreaminaVideoResolution(body.resolution, modelVersion)
  const duration = normalizeDreaminaVideoDuration(body.duration, modelVersion)
  const ratio = normalizeDreaminaRatio(body.aspectRatio || body.ratio, true)
  const mode = String(body.mode || '').trim()

  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter(Boolean) : []
  const videoUrls = Array.isArray(body.videoUrls) ? body.videoUrls.filter(Boolean) : []
  const audioUrls = Array.isArray(body.audioUrls) ? body.audioUrls.filter(Boolean) : []

  const scratch = mkdtempSync(join(tmpdir(), 'foldframe-dreamina-vid-'))
  try {
    const creditsBefore = await probeDreaminaCredits(bin)
    const localImages = []
    const localVideos = []
    const localAudios = []
    for (let i = 0; i < imageUrls.length; i++) {
      localImages.push(await materializeMediaUrl(imageUrls[i], scratch, `img-${i}`, '.png'))
    }
    for (let i = 0; i < videoUrls.length; i++) {
      localVideos.push(await materializeMediaUrl(videoUrls[i], scratch, `vid-${i}`, '.mp4'))
    }
    for (let i = 0; i < audioUrls.length; i++) {
      localAudios.push(await materializeMediaUrl(audioUrls[i], scratch, `aud-${i}`, '.mp3'))
    }

    let subcommand = 'text2video'
    const args = []

    if (localVideos.length > 0 || localAudios.length > 0 || localImages.length > 2 || mode === 'multi-ref') {
      subcommand = 'multimodal2video'
      args.push(subcommand)
      for (const p of localImages) args.push('--image', p)
      for (const p of localVideos) args.push('--video', p)
      for (const p of localAudios) args.push('--audio', p)
      if (prompt) args.push('--prompt', prompt)
      args.push('--ratio', ratio)
    }
    else if (localImages.length === 2 || mode === 'flf2video') {
      subcommand = 'frames2video'
      args.push(subcommand, '--first', localImages[0], '--last', localImages[1] || localImages[0])
      if (prompt) args.push('--prompt', prompt)
    }
    else if (localImages.length === 1 || mode === 'image2video') {
      subcommand = 'image2video'
      args.push(subcommand, '--image', localImages[0], '--prompt', prompt || 'Smooth cinematic camera motion')
    }
    else {
      subcommand = 'text2video'
      args.push(subcommand, '--prompt', prompt, '--ratio', ratio)
    }

    args.push(
      '--duration', String(duration),
      '--video_resolution', videoResolution,
      '--model_version', modelVersion,
      '--poll', '0',
    )

    const submitRes = await execCapture(bin, args, { timeoutMs: 90000 })
    const parsed = parseDreaminaTaskResponse(`${submitRes.stdout}\n${submitRes.stderr}`)
    if (!parsed.submitId) {
      const rawMsg = parsed.error || submitRes.stderr.trim() || submitRes.stdout.trim() || `dreamina exited with code ${submitRes.code}`
      const msg = /未检测到有效登录态|not logged in|please login/i.test(rawMsg)
        ? '即梦账号尚未登录或登录已失效，请前往「模型接入」点击「一键网页登录」完成授权'
        : `即梦生视频提交失败：${rawMsg.slice(0, 500)}`
      sendJson(res, 502, { error: { message: msg } })
      return
    }

    if (creditsBefore != null) {
      dreaminaVideoCreditBefore.set(parsed.submitId, { credits: creditsBefore, createdAt: Date.now() })
      // Prune entries older than 2 hours
      const cutoff = Date.now() - 2 * 60 * 60 * 1000
      for (const [k, v] of dreaminaVideoCreditBefore.entries()) {
        if (v.createdAt < cutoff) dreaminaVideoCreditBefore.delete(k)
      }
    }

    sendJson(res, 200, {
      submitId: parsed.submitId,
      status: 'in_progress',
      subcommand,
      modelVersion,
      duration,
      resolution: videoResolution,
    })
  }
  finally {
    try { rmSync(scratch, { recursive: true, force: true }) } catch {}
  }
}

async function handleDreaminaVideoStatus(submitId, res) {
  const bin = findBinary('dreamina', 'DREAMINA_BIN')
  if (!bin) {
    sendJson(res, 503, { error: { message: '本机未检测到即梦 dreamina CLI。' } })
    return
  }

  const safeId = submitId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const outDir = join(DATA_DIR, 'dreamina-videos', safeId)
  ensureDir(outDir)

  const qRes = await execCapture(bin, ['query_result', `--submit_id=${submitId}`, `--download_dir=${outDir}`], { timeoutMs: 60000 })
  const parsed = parseDreaminaTaskResponse(`${qRes.stdout}\n${qRes.stderr}`)
  const localVideos = collectLocalFiles(outDir, ['.mp4', '.mov', '.webm'])

  if (localVideos.length > 0) {
    const token = registerHostedFile(localVideos[0], guessMimeFromPath(localVideos[0], 'video/mp4'))
    const beforeEntry = dreaminaVideoCreditBefore.get(submitId)
    dreaminaVideoCreditBefore.delete(submitId)
    const officialTaskCost = parsed.creditsCost ?? await lookupDreaminaTaskCredit(bin, submitId)
    const creditsAfter = await probeDreaminaCredits(bin)
    const creditsUsed = computeCreditsDelta(beforeEntry?.credits ?? null, creditsAfter, officialTaskCost)
    invalidateEnginesCache()
    sendJson(res, 200, {
      submitId,
      status: 'completed',
      fileUrl: `/v1/dreamina/files/${token}`,
      remoteUrl: parsed.urls[0] || undefined,
      duration: parsed.duration,
      ...(creditsUsed !== undefined ? { creditsUsed } : {}),
      ...(creditsAfter != null ? { creditsRemaining: creditsAfter } : {}),
    })
    return
  }

  if (parsed.status === 'completed' && parsed.urls.length > 0) {
    const beforeEntry = dreaminaVideoCreditBefore.get(submitId)
    dreaminaVideoCreditBefore.delete(submitId)
    const officialTaskCost = parsed.creditsCost ?? await lookupDreaminaTaskCredit(bin, submitId)
    const creditsAfter = await probeDreaminaCredits(bin)
    const creditsUsed = computeCreditsDelta(beforeEntry?.credits ?? null, creditsAfter, officialTaskCost)
    invalidateEnginesCache()
    sendJson(res, 200, {
      submitId,
      status: 'completed',
      remoteUrl: parsed.urls[0],
      duration: parsed.duration,
      ...(creditsUsed !== undefined ? { creditsUsed } : {}),
      ...(creditsAfter != null ? { creditsRemaining: creditsAfter } : {}),
    })
    return
  }

  if (parsed.status === 'failed') {
    dreaminaVideoCreditBefore.delete(submitId)
    sendJson(res, 200, {
      submitId,
      status: 'failed',
      error: parsed.error || '即梦视频生成失败',
    })
    return
  }

  sendJson(res, 200, {
    submitId,
    status: 'in_progress',
  })
}

// ==================== Codex CLI Native GPT Image 2 Generation ====================

async function handleCodexImageGenerate(body, res) {
  const { bin } = findCodexBinaryInfo()
  if (!bin) {
    sendJson(res, 503, { error: { message: '本机未检测到 Codex CLI，请先安装 ChatGPT 桌面端或 Codex CLI 并在「模型接入」完成登录。' } })
    return
  }

  const prompt = String(body.prompt || '').trim()
  if (!prompt) {
    sendJson(res, 400, { error: { message: 'Missing prompt' } })
    return
  }

  const refUrls = Array.isArray(body.referenceImageUrls) ? body.referenceImageUrls.filter(Boolean).slice(0, 6) : []
  const aspectRatio = String(body.aspectRatio || '1:1').trim() || '1:1'
  const imageSize = String(body.imageSize || '2K').trim().toUpperCase() || '2K'
  const count = Math.min(4, Math.max(1, Number.parseInt(String(body.count ?? body.n ?? 1), 10) || 1))

  const scratch = mkdtempSync(join(tmpdir(), 'foldframe-codex-img-'))
  let threadId = null

  try {
    const localRefs = []
    for (let i = 0; i < refUrls.length; i++) {
      localRefs.push(await materializeMediaUrl(refUrls[i], join(scratch, 'refs'), `ref-${i}`, '.png'))
    }

    const codexSpec = resolveCodexInvocationOptions(undefined)
    const qualityHint = imageSize === '1K' ? 'medium' : 'high'
    const refInstruction = localRefs.length > 0
      ? `Use the ${localRefs.length} attached input image(s) as visual reference/edit source.`
      : 'Generate a brand-new raster image from scratch.'
    const countInstruction = count > 1
      ? `Call the built-in image_gen tool ${count} separate times to produce ${count} distinct variations.`
      : 'Call the built-in image_gen tool exactly once.'

    const instruction = [
      'You are an image generation runner. Execute the built-in `image_gen` tool directly right now.',
      'Rules:',
      '- MUST use the built-in `image_gen` tool (ChatGPT account mode). NEVER use scripts/image_gen.py, NEVER ask for OPENAI_API_KEY, and NEVER output SVG/HTML/code.',
      `- ${countInstruction}`,
      `- ${refInstruction}`,
      `- Target aspect ratio: ${aspectRatio}. Target resolution/quality: ${imageSize} (${qualityHint}).`,
      '- Keep your final text response to one short sentence after image generation completes.',
      '',
      'User prompt:',
      prompt,
    ].join('\n')

    const args = [
      '--ask-for-approval', 'never',
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--enable', 'image_generation',
      '--disable', 'plugins',
      '--disable', 'apps',
      '--disable', 'computer_use',
      '--disable', 'multi_agent',
      '--disable', 'shell_tool',
      '--disable', 'unified_exec',
      '--json',
      ...(codexSpec?.effortArg ? ['-c', `model_reasoning_effort="${codexSpec.effortArg}"`] : []),
      ...(codexSpec?.modelArg ? ['--model', codexSpec.modelArg] : []),
      ...localRefs.flatMap(file => ['--image', file]),
      '-',
    ]

    const runRes = await execCapture(bin, args, {
      cwd: scratch,
      stdinText: instruction,
      timeoutMs: Math.min(360000, 120000 + count * 60000),
    })

    for (const line of `${runRes.stdout || ''}`.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) continue
      try {
        const ev = JSON.parse(trimmed)
        if (ev.type === 'thread.started' && ev.thread_id) {
          threadId = String(ev.thread_id)
          break
        }
      }
      catch {}
    }

    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
    const genDir = threadId ? join(codexHome, 'generated_images', threadId) : null
    const generatedFiles = genDir && existsSync(genDir)
      ? collectLocalFiles(genDir, ['.png', '.jpg', '.jpeg', '.webp'])
      : []

    if (generatedFiles.length === 0) {
      const errDetail = summarizeCliError(runRes.stderr, runRes.stdout, runRes.code)
      const hint = /not logged in|login|unauthorized|auth/i.test(errDetail)
        ? '本机 Codex / ChatGPT 登录态已失效，请前往「模型接入」点击「一键网页登录」重新授权。'
        : `Codex 本机生图未返回图片：${errDetail || '请确认本机 ChatGPT 账号支持生图并重试'}`
      sendJson(res, 502, { error: { message: hint } })
      return
    }

    const images = generatedFiles.slice(0, count).map((filePath, idx) => {
      const buf = readFileSync(filePath)
      return {
        b64_json: buf.toString('base64'),
        mimeType: guessMimeFromPath(filePath, 'image/png'),
        filename: `codex-gpt-image-2-${idx + 1}${extname(filePath) || '.png'}`,
      }
    })

    sendJson(res, 200, {
      threadId: threadId || `codex-${Date.now()}`,
      modelVersion: 'codex-gpt-image-2',
      creditsUsed: 0,
      images,
    })
  }
  finally {
    try { rmSync(scratch, { recursive: true, force: true }) } catch {}
    if (threadId) {
      const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
      try { rmSync(join(codexHome, 'generated_images', threadId), { recursive: true, force: true }) } catch {}
    }
  }
}

// ==================== Interactive Browser OAuth Login (Dreamina & Codex) ====================

export function parseDreaminaLoginOutput(rawText) {
  const text = String(rawText || '')
  const pick = (key) => {
    const m = text.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'im'))
    return m ? m[1].trim() : ''
  }
  const verificationUri = pick('verification_uri') || (text.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || '')
  const userCode = pick('user_code')
  const deviceCode = pick('device_code')
  const pollRaw = pick('poll_interval')
  const pollSecMatch = pollRaw.match(/(\d+)/)
  const pollIntervalSec = pollSecMatch ? Math.max(1, Number.parseInt(pollSecMatch[1], 10)) : 2
  const expiresAt = pick('expires_at')
  return {
    verificationUri,
    userCode,
    deviceCode,
    pollIntervalSec,
    expiresAt,
  }
}

async function handleDreaminaAuthStart(body, res) {
  const bin = findBinary('dreamina', 'DREAMINA_BIN')
  if (!bin) {
    sendJson(res, 200, {
      ok: false,
      status: 'not_installed',
      detail: '本机尚未安装即梦 CLI（dreamina），请点击「查看 1 分钟安装指引」。',
    })
    return
  }

  const force = Boolean(body?.force)
  const subcmd = force ? 'relogin' : 'login'
  const run = await execCapture(bin, [subcmd, '--headless'], { timeoutMs: 20000 })
  const combined = `${run.stdout}\n${run.stderr}`.trim()
  const parsed = parseDreaminaLoginOutput(combined)

  if (parsed.deviceCode && parsed.verificationUri) {
    sendJson(res, 200, {
      ok: true,
      status: 'pending',
      verificationUri: parsed.verificationUri,
      userCode: parsed.userCode,
      deviceCode: parsed.deviceCode,
      pollIntervalSec: parsed.pollIntervalSec,
      expiresAt: parsed.expiresAt || undefined,
      detail: '已生成即梦网页授权链接，请在浏览器中完成确认。',
    })
    return
  }

  // If already logged in, dreamina login --headless succeeds without issuing a new device_code
  if (run.code === 0) {
    const engine = await detectDreamina()
    if (engine.loggedIn) {
      sendJson(res, 200, {
        ok: true,
        status: 'authorized',
        detail: `已登录即梦账号${engine.credits != null ? `（剩余积分 ${engine.credits}）` : ''}`,
        engine,
      })
      return
    }
  }

  sendJson(res, 200, {
    ok: false,
    status: 'error',
    detail: summarizeCliError(run.stderr, run.stdout, run.code) || '无法获取即梦授权链接，请重试。',
  })
}

async function handleDreaminaAuthPoll(body, res) {
  const bin = findBinary('dreamina', 'DREAMINA_BIN')
  if (!bin) {
    sendJson(res, 200, { ok: false, status: 'not_installed', detail: '未检测到 dreamina CLI' })
    return
  }
  const deviceCode = String(body?.deviceCode || '').trim()
  if (!deviceCode) {
    sendJson(res, 400, { error: { message: 'deviceCode is required' } })
    return
  }

  const run = await execCapture(bin, ['login', 'checklogin', `--device_code=${deviceCode}`, '--poll=0'], { timeoutMs: 12000 })
  const combined = `${run.stdout}\n${run.stderr}`.trim()

  if (run.code === 0) {
    const engine = await detectDreamina()
    sendJson(res, 200, {
      ok: true,
      status: 'authorized',
      detail: `即梦登录成功！${engine.credits != null ? `当前剩余积分 ${engine.credits}` : ''}`,
      engine,
    })
    return
  }

  if (/尚未完成|pending|authorization_pending|slow_down|稍后重试/i.test(combined)) {
    sendJson(res, 200, {
      ok: true,
      status: 'pending',
      detail: '等待在即梦网页点击「确认授权」...',
    })
    return
  }

  if (/expired|过期|invalid|denied|拒绝/i.test(combined)) {
    sendJson(res, 200, {
      ok: false,
      status: 'expired',
      detail: '授权链接已过期或被取消，请点击「重新获取授权」。',
    })
    return
  }

  sendJson(res, 200, {
    ok: false,
    status: 'error',
    detail: summarizeCliError(run.stderr, run.stdout, run.code),
  })
}

async function handleDreaminaAuthLogout(res) {
  const bin = findBinary('dreamina', 'DREAMINA_BIN')
  if (!bin) {
    sendJson(res, 200, { ok: false, detail: '未检测到 dreamina CLI' })
    return
  }
  await execCapture(bin, ['logout'], { timeoutMs: 10000 })
  const engine = await detectDreamina()
  sendJson(res, 200, {
    ok: true,
    detail: '已退出当前即梦账号，可重新点击「一键登录即梦」切换账号。',
    engine,
  })
}

async function handleCodexAuthStart(res) {
  const bin = findCodexBinary()
  if (!bin) {
    sendJson(res, 200, { ok: false, status: 'not_installed', detail: '本机尚未安装 Codex CLI' })
    return
  }

  // Stop any previous device-auth process
  const prev = activeAuthProcesses.get('codex')
  if (prev) {
    try { prev.kill('SIGTERM') } catch {}
    activeAuthProcesses.delete('codex')
  }

  const child = spawn(bin, ['login', '--device-auth'], {
    cwd: REPO_ROOT,
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  activeAuthProcesses.set('codex', child)
  const killTimer = setTimeout(() => {
    if (activeAuthProcesses.get('codex') === child) {
      try { child.kill('SIGTERM') } catch {}
      activeAuthProcesses.delete('codex')
    }
  }, 10 * 60 * 1000)
  killTimer.unref?.()
  child.on('close', () => {
    clearTimeout(killTimer)
    if (activeAuthProcesses.get('codex') === child) {
      activeAuthProcesses.delete('codex')
    }
  })

  const collected = await new Promise((resolveOut) => {
    let text = ''
    let settled = false
    const check = () => {
      if (settled) return
      const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      const urlMatch = clean.match(/https:\/\/[^\s"'<>]+/i)
      const codeMatch = clean.match(/\b([A-Z0-9]{4,5}-[A-Z0-9]{4,5})\b/)
      if (urlMatch && codeMatch) {
        settled = true
        clearTimeout(timer)
        resolveOut({ verificationUri: urlMatch[0], userCode: codeMatch[1], raw: clean })
      }
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      const urlMatch = clean.match(/https:\/\/[^\s"'<>]+/i)
      const codeMatch = clean.match(/\b([A-Z0-9]{4,5}-[A-Z0-9]{4,5})\b/)
      resolveOut({ verificationUri: urlMatch?.[0] || '', userCode: codeMatch?.[1] || '', raw: clean })
    }, 8000)
    child.stdout.on('data', d => { text += d.toString('utf8'); check() })
    child.stderr.on('data', d => { text += d.toString('utf8'); check() })
    child.on('close', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        resolveOut({ verificationUri: '', userCode: '', raw: clean, closed: true })
      }
    })
  })

  if (collected.verificationUri) {
    sendJson(res, 200, {
      ok: true,
      status: 'pending',
      verificationUri: collected.verificationUri,
      userCode: collected.userCode,
      pollIntervalSec: 3,
      detail: '已生成 Codex 授权页，请在浏览器输入上方验证码并确认登录。',
    })
    return
  }

  const engine = await detectCodex()
  if (engine.loggedIn) {
    sendJson(res, 200, { ok: true, status: 'authorized', detail: 'Codex 已完成登录！', engine })
    return
  }

  sendJson(res, 200, {
    ok: false,
    status: 'error',
    detail: collected.raw.trim().slice(-240) || '未能获取 Codex 网页授权链接，请重试。',
  })
}

async function handleCodexAuthStatus(res) {
  const engine = await detectCodex()
  sendJson(res, 200, {
    ok: true,
    status: engine.loggedIn ? 'authorized' : 'pending',
    detail: engine.loggedIn ? `Codex 已登录（${engine.accountLabel || '就绪'}）` : '等待在浏览器完成 Codex 授权...',
    engine,
  })
}

export function parseGrokDeviceAuthOutput(rawText) {
  const clean = String(rawText || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  const urlMatch = clean.match(/https:\/\/accounts\.x\.ai\/[^\s"'<>]+|https:\/\/auth\.x\.ai\/[^\s"'<>]+|https:\/\/[^\s"'<>]+/i)
  const verificationUri = urlMatch?.[0] || ''
  let userCode = ''
  if (verificationUri) {
    try {
      const parsedUrl = new URL(verificationUri)
      const qCode = parsedUrl.searchParams.get('user_code')
      if (qCode) userCode = qCode.trim()
    }
    catch {}
  }
  if (!userCode) {
    const codeMatch = clean.match(/\b([A-Z0-9]{4,5}-[A-Z0-9]{4,5})\b/)
    if (codeMatch) userCode = codeMatch[1]
  }
  return { verificationUri, userCode }
}

async function handleGrokAuthStart(res) {
  const bin = findGrokBinary()
  if (!bin) {
    sendJson(res, 200, { ok: false, status: 'not_installed', detail: '本机尚未安装 Grok CLI' })
    return
  }

  const prev = activeAuthProcesses.get('grok')
  if (prev) {
    try { prev.kill('SIGTERM') } catch {}
    activeAuthProcesses.delete('grok')
  }

  const state = {
    startedAt: Date.now(),
    status: 'pending',
    error: '',
    verificationUri: '',
    userCode: '',
  }
  activeAuthStates.set('grok', state)

  const child = spawn(bin, ['login', '--device-auth'], {
    cwd: REPO_ROOT,
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  activeAuthProcesses.set('grok', child)

  const killTimer = setTimeout(() => {
    if (activeAuthProcesses.get('grok') === child) {
      try { child.kill('SIGTERM') } catch {}
      activeAuthProcesses.delete('grok')
      if (activeAuthStates.get('grok') === state && state.status === 'pending') {
        state.status = 'expired'
        state.error = 'Grok 网页授权已超时，请重新获取链接。'
      }
    }
  }, 10 * 60 * 1000)
  killTimer.unref?.()

  let rawOutput = ''
  const collected = await new Promise((resolveOut) => {
    let settled = false
    const tryResolve = (closed = false) => {
      if (settled) return
      const parsed = parseGrokDeviceAuthOutput(rawOutput)
      if (parsed.verificationUri && (parsed.userCode || closed)) {
        settled = true
        clearTimeout(timer)
        resolveOut({ ...parsed, raw: rawOutput, closed })
      }
      else if (closed) {
        settled = true
        clearTimeout(timer)
        resolveOut({ ...parsed, raw: rawOutput, closed: true })
      }
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const parsed = parseGrokDeviceAuthOutput(rawOutput)
      resolveOut({ ...parsed, raw: rawOutput, closed: false })
    }, 10000)

    child.stdout.on('data', (d) => {
      rawOutput += d.toString('utf8')
      tryResolve(false)
    })
    child.stderr.on('data', (d) => {
      rawOutput += d.toString('utf8')
      tryResolve(false)
    })
    child.on('error', (err) => {
      rawOutput += `\n${err.message}`
      if (activeAuthStates.get('grok') === state) {
        state.status = 'error'
        state.error = err.message
      }
      tryResolve(true)
    })
    child.on('close', (code) => {
      clearTimeout(killTimer)
      if (activeAuthProcesses.get('grok') === child) {
        activeAuthProcesses.delete('grok')
      }
      if (activeAuthStates.get('grok') === state && state.status === 'pending') {
        if (code === 0) {
          state.status = 'authorized'
          invalidateEnginesCache()
        }
        else {
          state.status = /expired|timeout/i.test(rawOutput) ? 'expired' : 'error'
          state.error = summarizeCliError(rawOutput, '', code ?? -1) || 'Grok 登录未完成，请重试。'
        }
      }
      tryResolve(true)
    })
  })

  if (collected.verificationUri) {
    state.verificationUri = collected.verificationUri
    state.userCode = collected.userCode
    sendJson(res, 200, {
      ok: true,
      status: 'pending',
      verificationUri: collected.verificationUri,
      userCode: collected.userCode || undefined,
      pollIntervalSec: 2,
      detail: '已生成 Grok 网页授权链接，请在浏览器中完成登录确认。',
    })
    return
  }

  if (state.status === 'authorized') {
    const engine = await detectGrok()
    sendJson(res, 200, { ok: true, status: 'authorized', detail: 'Grok 已完成网页登录！', engine })
    return
  }

  sendJson(res, 200, {
    ok: false,
    status: 'error',
    detail: state.error || collected.raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim().slice(-240) || '未能获取 Grok 网页授权链接，请重试。',
  })
}

async function handleGrokAuthStatus(res) {
  const state = activeAuthStates.get('grok')
  if (state) {
    if (state.status === 'pending') {
      sendJson(res, 200, {
        ok: true,
        status: 'pending',
        detail: '等待在浏览器确认 Grok 登录授权...',
      })
      return
    }
    if (state.status === 'authorized') {
      activeAuthStates.delete('grok')
      invalidateEnginesCache()
      const engine = await detectGrok()
      sendJson(res, 200, {
        ok: true,
        status: 'authorized',
        detail: `Grok 登录成功！当前默认模型 ${engine.effectiveDefaultModel || 'grok-4.7'}`,
        engine,
      })
      return
    }
    if (state.status === 'expired' || state.status === 'error') {
      const status = state.status
      const detail = state.error || 'Grok 授权已失效，请重新获取链接。'
      activeAuthStates.delete('grok')
      sendJson(res, 200, { ok: false, status, detail })
      return
    }
  }

  const engine = await detectGrok()
  sendJson(res, 200, {
    ok: true,
    status: engine.loggedIn ? 'authorized' : 'pending',
    detail: engine.loggedIn ? `Grok 已登录（${engine.effectiveDefaultModel || 'grok-4.7'}）` : '等待在浏览器完成 Grok 授权...',
    engine,
  })
}

async function handleGrokAuthLogout(res) {
  const prev = activeAuthProcesses.get('grok')
  if (prev) {
    try { prev.kill('SIGTERM') } catch {}
    activeAuthProcesses.delete('grok')
  }
  activeAuthStates.delete('grok')
  const bin = findGrokBinary()
  if (!bin) {
    sendJson(res, 200, { ok: false, detail: '未检测到 Grok CLI' })
    return
  }
  await execCapture(bin, ['logout'], { timeoutMs: 10000 })
  invalidateEnginesCache()
  const engine = await detectGrok()
  sendJson(res, 200, {
    ok: true,
    detail: '已退出当前 Grok 账号，可重新点击「一键网页登录」切换账号。',
    engine,
  })
}

async function handleWorkBuddyAuthStart(body, res) {
  const info = findWorkBuddyBinaryInfo()
  if (!info.bin) {
    sendJson(res, 200, { ok: false, status: 'not_installed', detail: '本机尚未安装腾讯 WorkBuddy（/Applications/WorkBuddy.app）' })
    return
  }

  const prev = activeAuthProcesses.get('workbuddy')
  if (prev) {
    try { prev.kill('SIGTERM') } catch {}
    activeAuthProcesses.delete('workbuddy')
  }

  const methodId = body?.methodId === 'external' ? 'external' : 'internal'
  const state = {
    startedAt: Date.now(),
    status: 'pending',
    error: '',
    verificationUri: '',
    accountLabel: '',
  }
  activeAuthStates.set('workbuddy', state)

  const child = spawnWorkBuddyProcess(
    ['--serve', '--acp', '--acp-transport', 'stdio', '--auth', 'none', '--port', '0'],
    {
      cwd: REPO_ROOT,
      env: { HEADLESS: '1', BROWSER: '/usr/bin/true' },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  activeAuthProcesses.set('workbuddy', child)

  const killTimer = setTimeout(() => {
    if (activeAuthProcesses.get('workbuddy') === child) {
      try { child.kill('SIGTERM') } catch {}
      activeAuthProcesses.delete('workbuddy')
      if (activeAuthStates.get('workbuddy') === state && state.status === 'pending') {
        state.status = 'expired'
        state.error = 'WorkBuddy 网页授权已超时，请重新获取链接。'
      }
    }
  }, 10 * 60 * 1000)
  killTimer.unref?.()

  const sendRpc = (obj) => {
    try {
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.write(`${JSON.stringify(obj)}\n`)
      }
    }
    catch {}
  }

  let initSent = false
  let authSent = false
  let stdoutBuf = ''
  let stderrBuf = ''

  const triggerInit = () => {
    if (initSent) return
    initSent = true
    sendRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: 1, clientCapabilities: {} },
    })
  }

  // Kick off ACP handshake once HTTP server banner prints, or after 1.5s fallback
  const initFallbackTimer = setTimeout(triggerInit, 1500)
  initFallbackTimer.unref?.()

  const collected = await new Promise((resolveOut) => {
    let settled = false
    const finishEarly = (result) => {
      if (settled) return
      settled = true
      clearTimeout(startTimeout)
      resolveOut(result)
    }

    const startTimeout = setTimeout(() => {
      finishEarly({ verificationUri: state.verificationUri, error: state.error })
    }, 15000)

    const processLine = (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      if (!initSent && /Press Ctrl\+C|Endpoint\s+http:\/\/127\.0\.0\.1:/i.test(trimmed)) {
        setTimeout(triggerInit, 150)
        return
      }
      if (!trimmed.startsWith('{')) return
      let msg
      try {
        msg = JSON.parse(trimmed)
      }
      catch {
        return
      }

      if (msg.id === 1 && msg.result && !authSent) {
        authSent = true
        sendRpc({
          jsonrpc: '2.0',
          id: 2,
          method: 'authenticate',
          params: { methodId },
        })
        return
      }

      if (msg.method === '_codebuddy.ai/authUrl' && msg.params?.authUrl) {
        state.verificationUri = String(msg.params.authUrl)
        finishEarly({ verificationUri: state.verificationUri })
        return
      }

      if (msg.id === 2) {
        if (msg.result) {
          const userInfo = msg.result?._meta?.['codebuddy.ai/userinfo']
          const nick = userInfo?.userNickname || userInfo?.userName || userInfo?.userId || ''
          if (nick) {
            state.accountLabel = String(nick)
            saveWorkBuddyMeta({ accountLabel: String(nick), loggedInAt: new Date().toISOString() })
          }
          state.status = 'authorized'
          invalidateEnginesCache()
          finishEarly({ verificationUri: state.verificationUri, authorized: true })
          setTimeout(() => {
            if (activeAuthProcesses.get('workbuddy') === child) {
              try { child.kill('SIGTERM') } catch {}
              activeAuthProcesses.delete('workbuddy')
            }
          }, 500)
        }
        else if (msg.error) {
          state.status = 'error'
          state.error = msg.error?.message || 'WorkBuddy 认证失败'
          finishEarly({ verificationUri: '', error: state.error })
        }
      }
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8')
      const lines = stdoutBuf.split(/\r?\n/)
      stdoutBuf = lines.pop() || ''
      for (const line of lines) processLine(line)
    })
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      state.status = 'error'
      state.error = err.message
      finishEarly({ verificationUri: '', error: err.message })
    })
    child.on('close', (code) => {
      clearTimeout(killTimer)
      clearTimeout(initFallbackTimer)
      if (activeAuthProcesses.get('workbuddy') === child) {
        activeAuthProcesses.delete('workbuddy')
      }
      if (stdoutBuf.trim()) processLine(stdoutBuf)
      if (activeAuthStates.get('workbuddy') === state && state.status === 'pending') {
        if (isWorkBuddyLoggedIn()) {
          state.status = 'authorized'
          invalidateEnginesCache()
        }
        else {
          state.status = 'error'
          state.error = summarizeCliError(stderrBuf, stdoutBuf, code ?? -1) || 'WorkBuddy 授权进程意外退出，请重试。'
        }
      }
      finishEarly({ verificationUri: state.verificationUri, error: state.error })
    })
  })

  if (collected.authorized || state.status === 'authorized') {
    const engine = await detectWorkBuddy()
    sendJson(res, 200, { ok: true, status: 'authorized', detail: 'WorkBuddy 已完成网页登录！', engine })
    return
  }

  if (collected.verificationUri) {
    sendJson(res, 200, {
      ok: true,
      status: 'pending',
      verificationUri: collected.verificationUri,
      pollIntervalSec: 2,
      detail: '已生成 WorkBuddy 网页授权链接，请在浏览器扫码或确认登录。',
    })
    return
  }

  sendJson(res, 200, {
    ok: false,
    status: 'error',
    detail: collected.error || state.error || '未能获取 WorkBuddy 网页登录链接，请重试。',
  })
}

async function handleWorkBuddyAuthStatus(res) {
  const state = activeAuthStates.get('workbuddy')
  if (state) {
    if (state.status === 'pending') {
      sendJson(res, 200, {
        ok: true,
        status: 'pending',
        detail: '等待在 WorkBuddy 网页完成扫码或确认授权...',
      })
      return
    }
    if (state.status === 'authorized') {
      activeAuthStates.delete('workbuddy')
      invalidateEnginesCache()
      const engine = await detectWorkBuddy()
      sendJson(res, 200, {
        ok: true,
        status: 'authorized',
        detail: `WorkBuddy 登录成功！${engine.accountLabel ? `（${engine.accountLabel}）` : ''}`,
        engine,
      })
      return
    }
    if (state.status === 'expired' || state.status === 'error') {
      const status = state.status
      const detail = state.error || 'WorkBuddy 授权已失效，请重新获取链接。'
      activeAuthStates.delete('workbuddy')
      sendJson(res, 200, { ok: false, status, detail })
      return
    }
  }

  const engine = await detectWorkBuddy()
  sendJson(res, 200, {
    ok: true,
    status: engine.loggedIn ? 'authorized' : 'pending',
    detail: engine.loggedIn ? `WorkBuddy 已登录（${engine.accountLabel || '就绪'}）` : '等待在浏览器完成 WorkBuddy 授权...',
    engine,
  })
}

async function handleWorkBuddyAuthLogout(res) {
  const prev = activeAuthProcesses.get('workbuddy')
  if (prev) {
    try { prev.kill('SIGTERM') } catch {}
    activeAuthProcesses.delete('workbuddy')
  }
  activeAuthStates.delete('workbuddy')
  const authDir = getWorkBuddyAuthDir()
  try {
    if (existsSync(authDir)) {
      rmSync(authDir, { recursive: true, force: true })
    }
    if (existsSync(WORKBUDDY_META_PATH)) {
      rmSync(WORKBUDDY_META_PATH, { force: true })
    }
  }
  catch {}
  invalidateEnginesCache()
  const engine = await detectWorkBuddy()
  sendJson(res, 200, {
    ok: true,
    detail: '已退出 Foldframe 的 WorkBuddy 登录态（不影响桌面端），可重新点击「一键网页登录」。',
    engine,
  })
}

// ==================== Connectivity Tests ====================

async function handleConnectionTest(body, res) {
  const kind = String(body.kind || '')
  const startedAt = Date.now()

  if (kind === 'dreamina') {
    const status = await detectDreamina()
    sendJson(res, 200, {
      ok: Boolean(status.installed && status.loggedIn),
      latencyMs: Date.now() - startedAt,
      detail: status.installed
        ? (status.loggedIn ? `已登录即梦账号（版本 ${status.version || '未知'}${status.credits != null ? `，剩余积分 ${status.credits}` : ''}）` : '尚未登录即梦，点击下方「一键登录即梦」即可在网页完成授权')
        : '未检测到 dreamina CLI',
      data: status,
    })
    return
  }

  if (kind === 'agy') {
    const bin = findAgyBinary()
    if (!bin) {
      sendJson(res, 200, { ok: false, latencyMs: Date.now() - startedAt, detail: '本机未检测到 agy CLI' })
      return
    }
    const model = normalizeEngineModel('agy', body.model)
    const scratch = mkdtempSync(join(tmpdir(), 'foldframe-test-agy-'))
    try {
      const args = ['--output-format', 'json', '--disable-slash-commands', ...(model ? ['--model', model] : []), '-p', 'Reply with exactly: OK']
      const run = await execCapture(bin, args, { cwd: scratch, timeoutMs: 45000 })
      const agyJson = extractJsonFromOutput(run.stdout)
      const reply = String(agyJson?.response ?? agyJson?.result?.response ?? run.stdout ?? '').trim()
      const ok = run.code === 0 && Boolean(reply)
      sendJson(res, 200, {
        ok,
        latencyMs: Date.now() - startedAt,
        reply: reply.slice(0, 120),
        detail: ok ? `连接成功（${Date.now() - startedAt}ms）：${reply.slice(0, 80)}` : summarizeCliError(run.stderr, run.stdout, run.code),
      })
    }
    finally {
      try { rmSync(scratch, { recursive: true, force: true }) } catch {}
    }
    return
  }

  if (kind === 'codex') {
    const bin = findCodexBinary()
    if (!bin) {
      sendJson(res, 200, { ok: false, latencyMs: Date.now() - startedAt, detail: '本机未检测到 codex CLI' })
      return
    }
    const requestedModel = normalizeEngineModel('codex', body.model)
    const spec = resolveCodexInvocationOptions(requestedModel)
    const attempts = []
    const seenEffective = new Set()
    if (requestedModel) {
      attempts.push({ model: requestedModel, effective: requestedModel, effort: spec.effortArg })
    }
    else {
      const firstEffective = spec.modelArg || spec.configuredModel || ''
      attempts.push({ model: spec.modelArg, effective: firstEffective, effort: spec.effortArg })
      if (firstEffective) seenEffective.add(firstEffective)
      for (const cand of spec.candidates) {
        if (!seenEffective.has(cand) && attempts.length < 6) {
          seenEffective.add(cand)
          attempts.push({ model: cand, effective: cand, effort: 'low' })
        }
      }
    }

    const scratch = mkdtempSync(join(tmpdir(), 'foldframe-test-codex-'))
    try {
      let lastError = ''
      let fallbackReasonModel = spec.fallbackFrom
      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i]
        const outFile = join(scratch, `out-${i}.txt`)
        const args = [
          '--ask-for-approval', 'never', 'exec', '--ephemeral', '--skip-git-repo-check',
          '--sandbox', 'read-only', '--disable', 'plugins', '--disable', 'apps',
          '--disable', 'shell_tool', '--disable', 'unified_exec',
          ...(attempt.effort ? ['-c', `model_reasoning_effort="${attempt.effort}"`] : []),
          '--output-last-message', outFile,
          ...(attempt.model ? ['--model', attempt.model] : []),
          'Reply with exactly: OK',
        ]
        const run = await execCapture(bin, args, { cwd: scratch, timeoutMs: 45000 })
        const reply = existsSync(outFile) ? readFileSync(outFile, 'utf8').trim() : ''
        if (run.code === 0 && reply) {
          const usedModel = attempt.model || spec.effectiveModel || 'default'
          if (!requestedModel && attempt.effective) {
            recordCodexModelVerified(attempt.effective)
          }
          const fallbackNote = fallbackReasonModel || (i > 0)
            ? `，已自动选用当前账号支持的 ${usedModel}`
            : (attempt.model ? `，模型 ${usedModel}` : '')
          sendJson(res, 200, {
            ok: true,
            latencyMs: Date.now() - startedAt,
            reply: reply.slice(0, 120),
            detail: `连接成功（${Date.now() - startedAt}ms${fallbackNote}）：${reply.slice(0, 80)}`,
            data: { effectiveModel: usedModel, fallbackFrom: fallbackReasonModel },
          })
          return
        }
        lastError = summarizeCliError(run.stderr, run.stdout, run.code)
        const isUnsupportedModel = /model.*not supported|model_not_found/i.test(lastError)
        if (!isUnsupportedModel) break
        if (attempt.effective) {
          recordCodexModelUnsupported(attempt.effective)
          if (!fallbackReasonModel) fallbackReasonModel = attempt.effective
        }
      }

      sendJson(res, 200, {
        ok: false,
        latencyMs: Date.now() - startedAt,
        reply: '',
        detail: lastError || 'Codex 连通测试失败，请确认已完成登录或尝试切换下方模型。',
      })
    }
    finally {
      try { rmSync(scratch, { recursive: true, force: true }) } catch {}
    }
    return
  }

  if (kind === 'grok') {
    const bin = findGrokBinary()
    if (!bin) {
      sendJson(res, 200, { ok: false, latencyMs: Date.now() - startedAt, detail: '本机未检测到 Grok CLI' })
      return
    }
    const meta = readGrokLocalMetadata()
    if (!meta.loggedIn) {
      sendJson(res, 200, { ok: false, latencyMs: Date.now() - startedAt, detail: 'Grok 尚未登录，请点击「一键网页登录」完成授权后再测试连通' })
      return
    }
    const model = normalizeEngineModel('grok', body.model)
    const scratch = mkdtempSync(join(tmpdir(), 'foldframe-test-grok-'))
    try {
      const args = [
        '--output-format', 'json',
        '--no-memory',
        '--no-subagents',
        '--disable-web-search',
        '--tools', '',
        ...(model ? ['--model', model] : []),
        '-p', 'Reply with exactly: OK',
      ]
      const run = await execCapture(bin, args, { cwd: scratch, timeoutMs: 45000 })
      const grokJson = extractJsonFromOutput(run.stdout)
      const reply = String(grokJson?.text ?? '').trim()
      const ok = run.code === 0 && Boolean(reply)
      const usedModel = model || Object.keys(grokJson?.modelUsage || {})[0] || meta.configuredModel || 'grok-4.7'
      sendJson(res, 200, {
        ok,
        latencyMs: Date.now() - startedAt,
        reply: reply.slice(0, 120),
        detail: ok
          ? `连接成功（${Date.now() - startedAt}ms，模型 ${usedModel}）：${reply.slice(0, 80)}`
          : summarizeCliError(run.stderr, run.stdout, run.code),
        data: { effectiveModel: usedModel },
      })
    }
    finally {
      try { rmSync(scratch, { recursive: true, force: true }) } catch {}
    }
    return
  }

  if (kind === 'workbuddy') {
    const info = findWorkBuddyBinaryInfo()
    if (!info.bin) {
      sendJson(res, 200, { ok: false, latencyMs: Date.now() - startedAt, detail: '本机未检测到腾讯 WorkBuddy（/Applications/WorkBuddy.app）' })
      return
    }
    if (!isWorkBuddyLoggedIn()) {
      sendJson(res, 200, { ok: false, latencyMs: Date.now() - startedAt, detail: 'WorkBuddy 尚未登录，请点击「一键网页登录」扫码或确认授权后再测试连通' })
      return
    }
    const model = normalizeEngineModel('workbuddy', body.model)
    const scratch = mkdtempSync(join(tmpdir(), 'foldframe-test-workbuddy-'))
    try {
      const args = [
        '-p', 'Reply with exactly: OK',
        '--output-format', 'json',
        '--tools', '',
        ...(model && model !== 'auto' ? ['--model', model] : []),
      ]
      const cmd = info.isNodeScript ? process.execPath : info.bin
      const finalArgs = info.isNodeScript ? [info.bin, ...args] : args
      const run = await execCapture(cmd, finalArgs, { cwd: scratch, timeoutMs: 45000, rawEnv: workbuddyChildEnv() })
      const combined = `${run.stdout}\n${run.stderr}`
      if (/Authentication required\. Please use \/login/i.test(combined)) {
        sendJson(res, 200, { ok: false, latencyMs: Date.now() - startedAt, detail: 'WorkBuddy 登录态已过期，请重新点击「一键网页登录」授权' })
        return
      }
      const wbJson = extractJsonFromOutput(run.stdout)
      const reply = String(wbJson?.result ?? wbJson?.text ?? run.stdout ?? '').trim()
      const ok = run.code === 0 && Boolean(reply) && !wbJson?.is_error
      sendJson(res, 200, {
        ok,
        latencyMs: Date.now() - startedAt,
        reply: reply.slice(0, 120),
        detail: ok
          ? `连接成功（${Date.now() - startedAt}ms${model ? `，模型 ${model}` : ''}）：${reply.slice(0, 80)}`
          : (wbJson?.error || summarizeCliError(run.stderr, run.stdout, run.code)),
      })
    }
    finally {
      try { rmSync(scratch, { recursive: true, force: true }) } catch {}
    }
    return
  }

  sendJson(res, 400, { error: { message: `Unsupported test kind: ${kind}` } })
}

// ==================== HTTP Server & Auth ====================

function isAuthorized(req) {
  if (!TOKEN) return false
  const auth = req.headers.authorization || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const xApiKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : ''
  const provided = bearer || xApiKey
  if (!provided) return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(TOKEN).digest()
  return timingSafeEqual(a, b)
}

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  const maxBytes = 25 * 1024 * 1024
  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) throw new Error('Request payload too large')
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

export function createBridgeServer() {
  ensureDir(DATA_DIR)
  const server = createServer(async (req, res) => {
    try {
      cleanupExpiredFiles()
      const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)
      const { pathname } = url

      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, { ok: true, pid: process.pid, port: PORT, uptimeSec: Math.floor(process.uptime()) })
        return
      }

      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: { message: 'Unauthorized local bridge request' } })
        return
      }

      if (req.method === 'GET' && pathname === '/v1/engines') {
        const forceRefresh = url.searchParams.get('refresh') === '1'
        const engines = await detectAllEngines(forceRefresh)
        sendJson(res, 200, { ok: true, engines })
        return
      }

      if (req.method === 'GET' && pathname === '/v1/models') {
        const engines = await detectAllEngines()
        const data = []
        if (engines.agy.installed) {
          for (const m of engines.agy.models) data.push({ id: `agy:${m}`, object: 'model', owned_by: 'antigravity-cli' })
        }
        if (engines.codex.installed) {
          for (const m of engines.codex.models) data.push({ id: `codex:${m}`, object: 'model', owned_by: 'codex-cli' })
        }
        if (engines.grok.installed) {
          for (const m of engines.grok.models) data.push({ id: `grok:${m}`, object: 'model', owned_by: 'grok-cli' })
        }
        if (engines.workbuddy.installed) {
          for (const m of engines.workbuddy.models) data.push({ id: `workbuddy:${m}`, object: 'model', owned_by: 'workbuddy' })
        }
        sendJson(res, 200, { object: 'list', data })
        return
      }

      if (req.method === 'POST' && pathname === '/v1/test') {
        invalidateEnginesCache()
        const body = await readJsonBody(req)
        await handleConnectionTest(body, res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/dreamina/auth/start') {
        invalidateEnginesCache()
        const body = await readJsonBody(req)
        await handleDreaminaAuthStart(body, res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/dreamina/auth/poll') {
        invalidateEnginesCache()
        const body = await readJsonBody(req)
        await handleDreaminaAuthPoll(body, res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/dreamina/auth/logout') {
        invalidateEnginesCache()
        await handleDreaminaAuthLogout(res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/codex/auth/start') {
        invalidateEnginesCache()
        await handleCodexAuthStart(res)
        return
      }

      if (req.method === 'GET' && pathname === '/v1/codex/auth/status') {
        invalidateEnginesCache()
        await handleCodexAuthStatus(res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/grok/auth/start') {
        invalidateEnginesCache()
        await handleGrokAuthStart(res)
        return
      }

      if (req.method === 'GET' && pathname === '/v1/grok/auth/status') {
        await handleGrokAuthStatus(res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/grok/auth/logout') {
        invalidateEnginesCache()
        await handleGrokAuthLogout(res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/workbuddy/auth/start') {
        invalidateEnginesCache()
        const body = await readJsonBody(req)
        await handleWorkBuddyAuthStart(body, res)
        return
      }

      if (req.method === 'GET' && pathname === '/v1/workbuddy/auth/status') {
        await handleWorkBuddyAuthStatus(res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/workbuddy/auth/logout') {
        invalidateEnginesCache()
        await handleWorkBuddyAuthLogout(res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/chat/completions') {
        const body = await readJsonBody(req)
        await handleChatCompletions(body, res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/agent/runs') {
        const body = await readJsonBody(req)
        await handleAgentRun(body, req, res)
        return
      }

      const abortMatch = pathname.match(/^\/v1\/agent\/runs\/([^/]+)\/abort$/)
      if (req.method === 'POST' && abortMatch) {
        const runId = decodeURIComponent(abortMatch[1])
        const child = activeRuns.get(runId)
        if (child) {
          try { child.kill('SIGTERM') } catch {}
          setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 1500)
          activeRuns.delete(runId)
        }
        sendJson(res, 200, { ok: true, aborted: Boolean(child) })
        return
      }

      if (req.method === 'POST' && pathname === '/v1/dreamina/images/generate') {
        const body = await readJsonBody(req)
        await handleDreaminaImageGenerate(body, res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/codex/images/generate') {
        const body = await readJsonBody(req)
        await handleCodexImageGenerate(body, res)
        return
      }

      if (req.method === 'POST' && pathname === '/v1/dreamina/videos/submit') {
        const body = await readJsonBody(req)
        await handleDreaminaVideoSubmit(body, res)
        return
      }

      const vidStatusMatch = pathname.match(/^\/v1\/dreamina\/videos\/([^/]+)$/)
      if (req.method === 'GET' && vidStatusMatch) {
        const submitId = decodeURIComponent(vidStatusMatch[1])
        await handleDreaminaVideoStatus(submitId, res)
        return
      }

      const fileMatch = pathname.match(/^\/v1\/dreamina\/files\/([a-f0-9]+)$/)
      if (req.method === 'GET' && fileMatch) {
        const entry = fileRegistry.get(fileMatch[1])
        if (!entry || !existsSync(entry.filePath)) {
          sendJson(res, 404, { error: { message: 'Media file not found or expired' } })
          return
        }
        const buf = readFileSync(entry.filePath)
        res.writeHead(200, {
          'Content-Type': entry.mimeType,
          'Content-Length': String(buf.length),
        })
        res.end(buf)
        return
      }

      sendJson(res, 404, { error: { message: `Not found: ${req.method} ${pathname}` } })
    }
    catch (error) {
      sendJson(res, 500, { error: { message: error instanceof Error ? error.message : String(error) } })
    }
  })

  server.requestTimeout = 0
  server.headersTimeout = 60000
  return server
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (!TOKEN) {
    console.error('[local-bridge] LOCAL_BRIDGE_TOKEN is required.')
    process.exit(1)
  }
  const server = createBridgeServer()
  server.listen(PORT, HOST, () => {
    console.log(`[local-bridge] listening on http://${HOST}:${PORT}`)
  })
  const shutdown = () => {
    for (const child of activeRuns.values()) {
      try { child.kill('SIGTERM') } catch {}
    }
    for (const child of activeAuthProcesses.values()) {
      try { child.kill('SIGTERM') } catch {}
    }
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
