import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { driveStamp } from '../driveFormat'

type Detail = {
  id: number; name: string; folder: boolean; location: string; sizeBytes: number
  createdAt: string | null; updatedAt: string | null; firstActor: string | null; lastActor: string | null
}

/**
 * 원본 ECDrive ⋮ [상세보기] 창(2026-10-13 실측) — 머리 '상세보기', 그 아래 이름 한 줄, 판 안에
 * 종류('폴더') · 위치('My Drive/폴더/자기 이름') · 크기('0KB') · 생성일자 · 수정일자 · 최초작업자 · 최종작업자, 아래 [닫기].
 */
export default function DriveDetailModal({ docId, onClose }: { docId: number; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<Detail>(`/drive-documents/${docId}/detail`).then((r) => setD(r.data)).catch((err) => setError(extractErrorMessage(err)))
  }, [docId])

  const rows: [string, string][] = d ? [
    ['종류', d.folder ? '폴더' : '파일'],
    ['위치', d.location],
    ['크기', `${Math.round(d.sizeBytes / 1024).toLocaleString()}KB`],
    ['생성일자', driveStamp(d.createdAt)],
    ['수정일자', driveStamp(d.updatedAt)],
    ['최초작업자', d.firstActor ?? ''],
    ['최종작업자', d.lastActor ?? ''],
  ] : []

  return (
    <Modal open title="상세보기" width={760} error={error} onClose={onClose}>
      <div className="text-[13px] font-bold mb-[10px]">상세보기</div>
      <div className="text-[12px] mb-[10px] break-all">{d?.name}</div>
      <div className="ec-form">
        {rows.map(([k, v]) => (
          <div key={k} className="flex py-[6px] text-[12px]">
            <span className="w-[120px] shrink-0 text-ec-label">{k}</span>
            <span className="break-all">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
