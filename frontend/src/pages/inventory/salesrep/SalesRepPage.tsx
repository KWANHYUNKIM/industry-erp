import { useEffect, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import Modal from '../../../components/Modal'
import NumCheck from '../../../components/NumCheck'
import { ecConfirm } from '../../../components/EcDialog'
import { api, extractErrorMessage } from '../../../api/client'
import type { SalesRep } from '../../../types/api'

/**
 * 재고 I · 회계 I › 기초등록 › <b>사원(담당)등록</b>(원본 E010110, 제목 '사원(담당)리스트') — 2026-10-14 loginaa 실측(plans/재고1/E010110.md).
 *
 * <p>관리 › 사원등록(인사 · 급여의 사원, /hr/employees)과 <b>다른 마스터</b>다. 판매 · 구매 · 주문 · 견적 · 출하 · 작업지시 ·
 * 재고조정 전표의 [담당자] 코드도움이 이 목록을 띄운다(관리 사원번호 2019-001 은 안 나온다).
 * <ul>
 *   <li>격자: (번호) · 사원(담당)코드 · 사원(담당)명 · 검색창내용 · 담당자연락처 · 담당자Email · 사용. 코드 차례.
 *       하단 신규(F2) · 사용중단/재사용 · Excel.</li>
 *   <li>신규 '사원(담당)등록': 코드(다음 번호 다섯 자리 미리 참) · 사원(담당)명 · 검색창내용 · 적요 · 담당자연락처 · 담당자Email ·
 *       추가항목3 ~ 6. 빈 이름 저장 → 이름 칸만 빨강(글 없음). 저장하면 말 없이 닫힌다.</li>
 *   <li>수정 '사원(담당)수정': 저장(F8) · 다시 작성 · 사용중단/재사용 · 삭제('삭제하겠습니까?') · 닫기.</li>
 * </ul>
 * 못 맞춘 것: 목록의 [이체정보] '등록' 열(원본 창을 못 쟀다) · 웹자료올리기 · Search(F3) 상세 조건.
 */
export default function SalesRepPage() {
  const [rows, setRows] = useState<SalesRep[]>([])
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [quick, setQuick] = useState('')
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const blank = {
    id: null as number | null, code: '', name: '', searchKeyword: '', remark: '', phone: '', email: '',
    extra3: '', extra4: '', extra5: '', extra6: '', active: true,
  }
  const [f, setF] = useState(blank)

  function load() {
    setError('')
    api.get<SalesRep[]>('/sales-reps/all').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => { load() }, [])

  async function openNew() {
    setF(blank); setFormError(''); setInvalid(false); setOpen(true)
    try {
      const r = await api.get<{ code: string }>('/sales-reps/next-code')
      setF((x) => (x.code ? x : { ...x, code: r.data.code }))
    } catch { /* 비워 두면 서버가 매긴다 */ }
  }
  function openEdit(i: SalesRep) {
    setF({
      id: i.id, code: i.code, name: i.name, searchKeyword: i.searchKeyword ?? '', remark: i.remark ?? '',
      phone: i.phone ?? '', email: i.email ?? '', extra3: i.extra3 ?? '', extra4: i.extra4 ?? '',
      extra5: i.extra5 ?? '', extra6: i.extra6 ?? '', active: i.active,
    })
    setFormError(''); setInvalid(false); setOpen(true)
  }

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault()
    if (!f.name.trim()) { setInvalid(true); setFormError(''); return }
    const body = {
      code: f.code.trim() || null, name: f.name.trim(), searchKeyword: f.searchKeyword, remark: f.remark,
      phone: f.phone, email: f.email, extra3: f.extra3, extra4: f.extra4, extra5: f.extra5, extra6: f.extra6,
    }
    try {
      if (f.id) await api.put(`/sales-reps/${f.id}`, body)
      else await api.post('/sales-reps', body)
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function toggle(ids: number[]) {
    try {
      for (const id of ids) {
        const i = rows.find((r) => r.id === id)
        if (i) await api.put(`/sales-reps/${id}/active`, { active: !i.active })
      }
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  async function remove() {
    if (!f.id || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.delete(`/sales-reps/${f.id}`)
      setOpen(false)
      load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  const q = quick.trim()
  const shown = rows.filter((i) => !q || i.code.includes(q) || i.name.includes(q) || (i.searchKeyword ?? '').includes(q))
  const allChecked = shown.length > 0 && shown.every((i) => checked.has(i.id))
  const text = (key: 'searchKeyword' | 'phone' | 'email' | 'extra3' | 'extra4' | 'extra5' | 'extra6', label: string) => (
    <li>
      <span className="title">{label}</span>
      <div className="form">
        <input className="ec-input w-full" aria-label={label} placeholder={label}
               value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
      </div>
    </li>
  )

  return (
    <EcListShell
      title="사원(담당)리스트"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => undefined}
      onNew={() => void openNew()}
      actions={[
        { label: '사용중단/재사용', selected: checked.size, onClick: () => void toggle([...checked]) },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[51px] text-center">
              <NumCheck no="" head label="전체선택" on={allChecked} onChange={(v) => setChecked(v ? new Set(shown.map((i) => i.id)) : new Set())} />
            </th>
            <th className="w-[243px]">사원(담당)코드</th>
            <th>사원(담당)명</th>
            <th className="w-[204px]">검색창내용</th>
            <th className="w-[204px]">담당자연락처</th>
            <th className="w-[204px]">담당자Email</th>
            <th className="w-[112px] text-center">사용</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((i, n) => (
            <tr key={i.id} className={i.active ? undefined : '[&>td]:bg-[var(--ec-bg-row-off)]'}>
              <td className="text-center">
                <NumCheck no={n + 1} label={`${i.code} 선택`} on={checked.has(i.id)}
                          onChange={(v) => setChecked((s) => { const m = new Set(s); if (v) m.add(i.id); else m.delete(i.id); return m })} />
              </td>
              <td><button type="button" className="ec-link" onClick={() => openEdit(i)}>{i.code}</button></td>
              <td><button type="button" className="ec-link" onClick={() => openEdit(i)}>{i.name}</button></td>
              <td>{i.searchKeyword}</td>
              <td>{i.phone}</td>
              <td>{i.email}</td>
              <td className="text-center">{i.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={open} title={f.id ? '사원(담당)수정' : '사원(담당)등록'} width={960} onClose={() => setOpen(false)}>{(
        <form onSubmit={save}>
          <ul className="ec-form">
            <li>
              <span className="title">사원(담당)코드</span>
              <div className="form">
                {f.id ? <span>{f.code}</span> : (
                  <input className="ec-input w-full" aria-label="사원(담당)코드" placeholder="사원(담당)코드"
                         value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
                )}
              </div>
            </li>
            <li>
              <span className="title">사원(담당)명</span>
              <div className="form">
                <input className={`ec-input w-full ${invalid && !f.name.trim() ? 'border-ec-danger' : ''}`} aria-label="사원(담당)명"
                       placeholder="사원(담당)명" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </div>
            </li>
            {text('searchKeyword', '검색창내용')}
            <li className="wide">
              <span className="title">적요</span>
              <div className="form">
                <textarea className="ec-input w-full" rows={3} aria-label="적요" placeholder="적요"
                          value={f.remark} onChange={(e) => setF({ ...f, remark: e.target.value })} />
              </div>
            </li>
            {text('phone', '담당자연락처')}
            {text('email', '담당자Email')}
            {text('extra3', '추가항목3')}
            {text('extra4', '추가항목4')}
            {text('extra5', '추가항목5')}
            {text('extra6', '추가항목6')}
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => {
              const i = rows.find((r) => r.id === f.id)
              if (i) openEdit(i); else void openNew()
            }}>다시 작성</button>
            {f.id && (
              <>
                <button type="button" className="ec-btn" onClick={() => { void toggle([f.id!]); setOpen(false) }}>
                  {f.active ? '사용중단' : '재사용'}
                </button>
                <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>
              </>
            )}
            <button type="button" className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
