import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

/** GET /api/partners 한 줄 중 관리담당자를 세는 데 필요한 것만. */
interface PartnerManagerRow {
  name: string
  manager: string | null
}

/**
 * 원본 조회 조건의 <b>[거래처관리담당자]</b>.
 *
 * <p>전표의 [담당자](그 건을 맡은 사원)와 <b>다른 사람</b>이다 — 이쪽은 그 거래처를
 * 맡은 영업담당자이고, 값은 <b>거래처 마스터</b>에 붙어 있다. 전표 응답에는 실려 오지
 * 않으므로 거래처 마스터를 받아 <b>줄의 거래처명으로 화면에서 잇는다</b>
 * (관리항목·품목그룹1·거래처그룹1과 같은 길이다 — itemMgmtItems·partnerGroups).
 *
 * <p>이 둘을 헷갈리면 <b>이름표와 걸리는 값이 어긋난다</b>. 회계반영 화면이 실제로
 * 그랬다 — 이름표만 [거래처관리담당자] 였고 거르기는 전표 담당자로 하고 있었다.
 *
 * <p>거래처를 <b>이름</b>으로만 드는 화면이 많아 이름으로 잇는다. 같은 이름의 거래처가
 * 둘이면 먼저 찾은 것을 쓴다 — 그 경우 [거래처] 조건도 이미 구분하지 못한다.
 */
export function usePartnerManagers(preloaded?: PartnerManagerRow[]) {
  const [fetched, setFetched] = useState<PartnerManagerRow[]>([])
  const need = preloaded === undefined

  useEffect(() => {
    if (!need) return
    api.get<PartnerManagerRow[]>('/partners')
      .then((r) => setFetched(r.data))
      /* 관리담당자는 거르기 위한 곁가지다 — 못 불러와도 화면을 막지 않는다. */
      .catch(() => setFetched([]))
  }, [need])

  const partners = preloaded ?? fetched

  const byName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of partners) if (p.manager && !m.has(p.name)) m.set(p.name, p.manager)
    return m
  }, [partners])

  /** 고를 수 있는 관리담당자. 거래처 마스터에 실제로 붙어 있는 이름만 낸다. */
  const options = useMemo(
    () => [...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort(),
    [partners])

  /** 그 거래처(이름)의 관리담당자. 안 붙은 거래처는 빈 문자열이다. */
  const managerOfName = (partnerName: string | null | undefined) =>
    (!partnerName ? '' : byName.get(partnerName) ?? '')

  return { options, managerOfName }
}
