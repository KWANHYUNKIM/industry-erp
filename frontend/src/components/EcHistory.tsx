import { useEffect, useState } from 'react'
import Modal from './Modal'
import { api, extractErrorMessage } from '../api/client'

/** 서버 '이력' 한 줄 — GET /change-history?target=&id= 또는 각 자료의 …/{id}/history. */
export interface HistoryRow { seq: number; worker: string | null; workedAt: string; action: string }

/** '2026/10/13 오후 6:42:47' — 원본 작업일시 꼴. */
export function historyTime(iso: string): string {
  const d = iso.slice(0, 10).replaceAll('-', '/')
  const h = Number(iso.slice(11, 13))
  return `${d} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}${iso.slice(13, 19)}`
}

/**
 * 수정 · 조회 창 하단 [H] → '이력' — 원본은 어느 화면이든 같은 창이다
 * (거래처등록 C000009 · 일정관리 E070201 · 공용품관리 E070204, 2026-10-13 loginaa 실측).
 * 창 960, 격자 [No.][작업자ID(대문자, 링크색)][작업일시][상태 신규 · 수정 · 삭제 · 사용중단 · 재사용], 하단 [닫기].
 * 일정 · 공용품은 머리에 '[2026/10/13 -4]'(일자 - 그날 차례)가 붙는다(head). 거래처는 없다.
 *
 * @param url  이력을 읽을 주소(예: /schedule-events/12/history, /change-history?target=PARTNER&id=3)
 */
/**
 * @param numbered 사원(사원등록 · 인사카드등록) 꼴 — 머리 첫 칸이 '순번', 열 폭 44 · 105 · 396 · 396, 순번 가운데
 *                 (2026-10-14 loginaa E090101 · E020603 실측, 머리 '사원코드: 00008').
 */
export function EcHistoryModal({ url, head, last, numbered, onClose }: { url: string; head?: string; last?: boolean; numbered?: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<HistoryRow[]>(url).then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [url])
  return (
    <Modal open title="이력" width={960} onClose={onClose} error={error}>
      {head && <div className="text-[12px] mb-[6px]">{head}</div>}
      {last ? <LastChange rows={rows} /> : (
      <table className="w-full">
        {/* 원본 열 폭 53 · 222 · 444 · 222(창 960, 거래처등록 실측) · 사원은 순번 44 · 105 · 396 · 396 */}
        {numbered
          ? <thead><tr><th className="w-[44px]">순번</th><th className="w-[105px]">작업자ID</th><th className="w-[396px]">작업일시</th><th className="w-[396px]">상태</th></tr></thead>
          : <thead><tr><th className="w-[53px]" /><th className="w-[222px]">작업자ID</th><th className="w-[444px]">작업일시</th><th className="w-[222px]">상태</th></tr></thead>}
        <tbody>
          {rows.map((r) => (
            <tr key={r.seq}>
              <td className={numbered ? 'text-center' : undefined}>{r.seq}</td>
              <td className="text-center text-ec-navy">{(r.worker ?? '').toUpperCase()}</td>
              <td className="text-center">{historyTime(r.workedAt)}</td>
              <td className="text-center">{r.action}</td>
            </tr>
          ))}
          {rows.length === 0 && !error && <tr><td colSpan={4} className="ec-empty">이력이 없습니다.</td></tr>}
        </tbody>
      </table>
      )}
      <div className="flex gap-[6px] mt-[10px]">
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

/**
 * 창고 · 부서 · 프로젝트 [H] — 원본은 격자가 아니라 '이력' 굵은 글 아래 **한 줄** 뿐이다: 마지막으로 고친 때와 사람
 * `2026/10/13  오후 11:53:34 [GUEST]`(머리 없음, 가운데, 12px, 칸 높이 23 · 여백 2.7px — E040102 · E010105 · E010112, 2026-10-13 실측.
 * 창고를 저장할 때마다 그 시각으로 바뀌었다).
 */
function LastChange({ rows }: { rows: HistoryRow[] }) {
  const r = rows[rows.length - 1]
  return (
    <>
      <div className="text-[13px] font-bold mb-[9px]">이력</div>
      <table className="w-full">
        <tbody>
          <tr><td className="text-center py-[2.7px]">{r ? `${historyTime(r.workedAt)} [${(r.worker ?? '').toUpperCase()}]` : ''}</td></tr>
        </tbody>
      </table>
    </>
  )
}

/**
 * 마스터 수정 창 하단 끝의 [H] — 누르면 그 줄의 '이력' 창(원본 거래처등록 수정 창 [저장(F8)] … [닫기] [H]).
 * 신규 창에는 달지 않는다(아직 이력이 없다). target 은 백엔드 서비스가 record 할 때 쓴 글자와 같아야 한다.
 */
export default function EcHistoryButton({ target, id, last, numbered, head }: {
  target: string; id: number | null | undefined; last?: boolean; numbered?: boolean; head?: string
}) {
  const [open, setOpen] = useState(false)
  if (id == null) return null
  return (
    <>
      <button type="button" className="ec-btn" onClick={() => setOpen(true)}>H</button>
      {open && <EcHistoryModal url={`/change-history?target=${encodeURIComponent(target)}&id=${id}`} last={last} numbered={numbered} head={head} onClose={() => setOpen(false)} />}
    </>
  )
}
