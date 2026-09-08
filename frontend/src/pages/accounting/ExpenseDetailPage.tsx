import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 회계 > 비용내역현황.
 *
 * <p>원본 열 실측(사본 열 id DETAIL·RECORD·COST·DETAIL_U):
 *   <b>일자-No.</b> · 비용그룹명 · 비용명 · 사용자명 · 사용금액 · 사용일자 · 적요.
 *
 * <p>우리 화면에는 <b>전표번호가 없었다</b>. 비용도 전표인데 번호가 없으면 "그 비용 건" 을
 * 지목할 방법이 없어, 증빙을 붙이거나 회계반영을 되짚을 때 일자와 금액으로 더듬어야 한다.
 * 판매·구매·수금·은행거래·카드사용은 이미 다 번호가 있다(SO-·PO-·RC-·BK-·CU-).
 *
 * <p>비용그룹 마스터는 우리에게 없어 계정과목의 세부분류로 갈음한다(없으면 계정구분).
 * 없는 마스터를 지어내지 않는다.
 *
 * <p>2026-09-08 에 원본(<b>E060815</b>)의 조건 판을 재니 <b>스물</b>이다 — 사본에는 열뿐이었다.
 * 차례: 기준일자 · <b>사용일자</b> · 비용그룹 · 비용 · 사원 · 거래처 · <b>거래처그룹1</b> ·
 * (거래처그룹2 · 거래처계층그룹) · 프로젝트 · <b>비고</b> · 결제구분 · <b>적요</b> ·
 * (최초작성자 · 최종수정자 · 양식 · 적용양식 · 양식구분) · <b>정렬/소계기준</b> · 데이터 보기형식.
 * 접힌 줄 토글이 있지만 눌러도 줄이 늘지 않는다(사용자정의 칸이 없다).
 *
 * <p>실측이 바로잡은 세 가지 이름:
 * <ul>
 *   <li><b>[비고]로 걸어 두었던 칸은 사실 [적요]다.</b> 원본은 <b>비고와 적요를 따로</b> 두고,
 *       표에 찍히는 열은 <b>적요</b>다(우리 <code>content</code> 가 그것이다). 비고는 우리에게 없다.
 *   <li><b>기간 칸의 이름은 [사용일자]다.</b> 원본은 [기준일자]와 [사용일자]를 따로 두는데
 *       우리 전표에는 날짜가 하나뿐이고 그것이 표에 [사용일자]로 찍힌다 — [기준일자]라
 *       적어 놓고 사용일자를 거르고 있었다.
 *   <li><b>[결제구분]은 개인비용·회사비용 두 갈래다</b>(실측한 라디오 셋: 전체★·개인비용·회사비용).
 *       우리가 그 이름으로 걸어 둔 것은 <b>결제수단</b>(법인카드·계좌이체·현금)이라 이름이
 *       거짓이었다 — 이름을 [결제수단]으로 바로잡고, 원본의 [결제구분]은 못 만든 것으로 남긴다.
 * </ul>
 */
interface Expense {
  id: number
  docNo: string
  expenseDate: string
  accountName: string
  accountGroupName: string | null
  content: string | null
  partnerName: string | null
  amount: number
  paymentMethod: string | null
  department: string | null
  /* 서버는 프로젝트명을 이미 보내고 있었다 — 화면 형이 안 받아 조건으로 쓸 수 없었다. */
  projectName: string | null
  createdBy: string | null
}

/*
 * 원본 비용내역현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간 칸이 <b>아예 없어서</b> 비용이 쌓이면 몇 해치가 한 표에 쏟아졌다.
 */
const initP = periodOf('금월(~오늘)')!

