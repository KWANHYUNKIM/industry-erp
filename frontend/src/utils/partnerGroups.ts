import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

/** GET /api/partners 한 줄 중 그룹을 세는 데 필요한 것만. */
interface PartnerGroupRow {
  id: number
  name: string
  partnerGroupName: string | null
}

/**
 * 원본 조회 조건의 <b>[거래처그룹1]</b>.
 *
 * <p>거래처그룹은 <b>거래처 마스터에 붙는 값</b>이라 판매·구매·채권 전표 응답에는
 * 실려 오지 않는다. 품목그룹·관리항목과 같은 길로 잇는다 — 거래처 마스터를 받아
 * <b>줄의 거래처명</b>으로 화면에서 잇는다.
 *
 * <p><b>왜 이름이 '1' 인가.</b> 검사 예외에 '우리 거래처그룹은 평면이고 <b>번호가 없다</b>'
 * 고 적혀 있었으나 사실이 아니다 — 거래처등록은 원본 이름 그대로 [거래처그룹1] 이라 적고
 * 주석에 "우리는 그룹이 하나라 '2' 에 해당하는 칸이 없다" 고 밝혀 두었다.
 * 하나뿐인 그룹에 원본의 '1' 을 붙이는 것이 이 저장소의 방식이다. 없는 것은 2·3 이다.
 *
 * <p>줄이 거래처를 <b>이름</b>으로만 드는 화면이 많아 이름으로 잇는다(id 를 드는 화면은
 * byId 를 쓰면 된다). 같은 이름의 거래처가 둘이면 먼저 찾은 것을 쓴다 — 그 경우
 * [거래처] 조건도 이미 구분하지 못한다.
 */
export function usePartnerGroups() {
  const [partners, setPartners] = useState<PartnerGroupRow[]>([])

  useEffect(() => {
    api.get<PartnerGroupRow[]>('/partners')
      .then((r) => setPartners(r.data))
      /* 그룹은 거르기 위한 곁가지다 — 못 불러와도 화면을 막지 않는다. */
      .catch(() => setPartners([]))
  }, [])

  const byName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of partners) if (p.partnerGroupName && !m.has(p.name)) m.set(p.name, p.partnerGroupName)
    return m
  }, [partners])

  const byId = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of partners) if (p.partnerGroupName) m.set(p.id, p.partnerGroupName)
    return m
  }, [partners])

  /** 고를 수 있는 거래처그룹. 마스터에 실제로 붙어 있는 이름만 낸다. */
  const groupOptions = useMemo(
    () => [...new Set(partners.map((p) => p.partnerGroupName).filter((v): v is string => !!v))].sort(),
    [partners])

  /** 그 거래처(이름)의 그룹. 안 붙은 거래처는 빈 문자열이다. */
  const groupOfName = (partnerName: string | null | undefined) =>
    (!partnerName ? '' : byName.get(partnerName) ?? '')

  /** 그 거래처(id)의 그룹. */
  const groupOfId = (partnerId: number | null | undefined) =>
    (partnerId == null ? '' : byId.get(partnerId) ?? '')

  return { groupOptions, groupOfName, groupOfId }
}
