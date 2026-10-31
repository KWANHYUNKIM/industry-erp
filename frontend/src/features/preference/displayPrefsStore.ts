import { useEffect, useState } from 'react'
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from '../../utils/displayPrefs'
import { loadDisplayPrefs } from '../../utils/displayPrefsStore'

/** 읽어 두는 일(캐시)은 utils/displayPrefsStore — 인쇄도 같은 값을 쓴다. */
export { loadDisplayPrefs, resetDisplayPrefs } from '../../utils/displayPrefsStore'

export function useDisplayPrefs(): DisplayPrefs {
  const [p, setP] = useState<DisplayPrefs>(DEFAULT_DISPLAY_PREFS)
  useEffect(() => { let on = true; loadDisplayPrefs().then((v) => { if (on) setP(v) }); return () => { on = false } }, [])
  return p
}
