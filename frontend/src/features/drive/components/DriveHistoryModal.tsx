import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { driveStamp, driveSize } from '../driveFormat'

type HistoryRow = {
  id: number; at: string | null; action: string; name: string; sizeBytes: number; folder: boolean
  actor: string | null; ip: string | null; location: string | null
}

/**
 * 원본 ECDrive [버전/이력] 창(E077100, 2026-10-13 loginaa 실측).
 * 열: 작업일자 · 행위 · 이름 · 크기 · 작업자 · 파일관리 · IP · 위치, 위 오른쪽 [Search(F3)], 아래 [닫기].
 * 폴더면 안에 든 것까지, 드라이브 머리(My Drive)면 그 드라이브 전체의 이력이다. 휴지통에 든 것은 빠진다.
 */
export default function DriveHistoryModal({ docId, drive, onClose }: {
  /** 폴더/파일 id. 없으면 drive 전체(나무의 My Drive · Shared Drive 우클릭). */
  docId: number | null
  drive: 'MY' | 'SHARED'
  onClose: () => void
}) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const { data } = docId != null
        ? await api.get<HistoryRow[]>(`/drive-documents/${docId}/history`)
        : await api.get<HistoryRow[]>('/drive-documents/history', { params: { drive } })
      setRows(data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [docId, drive])

  return (
    <Modal open title="버전/이력" width={960} error={error} onClose={onClose}>
      <div className="flex items-center mb-[8px]">
        <span className="text-[13px] font-bold">버전/이력</span>
        <button type="button" className="ec-btn ec-btn-primary ml-auto" onClick={() => void load()}>Search(F3)</button>
      </div>
      <table className="w-full table-fixed">
        <thead>
          <tr>
            <th className="w-[119px]">작업일자</th>
            <th className="w-[200px]">행위</th>
            <th className="w-[200px]">이름</th>
            <th className="w-[100px]">크기</th>
            <th className="w-[120px]">작업자</th>
            <th className="w-[120px]">파일관리</th>
            <th className="w-[120px]">IP</th>
            <th className="w-[200px]">위치</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((h) => (
            <tr key={h.id}>
              <td>{driveStamp(h.at)}</td>
              <td>{h.action}</td>
              <td className="truncate" title={h.name}>{h.name}</td>
              <td className="text-right">{h.folder ? '' : driveSize(h.sizeBytes)}</td>
              <td>{h.actor}</td>
              <td></td>
              <td>{h.ip}</td>
              <td className="truncate" title={h.location ?? ''}>{h.location}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
