import { useState } from 'react'
import { api } from '../api/client'
import type { MyItem } from '../api/types'

/**
 * 원본 격자 입력 화면 공통 툴바의 <b>[My품목]</b> — 부르는 쪽 로직만 나눠 갖는 훅.
 *
 * <p>자주 넣는 품목을 담아 두고 <b>한 번에 명세로 붓는다</b>. 같은 자재를 매번 코드도움으로
 * 하나씩 찾아 넣던 자리다 — 열 줄짜리 발주를 넣을 때 열 번 찾아야 했다.
 * 담는 쪽은 판매·구매입력 명세의 [★]다(`TradeEntry` 의 `toggleMyItem`).
 * 여기서는 <b>담긴 것을 붓기만</b> 한다 — 원본도 격자 툴바의 이 단추는 붓기 전용이다.
 *
 * <p><b>단추를 이 파일이 그리지 않는 까닭</b>: 처음에는 버튼째 컴포넌트로 만들었는데,
 * 그러면 화면 파일에 <b>[My품목] 이라는 글자가 남지 않아</b> 버튼 검사가 못 본다
 * (배열로 돌려 그리면 안 되는 것과 같은 이유다). 검사가 못 보면 나중에 누가 지워도
 * 아무도 모른다. 그래서 단추는 화면이 글자로 그리고, 이 훅은 <b>부르는 일만</b> 한다.
 *
 * <p>My품목은 <b>부가기능</b>이라 못 불러와도 화면을 막지 않는다 — 알리고 그냥 둔다.
 * 그래서 알림도 제가 들고 있다(붙일 화면마다 성공 알림 자리가 제각각이다).
 */
export function useMyItemsPick(onApply: (items: MyItem[]) => void) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const say = (m: string) => { setNote(m); window.setTimeout(() => setNote(''), 2500) }

  async function pick() {
    setBusy(true)
    try {
      const r = await api.get<MyItem[]>('/my-items')
      if (r.data.length === 0) {
        say('My품목이 비어 있습니다. 판매·구매입력 명세에서 [★]로 담아 두세요.')
        return
      }
      onApply(r.data)
      say(`My품목 ${r.data.length}건을 명세에 담았습니다.`)
    } catch {
      say('My품목을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return { pick, busy, note }
}

/** 훅이 들고 있는 알림을 단추 옆에 그린다. 없으면 아무것도 안 그린다. */
export function MyItemsNote({ note }: { note: string }) {
  if (!note) return null
  return <span style={{ fontSize: 12, color: '#5a626e', marginLeft: 6 }}>{note}</span>
}
