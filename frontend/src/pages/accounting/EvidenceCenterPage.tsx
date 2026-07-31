import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { EvidenceAttachment, EvidenceMethod } from '../../api/types'
import { downloadStoredFile, formatBytes } from '../../utils/fileDownload'

/**
 * 증빙센터 (이카운트 E040730)
 *
 * 전표에 붙은 증빙을 전사 단위로 훑는다. 증빙이 실제로 생기는 곳은 전표 상세의 증빙 패널
 * (판매조회/구매조회)이고, 여기는 그것을 기간·메뉴·작업자·증빙방법·첨부여부로 검색·다운로드·삭제한다.
 *
 * 원본의 '전자서명'·'양식' 조건은 우리에게 해당 기능이 없어 제외했다(값 없는 컨트롤은 만들지 않는다).
 */
const METHODS: { value: EvidenceMethod | ''; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'TAX_INVOICE', label: '세금계산서' },
  { value: 'CARD', label: '신용카드' },
  { value: 'CASH_RECEIPT', label: '현금영수증' },
  { value: 'STATEMENT', label: '거래명세서' },
  { value: 'ETC', label: '기타' },
]
const MENUS = [
  { value: '', label: '전체' },
  { value: 'SALES', label: '판매' },
  { value: 'PURCHASE', label: '구매' },
  { value: 'EXPENSE', label: '비용' },
]
const iso = (d: Date) => d.toISOString().slice(0, 10)

