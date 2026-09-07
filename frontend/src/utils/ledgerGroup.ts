/**
 * 거래처관리대장의 <b>[집계구분]</b> 묶음 키.
 *
 * <p>원본 조건: 전표별 · 전표별+내역 · 일별 · 월별 · <b>회계전표별</b>.
 *
 * <p>회계전표별을 오래 안 만들었던 이유는 <b>아직 회계로 안 넘어간 전표가 대장에서
 * 사라지기 때문</b>이었다. 사라지게 두지 않으면 될 일이다 — 반영 안 된 줄은
 * '미반영' 한 묶음으로 모은다. 사라지기는커녕 어느 전표가 아직 안 갔는지 바로 보인다.
 *
 * <p>이 규칙을 따로 뺀 이유: 키를 null 로 두거나 빈 문자열로 두면 <b>그 줄이 조용히
 * 빠지거나 다른 묶음에 섞인다.</b> 대장에서 줄이 사라지는 것은 눈에 안 띈다 —
 * 합계만 조금 달라질 뿐이다.
 */

export const UNPOSTED = '미반영'

export type LedgerGroup = '전표별' | '전표별+내역' | '일별' | '월별' | '회계전표별'

export interface GroupableEntry {
  date: string
  journalDocNo: string | null
}

/**
 * 그 줄이 들어갈 묶음의 키.
 *
 * <p>전표별·전표별+내역은 묶지 않으므로 null 을 돌려준다(호출부가 그대로 둔다).
 */
export function groupKeyOf(entry: GroupableEntry, group: LedgerGroup): string | null {
  switch (group) {
    case '전표별':
    case '전표별+내역':
      return null
    case '일별':
      return entry.date
    case '월별':
      return entry.date.slice(0, 7)
    case '회계전표별':
      // 빈 문자열도 '안 넘어간 것' 으로 본다 — 빈 키로 두면 다른 줄과 섞인다.
      return entry.journalDocNo && entry.journalDocNo.trim() !== ''
        ? entry.journalDocNo
        : UNPOSTED
  }
}
