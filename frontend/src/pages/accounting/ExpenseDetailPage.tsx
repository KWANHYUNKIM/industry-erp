import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

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

export default function ExpenseDetailPage() {
  const [rows, setRows] = useState<Expense[]>([])
  const [keyword, setKeyword] = useState('')
  const [accountFilter, setAccountFilter] = useState('전체')
  /*
   * 원본 비용내역현황의 조건 차례는 <b>비용그룹 · 비용 · 사원 · 거래처 · 프로젝트 …</b>
   * 다(사본 실측). [거래처]가 없었는데 <b>거래처명은 이미 목록에 찍히고 있었다</b> —
   * 어느 거래처에 쓴 비용인지 보이면서도 그것으로 모아 볼 수는 없었다.
   */
  const [groupCond, setGroupCond] = useState('전체')
  const [empCond, setEmpCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
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
  const shown = rows
    .filter((r) => accountFilter === '전체' || r.accountName === accountFilter)
    .filter((r) => !keyword || r.accountName.includes(keyword) || (r.content ?? '').includes(keyword) || (r.department ?? '').includes(keyword))
    .filter((r) => groupCond === '전체' || r.accountGroupName === groupCond)
    .filter((r) => !empCond || (r.createdBy ?? '').includes(empCond))
    .filter((r) => !partnerCond || (r.partnerName ?? '').includes(partnerCond))
    .filter((r) => !projectCond || (r.projectName ?? '').includes(projectCond))
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
        <span style={{ fontSize: 12.5, color: '#3a4453' }}>프로젝트</span>
        <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                         value={projectCond} onChange={setProjectCond} items={partnerPick.projects} />
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b> 원
        </span>
      </div>
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
    </EcListShell>
  )
}