export default function EvidenceCenterPage() {
  const today = iso(new Date())
  const [from, setFrom] = useState(today.slice(0, 5) + '01-01')
  const [to, setTo] = useState(today)
  const [evidenceFrom, setEvidenceFrom] = useState('')
  const [evidenceTo, setEvidenceTo] = useState('')
  const [entityType, setEntityType] = useState('')
  const [method, setMethod] = useState<EvidenceMethod | ''>('')
  const [worker, setWorker] = useState('')
  const [attached, setAttached] = useState<'' | 'true' | 'false'>('')

  const [rows, setRows] = useState<EvidenceAttachment[]>([])
  const [workers, setWorkers] = useState<string[]>([])
  const [checked, setChecked] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.get<EvidenceAttachment[]>('/evidence-attachments', {
        params: {
          from, to,
          evidenceFrom: evidenceFrom || undefined,
          evidenceTo: evidenceTo || undefined,
          entityType: entityType || undefined,
          method: method || undefined,
          worker: worker || undefined,
          attached: attached === '' ? undefined : attached === 'true',
        },
      })
      setRows(r.data)
      setChecked([])
    } catch (err) { setError(extractErrorMessage(err)) } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    api.get<string[]>('/evidence-attachments/workers').then((r) => setWorkers(r.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const summary = useMemo(() => ({
    total: rows.length,
    withFile: rows.filter((r) => r.attached).length,
    bytes: rows.reduce((a, r) => a + (r.fileSize ?? 0), 0),
  }), [rows])

  const toggle = (id: number) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  async function downloadChecked() {
    const targets = rows.filter((r) => checked.includes(r.id) && r.fileId)
    if (targets.length === 0) return alert('첨부파일이 있는 증빙을 선택하세요.')
    for (const t of targets) {
      try { await downloadStoredFile(t.fileId!, t.fileName ?? 'file') }
      catch (err) { alert(extractErrorMessage(err)); return }
    }
    setNotice(`${targets.length}개 파일을 내려받았습니다.`)
    window.setTimeout(() => setNotice(''), 2500)
  }

  async function deleteChecked() {
    if (checked.length === 0) return alert('삭제할 증빙을 선택하세요.')
    if (!window.confirm(`선택한 ${checked.length}건을 삭제할까요? 첨부파일도 함께 지워집니다.`)) return
    try {
      await Promise.all(checked.map((id) => api.delete(`/evidence-attachments/${id}`)))
      setNotice(`${checked.length}건을 삭제했습니다.`)
      window.setTimeout(() => setNotice(''), 2500)
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  const label = (t: string) => <div style={{ color: '#5a626e', marginBottom: 3 }}>{t}</div>

  return (
    <EcListShell
      title="증빙센터"
      actions={[
        { label: '검색(F8)', onClick: load, primary: true },
        { label: '다운로드', onClick: downloadChecked },
        { label: '선택삭제', onClick: deleteChecked },
        { label: 'Excel' },
      ]}
      help={
        <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          전표에 붙은 증빙을 모아 봅니다. 증빙 등록은 판매조회·구매조회의 전표 상세를 펼치면 나오는
          ‘증빙’ 패널에서 합니다. 파일은 최대 10MB 까지 올릴 수 있고, 증빙을 지우면 첨부파일도 함께 지워집니다.
        </p>
      }
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <p style={{ background: '#eaf4ea', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{notice}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 12.5 }}>{label('전표일자')}
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        </label>
        <label style={{ fontSize: 12.5 }}>{label('증빙일자')}
          <input type="date" className="ec-input" value={evidenceFrom} onChange={(e) => setEvidenceFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={evidenceTo} onChange={(e) => setEvidenceTo(e.target.value)} style={{ width: 140 }} />
        </label>
        <label style={{ fontSize: 12.5 }}>{label('메뉴')}
          <select className="ec-input" value={entityType} onChange={(e) => setEntityType(e.target.value)} style={{ width: 100 }}>
            {MENUS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select></label>
        <label style={{ fontSize: 12.5 }}>{label('증빙방법')}
          <select className="ec-input" value={method} onChange={(e) => setMethod(e.target.value as EvidenceMethod | '')} style={{ width: 130 }}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select></label>
        <label style={{ fontSize: 12.5 }}>{label('작업자')}
          <select className="ec-input" value={worker} onChange={(e) => setWorker(e.target.value)} style={{ width: 110 }}>
            <option value="">전체</option>
            {workers.map((w) => <option key={w} value={w}>{w}</option>)}
          </select></label>
        <label style={{ fontSize: 12.5 }}>{label('증빙첨부')}
          <select className="ec-input" value={attached} onChange={(e) => setAttached(e.target.value as '' | 'true' | 'false')} style={{ width: 100 }}>
            <option value="">전체</option>
            <option value="true">첨부 있음</option>
            <option value="false">첨부 없음</option>
          </select></label>
        <button className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {[
          { label: '증빙 건수', value: summary.total.toLocaleString() },
          { label: '첨부파일 있음', value: summary.withFile.toLocaleString() },
          { label: '첨부 용량', value: formatBytes(summary.bytes) },
        ].map((c) => (
          <div key={c.label} style={{ border: '1px solid var(--ec-border)', padding: '8px 14px', minWidth: 130 }}>
            <div style={{ fontSize: 11.5, color: '#8a929c' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}>
            <input type="checkbox" checked={rows.length > 0 && checked.length === rows.length}
                   onChange={(e) => setChecked(e.target.checked ? rows.map((r) => r.id) : [])} />
          </th>
          <th style={{ width: 70 }}>메뉴</th>
          <th style={{ width: 160 }}>전표번호</th>
          <th style={{ width: 110 }}>전표일자</th>
          <th style={{ width: 110 }}>증빙일자</th>
          <th style={{ width: 110 }}>증빙방법</th>
          <th>첨부파일 / 적요</th>
          <th style={{ width: 90, textAlign: 'right' }}>크기</th>
          <th style={{ width: 90 }}>작업자</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조건에 맞는 증빙이 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.includes(r.id)} onChange={() => toggle(r.id)} />
              </td>
              <td>{r.menuLabel}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo ?? `#${r.entityId}`}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docDate ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.evidenceDate ?? ''}</td>
              <td>{r.methodName}</td>
              <td>
                {r.fileId ? (
                  <button onClick={() => downloadStoredFile(r.fileId!, r.fileName ?? 'file')}
                          style={{ background: 'none', border: 0, padding: 0, color: 'var(--ec-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12.5 }}>
                    {r.fileName}
                  </button>
                ) : <span style={{ color: '#9aa1ab' }}>첨부 없음</span>}
                {r.note && <span style={{ color: '#5a626e' }}> · {r.note}</span>}
              </td>
              <td style={{ textAlign: 'right' }}>{formatBytes(r.fileSize)}</td>
              <td style={{ color: '#5a626e' }}>{r.worker ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
