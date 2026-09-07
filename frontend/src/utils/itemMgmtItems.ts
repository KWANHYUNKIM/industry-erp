import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

/** GET /api/items 한 줄 중 관리항목을 세는 데 필요한 것만. */
interface ItemMgmtRow {
  id: number
  code: string
  managementItemName: string | null
  /** 원본 [품목그룹1]. 우리 품목그룹은 하나뿐이라 원본의 '1' 이 그것이다. */
  itemGroupName: string | null
}

/**
 * 원본 조회 조건의 <b>[관리항목]</b>.
 *
 * <p>관리항목은 <b>품목 마스터에 붙는 값</b>이다(inventory 의 ManagementItem).
 * 판매·구매·출하 전표 응답 어디에도 실려 오지 않는다 — 그래서 오래도록 검사 예외에
 * <b>'관리항목은 품목 마스터에 붙는 값이라 전표에는 없다'</b> 고 적고 열다섯 화면을 통째로
 * 덮어 두었다. 앞 문장은 맞지만 <b>'그래서 못 만든다'는 틀렸다.</b>
 *
 * <p>판매현황(SalesStatusPage)이 이미 다른 길로 만들어 두었다 — 품목 마스터를 통째로 받아
 * <b>줄의 itemId 로 화면에서 잇는다</b>. 전표에 그 값이 없어도 품목을 알면 관리항목을 안다.
 * 그 방법을 여기로 옮겨 열세 화면이 같이 쓰게 한다.
 *
 * <p><b>useCondPickers 의 items 로는 안 된다.</b> 그쪽은 코드도움용이라
 * value/code/name/sub/alias 만 추려 담고 managementItemName 을 버린다.
 * 그래서 /items 를 따로 받는다 — 이미 Item[] 을 받아 둔 화면은 그것을 넘겨 쓰면 된다.
 */
export function useItemMgmt(preloaded?: ItemMgmtRow[]) {
  const [fetched, setFetched] = useState<ItemMgmtRow[]>([])
  const need = preloaded === undefined

  useEffect(() => {
    if (!need) return
    api.get<ItemMgmtRow[]>('/items')
      .then((r) => setFetched(r.data))
      /* 관리항목은 거르기 위한 곁가지다 — 못 불러와도 화면을 막지 않는다. */
      .catch(() => setFetched([]))
  }, [need])

  const items = preloaded ?? fetched

  const byId = useMemo(() => {
    const m = new Map<number, string>()
    for (const i of items) if (i.managementItemName) m.set(i.id, i.managementItemName)
    return m
  }, [items])

  const byCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) if (i.managementItemName) m.set(i.code, i.managementItemName)
    return m
  }, [items])

  /** 고를 수 있는 관리항목. 품목 마스터에 실제로 붙어 있는 이름만 낸다. */
  const options = useMemo(
    () => [...new Set(items.map((i) => i.managementItemName).filter((v): v is string => !!v))].sort(),
    [items])

  /**
   * 원본 <b>[품목그룹1]</b>. 예외에 '우리 품목그룹은 평면이고 <b>번호가 없다</b>' 고 적혀
   * 있었으나 사실이 아니다 — 품목등록·거래처등록은 원본 이름 그대로 [품목그룹1명]·
   * [거래처그룹1] 이라 적고 있다. 우리에게 없는 것은 <b>2·3</b> 이지 <b>1</b> 이 아니다.
   * 관리항목과 같은 길로 잇는다(품목 마스터를 받아 줄의 itemId 로).
   */
  const groupOptions = useMemo(
    () => [...new Set(items.map((i) => i.itemGroupName).filter((v): v is string => !!v))].sort(),
    [items])
  const byIdGroup = useMemo(() => {
    const m = new Map<number, string>()
    for (const i of items) if (i.itemGroupName) m.set(i.id, i.itemGroupName)
    return m
  }, [items])
  /** 그 품목의 품목그룹1 이름. 안 붙은 품목은 빈 문자열이다. */
  const groupOf = (itemId: number | null | undefined) =>
    (itemId == null ? '' : byIdGroup.get(itemId) ?? '')
  /** 고른 품목그룹1 에 걸리나. 전표 한 건에 줄이 여럿이면 한 줄이라도 걸리면 남긴다. */
  const groupHits = (itemIds: (number | null | undefined)[], picked: string) =>
    (!picked ? true : itemIds.some((id) => groupOf(id) === picked))

  /** 그 품목의 관리항목 이름. 안 붙은 품목은 빈 문자열이다. */
  const nameOf = (itemId: number | null | undefined) =>
    (itemId == null ? '' : byId.get(itemId) ?? '')

  /** 품목코드로 잇는다 — 줄에 itemId 가 없고 itemCode 만 오는 화면이 있다. */
  const nameOfCode = (itemCode: string | null | undefined) =>
    (!itemCode ? '' : byCode.get(itemCode) ?? '')

  /**
   * 고른 관리항목에 걸리나. 안 골랐으면 전부 통과다.
   * 전표 한 건에 줄이 여럿이면 <b>한 줄이라도 걸리면 그 전표를 남긴다</b> —
   * 원본도 줄 단위로 걸러 전표를 남긴다(판매현황이 그렇게 되어 있다).
   */
  const hits = (itemIds: (number | null | undefined)[], picked: string) =>
    (!picked ? true : itemIds.some((id) => nameOf(id) === picked))

  return { options, nameOf, nameOfCode, hits, groupOptions, groupOf, groupHits }
}
