import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

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
 *
 * <p>원본 판매일괄회계반영의 [구분] 은 <b>거래처별 · 전표별</b> 둘이다(결과 열:
 * 기준일자 · 거래일자 · 거래처명 · 거래가액 · 조정 · 공급가액 · 부가세 · 합계 · 품목요약 ·
 * 부가세유형 · <b>일부반영</b>). 우리는 전표별 하나뿐이라, 월말에 거래처별로 묶어
 * 한 번에 반영하는 흐름이 없었다 — 전표가 수십 장이면 체크를 수십 번 해야 한다.
 *
 * <p><b>원본 회계미반영현황(판매)의 결과 열 실측(사본)</b>: 일자-No. · 거래처명 ·
 * <b>품목코드</b> · <b>품목명</b> · <b>수량</b> · <b>단가</b> · 공급가액 · 부가세 · 적요.
 * 그리고 <b>월별 소계</b>('2026/03 계' … '합계')가 들어간다.
 * 우리는 전표 한 줄에 "첫 품목 외 N건" 요약뿐이라 <b>어느 품목이 회계로 안 넘어갔는지</b>
 * 알 수가 없었다. 월 소계도 없어 "이번 달 미반영이 얼마인가"를 눈으로 세야 했다.
 * 그래서 [구분]에 <b>품목별</b>을 더한다.
 *
 * <p>'조정'과 '부가세유형' 은 만들지 않았다. 우리 전표에 조정 금액 칸이 없고 부가세유형
 * 마스터도 없다 — 늘 비는 열을 두면 화면이 거짓말을 한다.
 */
type Kind = 'sales' | 'purchase'

/**
 * 원본 [구분]. 순서도 원본을 따른다.
 *
 * <p>원본 라디오는 <b>거래처별 · 전표별</b> 둘이고 <b>거래처별이 켜진 채</b> 뜬다
 * (사본 조건 판의 checked 실측). [품목별]은 우리 것이다 — 어느 품목이 아직 회계로
 * 안 넘어갔는지를 보려면 그 단위가 필요하다.
 */
const MODES = ['거래처별', '전표별', '품목별'] as const
type Mode = typeof MODES[number]

interface SlipLine {
  itemCode: string
  itemName: string
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
  remark: string | null
}

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
  /** 품목 줄. 원본 회계미반영현황의 결과 격자가 이 단위다. */
  lines: SlipLine[]
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  /** 원본 판매·구매일괄회계반영의 [부가세유형] — 과세 · 면세. */
  vatType: string
  /** 원본 판매일괄회계반영의 [거래구분] · 구매일괄회계반영의 [구매구분] — 일반 · 반품. */
  tradeKind: string
  reflected: boolean
  /**
   * 원본 판매·구매일괄회계반영의 [회계전표No.]. 반영 전에는 null 이다.
   * 반영했다는 표시만 있고 어느 분개가 됐는지가 없으면 그 전표를 찾아갈 길이 없다.
   */
  journalEntryId: number | null
  journalDocNo: string | null
}

