/**
 * PostPilot Content Bridge — relays postMessage between page-bridge.js and service worker.
 */
(() => {
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('page-bridge.js')
  script.onload = () => script.remove()
  ;(document.head || document.documentElement).appendChild(script)

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.__postpilotExt !== 'req') return
    const { id, action, payload } = event.data

    const reply = (ok, data, error) => {
      window.postMessage({ __postpilotExt: 'res', id, ok, data, error }, '*')
    }

    if (action === 'checkPermission') {
      chrome.runtime.sendMessage({ type: 'POSTPILOT_CHECK_PERMISSION' }, (res) => {
        reply(true, { granted: Boolean(res?.granted), version: res?.version || '1.0.0' })
      })
      return
    }

    if (action === 'openCreator') {
      chrome.runtime.sendMessage({ type: 'POSTPILOT_OPEN_CREATOR', platform: payload?.platform }, (res) => {
        reply(true, res || { ok: true })
      })
      return
    }

    reply(false, null, `Unsupported action: ${action}`)
  })
})()
