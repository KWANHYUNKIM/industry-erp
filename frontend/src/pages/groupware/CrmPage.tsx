import { useEffect, useState, useRef} from 'react'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { CrmActivity, CrmStage, Partner } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const today = () => ymd(new Date())

const STAGES: { v: CrmStage; label: string; color: string }[] = [
  { v: 'LEAD', label: '리드', color: 'var(--ec-text-hint)' },
  { v: 'CONSULTING', label: '상담중', color: 'var(--ec-blue)' },
  { v: 'QUOTE', label: '견적', color: 'var(--ec-warn)' },
  { v: 'CONTRACT', label: '계약', color: 'var(--ec-success)' },
  { v: 'LOST', label: '실패', color: 'var(--ec-danger)' },
]
const stageColor = (v: CrmStage) => STAGES.find((s) => s.v === v)?.color ?? 'var(--ec-label)'

/**
 * 그룹웨어 > 고객관리 > 고객관리게시판 > 영업활동관리 (이카운트 E200319)
 *
 * 원본에서 '고객관리'는 단독 화면이 아니라 <b>고객관리게시판</b> 묶음이고, 그 안에
 * 영업활동관리·상담이력관리 두 게시판이 있다. 우리 화면은 영업활동에 해당한다.
 * 원본 두 화면은 이 계정에서 '권한없음'이라 컬럼을 대조하지 못했다 —
 * 근거가 생기면 그때 맞춘다.
 */
export default function CrmPage() {
  const [rows, setRows] = useState<CrmActivity[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ activityDate: today(), partnerId: '', contactName: '', charge: '', activity: '', stage: 'LEAD', nextAction: '' })

  async function load() {
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        api.get<CrmActivity[]>('/crm-activities'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(c.data)
      setPartners(p.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submit() {
    setError('')
    if (!form.partnerId) return setError('고객사를 선택하세요.')
    try {
      await api.post('/crm-activities', {
        activityDate: form.activityDate,
        partnerId: Number(form.partnerId),
        contactName: form.contactName || undefined,
        charge: form.charge || undefined,
        activity: form.activity || undefined,
        stage: form.stage,
        nextAction: form.nextAction || undefined,
      })
      setForm({ activityDate: today(), partnerId: '', contactName: '', charge: '', activity: '', stage: 'LEAD', nextAction: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function changeStage(row: CrmActivity, stage: CrmStage) {
    try {
      await api.patch(`/crm-activities/${row.id}`, { stage })
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shownRows = rows.filter((r) => !keyword || r.partnerName.includes(keyword) || (r.activity ?? '').includes(keyword))

  /*
   * 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. [단계]는 칸 안이 고르는 자리(select)라
   * 값 자체로 세운다 — 화면에 보이는 것이 곧 그 값이다.
   */
  const sort = useTableSort(shownRows, {
    일자: (r) => r.activityDate,
    고객사: (r) => r.partnerName,
    단계: (r) => r.stage,
  })
  const shown = sort.sorted


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'CRM', [])

  return (
    <EcListShell
      title="영업활동관리"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '활동등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <Modal error={error} open={showForm} title="영업활동 등록" onClose={() => setShowForm(false)}>{(
        <div className="border border-ec-line border-solid bg-white p-[14px] mt-[8px] mb-[8px]">
          <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">영업활동 등록</div>
          <div className="flex gap-[12px] flex-wrap items-end">
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">일자</div>
              <input className="ec-input" type="date" value={form.activityDate} onChange={(e) => set('activityDate', e.target.value)} style={{ width: 140 }} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">고객사 *</div>
              <CodePickerField label="고객사" hideLabel width={200} emptyLabel="선택 안 함" placeholder="선택하세요"
                               value={form.partnerId} onChange={(v) => set('partnerId', v)}
                               items={partnerCodeItems(partners)} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">담당연락처</div>
              <input className="ec-input" value={form.contactName} onChange={(e) => set('contactName', e.target.value)} style={{ width: 110 }} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">영업담당</div>
              <input className="ec-input" value={form.charge} onChange={(e) => set('charge', e.target.value)} placeholder="미입력시 본인" style={{ width: 110 }} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">단계</div>
              <select className="ec-input" value={form.stage} onChange={(e) => set('stage', e.target.value)} style={{ width: 100 }}>
                {STAGES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select></label>
            <label className="text-[12.5px] flex-1 min-w-[200px]"><div className="text-ec-label mb-[3px]">활동내용</div>
              <input className="ec-input" value={form.activity} onChange={(e) => set('activity', e.target.value)} style={{ width: '100%' }} /></label>
            <label className="text-[12.5px] flex-1 min-w-[200px]"><div className="text-ec-label mb-[3px]">다음 액션</div>
              <input className="ec-input" value={form.nextAction} onChange={(e) => set('nextAction', e.target.value)} style={{ width: '100%' }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>등록</button>
          </div>
        </div>
      )}</Modal>

      <div className="flex gap-[10px] mb-[8px] flex-wrap">
        {STAGES.map((s) => (
          <span key={s.v} className="text-[11.5px] text-ec-label">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: s.color, marginRight: 4 }} />
            {s.label} {rows.filter((r) => r.stage === s.v).length}
          </span>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[100px] cursor-pointer" onClick={() => sort.toggle('일자')}>일자 {sort.mark('일자')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('고객사')}>고객사 {sort.mark('고객사')}</th>
            <th className="w-[90px]">담당연락처</th>
            <th className="w-[80px]">영업담당</th>
            <th>활동내용</th>
            <th className="w-[100px] text-center cursor-pointer" onClick={() => sort.toggle('단계')}>단계 {sort.mark('단계')}</th>
            <th>다음 액션</th>
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
              <td>{dateText(r.activityDate)}</td>
              <td>{r.partnerName}</td>
              <td>{r.contactName ?? ''}</td>
              <td>{r.charge ?? ''}</td>
              <td>{r.activity ?? ''}</td>
              <td className="text-center">
                <select
                  value={r.stage}
                  onChange={(e) => changeStage(r, e.target.value as CrmStage)}
                  className="ec-input"
                  style={{ width: 88, color: stageColor(r.stage), fontWeight: 700, textAlign: 'center' }}
                >
                  {STAGES.map((s) => <option key={s.v} value={s.v} style={{ color: '#333' }}>{s.label}</option>)}
                </select>
              </td>
              <td className="text-ec-label">{r.nextAction ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
