import { useEffect, useState } from 'react'
import { api } from './../api/client'

/**
 * 사용중단(active=false) 품목의 id 집합.
 *
 * <p>원본 원가 화면들은 조건 판 [기타]에 <b>사용중단품목포함</b> 체크가 있고 <b>기본은 꺼져 있다</b> —
 * 즉 기본 화면에는 사용중단 품목이 안 나온다. 우리는 그런 개념 자체가 없어서 원가표에
 * 이미 안 쓰는 품목이 계속 섞여 나왔다.
 *
 * <p>원가 응답은 itemId 만 주고 사용여부는 품목 마스터에 있으므로 여기서 한 번 받아 둔다.
 * 실패하면 <b>빈 집합</b>을 돌려준다 — 못 받았다고 해서 멀쩡한 품목을 숨기면 원가표에
 * 구멍이 생기고, 그 편이 훨씬 나쁘다.
 */
export function useInactiveItems(): Set<number> {
  const [ids, setIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    let alive = true
    api.get<{ id: number; active: boolean }[]>('/items')
      .then((r) => {
        if (!alive) return
        setIds(new Set(r.data.filter((i) => !i.active).map((i) => i.id)))
      })
      .catch(() => { /* 못 받으면 아무것도 숨기지 않는다 */ })
    return () => { alive = false }
  }, [])

  return ids
}
