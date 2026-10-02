import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SETTLE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useAuth } from '../../features/auth/AuthContext'
import type { JournalEntry } from '../../types/api'

const won = (n: number) => (n === 0 ? '' : Math.round(n).toLocaleString('ko-KR'))
/** 원본 [YYYY/MM 계] · [합계] 줄(2026-10-03 실측): 바탕 rgb(243,243,243) · 굵게. */
const SUB_ROW: React.CSSProperties = { fontWeight: 700, background: 'rgb(243, 243, 243)' }
const slash = (d: string) => d.replace(/-/g, '/')

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }
interface AccountOpt { id: number; code: string; name: string }
interface Row { key: string; date: string; no: string; text: string; partner: string; d: number; c: number }
type Mode = '건별' | '적요별'

/**
 * 원본의 적요는 <b>적요코드</b>(적요등록 마스터)다. 코드 없이 손으로 쓴 적요는 원본에서 <b>00(기 타)</b> 한 묶음에 든다
 * (2026-10-03 실측 — 외상매출금 9월 서른 줄이 전부 00(기 타)였다). 우리 회계전표는 적요를 글자로만 들고 적요코드 마스터가 없으니
 * 모든 줄이 원본의 00(기 타)와 같은 자리다.
 */
const ETC_CODE = '00'
const ETC_NAME = '기 타'

/**
 * 회계 I &gt; 출력물 &gt; 장부 &gt; <b>계정별적요별원장</b>(E010856) — 2026-10-03 loginaa 실측(자료가 든 판, 계정 외상매출금).
 *
 * <p>조건: 구분(<b>건별</b> | 적요별) · 기준일자(구간, 기본 2026/09/01 ~ 09/30 = <b>전월</b>, 빠른선택 금일 … 전월 · 이번기수 · 직전기수 · 종료일) ·
 * 부서 · 프로젝트 · 계정(반드시 고른다) · 적요. 아래 적용양식 · 양식구분(결재방표시) · 정렬/소계기준 · 데이터 보기형식.
 *
 * <p>건별은 적요코드마다 표 하나 — 머리 "회사명 : … / 계정명 / 적요코드(적요명)" 와 기간, 열 일자-No. · 적요 · 거래처명 · 차변금액 · 대변금액
 * (<b>잔액 열이 없다</b>), 달마다 [YYYY/MM 계](세 칸 묶음), 끝 [합계]. 적요별은 한 표 — 적요 · 차변 · 대변, 줄은 [적요코드], 끝 [합계].
 * 부서 · 프로젝트는 회계전표가 들지 않는다. [적요] 조건은 원본이 적요코드를 고르는 칸이라 우리는 적요 글자로 거른다.
 */
