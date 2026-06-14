import { useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

import { useDashboard } from '../store/useDashboard'
import { flyTo } from '../map/mapRef'
import type { Station } from '../types/bundle'

const MAX_RESULTS = 7

export function SearchBar() {
  const data = useDashboard((s) => s.data)
  const select = useDashboard((s) => s.select)
  const lineById = useDashboard((s) => s.data?.lineById)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    if (!data) return [] as Station[]
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    const starts: Station[] = []
    const contains: Station[] = []
    for (const s of data.stations) {
      const n = s.name.toLowerCase()
      if (n.startsWith(needle)) starts.push(s)
      else if (n.includes(needle)) contains.push(s)
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS)
  }, [data, q])

  if (!data || !lineById) return null

  const choose = (s: Station) => {
    select({ kind: 'station', id: s.id })
    flyTo(s.lng, s.lat, { zoom: Math.max(13.4, 13.4) })
    setQ('')
    setFocused(false)
    inputRef.current?.blur()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      if (results[active]) choose(results[active])
    } else if (e.key === 'Escape') {
      setQ('')
      inputRef.current?.blur()
    }
  }

  const open = focused && results.length > 0

  return (
    <div className={`search surface ${open ? 'open' : ''}`}>
      <div className="search-field">
        <Search size={15} className="search-ico" />
        <input
          ref={inputRef}
          value={q}
          placeholder="Search stations…"
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={onKey}
          spellCheck={false}
        />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear">
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <ul className="search-results">
          {results.map((s, i) => {
            const colours = s.lines.map((id) => lineById.get(id)?.colour ?? '#888')
            return (
              <li
                key={s.id}
                className={`search-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(s)
                }}
              >
                <span className="dots">
                  {colours.map((c, j) => (
                    <span key={j} className="sd" style={{ background: c }} />
                  ))}
                </span>
                <span className="search-name">{s.name}</span>
                {s.interchange && <span className="search-tag">interchange</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
