const statusText = document.getElementById('statusText')
const authBtn = document.getElementById('authBtn')
const openBtn = document.getElementById('openBtn')

function render(granted) {
  if (granted) {
    statusText.innerHTML = '<span class="dot ok"></span>已授权 PostPilot'
    authBtn.textContent = '取消本地授权'
  }
  else {
    statusText.innerHTML = '<span class="dot wait"></span>未授权工作台'
    authBtn.textContent = '立即授权当前 PostPilot 工作台'
  }
}

let currentGranted = false
chrome.runtime.sendMessage({ type: 'POSTPILOT_CHECK_PERMISSION' }, (res) => {
  currentGranted = Boolean(res?.granted)
  render(currentGranted)
})

authBtn.addEventListener('click', () => {
  const next = !currentGranted
  chrome.runtime.sendMessage({ type: 'POSTPILOT_SET_AUTHORIZED', granted: next }, (res) => {
    currentGranted = Boolean(res?.granted)
    render(currentGranted)
  })
})

openBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:8080/zh-CN' })
})
