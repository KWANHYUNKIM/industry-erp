import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../api/client'
import type { EvidenceAttachment, EvidenceMethod } from '../api/types'
import { downloadStoredFile, formatBytes } from '../utils/fileDownload'
import EcFileDrop from './EcFileDrop'
import { ymd } from './EcPeriodPicks'

/**
 * 전표 하나에 붙은 증빙(첨부파일)을 보고 등록·삭제하는 재사용 패널.
 * 증빙센터(E040730)가 이 데이터를 전사 단위로 훑는다 — 여기가 데이터가 실제로 생기는 자리다.
 */
const METHODS: { value: EvidenceMethod; label: string }[] = [
  { value: 'TAX_INVOICE', label: '세금계산서' },
  { value: 'CARD', label: '신용카드' },
  { value: 'CASH_RECEIPT', label: '현금영수증' },
  { value: 'STATEMENT', label: '거래명세서' },
  { value: 'ETC', label: '기타' },
]

export default function EvidencePanel({
  entityType, entityId, docNo, docDate,
}: {
  entityType: string
  entityId: number
  docNo?: string | null
  docDate?: string | null
}) {
  const [rows, setRows] = useState<EvidenceAttachment[]>([])
  const [method, setMethod] = useState<EvidenceMethod>('TAX_INVOICE')
  const [evidenceDate, setEvidenceDate] = useState(docDate ?? ymd(new Date()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /*
   * 원본은 첨부 자리에 파일을 끌어다 놓을 수 있다. 예전에는 ref 로 input 을 직접 읽었는데,
   * 끌어다 놓은 파일은 input 에 들어가지 않아 그 방식으로는 잡을 수가 없다. 상태로 든다.
   */
  const [file, setFile] = useState<File | null>(null)

  async function load() {
    setError('')
    try {
      const r = await api.get<EvidenceAttachment[]>('/evidence-attachments', { params: { entityType, entityId } })
      setRows(r.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [entityType, entityId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    setError(''); setBusy(true)
    try {
      const fd = new FormData()
      if (file) fd.append('file', file)
      await api.post('/evidence-attachments', fd, {
        params: {
          entityType, entityId,
          docNo: docNo ?? undefined,
          docDate: docDate ?? undefined,
          evidenceDate: evidenceDate || undefined,
          method,
          note: note.trim() || undefined,
        },
      })
      setFile(null)
      setNote('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) } finally { setBusy(false) }
  }

  async function remove(e: EvidenceAttachment) {
    if (!window.confirm('이 증빙을 삭제할까요? 첨부파일도 함께 지워집니다.')) return
    try { await api.delete(`/evidence-attachments/${e.id}`); load() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fbfcfd', padding: 10, marginTop: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ec-blue-dark)', marginBottom: 6 }}>
        증빙 {rows.length > 0 && <span style={{ color: '#5a626e', fontWeight: 400 }}>({rows.length}건)</span>}
      </div>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '4px 8px', fontSize: 12, borderRadius: 3, marginBottom: 6 }}>{error}</p>}

      {rows.length > 0 && (
        <table className="w-full text-left" style={{ marginBottom: 8 }}>
          <thead><tr>
            <th style={{ width: 100 }}>증빙방법</th>
            <th style={{ width: 110 }}>증빙일자</th>
            <th>첨부파일</th>
            <th style={{ width: 90, textAlign: 'right' }}>크기</th>
            <th style={{ width: 80 }}>작업자</th>
            <th style={{ width: 60, textAlign: 'center' }}>삭제</th>
          </tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{e.methodName}</td>
                <td style={{ fontFamily: 'monospace' }}>{e.evidenceDate ?? '-'}</td>
                <td>
                  {e.fileId ? (
                    <button onClick={() => downloadStoredFile(e.fileId!, e.fileName ?? 'file')}
                            style={{ background: 'none', border: 0, padding: 0, color: 'var(--ec-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12.5 }}>
                      {e.fileName}
                    </button>
                  ) : <span style={{ color: '#9aa1ab' }}>첨부 없음</span>}
                  {e.note && <span style={{ color: '#5a626e' }}> · {e.note}</span>}
                </td>
                <td style={{ textAlign: 'right' }}>{formatBytes(e.fileSize)}</td>
                <td style={{ color: '#5a626e' }}>{e.worker ?? ''}</td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => remove(e)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
        <select className="ec-input" value={method} onChange={(ev) => setMethod(ev.target.value as EvidenceMethod)} style={{ width: 120 }}>
          {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input type="date" className="ec-input" value={evidenceDate} onChange={(ev) => setEvidenceDate(ev.target.value)} style={{ width: 140 }} />
        <EcFileDrop
          hint="여기에 파일 놓기" disabled={busy}
          onFiles={(fs) => setFile(fs[0] ?? null)}
        >
          {file && (
            <span style={{ fontSize: 12, color: 'var(--ec-blue-dark)' }}>
              {file.name}
              <span onClick={() => setFile(null)} style={{ cursor: 'pointer', marginLeft: 6, fontWeight: 700 }}>×</span>
            </span>
          )}
        </EcFileDrop>
        <input className="ec-input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="적요(선택)" style={{ width: 180 }} />
        <button className="ec-btn ec-btn-primary" onClick={add} disabled={busy}>{busy ? '등록 중…' : '증빙 등록'}</button>
        <span style={{ fontSize: 11.5, color: '#8a929c' }}>※ 파일 없이 증빙방법만 기록할 수도 있습니다(최대 10MB).</span>
      </div>
    </div>
  )
}
