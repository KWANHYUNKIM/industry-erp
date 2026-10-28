import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { DEFAULT_DISPLAY_PREFS, toDisplayPrefs, type DisplayPrefs } from '../../utils/displayPrefs'

/** 기본값설정의 표시 값 — 한 번 읽어 두고 같이 쓴다. 기본값설정에서 저장하면 resetDisplayPrefs() 로 비운다. */
let cached: Promise<DisplayPrefs> | null = null

export function loadDisplayPrefs(): Promise<DisplayPrefs> {
  cached ??= api.get<Partial<DisplayPrefs> | null>('/preferences')
    .then((r) => toDisplayPrefs(r.data))
    .catch(() => { cached = null; return DEFAULT_DISPLAY_PREFS })
  return cached
}

export function resetDisplayPrefs() { cached = null }

export function useDisplayPrefs(): DisplayPrefs {
  const [p, setP] = useState<DisplayPrefs>(DEFAULT_DISPLAY_PREFS)
  useEffect(() => { let on = true; loadDisplayPrefs().then((v) => { if (on) setP(v) }); return () => { on = false } }, [])
  return p
}
