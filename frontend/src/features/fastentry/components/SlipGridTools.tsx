import { useState } from 'react'
import Modal from '../../../components/Modal'

/**
 * 회계 I › FastEntry 입력 화면의 격자 위 툴바(2026-10-14 loginaa 실측 — 단추마다 눌러 무엇이 뜨는지 봤다).
 *
 * | 화면 | 단추 |
 * |---|---|
 * | 일반전표 | 찾기(F3) · 전표불러오기 |
 * | 지출결의서 | 찾기(F3) · 보류 · 자금계획 · 계좌입출금내역 · 카드매입내역 · 계정별잔액 |
 * | 입금보고서 | 찾기(F3) · 보류 · 자금계획 · 계좌입출금내역 · 결제대행사내역 |
 * | 가지급금정산서 | 찾기(F3) · 보류 |
 *
 * 원본이 띄우는 것: 찾기(F3) = 단추 아래 글자칸 하나(격자 안 찾기) · 보류 = '보류조회' 창(보류번호 · 거래처 · 품목 · 금액 · 유형 · 창고,
 * '보류전표는 최대 5개까지만 저장 되며, 보류전표 사용시 자동으로 삭제됩니다.') · 자금계획 = '계획전표조회' 창(발생일자 ± 한 달) ·
 * 계좌입출금내역 = '입/출금계좌 조회' 창 · 카드매입내역 = '카드매입조회' 창 · 계정별잔액 = '계정명세서' 창 · 전표불러오기 = '메뉴검색' 창
 * (회계분개 · 채권채무 상계 · 외화환산 · 계획전표 · 감가상각 · 급여전표 · 일용근로 급여 전표 · 보류). 창마다 [적용(F8)] 으로 고른 줄을 전표에 넣는다.
 *
 * 우리에게 받쳐 줄 화면이 있는 것만 연다 — 자금계획(계획전표조회) · 계정별잔액(계정명세서), 새 창으로. [적용(F8)] 로 줄을 넣는 것은 없다.
 * 나머지(찾기 · 보류 · 계좌입출금내역 · 카드매입내역 · 결제대행사내역)는 받쳐 줄 기능이 없어 <b>모양만</b> 둔다(원본 동작을 지어내지 않는다).
 */
export type SlipTool = '찾기(F3)' | '전표불러오기' | '보류' | '자금계획' | '계좌입출금내역' | '카드매입내역' | '계정별잔액' | '결제대행사내역'

const SCREEN: Partial<Record<SlipTool, string>> = {
  자금계획: '/accounting/fund-plans',
  계정별잔액: '/accounting/account-detail',
}

/** 원본 '메뉴검색' 창의 줄(전표불러오기). 우리는 불러올 곳이 없어 목록만 보인다. */
const LOAD_MENUS = ['회계분개', '채권채무 상계', '외화환산', '계획전표', '감가상각', '급여전표', '일용근로 급여 전표', '보류']

export default function SlipGridTools({ tools }: { tools: SlipTool[] }) {
  const [loadOpen, setLoadOpen] = useState(false)
  const press = (t: SlipTool) => {
    const to = SCREEN[t]
    if (to) window.open(to, '_blank', 'width=1200,height=760')
    else if (t === '전표불러오기') setLoadOpen(true)
  }
  return (
    <div className="flex flex-wrap gap-[4px] mb-[6px]">
      {tools.map((t) => (
        <button key={t} type="button" className="ec-btn ec-btn-sm" onClick={() => press(t)}>{t}</button>
      ))}
      <Modal open={loadOpen} title="메뉴검색" width={360} onClose={() => setLoadOpen(false)}>
        <table className="w-full">
          <thead><tr><th>메뉴</th></tr></thead>
          <tbody>{LOAD_MENUS.map((m) => <tr key={m}><td>{m}</td></tr>)}</tbody>
        </table>
        <div className="mt-[8px]"><button type="button" className="ec-btn" onClick={() => setLoadOpen(false)}>닫기</button></div>
      </Modal>
    </div>
  )
}
