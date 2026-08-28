import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableSort } from '../../utils/useTableSort'
import type { DriveDocument } from '../../api/types'
import { downloadStoredFile } from '../../utils/fileDownload'
import { useShortcut } from '../../utils/useShortcut'
import EcFileDrop from '../../components/EcFileDrop'

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

/**
 * 그룹웨어 > 업무관리 > ECDrive (이카운트 E077100)
 *
 * 원본은 [드라이브 트리 | 파일 목록] 2분할이고, 목록 컬럼은 실측 기준으로
 * (선택 67) 이름 984 · 최종수정일자 447 · 크기 224 · 중요 89 · 더보기 134 다.
 * 파일에 하는 일은 <b>우클릭 메뉴</b>와 <b>[더보기] ⋮</b> 로 하고, 왼쪽 아래에 [File] 버튼이 있다.
 *
 * 우리는 행마다 [휴지통]·[복원]·[영구삭제] 버튼을 늘어놓고 중요표시를 이름 칸에 붙여 뒀었다.
 * 원본에 없는 '업로더' 칸도 있었다 — 그 정보는 행 툴팁으로 옮겼다.
 */
export default function EcDrivePage() {
  const [sel, setSel] = useState<(typeof TREE)[number]['key']>('my')
  const [rows, setRows] = useState<DriveDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalKB, setTotalKB] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [nameCond, setNameCond] = useState('')
  /** 열려 있는 [더보기] ⋮ 메뉴의 문서 id */
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [treeOpen, setTreeOpen] = useState(true)

  // Search(F3) — 버튼 라벨이 약속한 단축키
  useShortcut('F3', () => load(sel))
  const fileInput = useRef<HTMLInputElement>(null)

  const current = TREE.find((t) => t.key === sel)!
  /* 원본 ECDrive 조건 차례: <b>이름</b> · 최초작성자 · 최종수정자. */
  const shownRows = rows
    .filter((d) => !nameCond || d.name.includes(nameCond))
    .filter((d) => !keyword || d.name.includes(keyword))

  /*
   * 사본 ECDrive 는 <b>이름·최종수정일자·크기·중요</b> 네 칸에 정렬 표시를 단다.
   * 우리는 표시조차 없었다 — 파일이 쌓이면 <b>이름으로도 날짜로도 못 세운다.</b>
   * [크기]는 화면에 '2.4 MB' 로 찍히지만 정렬은 <b>바이트 수</b>로 한다 — 찍힌 글자로
   * 견주면 900 KB 가 2 MB 보다 커진다.
   */
  const sort = useTableSort(shownRows, {
    이름: (d) => d.name,
    최종수정일자: (d) => d.updatedAt,
    크기: (d) => d.sizeBytes,
    중요: (d) => (d.important ? '중요' : ''),
  })
  const shown = sort.sorted

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

  /** 실제 파일 업로드 — 이름·크기는 서버가 올린 파일에서 가져온다. */
  async function uploadFile(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const drive = sel === 'shared' ? 'SHARED' : 'MY'
    setUploading(true)
    try {
      await api.post('/drive-documents/upload', fd, { params: { drive } })
      load(sel)
    } catch (err) {
      alert(extractErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function download(d: DriveDocument) {
    if (!d.fileId) return alert('이 항목에는 실제 파일이 없습니다(메타데이터만 등록됨).')
    try { await downloadStoredFile(d.fileId, d.name) }
    catch (err) { alert(extractErrorMessage(err)) }
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
          <input className="ec-input" placeholder="입력 후 [Enter]" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') load(sel) }} style={{ width: 150 }} />
          <button className="ec-btn ec-btn-primary" onClick={() => load(sel)}>Search(F3)</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
        {/* 드라이브 트리 */}
        <div style={{ width: 200, border: '1px solid var(--ec-border)', background: '#fff', flexShrink: 0, padding: '8px 0' }}>
          {/* 누르는 자리는 button 으로 둔다 — div 로 두면 키보드로 닿지 않는다. */}
          <button type="button" onClick={() => setTreeOpen((v) => !v)}
                  style={{ padding: '4px 14px 8px', fontSize: 11.5, color: 'var(--ec-label)',
                    cursor: 'pointer', background: 'none', border: 0, textAlign: 'left', width: '100%' }}>
            {treeOpen ? '▾' : '▸'} 전체펼치기/접기
          </button>
          {treeOpen && TREE.map((t) => (
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
            {/* 숨은 input 은 그대로 둔다 — 위쪽 버튼이 이걸 누른다. 드롭 자리는 목록 위에 따로 있다. */}
            <input
              ref={fileInput}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadFile(f)
                e.target.value = ''
              }}
            />
          </div>
          {/*
            원본 드라이브는 파일을 끌어다 놓아 올린다. 우리는 버튼 하나뿐이라
            탐색기·메일에서 끌어 온 파일이 갈 곳이 없었다.
            여러 개를 놓으면 하나씩 다 올린다 — 이 자리는 그게 자연스럽다.
          */}
          <div style={{ marginBottom: 8 }}>
            <EcFileDrop
              multiple busy={uploading} disabled={uploading}
              hint={`여기에 파일 놓기 (${sel === 'shared' ? '공유드라이브' : '내드라이브'})`}
              onFiles={(fs) => { for (const f of fs) void uploadFile(f) }}
            />
          </div>

          {/* 원본 ECDrive 조건 차례: <b>이름</b> · 최초작성자 · 최종수정자 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0', fontSize: 12.5, color: '#5a626e' }}>
            <span>이름</span>
            <input className="ec-input" value={nameCond} placeholder="파일·폴더 이름"
                   onChange={(e) => setNameCond(e.target.value)} style={{ width: 200 }} />
          </div>

          {/* 원본 실측 폭(67-984-447-224-89-134)을 비율로 옮겼다 */}
          <table className="w-full text-left">
            <colgroup>
              {['3.4%', '50.6%', '23%', '11.5%', '4.6%', '6.9%'].map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('이름')}>이름 {sort.mark('이름')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('최종수정일자')}>최종수정일자 {sort.mark('최종수정일자')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('크기')}>크기 {sort.mark('크기')}</th>
                <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('중요')}>중요 {sort.mark('중요')}</th>
                <th>더보기</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((d, i) => (
                <tr key={d.id} title={d.uploader ? `올린 사람: ${d.uploader}` : undefined}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td>
                    {d.fileId ? (
                      <button onClick={() => download(d)} title="다운로드"
                              style={{ background: 'none', border: 0, padding: 0, color: 'var(--ec-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>
                        📄 {d.name}
                      </button>
                    ) : (
                      <span title="실제 파일 없음(메타데이터만)">📄 {d.name} <span style={{ color: '#9aa1ab', fontSize: 11 }}>(파일없음)</span></span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>{d.updatedAt ? d.updatedAt.replace('T', ' ').slice(0, 16) : ''}</td>
                  <td style={{ textAlign: 'right' }}>{fmtSize(d.sizeBytes)}</td>
                  <td style={{ textAlign: 'center', cursor: 'pointer', color: d.important ? '#f0a500' : '#c8ced6' }}
                      onClick={() => patch(d, { important: !d.important })}
                      title={d.important ? '중요 해제' : '중요 표시'}>
                    {d.important ? '★' : '☆'}
                  </td>
                  <td style={{ textAlign: 'center', position: 'relative' }}>
                    <button className="ec-btn ec-btn-sm" onClick={() => setMenuFor(menuFor === d.id ? null : d.id)}>⋮</button>
                    {menuFor === d.id && (
                      <>
                        <div onClick={() => setMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                        <div style={{
                          position: 'absolute', top: '100%', right: 4, marginTop: 2, zIndex: 41,
                          background: '#fff', border: '1px solid #c9d1da', borderRadius: 3,
                          boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 110, padding: 4, textAlign: 'left',
                        }}>
                          {(d.trashed
                            ? [
                                { label: '복원', run: () => patch(d, { trashed: false }), danger: false },
                                { label: '영구삭제', run: () => remove(d), danger: true },
                              ]
                            : [
                                ...(d.fileId ? [{ label: '다운로드', run: () => download(d), danger: false }] : []),
                                { label: '휴지통으로', run: () => patch(d, { trashed: true }), danger: true },
                              ]
                          ).map((m) => (
                            <button key={m.label} onClick={() => { setMenuFor(null); void m.run() }}
                                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                                             fontSize: 12, background: 'none', border: 0, cursor: 'pointer',
                                             color: m.danger ? '#c60a2e' : undefined }}>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 'auto', padding: '8px 12px', borderTop: '1px solid #eef1f5', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="ec-btn ec-btn-primary" onClick={() => fileInput.current?.click()} disabled={uploading || sel === 'trash'}>
              {uploading ? '올리는 중…' : 'File'}
            </button>
            <button className="ec-btn" onClick={addDoc} disabled={sel === 'trash'}>항목만 등록</button>
            <span style={{ fontSize: 11.5, color: 'var(--ec-label)' }}>
              ※ [더보기] ⋮ 로 기능을 사용할 수 있습니다. 업로드 상한 10MB.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
