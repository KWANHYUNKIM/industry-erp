import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useShortcut } from '../../utils/useShortcut'

/** Self-Customizing > 정보관리 — 회사 기본정보 등록/수정 (실제 연동, 단일 레코드 upsert) */
interface CompanyForm {
  name: string
  ceo: string
  bizRegNo: string
  corpRegNo: string
  bizType: string
  bizItem: string
  tel: string
  fax: string
  email: string
  zipcode: string
  address: string
  addressDetail: string
}

const EMPTY: CompanyForm = {
  name: '', ceo: '', bizRegNo: '', corpRegNo: '', bizType: '', bizItem: '',
  tel: '', fax: '', email: '', zipcode: '', address: '', addressDetail: '',
}

const thStyle: React.CSSProperties = { width: 120, background: 'var(--ec-bg-page)', textAlign: 'left', fontWeight: 700, color: 'var(--ec-text)', padding: '8px 10px', border: '1px solid var(--ec-border)', fontSize: 12.5 }
const tdStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--ec-border)' }

export default function CompanyInfoPage() {
  const [form, setForm] = useState<CompanyForm>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  /** 주소검색 모달 (외부 우편번호 API 미연동 — 직접 입력해 폼에 반영한다) */
  const [addrOpen, setAddrOpen] = useState(false)
  const [addrZip, setAddrZip] = useState('')
  const [addrRoad, setAddrRoad] = useState('')

  // 저장(F8) — 버튼 라벨이 약속한 단축키. 저장 중이면 안 먹는다.
  useShortcut('F8', save, !saving)

  const openAddrSearch = () => {
    setAddrZip(form.zipcode)
    setAddrRoad(form.address)
    setAddrOpen(true)
  }

  const applyAddr = () => {
    setForm((f) => ({ ...f, zipcode: addrZip.trim(), address: addrRoad.trim() }))
    setAddrOpen(false)
  }

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<CompanyForm | null>('/company')
      if (r.data) {
        // null 필드를 빈문자열로 정규화
        const merged = { ...EMPTY }
        for (const k of Object.keys(EMPTY) as (keyof CompanyForm)[]) {
          merged[k] = (r.data[k] ?? '') as string
        }
        setForm(merged)
      }
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const set = (k: keyof CompanyForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    setError(''); setOk('')
    if (!form.name.trim()) { setError('회사명을 입력하세요.'); return }
    setSaving(true)
    try {
      await api.put('/company', form)
      setOk('회사정보가 저장되었습니다.')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">회사정보관리</span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      {loading ? (
        <p className="text-ec-hint p-[20px]">불러오는 중…</p>
      ) : (
        <>
          <table className="border-collapse w-full max-w-[760px]">
            <tbody>
              <tr>
                <th style={thStyle}>회사명 *</th>
                <td style={tdStyle}><input className="ec-input" value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 240 }} /></td>
                <th style={thStyle}>대표자</th>
                <td style={tdStyle}><input className="ec-input" value={form.ceo} onChange={(e) => set('ceo', e.target.value)} style={{ width: 160 }} /></td>
              </tr>
              <tr>
                <th style={thStyle}>사업자등록번호</th>
                <td style={tdStyle}><input className="ec-input" value={form.bizRegNo} onChange={(e) => set('bizRegNo', e.target.value)} style={{ width: 240 }} /></td>
                <th style={thStyle}>법인등록번호</th>
                <td style={tdStyle}><input className="ec-input" value={form.corpRegNo} onChange={(e) => set('corpRegNo', e.target.value)} style={{ width: 160 }} /></td>
              </tr>
              <tr>
                <th style={thStyle}>업태</th>
                <td style={tdStyle}><input className="ec-input" value={form.bizType} onChange={(e) => set('bizType', e.target.value)} style={{ width: 240 }} /></td>
                <th style={thStyle}>종목</th>
                <td style={tdStyle}><input className="ec-input" value={form.bizItem} onChange={(e) => set('bizItem', e.target.value)} style={{ width: 240 }} /></td>
              </tr>
              <tr>
                <th style={thStyle}>전화번호</th>
                <td style={tdStyle}><input className="ec-input" value={form.tel} onChange={(e) => set('tel', e.target.value)} style={{ width: 240 }} /></td>
                <th style={thStyle}>팩스</th>
                <td style={tdStyle}><input className="ec-input" value={form.fax} onChange={(e) => set('fax', e.target.value)} style={{ width: 160 }} /></td>
              </tr>
              <tr>
                <th style={thStyle}>이메일</th>
                <td style={tdStyle} colSpan={3}><input className="ec-input" value={form.email} onChange={(e) => set('email', e.target.value)} style={{ width: 320 }} /></td>
              </tr>
              <tr>
                <th style={thStyle}>우편번호</th>
                <td style={tdStyle} colSpan={3}>
                  <input className="ec-input" value={form.zipcode} onChange={(e) => set('zipcode', e.target.value)} style={{ width: 100 }} />
                  <button type="button" className="ec-btn" style={{ marginLeft: 6 }} onClick={openAddrSearch}>주소검색</button>
                </td>
              </tr>
              <tr>
                <th style={thStyle}>주소</th>
                <td style={tdStyle} colSpan={3}>
                  <input className="ec-input" value={form.address} onChange={(e) => set('address', e.target.value)} style={{ width: '60%', marginRight: 6 }} />
                  <input className="ec-input" value={form.addressDetail} onChange={(e) => set('addressDetail', e.target.value)} placeholder="상세주소" style={{ width: '30%' }} />
                </td>
              </tr>
            </tbody>
          </table>

          <div className="flex gap-[6px] mt-[14px]">
            <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
            <button className="ec-btn" onClick={load} disabled={saving}>되돌리기</button>
          </div>
        </>
      )}

      {addrOpen && (
        <div
          onClick={() => setAddrOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 460, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
              <span>주소검색</span>
              <span className="ml-[8px] text-[11.5px] font-normal text-ec-hint">우편번호 API 미연동 · 직접 입력</span>
              <button type="button" className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setAddrOpen(false)}>닫기</button>
            </div>
            <div className="p-[14px] text-[12.5px]">
              <label className="block mb-[8px]">
                <span className="inline-block w-[72px] text-ec-label">우편번호</span>
                <input className="ec-input" value={addrZip} onChange={(e) => setAddrZip(e.target.value)} style={{ width: 120 }} placeholder="06236" />
              </label>
              <label className="block">
                <span className="inline-block w-[72px] text-ec-label">도로명주소</span>
                <input className="ec-input" value={addrRoad} onChange={(e) => setAddrRoad(e.target.value)} style={{ width: 300 }} placeholder="서울특별시 강남구 테헤란로 123" />
              </label>
              <div className="flex gap-[6px] mt-[14px] justify-end">
                <button type="button" className="ec-btn ec-btn-primary" onClick={applyAddr} disabled={!addrZip.trim() && !addrRoad.trim()}>적용</button>
                <button type="button" className="ec-btn" onClick={() => setAddrOpen(false)}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
