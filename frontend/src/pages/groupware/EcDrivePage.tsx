import { useEffect, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableSort } from '../../utils/useTableSort'
import type { DriveDocument } from '../../types/api'
import { downloadStoredFile } from '../../utils/fileDownload'
import { useShortcut } from '../../utils/useShortcut'
import EcFileDrop from '../../components/EcFileDrop'
import Modal from '../../components/Modal'
import DriveFolderTree, { type DrivePlace } from '../../features/drive/components/DriveFolderTree'
import DriveFolderPicker from '../../features/drive/components/DriveFolderPicker'
import DriveHistoryModal from '../../features/drive/components/DriveHistoryModal'
import DriveVersionModal, { DriveLinksModal } from '../../features/drive/components/DriveVersionModal'
import DriveDetailModal from '../../features/drive/components/DriveDetailModal'
import { driveSize, driveStamp } from '../../features/drive/driveFormat'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcIcon from '../../components/ui/EcIcon'

const TREE = [
  { key: 'my', label: 'My Drive', icon: '📁', drive: 'MY' },
  { key: 'shared', label: 'Shared Drive', icon: '👥', drive: 'SHARED' },
  { key: 'important', label: '중요문서함', icon: '⭐', drive: '' },
  { key: 'trash', label: '휴지통', icon: '🗑', drive: '' },
] as const
type TreeKey = (typeof TREE)[number]['key']

const fmtSize = driveSize
const stampText = driveStamp

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
 *
 * <p><b>2026-10-12 폴더 ⋮ 다시 잼.</b> 새 폴더 · 이동 · 복사 · 중요문서함에 추가(별이 서면 '중요문서함에서제거') ·
 * 이름변경 · 휴지통으로이동 · 버전/이력 · 상세보기. [이름변경] → '폴더/공유드라이브 이름변경' 창(폴더/드라이브 이름,
 * 지금 이름이 들어 있다, 비우면 '이름을 입력 바랍니다.'), 저장하면 그 폴더로 들어간다. [이동] · [복사] → 'ECDrive' 창
 * (나무 + 폴더만 든 목록, [이동|복사][닫기]) — 지금 있는 곳은 '동일 폴더로는 이동/복사가 불가합니다.', 자기 자신 ·
 * Shared Drive 맨 위는 '해당 위치로 이동/복사가 불가합니다.', 되면 고른 곳으로 들어간다. 같은 이름 폴더가 있는 곳으로
 * 옮기면 하나로 합쳐진다. 나무는 여러 단계(만든 차례), 목록은 최종수정일자 최근 순.
 * 휴지통으로이동 문구 아래에 '※ 해당 파일이 첨부된 전표/기안서/게시글에서 연결이 취소됩니다. …' 가 붙는다.
 * <p><b>2026-10-13 버전/이력 · 상세보기.</b> 버전/이력 창은 폴더면 안에 든 것까지, 나무의 My Drive 우클릭이면
 * 드라이브 전체의 이력(생성 · 이름변경 · 이동 · 복사(T))을 최근 것부터 낸다. 나무의 폴더 우클릭은 ⋮ 에서
 * [중요문서함에 추가]만 빠진 차례다.
 */
