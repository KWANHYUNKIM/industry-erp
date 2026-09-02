import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CommonCode, Item, QualityInspection, QualityInspectionType, QualityResult } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

const today = () => ymd(new Date())

const TYPES: { v: QualityInspectionType; label: string }[] = [
  { v: 'INCOMING', label: '수입검사' },
  { v: 'PROCESS', label: '공정검사' },
  { v: 'SHIPMENT', label: '출하검사' },
]
const RESULTS: { v: QualityResult; label: string }[] = [
  { v: 'PASS', label: '합격' },
  { v: 'CONDITIONAL', label: '조건부합격' },
  { v: 'FAIL', label: '불합격' },
]

const resultColor = (r: QualityResult) => (r === 'FAIL' ? '#c60a2e' : r === 'CONDITIONAL' ? '#c07a00' : '#1c7c3c')

/** 재고 II > 품질관리 — 수입/공정/출하 검사성적 (실제 연동) */
export default function QualityInspectionPage() {
  const [rows, setRows] = useState<QualityInspection[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [defectTypes, setDefectTypes] = useState<CommonCode[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [form, setForm] = useState({
    inspectionDate: today(), type: 'INCOMING', itemId: '',
    lotNo: '', inspectedQty: '', defectQty: '0', defectType: '', result: '', inspector: '',
    projectId: '',
  })

  async function load() {
    setLoading(true)
    try {
      const [q, i, d, pj] = await Promise.all([
        api.get<QualityInspection[]>('/quality-inspections'),
        api.get<Item[]>('/items'),
        /* 원본 [불량유형]은 코드도움이다 — 공통코드 그룹 DEFECT_TYPE 에서 가져온다. */
        api.get<CommonCode[]>('/codes/DEFECT_TYPE'),
        api.get<{ id: number; code: string; name: string }[]>('/projects'),
      ])
      setRows(q.data)
      setItems(i.data)
      setDefectTypes(d.data); setProjects(pj.data)
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
    if (!form.itemId) return setError('품목을 선택하세요.')
    if (form.inspectedQty === '') return setError('검사수량을 입력하세요.')
    try {
      await api.post('/quality-inspections', {
        inspectionDate: form.inspectionDate,
        type: form.type,
        itemId: Number(form.itemId),
        lotNo: form.lotNo || undefined,
        inspectedQty: Number(form.inspectedQty),
        defectQty: Number(form.defectQty || 0),
        defectType: form.defectType || undefined,
        projectId: form.projectId ? Number(form.projectId) : undefined,
        result: form.result || undefined,
        inspector: form.inspector || undefined,
      })
      setForm((f) => ({ ...f, itemId: '', lotNo: '', inspectedQty: '', defectQty: '0', defectType: '', result: '', inspector: '', projectId: '' }))
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const shownRows = rows.filter((r) => !keyword || r.itemName.includes(keyword) || (r.lotNo ?? '').includes(keyword))

  /*
   * 네 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. [검사구분]·[판정]은 안쪽 코드가 아니라
   * 화면에 찍히는 이름으로 세운다.
   */
  const sort = useTableSort(shownRows, {
    검사일자: (r) => r.inspectionDate,
    검사구분: (r) => r.typeName,
    품목명: (r) => r.itemName,
    판정: (r) => r.resultName,
  })
  const shown = sort.sorted
  const inputCls = 'ec-input'

  return (
    <EcListShell
      title="품질관리 (검사성적)"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <Modal open={showForm} title="품질관리 (검사성적) 등록" onClose={() => setShowForm(false)}>{(
        <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>검사성적 등록</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사일자</div>
              <input className={inputCls} type="date" value={form.inspectionDate} onChange={(e) => set('inspectionDate', e.target.value)} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사구분</div>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)} style={{ width: 110 }}>
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>품목 *</div>
              <select className={inputCls} value={form.itemId} onChange={(e) => set('itemId', e.target.value)} style={{ width: 220 }}>
                <option value="">선택하세요</option>
                {items.map((it) => <option key={it.id} value={it.id}>[{it.code}] {it.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>로트No.</div>
              <input className={inputCls} value={form.lotNo} onChange={(e) => set('lotNo', e.target.value)} style={{ width: 150 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사수량 *</div>
              <input className={inputCls} type="number" step="any" value={form.inspectedQty} onChange={(e) => set('inspectedQty', e.target.value)} style={{ width: 90 }} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>불량수</div>
              <input className={inputCls} type="number" step="any" value={form.defectQty} onChange={(e) => set('defectQty', e.target.value)} style={{ width: 80 }} /></label>
            {/*
              원본 불량률파악보고서의 [불량유형]. 여기서 안 받으면 <b>그 조건이 걸 값이
              어디서도 안 생긴다.</b> 불량수가 0 이면 고를 것이 없다 — 전량 양품인데
              '치수불량' 이 붙어 있으면 헷갈리므로 서버도 버린다.
            */}
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>불량유형</div>
              <select className={inputCls} value={form.defectType} disabled={Number(form.defectQty || 0) <= 0}
                      onChange={(e) => set('defectType', e.target.value)} style={{ width: 120 }}>
                <option value="">(미지정)</option>
                {defectTypes.map((d) => <option key={d.id} value={d.code}>{d.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>판정(자동)</div>
              <select className={inputCls} value={form.result} onChange={(e) => set('result', e.target.value)} style={{ width: 120 }}>
                <option value="">자동판정</option>
                {RESULTS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select></label>
            {/*
              원본 품질검사요청입력의 [프로젝트]. <b>검사에는 진작 프로젝트 칸이 있었는데</b>
              이 화면이 정할 데도, 보여 줄 데도 두지 않았다 — 불량률파악보고서는 그 값으로
              거르고 있었으니 늘 빈 채로 걸렸다.
            */}
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>프로젝트</div>
              <select className={inputCls} value={form.projectId} onChange={(e) => set('projectId', e.target.value)} style={{ width: 140 }}>
                <option value="">(없음)</option>
                {projects.map((pj) => <option key={pj.id} value={pj.id}>{pj.name}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>검사자</div>
              <input className={inputCls} value={form.inspector} onChange={(e) => set('inspector', e.target.value)} placeholder="미입력시 본인" style={{ width: 110 }} /></label>
            <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
          </div>
        </div>
      )}</Modal>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>검사번호</th>
            <th style={{ width: 100, cursor: 'pointer' }} onClick={() => sort.toggle('검사일자')}>검사일자 {sort.mark('검사일자')}</th>
            <th style={{ width: 90, cursor: 'pointer' }} onClick={() => sort.toggle('검사구분')}>검사구분 {sort.mark('검사구분')}</th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목명')}>품목명 {sort.mark('품목명')}</th>
            <th style={{ width: 130 }}>로트No.</th>
            <th style={{ width: 80, textAlign: 'right' }}>검사수량</th>
            <th style={{ width: 60, textAlign: 'right' }}>불량수</th>
            <th style={{ width: 80, textAlign: 'right' }}>불량률(%)</th>
            <th style={{ width: 90, textAlign: 'center', cursor: 'pointer' }} onClick={() => sort.toggle('판정')}>판정 {sort.mark('판정')}</th>
            <th style={{ width: 100 }}>프로젝트</th>
            <th style={{ width: 80 }}>검사자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.inspectionNo}</td>
              <td>{dateText(r.inspectionDate)}</td>
              <td>{r.typeName}</td>
              <td>{r.itemName}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.lotNo ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.inspectedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.defectQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: r.defectRate >= 3 ? '#c60a2e' : undefined }}>{r.defectRate.toFixed(1)}</td>
              <td style={{ textAlign: 'center', color: resultColor(r.result), fontWeight: 700 }}>{r.resultName}</td>
              <td style={{ color: r.projectName ? '#5a626e' : '#c9ced6' }}>{r.projectName ?? ''}</td>
              <td>{r.inspector ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
