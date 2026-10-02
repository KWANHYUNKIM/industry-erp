import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { NOTE_FLOW_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [YYYY/MM 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게, 앞 두 칸 묶음. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
type Unit = '일별' | '월별' | '전표별' | '거래처별'
const UNITS: Unit[] = ['일별', '월별', '전표별', '거래처별']
interface Row { key: string; label: string; kind: string; amount: number; partner: string; text: string; month: string }

/**
 * 회계 I &gt; 출력물 &gt; 기타 &gt; <b>회계거래현황</b>(E010847) — 2026-10-03 loginaa 실측(자료가 든 판, 최근30일).
 *
 * <p>조건: 구분(<b>내역</b> | 집계) — 내역이면 일별 · 월별 · <b>전표별</b> · 거래처별 — · 기준일자(구간, 기본 <b>최근30일</b>, 빠른선택 금일 … 전월 ·
 * 종료일 · 최근30일) · 회계전표No. · 거래처 · 계정 · 부서 · 프로젝트 · 거래유형 · 금액(구간) · 채권/채무(어음)No. · 적요 · 적용양식 ·
 * 양식구분([결재방표시]) · 데이터 보기형식.
 *
 * <p>인쇄 머리 제목은 화면 이름과 달리 <b>전표현황</b>이다. 전표별은 전표 한 장이 한 줄 — 전표번호 · 거래유형 · 금액 · 거래처명 · 적요, 달마다 [YYYY/MM 계], 끝 [합계](앞 두 칸 묶음).
 * 금액은 전표의 차변 합이다. 일별 · 월별 · 거래처별은 하루 · 한 달 · 거래처를 한 줄로 묶는다(원본 판은 못 쟀다).
 * [집계]는 원본의 ○집계 판이라 아직 만들지 않았다. 부서 · 프로젝트 · 채권/채무(어음)No. 는 회계전표가 들지 않는다.
 */
export default function JournalStatusPage() {
  const { companyName } = useAuth()
  const init = periodOf('최근30일')!
  const [unit, setUnit] = useState<Unit>('전표별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partner, setPartner] = useState('')
  const [account, setAccount] = useState('')
  const [kind, setKind] = useState('')
  const [amtFrom, setAmtFrom] = useState('')
  const [amtTo, setAmtTo] = useState('')
  const [remark, setRemark] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<JournalList>('/journals', { params: { from, to, all: true } })
      setEntries(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const picked = useMemo(() => entries
    .filter((e) => !docNo || e.docNo.includes(docNo))
    .filter((e) => !partner || (e.partnerName ?? '') === partner)
    .filter((e) => !account || e.lines.some((l) => l.accountName === account))
    .filter((e) => !kind || e.sourceTypeName === kind)
    .filter((e) => amtFrom === '' || Number(e.totalDebit) >= Number(amtFrom))
    .filter((e) => amtTo === '' || Number(e.totalDebit) <= Number(amtTo))
    .filter((e) => !remark || (e.description ?? '').includes(remark) || e.lines.some((l) => (l.description ?? '').includes(remark)))
    .sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo))),
  [entries, docNo, partner, account, kind, amtFrom, amtTo, remark])

  const rows = useMemo(() => {
    const textOf = (e: JournalEntry) => e.description ?? e.lines.find((l) => l.description)?.description ?? ''
    if (unit === '전표별') {
      return picked.map((e): Row => ({ key: String(e.id), label: `${slash(e.entryDate)} -${e.docNo}`, kind: e.sourceTypeName,
        amount: Number(e.totalDebit), partner: e.partnerName ?? '', text: textOf(e), month: e.entryDate.slice(0, 7) }))
    }
    const keyOf = (e: JournalEntry) => unit === '일별' ? e.entryDate : unit === '월별' ? e.entryDate.slice(0, 7) : (e.partnerName ?? '')
    const m = new Map<string, Row>()
    for (const e of picked) {
      const k = keyOf(e)
      if (!m.has(k)) m.set(k, { key: k, label: unit === '거래처별' ? k : slash(k), kind: '', amount: 0, partner: unit === '거래처별' ? k : '', text: '',
        month: unit === '거래처별' ? '' : e.entryDate.slice(0, 7) })
      m.get(k)!.amount += Number(e.totalDebit)
    }
    return [...m.values()]
  }, [picked, unit])
  const months = [...new Set(rows.map((r) => r.month))]
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const partners = useMemo(() => [...new Set(entries.map((e) => e.partnerName).filter(Boolean) as string[])].sort(), [entries])
  const accounts = useMemo(() => [...new Set(entries.flatMap((e) => e.lines.map((l) => l.accountName)))].sort(), [entries])
  const kinds = useMemo(() => [...new Set(entries.map((e) => e.sourceTypeName))].sort(), [entries])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '회계거래현황', [rows.length, unit])

  const reset = () => {
    setUnit('전표별'); setFrom(init.from); setTo(init.to); setDocNo(''); setPartner(''); setAccount(''); setKind('')
    setAmtFrom(''); setAmtTo(''); setRemark('')
  }

  return (
    <EcListShell
      title="회계거래현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
            <input type="radio" name="js-kind" checked readOnly /> 내역
          </label>
          <label title="원본의 ○집계 판 — 아직 만들지 않았다" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 16, fontSize: 12.5, color: '#9aa1ab' }}>
            <input type="radio" name="js-kind" disabled /> 집계
          </label>
          {UNITS.map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="js-unit" checked={unit === v} onChange={() => setUnit(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={partners.map((p) => ({ value: p, name: p }))} />
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={200} emptyLabel="전체" value={account} onChange={setAccount} items={accounts.map((a) => ({ value: a, name: a }))} />
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 140 }}>
            <option value="">전체</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </EcCond>
        <EcCond label="금액">
          <input className="ec-input" inputMode="decimal" value={amtFrom} onChange={(e) => setAmtFrom(e.target.value)} style={{ width: 110 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input className="ec-input" inputMode="decimal" value={amtTo} onChange={(e) => setAmtTo(e.target.value)} style={{ width: 110 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: '#c07a00', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>전표현황</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
        <span>회사명 : {companyName ?? ''}</span>
        <span>{slash(from)} ~ {slash(to)}</span>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>{unit === '거래처별' ? '거래처명' : unit === '전표별' ? '전표번호' : '일자'}</th>
            <th style={{ textAlign: 'center' }}>거래유형</th>
            <th style={{ textAlign: 'right' }}>금액</th>
            <th>거래처명</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : (
            <>
              {months.map((mo) => {
                const ms = rows.filter((r) => r.month === mo)
                return (
                  <Fragment key={mo || 'all'}>
                    {ms.map((r) => (
                      <tr key={r.key}>
                        <td style={{ textAlign: 'center', color: 'var(--ec-blue)' }}>{r.label}</td>
                        <td style={{ textAlign: 'center' }}>{r.kind}</td>
                        <td style={{ textAlign: 'right' }}>{won(r.amount)}</td>
                        <td>{unit === '거래처별' ? '' : r.partner}</td>
                        <td>{r.text}</td>
                      </tr>
                    ))}
                    {mo && (
                      <tr style={SUB_ROW}>
                        <td colSpan={2} style={{ textAlign: 'center' }}>{slash(mo)}  계</td>
                        <td style={{ textAlign: 'right' }}>{won(ms.reduce((s, r) => s + r.amount, 0))}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              <tr style={SUB_ROW}>
                <td colSpan={2} style={{ textAlign: 'center' }}>합계</td>
                <td style={{ textAlign: 'right' }}>{won(total)}</td>
                <td></td>
                <td></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </EcListShell>
  )
}
