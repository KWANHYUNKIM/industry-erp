import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { JournalEntry } from '../../types/api'

interface JournalListResponse {
  rows: JournalEntry[]
  /** 조건에 걸린 전체 전표 수. 잘렸을 때 "몇 장 중 몇 장" 을 말하려고 받는다. */
  totalRows: number
  /** 잘라서 온 것인가. 이때만 [오천건이상조회] 를 띄운다. */
  truncated: boolean
}
import { INQUIRY_FULL_PICKS, ymd } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'

const won = (n: number) => n.toLocaleString('ko-KR')
const firstOfYear = () => `${new Date().getFullYear()}-01-01`
const today = () => ymd(new Date())

/** 원본 [전표번호] 모양 — GL-20261012-0002 → 26/10/12-2 (회계거래조회 실측). */
function slipNo(docNo: string) {
  const m = /^[A-Z]+-(\d{2})(\d{2})(\d{2})(\d{2})-0*(\d+)$/.exec(docNo)
  return m ? `${m[2]}/${m[3]}/${m[4]}-${m[5]}` : docNo
}

/** 원본 [거래유형] 이름 — 판매 회계반영은 '매출전표 I', 구매는 '매입전표 I', 직접 입력은 '일반전표'. */
const TYPE_NAME: Record<string, string> = { SALES: '매출전표 I', PURCHASE: '매입전표 I', MANUAL: '일반전표' }

