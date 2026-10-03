/**
 * 월별채권/채무증감내역(E040713·E040714)의 셈 — <b>월별 합계</b>와 <b>거래처별 × 달</b> 두 표.
 *
 * <p>화면에서 떼어 낸 까닭: 두 표는 <b>같은 자료를 두 번 센다.</b> 그래서 늘 맞아야 한다 —
 * 거래처별 이월을 다 더하면 월별 1월 이월이고, 거래처별 기말을 다 더하면 12월 잔액이다.
 * 2026-09-21 에 이 둘이 어긋나 있었다. 전표를 그 해 것만 받게 바꾸면서(38203b0) 월별 합계는
 * 서버가 낸 이월로 옮겼는데 거래처별 표는 여전히 <b>전 해 전표를 접어</b> 이월을 냈다 —
 * 그런 전표는 더는 오지 않으니 거래처별 이월이 <b>늘 0</b> 이었다. 화면에서는 이월 칸이 두 줄에
 * 걸쳐 합쳐져 있어 아무도 몰랐다. 여기로 옮겨 그 불변식을 테스트로 못 박는다.
 */

/** 이 셈이 받는 전표 한 장 — 증가(매출·매입)든 감소(수금·지급)든 모양이 같다. */
export interface ArApDoc { date: string; amt: number; name: string }

/** 서버가 낸 그 해 시작 전날의 거래처별 잔액(/ledger/partner-balances). */
export interface ArApOpening { name: string; receivable: number; payable: number }

export type ArApMode = 'AR' | 'AP'

export interface MonthRow { month: number; opening: number; increase: number; decrease: number; closing: number }

export interface PartnerYearRow {
  code: string
  name: string
  opening: number
  /** 1..12 을 쓴다(0 은 비운다). */
  inc: number[]
  dec: number[]
  closing: number
}

const yearOf = (d: string) => Number(d.slice(0, 4))
const monthOf = (d: string) => Number(d.slice(5, 7))
const openingOf = (b: ArApOpening, mode: ArApMode) => (mode === 'AR' ? b.receivable : b.payable)

/**
 * 월별 합계. 1월의 전월이월은 <b>서버가 낸 잔액</b>이고, 거르는 잣대(<code>mine</code>)를
 * 전표와 <b>똑같이</b> 건다 — 안 그러면 이월만 남의 거래처를 품는다.
 */
export function monthRows(
  inc: readonly ArApDoc[], dec: readonly ArApDoc[], openings: readonly ArApOpening[],
  mine: (name: string) => boolean, mode: ArApMode, year: number,
): MonthRow[] {
  const opening = openings.filter((b) => mine(b.name)).reduce((n, b) => n + openingOf(b, mode), 0)
  const up = new Array(13).fill(0)
  const down = new Array(13).fill(0)
  for (const d of inc) if (yearOf(d.date) === year) up[monthOf(d.date)] += d.amt
  for (const d of dec) if (yearOf(d.date) === year) down[monthOf(d.date)] += d.amt
  const out: MonthRow[] = []
  let carry = opening
  for (let m = 1; m <= 12; m++) {
    const closing = carry + up[m] - down[m]
    out.push({ month: m, opening: carry, increase: up[m], decrease: down[m], closing })
    carry = closing
  }
  return out
}

/**
 * 거래처별 × 달. 이월은 <b>서버가 낸 잔액에서만</b> 온다 — 전표를 접어 내지 않는다.
 * 그 해에 거래가 없어도 이월이 있으면 줄이 선다(한울ICT 가 그랬다: 이월 22,000 만 있었다).
 * 그 해에 아무 일도 없고 이월도 0 인 거래처는 줄을 만들지 않는다.
 */
export function partnerYearRows(
  inc: readonly ArApDoc[], dec: readonly ArApDoc[], openings: readonly ArApOpening[],
  mine: (name: string) => boolean, mode: ArApMode, year: number,
  codeOf: (name: string) => string = () => '',
): PartnerYearRow[] {
  const m = new Map<string, PartnerYearRow>()
  const seat = (name: string) => {
    let r = m.get(name)
    if (!r) {
      r = { code: codeOf(name), name, opening: 0, inc: new Array(13).fill(0), dec: new Array(13).fill(0), closing: 0 }
      m.set(name, r)
    }
    return r
  }
  for (const b of openings) {
    if (!mine(b.name)) continue
    const amt = openingOf(b, mode)
    if (amt) seat(b.name).opening += amt
  }
  for (const d of inc) if (yearOf(d.date) === year) seat(d.name).inc[monthOf(d.date)] += d.amt
  for (const d of dec) if (yearOf(d.date) === year) seat(d.name).dec[monthOf(d.date)] += d.amt
  const out = [...m.values()]
  for (const r of out) {
    r.closing = r.opening
    for (let i = 1; i <= 12; i++) r.closing += r.inc[i] - r.dec[i]
  }
  return out.filter((r) => r.opening !== 0 || r.closing !== 0 || r.inc.some(Boolean) || r.dec.some(Boolean))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
