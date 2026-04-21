let windowId = null

chrome.action.onClicked.addListener(async () => {
  // If window is already open, just focus it
  if (windowId !== null) {
    try {
      await chrome.windows.get(windowId)
      await chrome.windows.update(windowId, { focused: true })
      return
    } catch {
      windowId = null
    }
  }

  // Position it top-right of the last focused browser window
  let top = 80
  let left = 1200
  try {
    const win = await chrome.windows.getLastFocused()
    left = win.left + win.width - 340
    top = win.top + 60
  } catch {}

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL('index.html'),
    type: 'popup',
    width: 320,
    height: 420,
    top,
    left,
    focused: true,
  })
  windowId = created.id
})

// Clear the id when the window is closed
chrome.windows.onRemoved.addListener((id) => {
  if (id === windowId) windowId = null
})
