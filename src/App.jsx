import { useState, useEffect, useRef } from 'react'

const DEFAULTS = {
  pages: [''],
  currentPage: 0,
  bgColor: '#fff9c4',
  textColor: '#2c2c2c',
  fontSize: 13,
}

const MIN_FONT = 10
const MAX_FONT = 28

export default function App() {
  const [data, setData] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const expandedHeight = useRef(420)
  const saveTimer = useRef(null)

  // Load from storage on mount
  useEffect(() => {
    chrome.storage.local.get('stickyData', (res) => {
      if (res.stickyData) setData((prev) => ({ ...prev, ...res.stickyData }))
      setLoaded(true)
    })

    // Remember window height when user resizes
    const onResize = () => {
      if (!minimized) expandedHeight.current = window.outerHeight
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Auto-save whenever data changes
  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      chrome.storage.local.set({ stickyData: data })
    }, 300)
  }, [data, loaded])

  const update = (patch) => setData((prev) => ({ ...prev, ...patch }))

  const toggleMinimize = () => {
    const next = !minimized
    setMinimized(next)
    chrome.windows.getCurrent((win) => {
      chrome.windows.update(win.id, { height: next ? 42 : expandedHeight.current })
    })
  }

  const addPage = () => {
    const pages = [...data.pages]
    pages.splice(data.currentPage + 1, 0, '')
    update({ pages, currentPage: data.currentPage + 1 })
  }

  const deletePage = () => {
    if (data.pages.length === 1) return
    const pages = [...data.pages]
    pages.splice(data.currentPage, 1)
    update({ pages, currentPage: Math.min(data.currentPage, pages.length - 1) })
  }

  if (!loaded) return null

  const cur = data.currentPage
  const total = data.pages.length

  return (
    <div className="app" style={{ background: data.bgColor, color: data.textColor }}>

      {/* Header — double-click to minimize */}
      <header className="header" onDoubleClick={toggleMinimize}>
        <span className="title">📌 Sticky Note</span>
        <div className="header-btns">
          <button className="hbtn" onClick={toggleMinimize} title={minimized ? 'Expand' : 'Minimize'}>
            {minimized ? '▢' : '—'}
          </button>
          <button className="hbtn" onClick={() => window.close()} title="Close">✕</button>
        </div>
      </header>

      {!minimized && (
        <>
          {/* Note area */}
          <textarea
            className="textarea"
            value={data.pages[cur] ?? ''}
            placeholder="Start typing your notes…"
            autoFocus
            spellCheck
            style={{ fontSize: data.fontSize }}
            onChange={(e) => {
              const pages = [...data.pages]
              pages[cur] = e.target.value
              update({ pages })
            }}
          />

          {/* Footer */}
          <footer className="footer">
            {/* Page navigation */}
            <div className="page-nav">
              <button className="pbtn" disabled={cur === 0} onClick={() => update({ currentPage: cur - 1 })}>◀</button>
              <span className="page-label">{cur + 1} / {total}</span>
              <button className="pbtn" disabled={cur >= total - 1} onClick={() => update({ currentPage: cur + 1 })}>▶</button>
              <button className="pbtn" onClick={addPage} title="New page">＋</button>
              <button className="pbtn" disabled={total === 1} onClick={deletePage} title="Delete page">🗑</button>
            </div>

            {/* Font size + color pickers */}
            <div className="color-row">
              <button
                className="pbtn"
                onClick={() => update({ fontSize: Math.max(MIN_FONT, data.fontSize - 1) })}
                disabled={data.fontSize <= MIN_FONT}
                title="Decrease font size"
              >A−</button>
              <span className="page-label" style={{ minWidth: 24 }}>{data.fontSize}</span>
              <button
                className="pbtn"
                onClick={() => update({ fontSize: Math.min(MAX_FONT, data.fontSize + 1) })}
                disabled={data.fontSize >= MAX_FONT}
                title="Increase font size"
              >A+</button>

              <label className="cpick" title="Background color" style={{ background: data.bgColor }}>
                <input type="color" value={data.bgColor} onChange={(e) => update({ bgColor: e.target.value })} />
              </label>
              <label className="cpick text-cpick" title="Text color" style={{ borderColor: data.textColor, color: data.textColor }}>
                A
                <input type="color" value={data.textColor} onChange={(e) => update({ textColor: e.target.value })} />
              </label>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
