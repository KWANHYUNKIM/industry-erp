import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { periodOf, INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { LotTransaction } from '../../api/types'
import { dateText } from '../../utils/dateText'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 재고 II &gt; 시리얼/로트No. &gt; <b>시리얼/로트No.내역현황</b> (이카운트 E040639)
 *
 * <p><b>우리에게 없던 화면이다.</b> 사본 메뉴 대조표에 이 이름이 없어 빠졌다는 것을 아무도
 * 몰랐다 — 2026-09-02 에 원본 메뉴에서 직접 찾아 쟀다. 수불부(E040620)는 로트별로 줄을
 * 늘어놓는 자리고, 이 화면은 그것을 <b>어느 단위로 합쳐 볼지</b>가 본체다.
 *
 * <p>원본 조건 실측(2026-09-02): 구분([내역]·[집계] + 단위 여섯) · 기준일자(기본
 * <b>[금월(~오늘)]</b>) · <b>유효기한(구간)</b> · 시리얼/로트No. · 창고 · 품목 · 전표구분 ·
 * 양식(적용양식·양식구분·결재방표시·정렬/소계기준·설정). 빠른선택은 조회 공통 묶음이다.
 *
 * <p>자료는 <code>GET /api/lots/transactions?from=&amp;to=</code> 그대로다.
 */

/**
 * 원본 [구분]의 단위 여섯(2026-09-02 실측). 기본은 [라인별] 이다.
 *
 * <p>매출계획현황(E040640)은 여기에 거래처별·담당자별이 더 붙어 여덟인데, 로트 쪽은
 * <b>여섯뿐</b>이다 — 로트 움직임은 거래처를 달고 다니지 않는다. 화면마다 다르다.
 */
const UNITS = ['일별', '월별', '라인별', '전표별', '품목별', '전표별품목별'] as const
type Unit = typeof UNITS[number]

const num = (n: number) => n.toLocaleString('ko-KR')

/* 원본은 [금월(~오늘)] 을 보고 열린다(실측). */
const initP = periodOf('금월(~오늘)')!

export default function LotTxStatusPage() {
  const [rows, setRows] = useState<LotTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  const [unit, setUnit] = useState<Unit>('라인별')
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  /* 원본 [유효기한]은 이 화면에서 <b>구간</b>이다(재고현황에서는 드롭다운이었다 — 화면마다 다르다). */
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [item, setItem] = useState('')
  /* 원본 [전표구분] — 우리 로트 움직임의 유형(입고·출고·조정)이 그 자리다. */
  const [docType, setDocType] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await api.get<LotTransaction[]>('/lots/transactions', {
        params: { from: from || undefined, to: to || undefined },
      })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to])

  /* 고를 후보는 지금 걸린 자료에서 뽑는다 — 마스터를 통째로 받으면 조건을 안 쓰는 사람도 느려진다. */
  const lotNos = useMemo(() => [...new Set(rows.map((r) => r.lotNo))].sort(), [rows])
  const warehouses = useMemo(
    () => [...new Set(rows.map((r) => r.warehouseName).filter(Boolean) as string[])].sort(), [rows])
  const items = useMemo(() => [...new Set(rows.map((r) => r.itemName))].sort(), [rows])
  const docTypes = useMemo(() => [...new Set(rows.map((r) => r.typeName))].sort(), [rows])

  const shown = useMemo(() => {
    const kw = keyword.trim()
    return rows.filter((r) => {
      if (expFrom && (r.expireDate == null || r.expireDate < expFrom)) return false
      if (expTo && (r.expireDate == null || r.expireDate > expTo)) return false
      if (lotNo && r.lotNo !== lotNo) return false
      if (warehouse && r.warehouseName !== warehouse) return false
      if (item && r.itemName !== item) return false
      if (docType && r.typeName !== docType) return false
      if (kw && !r.lotNo.includes(kw) && !r.itemName.includes(kw)) return false
      return true
    })
  }, [rows, expFrom, expTo, lotNo, warehouse, item, docType, keyword])

  /** 원본 [구분]이 [집계] 일 때 고른 단위로 합친다. */
  const groups = useMemo(() => {
    const keyOf = (r: LotTransaction) =>
      unit === '일별' ? dateText(r.txDate)
        : unit === '월별' ? r.txDate.slice(0, 7)
          : unit === '전표별' ? r.typeName
            : unit === '품목별' ? r.itemName
              : unit === '전표별품목별' ? `${r.typeName} · ${r.itemName}`
                /* [라인별]은 합칠 것이 없다 — 줄 하나가 곧 라인이라 로트로 묶는다. */
                : r.lotNo
    return subtotalBy(shown, keyOf, { qty: (r) => r.quantityChange })
  }, [shown, unit])

  const totalQty = useMemo(() => shown.reduce((s, r) => s + r.quantityChange, 0), [shown])

  return (
    <EcListShell
      title="시리얼/로트No.내역현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: () => load() }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">
        기준일자 구간의 로트 움직임. [집계]로 바꾸면 고른 단위로 합쳐서 본다.
      </p>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 차례: 구분 · 기준일자 · 유효기한 · 시리얼/로트No. · 창고 · 품목 · 전표구분 */}
        <EcCond label="구분">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="ec-pills">
              {(['내역', '집계'] as const).map((m) => (
                <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                        onClick={() => setMode(m)}>{m}</button>
              ))}
            </div>
            <select className="ec-input" value={unit}
                    onChange={(e) => setUnit(e.target.value as Unit)} style={{ width: 140 }}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </EcCond>
        <EcCond label="기준일자">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <input type="date" className="ec-input" value={from}
                   onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
            <span style={{ color: 'var(--ec-label)' }}>~</span>
            <input type="date" className="ec-input" value={to}
                   onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
                           onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </div>
        </EcCond>
        <EcCond label="유효기한">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" className="ec-input" value={expFrom}
                   onChange={(e) => setExpFrom(e.target.value)} style={{ width: 140 }} />
            <span style={{ color: 'var(--ec-label)' }}>~</span>
            <input type="date" className="ec-input" value={expTo}
                   onChange={(e) => setExpTo(e.target.value)} style={{ width: 140 }} />
          </div>
        </EcCond>
        <EcCond label="시리얼/로트No." pick>
          <CodePickerField label="시리얼/로트No." hideLabel width={190} emptyLabel="전체"
                           value={lotNo} onChange={setLotNo}
                           items={lotNos.map((l) => ({ value: l, name: l }))} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={160} emptyLabel="전체"
                           value={warehouse} onChange={setWarehouse}
                           items={warehouses.map((w) => ({ value: w, name: w }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={setItem}
                           items={items.map((i) => ({ value: i, name: i }))} />
        </EcCond>
        <EcCond label="전표구분" pick>
          <CodePickerField label="전표구분" hideLabel width={140} emptyLabel="전체"
                           value={docType} onChange={setDocType}
                           items={docTypes.map((t) => ({ value: t, name: t }))} />
        </EcCond>
      </ul>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        {dateText(from)} ~ {dateText(to)} · 줄 <b style={{ color: '#3a4453' }}>{num(shown.length)}</b>건 ·
        수량합 <b style={{ color: 'var(--ec-blue-dark)' }}>{num(totalQty)}</b>
      </div>

      {mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>{unit.replace(/별$/, '')}</th>
              <th style={{ width: 100, textAlign: 'right' }}>건수</th>
              <th style={{ width: 140, textAlign: 'right' }}>수량합</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : groups.map((g, i) => (
              <tr key={g.label}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{g.label}</td>
                <td style={{ textAlign: 'right' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right' }}>{num(g.sums.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 100 }}>일자</th>
              <th style={{ width: 150 }}>시리얼/로트No.</th>
              <th style={{ width: 110 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ width: 120 }}>창고</th>
              <th style={{ width: 100 }}>유효기한</th>
              <th style={{ width: 90 }}>전표구분</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 110, textAlign: 'right' }}>잔량</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>{dateText(r.txDate)}</td>
                <td style={{ fontFamily: 'monospace' }}>{r.lotNo}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td style={{ color: r.warehouseName ? undefined : '#c9ced6' }}>{r.warehouseName ?? '(미지정)'}</td>
                <td style={{ color: r.expireDate ? '#5a626e' : '#c9ced6' }}>{dateText(r.expireDate) || ''}</td>
                <td>{r.typeName}</td>
                <td style={{ textAlign: 'right', color: r.quantityChange < 0 ? '#c60a2e' : '#1c7c3c' }}>
                  {num(r.quantityChange)}
                </td>
                <td style={{ textAlign: 'right' }}>{num(r.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </EcListShell>
  )
}
