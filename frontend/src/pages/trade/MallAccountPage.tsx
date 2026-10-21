import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { MallAccount, MallAccountType, Partner } from '../../types/api'
import { partnerCodeItems } from '../../utils/codeItems'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

/**
 * 재고 I > 쇼핑몰관리 > 쇼핑몰등록 (이카운트 C000664)
 * 우리가 판매하는 쇼핑몰/통합관리솔루션 계정 마스터. 주문 수집·품목코드연결의 '쇼핑몰' 선택지가 되고,
 * 판매전환 시 기본 거래처를 제공한다. (외부 오픈API 인증·자동수집 연동은 별개 트랙.)
 * 백엔드 신규: mall_accounts + /api/mall-accounts.
 */
const TYPE_LABEL: Record<MallAccountType, string> = { MALL: '쇼핑몰', SOLUTION: '통합관리솔루션' }
const empty = { name: '', type: 'MALL' as MallAccountType, partnerId: '', sellerId: '', memo: '' }

export default function MallAccountPage() {
  const [rows, setRows] = useState<MallAccount[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(empty)

  async function load() {
    setLoading(true); setError('')
    try {
      const [a, p] = await Promise.all([
        api.get<MallAccount[]>('/mall-accounts'),
        api.get<Partner[]>('/partners'),
      ])
      setRows(a.data); setPartners(p.data.filter((x) => x.type !== 'SUPPLIER'))
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function openNew() { setEditId(null); setForm(empty); setShowForm(true) }
  function openEdit(a: MallAccount) {
    setEditId(a.id)
    setForm({ name: a.name, type: a.type, partnerId: a.partnerId ? String(a.partnerId) : '', sellerId: a.sellerId ?? '', memo: a.memo ?? '' })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (!form.name.trim()) return setError('쇼핑몰명을 입력하세요.')
    const body = {
      name: form.name, type: form.type,
      partnerId: form.partnerId ? Number(form.partnerId) : undefined,
      sellerId: form.sellerId || undefined, memo: form.memo || undefined,
    }
    try {
      if (editId) { await api.put(`/mall-accounts/${editId}`, body); setOk('쇼핑몰을 수정했습니다.') }
      else { await api.post('/mall-accounts', body); setOk('쇼핑몰을 등록했습니다.') }
      setShowForm(false); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function toggleActive(a: MallAccount) {
    setError('')
    try { await api.put(`/mall-accounts/${a.id}`, { name: a.name, type: a.type, partnerId: a.partnerId ?? undefined, sellerId: a.sellerId ?? undefined, memo: a.memo ?? undefined, active: !a.active }); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove(id: number) {
    if (!(await ecConfirm('이 쇼핑몰을 삭제할까요?'))) return
    setError('')
    try { await api.delete(`/mall-accounts/${id}`); setShowForm(false); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const inputCls = 'ec-input'

  return (
    <EcListShell
      title="쇼핑몰등록"
      onNew={openNew}
      /* 원본 하단: 신규(F2) · 쇼핑몰추가요청 · 쇼핑몰별제공기능(2026-10-20 실측). 뒤 둘은 이카운트와 주고받는 것 — 안내만(지은 문구). */
      actions={[
        { label: '쇼핑몰추가요청', onClick: () => { void ecAlert('쇼핑몰 연동이 필요합니다.') } },
        { label: '쇼핑몰별제공기능', onClick: () => { void ecAlert('쇼핑몰 연동이 필요합니다.') } },
      ]}
    >

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <Modal error={error} open={showForm} title="쇼핑몰등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginTop: 8, marginBottom: 8 }}>
          <div className="flex gap-[12px] flex-wrap items-end">
            {editId && <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">쇼핑몰코드</div>
              <input className={inputCls} value={rows.find((r) => r.id === editId)?.code ?? ''} disabled style={{ width: 90 }} /></label>}
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">쇼핑몰명 *</div>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 180 }} placeholder="예: 스마트스토어" /></label>
            <div className="text-[12.5px]"><div className="text-ec-label mb-[3px]">수집처 *</div>
              <span className="flex items-center gap-[10px] h-[26px]">
                {([['MALL', '쇼핑몰'], ['SOLUTION', '통합관리솔루션']] as const).map(([v, n]) => (
                  <label key={v} className="inline-flex items-center gap-[3px]">
                    <input type="radio" name="mallType" aria-label={n} checked={form.type === v} onChange={() => set('type', v)} />{n}
                  </label>
                ))}
              </span></div>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">거래처</div>
              <CodePickerField label="판매전환 거래처" hideLabel width={200} emptyLabel="(미지정)" placeholder="(미지정)"
                               value={form.partnerId} onChange={(v) => set('partnerId', v)}
                               items={partnerCodeItems(partners.filter((p) => p.type !== 'SUPPLIER'))} /></label>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">ID</div>
              <input className={inputCls} value={form.sellerId} onChange={(e) => set('sellerId', e.target.value)} style={{ width: 150 }} /></label>
            <label className="text-[12.5px] flex-1 min-w-[160px]"><div className="text-ec-label mb-[3px]">비고</div>
              <input className={inputCls} value={form.memo} onChange={(e) => set('memo', e.target.value)} style={{ width: '100%' }} /></label>
            {/* 원본은 [저장/인증요청(F8)] — 우리는 쇼핑몰 인증을 하지 않으므로 저장만 한다. 비밀번호 칸도 두지 않는다. */}
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            {editId && <button type="button" className="ec-btn" onClick={() => remove(editId)}>삭제</button>}
          </div>
        </form>
      )}</Modal>

      {/* 원본 열: 쇼핑몰코드 · 쇼핑몰명 · ID · 거래처명 · 수집처구분 · 사용구분 · 진행상태 · 판매자사이트(2026-10-20 실측).
          진행상태는 원본이 '등록완료' / '인증완료' — 우리는 인증하지 않으니 저장된 것은 '등록완료'. 판매자사이트 [이동] 은 몰 주소가 없어 빈칸. */}
      <table className="w-full text-left">
        <thead><tr>
          <th className="w-[90px]">쇼핑몰코드</th>
          <th>쇼핑몰명</th>
          <th className="w-[120px]">ID</th>
          <th>거래처명</th>
          <th className="w-[130px]">수집처구분</th>
          <th className="text-center w-[80px]">사용구분</th>
          <th className="text-center w-[90px]">진행상태</th>
          <th className="text-center w-[90px]">판매자사이트</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((a) => (
            <tr key={a.id}>
              <td>{a.code}</td>
              <td><a className="cursor-pointer" onClick={() => openEdit(a)}>{a.name}</a></td>
              <td>{a.sellerId ?? ''}</td>
              <td>{a.partnerName ?? ''}</td>
              <td>{TYPE_LABEL[a.type]}</td>
              <td className="text-center">
                <a className="cursor-pointer" onClick={() => toggleActive(a)}>{a.active ? 'Yes' : 'No'}</a>
              </td>
              <td className="text-center">등록완료</td>
              <td className="text-center"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