export default function ExpenseDetailPage() {
  const [rows, setRows] = useState<Expense[]>([])
  const [keyword, setKeyword] = useState('')
  const [accountFilter, setAccountFilter] = useState('전체')
  /*
   * 원본 비용내역현황의 조건 차례는 <b>비용그룹 · 비용 · 사원 · 거래처 · 프로젝트 …</b>
   * 다(사본 실측). [거래처]가 없었는데 <b>거래처명은 이미 목록에 찍히고 있었다</b> —
   * 어느 거래처에 쓴 비용인지 보이면서도 그것으로 모아 볼 수는 없었다.
   */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  const [groupCond, setGroupCond] = useState('전체')
  const [empCond, setEmpCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  /*
   * 원본 조건 차례의 뒤 둘 — <b>[비고]</b>·<b>[결제구분]</b>. 적요는 표에 찍히고
   * 결제수단도 전표가 들고 있는데 <b>둘 다 거를 수가 없었다</b> — 카드로 쓴 것만
   * 모아 보려 해도 눈으로 골라야 했다.
   */
  const [remarkCond, setRemarkCond] = useState('')
  const [payCond, setPayCond] = useState('')
  /** 원본 [거래처그룹1]. 거래처 마스터에 붙는 값이라 전표의 거래처명으로 잇는다. */
  const [partnerGroupCond, setPartnerGroupCond] = useState('')
  const pgroup = usePartnerGroups()
  /*
   * 원본 [정렬/소계기준]. 이 표는 비용 전표 한 줄씩이라 묶을 축이 여럿이다 —
   * 무엇에 얼마를 썼는지는 묶어 봐야 보인다.
   */
  const SUBTOTALS = ['비용그룹', '비용', '사원', '거래처', '프로젝트'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('비용그룹')
  const partnerPick = useCondPickers(['partners', 'projects'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<Expense[]>('/expenses')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const accountNames = useMemo(() => Array.from(new Set(rows.map((r) => r.accountName))), [rows])
  const groupNames = useMemo(
    () => Array.from(new Set(rows.map((r) => r.accountGroupName).filter(Boolean))) as string[],
    [rows],
  )
  /**
   * 원본 [데이터 보기형식] · [그래프로 보기] — 조건 판 <b>맨 끝</b>이다(사본 실측:
   * … 비고 · 결제구분 · 적용양식 · 양식구분 · 데이터 보기형식).
   *
   * <p>비용은 <b>어디에 얼마를 썼나</b> 를 보는 표라 <b>비용계정</b>으로 묶어 금액을 그린다.
   * 전표 한 줄씩 그리면 같은 계정이 흩어져 '이 달 접대비가 얼마' 를 못 읽는다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')

  const shown = rows
    .filter((r) => (!from || r.expenseDate >= from) && (!to || r.expenseDate <= to))
    .filter((r) => accountFilter === '전체' || r.accountName === accountFilter)
    .filter((r) => !keyword || r.accountName.includes(keyword) || (r.content ?? '').includes(keyword) || (r.department ?? '').includes(keyword))
    .filter((r) => groupCond === '전체' || r.accountGroupName === groupCond)
    .filter((r) => !empCond || (r.createdBy ?? '').includes(empCond))
    .filter((r) => !partnerCond || (r.partnerName ?? '').includes(partnerCond))
    .filter((r) => !partnerGroupCond || pgroup.groupOfName(r.partnerName ?? '') === partnerGroupCond)
    .filter((r) => !projectCond || (r.projectName ?? '').includes(projectCond))
    .filter((r) => !remarkCond || (r.content ?? '').includes(remarkCond))
    .filter((r) => !payCond || (r.paymentMethod ?? '') === payCond)
  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])

  return (
    <EcListShell title="비용내역현황" search={keyword} onSearchChange={setKeyword}
      newLabel="새로고침" onNew={load} actions={[{ label: '인쇄' }, { label: 'Excel' }]}>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {/*
          원본 비용내역현황의 조건 차례는 <b>비용그룹 · 비용 · 사원 · 거래처 · 프로젝트</b> 다.
          주석에는 다섯을 적어 놓고 <b>뒤 둘만</b> 만들어 두었다 — 앞 셋도 목록에 이미
          찍히는 값이다(비용그룹명 · 비용명 · 사용자명). 우리 [계정]은 원본 이름이 <b>[비용]</b> 이다.
        */}
        {/*
          원본은 <b>[기준일자]와 [사용일자]를 따로</b> 둔다(2026-09-08 실측).
          우리 비용 전표에는 날짜가 <code>expenseDate</code> 하나뿐이고 그것이
          표에 [사용일자]로 찍히는 값이다 — 그래서 이 칸의 이름을 <b>[사용일자]</b>로
          바로잡았다. 예전에는 [기준일자]라 적어 놓고 사용일자를 걸러, 이름과 거르는
          값이 어긋나 있었다. 원본의 [기준일자]는 못 만든 것으로 남긴다.
        */}
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>사용일자</span>
        <input type="date" className="ec-input" value={from}
               onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
        <span style={{ margin: '0 2px', color: '#9aa1ab' }}>~</span>
        <input type="date" className="ec-input" value={to}
               onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
          onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>비용그룹</span>
        <select className="ec-input" value={groupCond} onChange={(e) => setGroupCond(e.target.value)} style={{ width: 150 }}>
          <option>전체</option>
          {groupNames.map((g) => <option key={g}>{g}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>비용</span>
        <select className="ec-input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ width: 160 }}>
          <option>전체</option>
          {accountNames.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>사원</span>
        <input className="ec-input" value={empCond} onChange={(e) => setEmpCond(e.target.value)}
               placeholder="사용자명 일부" style={{ width: 130 }} />
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>거래처</span>
        <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                         value={partnerCond} onChange={setPartnerCond} items={partnerPick.partners} />
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>거래처그룹1</span>
        <select className="ec-input" value={partnerGroupCond} style={{ width: 140 }}
                onChange={(e) => setPartnerGroupCond(e.target.value)}>
          <option value="">전체</option>
          {pgroup.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>프로젝트</span>
        <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                         value={projectCond} onChange={setProjectCond} items={partnerPick.projects} />
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>결제수단</span>
        <select className="ec-input" value={payCond} onChange={(e) => setPayCond(e.target.value)} style={{ width: 110 }}>
          <option value="">전체</option>
          {[...new Set(rows.map((r) => r.paymentMethod).filter(Boolean))].map((m) => <option key={m as string}>{m}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>적요</span>
        <input className="ec-input" value={remarkCond} placeholder="적요"
               onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 130 }} />
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>정렬/소계기준</span>
        <div className="ec-pills">
          {SUBTOTALS.map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                    onClick={() => setSubtotal(v)}>{v}</button>
          ))}
        </div>
        {/* 원본 조건 차례의 맨 끝 — [정렬/소계기준] 다음이다(2026-09-08 실측). */}
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>데이터 보기형식</span>
        <div className="ec-pills">
          {(['표', '그래프'] as const).map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${view === v ? ' active' : ''}`}
                    onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b> 원
        </span>
      </div>
      {view === '그래프' ? (
        <EcBarChart unit=" 원" emptyText="조회된 비용이 없습니다."
                    rows={(() => {
                      const m = new Map<string, number>()
                      for (const r of shown) m.set(r.accountName, (m.get(r.accountName) ?? 0) + r.amount)
                      return [...m].map(([label, value]) => ({ label, value }))
                    })()} />
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center', width: 170 }}>일자-No.</th>
            <th style={{ width: 110 }}>비용그룹명</th>
            <th style={{ width: 130 }}>비용명</th>
            <th style={{ width: 90 }}>사용자명</th>
            <th style={{ width: 120, textAlign: 'right' }}>사용금액</th>
            <th style={{ width: 100 }}>사용일자</th>
            <th>적요</th>
            <th style={{ width: 110 }}>거래처</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.docNo}</td>
              <td style={{ color: '#5a626e' }}>{r.accountGroupName ?? ''}</td>
              <td>{r.accountName}</td>
              {/* 원본 [사용자명]. 우리는 전표를 넣은 계정이 그 자리다 — 부서도 같이 적는다. */}
              <td>
                {r.createdBy ?? ''}
                {r.department && <span style={{ color: '#8a929c', fontSize: 11.5 }}> · {r.department}</span>}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.amount.toLocaleString('ko-KR')}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.expenseDate.replace(/-/g, '/')}</td>
              <td>{r.content ?? ''}</td>
              <td>{r.partnerName ?? ''}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ background: '#f5f7fa', fontWeight: 700 }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{total.toLocaleString('ko-KR')}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        )}
      </table>
      )}

      {view === '표' && shown.length > 0 && (() => {
        const groups = subtotalBy(shown,
          (r) => (subtotal === '비용' ? r.accountName
            : subtotal === '사원' ? r.createdBy
              : subtotal === '거래처' ? r.partnerName
                : subtotal === '프로젝트' ? r.projectName
                  : r.accountGroupName),
          { amount: (r) => r.amount })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>건수</th>
                <th style={{ width: 160, textAlign: 'right' }}>사용금액</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
                      {g.sums.amount.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
