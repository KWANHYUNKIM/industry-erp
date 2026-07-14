import { Fragment, useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type { BusinessContract, BusinessContractStatus, BusinessContractType, Partner } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => n.toLocaleString('ko-KR')
const when = (s: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '')

const TABS = ['전체', 'DRAFT', 'SENT', 'SIGNED', 'TERMINATED'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = {
  전체: '전체', DRAFT: '작성', SENT: '서명요청', SIGNED: '서명완료', TERMINATED: '해지',
}
const STATUS_COLOR: Record<BusinessContractStatus, string> = {
  DRAFT: '#5a626e', SENT: 'var(--ec-blue)', SIGNED: '#1c7c3c', TERMINATED: '#8a929c',
}

/** 만료 30일 전부터 경고 */
const EXPIRY_WARN_DAYS = 30

/**
 * 회계 II > 계약관리 · 전자계약.
 * 작성 → 서명요청 → 전자서명(서명자·서명일시·동의문구 기록) → 해지.
 */
export default function ContractPage() {
  const [rows, setRows] = useState<BusinessContract[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [c, p] = await Promise.all([
        api.get<BusinessContract[]>('/contracts'),
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

  async function send(c: BusinessContract) {
    try {
      await api.post(`/contracts/${c.id}/send`)
      flash(`${c.contractNo} 서명요청`)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function sign(c: BusinessContract) {
    const signerName = window.prompt(`${c.title}\n전자서명할 서명자 이름을 입력하세요.`, c.partnerName)
    if (!signerName) return
    const agreement = window.prompt(
      '동의문구를 입력하세요. 입력한 문구가 서명 기록으로 그대로 보관됩니다.',
      '본 계약 내용에 동의합니다.')
    if (!agreement) return
    try {
      await api.post(`/contracts/${c.id}/sign`, { signerName, agreement })
      flash(`${c.contractNo} 전자서명 완료 (${signerName})`)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function terminate(c: BusinessContract) {
    const reason = window.prompt(`${c.contractNo} 해지 사유를 입력하세요.`, '')
    if (!reason) return
    try {
      await api.post(`/contracts/${c.id}/terminate`, { reason, terminatedDate: today() })
      flash(`${c.contractNo} 해지`)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = rows.filter((r) => tab === '전체' || r.status === tab)
  const count = (t: Tab) => rows.filter((r) => t === '전체' || r.status === t).length
  const active = rows.filter((r) => r.status === 'SIGNED')
  const expiring = active.filter((r) => r.daysToExpiry >= 0 && r.daysToExpiry <= EXPIRY_WARN_DAYS)
  const activeTotal = active.reduce((s, r) => s + r.amount, 0)

  return (
    <EcListShell
      title="계약관리 · 전자계약"
      newLabel={showForm ? '입력닫기' : '계약 작성(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{TAB_LABEL[t]} ({count(t)})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#5a626e' }}>
          유효계약 {active.length}건 · <b style={{ color: 'var(--ec-blue-dark)' }}>{won(activeTotal)}</b>
          {expiring.length > 0 && (
            <b style={{ color: '#c60a2e', marginLeft: 8 }}>만료임박 {expiring.length}건</b>
          )}
        </span>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {showForm && (
        <ContractForm partners={partners} onError={setError}
          onSaved={(c) => { setShowForm(false); flash(`${c.contractNo} 작성 — 서명요청을 보내면 상대가 전자서명할 수 있습니다.`); load() }} />
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 130 }}>계약번호</th>
            <th>계약명</th>
            <th style={{ width: 90, textAlign: 'center' }}>종류</th>
            <th style={{ width: 130 }}>거래처</th>
            <th style={{ width: 180 }}>계약기간</th>
            <th style={{ width: 120, textAlign: 'right' }}>계약금액</th>
            <th style={{ width: 90, textAlign: 'center' }}>상태</th>
            <th style={{ width: 100, textAlign: 'center' }}>만료까지</th>
            <th style={{ width: 150, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>계약이 없습니다.</td></tr>
          ) : shown.map((c, i) => {
            const warn = c.status === 'SIGNED' && c.daysToExpiry >= 0 && c.daysToExpiry <= EXPIRY_WARN_DAYS
            const expired = c.status === 'SIGNED' && c.daysToExpiry < 0
            return (
              <Fragment key={c.id}>
                <tr onClick={() => setOpenId(openId === c.id ? null : c.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>
                    {openId === c.id ? '▾ ' : '▸ '}{c.contractNo}
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.title}</td>
                  <td style={{ textAlign: 'center', color: '#5a626e' }}>{c.typeName}</td>
                  <td>{c.partnerName}</td>
                  <td>{c.startDate} ~ {c.endDate}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(c.amount)}</td>
                  <td style={{ textAlign: 'center', color: STATUS_COLOR[c.status], fontWeight: 600 }}>{c.statusName}</td>
                  <td style={{ textAlign: 'center', color: expired ? '#8a929c' : warn ? '#c60a2e' : '#5a626e', fontWeight: warn ? 700 : 400 }}>
                    {c.status === 'TERMINATED' ? '-' : expired ? '만료' : `${c.daysToExpiry}일`}
                  </td>
                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', gap: 3 }}>
                      {c.status === 'DRAFT' && (
                        <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => send(c)}>서명요청</button>
                      )}
                      {c.status === 'SENT' && (
                        <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => sign(c)}>전자서명</button>
                      )}
                      {c.status === 'SIGNED' && (
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: '#c60a2e' }} onClick={() => terminate(c)}>해지</button>
                      )}
                    </div>
                  </td>
                </tr>
                {openId === c.id && (
                  <tr className="no-ec">
                    <td colSpan={10} style={{ padding: '10px 14px', background: '#fafbfc' }}>
                      <div style={{ display: 'flex', gap: 30, fontSize: 12.5, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ color: '#8a929c', marginBottom: 2 }}>결제조건</div>
                          <div>{c.paymentTerms ?? '-'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#8a929c', marginBottom: 2 }}>서명요청</div>
                          <div>{when(c.sentAt) || '-'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#8a929c', marginBottom: 2 }}>전자서명</div>
                          <div>
                            {c.signedAt
                              ? <><b>{c.signerName}</b> · {when(c.signedAt)}</>
                              : '미서명'}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ color: '#8a929c', marginBottom: 2 }}>동의문구</div>
                          <div style={{ color: c.agreement ? '#1c7c3c' : '#9aa1ab' }}>{c.agreement ?? '-'}</div>
                        </div>
                        {c.status === 'TERMINATED' && (
                          <div style={{ minWidth: 200 }}>
                            <div style={{ color: '#8a929c', marginBottom: 2 }}>해지</div>
                            <div style={{ color: '#c60a2e' }}>{c.terminatedDate} · {c.terminationReason}</div>
                          </div>
                        )}
                      </div>
                      {c.content && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ color: '#8a929c', fontSize: 12.5, marginBottom: 2 }}>계약 내용</div>
                          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, background: '#fff', border: '1px solid var(--ec-border)', padding: 8 }}>{c.content}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </EcListShell>
  )
}

function ContractForm({ partners, onError, onSaved }: {
  partners: Partner[]; onError: (m: string) => void; onSaved: (c: BusinessContract) => void
}) {
  const [form, setForm] = useState({
    title: '', type: 'SALES' as BusinessContractType, partnerId: '',
    startDate: today(), endDate: '', amount: '', paymentTerms: '', content: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    onError('')
    if (!form.title) return onError('계약명을 입력하세요.')
    if (!form.partnerId) return onError('거래처를 선택하세요.')
    if (!form.endDate) return onError('계약 종료일을 입력하세요.')
    if (form.endDate < form.startDate) return onError('계약 종료일이 시작일보다 빠를 수 없습니다.')
    setSaving(true)
    try {
      const { data } = await api.post<BusinessContract>('/contracts', {
        title: form.title,
        type: form.type,
        partnerId: Number(form.partnerId),
        startDate: form.startDate,
        endDate: form.endDate,
        amount: Number(form.amount) || 0,
        paymentTerms: form.paymentTerms || undefined,
        content: form.content || undefined,
      })
      onSaved(data)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>계약 작성</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="계약명 *">
          <input className="ec-input" value={form.title} onChange={(e) => set('title', e.target.value)} style={{ width: 240 }} placeholder="2026년 연간 공급계약" />
        </Field>
        <Field label="종류 *">
          <select className="ec-input" value={form.type} onChange={(e) => set('type', e.target.value)} style={{ width: 110 }}>
            <option value="SALES">매출계약</option>
            <option value="PURCHASE">매입계약</option>
            <option value="OTHER">기타계약</option>
          </select>
        </Field>
        <Field label="거래처 *">
          <select className="ec-input" value={form.partnerId} onChange={(e) => set('partnerId', e.target.value)} style={{ width: 160 }}>
            <option value="">선택하세요</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="시작일 *">
          <input className="ec-input" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="종료일 *">
          <input className="ec-input" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="계약금액">
          <input className="ec-input" type="number" step="any" value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ width: 140, textAlign: 'right' }} />
        </Field>
        <Field label="결제조건">
          <input className="ec-input" value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} style={{ width: 220 }} placeholder="월말 마감 익월 10일 지급" />
        </Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12.5, color: '#5a626e', marginBottom: 3 }}>계약 내용</div>
        <textarea className="ec-input" value={form.content} onChange={(e) => set('content', e.target.value)}
          style={{ width: '100%', height: 90, padding: 8, resize: 'vertical' }} placeholder="계약 조항을 입력하세요." />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <button className="ec-btn ec-btn-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        <span style={{ fontSize: 11.5, color: '#8a929c' }}>
          ※ 저장하면 작성 상태입니다. 서명요청을 보내야 상대가 전자서명할 수 있고, 서명이 끝난 계약만 유효계약으로 집계됩니다.
        </span>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12.5 }}>
      <div style={{ color: '#5a626e', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}
