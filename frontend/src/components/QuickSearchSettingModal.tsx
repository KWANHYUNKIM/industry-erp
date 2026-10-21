import { useState } from 'react'
import Modal from './Modal'

/** 원본 [설정] ▸ 간편검색설정 창의 간편검색명 42개(2026-10-21 원천징수부 실측) — 앞 넷만 켜져 있고 [전년] 이 조회기본값이다. */
const NAMES = ['금월(~오늘)', '전월', '금년', '전년', '금일', '전일', '말일', '금주', '금주(~오늘)', '금주(오늘~)', '전주', '차주', '금월', '금월(오늘~)',
  '이번기수(~전월)', '전월+금월', '차월', '금년(~오늘)', '금년(오늘~)', '전년+금년', '최근 1년', '이번기수', '직전기수', '직전분기', '직전반기',
  '종료일', '종료월', '1분기', '2분기', '3분기', '4분기', '상반기', '하반기', '최근7일', '최근3일+7일', '6개월(+1개월)', '3개월',
  '최근30일', '최근30일(+1개월)', '최근40일(+1개월)', '1년', '1년전 ~ 당월']

/**
 * 간편검색설정 창 — 조건 판 아래 [설정] 이 연다. 원본: 설정대상(기준연월 등) · 격자 [☐ · 간편검색명 · 조회기본값 ◉ · 정렬순서] 42줄,
 * 단추 [저장(F8) · 항목설정 · 닫기 · H]. 우리 화면의 빠른선택 단추는 고정이라 저장해도 단추가 바뀌지 않는다(창 모양만).
 */
export default function QuickSearchSettingModal({ open, target, onClose }: { open: boolean; target: string; onClose: () => void }) {
  const [on, setOn] = useState<Set<number>>(new Set([0, 1, 2, 3]))
  const [def, setDef] = useState(3)
  const toggle = (i: number) => setOn((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  return (
    <Modal open={open} title="간편검색설정" width={560} onClose={onClose}>
      <p className="text-[12px] mb-[6px]">설정대상 : {target}</p>
      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full">
          <thead><tr><th className="w-[40px]"></th><th>간편검색명</th><th className="w-[90px]">조회기본값</th><th className="w-[80px]">정렬순서</th></tr></thead>
          <tbody>
            {NAMES.map((n, i) => (
              <tr key={n}>
                <td className="text-center"><input type="checkbox" aria-label={`${n} 사용`} checked={on.has(i)} onChange={() => toggle(i)} /></td>
                <td>{i + 1} {n}</td>
                <td className="text-center"><input type="radio" name="qs-default" aria-label={`${n} 조회기본값`} checked={def === i} disabled={!on.has(i)} onChange={() => setDef(i)} /></td>
                <td className="text-center">{on.has(i) ? [...on].sort((a, b) => a - b).indexOf(i) + 1 : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={onClose}>저장(F8)</button>
        <button type="button" className="ec-btn">항목설정</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        <button type="button" className="ec-btn">H</button>
      </div>
    </Modal>
  )
}
