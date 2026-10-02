import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { periodOf } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

interface JournalLine { accountCode: string; accountName: string; debit: number; credit: number; description: string | null }
interface Journal {
  id: number; docNo: string; entryDate: string; description: string | null
  partnerId: number | null; partnerName: string | null; sourceType: string; sourceTypeName: string
  lines: JournalLine[]
}

/** 부가세대급금 — 매입부가세가 걸리는 계정. */
const VAT_PAID = '135'
/** 재고 쪽에서 회계로 넘긴 매입 전표 — 구매 회계반영 · 외주비 회계반영. */
const SOURCES = new Set(['PURCHASE', 'SUBCONTRACT'])
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 재고 I &gt; 생산/외주 &gt; 생산/외주현황 &gt; <b>매입(세금)계산서현황(재고)</b>(E040320, 2026-10-02 loginaa 실측).
 *
 * <p>결과 제목은 [매입청구서현황]이고 열은 일자-No. · 거래처명 · 공급가액 · 매입부가세 · 매입합계 · 내역보기,
 * 달마다 "YYYY/MM 계" 소계와 합계가 붙는다. 재고 쪽(구매·외주비)에서 회계로 넘긴 매입 전표를 보는 자리다.
 * 조건은 기준일자 · 회계전표No. · 거래처(원본의 부서·프로젝트·부가세유형·상태는 우리 전표가 들지 않는다).
 *
 * <p>공급가액은 부가세대급금(135)·외상매입금이 아닌 줄의 차변−대변, 매입부가세는 135 의 차변−대변이다 —
 * 반품으로 되돌린 전표는 음수로 잡힌다.
 */
export default function PurchaseTaxStockPage() {
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partner, setPartner] = useState('')
  const [rows, setRows] = useState<Journal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<Journal | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.get<{ rows: Journal[] }>('/journals', { params: { from, to, all: true } })
      setRows(r.data.rows.filter((j) => SOURCES.has(j.sourceType)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const sumOf = (j: Journal) => {
    let supply = 0, vat = 0
    for (const l of j.lines) {
      const v = Number(l.debit) - Number(l.credit)
      if (l.accountCode === VAT_PAID) vat += v
      else if (v !== 0 && Number(l.debit) + Number(l.credit) > 0 && !/^25[0-9]$/.test(l.accountCode)) supply += v
    }
    return { supply, vat, total: supply + vat }
  }
  const shown = useMemo(() => rows
    .filter((j) => !docNo || j.docNo.includes(docNo))
    .filter((j) => !partner || (j.partnerName ?? '') === partner)
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo))),
  [rows, docNo, partner])
  const months = useMemo(() => {
    const m = new Map<string, Journal[]>()
    shown.forEach((j) => { const k = j.entryDate.slice(0, 7); m.set(k, [...(m.get(k) ?? []), j]) })
    return [...m.entries()]
  }, [shown])
  const total = shown.reduce((a, j) => { const s = sumOf(j); return { supply: a.supply + s.supply, vat: a.vat + s.vat, total: a.total + s.total } }, { supply: 0, vat: 0, total: 0 })

  return (
    <EcListShell
      title="매입(세금)계산서현황(재고)"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setDocNo(''); setPartner('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={[...new Set(rows.map((j) => j.partnerName).filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        </EcCond>
      </ul>

      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 6px' }}>매입청구서현황 <span style={{ fontWeight: 400, color: '#8a929c' }}>{dateText(from)} ~ {dateText(to)}</span></h3>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>일자-No.</th>
            <th>거래처명</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>매입부가세</th>
            <th style={{ textAlign: 'right' }}>매입합계</th>
            <th style={{ textAlign: 'center' }}>내역보기</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : months.flatMap(([m, js]) => {
            const sub = js.reduce((a, j) => { const s = sumOf(j); return { supply: a.supply + s.supply, vat: a.vat + s.vat, total: a.total + s.total } }, { supply: 0, vat: 0, total: 0 })
            return [
              ...js.map((j) => {
                const s = sumOf(j)
                return (
                  <tr key={j.id}>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(j.entryDate)} {j.docNo}</td>
                    <td>{j.partnerName ?? ''}</td>
                    <td style={{ textAlign: 'right' }}>{won(s.supply)}</td>
                    <td style={{ textAlign: 'right' }}>{won(s.vat)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(s.total)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" className="no-ec" onClick={() => setDetail(j)}
                              style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>내역보기</button>
                    </td>
                  </tr>
                )
              }),
              <tr key={`m${m}`} style={{ background: '#f5f7fa', fontWeight: 600 }}>
                <td colSpan={2} style={{ textAlign: 'center' }}>{m.replace('-', '/')} 계</td>
                <td style={{ textAlign: 'right' }}>{won(sub.supply)}</td>
                <td style={{ textAlign: 'right' }}>{won(sub.vat)}</td>
                <td style={{ textAlign: 'right' }}>{won(sub.total)}</td>
                <td></td>
              </tr>,
            ]
          })}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={2} style={{ textAlign: 'center' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(total.supply)}</td>
              <td style={{ textAlign: 'right' }}>{won(total.vat)}</td>
              <td style={{ textAlign: 'right' }}>{won(total.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
      <Modal open={detail != null} error={error} title={detail ? `${dateText(detail.entryDate)} ${detail.docNo} — ${detail.sourceTypeName}` : ''} width={640} onClose={() => setDetail(null)}>
        <table className="w-full text-left">
          <thead><tr><th>계정</th><th>적요</th><th style={{ textAlign: 'right' }}>차변</th><th style={{ textAlign: 'right' }}>대변</th></tr></thead>
          <tbody>
            {(detail?.lines ?? []).map((l, i) => (
              <tr key={i}>
                <td>{l.accountCode} {l.accountName}</td>
                <td>{l.description ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{Number(l.debit) ? won(l.debit) : ''}</td>
                <td style={{ textAlign: 'right' }}>{Number(l.credit) ? won(l.credit) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </EcListShell>
  )
}
