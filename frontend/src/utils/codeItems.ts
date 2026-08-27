/**
 * 코드도움에 넣을 <b>거래처 한 줄</b>을 만든다.
 *
 * <p>원본 <b>거래처검색 팝업</b> 실측(사본 '거래처관리대장 I/II' 에서 열리는 창):
 * 탭이 [기본 · 거래처정보 · 여신/단가 · 부가정보] 네 개이고, 찾을 수 있는 항목이
 * 거래처코드구분 · 거래처코드 · 상호(이름) · 세무신고거래처 · 종사업장번호 · 대표자명 ·
 * 업태 · 종목 · 전화 · 모바일 · 주소1/우편번호 · 주소2/우편번호 · 검색창내용 ·
 * 업종별구분 · 사용구분 · 거래처그룹1/2 · 홈페이지 · 적요 · 출하대상거래처 · 거래유형 다.
 *
 * <p>우리 코드도움은 <b>코드와 이름 둘</b>로만 찾았다. 그래서 "대표가 함승학인 그 회사",
 * "전화 끝자리가 0727 인 곳" 처럼 사람이 실제로 기억하는 단서로는 찾을 수가 없었다.
 * 탭 네 개짜리 창을 그대로 옮기는 대신, <b>그 창이 찾던 항목들을 한 칸에서 다 찾게</b> 한다.
 *
 * <p>이 함수를 따로 둔 이유: 거래처 코드도움을 부르는 자리가 화면마다 흩어져 있어
 * <b>어떤 화면은 검색창내용까지 찾고 어떤 화면은 코드·이름만 찾는</b> 상태였다.
 * 같은 코드도움인데 화면마다 다르게 찾히면 사람은 그것을 버그로 읽지 않고 자기 탓으로 읽는다.
 */

export interface PartnerLike {
  id: number
  code: string
  name: string
  typeName?: string | null
  partnerGroupName?: string | null
  searchKeyword?: string | null
  bizRegNo?: string | null
  ceoName?: string | null
  bizType?: string | null
  bizItem?: string | null
  manager?: string | null
  phone?: string | null
  mobile?: string | null
  address?: string | null
  address2?: string | null
  homepage?: string | null
  remark?: string | null
}

export interface PartnerCodeItem {
  value: string
  code: string
  name: string
  sub?: string | null
  alias?: string | null
  /** 화면에는 안 보이고 <b>찾는 데만</b> 쓰는 글자들. */
  extra?: string | null
}

/**
 * 찾는 데만 쓰는 글자들을 한 줄로 잇는다.
 *
 * <p>빈 값은 뺀다 — 안 빼면 구분자만 남은 줄이 되어 아무 낱말에나 걸린다.
 */
export function partnerSearchText(p: PartnerLike): string {
  return [
    p.bizRegNo, p.ceoName, p.bizType, p.bizItem, p.manager,
    p.phone, p.mobile, p.address, p.address2, p.homepage, p.remark,
  ].filter((v) => v != null && String(v).trim() !== '').join(' ')
}

/** 거래처 코드도움 한 줄. 화면마다 다르게 만들지 않도록 여기서만 만든다. */
export function partnerCodeItem(p: PartnerLike): PartnerCodeItem {
  return {
    value: String(p.id),
    code: p.code,
    name: p.name,
    sub: p.partnerGroupName ?? p.typeName ?? null,
    alias: p.searchKeyword ?? null,
    extra: partnerSearchText(p),
  }
}

/** 목록 통째로. */
export function partnerCodeItems(rows: PartnerLike[]): PartnerCodeItem[] {
  return rows.map(partnerCodeItem)
}
