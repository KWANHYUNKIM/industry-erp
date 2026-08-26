import { useRef, useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
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

export default function LedgerPage({ side = 'BOTH' }: { side?: LedgerSide }) {
  const showAr = side !== 'AP'
  const showAp = side !== 'AR'
  const [rows, setRows] = useState<PartnerBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get<PartnerBalance[]>('/ledger/partner-balances')
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  const totalReceivable = rows.reduce((a, r) => a + r.receivable, 0)
  const totalPayable = rows.reduce((a, r) => a + r.payable, 0)

  // 조건부 열이 있어 정적 검사(qa/ui-check.mjs)로는 칸 수를 셀 수 없다.
  // 개발 모드에서 렌더된 표를 직접 재서 합계행이 밀렸는지 잡는다.
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '거래처별 채권·채무', [side, rows.length])

  return (
    <EcListShell title={TITLE[side]} actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
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
          ) : rows.length === 0 ? (
            <tr><td colSpan={4 + (showAr ? 1 : 0) + (showAp ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>거래처가 없습니다.</td></tr>
          ) : rows.map((r, idx) => (
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
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={4} style={{ border: '1px solid var(--ec-border)', padding: '5px 8px' }}>합계</td>
              {showAr && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totalReceivable)}</td>}
              {showAp && <td style={{ border: '1px solid var(--ec-border)', padding: '5px 8px', textAlign: 'right', color: '#2f8401' }}>{won(totalPayable)}</td>}
            </tr>
          </tfoot>
        )}
      </table>

      <p style={{ marginTop: 10, fontSize: 11.5, color: '#9aa1ab' }}>
        ※ 채권 = 판매 합계, 채무 = 구매 합계. 수금/지급은 「거래처별 수금/지급(정산)」 화면에서 처리합니다.
      </p>
    </EcListShell>
  )
}