/** 회계전표 조회 — 판매/구매 회계반영으로 생성된 분개(차변/대변)를 전표 단위로 조회. */
export default function JournalListPage() {
  const navigate = useNavigate()
  /*
   * ?entryId= 로 특정 전표를 지목해서 들어온다 — 일괄회계반영·결제내역조회의
   * [회계전표No.] 가 여기로 보낸다. 목록만 열어 주면 사람이 다시 찾아야 하고,
   * 그러면 그 열을 만든 이유가 없어진다.
   */
  const [params] = useSearchParams()
  const wanted = Number(params.get('entryId')) || null

  const [rows, setRows] = useState<JournalEntry[]>([])
  /** 간편전표 분개 → 그 결의서 종류(지출결의서 · 입금보고서 · 가지급금정산서). 원본 [거래유형]이 그 이름이다. */
  const [voucherType, setVoucherType] = useState<Record<number, string>>({})
  const typeLabel = (r: JournalEntry) => voucherType[r.id] ?? TYPE_NAME[r.sourceType] ?? r.sourceTypeName
  /* 원본 줄 색: 매출전표 분홍 · 매입전표 연두(td.danger · td.success). */
  const rowBg = (r: JournalEntry) => r.sourceType === 'SALES' ? 'bg-[var(--ec-bg-sales-row)]'
    : r.sourceType === 'PURCHASE' ? 'bg-[var(--ec-bg-basic)]' : ''
  const [from, setFrom] = useState(firstOfYear())
  const [to, setTo] = useState(today())
  const [openId, setOpenId] = useState<number | null>(wanted)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  /** 조건에 걸린 전체 전표 수와, 잘라서 받았는지. 원본 [오천건이상조회] 자리를 위한 값이다. */
  const [totalRows, setTotalRows] = useState(0)
  const [truncated, setTruncated] = useState(false)

  /*
   * <b>넓게 물으면 앞 5천 장만 받는다.</b> 이 화면은 연초부터를 기본으로 열어서, 재 보니
   * 2만 9천 줄·16MB 를 받고 있었다(1.1초). 원본도 큰 결과를 그냥 주지 않는다 —
   * 조회 화면 139곳에 [오천건이상조회] 버튼을 두고 그 위로는 눌러야 가게 한다(사본 실측).
   * 재고수불부와 같은 방식이고, 자른 것은 숨기지 않는다.
   *
   * <p><b>검색창도 잘린 안에서만 찾는다.</b> 이 화면의 검색은 받아 온 줄에서 거르는 것이라,
   * 잘렸으면 그 밖의 전표는 쳐도 안 나온다. 그래서 안내 문구에 합계뿐 아니라 검색도
   * 함께 적는다 — 못 찾은 것을 '없다' 로 읽으면 안 된다.
   */
  function load(range?: { from: string; to: string }, all = false) {
    setError('')
    const params: Record<string, string | boolean> = { ...(range ?? { from, to }) }
    if (all) params.all = true
    api.get<JournalListResponse>('/journals', { params })
      .then((r) => { setRows(r.data.rows); setTotalRows(r.data.totalRows); setTruncated(r.data.truncated) })
      .catch((err) => { setError(extractErrorMessage(err)); setRows([]); setTotalRows(0); setTruncated(false) })
    api.get<{ rows: { journalEntryId: number | null; typeName: string }[] }>('/vouchers', { params: { ...(range ?? { from, to }), all: true } })
      .then((r) => setVoucherType(Object.fromEntries(r.data.rows.filter((v) => v.journalEntryId).map((v) => [v.journalEntryId!, v.typeName]))))
      .catch(() => setVoucherType({}))
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
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="회계전표조회"
      searchable={false}
      actions={[
        /* 인자 없이 부른다 — onClick 이 무엇을 넘기든 range 로 새면 안 된다. */
        { label: '검색(F8)', primary: true, onClick: () => load() },
        /* 잘려서 왔을 때만 누를 수 있다 — 안 잘렸으면 더 가져올 것이 없다. */
        { label: '오천건이상조회', onClick: () => load(undefined, true), disabled: !truncated },
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

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        총 <b className="text-ec-text">{shown.length}</b>건
        <span className="ml-[8px] text-ec-hint">행을 클릭하면 분개가 펼쳐집니다.</span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {/*
        잘라서 받았으면 <b>반드시 말한다.</b> 이 화면은 아래에 차변·대변 합계를 찍는데,
        그 합계는 <b>지금 보고 있는 줄</b>을 더한 값이다. 잘린 줄 알려 주지 않으면
        사람은 그 숫자를 기간 전체의 합으로 읽는다 — 틀린 숫자를 맞다고 믿게 된다.
      */}
      {truncated && (
        <p style={{ background: 'var(--ec-warn-bg)', color: '#7a5b00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>
          모두 {totalRows.toLocaleString('ko-KR')}장 중 앞 {rows.length.toLocaleString('ko-KR')}장만 보고 있습니다 —
          아래 합계도, 위 검색창도 이 {rows.length.toLocaleString('ko-KR')}장 안에서만 셉니다.
          기간을 좁히거나, 그대로 다 보려면 [오천건이상조회]를 누르세요.
        </p>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            {/* 원본 회계거래조회 격자(2026-10-12 실측): 전표번호 · 거래유형 · 금액 · 거래처명 · 적요. 일자는 전표번호(26/10/12-2)가 든다. */}
            <th>전표번호</th><th>거래유형</th>
            <th className="text-right">금액</th><th>거래처명</th><th>적요</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={6} className="text-center text-ec-hint p-[20px]">조회된 회계전표가 없습니다. (판매/구매 화면에서 회계반영하면 생성됩니다)</td></tr>
          ) : shown.map((r, i) => (
            <Fragment key={r.id}>
              <tr onClick={() => setOpenId(openId === r.id ? null : r.id)} className={`cursor-pointer ${rowBg(r)}`}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  {/* 원본: 전표번호를 누르면 그 전표의 입력 화면(지출결의서 · 입금보고서 …)이 열린다. 우리는 결의서만 열고 나머지는 분개를 펼친다. */}
                  <a className="text-ec-navy cursor-pointer" title={r.docNo}
                     onClick={(e) => { if (voucherType[r.id]) { e.stopPropagation(); navigate(`/accounting/vouchers?journal=${r.id}`) } }}>
                    {slipNo(r.docNo)}
                  </a>
                </td>
                <td>{typeLabel(r)}</td>
                <td className="text-right">{won(r.totalDebit)}</td>
                <td>{r.partnerName ?? ''}</td>
                <td>{r.description}</td>
              </tr>
              {openId === r.id && (
                <tr className="no-ec">
                  <td colSpan={6} className="p-0 bg-ec-page">
                    <table className="w-full text-left my-[4px] mx-0">
                      <thead>
                        <tr><th className="w-[34px]"></th><th>계정코드</th><th>계정과목</th><th>적요</th><th className="text-right">차변</th><th className="text-right">대변</th></tr>
                      </thead>
                      <tbody>
                        {r.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="text-center text-ec-hint">{l.lineNo}</td>
                            <td>{l.accountCode}</td>
                            <td>{l.accountName}</td>
                            <td className="text-ec-hint">{l.description ?? ''}</td>
                            <td style={{ textAlign: 'right', color: l.debit > 0 ? '#1a4d8f' : 'var(--ec-text-off)' }}>{l.debit > 0 ? won(l.debit) : ''}</td>
                            <td style={{ textAlign: 'right', color: l.credit > 0 ? '#a5561b' : 'var(--ec-text-off)' }}>{l.credit > 0 ? won(l.credit) : ''}</td>
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
          <tr className="font-bold bg-ec-page">
            <td colSpan={3} className="text-right">합계 ({shown.length}건)</td>
            <td className="text-right">{won(total)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
