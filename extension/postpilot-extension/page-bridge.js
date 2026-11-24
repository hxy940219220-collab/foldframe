/**
 * PostPilot Page Bridge — exposes PostPilotPlugin & compatible AIToEarnPlugin interface on window.
 */
(() => {
  let reqSeq = 0
  const pending = new Map()

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.__postpilotExt !== 'res') return
    const { id, ok, data, error } = event.data
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    if (ok) entry.resolve(data)
    else entry.reject(new Error(error || 'PostPilot extension request failed'))
  })

  function callExt(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = `pp_${++reqSeq}_${Date.now()}`
      pending.set(id, { resolve, reject })
      window.postMessage({ __postpilotExt: 'req', id, action, payload }, '*')
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error('PostPilot 扩展响应超时'))
        }
      }, 8000)
    })
  }

  const api = {
    brand: 'PostPilot',
    version: '1.0.0',
    async checkPermission() {
      return await callExt('checkPermission')
    },
    async login(platform) {
      await callExt('openCreator', { platform })
      return null
    },
    async publish(params, onProgress) {
      onProgress?.({ stage: 'upload', progress: 30, message: '正在打开创作者发布后台…' })
      await callExt('openCreator', { platform: params?.platform || 'xhs' })
      onProgress?.({ stage: 'complete', progress: 100, message: '已打开目标创作者后台，请核对内容后点击发布' })
      return { success: true }
    },
  }

  window.PostPilotPlugin = api
  window.AIToEarnPlugin = api
})()
