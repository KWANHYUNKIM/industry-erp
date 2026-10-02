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
interface PartnerOpt { id: number; code: string; name: string; manager: string | null }
type Unit = '건별' | '일별' | '월별' | '거래처별집계'
const UNITS: Unit[] = ['건별', '일별', '월별', '거래처별집계']
interface Row { key: string; date: string; no: string; text: string; d: number; c: number }
/** 거래처 하나의 내역 — 거래처 없는 전표는 key 0 으로 맨 앞에 모인다(원본도 머리에 거래처 없는 표가 먼저 나온다). */
interface Block { key: number; code: string; name: string; rows: Row[] }

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>거래처거래내역조회</b>(E010829) — 2026-10-03 loginaa 실측(자료가 든 판, 최근30일).
 *
 * <p>조건: 구분(<b>내역</b> | 집계) — 내역이면 그 옆에 <b>건별</b> · 일별 · 월별 · 거래처별집계 — · 기준일자(구간, 기본 <b>최근30일</b>,
 * 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일 · 최근30일) · 회계전표No. · 거래처 · 부서 · 프로젝트 · 거래처관리담당자 ·
 * 적용양식 · 기타([결재방표시]) · 데이터 보기형식.
 *
 * <p>내역은 거래처마다 표 하나 — 머리 "회사명 : … / 거래처코드(거래처명)"(거래처 없는 전표는 회사명만) 와 기간, 열 일자-No. · 적요 · 차변금액 ·
 * 대변금액, 달마다 [YYYY/MM 계], 끝 [합계](앞 두 칸 묶음), 꼬리 [P.n]. 원본은 분개 줄마다 거래처를 들어 한 표의 차 · 대가 다르다 —
 * 우리 분개 줄은 거래처가 없고 전표가 든다. 그래서 거래처가 걸린 전표의 줄을 모두 그 거래처 표에 넣는다(차 · 대가 같아진다).
 *
 * <p>[집계]는 원본의 ○집계 판(집계조건1 · 2 · 집계대상 · 비교기간 · 가로보기 …)이라 아직 만들지 않았다. 거래처별집계 판은 원본을 못 쟀다 —
 * 거래처코드 · 거래처명 · 차변금액 · 대변금액으로 찍는다. 일별 · 월별은 하루 · 한 달을 한 줄로 묶는다. 부서 · 프로젝트는 회계전표에 없다.
 */
