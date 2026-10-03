import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import type { CommonCode, Project } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const today = () => ymd(new Date())
// 결제수단은 공통코드(PAYMENT_METHOD)에서 가져온다. 화면에 하드코딩하면 항목 하나 늘릴 때마다 배포해야 한다.

interface Account { id: number; code: string; name: string; division: string }
interface Expense {
  id: number
  expenseDate: string
  accountId: number
  accountName: string
  content: string | null
  partnerName: string | null
  amount: number
  paymentMethod: string | null
  department: string | null
  createdBy: string | null
}

/** 회계 > 비용관리 — 판매관리비 지출 내역 (실제 연동, 계정과목 FK) */
export default function ExpensePage() {
  const [rows, setRows] = useState<Expense[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [keyword, setKeyword] = useState('')
  const [accountFilter, setAccountFilter] = useState('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    expenseDate: today(), accountId: '', content: '', partnerName: '', amount: '', vatAmount: '', paymentMethod: '법인카드', department: '', projectId: '',
  })
  const [projects, setProjects] = useState<Project[]>([])
  const [payments, setPayments] = useState<CommonCode[]>([])

  async function load() {
    setLoading(true)
    try {
      api.get<Project[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
      api.get<CommonCode[]>('/codes/PAYMENT_METHOD').then((r) => setPayments(r.data)).catch(() => {})
      const [e, a] = await Promise.all([
        api.get<Expense[]>('/expenses'),
        api.get<Account[]>('/accounts'),
      ])
      setRows(e.data)
      // 비용 계정만(구분 EXPENSE) 노출하되, 없으면 전체 허용
      const expenseAccounts = a.data.filter((x) => x.division === 'EXPENSE')
      setAccounts(expenseAccounts.length > 0 ? expenseAccounts : a.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError(''); setOk('')
    if (!form.accountId) return setError('계정과목을 선택하세요.')
    if (!form.amount || Number(form.amount) <= 0) return setError('금액을 입력하세요.')
    try {
      const res = await api.post<{ docNo: string; accountName: string; amount: number; vatAmount: number; totalAmount: number }>('/expenses', {
        accountId: Number(form.accountId),
        expenseDate: form.expenseDate,
        content: form.content || undefined,
        partnerName: form.partnerName || undefined,
        amount: Number(form.amount),
        vatAmount: form.vatAmount ? Number(form.vatAmount) : 0,
        paymentMethod: form.paymentMethod || undefined,
        department: form.department || undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
      })
      /*
       * 저장하고 창만 닫혀 어느 번호로 들어갔는지·장부에 갔는지 안 보였다(39회차, 9회차 판매입력과 같은 꼴).
       * 지출은 이제 저장과 함께 회계전표가 생긴다 — 대변이 어디로 갔는지까지 적는다.
       */
      const pm = form.paymentMethod ?? ''
      const credit = /카드|외상|미지급/.test(pm) ? '미지급금' : /계좌|이체|예금|통장/.test(pm) ? '보통예금' : '현금'
      const vat = Number(res.data.vatAmount ?? 0)
      setOk(`${res.data.docNo} 저장 · [${res.data.accountName}] ${Number(res.data.amount).toLocaleString()}원`
        + (vat ? ` + 부가세 ${vat.toLocaleString()}원(부가세대급금) = ${Number(res.data.totalAmount).toLocaleString()}원` : '')
        + ` — 회계전표 생성(대변 ${credit})`)
      setForm((f) => ({ ...f, content: '', partnerName: '', amount: '', vatAmount: '', department: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(e: Expense) {
    if (!window.confirm(`[${e.accountName}] ${e.amount.toLocaleString()}원 지출을 삭제할까요?`)) return
    try {
      await api.delete(`/expenses/${e.id}`)
      setOk(`[${e.accountName}] ${e.amount.toLocaleString()}원 지출과 그 회계전표를 삭제했습니다.`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const accountNames = useMemo(() => Array.from(new Set(rows.map((r) => r.accountName))), [rows])
  const shown = rows
    .filter((r) => accountFilter === '전체' || r.accountName === accountFilter)
    .filter((r) => !keyword || (r.content ?? '').includes(keyword) || (r.partnerName ?? '').includes(keyword))
  /*
   * 두 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. 정렬은 <b>표에만</b> 건다 —
   * 아래 합계는 <code>shown</code> 을 그대로 더하므로 차례와 무관하다.
   */
  const sort = useTableSort(shown, {
    지출일: (r) => r.expenseDate,
    계정과목: (r) => r.accountName,
  })

  const total = useMemo(() => shown.reduce((s, r) => s + r.amount, 0), [shown])

  return (
    <EcListShell
      title="비용관리 (판매관리비)"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '지출등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p style={{ marginBottom: 8, background: '#eaf6ee', color: 'var(--ec-success)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{ok}</p>}

      <Modal error={error} open={showForm} title="비용관리 (판매관리비) 등록" onClose={() => setShowForm(false)}>{(
        <div className="border border-ec-line border-solid bg-white p-[14px] mb-[10px]">
          <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">지출 등록</div>
          <div className="flex gap-[12px] flex-wrap items-end">
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">지출일</div>
              <input className="ec-input" type="date" value={form.expenseDate} onChange={(e) => set('expenseDate', e.target.value)} style={{ width: 140 }} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">계정과목 *</div>
              <select className="ec-input" value={form.accountId} onChange={(e) => set('accountId', e.target.value)} style={{ width: 180 }}>
                <option value="">선택하세요</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
              </select></label>
            <label className="text-[12.5px] flex-1 min-w-[180px]"><div className="text-ec-label mb-[3px]">적요</div>
              <input className="ec-input" value={form.content} onChange={(e) => set('content', e.target.value)} style={{ width: '100%' }} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">거래처</div>
              <input className="ec-input" value={form.partnerName} onChange={(e) => set('partnerName', e.target.value)} style={{ width: 130 }} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">금액 *</div>
              <input className="ec-input text-right" type="number" step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ width: 120 }} /></label>
            {/*
              부가세(매입세액). 세금계산서를 받은 비용이면 넣는다 — 분개에서 부가세대급금으로 갈라 공제받는다.
              칸이 없어 공급가 100,000 + 부가세 10,000 을 110,000 전부 비용으로 넣어야 했다(46회차).
            */}
            <div className="text-[12.5px]"><div className="text-ec-label mb-[3px]">부가세</div>
              <input className="ec-input text-right" type="number" step="any" value={form.vatAmount} onChange={(e) => set('vatAmount', e.target.value)} style={{ width: 100 }} />
              <button type="button" className="ec-btn" style={{ marginLeft: 3 }} title="금액의 10%"
                      onClick={() => set('vatAmount', form.amount ? String(Math.round(Number(form.amount) * 0.1)) : '')}>10%</button></div>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">결제수단</div>
              <select className="ec-input" value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} style={{ width: 100 }}>
                {payments.map((p) => <option key={p.id}>{p.name}</option>)}
              </select></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">부서</div>
              <input className="ec-input" value={form.department} onChange={(e) => set('department', e.target.value)} style={{ width: 100 }} /></label>
            {/* 긴 드롭다운이었다 — 코드도움으로(QA 21회차). label 로 감싸면 팝업 행 클릭이 안 먹어 div 로. */}
            <div className="flex items-center gap-[4px] text-[12.5px]">프로젝트
              <CodePickerField label="프로젝트" hideLabel width={160} placeholder="프로젝트" emptyLabel="선택 안 함"
                               value={form.projectId} onChange={(v) => set('projectId', v)}
                               items={projects.map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))} /></div>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
        </div>
      )}</Modal>

      <div className="flex items-center gap-[8px] mb-[8px]">
        <span className="text-[12.5px] text-ec-text">계정</span>
        <select className="ec-input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ width: 160 }}>
          <option>전체</option>
          {accountNames.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span className="ml-auto text-[12.5px] text-ec-label">
          합계 <b className="text-ec-navy text-[14px]">{total.toLocaleString()}</b> 원
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[100px] cursor-pointer" onClick={() => sort.toggle('지출일')}>지출일 {sort.mark('지출일')}</th>
            <th className="w-[120px] cursor-pointer" onClick={() => sort.toggle('계정과목')}>계정과목 {sort.mark('계정과목')}</th>
            <th>적요</th>
            <th className="w-[120px]">거래처</th>
            <th className="w-[110px] text-right">금액</th>
            <th className="w-[90px] text-center">결제수단</th>
            <th className="w-[80px]">부서</th>
            <th className="w-[50px] text-center"></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td>{dateText(r.expenseDate)}</td>
              <td>{r.accountName}</td>
              <td>{r.content ?? ''}</td>
              <td>{r.partnerName ?? ''}</td>
              <td className="text-right font-semibold">{r.amount.toLocaleString()}</td>
              <td className="text-center">{r.paymentMethod ?? ''}</td>
              <td>{r.department ?? ''}</td>
              <td className="text-center">
                <button className="no-ec" onClick={() => remove(r)} title="삭제" style={{ border: 'none', background: 'none', color: 'var(--ec-danger)', cursor: 'pointer', fontSize: 13 }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr className="bg-ec-page font-bold">
              <td colSpan={5} className="text-right">합계</td>
              <td className="text-right text-ec-navy">{total.toLocaleString()}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
