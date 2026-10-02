import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import EcPeriodPicks, { AS_PICKS, SALES_TAX_LIST_PICKS, SALES_TAX_STOCK_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { dateText } from '../../utils/dateText'

interface JournalLine { accountCode: string; accountName: string; debit: number; credit: number; description: string | null }
interface Journal {
  id: number; docNo: string; entryDate: string; description: string | null
  partnerId: number | null; partnerName: string | null; sourceType: string; sourceTypeName: string
  lines: JournalLine[]
}

/** 부가세대급금 — 매입부가세가 걸리는 계정. 매출은 부가세예수금(255). */
const VAT_PAID = '135'
const VAT_RECEIVED = '255'
/** 재고 쪽에서 회계로 넘긴 전표 — 매입은 구매 회계반영 · 외주비 회계반영, 매출은 판매 회계반영. */
const SOURCES = { PURCHASE: new Set(['PURCHASE', 'SUBCONTRACT']), SALES: new Set(['SALES']) }
/** 원본 소계 · 합계줄(2026-10-03 매출 쪽 실측): 바탕 rgb(243,243,243) · 굵게 · 앞 두 칸을 묶어 가운데. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 재고 I &gt; 생산/외주 &gt; 생산/외주현황 &gt; <b>매입(세금)계산서현황(재고)</b>(E040320, 2026-10-02 loginaa 실측).
 *
 * <p>결과 제목은 [매입청구서현황]이고 열은 일자-No. · 거래처명 · 공급가액 · 매입부가세 · 매입합계 · 내역보기,
 * 달마다 "YYYY/MM 계" 소계와 합계가 붙는다. 재고 쪽(구매·외주비)에서 회계로 넘긴 매입 전표를 보는 자리다.
 * 조건은 기준일자 · 회계전표No. · 거래처 · 거래처관리담당자(원본의 부서·프로젝트·부가세유형·상태는 우리 전표가 들지 않는다).
 * 기간 빠른선택은 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 직전분기 · 직전반기 · 종료일(원본 실측 — A/S 현황과 같은 묶음).
 *
 * <p>공급가액은 부가세대급금(135)·외상매입금이 아닌 줄의 차변−대변, 매입부가세는 135 의 차변−대변이다 —
 * 반품으로 되돌린 전표는 음수로 잡힌다.
 */
/**
 * <p><b>매출(세금)계산서조회(재고)</b>(E040218, 같은 날 실측)는 같은 전표를 <b>목록</b>으로 본다(list) — 열 일자 - 번호 · 거래처명 · 공급가액 ·
 * 부가세 · 합 계 · 내역보기 · 인쇄, 달 소계 · 합계줄이 없고 기본은 최근30일(+1개월). 위 탭 전체 · 결재중 · 미확인 · 확인은
 * 회계전표에 결재 · 확인 상태가 없어 두지 않았다.
 */
export default function PurchaseTaxStockPage({ kind = 'PURCHASE', list = false }: { kind?: 'PURCHASE' | 'SALES'; list?: boolean }) {
  const sales = kind === 'SALES'
  /* 매출(세금)계산서현황(재고)(E040223)은 기본이 [최근30일] 이고 빠른선택 끝에도 그것이 있다 — 매입은 금월(~오늘). */
  const init = list ? periodOf('최근30일(+1개월)')! : sales ? periodOf('최근30일')! : periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partner, setPartner] = useState('')
  /** 원본 [거래처관리담당자] — 거래처 마스터의 관리담당자로 거른다(전표에는 없고 거래처에 붙는 값이다). */
  const pmgr = usePartnerManagers()
  const [pmgrCond, setPmgrCond] = useState('')
  /* 매출 쪽 원본 [기타] 아래 [세무신고거래처] — 거래처 마스터의 [세무신고거래처](taxReport)가 켜진 거래처의 전표만 본다. */
  const [taxOnly, setTaxOnly] = useState(false)
  const [taxReportOf, setTaxReportOf] = useState<Map<number, boolean>>(new Map())
  useEffect(() => {
    if (!sales) return
    api.get<{ id: number; taxReport?: boolean }[]>('/partners')
      .then((r) => setTaxReportOf(new Map(r.data.map((p) => [p.id, p.taxReport !== false]))))
      .catch(() => setTaxReportOf(new Map()))
  }, [sales])
  const [rows, setRows] = useState<Journal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<Journal | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.get<{ rows: Journal[] }>('/journals', { params: { from, to, all: true } })
      setRows(r.data.rows.filter((j) => SOURCES[kind].has(j.sourceType)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, kind])

  const sumOf = (j: Journal) => {
    let supply = 0, vat = 0
    for (const l of j.lines) {
      if (sales) {
        /* 매출: 부가세예수금(255)의 대변−차변이 부가세, 자산(1xx — 외상매출금 · 현금)이 아닌 나머지 대변−차변이 공급가액. */
        const v = Number(l.credit) - Number(l.debit)
        if (l.accountCode === VAT_RECEIVED) vat += v
        else if (v !== 0 && !/^1/.test(l.accountCode)) supply += v
        continue
      }
      const v = Number(l.debit) - Number(l.credit)
      if (l.accountCode === VAT_PAID) vat += v
      else if (v !== 0 && Number(l.debit) + Number(l.credit) > 0 && !/^25[0-9]$/.test(l.accountCode)) supply += v
    }
    return { supply, vat, total: supply + vat }
  }
  const shown = useMemo(() => rows
    .filter((j) => !docNo || j.docNo.includes(docNo))
    .filter((j) => !partner || (j.partnerName ?? '') === partner)
    .filter((j) => !pmgrCond || pmgr.managerOfName(j.partnerName) === pmgrCond)
    .filter((j) => !taxOnly || (j.partnerId != null && taxReportOf.get(j.partnerId) !== false))
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows, docNo, partner, pmgrCond, pmgr.options, taxOnly, taxReportOf])
  const months = useMemo(() => {
    const m = new Map<string, Journal[]>()
    shown.forEach((j) => { const k = j.entryDate.slice(0, 7); m.set(k, [...(m.get(k) ?? []), j]) })
    return [...m.entries()]
  }, [shown])
  const total = shown.reduce((a, j) => { const s = sumOf(j); return { supply: a.supply + s.supply, vat: a.vat + s.vat, total: a.total + s.total } }, { supply: 0, vat: 0, total: 0 })

  return (
    <EcListShell
      title={list ? '매출(세금)계산서조회(재고)' : sales ? '매출(세금)계산서현황(재고)' : '매입(세금)계산서현황(재고)'}
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
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={list ? SALES_TAX_LIST_PICKS : sales ? SALES_TAX_STOCK_PICKS : AS_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={[...new Set(rows.map((j) => j.partnerName).filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} emptyLabel="전체" value={pmgrCond} onChange={setPmgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {sales && !list && (
          <EcCond label="기타">
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
              <input type="checkbox" checked={taxOnly} onChange={(e) => setTaxOnly(e.target.checked)} /> 세무신고거래처
            </label>
          </EcCond>
        )}
      </ul>

      {!list && <h3 style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 6px' }}>{sales ? '매출청구서현황' : '매입청구서현황'} <span style={{ fontWeight: 400, color: '#8a929c' }}>{dateText(from)} ~ {dateText(to)}</span></h3>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>{list ? '일자 - 번호' : '일자-No.'}</th>
            <th>거래처명</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>{list ? '부가세' : sales ? '매출부가세' : '매입부가세'}</th>
            <th style={{ textAlign: 'right' }}>{list ? '합 계' : sales ? '매출합계' : '매입합계'}</th>
            <th style={{ textAlign: 'center' }}>내역보기</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : list ? [...shown].reverse().map((j) => {
            /* 조회(목록)는 최근 것이 위다 — 원본 2026/10/28 · 10/02 · 09/28 차례(실측). */
            const s = sumOf(j)
            return (
              <tr key={j.id}>
                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(j.entryDate)} {j.docNo}</td>
                <td>{j.partnerName ?? ''}</td>
                <td style={{ textAlign: 'right' }}>{won(s.supply)}</td>
                <td style={{ textAlign: 'right' }}>{won(s.vat)}</td>
                <td style={{ textAlign: 'right' }}>{won(s.total)}</td>
                <td style={{ textAlign: 'center' }}>
                  <button type="button" className="no-ec" onClick={() => setDetail(j)}
                          style={{ border: 'none', background: 'none', color: 'var(--ec-blue)', cursor: 'pointer', fontSize: 12 }}>내역보기</button>
                </td>
              </tr>
            )
          }) : months.flatMap(([m, js]) => {
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
              <tr key={`m${m}`} style={SUB_ROW}>
                <td colSpan={2} style={{ textAlign: 'center' }}>{m.replace('-', '/')} 계</td>
                <td style={{ textAlign: 'right' }}>{won(sub.supply)}</td>
                <td style={{ textAlign: 'right' }}>{won(sub.vat)}</td>
                <td style={{ textAlign: 'right' }}>{won(sub.total)}</td>
                <td></td>
              </tr>,
            ]
          })}
        </tbody>
        {shown.length > 0 && !list && (
          <tfoot>
            <tr style={SUB_ROW}>
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
