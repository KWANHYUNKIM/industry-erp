import { useState } from 'react'
import type { DriveDocument } from '../../../types/api'
import Modal from '../../../components/Modal'
import DriveFolderTree, { type DrivePlace } from './DriveFolderTree'
import EcIcon from '../../../components/ui/EcIcon'

const pad2 = (n: number) => String(n).padStart(2, '0')
const stampText = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${d.toLocaleTimeString('ko-KR')}`
}

/**
 * 원본 ECDrive ⋮ [이동] · [복사] 가 띄우는 'ECDrive' 창(2026-10-12 loginaa 실측).
 * 왼쪽은 My Drive · Shared Drive 와 그 아래 폴더 나무, 오른쪽은 고른 곳 바로 안의 <b>폴더만</b>
 * (이름 · 최종수정일자 · 크기 · 중요) — 줄을 두 번 누르면 그 폴더로 들어간다. 아래는 [이동|복사][닫기].
 * 창은 옮길 항목이 지금 들어 있는 곳에서 열린다. 받아 주는 곳인지는 서버가 원본 문구로 막는다.
 */
export default function DriveFolderPicker({
  mode, doc, folders, onPick, onClose,
}: {
  mode: 'move' | 'copy'
  doc: DriveDocument
  /** 휴지통 밖의 모든 폴더(My Drive · Shared Drive) */
  folders: DriveDocument[]
  onPick: (place: DrivePlace) => void
  onClose: () => void
}) {
  const [place, setPlace] = useState<DrivePlace>({ drive: doc.drive === 'SHARED' ? 'SHARED' : 'MY', parentId: doc.parentId })
  const inside = folders
    .filter((f) => f.drive === place.drive && f.parentId === place.parentId)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const here = place.parentId != null ? folders.find((f) => f.id === place.parentId) : null
  const label = mode === 'move' ? '이동' : '복사'

  return (
    <Modal open title="ECDrive" width={890} onClose={onClose}>
      <div className="text-[14px] font-bold mb-[8px]">ECDrive</div>
      <div className="flex gap-[10px] min-h-[300px]">
        <div className="w-[220px] shrink-0 border border-ec-line border-solid rounded-ec py-[6px]">
          <DriveFolderTree folders={folders} place={place} onOpen={setPlace} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] mb-[6px]">
            {place.drive === 'SHARED' ? 'Shared Drive' : 'My Drive'}
            {here && <> <span className="text-ec-label">›</span> {here.name}</>}
          </div>
          <table className="w-full table-fixed">
            <thead>
              <tr><th className="w-[46%]">이름</th><th className="w-[30%]">최종수정일자</th><th className="w-[12%]">크기</th><th className="w-[12%]">중요</th></tr>
            </thead>
            <tbody>
              {inside.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : inside.map((f) => (
                <tr key={f.id} className="cursor-pointer" onDoubleClick={() => setPlace({ drive: place.drive, parentId: f.id })}>
                  <td>📁 {f.name}</td>
                  <td>{stampText(f.updatedAt)}</td>
                  <td></td>
                  <td className={`text-center ${f.important ? 'text-ec-star' : 'text-ec-off'}`}>{f.important ? <EcIcon name="star" glyph="★" /> : <EcIcon name="star-outline" glyph="☆" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => onPick(place)}>{label}</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
