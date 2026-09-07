import { useEffect, useState } from 'react'
import { api } from './../api/client'

/**
 * 원가 화면들이 <b>기본으로 빼고 보여 주는</b> 품목들.
 *
 * <p>원본 원가 화면들의 조건 판 [기타]에는 <b>사용중단품목포함</b> 과
 * <b>수량관리제외품목포함</b> 이 있고 둘 다 <b>기본은 꺼져 있다</b> —
 * 즉 기본 화면에는 그 품목들이 안 나온다. 체크를 켜야 나온다.
 *
 * <p>우리는 그런 개념 자체가 없어서 원가표에 이미 안 쓰는 품목이 계속 섞여 나왔고,
 * 재고를 잡지 않는 품목(용역·운반비)까지 원가표에 앉아 있었다 — 만들지 않는 것에
 * 표준원가를 매기는 것은 뜻이 없다.
 *
 * <p>원가 응답은 itemId 만 주고 사용여부·재고수량관리는 품목 마스터에 있으므로
 * 여기서 한 번 받아 둔다. 실패하면 <b>빈 집합</b>을 돌려준다 — 못 받았다고 해서
 * 멀쩡한 품목을 숨기면 원가표에 구멍이 생기고, 그 편이 훨씬 나쁘다.
 */
export interface ItemFlags {
  /** 사용중단(active=false) 품목의 id */
  inactive: Set<number>
  /** 수량관리제외(stockTracked=false) 품목의 id */
  untracked: Set<number>
}

export function useItemFlags(): ItemFlags {
  const [flags, setFlags] = useState<ItemFlags>({ inactive: new Set(), untracked: new Set() })

  useEffect(() => {
    let alive = true
    api.get<{ id: number; active: boolean; stockTracked?: boolean }[]>('/items')
      .then((r) => {
        if (!alive) return
        setFlags({
          inactive: new Set(r.data.filter((i) => !i.active).map((i) => i.id)),
          // stockTracked 가 안 오면 관리대상으로 본다 — 모르는 것을 숨기지 않는다.
          untracked: new Set(r.data.filter((i) => i.stockTracked === false).map((i) => i.id)),
        })
      })
      .catch(() => { /* 못 받으면 아무것도 숨기지 않는다 */ })
    return () => { alive = false }
  }, [])

  return flags
}

/** 예전 이름. 사용중단 집합만 쓰던 화면들이 그대로 쓸 수 있게 남겨 둔다. */
export function useInactiveItems(): Set<number> {
  return useItemFlags().inactive
}
