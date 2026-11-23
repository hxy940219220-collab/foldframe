import assert from 'node:assert/strict'
import test from 'node:test'

process.env.LOCAL_BRIDGE_TOKEN = 'test-secret-token-123'
process.env.LOCAL_WEB_PORT = '8080'

const bridge = await import('./local-bridge.mjs')

test('parseLocalModelTarget parses agy, codex, ollama prefixes', () => {
  assert.deepEqual(bridge.parseLocalModelTarget('agy:default'), { engine: 'agy', model: undefined })
  assert.deepEqual(bridge.parseLocalModelTarget('agy:gemini-3.1-pro-high'), { engine: 'agy', model: 'gemini-3.1-pro-high' })
  assert.deepEqual(bridge.parseLocalModelTarget('codex'), { engine: 'codex', model: undefined })
  assert.deepEqual(bridge.parseLocalModelTarget('codex:gpt-5.4'), { engine: 'codex', model: 'gpt-5.4' })
  assert.deepEqual(bridge.parseLocalModelTarget('ollama:qwen2.5:14b'), { engine: 'ollama', model: 'qwen2.5:14b' })
  assert.equal(bridge.normalizeEngineModel('codex', 'codex:default'), undefined)
  assert.equal(bridge.normalizeEngineModel('codex', 'codex:gpt-5.4'), 'gpt-5.4')
  assert.equal(bridge.normalizeEngineModel('codex', 'gpt-5.4'), 'gpt-5.4')
  assert.equal(bridge.normalizeEngineModel('agy', 'agy:default'), undefined)
  assert.equal(bridge.normalizeEngineModel('agy', 'agy:gemini-3.1-pro-high'), 'gemini-3.1-pro-high')
})

test('Dreamina parameter normalizers respect official CLI rules', () => {
  assert.equal(bridge.normalizeDreaminaImageModel('dreamina-5.0-pro'), '5.0Pro')
  assert.equal(bridge.normalizeDreaminaImageModel('dreamina-3.1', true), '5.0')
  assert.equal(bridge.normalizeDreaminaImageResolution('1K', '5.0'), '2k')
  assert.equal(bridge.normalizeDreaminaImageResolution('1K', '5.0Pro'), '1.5k')
  assert.equal(bridge.normalizeDreaminaImageResolution('4K', '3.1'), '2k')
  assert.equal(bridge.normalizeDreaminaRatio('4:5', false), '3:4')
  assert.equal(bridge.normalizeDreaminaRatio('adaptive', true), '16:9')

  assert.equal(bridge.normalizeDreaminaVideoModel('dreamina-seedance-2.0-fast'), 'seedance2.0fast')
  assert.equal(bridge.normalizeDreaminaVideoModel('dreamina-seedance-2.0-vip'), 'seedance2.0_vip')
  assert.equal(bridge.normalizeDreaminaVideoModel('dreamina-seedance-2.5'), 'seedance2.5')
  assert.equal(bridge.normalizeDreaminaVideoResolution('1080p', 'seedance2.0fast'), '720p')
  assert.equal(bridge.normalizeDreaminaVideoResolution('1080p', 'seedance2.0_vip'), '1080p')
  assert.equal(bridge.normalizeDreaminaVideoResolution('480p', 'seedance2.5'), '480p')
  assert.equal(bridge.normalizeDreaminaVideoDuration(25, 'seedance2.0fast'), 15)
  assert.equal(bridge.normalizeDreaminaVideoDuration(25, 'seedance2.5'), 25)
})

test('extractJsonFromOutput ignores CLI warning lines before JSON', () => {
  const dirty = 'initialize logs failed: mkdir /Users/x/.dreamina_cli: file exists\n{\n  "version": "1.0.0",\n  "submit_id": "abc-123"\n}'
  const parsed = bridge.extractJsonFromOutput(dirty)
  assert.equal(parsed?.version, '1.0.0')
  assert.equal(parsed?.submit_id, 'abc-123')
})

