import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableSort } from '../../utils/useTableSort'
import type { DriveDocument } from '../../types/api'
import { downloadStoredFile } from '../../utils/fileDownload'
import { useShortcut } from '../../utils/useShortcut'
import EcFileDrop from '../../components/EcFileDrop'
import Modal from '../../components/Modal'

const TREE = [
  { key: 'my', label: 'My Drive', icon: '📁', drive: 'MY' },
  { key: 'shared', label: 'Shared Drive', icon: '👥', drive: 'SHARED' },
  { key: 'important', label: '중요문서함', icon: '⭐', drive: '' },
  { key: 'trash', label: '휴지통', icon: '🗑', drive: '' },
] as const
type TreeKey = (typeof TREE)[number]['key']

const fmtSize = (b: number) => {
  if (b <= 0) return '-'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
const pad2 = (n: number) => String(n).padStart(2, '0')
/** 원본 [최종수정일자] — '2026/10/03 오후 6:34:41'. */
const stampText = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${d.toLocaleTimeString('ko-KR')}`
}

/** [더보기] ⋮ · 우클릭 · 나무 우클릭 메뉴의 한 줄. */
type MenuItem = { label: string; run: () => void; danger?: boolean }
function PopMenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full right-[4px] mt-[2px] z-[41] min-w-[120px] p-[4px] text-left bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
        {items.map((m) => (
          <button key={m.label} type="button" onClick={() => { onClose(); m.run() }}
                  className={`no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer${m.danger ? ' text-ec-danger' : ''}`}>
            {m.label}
          </button>
        ))}
      </div>
    </>
  )
}

/**
 * 그룹웨어 > 업무관리 > ECDrive (이카운트 E077100)
 *
 * 원본은 [드라이브 트리 | 파일 목록] 2분할이고, 목록 컬럼은 실측 기준으로
 * (선택 67) 이름 984 · 최종수정일자 447 · 크기 224 · 중요 89 · 더보기 134 다.
 * 파일에 하는 일은 <b>우클릭 메뉴</b>와 <b>[더보기] ⋮</b> 로 하고, 왼쪽 아래에 [File] 버튼이 있다.
 *
 * <p><b>폴더(2026-10-03 원본에서 QA그룹웨어-폴더를 만들어 재고 휴지통으로 옮김).</b> 나무의 My Drive · Shared Drive 를
 * 우클릭하면 [새 폴더 · 휴지통보기 · 버전이력], [새 폴더] → '새 폴더' 창(새 폴더 이름 · '최대 50자까지 입력 가능합니다.',
 * [저장(F8)][닫기], 비우면 '폴더 이름을 입력하세요.'). 만든 폴더는 나무의 그 드라이브 아래와 목록에 함께 선다 —
 * 📁 이름 · 최종수정일자 '2026/10/03 오후 6:34:41' · 크기 빈칸 · ☆ · ⋮. 폴더 ⋮ 는 새 폴더 · 이동 · 복사 ·
 * 중요문서함에 추가 · 이름변경 · 휴지통으로이동 · 버전이력 · 상세보기, [휴지통으로이동]은 '선택한 폴더/파일을 휴지통으로
 * 이동하시겠습니까? '이름' 가 30일 후 완전히 삭제 됩니다.' 를 묻는다. 하단 [File▲]의 Folder 는 폴더 올리기(파일 고르기 창)다.
 * 우리는 새 폴더 · 들어가기 · 휴지통으로이동만 둔다(이동 · 복사 · 이름변경 · 버전이력 · 상세보기는 아직).
 */
export default function EcDrivePage() {
  const [sel, setSel] = useState<TreeKey>('my')
  /** My Drive · Shared Drive 안에서 열어 둔 폴더. null 이면 최상위. */
  const [folder, setFolder] = useState<DriveDocument | null>(null)
  const [rows, setRows] = useState<DriveDocument[]>([])
  /** 나무에 세울 최상위 폴더(드라이브별). */
  const [treeFolders, setTreeFolders] = useState<DriveDocument[]>([])
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
  /** 나무에서 우클릭한 드라이브 */
  const [treeMenu, setTreeMenu] = useState<TreeKey | null>(null)
  const [treeOpen, setTreeOpen] = useState(true)
  /** '새 폴더' 창 — 어느 드라이브 · 어느 폴더 안에 만드나. */
  const [newFolder, setNewFolder] = useState<{ drive: string; parentId: number | null } | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderErr, setFolderErr] = useState('')

  // Search(F3) — 버튼 라벨이 약속한 단축키
  useShortcut('F3', () => void load())
  useShortcut('F8', () => void saveFolder(), !!newFolder)
  const fileInput = useRef<HTMLInputElement>(null)

  const current = TREE.find((t) => t.key === sel)!
  const inDrive = sel === 'my' || sel === 'shared'
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
   * [크기]는 화면에 '2.4 MB' 로 찍히지만 정렬은 <b>바이트 수</b>로 한다.
   */
  const sort = useTableSort(shownRows, {
    이름: (d) => d.name,
    최종수정일자: (d) => d.updatedAt,
    크기: (d) => d.sizeBytes,
    중요: (d) => (d.important ? '중요' : ''),
  })
  const shown = sort.sorted

  async function load(key: TreeKey = sel, parent: DriveDocument | null = folder) {
    setLoading(true)
    try {
      const params = inDriveKey(key) && parent ? { folder: key, parentId: parent.id } : { folder: key }
      const [r, myAll, sharedAll, myTop, sharedTop] = await Promise.all([
        api.get<DriveDocument[]>('/drive-documents', { params }),
        api.get<DriveDocument[]>('/drive-documents', { params: { folder: 'my', all: true } }),
        api.get<DriveDocument[]>('/drive-documents', { params: { folder: 'shared', all: true } }),
        api.get<DriveDocument[]>('/drive-documents', { params: { folder: 'my' } }),
        api.get<DriveDocument[]>('/drive-documents', { params: { folder: 'shared' } }),
      ])
      setRows(r.data)
      setTreeFolders([...myTop.data, ...sharedTop.data].filter((d) => d.folder))
      const bytes = [...myAll.data, ...sharedAll.data].reduce((s, d) => s + d.sizeBytes, 0)
      setTotalKB(Math.round(bytes / 1024))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  const inDriveKey = (k: TreeKey) => k === 'my' || k === 'shared'

  useEffect(() => { void load(sel, folder) /* eslint-disable-next-line */ }, [sel, folder?.id])

  function open(key: TreeKey, f: DriveDocument | null) {
    setSel(key)
    setFolder(f)
  }

  /** 실제 파일 업로드 — 이름·크기는 서버가 올린 파일에서 가져온다. 폴더 안이면 그 폴더에. */
  async function uploadFile(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    const drive = sel === 'shared' ? 'SHARED' : 'MY'
    setUploading(true)
    try {
      await api.post('/drive-documents/upload', fd, { params: { drive, parentId: inDrive && folder ? folder.id : undefined } })
      void load()
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
      void load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /** 원본 [휴지통으로이동] 의 확인 문구 그대로. */
  function toTrash(d: DriveDocument) {
    if (!window.confirm(`선택한 폴더/파일을 휴지통으로 이동하시겠습니까?\n'${d.name}' 가 30일 후 완전히 삭제 됩니다.`)) return
    void patch(d, { trashed: true })
  }

  async function remove(d: DriveDocument) {
    if (!window.confirm(`[${d.name}] 영구 삭제할까요?`)) return
    try {
      await api.delete(`/drive-documents/${d.id}`)
      void load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  function openNewFolder(drive: string, parentId: number | null) {
    setFolderName('')
    setFolderErr('')
    setNewFolder({ drive, parentId })
  }

  async function saveFolder() {
    if (!newFolder) return
    setFolderErr('')
    if (!folderName.trim()) return setFolderErr('폴더 이름을 입력하세요.')
    try {
      await api.post('/drive-documents/folders', { name: folderName.trim(), drive: newFolder.drive, parentId: newFolder.parentId })
      setNewFolder(null)
      void load()
    } catch (err) { setFolderErr(extractErrorMessage(err)) }
  }

  const rowMenu = (d: DriveDocument): MenuItem[] => d.trashed
    ? [
        { label: '복원', run: () => void patch(d, { trashed: false }) },
        { label: '영구삭제', run: () => void remove(d), danger: true },
      ]
    : d.folder
      ? [
          { label: '새 폴더', run: () => openNewFolder(d.drive, d.id) },
          { label: '휴지통으로이동', run: () => toTrash(d) },
        ]
      : [
          ...(d.fileId ? [{ label: '다운로드', run: () => void download(d) }] : []),
          { label: '휴지통으로이동', run: () => toTrash(d) },
        ]

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">ECDrive</span>
        <div className="ml-auto flex gap-[4px]">
          <input className="ec-input w-[150px]" placeholder="입력 후 [Enter]" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') void load() }} />
          {/* 원본처럼 검색창이 빈 채로 누르면 조건 줄을 편다(조건은 접어 둔다). */}
          <button className="ec-btn ec-btn-primary" onClick={() => (keyword.trim() ? void load() : setCondOpen((v) => !v))}>Search(F3)</button>
          <button className="ec-btn">Option</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="flex gap-[10px] flex-1 min-h-0">
        {/* 드라이브 트리 — My Drive · Shared Drive 아래에 최상위 폴더가 선다 */}
        <div className="w-[200px] border border-ec-line border-solid bg-ec-panel shrink-0 py-[8px] px-0">
          <button type="button" onClick={() => setTreeOpen((v) => !v)}
                  className="no-ec w-full text-left pt-[4px] px-[14px] pb-[8px] text-[11.5px] text-ec-label bg-transparent border-0 cursor-pointer">
            {treeOpen ? '▾' : '▸'} 전체펼치기/접기
          </button>
          {treeOpen && TREE.map((t) => (
            <div key={t.key} className="relative">
              <button type="button" onClick={() => open(t.key, null)}
                      onContextMenu={(e) => { if (t.drive) { e.preventDefault(); setTreeMenu(t.key) } }}
                      className={`no-ec flex items-center gap-[6px] w-full text-left py-[7px] px-[14px] text-[12.5px] border-0 cursor-pointer ${
                        sel === t.key && !folder ? 'bg-ec-blue-wash text-ec-blue font-bold' : 'bg-transparent text-ec-text'}`}>
                <span>{t.icon}</span>{t.label}
              </button>
              {treeMenu === t.key && (
                <PopMenu onClose={() => setTreeMenu(null)} items={[
                  { label: '새 폴더', run: () => openNewFolder(t.drive, null) },
                  { label: '휴지통보기', run: () => open('trash', null) },
                ]} />
              )}
              {t.drive && treeFolders.filter((f) => f.drive === t.drive).map((f) => (
                <button key={f.id} type="button" onClick={() => open(t.key, f)}
                        className={`no-ec flex items-center gap-[6px] w-full text-left py-[5px] pl-[34px] pr-[14px] text-[12px] border-0 cursor-pointer ${
                          folder?.id === f.id ? 'bg-ec-blue-wash text-ec-blue font-bold' : 'bg-transparent text-ec-text'}`}>
                  <span>📁</span>{f.name}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-[12px] py-[8px] px-[14px] border-t border-t-ec-line-soft border-solid text-[11.5px] text-ec-hint">
            내드라이브 사용용량<br /><strong className="text-ec-text">{totalKB.toLocaleString()}KB</strong> 사용됨
          </div>
        </div>

        {/* 파일 목록 */}
        <div className="flex-1 min-w-0 border border-ec-line border-solid bg-ec-panel flex flex-col">
          <div className="py-[8px] px-[12px] border-b border-b-ec-line border-solid text-[12.5px] font-bold flex items-center gap-[4px]">
            {current.icon}
            {folder ? (
              <>
                <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy font-bold" onClick={() => open(sel, null)}>{current.label}</button>
                <span className="text-ec-label">›</span> {folder.name}
              </>
            ) : current.label}
            {/* 숨은 input — 아래 [File] 이 이걸 누른다. */}
            <input ref={fileInput} type="file" className="hidden"
                   onChange={(e) => {
                     const f = e.target.files?.[0]
                     if (f) void uploadFile(f)
                     e.target.value = ''
                   }} />
          </div>
          <div className="mb-[8px]">
            <EcFileDrop
              multiple busy={uploading} disabled={uploading || !inDrive}
              hint={`여기에 파일 놓기 (${folder ? folder.name : sel === 'shared' ? '공유드라이브' : '내드라이브'})`}
              onFiles={(fs) => { for (const f of fs) void uploadFile(f) }}
            />
          </div>

          {/* 원본 ECDrive 조건 차례: <b>이름</b> · 최초작성자 · 최종수정자 — 접어 두고 [Search(F3)] 로 편다 */}
          {condOpen && <div className="flex items-center gap-[6px] my-[8px] mx-0 text-[12.5px] text-ec-label ec-search-conds">
            <span>이름</span>
            <input className="ec-input w-[200px]" value={nameCond} placeholder="파일·폴더 이름"
                   onChange={(e) => setNameCond(e.target.value)} />
            <span className="ml-[8px]">최초작성자</span>
            <select className="ec-input w-[140px]" value={authorCond} onChange={(e) => setAuthorCond(e.target.value)}>
              <option value="">전체</option>
              {uploaders.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>}

          {/* 원본 실측 폭(67-984-447-224-89-134)을 비율로 옮겼다 */}
          <table className="w-full text-left table-fixed" data-ctx-skip="true">
            <thead>
              <tr>
                <th className="w-[3.4%]"></th>
                <th className="w-[50.6%] cursor-pointer" onClick={() => sort.toggle('이름')}>이름 {sort.mark('이름')}</th>
                <th className="w-[23%] cursor-pointer" onClick={() => sort.toggle('최종수정일자')}>최종수정일자 {sort.mark('최종수정일자')}</th>
                <th className="w-[11.5%] cursor-pointer" onClick={() => sort.toggle('크기')}>크기 {sort.mark('크기')}</th>
                <th className="w-[4.6%] cursor-pointer" onClick={() => sort.toggle('중요')}>중요 {sort.mark('중요')}</th>
                {/* 원본 실측: 왼쪽. */}
                <th className="w-[6.9%]">더보기</th>
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
                    {d.folder ? (
                      <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-text"
                              disabled={d.trashed} onClick={() => open(d.drive === 'SHARED' ? 'shared' : 'my', d)}>
                        📁 {d.name}
                      </button>
                    ) : d.fileId ? (
                      <button type="button" onClick={() => void download(d)} title="다운로드"
                              className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-blue underline text-[12px]">
                        📄 {d.name}
                      </button>
                    ) : (
                      <span title="실제 파일 없음(메타데이터만)">📄 {d.name} <span className="text-ec-hint text-[11px]">(파일없음)</span></span>
                    )}
                  </td>
                  <td>{stampText(d.updatedAt)}</td>
                  <td className="text-right">{d.folder ? '' : fmtSize(d.sizeBytes)}</td>
                  <td className={`text-center cursor-pointer ${d.important ? 'text-ec-star' : 'text-ec-off'}`}
                      onClick={() => void patch(d, { important: !d.important })}
                      title={d.important ? '중요 해제' : '중요 표시'}>
                    {d.important ? '★' : '☆'}
                  </td>
                  <td className="relative">
                    <button className="ec-btn ec-btn-sm" onClick={() => setMenuFor(menuFor === d.id ? null : d.id)}>⋮</button>
                    {menuFor === d.id && <PopMenu items={rowMenu(d)} onClose={() => setMenuFor(null)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-auto py-[8px] px-[12px] border-t border-t-ec-line-soft border-solid flex items-center gap-[8px]">
            <button className="ec-btn ec-btn-primary" onClick={() => fileInput.current?.click()} disabled={uploading || !inDrive}>
              {uploading ? '올리는 중…' : 'File'}
            </button>
            {/* 원본 하단은 [File▲](펴면 Folder = 폴더 올리기) 와 안내 한 줄뿐이다(2026-10-03 실측). */}
            <span className="text-[11.5px] text-ec-label">
              ※ 우클릭을 통해 기능을 사용할 수 있습니다.
            </span>
          </div>
        </div>
      </div>

      {/* 원본 '새 폴더' 창 */}
      <Modal error={folderErr} open={!!newFolder} title="새 폴더" width={640} onClose={() => setNewFolder(null)}>
        <div className="text-[12px] mb-[4px]">⊙ 새 폴더 이름</div>
        <div className="text-[12px] text-ec-ink mb-[6px]">최대 50자까지 입력 가능합니다.</div>
        <input className="ec-input w-[260px]" aria-label="새 폴더 이름" maxLength={50} value={folderName}
               onChange={(e) => setFolderName(e.target.value)} />
        <div className="flex gap-[6px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveFolder()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setNewFolder(null)}>닫기</button>
        </div>
      </Modal>
    </div>
  )
}
