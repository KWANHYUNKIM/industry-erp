import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableSort } from '../../utils/useTableSort'
import type { DriveDocument } from '../../types/api'
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
  const [condOpen, setCondOpen] = useState(false)
  /** 원본 ECDrive 조건 차례는 [이름] · [최초작성자] · [최종수정자] 다. 올린 사람이 곧 최초작성자다. */
  const [authorCond, setAuthorCond] = useState('')
  /** 열려 있는 [더보기] ⋮ 메뉴의 문서 id */
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [treeOpen, setTreeOpen] = useState(true)

  // Search(F3) — 버튼 라벨이 약속한 단축키
  useShortcut('F3', () => load(sel))
  const fileInput = useRef<HTMLInputElement>(null)

  const current = TREE.find((t) => t.key === sel)!
  /**
   * 원본 [최초작성자] 후보. <b>지금 받아 온 줄에 실제로 있는 이름</b>만 낸다 —
   * 사용자 마스터를 부르면 이 화면에 한 건도 없는 사람까지 목록에 선다.
   */
  const uploaders = [...new Set(rows.map((d) => d.uploader).filter((v): v is string => !!v))].sort()
  /* 원본 ECDrive 조건 차례: <b>이름</b> · 최초작성자 · 최종수정자. */
  const shownRows = rows
    .filter((d) => !nameCond || d.name.includes(nameCond))
    .filter((d) => !authorCond || (d.uploader ?? '') === authorCond)
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
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">ECDrive</span>
        <div className="ml-auto flex gap-[4px]">
          <input className="ec-input" placeholder="입력 후 [Enter]" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') load(sel) }} style={{ width: 150 }} />
          {/* 원본처럼 검색창이 빈 채로 누르면 조건 줄을 편다(조건은 접어 둔다). */}
          <button className="ec-btn ec-btn-primary" onClick={() => (keyword.trim() ? load(sel) : setCondOpen((v) => !v))}>Search(F3)</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="flex gap-[10px] flex-1 min-h-0">
        {/* 드라이브 트리 */}
        <div className="w-[200px] border border-ec-line border-solid bg-white shrink-0 py-[8px] px-0">
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
              color: sel === t.key ? 'var(--ec-blue)' : 'var(--ec-text)', fontWeight: sel === t.key ? 700 : 400,
            }}>
              <span>{t.icon}</span>{t.label}
            </div>
          ))}
          <div className="mt-[12px] py-[8px] px-[14px] border-t border-t-ec-line-soft border-solid text-[11.5px] text-ec-hint">
            내드라이브 사용용량<br /><strong className="text-ec-text">{totalKB.toLocaleString()}KB</strong> 사용됨
          </div>
        </div>

        {/* 파일 목록 */}
        <div className="flex-1 min-w-0 border border-ec-line border-solid bg-white flex flex-col">
          <div className="py-[8px] px-[12px] border-b border-b-ec-line border-solid text-[12.5px] font-bold flex items-center">
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
          <div className="mb-[8px]">
            <EcFileDrop
              multiple busy={uploading} disabled={uploading}
              hint={`여기에 파일 놓기 (${sel === 'shared' ? '공유드라이브' : '내드라이브'})`}
              onFiles={(fs) => { for (const f of fs) void uploadFile(f) }}
            />
          </div>

          {/* 원본 ECDrive 조건 차례: <b>이름</b> · 최초작성자 · 최종수정자 — 접어 두고 [Search(F3)] 로 편다 */}
          {condOpen && <div className="flex items-center gap-[6px] my-[8px] mx-0 text-[12.5px] text-ec-label ec-search-conds">
            <span>이름</span>
            <input className="ec-input" value={nameCond} placeholder="파일·폴더 이름"
                   onChange={(e) => setNameCond(e.target.value)} style={{ width: 200 }} />
            {/*
              원본 [최초작성자]. uploader 는 응답에도 프론트 타입에도 진작 있었는데
              <b>줄에 마우스를 올려야 보이는 툴팁</b>으로만 쓰고 있었다 — 그걸로 거를 수가 없었다.
            */}
            <span className="ml-[8px]">최초작성자</span>
            <select className="ec-input" value={authorCond} style={{ width: 140 }}
                    onChange={(e) => setAuthorCond(e.target.value)}>
              <option value="">전체</option>
              {uploaders.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>}

          {/* 원본 실측 폭(67-984-447-224-89-134)을 비율로 옮겼다 */}
          <table className="w-full text-left" data-ctx-skip="true">
            <colgroup>
              {['3.4%', '50.6%', '23%', '11.5%', '4.6%', '6.9%'].map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th className="cursor-pointer" onClick={() => sort.toggle('이름')}>이름 {sort.mark('이름')}</th>
                <th className="cursor-pointer" onClick={() => sort.toggle('최종수정일자')}>최종수정일자 {sort.mark('최종수정일자')}</th>
                <th className="cursor-pointer" onClick={() => sort.toggle('크기')}>크기 {sort.mark('크기')}</th>
                <th className="cursor-pointer" onClick={() => sort.toggle('중요')}>중요 {sort.mark('중요')}</th>
                {/* 원본 실측: 왼쪽. */}
                <th>더보기</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center text-ec-ink">불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((d, i) => (
                <tr key={d.id} title={d.uploader ? `올린 사람: ${d.uploader}` : undefined}
                    onContextMenu={(e) => { e.preventDefault(); setMenuFor(d.id) }}>
                  <td className="text-center bg-ec-stripe text-ec-hint">{i + 1}</td>
                  <td>
                    {d.fileId ? (
                      <button onClick={() => download(d)} title="다운로드"
                              style={{ background: 'none', border: 0, padding: 0, color: 'var(--ec-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>
                        📄 {d.name}
                      </button>
                    ) : (
                      <span title="실제 파일 없음(메타데이터만)">📄 {d.name} <span className="text-ec-hint text-[11px]">(파일없음)</span></span>
                    )}
                  </td>
                  <td className="text-center">{d.updatedAt ? d.updatedAt.replace('T', ' ').slice(0, 16) : ''}</td>
                  <td className="text-right">{fmtSize(d.sizeBytes)}</td>
                  <td style={{ textAlign: 'center', cursor: 'pointer', color: d.important ? '#f0a500' : 'var(--ec-text-off)' }}
                      onClick={() => patch(d, { important: !d.important })}
                      title={d.important ? '중요 해제' : '중요 표시'}>
                    {d.important ? '★' : '☆'}
                  </td>
                  <td className="relative">
                    <button className="ec-btn ec-btn-sm" onClick={() => setMenuFor(menuFor === d.id ? null : d.id)}>⋮</button>
                    {menuFor === d.id && (
                      <>
                        <div onClick={() => setMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                        <div style={{
                          position: 'absolute', top: '100%', right: 4, marginTop: 2, zIndex: 41,
                          background: '#fff', border: '1px solid var(--ec-line)', borderRadius: 3,
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
                                             color: m.danger ? 'var(--ec-danger)' : undefined }}>
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
          <div className="mt-auto py-[8px] px-[12px] border-t border-t-ec-line-soft border-solid flex items-center gap-[8px]">
            <button className="ec-btn ec-btn-primary" onClick={() => fileInput.current?.click()} disabled={uploading || sel === 'trash'}>
              {uploading ? '올리는 중…' : 'File'}
            </button>
            {/* 원본 하단은 [File▲](펴면 Folder) 와 안내 한 줄뿐이다(2026-10-03 실측). [항목만 등록]은 우리만 있던 것이라 뺐다. */}
            <span className="text-[11.5px] text-ec-label">
              ※ 우클릭을 통해 기능을 사용할 수 있습니다.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
