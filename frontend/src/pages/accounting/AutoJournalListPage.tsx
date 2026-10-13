import { useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { ymd } from '../../components/EcPeriodPicks'
import { ecAlert } from '../../components/EcDialog'

const PICKS = ['금월', '전월', '이번기수', '직전기수'] as const

/**
 * 회계 I › FastEntry › <b>자동생성전표조회</b>(E010213) — 2026-10-14 loginaa 실측.
 *
 * <p>판매 · 구매 · 급여가 만든 전표 목록이 <b>아니다</b>. 원본 '자동생성전표'는 [Option › 자동생성설정] 의 <b>자동대체</b>(결산 대체분개)로
 * 만드는 전표다 — 설정 목록(이 회사): 원재료 결산(1539 원재료 → 5028 원재료비(제품)) · 부재료 결산 · 원가1 계정 대체 · 재공품 결산 ·
 * 상품 결산(1469 → 4519 상품매출원가) · 제품 결산 · 원가2 · 원가3 계정 대체 · 손익 대체(4001 손익 → 3799 당기순이익) ·
 * 전기 손익 대체(3799 → 3779 전기이월미처분이익잉여금), 대체분개시점은 전기 손익 대체만 '매 회계기수 초', 나머지 '대체안함'.
 * [대체설정] 은 이 계정에 '업무 권한이 없습니다.'
 *
 * <p>조건(접혀 있음 — [Search(F3)]): 기준일자(기본 1월 1일 ~ 오늘) · 계정 · 부서 · 부서계층그룹(☑하위그룹포함검색) · 프로젝트 ·
 * 프로젝트그룹1 · 2 · 금액 ~ · 적요 · 최초작성자 · 최종수정자 · 기타 ☐수정일자순(정렬) — 우리는 기준일자만 둔다(걸 전표가 없다). 격자 ☐ · 일자-No. · 합계 · 적요 · 인쇄,
 * 빈 목록 '등록된 데이터가 없습니다.'. 하단 신규(F2) · 인쇄 · Excel.
 * [신규(F2)] → (잔액재집계 창) → '입력년월' 창 '자동생성전표를 입력할 연월을 선택하기 바랍니다.'(기본 전월 2026/09) [확인] →
 * 2026/09 · 2026/01 둘 다 알림 '선택된 연월에 대체분개시점이 유효한 자동대체가 존재하지 않습니다.' / '자동생성전표조회 > Option > 자동생성설정을 확인 바랍니다.'
 *
 * <p>우리에게는 자동대체 설정이 없다(원가계산 [회계반영] 도 같은 안내 — CostBuildPage). 그래서 목록은 늘 비고(원본 이 회사도 비어 있다),
 * [신규(F2)] 는 원본이 설정이 없을 때 하는 안내를 그대로 한다. 자동대체 설정 · 분개를 만들려면 결산 계정 체계(사용자 결정 대기)부터다.
 */
export default function AutoJournalListPage() {
  const today = new Date()
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`)
  const [to, setTo] = useState(ymd(today))
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '자동생성전표조회', [])

  async function confirmYm() {
    setYm(null)
    await ecAlert('선택된 연월에 대체분개시점이 유효한 자동대체가 존재하지 않습니다.\n\n자동생성전표조회 > Option > 자동생성설정을 확인 바랍니다.')
  }

  return (
    <EcListShell
      title="자동생성전표조회"
      onNew={() => setYm({ y: prev.getFullYear(), m: prev.getMonth() + 1 })}
      actions={[{ label: '인쇄' }, { label: 'Excel' }]}
    >
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자" span={2}>
          <input type="date" className="ec-input w-[145px]" aria-label="시작일" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" aria-label="종료일" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <li className="full">
          <div className="form">
            <button type="button" className="ec-btn ec-btn-primary">검색(F8)</button>
            <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
          </div>
        </li>
      </ul>

      <table ref={tableRef} className="ec-head700 w-full text-left">
        <thead>
          <tr>
            <th className="w-[38px] text-center"><input type="checkbox" aria-label="전체선택" disabled /></th>
            <th>일자-No.</th>
            <th className="text-right">합계</th>
            <th>적요</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        </tbody>
      </table>

      <Modal open={ym != null} title="입력년월" width={420} onClose={() => setYm(null)}>
        {ym && (
          <>
            <p className="mb-[10px]">자동생성전표를 입력할 연월을 선택하기 바랍니다.</p>
            <div className="mb-[10px] flex items-center gap-[4px]">
              <span className="mr-[6px]">입력년월</span>
              <select className="ec-input w-[80px]" aria-label="입력년" value={ym.y} onChange={(e) => setYm({ ...ym, y: Number(e.target.value) })}>
                {[ym.y - 1, ym.y, ym.y + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select className="ec-input w-[60px]" aria-label="입력월" value={ym.m} onChange={(e) => setYm({ ...ym, m: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
              </select>
            </div>
            <div className="flex gap-[4px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void confirmYm()}>확인</button>
              <button type="button" className="ec-btn" onClick={() => setYm(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