export default function AccountRemarkLedgerPage() {
  const { companyName } = useAuth()
  const init = periodOf('전월')!
  const [mode, setMode] = useState<Mode>('건별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [account, setAccount] = useState('')
  const [remark, setRemark] = useState('')
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])

  async function load() {
    if (!account) { setError('계정을 선택하세요.'); return }
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
  useEffect(() => { if (account) void load() }, [account, from, to])

  const rows = useMemo(() => {
    if (!entries) return [] as Row[]
    const out: Row[] = []
    const sorted = [...entries].sort((a, b) => (a.entryDate < b.entryDate ? -1 : a.entryDate > b.entryDate ? 1 : a.docNo.localeCompare(b.docNo)))
    for (const e of sorted) {
      for (const l of [...e.lines].sort((a, b) => a.lineNo - b.lineNo)) {
        if (String(l.accountId) !== account) continue
        const text = l.description ?? e.description ?? ''
        if (remark && !text.includes(remark)) continue
        out.push({ key: `${e.id}-${l.id}`, date: e.entryDate, no: e.docNo, text, partner: e.partnerName ?? '', d: Number(l.debit), c: Number(l.credit) })
      }
    }
    return out
  }, [entries, account, remark])
  const sumOf = (rs: Row[]) => rs.reduce((s, r) => ({ d: s.d + r.d, c: s.c + r.c }), { d: 0, c: 0 })
  const total = sumOf(rows)
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))]
  const accountName = accounts.find((a) => String(a.id) === account)?.name ?? ''

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '계정별적요별원장', [rows.length, mode])

  const head = (extra: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, margin: '0 0 4px' }}>
      <span>회사명 : {companyName ?? ''} / {accountName}{extra}</span>
      <span>{slash(from)} ~ {slash(to)}</span>
    </div>
  )

  return (
    <EcListShell
      title="계정별적요별원장"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setMode('건별'); setFrom(init.from); setTo(init.to); setAccount(''); setRemark(''); setEntries(null) } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="구분">
          {(['건별', '적요별'] as const).map((v) => (
            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 10, fontSize: 12.5 }}>
              <input type="radio" name="arl-mode" checked={mode === v} onChange={() => setMode(v)} /> {v}
            </label>
          ))}
        </EcCond>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={SETTLE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel width={220} emptyLabel="선택" value={account} onChange={setAccount}
                           items={accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: 220 }} />
        </EcCond>
      </ul>

      {truncated && <p style={{ fontSize: 12, color: '#c07a00', marginBottom: 6 }}>전표가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
      ) : !entries ? (
        <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>계정을 선택하고 검색하세요.</p>
      ) : (
        <>
          <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '6px 0 12px' }}>계정별적요별원장</h3>
          {mode === '적요별' ? (
            <>
              {head('')}
              <table ref={tableRef} className="w-full text-left">
                <thead>
                  <tr>
                    <th>적요</th>
                    <th style={{ textAlign: 'right' }}>차변</th>
                    <th style={{ textAlign: 'right' }}>대변</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
                  ) : (
                    <tr>
                      <td>[{ETC_CODE}]</td>
                      <td style={{ textAlign: 'right' }}>{won(total.d)}</td>
                      <td style={{ textAlign: 'right' }}>{won(total.c)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={SUB_ROW}>
                    <td style={{ textAlign: 'center' }}>합계</td>
                    <td style={{ textAlign: 'right' }}>{won(total.d)}</td>
                    <td style={{ textAlign: 'right' }}>{won(total.c)}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          ) : rows.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</p>
          ) : (
            <>
              {head(` / ${ETC_CODE}(${ETC_NAME})`)}
              <table ref={tableRef} className="w-full text-left">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>일자-No.</th>
                    <th>적요</th>
                    <th>거래처명</th>
                    <th style={{ textAlign: 'right' }}>차변금액</th>
                    <th style={{ textAlign: 'right' }}>대변금액</th>
                  </tr>
                </thead>
                <tbody>
                  {months.flatMap((mo) => {
                    const ms = rows.filter((r) => r.date.slice(0, 7) === mo)
                    const s = sumOf(ms)
                    return [
                      ...ms.map((r) => (
                        <tr key={r.key}>
                          <td style={{ textAlign: 'center', color: 'var(--ec-blue)' }}>{slash(r.date)} -{r.no}</td>
                          <td>{r.text}</td>
                          <td>{r.partner}</td>
                          <td style={{ textAlign: 'right' }}>{won(r.d)}</td>
                          <td style={{ textAlign: 'right' }}>{won(r.c)}</td>
                        </tr>
                      )),
                      <tr key={`m${mo}`} style={SUB_ROW}>
                        <td colSpan={3} style={{ textAlign: 'center' }}>{slash(mo)} 계</td>
                        <td style={{ textAlign: 'right' }}>{won(s.d)}</td>
                        <td style={{ textAlign: 'right' }}>{won(s.c)}</td>
                      </tr>,
                    ]
                  })}
                  <tr style={SUB_ROW}>
                    <td colSpan={3} style={{ textAlign: 'center' }}>합계</td>
                    <td style={{ textAlign: 'right' }}>{won(total.d)}</td>
                    <td style={{ textAlign: 'right' }}>{won(total.c)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: 12, marginTop: 4 }}>[P.1]</div>
            </>
          )}
        </>
      )}
    </EcListShell>
  )
}
