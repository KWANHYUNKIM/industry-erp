/**
 * 거래처관리대장의 <b>[대표거래처로 합산]</b> — 원본 조건 실측(사본 '거래처관리대장 II'):
 * 값이 '거래처관계기준' 과 '개별거래처기준' 둘이다.
 *
 * <p>한 회사가 지점·사업장별로 거래처코드를 따로 쓰면(원본 자료에도 '…대전신일점' 같은
 * 거래처가 있다) 채권채무를 <b>회사 단위</b>로 봐야 하는데, 코드 단위로밖에 볼 수 없었다.
 *
 * <p>이 규칙을 따로 뺀 이유: 합산 키를 잘못 잡으면 <b>줄이 사라지지 않고 남의 거래처에
 * 얹힌다.</b> 합계는 맞는데 누구 것인지가 틀리는 종류의 오류라 눈에 안 띈다.
 */

export type LedgerBasis = '개별거래처기준' | '거래처관계기준'

/** 대장이 아는 만큼의 거래처. 대표가 없으면 자기가 곧 대표다. */
export interface RollupPartner {
  id: number
  name: string
  parentId: number | null
  parentName: string | null
}

/** 줄이 붙을 거래처. */
export interface RollupTarget {
  id: number
  name: string
}

/**
 * 그 전표가 어느 거래처 밑으로 갈지.
 *
 * <p>개별거래처기준이면 전표에 찍힌 거래처 그대로다. 거래처관계기준이면 대표거래처로 올린다.
 *
 * <p><b>모르는 거래처는 올리지 않는다.</b> 거래처 목록이 아직 안 왔거나 지워진 거래처면
 * 대표를 알 길이 없다 — 이때 임의의 키로 묶으면 서로 남남인 전표가 한 덩어리가 된다.
 * 그런 줄은 전표에 적힌 그대로 둔다.
 */
export function rollupOf(
  entry: { partnerId: number; partnerName: string },
  basis: LedgerBasis,
  partners: Map<number, RollupPartner>,
): RollupTarget {
  const own = { id: entry.partnerId, name: entry.partnerName }
  if (basis === '개별거래처기준') return own
  const p = partners.get(entry.partnerId)
  if (!p || p.parentId == null) return own
  // 이름이 없으면 id 만으로는 사람이 못 읽는다 — 그때는 올리지 않는다.
  if (!p.parentName) return own
  return { id: p.parentId, name: p.parentName }
}

/** 화면이 쓰기 좋은 형태로 거래처 목록을 접는다. */
export function toRollupMap(rows: RollupPartner[]): Map<number, RollupPartner> {
  return new Map(rows.map((r) => [r.id, r]))
}