test('rewriteHostAccessibleUrl converts container hosts to host loopback', () => {
  assert.equal(
    bridge.rewriteHostAccessibleUrl('http://aitoearn-rustfs:9000/aitoearn/foo/bar.png'),
    'http://127.0.0.1:8080/oss/foo/bar.png',
  )
  assert.equal(
    bridge.rewriteHostAccessibleUrl('http://aitoearn-nginx/oss/a.mp4'),
    'http://127.0.0.1:8080/oss/a.mp4',
  )
})

test('parseAgyEventLine normalizes init, step_update MCP tools, and result', () => {
  const initEvents = bridge.parseAgyEventLine(JSON.stringify({ type: 'init', conversation_id: 'conv-42' }))
  assert.deepEqual(initEvents, [{ type: 'session', sessionId: 'conv-42' }])

  const toolCall = bridge.parseAgyEventLine(JSON.stringify({
    type: 'step_update',
    step_type: 'Step_McpTool',
    id: 'call-1',
    tool_name: 'generateImage',
    args: { prompt: 'sunset' },
  }))
  assert.equal(toolCall[0]?.type, 'tool_use')
  assert.equal(toolCall[0]?.name, 'generateImage')

  const resultEvents = bridge.parseAgyEventLine(JSON.stringify({
    type: 'result',
    conversation_id: 'conv-42',
    response: 'Done!',
    usage: { input_tokens: 120, output_tokens: 45 },
  }))
  assert.equal(resultEvents[0]?.type, 'result')
  assert.equal(resultEvents[0]?.text, 'Done!')
  assert.equal(resultEvents[0]?.usage?.total_tokens, 165)

  // agy v1.5+ nested {"event":"init"|"step_update"|"result"} format
  const v15Init = bridge.parseAgyEventLine(JSON.stringify({ event: 'init', conversation_id: 'conv-15' }))
  assert.deepEqual(v15Init, [{ type: 'session', sessionId: 'conv-15' }])
  const v15Delta = bridge.parseAgyEventLine(JSON.stringify({
    event: 'step_update',
    step_update: { conversation_id: 'conv-15', step_index: 1, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Hello' },
  }))
  assert.deepEqual(v15Delta, [{ type: 'text_delta', text: 'Hello' }])
  const v15Result = bridge.parseAgyEventLine(JSON.stringify({
    event: 'result',
    result: { conversation_id: 'conv-15', status: 'SUCCESS', response: 'Hello!', usage: { input_tokens: 100, output_tokens: 20, cache_read_tokens: 50 } },
  }))
  assert.equal(v15Result[0]?.type, 'result')
  assert.equal(v15Result[0]?.text, 'Hello!')
  assert.equal(v15Result[0]?.usage?.cache_read_input_tokens, 50)
})

test('parseCodexEventLine normalizes thread, mcp_tool_call, agent_message, and usage', () => {
  const started = bridge.parseCodexEventLine(JSON.stringify({ type: 'thread.started', thread_id: 'th-99' }))
  assert.deepEqual(started, [{ type: 'session', sessionId: 'th-99' }])

  const mcpStart = bridge.parseCodexEventLine(JSON.stringify({
    type: 'item.started',
    item: { id: 'it-1', type: 'mcp_tool_call', server: 'foldframe', tool: 'setTitle', arguments: { title: 'Test' } },
  }))
  assert.equal(mcpStart[0]?.type, 'tool_use')
  assert.equal(mcpStart[0]?.name, 'mcp__foldframe__setTitle')

  const msg = bridge.parseCodexEventLine(JSON.stringify({
    type: 'item.completed',
    item: { id: 'it-2', type: 'agent_message', text: 'Hello Foldframe' },
  }))
  assert.deepEqual(msg, [{ type: 'text_delta', text: 'Hello Foldframe' }])

  const turnDone = bridge.parseCodexEventLine(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 200, cached_input_tokens: 50, output_tokens: 80 },
  }))
  assert.equal(turnDone[0]?.type, 'usage')
  assert.equal(turnDone[0]?.usage?.total_tokens, 280)
})

