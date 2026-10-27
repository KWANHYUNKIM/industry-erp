import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { driveStamp, driveSize } from '../driveFormat'

type HistoryRow = { id: number; at: string | null; action: string; sizeBytes: number; ip: string | null }

/**
 * 원본 ECDrive 파일 ⋮ [버전관리] 창(E077100, 2026-10-20 loginaa 실측 — 화면 폭의 절반 672.5).
 * 열 작업일자 · 크기 · 파일관리 · IP(모두 가운데), 올린 차례의 최근 것이 위. 같은 이름으로 덮어 올릴 때마다 한 줄씩 는다
 * (QA그룹웨어-big.txt 를 두 번 올리니 '9:04:31 · 1.4MB · * 파일관리' / '9:02:31 · 1.4MB · 파일관리'). 지금 판에만 '* '.
 * 줄은 [버전/이력] 의 '파일업로드' 줄과 같은 자료다. 옛 판 [파일관리] 는 옛 바이트를 남기지 않아 글자만 둔다.
 */
export default function DriveVersionModal({ docId, onClose }: { docId: number; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<HistoryRow[]>(`/drive-documents/${docId}/history`)
      .then(({ data }) => setRows(data.filter((h) => h.action === '파일업로드')))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [docId])

  return (
    <Modal open title="버전관리" width={673} error={error} onClose={onClose}>
      <div className="mb-[8px] text-[13px] font-bold">버전관리</div>
      <table className="w-full table-fixed">
        <thead>
          <tr><th>작업일자</th><th>크기</th><th>파일관리</th><th>IP</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={4} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((h, i) => (
            <tr key={h.id}>
              <td className="text-center">{driveStamp(h.at)}</td>
              <td className="text-center">{driveSize(h.sizeBytes)}</td>
              <td className="text-center">{i === 0 ? '* 파일관리' : '파일관리'}</td>
              <td className="text-center">{h.ip}</td>
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

/**
 * 원본 파일 ⋮ [연결내역보기] 창(2026-10-20 실측, 폭 672.5): 열 구분 · 연결경로 · 수정, 아래 [닫기].
 * 이 파일을 첨부한 전표 · 기안서 · 게시글이 줄로 나온다. 우리 ECDrive 파일은 전표에 붙는 길이 없어 늘 빈 목록이다
 * (원본도 드라이브에 바로 올린 파일은 '등록된 데이터가 없습니다.').
 */
export function DriveLinksModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open title="연결내역보기" width={673} onClose={onClose}>
      <div className="mb-[8px] text-[13px] font-bold">연결내역보기</div>
      <table className="w-full table-fixed">
        <thead>
          <tr><th>구분</th><th>연결경로</th><th>수정</th></tr>
        </thead>
        <tbody>
          <tr><td colSpan={3} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
        </tbody>
      </table>
      <div className="flex gap-[6px] mt-[14px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
