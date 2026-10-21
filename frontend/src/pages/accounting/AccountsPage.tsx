import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableSort } from '../../utils/useTableSort'
import { ecAlert } from '../../components/EcDialog'

type Division = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
const DIV_LABEL: Record<Division, string> = { ASSET: '자산', LIABILITY: '부채', EQUITY: '자본', REVENUE: '수익', EXPENSE: '비용' }
const DIV_COLOR: Record<Division, string> = { ASSET: '#1c6fb0', LIABILITY: 'var(--ec-warn)', EQUITY: '#7a5cc0', REVENUE: 'var(--ec-success)', EXPENSE: 'var(--ec-danger)' }
const DIVISIONS: Division[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
/** 계정등록 [관련업무] — 원본 라디오 차례(E010107). 채권/채무 면 거래처관리대장 I · II 에 잡힌다. */
type RelatedWork = 'NONE' | 'DEPOSIT' | 'BORROWING' | 'NOTE' | 'TANGIBLE_ASSET' | 'INTANGIBLE_ASSET' | 'RECEIVABLE_PAYABLE'
const RELATED: [RelatedWork, string][] = [
  ['NONE', '없음'], ['DEPOSIT', '예금'], ['BORROWING', '차입금'], ['NOTE', '어음'],
  ['TANGIBLE_ASSET', '유형고정자산'], ['INTANGIBLE_ASSET', '무형고정자산'], ['RECEIVABLE_PAYABLE', '채권/채무'],
]

interface Account {
  id: number
  code: string
  name: string
  division: Division
  divisionName: string
  detailCategory: string | null
  active: boolean
  relatedWork: RelatedWork
  relatedWorkName: string
  partnerAggregate: boolean
}

/** 회계 기초등록 > 계정과목등록 (실제 연동) */
export default function AccountsPage() {
  const [rows, setRows] = useState<Account[]>([])
  const [keyword, setKeyword] = useState('')
  const [div, setDiv] = useState<Division | '전체'>('전체')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const EMPTY = { code: '', name: '', division: 'EXPENSE' as Division, detailCategory: '', relatedWork: 'NONE' as RelatedWork, partnerAggregate: false }
  const [form, setForm] = useState(EMPTY)
  /** 계정코드를 누르면 그 계정 수정(원본 '계정등록' 창이 같은 칸으로 열린다). null 이면 신규. */
  const [editId, setEditId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<Account[]>('/accounts')
      setRows(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string | boolean) { setForm((f) => ({ ...f, [k]: v })) }

  function openNew() { setEditId(null); setForm(EMPTY); setError(''); setShowForm(true) }
  function openEdit(a: Account) {
    setEditId(a.id)
    setForm({ code: a.code, name: a.name, division: a.division, detailCategory: a.detailCategory ?? '', relatedWork: a.relatedWork, partnerAggregate: a.partnerAggregate })
    setError('')
    setShowForm(true)
  }

  async function submit() {
    setError('')
    if (!form.code.trim()) return setError('계정코드를 입력하세요.')
    if (!form.name.trim()) return setError('계정과목명을 입력하세요.')
    try {
      const body = {
        name: form.name, division: form.division, detailCategory: form.detailCategory || undefined,
        relatedWork: form.relatedWork, partnerAggregate: form.partnerAggregate,
      }
      if (editId != null) await api.patch(`/accounts/${editId}`, body)
      else await api.post('/accounts', { code: form.code, ...body })
      setForm(EMPTY)
      setEditId(null)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function toggleActive(a: Account) {
    try {
      await api.patch(`/accounts/${a.id}`, { active: !a.active })
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  const shownRows = rows
    .filter((r) => div === '전체' || r.division === div)
    .filter((r) => !keyword || r.code.includes(keyword) || r.name.includes(keyword))

  /*
   * 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. [구분]·[사용]은 눈에 보이는 <b>이름</b>으로
   * 견준다 — 안쪽 코드(ASSET/LIABILITY…)로 정렬하면 화면에 찍힌 한글 차례와 어긋난다.
   */
  const sort = useTableSort(shownRows, {
    계정코드: (r) => r.code,
    계정과목명: (r) => r.name,
    구분: (r) => r.divisionName,
    사용: (r) => (r.active ? '사용' : '중단'),
  })
  const shown = sort.sorted

  return (
    <EcListShell
      title="계정과목등록"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={openNew}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <Modal error={error} open={showForm} title={editId != null ? '계정수정' : '계정과목등록'} onClose={() => setShowForm(false)}>{(
        <div className="border border-ec-line border-solid bg-white p-[14px] mb-[10px]">
          <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">{editId != null ? '계정 수정' : '계정과목 등록'}</div>
          <div className="flex gap-[12px] flex-wrap items-end">
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">계정코드 *</div>
              <input className="ec-input" value={form.code} disabled={editId != null} onChange={(e) => set('code', e.target.value)} style={{ width: 100 }} placeholder="811" /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">계정과목명 *</div>
              <input className="ec-input" value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 200 }} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">구분 *</div>
              <select className="ec-input" value={form.division} onChange={(e) => set('division', e.target.value)} style={{ width: 100 }}>
                {DIVISIONS.map((d) => <option key={d} value={d}>{DIV_LABEL[d]}</option>)}
              </select></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">세부분류</div>
              <input className="ec-input" value={form.detailCategory} onChange={(e) => set('detailCategory', e.target.value)} style={{ width: 160 }} placeholder="판매관리비" /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
          <div className="flex gap-[12px] flex-wrap items-center mt-[10px] text-[12.5px]">
            <span className="text-ec-label w-[110px]">거래처별집계구분</span>
            <label><input type="radio" name="partnerAggregate" checked={!form.partnerAggregate} onChange={() => set('partnerAggregate', false)} /> 없음</label>
            <label><input type="radio" name="partnerAggregate" checked={form.partnerAggregate} onChange={() => set('partnerAggregate', true)} /> 거래처별</label>
          </div>
          <div className="flex gap-[12px] flex-wrap items-center mt-[6px] text-[12.5px]">
            <span className="text-ec-label w-[110px]">관련업무</span>
            {RELATED.map(([v, label]) => (
              <label key={v}><input type="radio" name="relatedWork" checked={form.relatedWork === v} onChange={() => set('relatedWork', v)} /> {label}</label>
            ))}
          </div>
        </div>
      )}</Modal>

      <div className="flex gap-[2px] mb-[8px]">
        {(['전체', ...DIVISIONS] as const).map((d) => (
          <button key={d} onClick={() => setDiv(d)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: div === d ? 'var(--ec-blue)' : '#fff',
            color: div === d ? '#fff' : 'var(--ec-text)',
            fontWeight: div === d ? 700 : 400,
          }}>{d === '전체' ? '전체' : DIV_LABEL[d]}</button>
        ))}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[100px] cursor-pointer" onClick={() => sort.toggle('계정코드')}>계정코드 {sort.mark('계정코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('계정과목명')}>계정과목명 {sort.mark('계정과목명')}</th>
            <th className="w-[90px] text-center cursor-pointer" onClick={() => sort.toggle('구분')}>구분 {sort.mark('구분')}</th>
            <th className="w-[140px]">세부분류</th>
            <th className="w-[100px] text-center">거래처별집계</th>
            <th className="w-[110px] text-center">관련업무</th>
            <th className="w-[100px] text-center cursor-pointer" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td><a className="cursor-pointer" onClick={() => openEdit(r)}>{r.code}</a></td>
              <td style={{ color: r.active ? undefined : '#b3b8bf' }}>{r.name}</td>
              <td style={{ textAlign: 'center', color: DIV_COLOR[r.division], fontWeight: 700 }}>{r.divisionName}</td>
              <td>{r.detailCategory ?? ''}</td>
              <td className="text-center">{r.partnerAggregate ? '거래처별' : '없음'}</td>
              <td className="text-center">{r.relatedWorkName}</td>
              <td className="text-center">
                <button className="no-ec" onClick={() => toggleActive(r)} style={{
                  border: '1px solid var(--ec-border)', borderRadius: 3, cursor: 'pointer', fontSize: 11.5, padding: '2px 8px',
                  background: r.active ? 'var(--ec-success-bg)' : '#f5f5f5', color: r.active ? 'var(--ec-success)' : 'var(--ec-text-hint)',
                }}>{r.active ? '사용' : '중단'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