export default function AccountingReflectionPage() {
  const [params] = useSearchParams()
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'warehouses', 'projects', 'items', 'employees'])
  const [slips, setSlips] = useState<Slip[]>([])
  const [kind, setKind] = useState<Kind>(params.get('kind') === 'purchase' ? 'purchase' : 'sales')
  /*
   * 원본은 <b>거래처별</b>로 열린다. 회계반영은 거래처 단위로 묶어서 하는 일이라
   * 처음 보이는 판이 그 단위여야 한다 — 전표별로 열면 같은 거래처가 여러 줄로 흩어져
   * 한 번에 반영할 것을 눈으로 모아야 한다.
   */
  const [mode, setMode] = useState<Mode>('거래처별')
  /*
   * 원본 조건 판 실측(사본 · 회계미반영현황(판매)/(구매)):
   *   기준일(영업주기) · 거래유형 · 창고 · 프로젝트 · 거래처 · 품목 ·
   *   거래처관리담당자 · 금액
   * 우리는 거래처·전표번호·금액뿐이었다. 창고·프로젝트·품목·담당자는 전표에 있는데
   * 응답에 안 실려 거를 수가 없었다 — 백엔드에서 같이 보내도록 고치고 조건으로 붙였다.
   * <p>[거래유형](과세/면세)은 예전에 "이 목록이 전표 단위라 아직 없다" 고 적어 뒀는데,
   * 그 뒤 전표가 과세 여부를 실제로 들고 있게 되면서(vatType) 걸 수 있게 됐다.
   * 조건을 안 만들면 열은 보이는데 그걸로 걸러낼 수가 없다.
   */
  const [cond, setCond] = useState({
    from: '', to: '', partner: '', docNo: '', amtFrom: '', amtTo: '',
    warehouse: '', project: '', item: '', employee: '', vatType: '', tradeKind: '',
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
    .filter((s) => !cond.vatType || s.vatType === cond.vatType)
    // 원본 [거래구분]·[구매구분]. 반품 전표는 금액이 음수라 반영 금액도 반대로 간다.
    .filter((s) => !cond.tradeKind || s.tradeKind === cond.tradeKind)
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
      warehouse: '', project: '', item: '', employee: '', vatType: '', tradeKind: '',
    })
    setOnlyUnreflected(true)   // 조건 판의 체크박스다. 빼먹으면 '전체'로 본 채 초기화된다
    // 선택도 지운다. 조건이 바뀌면 목록이 달라지는데 체크가 남아 있으면
    // 화면에 보이지도 않는 전표를 회계반영하게 된다.
    setChecked(new Set())
  }

  /**
   * 거래처별로 묶은 줄. 한 거래처의 미반영 전표를 한 번에 반영하려고 만든다.
   *
   * <p>'일부반영' 은 그 거래처의 전표 중 <b>일부만</b> 반영된 상태다. 이게 보이지 않으면
   * "이 거래처는 끝냈다" 고 착각하기 쉽다 — 원본에도 그 열이 있다.
   */
  /**
   * 품목별 — 전표를 품목 줄로 펼치고 <b>월이 바뀌는 자리에 소계</b>를 끼운다.
   *
   * <p>소계를 화면에서 따로 계산하지 않고 목록을 만들면서 같이 넣는다.
   * 두 벌로 세면 한쪽만 조건이 바뀌었을 때 소계와 줄이 어긋난다.
   */
  const lineRows = useMemo(() => {
    type Row =
      | { kind: 'line'; key: string; no: number; slip: Slip; line: SlipLine }
      | { kind: 'subtotal'; key: string; month: string; supply: number; vat: number }
    const sorted = [...shown].sort((a, b) => (a.slipDate < b.slipDate ? -1 : a.slipDate > b.slipDate ? 1 : a.id - b.id))
    const out: Row[] = []
    let month = ''
    // 줄 번호는 소계 줄을 빼고 센다 — 소계까지 세면 번호에 구멍이 뚫린다.
    let no = 0
    let supply = 0
    let vat = 0
    const flush = () => {
      if (month) out.push({ kind: 'subtotal', key: `sub-${month}`, month, supply, vat })
      supply = 0
      vat = 0
    }
    for (const sl of sorted) {
      const m = sl.slipDate.slice(0, 7).replace('-', '/')
      if (m !== month) { flush(); month = m }
      for (const [i, line] of (sl.lines ?? []).entries()) {
        out.push({ kind: 'line', key: `${sl.id}-${i}`, no: ++no, slip: sl, line })
        supply += line.supplyAmount
        vat += line.vatAmount
      }
    }
    flush()
    return out
  }, [shown])

  const lineTotal = useMemo(() => shown.reduce(
    (t, sl) => ({ supply: t.supply + sl.supplyAmount, vat: t.vat + sl.vatAmount }),
    { supply: 0, vat: 0 },
  ), [shown])

  const byPartner = useMemo(() => {
    const m = new Map()
    for (const s of shown) {
      const cur = m.get(s.partnerId) ?? {
        partnerId: s.partnerId, partnerName: s.partnerName,
        ids: [], firstDate: s.slipDate, lastDate: s.slipDate,
        supply: 0, vat: 0, items: new Set(), vatTypes: new Set<string>(),
        reflected: 0, unreflected: 0,
      }
      if (!s.reflected) cur.ids.push(s.id)
      cur.firstDate = s.slipDate < cur.firstDate ? s.slipDate : cur.firstDate
      cur.lastDate = s.slipDate > cur.lastDate ? s.slipDate : cur.lastDate
      cur.supply += s.supplyAmount
      cur.vat += s.vatAmount
      if (s.itemSummary) cur.items.add(s.itemSummary)
      cur.vatTypes.add(s.vatType)
      if (s.reflected) cur.reflected += 1
      else cur.unreflected += 1
      m.set(s.partnerId, cur)
    }
    return [...m.values()].sort((a, b) => a.partnerName.localeCompare(b.partnerName))
  }, [shown])

  /** 거래처 한 줄을 통째로 반영한다. 미반영 전표가 없으면 부를 일이 없다. */
  async function reflectPartner(ids: number[]) {
    if (ids.length === 0) return
    setError(''); setOk('')
    try {
      const res = await api.post<{ reflectedCount: number }>(
        '/accounting-reflection/reflect', { kind: kind.toUpperCase(), ids })
      setOk(`${res.data.reflectedCount}건 회계반영 완료`)
      load(kind)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
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
        <EcCond label="구분">
          <div className="ec-pills">
            {MODES.map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="전표번호" pick>
          <input className="ec-input" placeholder="전표번호 일부" value={cond.docNo}
                 onChange={(e) => setC({ docNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={cond.warehouse} onChange={(v) => setC({ warehouse: v })}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={cond.project} onChange={(v) => setC({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        {/* 원본 조건의 [거래유형]. 전표의 과세 여부를 그대로 본다. */}
        <EcCond label="거래유형">
          <div className="ec-pills">
            {['', '과세', '면세'].map((v) => (
              <button key={v || 'all'} type="button"
                      className={`ec-pill no-ec${cond.vatType === v ? ' active' : ''}`}
                      onClick={() => setC({ vatType: v })}>{v || '전체'}</button>
            ))}
          </div>
        </EcCond>
        {/* 원본 판매일괄회계반영의 [거래구분] · 구매일괄회계반영의 [구매구분]. */}
        <EcCond label={kind === 'sales' ? '거래구분' : '구매구분'}>
          <div className="ec-pills">
            {['', '일반', '반품'].map((v) => (
              <button key={v || 'all'} type="button"
                      className={`ec-pill no-ec${cond.tradeKind === v ? ' active' : ''}`}
                      onClick={() => setC({ tradeKind: v })}>{v || '전체'}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={cond.employee} onChange={(v) => setC({ employee: v })}
                           items={pickers.employees} />
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

      {mode === '품목별' ? (
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 190 }}>일자-No.</th>
              <th style={{ width: 150 }}>거래처명</th>
              <th style={{ width: 120 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ width: 90, textAlign: 'right' }}>수량</th>
              <th style={{ width: 110, textAlign: 'right' }}>단가</th>
              <th style={{ width: 130, textAlign: 'right' }}>공급가액</th>
              <th style={{ width: 110, textAlign: 'right' }}>부가세</th>
              <th style={{ width: 150 }}>적요</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : lineRows.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>대상 전표가 없습니다.</td></tr>
            ) : lineRows.map((r) => r.kind === 'subtotal' ? (
              <tr key={r.key} style={{ background: '#f3f6fa', fontWeight: 700 }}>
                <td colSpan={7} style={{ textAlign: 'right' }}>{r.month} 계</td>
                <td style={{ textAlign: 'right' }}>{r.supply.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right' }}>{r.vat.toLocaleString('ko-KR')}</td>
                <td></td>
              </tr>
            ) : (
              <tr key={r.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{r.no}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.slip.slipDate} {r.slip.docNo}</td>
                <td>{r.slip.partnerName}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.line.itemCode}</td>
                <td>{r.line.itemName}</td>
                <td style={{ textAlign: 'right' }}>{r.line.quantity.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right' }}>{r.line.unitPrice.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right' }}>{r.line.supplyAmount.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right' }}>{r.line.vatAmount.toLocaleString('ko-KR')}</td>
                <td style={{ color: '#8a929c' }}>{r.line.remark ?? ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={7} style={{ textAlign: 'right' }}>합계 ({shown.length}전표)</td>
              <td style={{ textAlign: 'right' }}>{lineTotal.supply.toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right' }}>{lineTotal.vat.toLocaleString('ko-KR')}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      ) : mode === '거래처별' ? (
        <table className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>거래처명</th>
              <th style={{ width: 170 }}>거래일자</th>
              <th style={{ width: 80, textAlign: 'right' }}>전표수</th>
              <th style={{ width: 130, textAlign: 'right' }}>공급가액</th>
              <th style={{ width: 110, textAlign: 'right' }}>부가세</th>
              <th style={{ width: 130, textAlign: 'right' }}>합계</th>
              <th>품목요약</th>
              <th style={{ width: 90, textAlign: 'center' }}>부가세유형</th>
              <th style={{ width: 90, textAlign: 'center' }}>일부반영</th>
              <th style={{ width: 110, textAlign: 'center' }}>반영</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byPartner.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>대상 전표가 없습니다.</td></tr>
            ) : byPartner.map((g, i) => {
              const partial = g.reflected > 0 && g.unreflected > 0
              return (
                <tr key={g.partnerId}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>{g.partnerName}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                    {g.firstDate === g.lastDate ? g.firstDate : `${g.firstDate} ~ ${g.lastDate}`}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {g.reflected + g.unreflected}
                    {g.unreflected > 0 && <span style={{ color: '#c60a2e' }}> (미 {g.unreflected})</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{g.supply.toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.vat.toLocaleString('ko-KR')}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{(g.supply + g.vat).toLocaleString('ko-KR')}</td>
                  <td style={{ color: '#5a626e', fontSize: 11.5 }}>
                    {[...g.items].slice(0, 2).join(', ')}{g.items.size > 2 ? ` 외 ${g.items.size - 2}` : ''}
                  </td>
                  {/* 과세·면세가 섞인 거래처는 둘 다 적는다 — 하나로 적으면 거짓말이 된다. */}
                  <td style={{ textAlign: 'center', fontSize: 11.5, color: '#5a626e' }}>
                    {[...g.vatTypes].join('·')}
                  </td>
                  {/* 일부만 반영된 거래처를 표시하지 않으면 "이 거래처는 끝냈다" 고 착각한다. */}
                  <td style={{ textAlign: 'center', fontWeight: 700, color: partial ? '#c07a00' : '#c9ced6' }}>
                    {partial ? 'YES' : ''}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {g.ids.length > 0 ? (
                      <button className="ec-btn" style={{ height: 20, padding: '0 6px' }}
                              onClick={() => reflectPartner(g.ids)}>
                        {g.ids.length}건 반영
                      </button>
                    ) : <span style={{ color: '#1c7c3c', fontSize: 11.5 }}>완료</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {byPartner.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({byPartner.length}거래처)</td>
                <td style={{ textAlign: 'right' }}>{byPartner.reduce((n, g) => n + g.supply, 0).toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right' }}>{byPartner.reduce((n, g) => n + g.vat, 0).toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>
                  {byPartner.reduce((n, g) => n + g.supply + g.vat, 0).toLocaleString('ko-KR')}
                </td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          )}
        </table>
      ) : (
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
            <th style={{ width: 150 }}>회계전표No.</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>대상 전표가 없습니다.</td></tr>
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
              <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                {s.journalDocNo ? (
                  <Link to={`/accounting/journals?entryId=${s.journalEntryId}`}
                        style={{ color: 'var(--ec-blue)' }}>{s.journalDocNo}</Link>
                ) : <span style={{ color: '#c9ced6' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </EcListShell>
  )
}