export default function PartnerTxListPage() {
  const { companyName } = useAuth()
  const init = periodOf('최근30일')!
  const [unit, setUnit] = useState<Unit>('건별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [docNo, setDocNo] = useState('')
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [partner, setPartner] = useState('')
  const [manager, setManager] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

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

  const pById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners])
  const blocks = useMemo(() => {
    const m = new Map<number, Block>()
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      const key = e.partnerId ?? 0
      const p = pById.get(key)
      if (partner && String(key) !== partner) continue
      if (manager && (p?.manager ?? '') !== manager) continue
      if (docNo && !e.docNo.includes(docNo)) continue
      if (!m.has(key)) m.set(key, { key, code: p?.code ?? '', name: p?.name ?? e.partnerName ?? '', rows: [] })
      const b = m.get(key)!
      for (const l of [...e.lines].sort((a, c) => a.lineNo - c.lineNo)) {
        b.rows.push({ key: `${e.id}-${l.id}`, date: e.entryDate, no: e.docNo, text: l.description ?? e.description ?? '', d: Number(l.debit), c: Number(l.credit) })
      }
    }
    return [...m.values()].sort((a, b) => (a.key === 0 ? -1 : b.key === 0 ? 1 : a.code.localeCompare(b.code)))
  }, [entries, pById, partner, manager, docNo])
  const managers = useMemo(() => [...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort(), [partners])
  const sumOf = (rs: Row[]) => rs.reduce((s, r) => ({ d: s.d + r.d, c: s.c + r.c }), { d: 0, c: 0 })

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '거래처거래내역조회', [blocks.length, unit])

  function blockTable(b: Block, i: number) {
    const groups: { key: string; rows: Row[] }[] = []
    for (const r of b.rows) {
      const k = unit === '건별' ? r.key : r.date.slice(0, unit === '월별' ? 7 : 10)
      const last = groups[groups.length - 1]
      if (unit !== '건별' && last && last.key === k) last.rows.push(r)
      else groups.push({ key: k, rows: [r] })
    }
    const months = [...new Set(b.rows.map((r) => r.date.slice(0, 7)))]
    const t = sumOf(b.rows)
    return (
      <div key={b.key} className="mb-[18px]">
        <div className="flex justify-between text-[12px] mt-0 mx-0 mb-[4px]">
          <span>회사명 : {companyName ?? ''}{b.key === 0 ? '' : ` / ${b.code}(${b.name})`}</span>
          <span>{slash(from)} ~ {slash(to)}</span>
        </div>
        <table ref={i === 0 ? tableRef : undefined} className="w-full text-left">
          <thead>
            <tr>
              <th>일자-No.</th>
              <th>적요</th>
              <th className="text-right">차변금액</th>
              <th className="text-right">대변금액</th>
            </tr>
          </thead>
          <tbody>
            {months.map((mo) => {
              const gs = groups.filter((g) => g.rows[0].date.slice(0, 7) === mo)
              const ms = sumOf(gs.flatMap((g) => g.rows))
              return (
                <Fragment key={mo}>
                  {gs.map((g) => {
                    const x = sumOf(g.rows)
                    const r = g.rows[0]
                    return (
                      <tr key={g.key}>
                        <td className="text-ec-blue">{unit === '건별' ? `${slash(r.date)} -${r.no}` : slash(g.key)}</td>
                        <td>{unit === '건별' ? r.text : ''}</td>
                        <td className="text-right">{won(x.d)}</td>
                        <td className="text-right">{won(x.c)}</td>
                      </tr>
                    )
                  })}
                  <tr style={SUB_ROW}>
                    <td colSpan={2} className="text-center">{slash(mo)}  계</td>
                    <td className="text-right">{won(ms.d)}</td>
                    <td className="text-right">{won(ms.c)}</td>
                  </tr>
                </Fragment>
              )
            })}
            <tr style={SUB_ROW}>
              <td colSpan={2} className="text-center">합계</td>
              <td className="text-right">{won(t.d)}</td>
              <td className="text-right">{won(t.c)}</td>
            </tr>
          </tbody>
        </table>
        <div className="text-[12px] mt-[4px]">[P.{i + 1}]</div>
      </div>
    )
  }

  const total = blocks.reduce((s, b) => { const x = sumOf(b.rows); return { d: s.d + x.d, c: s.c + x.c } }, { d: 0, c: 0 })

  return (
    <EcListShell
      title="거래처거래내역조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setUnit('건별'); setFrom(init.from); setTo(init.to); setDocNo(''); setPartner(''); setManager('') } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
            <input type="radio" name="ptx-kind" checked readOnly /> 내역
          </label>
          <label title="원본의 ○집계 판 — 아직 만들지 않았다" className="inline-flex items-center gap-[3px] mr-[16px] text-[12.5px] text-ec-hint">
            <input type="radio" name="ptx-kind" disabled /> 집계
          </label>
          {UNITS.map((v) => (
            <label key={v} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
              <input type="radio" name="ptx-unit" checked={unit === v} onChange={() => setUnit(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={NOTE_FLOW_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="회계전표No.">
          <input className="ec-input" value={docNo} onChange={(e) => setDocNo(e.target.value)} style={{ width: 180 }} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={180} emptyLabel="전체" value={manager} onChange={setManager}
                           items={managers.map((m) => ({ value: m, name: m }))} />
        </EcCond>
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      {loading ? (
        <p className="ec-empty">불러오는 중…</p>
      ) : (
        <>
          <h3 className="text-[20px] font-bold text-center mt-[6px] mx-0 mb-[12px]">거래처거래내역조회</h3>
          {unit === '거래처별집계' ? (
            <table ref={tableRef} className="w-full text-left">
              <thead>
                <tr>
                  <th>거래처코드</th>
                  <th>거래처명</th>
                  <th className="text-right">차변금액</th>
                  <th className="text-right">대변금액</th>
                </tr>
              </thead>
              <tbody>
                {blocks.length === 0 ? (
                  <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
                ) : blocks.map((b) => {
                  const x = sumOf(b.rows)
                  return (
                    <tr key={b.key}>
                      <td>{b.code}</td>
                      <td>{b.name}</td>
                      <td className="text-right">{won(x.d)}</td>
                      <td className="text-right">{won(x.c)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={SUB_ROW}>
                  <td colSpan={2} className="text-center">합계</td>
                  <td className="text-right">{won(total.d)}</td>
                  <td className="text-right">{won(total.c)}</td>
                </tr>
              </tfoot>
            </table>
          ) : blocks.length === 0 ? (
            <p className="ec-empty">등록된 데이터가 없습니다.</p>
          ) : blocks.map(blockTable)}
        </>
      )}
    </EcListShell>
  )
}