export default function EcDrivePage() {
  const [sel, setSel] = useState<TreeKey>('my')
  /** My Drive · Shared Drive 안에서 열어 둔 폴더. null 이면 최상위. */
  const [folder, setFolder] = useState<DriveDocument | null>(null)
  const [rows, setRows] = useState<DriveDocument[]>([])
  /** 나무에 세울 폴더 전부(드라이브별, 여러 단계). */
  const [treeFolders, setTreeFolders] = useState<DriveDocument[]>([])
  /** '폴더/공유드라이브 이름변경' 창 */
  const [renaming, setRenaming] = useState<DriveDocument | null>(null)
  const [renameText, setRenameText] = useState('')
  const [renameErr, setRenameErr] = useState('')
  /** [이동] · [복사] 'ECDrive' 창 */
  const [transfer, setTransfer] = useState<{ mode: 'move' | 'copy'; doc: DriveDocument } | null>(null)
  /** 하단 [File▲] 펼침 — File(파일 올리기) · Folder(폴더 올리기) */
  const [fileMenu, setFileMenu] = useState(false)
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
  const [treeMenu, setTreeMenu] = useState<'MY' | 'SHARED' | null>(null)
  /** 나무에서 우클릭한 폴더 id */
  const [treeFolderMenu, setTreeFolderMenu] = useState<number | null>(null)
  /** [버전/이력] 창 — 폴더/파일 id(없으면 드라이브 전체) */
  const [history, setHistory] = useState<{ docId: number | null; drive: 'MY' | 'SHARED' } | null>(null)
  /** [상세보기] 창 */
  const [detailId, setDetailId] = useState<number | null>(null)
  /** 파일 ⋮ [버전관리] 창 */
  const [versionId, setVersionId] = useState<number | null>(null)
  /** 파일 ⋮ [연결내역보기] 창 */
  const [linksOpen, setLinksOpen] = useState(false)
  const [treeOpen, setTreeOpen] = useState(true)
  /** '새 폴더' 창 — 어느 드라이브 · 어느 폴더 안에 만드나. */
  const [newFolder, setNewFolder] = useState<{ drive: string; parentId: number | null } | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderErr, setFolderErr] = useState('')

  // Search(F3) — 버튼 라벨이 약속한 단축키
  useShortcut('F3', () => void load())
  useShortcut('F8', () => void saveFolder(), !!newFolder)
  useShortcut('F8', () => void saveRename(), !!renaming)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)

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
      const [r, myAll, sharedAll] = await Promise.all([
        api.get<DriveDocument[]>('/drive-documents', { params }),
        api.get<DriveDocument[]>('/drive-documents', { params: { folder: 'my', all: true } }),
        api.get<DriveDocument[]>('/drive-documents', { params: { folder: 'shared', all: true } }),
      ])
      setRows(r.data)
      setTreeFolders([...myAll.data, ...sharedAll.data].filter((d) => d.folder))
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
  /** 드라이브 안의 한 곳으로 들어간다(나무 · 이동/복사 · 이름변경 뒤). */
  function goPlace(p: DrivePlace) {
    open(p.drive === 'SHARED' ? 'shared' : 'my', p.parentId != null ? treeFolders.find((f) => f.id === p.parentId) ?? ({ id: p.parentId } as DriveDocument) : null)
  }
  /** 머리줄 'My Drive › 폴더 › 폴더' — 맨 위부터 지금 폴더까지. */
  const trail: DriveDocument[] = []
  for (let f = folder ? treeFolders.find((t) => t.id === folder.id) ?? folder : null; f; f = f.parentId != null ? treeFolders.find((t) => t.id === f!.parentId) ?? null : null) trail.unshift(f)

  /**
   * 파일 하나를 올린다. 같은 곳에 같은 이름의 파일이 있으면 서버가 409 — 원본처럼 덮어 쓸지 묻고(2026-10-20 실측 문구),
   * 한 번 답하면 '※ 이후 충돌하는 모든 파일들도 동일하게 적용' 되므로 같은 묶음의 다음 겹침은 다시 묻지 않는다.
   */
  async function sendFile(file: File, drive: string, parentId: number | null | undefined, ask: { overwrite?: boolean }) {
    const post = (overwrite: boolean) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/drive-documents/upload', fd, { params: { drive, parentId: parentId ?? undefined, overwrite: overwrite || undefined } })
    }
    try {
      await post(false)
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status !== 409) throw err
      if (ask.overwrite === undefined) {
        ask.overwrite = await ecConfirm('동일한 이름의 파일이 존재합니다.\n덮어 씌우겠습니까?\n※ 이후 충돌하는 모든 파일들도 동일하게 적용 됩니다.')
      }
      if (ask.overwrite) await post(true)
    }
  }

  /** 실제 파일 업로드 — 이름·크기는 서버가 올린 파일에서 가져온다. 폴더 안이면 그 폴더에. */
  async function uploadFiles(files: File[]) {
    const drive = sel === 'shared' ? 'SHARED' : 'MY'
    const ask: { overwrite?: boolean } = {}
    setUploading(true)
    try {
      for (const f of files) await sendFile(f, drive, inDrive && folder ? folder.id : undefined, ask)
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    } finally {
      setUploading(false)
      void load()
    }
  }

  async function download(d: DriveDocument) {
    if (!d.fileId) return ecAlert('이 항목에는 실제 파일이 없습니다(메타데이터만 등록됨).')
    try { await downloadStoredFile(d.fileId, d.name) }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  async function patch(d: DriveDocument, body: Partial<Pick<DriveDocument, 'important' | 'trashed' | 'name'>>) {
    try {
      await api.patch(`/drive-documents/${d.id}`, body)
      void load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  /** 원본 [휴지통으로이동] 의 확인 문구 그대로(2026-10-12 다시 잼 — 아래 ※ 줄까지). */
  async function toTrash(d: DriveDocument) {
    if (!(await ecConfirm(`선택한 폴더/파일을 휴지통으로 이동하시겠습니까?\n'${d.name}' 가 30일 후 완전히 삭제 됩니다.\n\n※ 해당 파일이 첨부된 전표/기안서/게시글에서 연결이 취소됩니다. 파일 복원 시에는 재연결됩니다.`))) return
    void patch(d, { trashed: true })
  }

  async function remove(d: DriveDocument) {
    if (!(await ecConfirm(`[${d.name}] 영구 삭제할까요?`))) return
    try {
      await api.delete(`/drive-documents/${d.id}`)
      void load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
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

  function openRename(d: DriveDocument) {
    setRenameText(d.name)
    setRenameErr('')
    setRenaming(d)
  }

  /** 원본 '폴더/공유드라이브 이름변경' [저장(F8)] — 폴더면 저장한 뒤 그 폴더로 들어간다. */
  async function saveRename() {
    if (!renaming) return
    setRenameErr('')
    if (!renameText.trim()) return setRenameErr('이름을 입력 바랍니다.')
    try {
      const { data } = await api.patch<DriveDocument>(`/drive-documents/${renaming.id}`, { name: renameText.trim() })
      setRenaming(null)
      if (data.folder) open(data.drive === 'SHARED' ? 'shared' : 'my', data)
      else void load()
    } catch (err) { setRenameErr(extractErrorMessage(err)) }
  }

  /** 'ECDrive' 창에서 고른 곳으로 [이동] · [복사] — 되면 그곳으로 들어간다. */
  async function doTransfer(p: DrivePlace) {
    if (!transfer) return
    try {
      await api.post(`/drive-documents/${transfer.doc.id}/${transfer.mode}`, { drive: p.drive, parentId: p.parentId })
      setTransfer(null)
      const { data } = await api.get<DriveDocument[]>('/drive-documents', { params: { folder: p.drive === 'SHARED' ? 'shared' : 'my', all: true } })
      const dest = p.parentId != null ? data.find((f) => f.id === p.parentId) ?? null : null
      if (sel === (p.drive === 'SHARED' ? 'shared' : 'my') && (folder?.id ?? null) === p.parentId) void load()
      else open(p.drive === 'SHARED' ? 'shared' : 'my', dest)
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  /** 하단 [File▲] › Folder — 고른 폴더를 안의 폴더 차례 그대로 지금 있는 곳에 만들고 파일을 올린다. */
  async function uploadDir(files: FileList) {
    const drive = sel === 'shared' ? 'SHARED' : 'MY'
    const made = new Map<string, number | null>([['', inDrive && folder ? folder.id : null]])
    const ask: { overwrite?: boolean } = {}
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        const parts = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).split('/')
        let path = ''
        for (const name of parts.slice(0, -1)) {
          const next = path ? `${path}/${name}` : name
          if (!made.has(next)) {
            const { data } = await api.post<DriveDocument>('/drive-documents/folders', { name, drive, parentId: made.get(path) })
            made.set(next, data.id)
          }
          path = next
        }
        await sendFile(f, drive, made.get(path), ask)
      }
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    } finally {
      setUploading(false)
      void load()
    }
  }

  const tailMenu = (d: DriveDocument): MenuItem[] => [
    { label: '버전/이력', run: () => setHistory({ docId: d.id, drive: d.drive === 'SHARED' ? 'SHARED' : 'MY' }) },
    { label: '상세보기', run: () => setDetailId(d.id) },
  ]

  /**
   * 원본 ⋮ — 폴더도 파일도 같은 차례. 파일은 [이름변경] 다음에 [다운로드] 가 끼인다(2026-10-14 파일 하나 올려 잼:
   * 이동 · 복사 · 중요문서함에 추가 · 이름변경 · 다운로드 · 버전관리 · 휴지통으로이동 · 버전/이력 · 상세보기 · 연결내역보기).
   * 버전관리 · 연결내역보기는 파일에만 있다(2026-10-20 실측 — 폴더 ⋮ 는 상세보기로 끝난다).
   */
  const commonMenu = (d: DriveDocument): MenuItem[] => [
    { label: '이동', run: () => setTransfer({ mode: 'move', doc: d }) },
    { label: '복사', run: () => setTransfer({ mode: 'copy', doc: d }) },
    d.important
      ? { label: '중요문서함에서제거', run: () => void patch(d, { important: false }) }
      : { label: '중요문서함에 추가', run: () => void patch(d, { important: true }) },
    { label: '이름변경', run: () => openRename(d) },
    ...(!d.folder && d.fileId ? [{ label: '다운로드', run: () => void download(d) }] : []),
    ...(!d.folder ? [{ label: '버전관리', run: () => setVersionId(d.id) }] : []),
    { label: '휴지통으로이동', run: () => toTrash(d) },
    ...tailMenu(d),
    ...(!d.folder ? [{ label: '연결내역보기', run: () => setLinksOpen(true) }] : []),
  ]

  /** 나무의 폴더 우클릭 — ⋮ 에서 [중요문서함에 추가]만 빠진다(2026-10-13 실측). */
  const treeFolderItems = (d: DriveDocument): MenuItem[] => [
    { label: '새 폴더', run: () => openNewFolder(d.drive, d.id) },
    { label: '이동', run: () => setTransfer({ mode: 'move', doc: d }) },
    { label: '복사', run: () => setTransfer({ mode: 'copy', doc: d }) },
    { label: '이름변경', run: () => openRename(d) },
    { label: '휴지통으로이동', run: () => toTrash(d) },
    ...tailMenu(d),
  ]

  const rowMenu = (d: DriveDocument): MenuItem[] => d.trashed
    ? [
        { label: '복원', run: () => void patch(d, { trashed: false }) },
        { label: '영구삭제', run: () => void remove(d), danger: true },
      ]
    : d.folder
      ? [
          { label: '새 폴더', run: () => openNewFolder(d.drive, d.id) },
          ...commonMenu(d),
        ]
      : commonMenu(d)

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
          {treeOpen && (
            <DriveFolderTree
              folders={treeFolders.filter((f) => !f.trashed)}
              place={inDrive ? { drive: sel === 'shared' ? 'SHARED' : 'MY', parentId: folder?.id ?? null } : null}
              onOpen={goPlace}
              onContextMenu={(drive) => setTreeMenu(drive)}
              extra={(drive) => treeMenu === drive && (
                <PopMenu onClose={() => setTreeMenu(null)} items={[
                  { label: '새 폴더', run: () => openNewFolder(drive, null) },
                  { label: '휴지통보기', run: () => open('trash', null) },
                  { label: '버전/이력', run: () => setHistory({ docId: null, drive }) },
                ]} />
              )}
              onFolderContextMenu={(f) => setTreeFolderMenu(f.id)}
              folderExtra={(f) => treeFolderMenu === f.id && (
                <PopMenu onClose={() => setTreeFolderMenu(null)} items={treeFolderItems(f)} />
              )}
            />
          )}
          {/* 원본: Shared Drive 아래 구분선 뒤에 중요문서함 · 휴지통 */}
          {treeOpen && <div className="my-[6px] border-t border-t-ec-line-soft border-solid" />}
          {treeOpen && TREE.filter((t) => !t.drive).map((t) => (
            <button key={t.key} type="button" onClick={() => open(t.key, null)}
                    className={`no-ec flex items-center gap-[6px] w-full text-left py-[7px] px-[14px] text-[12.5px] border-0 cursor-pointer ${
                      sel === t.key ? 'bg-ec-blue-wash text-ec-blue font-bold' : 'bg-transparent text-ec-text'}`}>
              <span>{t.icon}</span>{t.label}
            </button>
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
                {trail.map((f, i) => (
                  <span key={f.id}>
                    <span className="text-ec-label">›</span>{' '}
                    {i < trail.length - 1
                      ? <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy font-bold" onClick={() => open(sel, f)}>{f.name}</button>
                      : f.name}
                  </span>
                ))}
              </>
            ) : current.label}
            {/* 숨은 input — 아래 [File] 이 이걸 누른다. */}
            <input ref={fileInput} type="file" className="hidden"
                   onChange={(e) => {
                     const f = e.target.files?.[0]
                     if (f) void uploadFiles([f])
                     e.target.value = ''
                   }} />
            {/* 원본 [File▲] › Folder — 폴더 올리기 */}
            <input ref={dirInput} type="file" className="hidden" multiple
                   {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                   onChange={(e) => {
                     if (e.target.files?.length) void uploadDir(e.target.files)
                     e.target.value = ''
                   }} />
          </div>
          <div className="mb-[8px]">
            <EcFileDrop
              multiple busy={uploading} disabled={uploading || !inDrive}
              hint={`여기에 파일 놓기 (${folder ? folder.name : sel === 'shared' ? '공유드라이브' : '내드라이브'})`}
              onFiles={(fs) => void uploadFiles(Array.from(fs))}
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
            <div className="relative ec-btn-group">
              <button className="ec-btn ec-btn-primary" onClick={() => fileInput.current?.click()} disabled={uploading || !inDrive}>
                {uploading ? '올리는 중…' : 'File'}
              </button>
              <button className="ec-btn ec-btn-primary ec-btn-arrow" aria-label="File 펼치기" disabled={uploading || !inDrive}
                      onClick={() => setFileMenu((v) => !v)}><EcIcon name="caret-up" size={10} glyph="▴" /></button>
              {fileMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFileMenu(false)} />
                  <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[100px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
                    <button type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                            onClick={() => { setFileMenu(false); fileInput.current?.click() }}>File</button>
                    <button type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                            onClick={() => { setFileMenu(false); dirInput.current?.click() }}>Folder</button>
                  </div>
                </>
              )}
            </div>
            {/* 원본 하단은 [File▲](펴면 Folder = 폴더 올리기) 와 안내 한 줄뿐이다(2026-10-03 실측). */}
            <span className="text-[11.5px] text-ec-label">
              ※ 우클릭을 통해 기능을 사용할 수 있습니다.
            </span>
          </div>
        </div>
      </div>

      {/* 원본 '폴더/공유드라이브 이름변경' 창 */}
      <Modal error={renameErr} open={!!renaming} title="폴더/공유드라이브 이름변경" width={640} onClose={() => setRenaming(null)}>
        <div className="text-[13px] font-bold mb-[10px]">폴더/공유드라이브 이름변경</div>
        <div className="text-[12px] mb-[4px]">⊙ 폴더/드라이브 이름</div>
        <div className="text-[12px] text-ec-ink mb-[6px]">최대 50자까지 입력 가능합니다.</div>
        <input className="ec-input w-[260px]" aria-label="폴더/드라이브 이름" maxLength={renaming?.folder ? 50 : 200} value={renameText} autoFocus
               onFocus={(e) => e.target.select()} onChange={(e) => setRenameText(e.target.value)} />
        <div className="flex gap-[6px] mt-[14px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveRename()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setRenaming(null)}>닫기</button>
        </div>
      </Modal>

      {transfer && (
        <DriveFolderPicker mode={transfer.mode} doc={transfer.doc} folders={treeFolders.filter((f) => !f.trashed)}
                           onPick={(p) => void doTransfer(p)} onClose={() => setTransfer(null)} />
      )}

      {history && <DriveHistoryModal docId={history.docId} drive={history.drive} onClose={() => setHistory(null)} />}
      {detailId != null && <DriveDetailModal docId={detailId} onClose={() => setDetailId(null)} />}
      {versionId != null && <DriveVersionModal docId={versionId} onClose={() => setVersionId(null)} />}
      {linksOpen && <DriveLinksModal onClose={() => setLinksOpen(false)} />}

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
