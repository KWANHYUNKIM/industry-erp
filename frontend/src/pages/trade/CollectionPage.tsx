import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 영업관리 > 수금현황 (이카운트 E040217)
 * 정산(수금) 내역 실데이터 (/api/settlements, type=RECEIPT).
 *
 * 원본은 조회 조건 패널이 화면의 본체다: 기준일자 · 거래처 · 부서 · 프로젝트 · 거래처관리담당자.
 * 우리 화면은 조건이 검색어 한 칸뿐이었다.
 *
 * 이 화면의 기간 빠른선택에는 **[이번기수][직전기수]** 가 있다 — 회계 기수다.
 * 시작월은 회사 설정(Preference.fiscalStart)에서 가져온다. 회사마다 다르므로 1월로 넘겨짚지 않는다.
 *
 * 거래처관리담당자는 <b>거래처 마스터에 있다</b>. Settlement 에 없다고 조건을 빼 뒀었는데,
 * 원본도 정산이 아니라 거래처를 보고 거르는 것이라 거래처를 통해 이으면 된다.
 * <p>[프로젝트]도 이제 있다. 판매·구매·비용은 진작 프로젝트를 다는데 정산만 안 달아서,
 * 프로젝트별로 얼마를 받았는지 셀 수가 없었다.
 * 부서는 정산에도 거래처에도 없어 여전히 만들지 않는다.
 */
interface Settlement {
  id: number
  docNo: string
  type: 'RECEIPT' | 'PAYMENT'
  typeName: string
  /** 거래처관리담당자를 잇는 열쇠. 응답에 이미 있는데 이 화면이 안 받고 있었다. */
  partnerId: number
  partnerName: string
  settleDate: string
  amount: number
  method: string | null
  /** 귀속 프로젝트. 원본 수금현황·지급현황 조건의 [프로젝트]. */
  projectName: string | null
  note: string | null
}

