import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { PartnerBalance } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 영업 > 채권/채무현황 (이카운트 E040703) · 채권현황 (E040721)
 *
 * 거래처관리대장(LedgerPage)이 '지금 잔액'이라면 여기는 <b>기준일자 잔액</b>이다 —
 * 그 날짜까지 발생한 매출·매입·수금·지급만 더한다(GET /ledger/partner-balances?asOf=).
 * 거래처그룹·관리담당자·사용중단거래처 포함 여부로 거를 수 있고, 그룹 소계를 낸다.
 *
 * 원본의 거래처계층그룹·하위그룹포함검색·대표거래처합산은 우리 거래처 모델에 계층이 없어 제외했다
 * (거래처그룹은 1단계 평면 그룹이다).
 */
type Mode = 'BOTH' | 'RECEIVABLE' | 'PAYABLE'
const MODE_LABEL: Record<Mode, string> = { BOTH: '채권/채무', RECEIVABLE: '채권', PAYABLE: '채무' }

const won = (n: number) => n.toLocaleString()
const iso = (d: Date) => ymd(d)

export default function ArApStatusPage({ defaultMode = 'BOTH' }: { defaultMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [asOf, setAsOf] = useState(iso(new Date()))
  const [rows, setRows] = useState<PartnerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [group, setGroup] = useState('전체')
  const [manager, setManager] = useState('전체')
  const [keyword, setKeyword] = useState('')
  const [partnerCode, setPartnerCode] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [hideZero, setHideZero] = useState(true)

  useEffect(() => { setMode(defaultMode) }, [defaultMode])

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.get<PartnerBalance[]>('/ledger/partner-balances', { params: { asOf } })
      setRows(r.data)
    } catch (err) { setError(extractErrorMessage(err)) } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [asOf])

  const groups = useMemo(
    () => [...new Set(rows.map((r) => r.partnerGroupName).filter(Boolean))] as string[], [rows])
  const managers = useMemo(
    () => [...new Set(rows.map((r) => r.manager).filter(Boolean))] as string[], [rows])

  const shown = useMemo(() => rows.filter((r) => {
    if (!includeInactive && !r.active) return false
    if (group !== '전체' && (r.partnerGroupName ?? '') !== group) return false
    if (manager !== '전체' && (r.manager ?? '') !== manager) return false
    if (keyword && !`${r.code} ${r.name}`.includes(keyword.trim())) return false
    if (hideZero) {
      const v = mode === 'RECEIVABLE' ? r.receivable : mode === 'PAYABLE' ? r.payable : r.receivable + r.payable
      if (v === 0) return false
    }
    return true
  }), [rows, includeInactive, group, manager, keyword, hideZero, mode])

  const total = useMemo(() => shown.reduce(
    (a, r) => ({ receivable: a.receivable + r.receivable, payable: a.payable + r.payable }),
    { receivable: 0, payable: 0 }), [shown])

  /** 거래처그룹 소계 (그룹 미지정은 '미지정'으로 묶는다) */
  const subtotals = useMemo(() => {
    const m = new Map<string, { receivable: number; payable: number; count: number }>()
    shown.forEach((r) => {
      const k = r.partnerGroupName ?? '(미지정)'
      const cur = m.get(k) ?? { receivable: 0, payable: 0, count: 0 }
      m.set(k, { receivable: cur.receivable + r.receivable, payable: cur.payable + r.payable, count: cur.count + 1 })
    })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  const showR = mode !== 'PAYABLE'
  const showP = mode !== 'RECEIVABLE'
  const cols = 4 + (showR ? 1 : 0) + (showP ? 1 : 0) + (mode === 'BOTH' ? 1 : 0)

  return (
    <EcListShell
      title={mode === 'RECEIVABLE' ? '채권현황' : '채권/채무현황'}
      actions={[{ label: '검색(F8)', onClick: load, primary: true }, { label: 'Excel' }, { label: '인쇄' }]}
      help={
        <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          기준일자까지 발생한 매출·매입에서 수금·지급을 뺀 잔액입니다. 거래처관리대장이 ‘지금 잔액’이라면
          이 화면은 특정 시점으로 되돌린 잔액이라 마감·대사에 씁니다. 거래처그룹 소계를 함께 냅니다.
        </p>
      }
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>구분</div>
          <select className="ec-input" value={mode} onChange={(e) => setMode(e.target.value as Mode)} style={{ width: 110 }}>
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select></label>
        <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>기준일자</div>
          <input type="date" className="ec-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={{ width: 150 }} /></label>
        <div style={{ display: 'flex', gap: 3 }}>
          <button className="ec-btn" onClick={() => setAsOf(iso(new Date()))}>금일</button>
          <button className="ec-btn" onClick={() => { const d = new Date(); d.setDate(0); setAsOf(iso(d)) }}>전월말일</button>
          <button className="ec-btn" onClick={() => { const d = new Date(); setAsOf(iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))) }}>당월말일</button>
        </div>
        {/* 이카운트 원본은 거래처·거래처그룹·관리담당자가 드롭다운이 아니라 코드도움 팝업(code.openpopup)이다 */}
        <CodePickerField label="거래처" value={partnerCode} width={150}
                         onChange={(v, item) => { setPartnerCode(v); setKeyword(item ? item.name : '') }}
                         items={rows.map((r) => ({ value: r.code, code: r.code, name: r.name, sub: r.partnerGroupName }))} />
        <CodePickerField label="거래처그룹" value={group === '전체' ? '' : group} width={130}
                         onChange={(v) => setGroup(v || '전체')}
                         items={groups.map((g) => ({ value: g, name: g }))} />
        <CodePickerField label="거래처관리담당자" value={manager === '전체' ? '' : manager} width={120}
                         onChange={(v) => setManager(v || '전체')}
                         items={managers.map((m) => ({ value: m, name: m }))} />
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          사용중단거래처포함
        </label>
        <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          잔액 0 숨김
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {showR && (
          <div style={{ border: '1px solid var(--ec-border)', padding: '8px 14px', minWidth: 160 }}>
            <div style={{ fontSize: 11.5, color: '#8a929c' }}>채권 합계 ({asOf} 기준)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ec-blue-dark)' }}>{won(total.receivable)}</div>
          </div>
        )}
        {showP && (
          <div style={{ border: '1px solid var(--ec-border)', padding: '8px 14px', minWidth: 160 }}>
            <div style={{ fontSize: 11.5, color: '#8a929c' }}>채무 합계 ({asOf} 기준)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#c07a00' }}>{won(total.payable)}</div>
          </div>
        )}
        {mode === 'BOTH' && (
          <div style={{ border: '1px solid var(--ec-border)', padding: '8px 14px', minWidth: 160 }}>
            <div style={{ fontSize: 11.5, color: '#8a929c' }}>순채권(채권−채무)</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{won(total.receivable - total.payable)}</div>
          </div>
        )}
        <div style={{ border: '1px solid var(--ec-border)', padding: '8px 14px', minWidth: 110 }}>
          <div style={{ fontSize: 11.5, color: '#8a929c' }}>거래처</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{shown.length}</div>
        </div>
      </div>

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 110 }}>거래처코드</th>
          <th>거래처명</th>
          <th style={{ width: 130 }}>거래처그룹</th>
          <th style={{ width: 100 }}>관리담당자</th>
          {showR && <th style={{ width: 130, textAlign: 'right' }}>채권</th>}
          {showP && <th style={{ width: 130, textAlign: 'right' }}>채무</th>}
          {mode === 'BOTH' && <th style={{ width: 130, textAlign: 'right' }}>순액</th>}
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols + 2} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={cols + 2} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조건에 맞는 거래처가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.partnerId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td style={{ fontWeight: 600 }}>
                {r.name}
                {!r.active && <span style={{ color: '#c60a2e', fontSize: 11, marginLeft: 4 }}>(사용중단)</span>}
              </td>
              <td style={{ color: '#5a626e' }}>{r.partnerGroupName ?? ''}</td>
              <td style={{ color: '#5a626e' }}>{r.manager ?? ''}</td>
              {showR && <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{won(r.receivable)}</td>}
              {showP && <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{won(r.payable)}</td>}
              {mode === 'BOTH' && (
                <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{won(r.receivable - r.payable)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {shown.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>거래처그룹 소계</h3>
          <table className="w-full text-left">
            <thead><tr>
              <th>거래처그룹</th>
              <th style={{ width: 90, textAlign: 'right' }}>거래처수</th>
              {showR && <th style={{ width: 130, textAlign: 'right' }}>채권</th>}
              {showP && <th style={{ width: 130, textAlign: 'right' }}>채무</th>}
            </tr></thead>
            <tbody>
              {subtotals.map(([name, v]) => (
                <tr key={name}>
                  <td style={{ fontWeight: 600 }}>{name}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{v.count}</td>
                  {showR && <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{won(v.receivable)}</td>}
                  {showP && <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{won(v.payable)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </EcListShell>
  )
}
