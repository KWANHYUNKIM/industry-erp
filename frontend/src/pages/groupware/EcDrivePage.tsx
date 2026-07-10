import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { DriveDocument } from '../../api/types'

const TREE = [
  { key: 'my', label: 'My Drive', icon: '📁', drive: 'MY' },
  { key: 'shared', label: 'Shared Drive', icon: '👥', drive: 'SHARED' },
  { key: 'important', label: '중요문서함', icon: '⭐', drive: '' },
  { key: 'trash', label: '휴지통', icon: '🗑', drive: '' },
] as const

const fmtSize = (b: number) => {
  if (b <= 0) return '-'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/** 그룹웨어 > 업무관리 > ECDrive — 문서 드라이브 (실연동, 메타데이터 등록) */
export default function EcDrivePage() {
  const [sel, setSel] = useState<(typeof TREE)[number]['key']>('my')
  const [rows, setRows] = useState<DriveDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalKB, setTotalKB] = useState(0)

  const current = TREE.find((t) => t.key === sel)!

  async function load(folder = sel) {
    setLoading(true)
    try {
      const [r, all] = await Promise.all([
        api.get<DriveDocument[]>('/drive-documents', { params: { folder } }),
        api.get<DriveDocument[]>('/drive-documents', { params: { folder: 'my' } }),
      ])
      setRows(r.data)
      const shared = await api.get<DriveDocument[]>('/drive-documents', { params: { folder: 'shared' } })
      const bytes = [...all.data, ...shared.data].reduce((s, d) => s + d.sizeBytes, 0)
      setTotalKB(Math.round(bytes / 1024))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(sel) /* eslint-disable-next-line */ }, [sel])

  async function addDoc() {
    if (sel === 'trash') return
    const name = window.prompt('문서 이름을 입력하세요. (예: 견적서_대신전자.xlsx)', '')
    if (!name || !name.trim()) return
    const sizeStr = window.prompt('파일 크기(KB, 선택):', '0')
    const sizeBytes = Math.round(Number(sizeStr || 0) * 1024)
    const drive = sel === 'shared' ? 'SHARED' : 'MY'
    try {
      await api.post('/drive-documents', { name: name.trim(), drive, sizeBytes: sizeBytes || 0 })
      load(sel)
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function patch(d: DriveDocument, body: Partial<Pick<DriveDocument, 'important' | 'trashed' | 'name'>>) {
    try {
      await api.patch(`/drive-documents/${d.id}`, body)
      load(sel)
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function remove(d: DriveDocument) {
    if (!window.confirm(`[${d.name}] 영구 삭제할까요?`)) return
    try {
      await api.delete(`/drive-documents/${d.id}`)
      load(sel)
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>ECDrive</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="ec-btn" onClick={() => load(sel)}>새로고침</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
        {/* 드라이브 트리 */}
        <div style={{ width: 200, border: '1px solid var(--ec-border)', background: '#fff', flexShrink: 0, padding: '8px 0' }}>
          {TREE.map((t) => (
            <div key={t.key} onClick={() => setSel(t.key)} style={{
              padding: '7px 14px', fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              background: sel === t.key ? 'var(--ec-blue-light)' : undefined,
              color: sel === t.key ? 'var(--ec-blue)' : '#3a4453', fontWeight: sel === t.key ? 700 : 400,
            }}>
              <span>{t.icon}</span>{t.label}
            </div>
          ))}
          <div style={{ marginTop: 12, padding: '8px 14px', borderTop: '1px solid #eef1f5', fontSize: 11.5, color: '#8a929c' }}>
            드라이브 사용용량<br /><strong style={{ color: 'var(--ec-text)' }}>{totalKB.toLocaleString()}KB</strong> 사용됨
          </div>
        </div>

        {/* 파일 목록 */}
        <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--ec-border)', background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--ec-border)', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
            {current.icon} {current.label}
            {sel !== 'trash' && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button className="ec-btn ec-btn-primary" style={{ height: 22 }} onClick={addDoc}>파일 등록</button>
              </div>
            )}
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>이름</th>
                <th style={{ width: 90 }}>업로더</th>
                <th style={{ width: 160 }}>최종수정일자</th>
                <th style={{ width: 90, textAlign: 'right' }}>크기</th>
                <th style={{ width: 160, textAlign: 'center' }}>처리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 30 }}>불러오는 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 30 }}>등록된 데이터가 없습니다.</td></tr>
              ) : rows.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>
                    <span style={{ cursor: 'pointer', marginRight: 4 }} onClick={() => patch(d, { important: !d.important })} title="중요표시">
                      {d.important ? '⭐' : '☆'}
                    </span>
                    📄 {d.name}
                  </td>
                  <td style={{ color: '#5a626e' }}>{d.uploader ?? ''}</td>
                  <td style={{ color: '#5a626e' }}>{d.updatedAt ? d.updatedAt.replace('T', ' ').slice(0, 16) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{fmtSize(d.sizeBytes)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {d.trashed ? (
                      <>
                        <button className="ec-btn" style={{ height: 20, padding: '0 6px' }} onClick={() => patch(d, { trashed: false })}>복원</button>
                        <button className="ec-btn" style={{ height: 20, padding: '0 6px', marginLeft: 3, color: '#c60a2e' }} onClick={() => remove(d)}>영구삭제</button>
                      </>
                    ) : (
                      <button className="ec-btn" style={{ height: 20, padding: '0 6px', color: '#c07a00' }} onClick={() => patch(d, { trashed: true })}>휴지통</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 'auto', padding: '6px 12px', fontSize: 11.5, color: '#9aa1ab', borderTop: '1px solid #eef1f5' }}>
            ※ ☆를 눌러 중요표시, 휴지통 이동/복원이 가능합니다. (파일 메타데이터 관리)
          </div>
        </div>
      </div>
    </div>
  )
}