test('detectAllEngines discovers installed host CLIs (codex & dreamina)', async () => {
  const engines = await bridge.detectAllEngines()
  assert.equal(engines.codex.installed, true)
  assert.equal(engines.dreamina.installed, true)
  assert.equal(typeof engines.agy.installed, 'boolean')
  assert.equal(typeof engines.ollama.running, 'boolean')
})

test('HTTP bridge enforces Bearer token auth when loopback sockets are permitted', async (t) => {
  const server = bridge.createBridgeServer()
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
  }
  catch (err) {
    t.skip(`loopback listen unavailable: ${err.code || err.message}`)
    return
  }

  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`

  try {
    let healthRes
    try {
      healthRes = await fetch(`${base}/health`)
    }
    catch (err) {
      if (err?.cause?.code === 'EPERM') {
        t.skip('loopback connect blocked in sandbox')
        return
      }
      throw err
    }
    assert.equal(healthRes.status, 200)
    const health = await healthRes.json()
    assert.equal(health.ok, true)

    const unauthRes = await fetch(`${base}/v1/engines`)
    assert.equal(unauthRes.status, 401)

    const authRes = await fetch(`${base}/v1/engines`, {
      headers: { Authorization: 'Bearer test-secret-token-123' },
    })
    assert.equal(authRes.status, 200)
    const body = await authRes.json()
    assert.equal(body.ok, true)
    assert.equal(body.engines.codex.installed, true)
    assert.equal(body.engines.dreamina.installed, true)
  }
  finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('parseDreaminaLoginOutput extracts OAuth device flow fields', () => {
  const sample = [
    '请使用浏览器完成 OAuth Device Flow 登录。',
    'verification_uri: https://jimeng.jianying.com/ai-tool/cli-auth?user_code=abc123',
    'user_code: abc123',
    'device_code: dev-999',
    'poll_interval: 2s',
    'expires_at: 2026-11-22T18:00:00-08:00',
  ].join('\n')
  const parsed = bridge.parseDreaminaLoginOutput(sample)
  assert.equal(parsed.verificationUri, 'https://jimeng.jianying.com/ai-tool/cli-auth?user_code=abc123')
  assert.equal(parsed.userCode, 'abc123')
  assert.equal(parsed.deviceCode, 'dev-999')
  assert.equal(parsed.pollIntervalSec, 2)
  assert.equal(parsed.expiresAt, '2026-11-22T18:00:00-08:00')
})

test('resolveCodexInvocationOptions selects a valid fallback when default model is unsupported', () => {
  const spec = bridge.resolveCodexInvocationOptions(undefined)
  assert.ok(spec.effectiveModel && typeof spec.effectiveModel === 'string')
  assert.ok(Array.isArray(spec.candidates))
})

test('computeCreditsDelta prefers native cost and otherwise computes non-negative delta', () => {
  assert.equal(bridge.computeCreditsDelta(9857, 9853, undefined), 4)
  assert.equal(bridge.computeCreditsDelta(9857, 9853, 6), 6)
  assert.equal(bridge.computeCreditsDelta(9857, 9857, 0), 0)
  assert.equal(bridge.computeCreditsDelta(100, 120, undefined), undefined)
  assert.equal(bridge.computeCreditsDelta(null, 9850, undefined), undefined)
})

test('Dreamina 1.4.22 normalizers support 5.0Pro 1.5k, seedance2.5 1080p, and commerce_info.credit_count', () => {
  assert.equal(bridge.normalizeDreaminaImageResolution('1K', '5.0Pro'), '1.5k')
  assert.equal(bridge.normalizeDreaminaImageResolution('2K', '5.0Pro'), '2k')
  assert.equal(bridge.normalizeDreaminaVideoResolution('1080p', 'seedance2.5'), '1080p')
  assert.equal(bridge.normalizeDreaminaVideoDuration(30, 'seedance2.5'), 30)
  const parsed = bridge.parseDreaminaTaskResponse(JSON.stringify({
    submit_id: 'sub-123',
    gen_status: 'success',
    commerce_info: { credit_count: 0 },
  }))
  assert.equal(parsed.creditsCost, 0)
})