/** 수금현황(RECEIPT)·지급현황(PAYMENT)이 같은 화면이라 종류만 바꿔 쓴다. */
export function SettlementStatusPage({ type, title, moneyLabel }: {
  type: 'RECEIPT' | 'PAYMENT'
  title: string
  moneyLabel: string
}) {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'projects', 'employees'])
  const [rows, setRows] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [fiscalStart, setFiscalStart] = useState<number | undefined>(undefined)
  const [partners, setPartners] = useState<{ id: number; manager: string | null }[]>([])
  /*
   * 원본 수금현황의 기본 기간은 <b>[이번기수]</b> 다(사본 조건 판의 버튼).
   * 우리는 비워 두어 수금 전체가 나왔다 — 이번 기수에 얼마 받았는지를 보는 화면인데
   * 지난 기수 것까지 섞여 합계가 그 뜻이 아니게 된다.
   */
  const initPeriod = periodOf('이번기수')!
  const [cond, setCond] = useState({
    from: initPeriod.from, to: initPeriod.to, partner: '', method: '', manager: '', project: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  async function load() {
    setLoading(true)
    try {
      const [res, pt] = await Promise.all([
        api.get<Settlement[]>('/settlements'),
        api.get<{ id: number; manager: string | null }[]>('/partners'),
      ])
      setRows(res.data.filter((s) => s.type === type))
      setPartners(pt.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [type])

  useEffect(() => {
    // 회계 기수 계산에 필요한 시작월. 못 받으면 [이번기수]·[직전기수] 는 눌러도 아무 일이 없다
    // — 잘못된 기간을 내놓는 것보다 낫다.
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => { const m = Number(r.data?.fiscalStart); if (m >= 1 && m <= 12) setFiscalStart(m) })
      .catch(() => {})
  }, [])

  const methods = useMemo(
    () => [...new Set(rows.map((r) => r.method).filter(Boolean))].sort() as string[], [rows])

  const managerOf = useMemo(
    () => new Map(partners.map((p) => [p.id, p.manager ?? ''])),
    [partners],
  )

  /*
   * 원본 [정렬/소계기준]. 수금은 한 거래처에서 여러 번 들어오고 방법도 섞인다 —
   * 어느 거래처에서 얼마가 들어왔는지, 어느 방법으로 들어왔는지를 눈으로 더해야 했다.
   */
  const SUBTOTALS = ['거래처', '수금방법', '거래처관리담당자'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('거래처')
  const shown = rows
    .filter((r) => !cond.from || r.settleDate >= cond.from)
    .filter((r) => !cond.to || r.settleDate <= cond.to)
    .filter((r) => !cond.partner || r.partnerName.includes(cond.partner))
    .filter((r) => !cond.method || r.method === cond.method)
    // 거래처관리담당자는 정산이 아니라 거래처에 달려 있다 — 거래처를 통해 잇는다.
    .filter((r) => !cond.manager
      || (managerOf.get(r.partnerId) ?? '').includes(cond.manager))
    .filter((r) => !cond.project || (r.projectName ?? '').includes(cond.project))
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.docNo.includes(keyword))

  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])
  const [view, setView] = useState<'표' | '그래프'>('표')

  /*
   * 원본 [데이터 보기형식] · [그래프로 보기]. 수금·지급은 <b>거래처별로 얼마</b> 를
   * 보는 화면이라 거래처로 묶어 그린다 — 전표 한 줄씩 그리면 같은 거래처가 흩어진다.
   */
  const chartRows = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of shown) m.set(r.partnerName, (m.get(r.partnerName) ?? 0) + r.amount)
    return [...m].map(([label, value]) => ({ label, value }))
  }, [shown])
  const reset = () => {
    setCond({ from: '', to: '', partner: '', method: '', manager: '', project: '' })
    setKeyword('')
  }

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={SETTLE_PICKS}
        fiscalStart={fiscalStart}
        view={view} onViewChange={setView}
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
      >
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setC({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} emptyLabel="전체"
                           value={cond.manager} onChange={(v) => setC({ manager: v })}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label={moneyLabel === '수금' ? '수금방법' : '지급방법'}>
          <select className="ec-input" value={cond.method} onChange={(e) => setC({ method: e.target.value })} style={{ width: 220 }}>
            <option value="">전체</option>
            {methods.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        {moneyLabel} 합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
      </div>

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 원" emptyText={`조회된 ${moneyLabel} 내역이 없습니다.`} />
      ) : (
      <table className="w-full text-left">
        <colgroup>
          <col style={{ width: '4%' }} /><col style={{ width: '12%' }} /><col style={{ width: '18%' }} />
          <col /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} /><col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th style={{ textAlign: 'center', width: 190 }}>일자-No. ▼</th>
            <th>거래처</th>
            <th style={{ textAlign: 'right' }}>{moneyLabel}액</th>
            <th style={{ textAlign: 'center' }}>{moneyLabel}방법</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                {r.settleDate.replace(/-/g, '/')} {r.docNo}
              </td>
              <td>{r.partnerName}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.amount.toLocaleString()}</td>
              <td style={{ textAlign: 'center' }}>{r.method ?? ''}</td>
              <td style={{ color: '#5a626e' }}>{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{total.toLocaleString()}</td>
              <td colSpan={2} style={{ background: '#f5f7fa' }}></td>
            </tr>
          </tfoot>
        )}
      </table>
      )}

      {view === '표' && shown.length > 0 && (() => {
        const groups = subtotalBy(shown,
          (r) => (subtotal === '수금방법' ? r.method
            : subtotal === '거래처관리담당자' ? (managerOf.get(r.partnerId) || null)
              : r.partnerName),
          { amount: (r) => r.amount })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>건수</th>
                <th style={{ width: 160, textAlign: 'right' }}>{moneyLabel}액</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                      {g.sums.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}

export default function CollectionPage() {
  return <SettlementStatusPage type="RECEIPT" title="수금현황" moneyLabel="수금" />
}
