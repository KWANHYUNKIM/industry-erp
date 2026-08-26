import { useRef, useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { PartnerBalance } from '../../api/types'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

const won = (n: number) => n.toLocaleString('ko-KR')

/** 채권만 / 채무만 / 둘 다. 원본은 거래처별채권(영업)과 거래처별채무(구매)가 <b>따로</b> 있다. */
export type LedgerSide = 'AR' | 'AP' | 'BOTH'

const TITLE: Record<LedgerSide, string> = {
  AR: '거래처별채권',
  AP: '거래처별채무',
  BOTH: '거래처별 채권·채무 현황',
}

/**
 * 원본 조건 판 실측(사본 · 거래처별채권/채무):
 *   [구분] 거래처별 | 담당자별 · 기준일자(전월+금월) · 거래처 · 대표거래처로 합산 ·
 *   거래처관계기준/개별거래처기준 · 거래처관리담당자 · [기타] 사용중단거래처포함 · 잔액
 *
 * <p>우리 화면은 조건이 <b>하나도 없었다</b> — 거래처 잔액을 통째로 뿌리기만 했다.
 * 특히 [구분] 담당자별이 없어 "이 담당자가 걷어야 할 돈이 얼마인가"를 볼 수가 없었다.
 *
 * <p>대표거래처 합산·거래처관계기준은 거래처 관계 마스터가 있어야 해서 아직 못 한다.
 * 기준일자는 잔액 API 가 asOf 한 날짜만 받으므로 채권/채무현황(ArApStatusPage)이 그쪽을 맡는다.
 */
type Group = '거래처별' | '담당자별'

export default function LedgerPage({ side = 'BOTH' }: { side?: LedgerSide }) {
  const showAr = side !== 'AP'
  const showAp = side !== 'AR'
  const [rows, setRows] = useState<PartnerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [group, setGroup] = useState<Group>('거래처별')
  const [partner, setPartner] = useState('')
  const [manager, setManager] = useState('')
  const [withInactive, setWithInactive] = useState(false)
  const [onlyOpen, setOnlyOpen] = useState(false)

  useEffect(() => {
    api
      .get<PartnerBalance[]>('/ledger/partner-balances')
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const shown = useMemo(() => rows.filter((r) => {
    if (partner && !(r.name.includes(partner) || r.code.includes(partner))) return false
    if (manager && !(r.manager ?? '').includes(manager)) return false
    if (!withInactive && !r.active) return false
    if (onlyOpen) {
      const bal = (showAr ? r.receivable : 0) + (showAp ? r.payable : 0)
      if (bal === 0) return false
    }
    return true
  }), [rows, partner, manager, withInactive, onlyOpen, showAr, showAp])

  /** 담당자별 — 같은 관리담당자의 거래처 잔액을 모은다. 담당자가 없으면 '(미지정)'. */
  const byManager = useMemo(() => {
    const m = new Map<string, { key: string; count: number; receivable: number; payable: number }>()
    for (const r of shown) {
      const key = r.manager?.trim() || '(미지정)'
      const cur = m.get(key)
      if (!cur) m.set(key, { key, count: 1, receivable: r.receivable, payable: r.payable })
      else { cur.count += 1; cur.receivable += r.receivable; cur.payable += r.payable }
    }
    return [...m.values()].sort((a, b) => (b.receivable + b.payable) - (a.receivable + a.payable))
  }, [shown])

  const totalReceivable = shown.reduce((a, r) => a + r.receivable, 0)
  const totalPayable = shown.reduce((a, r) => a + r.payable, 0)

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '거래처별 채권·채무', [side, shown.length, group])
  // 담당자별 표도 채권/채무 열이 조건부라 정적으로 셀 수 없다 — 같은 방식으로 못 박는다.
  const mgrTableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(mgrTableRef, '담당자별 채권·채무', [side, byManager.length, group])

  return (
    <EcListShell
      title={TITLE[side]}
      actions={[
        { label: '다시 작성', onClick: () => {
          setGroup('거래처별'); setPartner(''); setManager(''); setWithInactive(false); setOnlyOpen(false)
        } },
        { label: 'Excel' },
        { label: '인쇄' },
      ]}
    >
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          <div className="ec-pills">
            {(['거래처별', '담당자별'] as const).map((g) => (
              <button key={g} type="button" className={`ec-pill no-ec${group === g ? ' active' : ''}`}
                      onClick={() => setGroup(g)}>{g}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="거래처" pick>
          <input className="ec-input" placeholder="거래처명·코드 일부" value={partner}
                 onChange={(e) => setPartner(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <input className="ec-input" placeholder="담당자 일부" value={manager}
                 onChange={(e) => setManager(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단거래처포함
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            잔액 있는 거래처만
          </label>
        </EcCond>
      </ul>

      {/* 요약 박스 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {showAr && <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#f7f9ff', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: 'var(--ec-blue-dark)' }}>총 채권 (받을 돈)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ec-blue)' }}>{won(totalReceivable)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
        </div>}
        {showAp && <div style={{ flex: 1, border: '1px solid var(--ec-border)', background: '#f4faf5', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: '#1c6b32' }}>총 채무 (줄 돈)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2f8401' }}>{won(totalPayable)} <span style={{ fontSize: 13, fontWeight: 400 }}>원</span></div>
        </div>}
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      {group === '담당자별' ? (
        <table ref={mgrTableRef} className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>거래처관리담당자</th>
              <th style={{ width: 110, textAlign: 'right' }}>거래처수</th>
              {showAr && <th style={{ width: 160, textAlign: 'right' }}>채권 (외상매출금)</th>}
              {showAp && <th style={{ width: 160, textAlign: 'right' }}>채무 (외상매입금)</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byManager.length === 0 ? (
              <tr><td colSpan={3 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>거래처가 없습니다.</td></tr>
            ) : byManager.map((g, i) => (
              <tr key={g.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ color: g.key === '(미지정)' ? '#9aa1ab' : undefined }}>{g.key}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(g.count)}</td>
                {showAr && <td style={{ textAlign: 'right', fontWeight: 600, color: g.receivable > 0 ? 'var(--ec-blue)' : '#bbb' }}>{won(g.receivable)}</td>}
                {showAp && <td style={{ textAlign: 'right', fontWeight: 600, color: g.payable > 0 ? '#2f8401' : '#bbb' }}>{won(g.payable)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={2} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right' }}>{won(shown.length)}</td>
              {showAr && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totalReceivable)}</td>}
              {showAp && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{won(totalPayable)}</td>}
            </tr>
          </tfoot>
        </table>
      ) : (
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>거래처코드 ▼</th>
            <th>상호 ▼</th>
            <th style={{ textAlign: 'center' }}>구분</th>
            {showAr && <th style={{ textAlign: 'right' }}>채권 (외상매출금)</th>}
            {showAp && <th style={{ textAlign: 'right' }}>채무 (외상매입금)</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={4 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={4 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>거래처가 없습니다.</td></tr>
          ) : shown.map((r, idx) => (
            <tr key={r.partnerId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code}</td>
              <td>{r.name}</td>
              <td style={{ textAlign: 'center' }}>{r.typeName}</td>
              {showAr && <td style={{ textAlign: 'right', fontWeight: 600, color: r.receivable > 0 ? 'var(--ec-blue)' : '#bbb' }}>{won(r.receivable)}</td>}
              {showAp && <td style={{ textAlign: 'right', fontWeight: 600, color: r.payable > 0 ? '#2f8401' : '#bbb' }}>{won(r.payable)}</td>}
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={4} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              {showAr && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totalReceivable)}</td>}
              {showAp && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{won(totalPayable)}</td>}
            </tr>
          </tfoot>
        )}
      </table>
      )}

      <p style={{ marginTop: 10, fontSize: 11.5, color: '#9aa1ab' }}>
        ※ 채권 = 판매 합계, 채무 = 구매 합계. 수금/지급은 「거래처별 수금/지급(정산)」 화면에서 처리합니다.
      </p>
    </EcListShell>
  )
}
