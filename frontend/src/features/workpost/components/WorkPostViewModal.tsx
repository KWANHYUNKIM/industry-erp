import Modal from '../../../components/Modal'
import { downloadStoredFile, formatBytes } from '../../../utils/fileDownload'
import EcRichBody from '../../../components/EcRichBody'
import EcKanban, { type KanbanCard } from '../../../components/EcKanban'
import { MenuButton } from '../../../components/EcSlipShell'
import { requireSelection, ecAlert } from '../../../components/EcDialog'
import { slipHistoryTime } from '../../sliphistory/SlipHistoryModal'
import { stampText, BOARD_CFG, MINUTE_TEAMS, type PostBoardCode, type BoardCfg } from '../boardConfig'
import type { WorkPost } from '../../../types/api'
import type { Dispatch, SetStateAction } from 'react'
import type { BoardLabel } from '../../board/labels'

/** 게시글 View 창과 그 [이력] · [최종이력] 창 — WorkPage 에서 몸통 그대로 옮겼다. */
export default function WorkPostViewModal({
  board,
  boardPick,
  cardView,
  cardsFolded,
  cfg,
  dateNoOf,
  error,
  histFor,
  lastFor,
  meetingPosts,
  moveStage,
  numbered,
  openCopy,
  openEdit,
  openReply,
  openTeams,
  openView,
  printPost,
  removeOne,
  setBoardPick,
  setCardView,
  setCardsFolded,
  setConfirmIds,
  setHistFor,
  setInfo,
  setLastFor,
  setOpenTeams,
  setViewing,
  signLabels,
  signPosts,
  statusOf,
  title,
  toCard,
  viewing,
}: {
  board: PostBoardCode
  boardPick: Set<number>
  cardView: WorkPost | null
  cardsFolded: boolean
  cfg: BoardCfg
  dateNoOf: (r: WorkPost) => string
  error: string
  histFor: WorkPost | null
  lastFor: WorkPost | null
  meetingPosts: WorkPost[]
  moveStage: (id: number, stage: string) => Promise<void>
  numbered: WorkPost[]
  openCopy: (r: WorkPost) => void
  openEdit: (r: WorkPost) => void
  openReply: (r: WorkPost) => void
  openTeams: Set<number>
  openView: (r: WorkPost) => void
  printPost: (r: WorkPost) => void
  removeOne: (id: number) => void
  setBoardPick: Dispatch<SetStateAction<Set<number>>>
  setCardView: Dispatch<SetStateAction<WorkPost | null>>
  setCardsFolded: Dispatch<SetStateAction<boolean>>
  setConfirmIds: Dispatch<SetStateAction<number[] | null>>
  setHistFor: Dispatch<SetStateAction<WorkPost | null>>
  setInfo: Dispatch<SetStateAction<string>>
  setLastFor: Dispatch<SetStateAction<WorkPost | null>>
  setOpenTeams: Dispatch<SetStateAction<Set<number>>>
  setViewing: Dispatch<SetStateAction<WorkPost | null>>
  signLabels: BoardLabel[]
  signPosts: WorkPost[]
  statusOf: (r: WorkPost) => string
  title: string
  toCard: (r: WorkPost, col: string, lane?: string | undefined, colors?: BoardLabel[]) => KanbanCard
  viewing: WorkPost | null
}) {
  return (
    <>
      {/* 원본 '공지사항View' 창 */}
      <Modal error={error} open={!!viewing} title={`${title}View`} onClose={() => setViewing(null)} width={780}>
        {viewing && (
          <>
            <div className="bg-ec-page rounded-ec px-[12px] py-[8px] text-[12px] font-bold text-ec-ink">
              {viewing.postNo} | {viewing.title} | {viewing.writerName ?? viewing.writer} | {stampText(viewing.createdAt, viewing.postDate)}
            </div>
            <ul className="ec-form border-0 mb-[6px]">
              <li className="wide"><div className="title">일자-No.</div><div className="form text-ec-navy">{dateNoOf(viewing)}</div></li>
              <li className="wide">
                <div className="title">첨부</div>
                <div className="form">
                  {viewing.attachmentId && (
                    <span className="cursor-pointer text-ec-navy"
                          onClick={() => void downloadStoredFile(viewing.attachmentId!, viewing.attachmentName ?? '첨부')}>
                      {viewing.attachmentName} ({formatBytes(viewing.attachmentSize ?? 0)})
                    </span>
                  )}
                </div>
              </li>
            </ul>
            <EcRichBody content={viewing.content} className="text-[12px] text-ec-ink min-h-[120px] px-[12px]" />
            {/*
              원본 '📅 프로젝트 진행현황 칸반View' 본문 판(2026-10-13): 열 = 이 글에 [칸반연결] 한 간판제작 글의 [프로젝트] + 건수,
              줄 = 간판제작 진행상태, 카드 = 그 글(라벨 칩 + 제목). 판 아래 신규 ▲ · 선택삭제 · 카드접기 · 더보기(신규 ▲ 판은 못 잼 — 뺌).
              카드를 다른 줄로 끌어 놓으면 그 간판제작 글의 진행상태가 바뀐다.
            */}
            {board === 'PROJECT_KANBAN' && (() => {
              const linked = signPosts.filter((x) => x.kanbanPostId === viewing.id && x.parentId == null).sort((a, b) => a.postNo - b.postNo)
              const projects = [...new Set(linked.map((x) => x.project ?? ''))]
              const signStages = BOARD_CFG.SIGN.stages ?? []
              return (
                <div className="mt-[8px]">
                  {linked.length === 0 ? <div className="ec-empty">등록된 데이터가 없습니다.</div> : (
                    <EcKanban
                      columns={projects.map((p) => ({ key: p, name: p || '(프로젝트 없음)' }))}
                      lanes={signStages.map((st) => ({ key: st, name: st }))}
                      cards={linked.map((x) => toCard(x, x.project ?? '', x.stage ?? signStages[0], signLabels))}
                      selected={boardPick} hideSub={cardsFolded}
                      onToggle={(ids, on) => setBoardPick((p) => { const n = new Set(p); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n })}
                      onOpen={(c) => setCardView(signPosts.find((x) => x.id === c.id) ?? null)}
                      onMove={(c, _col, lane) => { if (lane && lane !== c.lane) void moveStage(c.id, lane) }}
                      onDelete={(c) => setConfirmIds([c.id])} />
                  )}
                  {/* 원본 View 판 아래(2026-10-22 실측): [신규 ▲](🛠️간판제작 프로젝트관리) [선택삭제] [카드접기] [더보기](알림 '더이상 표시할 데이터가 없습니다.') */}
                  <div className="flex gap-[6px] mt-[6px]">
                    <MenuButton label="신규" className="ec-btn ec-btn-sm" up
                                items={[{ label: '🛠️간판제작 프로젝트관리', onClick: () => window.open('/groupware/sign-board', '_blank') }]} />
                    <button type="button" className="ec-btn ec-btn-sm"
                            onClick={() => { if (requireSelection(boardPick.size)) setConfirmIds([...boardPick]) }}>선택삭제</button>
                    <button type="button" className="ec-btn ec-btn-sm" onClick={() => setCardsFolded((v) => !v)}>{cardsFolded ? '카드펼치기' : '카드접기'}</button>
                    <button type="button" className="ec-btn ec-btn-sm" onClick={() => void ecAlert('더이상 표시할 데이터가 없습니다.')}>더보기</button>
                  </div>
                  {cardView && (
                    <div className="bg-ec-page rounded-ec px-[12px] py-[8px] mt-[6px] text-[12px] text-ec-ink">
                      <div className="font-bold mb-[4px]">{cardView.postNo} | {cardView.title} | {cardView.writerName ?? cardView.writer} | {cardView.stage ?? ''}</div>
                      <EcRichBody content={cardView.content} />
                      <button type="button" className="ec-btn ec-btn-sm mt-[6px]" onClick={() => setCardView(null)}>닫기</button>
                    </div>
                  )}
                </div>
              )
            })()}
            {/* 원본 통합회의록View: 부서마다 '경영지원팀(클릭)' 판 — 누르면 이은 팀별회의록 글의 제목 · 본문이 펴진다. */}
            {cfg.minutes && (
              <div className="grid grid-cols-2 gap-[8px] mt-[8px]">
                {MINUTE_TEAMS.map((t, i) => {
                  const m = meetingPosts.find((x) => x.id === viewing.meetingLinks?.[i])
                  const on = openTeams.has(i)
                  return (
                    <div key={t} className="bg-ec-page rounded-ec">
                      <button type="button" className="no-ec w-full text-left bg-transparent border-0 px-[12px] py-[8px] cursor-pointer font-bold text-[12px] text-ec-ink"
                              onClick={() => setOpenTeams((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })}>
                        {t}(클릭)
                      </button>
                      {on && (
                        <div className="px-[12px] pb-[10px] text-[12px] text-ec-ink">
                          {m ? (
                            <>
                              <div className="text-[14px] font-bold mb-[6px]">{m.title}</div>
                              <EcRichBody content={m.content} />
                            </>
                          ) : <div className="ec-empty">등록된 데이터가 없습니다.</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex gap-[6px] mt-[10px]">
              {/* 원본 View 맨 앞 [적용양식 ▾]: 칸반 글은 '칸반연결', 그 밖은 '기본(수정불가)'(2026-10-22 실측) — 메뉴 ✓ 현재 양식 · 기본(수정불가) · 신규양식추가. */}
              <MenuButton label={board === 'PROJECT_KANBAN' ? '칸반연결' : '기본(수정불가)'} className="ec-btn" up
                          items={[...(board === 'PROJECT_KANBAN' ? [{ label: '✓ 칸반연결' }, { label: '기본(수정불가)' }] : [{ label: '✓ 기본(수정불가)' }]),
                            { label: '신규양식추가', onClick: () => setInfo('신규양식추가는 지원하지 않습니다(양식 하나).') }]} />
              {/* 원본 View [답글(F8)] — 같은 입력 창, 제목은 원글 그대로 · 본문 빈칸. 저장하면 원글 제목 뒤 '[n]'. */}
              <button className="ec-btn" onClick={() => openReply(viewing)}>답글(F8)</button>
              <button className="ec-btn" onClick={() => openCopy(viewing)}>복사</button>
              <button className="ec-btn" onClick={() => openEdit(viewing)}>수정</button>
              <button className="ec-btn" onClick={() => removeOne(viewing.id)}>삭제</button>
              <button className="ec-btn" onClick={() => setViewing(null)}>닫기</button>
              <button className="ec-btn" onClick={() => printPost(viewing)}>인쇄</button>
              <button className="ec-btn" onClick={() => setHistFor(viewing)}>H</button>
              <button className="ec-btn" onClick={() => setLastFor(viewing)}>최종이력</button>
              {/* 원본 View 끝 [이전][다음](2026-10-22 실측): 목록 순서에서 아래 · 위 글로 옮겨 연다 — [이전] 은 아래(번호 작은) 글. 없으면 알림 '등록되지 않았거나 삭제된 게시글입니다.' 뒤 View 가 닫힌다. */}
              {([['이전', 1], ['다음', -1]] as const).map(([name, step]) => (
                <button key={name} className="ec-btn" onClick={() => {
                  const i = numbered.findIndex((x) => x.id === viewing.id)
                  const t = i < 0 ? undefined : numbered[i + step]
                  if (t) openView(t)
                  else { setViewing(null); void ecAlert('등록되지 않았거나 삭제된 게시글입니다.') }
                }}>{name}</button>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* 원본 View [H] '이력' 창(2026-10-22 공지사항 실측): 머리 '[20260709-14]'(게시일 + 번호) · 거래이력(작업자ID · 작업일시 · 전표상태 · 진행상태 · 행위) · 보안이력 · 발송이력. */}
      <Modal error={error} open={!!histFor} title="이력" width={960} onClose={() => setHistFor(null)}>
        {histFor && (() => {
          const empty = (n: number) => <tr><td colSpan={n} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          const evs: { at: string; act: string }[] = []
          if (histFor.createdAt) evs.push({ at: histFor.createdAt, act: '신규' })
          if (histFor.updatedAt && histFor.updatedAt.slice(0, 19) !== (histFor.createdAt ?? '').slice(0, 19)) evs.push({ at: histFor.updatedAt, act: '수정' })
          return (
            <>
              <div className="text-[12px] mb-[6px]">{`[${histFor.postDate.replace(/-/g, '')}-${histFor.postNo}]`}</div>
              <div className="text-[13px] font-bold mb-[6px]">거래이력</div>
              <table className="w-full">
                <thead><tr><th className="w-[61px]" /><th>작업자ID</th><th>작업일시</th><th>전표상태</th><th>진행상태</th><th>행위</th></tr></thead>
                <tbody>
                  {evs.length === 0 && empty(6)}
                  {evs.map((e, i) => (
                    <tr key={i}>
                      <td className="text-center">{i + 1}</td><td className="text-center text-ec-navy">{(histFor.writer ?? '').toUpperCase()}</td>
                      <td className="text-center">{slipHistoryTime(e.at)}</td><td className="text-center">확인</td>
                      <td className="text-center">{statusOf(histFor)}</td><td className="text-center">{e.act}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {['보안이력', '발송이력'].map((t) => (
                <div key={t}>
                  <div className="text-[13px] font-bold mt-[12px] mb-[6px]">{t}</div>
                  <table className="w-full"><thead><tr><th className="w-[61px]" /><th>작업자ID</th><th>작업일시</th><th>행위</th></tr></thead><tbody>{empty(4)}</tbody></table>
                </div>
              ))}
            </>
          )
        })()}
        <div className="flex gap-[6px] mt-[10px]"><button type="button" className="ec-btn" onClick={() => setHistFor(null)}>닫기</button></div>
      </Modal>

      {/* 원본 View [최종이력] 창: 한 줄 '2026/07/09 (목) 오후 2:33:11 [작업자]' + [닫기]. */}
      <Modal error={error} open={!!lastFor} title="최종이력" width={700} onClose={() => setLastFor(null)}>
        {lastFor && (
          <div className="text-center text-[12px] py-[4px]">
            {slipHistoryTime(lastFor.updatedAt ?? lastFor.createdAt ?? `${lastFor.postDate}T00:00:00`)} [{(lastFor.writer ?? '').toUpperCase()}]
          </div>
        )}
        <div className="flex gap-[6px] mt-[10px]"><button type="button" className="ec-btn" onClick={() => setLastFor(null)}>닫기</button></div>
      </Modal>
    </>
  )
}
