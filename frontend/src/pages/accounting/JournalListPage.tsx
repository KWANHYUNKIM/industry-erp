import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { JournalEntry } from '../../api/types'
import { INQUIRY_FULL_PICKS, ymd } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { dateText } from '../../utils/dateText'

const won = (n: number) => n.toLocaleString('ko-KR')
const firstOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => ymd(new Date())

const SRC_COLOR: Record<string, string> = {
  SALES: 'var(--ec-blue)', PURCHASE: '#a5561b', EXPENSE: '#7a4fb5', MANUAL: '#5a626e',
}

/** 회계전표 조회 — 판매/구매 회계반영으로 생성된 분개(차변/대변)를 전표 단위로 조회. */
export default function JournalListPage() {
  /*
   * ?entryId= 로 특정 전표를 지목해서 들어온다 — 일괄회계반영·결제내역조회의
   * [회계전표No.] 가 여기로 보낸다. 목록만 열어 주면 사람이 다시 찾아야 하고,
   * 그러면 그 열을 만든 이유가 없어진다.
   */
  const [params] = useSearchParams()
  const wanted = Number(params.get('entryId')) || null

  const [rows, setRows] = useState<JournalEntry[]>([])
  const [from, setFrom] = useState(firstOfYear())
  const [to, setTo] = useState(today())
  const [openId, setOpenId] = useState<number | null>(wanted)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  function load(range?: { from: string; to: string }) {
    setError('')
    api.get<JournalEntry[]>('/journals', { params: range ?? { from, to } })
      .then((r) => setRows(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    // 지목받은 전표는 올해 밖일 수 있다. 기본 기간으로 열면 "없는 전표" 처럼 보인다.
    if (wanted) {
      const wide = { from: '1900-01-01', to: '2099-12-31' }
      setFrom(wide.from); setTo(wide.to); load(wide)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = useMemo(() => rows.filter((r) =>
    !keyword || r.docNo.includes(keyword) || (r.description ?? '').includes(keyword) || (r.partnerName ?? '').includes(keyword)
  ), [rows, keyword])

  const total = shown.reduce((a, r) => a + r.totalDebit, 0)
  const reset = () => { setFrom(firstOfYear()); setTo(today()); setKeyword('') }

  return (
    <EcListShell
      title="회계전표조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS}
        dateLabel="기간"
      >
        <EcCond label="검색어">
          <input className="ec-input" placeholder="전표번호·적요·거래처 일부" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} style={{ width: 260 }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        총 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>행을 클릭하면 분개가 펼쳐집니다.</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>전표번호</th><th>일자</th><th>적요</th><th>거래처</th><th>출처</th>
            <th style={{ textAlign: 'right' }}>차변합</th><th style={{ textAlign: 'right' }}>대변합</th>
            <th style={{ textAlign: 'center' }}>대차</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조회된 회계전표가 없습니다. (판매/구매 화면에서 회계반영하면 생성됩니다)</td></tr>
          ) : shown.map((r, i) => (
            <Fragment key={r.id}>
              <tr onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{openId === r.id ? '▾ ' : '▸ '}{r.docNo}</td>
                <td>{dateText(r.entryDate)}</td>
                <td>{r.description}</td>
                <td>{r.partnerName ?? ''}</td>
                <td><span style={{ color: SRC_COLOR[r.sourceType], fontSize: 11.5 }}>{r.sourceTypeName}</span></td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.totalDebit)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(r.totalCredit)}</td>
                <td style={{ textAlign: 'center' }}>{r.balanced ? <span style={{ color: '#1c7c3c' }}>✓</span> : <span style={{ color: '#c60a2e' }}>✗</span>}</td>
              </tr>
              {openId === r.id && (
                <tr className="no-ec">
                  <td colSpan={9} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr><th style={{ width: 34 }}></th><th>계정코드</th><th>계정과목</th><th>적요</th><th style={{ textAlign: 'right' }}>차변</th><th style={{ textAlign: 'right' }}>대변</th></tr>
                      </thead>
                      <tbody>
                        {r.lines.map((l) => (
                          <tr key={l.id}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{l.lineNo}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.accountCode}</td>
                            <td>{l.accountName}</td>
                            <td style={{ color: '#8a929c' }}>{l.description ?? ''}</td>
                            <td style={{ textAlign: 'right', color: l.debit > 0 ? '#1a4d8f' : '#c9ced6' }}>{l.debit > 0 ? won(l.debit) : '-'}</td>
                            <td style={{ textAlign: 'right', color: l.credit > 0 ? '#a5561b' : '#c9ced6' }}>{l.credit > 0 ? won(l.credit) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right' }}>{won(total)}</td>
            <td style={{ textAlign: 'right' }}>{won(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
