import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { ecConfirm } from '../../../components/EcDialog'
import { api, extractErrorMessage } from '../../../api/client'
import { BANK_CODES } from '../../../utils/bankCodes'

export interface PgTransfer {
  id: number
  paymentAgencyId: number
  bankCode: string | null
  bankName: string | null
  accountNo: string
  holder: string | null
  memo1: string | null
  memo2: string | null
  isDefault: boolean
}

const BANK_ITEMS = BANK_CODES.map(([code, name]) => ({ value: code, code, name }))
const blank = { id: null as number | null, bankCode: '', accountNo: '', holder: '', isDefault: false, memo1: '', memo2: '' }

/**
 * 결제대행사등록 [이체정보] '등록' → '이체정보리스트'(원본 830 × 342, 2026-10-21 loginaa E010114 실측).
 * 열 은행코드 · 은행 · 계좌번호 · 예금주명 · 적요1 · 적요2 · 기본(주황 ✓) · 삭제, 아래 [신규(F2)] [닫기].
 * [신규(F2)] → '이체정보등록'(784) 은행명(은행코드 코드도움 — 003 → 기업은행) · 계좌번호 · 예금주명 · 기본이체통장 ☐기본 · 적요1 · 적요2,
 * [저장(F8)] [다시 작성] [닫기]. 빈 채 저장하면 계좌번호 칸만 빨간 테두리. 은행 · 계좌번호를 누르면 '이체정보수정' [저장(F8)] [닫기] [삭제].
 * 줄 [삭제] · 창 [삭제] 는 '삭제하겠습니까?'. 목록의 [이체정보] 칸은 등록해도 '등록' 그대로다.
 */
export default function PgTransferModal({ agencyId, onClose }: { agencyId: number | null; onClose: () => void }) {
  const [rows, setRows] = useState<PgTransfer[]>([])
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [f, setF] = useState(blank)
  const [invalid, setInvalid] = useState(false)
  const [formError, setFormError] = useState('')

  async function load(id: number) {
    try {
      setRows((await api.get<PgTransfer[]>(`/payment-agencies/${id}/transfers`)).data)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  useEffect(() => {
    setError(''); setRows([]); setFormOpen(false)
    if (agencyId != null) void load(agencyId)
  }, [agencyId])

  function openNew() { setF(blank); setInvalid(false); setFormError(''); setFormOpen(true) }
  function openEdit(t: PgTransfer) {
    setF({ id: t.id, bankCode: t.bankCode ?? '', accountNo: t.accountNo, holder: t.holder ?? '', isDefault: t.isDefault,
      memo1: t.memo1 ?? '', memo2: t.memo2 ?? '' })
    setInvalid(false); setFormError(''); setFormOpen(true)
  }

  async function save() {
    if (agencyId == null) return
    if (!f.accountNo.trim()) { setInvalid(true); return }
    const body = { bankCode: f.bankCode || undefined, bankName: BANK_ITEMS.find((b) => b.value === f.bankCode)?.name,
      accountNo: f.accountNo.trim(), holder: f.holder, memo1: f.memo1, memo2: f.memo2, isDefault: f.isDefault }
    try {
      if (f.id) await api.put(`/payment-agencies/transfers/${f.id}`, body)
      else await api.post(`/payment-agencies/${agencyId}/transfers`, body)
      setFormOpen(false)
      await load(agencyId)
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function remove(id: number) {
    if (agencyId == null || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.delete(`/payment-agencies/transfers/${id}`)
      setFormOpen(false)
      await load(agencyId)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <>
      <Modal open={agencyId != null} title="이체정보리스트" width={830} error={error} onClose={onClose}>
        <div onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); openNew() } }}>
          <table className="w-full text-left mb-[8px] [&_th]:font-normal">
            <thead>
              <tr>
                <th>은행코드</th><th>은행</th><th>계좌번호</th><th>예금주명</th><th>적요1</th><th>적요2</th>
                <th className="text-center">기본</th><th className="text-center">삭제</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.bankCode ?? ''}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(t) }}>{t.bankName ?? ''}</a></td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); openEdit(t) }}>{t.accountNo}</a></td>
                  <td>{t.holder ?? ''}</td>
                  <td>{t.memo1 ?? ''}</td>
                  <td>{t.memo2 ?? ''}</td>
                  <td className="text-center">{t.isDefault && <span className="text-ec-warn" aria-label="기본">✓</span>}</td>
                  <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); void remove(t.id) }}>삭제</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[5px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={openNew}>신규(F2)</button>
            <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
          </div>
        </div>
      </Modal>

      <Modal open={formOpen} title={f.id ? '이체정보수정' : '이체정보등록'} width={784} error={formError} onClose={() => setFormOpen(false)}>
        <form onSubmit={(e) => { e.preventDefault(); void save() }}
              onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void save() } }}>
          <ul className="ec-form mb-[8px]">
            <li className="wide">
              <span className="title">은행명</span>
              <div className="form">
                <CodePickerField label="은행명" hideLabel pair fill placeholder="은행명" value={f.bankCode} items={BANK_ITEMS}
                                 onChange={(v) => setF((x) => ({ ...x, bankCode: v }))} />
              </div>
            </li>
            <li className="wide">
              <span className="title">계좌번호</span>
              <div className={`form${invalid ? ' ec-invalid' : ''}`}>
                <input className="ec-input w-full" aria-label="계좌번호" placeholder="계좌번호" maxLength={50} value={f.accountNo}
                       onChange={(e) => { setF((x) => ({ ...x, accountNo: e.target.value })); if (e.target.value) setInvalid(false) }} />
              </div>
            </li>
            <li className="wide">
              <span className="title">예금주명</span>
              <div className="form">
                <input className="ec-input w-full" aria-label="예금주명" placeholder="예금주명" maxLength={50} value={f.holder}
                       onChange={(e) => setF((x) => ({ ...x, holder: e.target.value }))} />
              </div>
            </li>
            <li className="wide">
              <span className="title">기본이체통장</span>
              <div className="form">
                <label className="inline-flex items-center gap-[4px]">
                  <input type="checkbox" aria-label="기본" checked={f.isDefault} onChange={(e) => setF((x) => ({ ...x, isDefault: e.target.checked }))} />기본
                </label>
              </div>
            </li>
            <li className="wide">
              <span className="title">적요1</span>
              <div className="form">
                <input className="ec-input w-full" aria-label="적요1" placeholder="적요1" maxLength={100} value={f.memo1}
                       onChange={(e) => setF((x) => ({ ...x, memo1: e.target.value }))} />
              </div>
            </li>
            <li className="wide">
              <span className="title">적요2</span>
              <div className="form">
                <input className="ec-input w-full" aria-label="적요2" placeholder="적요2" maxLength={100} value={f.memo2}
                       onChange={(e) => setF((x) => ({ ...x, memo2: e.target.value }))} />
              </div>
            </li>
          </ul>
          <div className="flex gap-[5px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            {f.id
              ? <>
                <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
                <button type="button" className="ec-btn" onClick={() => void remove(f.id!)}>삭제</button>
              </>
              : <>
                <button type="button" className="ec-btn" onClick={() => { setF(blank); setInvalid(false) }}>다시 작성</button>
                <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
              </>}
          </div>
        </form>
      </Modal>
    </>
  )
}
