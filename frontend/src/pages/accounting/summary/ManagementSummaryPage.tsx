import { useCallback, useRef, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import { EcCond } from '../../../components/EcStatusPanel'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import { EcReportHead, reportPeriod } from '../../../components/EcReportFrame'
import { ecConfirm } from '../../../components/EcDialog'
import KindPickerModal from '../../../features/managementsummary/KindPickerModal'
import { KIND_ORDER } from '../../../features/managementsummary/kinds'
import BankBalanceSection from '../../../features/managementsummary/BankBalanceSection'
import StockMovementSection from '../../../features/managementsummary/StockMovementSection'
import { AttendanceIdSection, EmployeeCommuteSection, HeadcountSection } from '../../../features/managementsummary/HrSections'
import { CumulativeSection, ProductionSection, PurchaseSection, SalesSection } from '../../../features/managementsummary/TradeTables'
import type { SectionProps } from '../../../features/managementsummary/shared'
import FundDailyPage from '../cash/FundDailyPage'
import VatBookPage from '../vat/VatBookPage'
import EcIcon from '../../../components/ui/EcIcon'
import { EcDateRange } from '../../../components/ui/EcDateInput'

const AGG_KIND = '계정별원장 (집계)'
const AGG_MESSAGE = '계정별원장(집계)의 대상으로 설정된 계정이 없습니다.\n(옵션 > 계정설정에서 설정을 변경할 수 있습니다.)\n진행하겠습니까?'

/** 종류 이름 → 그 종류의 표(들). 자료가 없으면 아무것도 안 그리고 0 을 알린다. 계정별원장(집계)은 대상 계정 설정이 없어 늘 빠진다. */
function renderKind(kind: string, p: SectionProps) {
  switch (kind) {
    case '통장잔액비교표': return <BankBalanceSection {...p} />
    case '매출장': return <VatBookPage embed={{ from: p.from, to: p.to, side: '매출', startNo: p.startNo, onCount: p.onCount }} />
    case '매입장': return <VatBookPage embed={{ from: p.from, to: p.to, side: '매입', startNo: p.startNo, onCount: p.onCount }} />
    case '자금증감내역': return <FundDailyPage variant="flow" embed={{ from: p.from, to: p.to, startNo: p.startNo, onCount: p.onCount }} />
    case '판매': return <SalesSection {...p} />
    case '구매': return <PurchaseSection {...p} />
    case '생산입고': return <ProductionSection {...p} />
    case '재고변동표': return <StockMovementSection {...p} />
    case '현황누계표': return <CumulativeSection {...p} />
    case '출/퇴근현황(ID)': return <AttendanceIdSection {...p} />
    case '인원현황': return <HeadcountSection {...p} />
    case '출/퇴근현황(사원)': return <EmployeeCommuteSection {...p} />
    default: return null
  }
}

/** 한 종류가 자기 표 수를 알리는 자리 — 종류마다 고정된 함수(렌더마다 새로 만들면 자식 effect 가 돈다). */
function useCounters() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const fns = useRef<Record<string, (n: number) => void>>({})
  const forKind = useCallback((k: string) => {
    if (!fns.current[k]) fns.current[k] = (n: number) => setCounts((c) => (c[k] === n ? c : { ...c, [k]: n }))
    return fns.current[k]
  }, [])
  return { counts, forKind, reset: () => setCounts({}) }
}

/**
 * 회계 I &gt; 경영자료 &gt; <b>경영요약보고서</b>(E010821) — 2026-10-03 · 2026-10-22 loginaa 실측.
 *
 * <p>조건: 조회일자(구간, 기본 <b>금일</b>) · 종류(다중 선택 코드도움 — 모듈 4 · 13종, 고른 것이 꼬리표로 쌓임, 기본 통장잔액비교표) · 기타([결재방표시]).
 * [검색(F8)] 하면 고른 종류 가운데 <b>자료가 있는 표만</b> 차례대로 '1. 통장잔액비교표 · 2. 매입장 · 3. 자금의 증가 …' 번호를 이어 매겨 그린다.
 * 계정별원장(집계)을 골랐으면 처음 한 번 '대상으로 설정된 계정이 없습니다 … 진행하겠습니까?' 를 묻고, 그 표만 빠진다.
 * 표마다 다른 모듈 자료라 <b>각 모듈 API 를 화면에서 불러</b> 그린다(accounting 이 hr · groupware 에 백엔드로 의존하지 않게).
 */
export default function ManagementSummaryPage() {
  const init = periodOf('금일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [kinds, setKinds] = useState<string[]>(['통장잔액비교표'])
  const [pickOpen, setPickOpen] = useState(false)
  const [signBox, setSignBox] = useState(false)
  const [applied, setApplied] = useState<{ from: string; to: string; kinds: string[]; nonce: number } | null>(null)
  const asked = useRef(false)
  const { counts, forKind, reset } = useCounters()

  async function search() {
    if (kinds.includes(AGG_KIND) && !asked.current) {
      if (!(await ecConfirm(AGG_MESSAGE))) return
      asked.current = true
    }
    reset()
    setApplied((a) => ({ from, to, kinds, nonce: (a?.nonce ?? 0) + 1 }))
  }

  const shown = applied ? KIND_ORDER.filter((k) => applied.kinds.includes(k)) : []
  let no = 1
  const starts = shown.map((k) => { const s = no; no += counts[k] ?? 0; return s })

  return (
    <EcListShell
      title="경영요약보고서"
      searchable={false}
      signLine={signBox}
      actions={[
        { label: '검색(F8)', primary: true, onClick: search },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setKinds(['통장잔액비교표']); setSignBox(false) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond mb-2">
        <EcCond label="조회일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-1.5">
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="종류" pick>
          <div className="flex flex-wrap items-center gap-1">
            {kinds.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 px-1.5 border border-ec-line rounded-ec">
                {k}
                <button type="button" className="tag-remove" aria-label={`${k} 빼기`} onClick={() => setKinds((v) => v.filter((x) => x !== k))}>×</button>
              </span>
            ))}
            <button type="button" className="ec-btn ec-btn-sm btn-code-search" title="종류검색" aria-label="종류검색" onClick={() => setPickOpen(true)}><EcIcon name="search" /></button>
          </div>
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
        </EcCond>
      </ul>
      <KindPickerModal open={pickOpen} value={kinds} onClose={() => setPickOpen(false)} onApply={(v) => { setKinds(v); setPickOpen(false) }} />

      {applied && (
        <>
          <EcReportHead title="경영요약보고서" period={reportPeriod(applied.from, applied.to)} />
          {shown.map((k, i) => (
            <div key={`${applied.nonce}-${k}`}>
              {renderKind(k, { from: applied.from, to: applied.to, startNo: starts[i], onCount: forKind(k) })}
            </div>
          ))}
        </>
      )}
    </EcListShell>
  )
}
