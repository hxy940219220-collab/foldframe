/**
 * PostPilot Browser Extension — Background Service Worker
 * Handles workspace authorization state and creator portal helpers locally.
 */
const CREATOR_URLS = {
  xhs: 'https://creator.xiaohongshu.com/publish/publish',
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
  wxSph: 'https://channels.weixin.qq.com/platform/post/create',
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false

  if (msg.type === 'POSTPILOT_CHECK_PERMISSION') {
    chrome.storage.local.get(['postpilot_authorized'], (res) => {
      sendResponse({ granted: Boolean(res.postpilot_authorized), version: '1.0.0', brand: 'PostPilot' })
    })
    return true
  }

  if (msg.type === 'POSTPILOT_SET_AUTHORIZED') {
    chrome.storage.local.set({ postpilot_authorized: Boolean(msg.granted) }, () => {
      sendResponse({ ok: true, granted: Boolean(msg.granted) })
    })
    return true
  }

  if (msg.type === 'POSTPILOT_OPEN_CREATOR') {
    const targetUrl = CREATOR_URLS[msg.platform] || CREATOR_URLS.xhs
    chrome.tabs.create({ url: targetUrl, active: true }, (tab) => {
      sendResponse({ ok: true, tabId: tab?.id, url: targetUrl })
    })
    return true
  }

  return false
})
