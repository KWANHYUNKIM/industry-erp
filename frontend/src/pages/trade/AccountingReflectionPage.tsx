import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS } from '../../components/EcPeriodPicks'

/**
 * 회계미반영현황 (이카운트 E040319 구매 / 판매도 같은 모양) + 일괄 회계반영.
 * 백엔드 /accounting-reflection 연동.
 *
 * 원본은 판매·구매가 별도 메뉴지만 화면 모양이 같아 한 컴포넌트로 두고 종류만 바꾼다.
 * 어느 쪽으로 들어왔는지는 메뉴가 ?kind= 로 알려 준다.
 *
 * 원본 조건: 기준일(영업주기) · 거래유형 · 창고 · 프로젝트 · 거래처 · 품목 ·
 * 거래처관리담당자 · 금액(범위). 우리 Slip 에는 창고·프로젝트·품목·거래유형이 없어
 * **의도적 제외**(값 없는 컨트롤을 만들지 않는다). 전표일 구간·거래처·전표번호·금액 범위를 둔다.
 */
type Kind = 'sales' | 'purchase'

interface Slip {
  id: number
  kind: 'SALES' | 'PURCHASE'
  docNo: string
  slipDate: string
  partnerId: number
  partnerName: string
  warehouseName: string | null
  projectName: string | null
  employeeName: string | null
  itemSummary: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  reflected: boolean
}

