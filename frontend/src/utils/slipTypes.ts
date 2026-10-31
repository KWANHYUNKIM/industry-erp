/**
 * 전표 인쇄 미리보기(components/EcSlipPrintModal)가 받는 전표 모양 — 서식 문서를 만드는 utils(slipLetter · tradeSlipDocument …)도
 * 같은 모양을 내야 해서 utils 쪽에 둔다(utils → components 역방향 import 를 끊으려고, 2026-10-31). EcSlipPrintModal 이 다시 내보낸다.
 */
export interface SlipPrintLine {
  /** 첫 칸 — 구매전표는 일자(MM/DD), 견적서 · 주문서는 품목코드. */
  date: string
  name: string
  qty: string
  unitPrice: string
  supply: string
  vat: string
  /** 거래명세서 아래 상자는 <b>그 쪽</b> 줄의 합이다 — 쪽마다 더하려고 숫자를 따로 든다. */
  num?: { qty: number; supply: number; vat: number }
}

export interface SlipPrintDoc {
  key: string | number
  /** 종이 제목(띄어 쓰지 않은 것, 예: '구매전표') — 종이에는 '구 매 전 표' 로 찍는다. */
  title: string
  /** 머리 왼쪽 상자의 첫 줄 값(전표번호) — 뒤에 '[ 쪽 / 쪽수 ]' 가 붙는다. */
  docNo: string
  date: string
  /** 머리 오른쪽 상자 두 줄(구매창고 · 구매처 …). */
  right: { label: string; value: string }[]
  lines: SlipPrintLine[]
  totalQty: string
  supply: string
  vat: string
  total: string
  /** 견적서 · 주문서처럼 '수신 … | 회사 상자' 머리를 갖는 양식이면 준다(없으면 구매전표 머리). */
  letter?: SlipLetter
  /** 판매 거래명세서 양식이면 준다(아래 SlipStatement). */
  statement?: SlipStatement
  /** 출하전표 양식이면 준다(아래 SlipShipment) — 품목 줄은 이쪽 lines 를 쓴다. */
  shipment?: SlipShipment
}

/**
 * 판매 거래명세서(원본 E040206 판매조회 줄 [인쇄] 2026-10-31 loginad 실측 — 창 '거래명세서', ✓내자기본(외자기본)).
 * 머리 일곱 칸(299 · 20 · 20 · 70 · 99 · 50 · 91): 왼쪽 '거래명세서'(24px 700) 아래 받는 쪽 상자 '이름 貴 中 / 주소 / ☎ 전화'(12px 700 가운데),
 * 오른쪽 세로 '공 급 자' 와 일련번호 · TEL / 사업자등록번호 · 성명 / 상호 / 주소. 금액 줄 '금 액 : 한글원 정 …(￦합계)'.
 * 품목 격자는 구매전표와 같은 열(일자 · 품목명[규격] …), 한 쪽 12 줄 · 총합계 줄 없음, 아래 상자는 그 쪽 줄의 합
 * (수량 · 공급가액 · VAT · 합계 · 인수 … 인), 그 밑 '[ 쪽 / 쪽수 ]'. 내자기본은 점선 아래 한 장 더(두 장).
 */
export interface SlipStatement {
  to: { name: string; address: string; tel: string }
  supplier: { docNo: string; tel: string; bizRegNo: string; ceo: string; name: string; address: string }
  amountKorean: string
}

/**
 * 견적서 · 주문서 머리(원본 C000071 견적서조회 · C000072 주문서조회 [인쇄] 2026-10-31 loginad 실측).
 * 머리 표 다섯 칸(75 · 220 · 10 · 75 · 269): 왼쪽 이름/값 줄들(견적서는 그 아래 인사말 칸이 세 줄을 차지),
 * 오른쪽 맨 위 세 줄은 회사 로고 칸, 그 아래 이름/값 줄들(주문서 [담당자] 는 두 줄 높이).
 * 그 아래 굵은 테두리 한 줄 '금 액 : 한글 원 정 ……(￦ 합계원) / VAT포함', 품목 격자 첫 열은 품목코드,
 * 아래 상자는 수량 · 공급가액 · VAT · 합계(인 수 칸 없음).
 */
export interface SlipLetter {
  /** span 이면 두 칸을 합쳐 값만 가운데에 찍는다(발주서 '납기일자 : 2026/10/20'). */
  left: { label: string; value: string; span?: boolean }[]
  right: { label: string; value: string; rows?: number }[]
  /** 왼쪽 줄 아래 세 줄 높이 칸의 글(견적서 '1. 귀사의 일익 …'). */
  notice?: string[]
  /** 로고 칸에 찍을 회사 이름(우리는 로고 그림이 없다). */
  company: string
  amountKorean: string
  /** 품목명 머리 — 견적서 '품목명(규격)', 주문서 '품목명[규격]'. */
  nameHead: string
  /** 총합계 줄에 수량을 찍나 — 주문서는 찍고, 견적서는 총합계 칸이 수량 칸까지 덮는다. */
  sumQty: boolean
  /** 총합계 줄이 아예 없다(발주서). */
  noSum?: boolean
  /** 로고 칸 높이(줄 수) — 견적서 · 주문서 3, 발주서 2. */
  logoRows?: number
  /** 한 쪽 품목 줄 칸 수 — 견적서 25(품목 1 + 빈 24), 주문서 20(품목 4 + 빈 16). */
  rowsPerPage: number
}

/**
 * 출하전표(원본 C000138 출하조회 줄 [인쇄] 2026-10-31 loginad 실측 — 창 '출하', ✓기본(수정불가), 점선 아래 두 장).
 * 머리는 거래명세서와 같은 '공 급 자' 상자, 왼쪽 '출하전표'(24px 700 밑줄) · 받는 쪽 상자는 이름만.
 * 그 아래 출하창고 · 출하일 / 납품지주소 상자, 격자 품목명(규격) 300 · 수량(단위포함) 150 · 적요 200,
 * 품목 칸 11 + 총합계 줄(세 칸 합침, 숫자 없음), 아래 상자 수량 · 인수 … 인. 금액 줄 없음.
 */
export interface SlipShipment {
  supplier: SlipStatement['supplier']
  toName: string
  warehouse: string
  date: string
  address: string
  lines: { name: string; qty: string; remark: string }[]
}