export default function AccountingReflectionPage() {
  const [params] = useSearchParams()
  const [slips, setSlips] = useState<Slip[]>([])
  const [kind, setKind] = useState<Kind>(params.get('kind') === 'purchase' ? 'purchase' : 'sales')
  /*
   * 원본 조건 판 실측(사본 · 회계미반영현황(판매)/(구매)):
   *   기준일(영업주기) · 거래유형 · 창고 · 프로젝트 · 거래처 · 품목 ·
   *   거래처관리담당자 · 금액
   * 우리는 거래처·전표번호·금액뿐이었다. 창고·프로젝트·품목·담당자는 전표에 있는데
   * 응답에 안 실려 거를 수가 없었다 — 백엔드에서 같이 보내도록 고치고 조건으로 붙였다.
   * 거래유형(과세/면세)은 이 목록이 전표 단위라 아직 없다.
   */
  const [cond, setCond] = useState({
    from: '', to: '', partner: '', docNo: '', amtFrom: '', amtTo: '',
    warehouse: '', project: '', item: '', employee: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))
  const [onlyUnreflected, setOnlyUnreflected] = useState(true)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function load(k: Kind) {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Slip[]>(`/accounting-reflection?kind=${k.toUpperCase()}`)
      setSlips(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
      setSlips([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(kind)
    setChecked(new Set())
    setOk('')
  }, [kind])

  const shown = slips
    .filter((s) => !onlyUnreflected || !s.reflected)
    .filter((s) => !cond.from || s.slipDate >= cond.from)
    .filter((s) => !cond.to || s.slipDate <= cond.to)
    .filter((s) => !cond.partner || s.partnerName.includes(cond.partner))
    .filter((s) => !cond.docNo || s.docNo.includes(cond.docNo))
    .filter((s) => !cond.amtFrom || s.totalAmount >= Number(cond.amtFrom))
    .filter((s) => !cond.amtTo || s.totalAmount <= Number(cond.amtTo))
    .filter((s) => !cond.warehouse || (s.warehouseName ?? '').includes(cond.warehouse))
    .filter((s) => !cond.project || (s.projectName ?? '').includes(cond.project))
    .filter((s) => !cond.employee || (s.employeeName ?? '').includes(cond.employee))
    .filter((s) => !cond.item || (s.itemSummary ?? '').includes(cond.item))
  const unreflectedCount = slips.filter((s) => !s.reflected).length
  const selectedTotal = useMemo(
    () => slips.filter((s) => checked.has(s.id)).reduce((sum, s) => sum + s.totalAmount, 0),
    [slips, checked],
  )

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 두 메뉴가 같은 경로를 가리키므로 서로 오갈 때 컴포넌트가 다시 만들어지지 않는다.
  useEffect(() => { setKind(params.get('kind') === 'purchase' ? 'purchase' : 'sales') }, [params])

  const reset = () => {
    setCond({
      from: '', to: '', partner: '', docNo: '', amtFrom: '', amtTo: '',
      warehouse: '', project: '', item: '', employee: '',
    })
    setOnlyUnreflected(true)   // 조건 판의 체크박스다. 빼먹으면 '전체'로 본 채 초기화된다
    // 선택도 지운다. 조건이 바뀌면 목록이 달라지는데 체크가 남아 있으면
    // 화면에 보이지도 않는 전표를 회계반영하게 된다.
    setChecked(new Set())
  }

  async function reflectSelected() {
    if (checked.size === 0) return setError('반영할 전표를 선택하세요.')
    setError('')
    setOk('')
    try {
      const res = await api.post<{ reflectedCount: number }>('/accounting-reflection/reflect', {
        kind: kind.toUpperCase(),
        ids: [...checked],
      })
      setOk(`${res.data.reflectedCount}건 회계반영 완료`)
      setChecked(new Set())
      load(kind)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const kindBtn = (k: Kind, label: string) => (
    <button className={`ec-btn${kind === k ? ' ec-btn-primary' : ''}`} onClick={() => setKind(k)} style={{ minWidth: 84 }}>
      {label}
    </button>
  )

  return (
    <EcListShell
      title="회계반영 / 미반영현황"
      onNew={reflectSelected}
      newLabel={`선택 일괄반영(${checked.size})`}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => load(kind) },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        dateLabel="기준일(영업주기)"
      >
        <EcCond label="거래처" pick>
          <input className="ec-input" placeholder="거래처명 일부" value={cond.partner}
                 onChange={(e) => setC({ partner: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="전표번호" pick>
          <input className="ec-input" placeholder="전표번호 일부" value={cond.docNo}
                 onChange={(e) => setC({ docNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <input className="ec-input" placeholder="창고명 일부" value={cond.warehouse}
                 onChange={(e) => setC({ warehouse: e.target.value })} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <input className="ec-input" placeholder="프로젝트명 일부" value={cond.project}
                 onChange={(e) => setC({ project: e.target.value })} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="품목" pick>
          <input className="ec-input" placeholder="품목명 일부" value={cond.item}
                 onChange={(e) => setC({ item: e.target.value })} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <input className="ec-input" placeholder="담당자 일부" value={cond.employee}
                 onChange={(e) => setC({ employee: e.target.value })} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="금액">
          <input className="ec-input" type="number" value={cond.amtFrom}
                 onChange={(e) => setC({ amtFrom: e.target.value })} style={{ width: 120 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input className="ec-input" type="number" value={cond.amtTo}
                 onChange={(e) => setC({ amtTo: e.target.value })} style={{ width: 120 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {kindBtn('sales', '판매')}
        {kindBtn('purchase', '구매')}
        <label style={{ marginLeft: 8, fontSize: 12.5, color: '#5a626e', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={onlyUnreflected} onChange={(e) => setOnlyUnreflected(e.target.checked)} />
          미반영만 보기
        </label>
        <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          미반영 <b style={{ color: '#c60a2e', fontSize: 14 }}>{unreflectedCount}</b>건
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          선택합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{selectedTotal.toLocaleString()}</b>원
        </div>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>전표일 ▼</th>
            <th style={{ width: 150 }}>전표번호 ▼</th>
            <th>거래처 ▼</th>
            <th>품목명(요약)</th>
            <th style={{ width: 120 }}>창고명</th>
            <th style={{ width: 120, textAlign: 'right' }}>공급가액</th>
            <th style={{ width: 110, textAlign: 'right' }}>부가세</th>
            <th style={{ width: 90, textAlign: 'center' }}>회계반영 ▼</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>대상 전표가 없습니다.</td></tr>
          ) : shown.map((s, i) => (
            <tr key={s.id}>
              <td style={{ textAlign: 'center' }}>
                {s.reflected ? <span style={{ color: '#9aa1ab' }}>{i + 1}</span> : <input type="checkbox" checked={checked.has(s.id)} onChange={() => toggle(s.id)} />}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{s.slipDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{s.docNo}</td>
              <td>{s.partnerName}</td>
              <td>{s.itemSummary}</td>
              <td>{s.warehouseName ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{s.supplyAmount.toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right' }}>{s.vatAmount.toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'center', color: s.reflected ? '#1c7c3c' : '#c60a2e', fontWeight: 700 }}>{s.reflected ? '반영' : '미반영'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
