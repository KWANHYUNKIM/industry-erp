import Modal from '../../../components/Modal'
import UserPickModal from '../../schedule/components/UserPickModal'
import { BOARD_CFG, stampText, type Form } from '../boardConfig'
import type { WorkPost } from '../../../types/api'
import type { Dispatch, SetStateAction } from 'react'

/** 게시판 화면의 부속 창 — 집계조건 [항목추가] · 팀별회의록 게시판검색창 · 삭제 [알림] · 사용자검색 · 조회자 현황. WorkPage 에서 몸통 그대로 옮겼다. */
export default function WorkPostSubModals({
  agg,
  aggPick,
  confirmIds,
  doDelete,
  error,
  form,
  linkPickFor,
  linkTab,
  meetingPosts,
  pickFor,
  readers,
  set,
  setAgg,
  setAggPick,
  setConfirmIds,
  setLinkPickFor,
  setLinkTab,
  setPickFor,
  setReaders,
}: {
  agg: string[]
  aggPick: number | null
  confirmIds: number[] | null
  doDelete: () => Promise<void>
  error: string
  form: Form
  linkPickFor: number | null
  linkTab: string
  meetingPosts: WorkPost[]
  pickFor: "forwardTo" | "ccTo" | null
  readers: { readers: { name: string; firstReadAt: string; lastReadAt: string; }[]; nonReaders: string[]; } | null
  set: <K extends keyof Form>(k: K, v: Form[K]) => void
  setAgg: Dispatch<SetStateAction<string[]>>
  setAggPick: Dispatch<SetStateAction<number | null>>
  setConfirmIds: Dispatch<SetStateAction<number[] | null>>
  setLinkPickFor: Dispatch<SetStateAction<number | null>>
  setLinkTab: Dispatch<SetStateAction<string>>
  setPickFor: Dispatch<SetStateAction<"forwardTo" | "ccTo" | null>>
  setReaders: Dispatch<SetStateAction<{ readers: { name: string; firstReadAt: string; lastReadAt: string; }[]; nonReaders: string[]; } | null>>
}) {
  return (
    <>
      {/*
        원본 '팀별회의록 게시판검색창'(2026-10-13): 부서구분 알약 [전체][경영지원팀]… — 처음은 [전체], 격자 맨 앞 '적용' 링크,
        게시글번호 · 제목 · 작성자명 · 전달자 · 부서구분 · 첨부 · 조회, 하단 신규(F2) · 리스트 · 닫기. 우리는 기간으로 거르지 않는다.
      */}
      {/* 집계조건 🔍 '항목추가' 창(2026-10-22 실측): 게시판 › 상단-기본 [일별 주차별 월별 분기별 반기별 연별 진행상태별 전표별] · 품목 · 거래처 · 프로젝트 그룹별. */}
      <Modal error={error} open={aggPick != null} title="항목추가" width={520} onClose={() => setAggPick(null)}>
        <ul className="m-0 p-0 list-none text-[12px]">
          {[['게시판 › 상단-기본', ['일별', '주차별', '월별', '분기별', '반기별', '연별', '진행상태별', '전표별']],
            ['품목', ['품목그룹1별', '품목그룹2별', '품목그룹3별']], ['거래처', ['거래처그룹1별', '거래처그룹2별']]].map(([g, items]) => (
            <li key={g as string} className="mb-[6px]">
              <div className="font-bold mb-[2px]">{g as string}</div>
              {(items as string[]).filter((it) => !agg.includes(it)).map((it) => (
                <button key={it} type="button" className="no-ec block w-full text-left bg-transparent border-0 py-[3px] pl-[14px] cursor-pointer text-ec-navy"
                        onClick={() => { const i = aggPick!; setAgg((a) => { const n = [...a]; n[i] = it; return n }); setAggPick(null) }}>{it}</button>
              ))}
            </li>
          ))}
        </ul>
        <div className="flex gap-[6px] mt-[10px]"><button type="button" className="ec-btn" onClick={() => setAggPick(null)}>닫기</button></div>
      </Modal>

      <Modal error={error} open={linkPickFor != null} title="팀별회의록 게시판검색창" width={780} onClose={() => setLinkPickFor(null)}>
        <div className="ec-pills mb-[8px]">
          {['전체', ...(BOARD_CFG.MEETING.stages ?? [])].map((t) => (
            <button key={t} type="button" className={`ec-pill no-ec${linkTab === t ? ' active' : ''}`} onClick={() => setLinkTab(t)}>{t}</button>
          ))}
        </div>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[50px]" /><th className="w-[70px] text-center">게시글번호</th><th className="text-center">제목</th>
              <th className="w-[90px] text-center">작성자명</th><th className="w-[90px] text-center">전달자</th>
              <th className="w-[100px] text-center">부서구분</th><th className="w-[50px] text-center">첨부</th><th className="w-[50px] text-center">조회</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const list = meetingPosts
                .filter((m) => linkTab === '전체' || (m.stage ?? BOARD_CFG.MEETING.defaultStage) === linkTab)
                .sort((a, b) => b.postNo - a.postNo)
              if (list.length === 0) return <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              return list.map((m) => (
                <tr key={m.id}>
                  <td className="text-center">
                    <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy"
                            onClick={() => { const i = linkPickFor!; set('links', form.links.map((x, j) => (j === i ? m.id : x))); setLinkPickFor(null) }}>적용</button>
                  </td>
                  <td className="text-center">{m.postNo}</td>
                  <td>{m.title}</td>
                  <td>{m.writerName ?? m.writer}</td>
                  <td>{m.forwardTo ?? ''}</td>
                  <td>{m.stage ?? BOARD_CFG.MEETING.defaultStage}</td>
                  <td className="text-center">{m.attachmentId ? '📎' : ''}</td>
                  <td className="text-center text-ec-navy">R</td>
                </tr>
              ))
            })()}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn" onClick={() => setLinkPickFor(null)}>닫기</button>
        </div>
      </Modal>

      {/* 원본 '알림' 창 — 삭제하겠습니까? [확인][취소] (2026-10-13 통합게시판 View [삭제] 실측) */}
      <Modal error={error} open={!!confirmIds} title="알림" width={420} onClose={() => setConfirmIds(null)}>
        <p className="text-[12px] text-ec-ink min-h-[60px]">삭제하겠습니까?</p>
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void doDelete()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmIds(null)}>취소</button>
        </div>
      </Modal>

      {pickFor && (
        <UserPickModal selected={form[pickFor]} onClose={() => setPickFor(null)}
                       onApply={(names) => { set(pickFor, names); setPickFor(null) }} />
      )}

      {/* 원본 '조회자 현황' 창 */}
      <Modal error={error} open={!!readers} title="조회자 현황" width={780} onClose={() => setReaders(null)}>
        {readers && (
          <div className="flex gap-[10px] items-start">
            <div className="w-[200px] shrink-0">
              <div className="text-[12px] mb-[4px]">▸ 미조회자</div>
              <table className="w-full text-left">
                <thead><tr><th className="text-center">이름</th></tr></thead>
                <tbody>
                  {readers.nonReaders.length === 0
                    ? <tr><td className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
                    : readers.nonReaders.map((n, i) => <tr key={`${n}-${i}`}><td className="text-center">{n}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] mb-[4px]">▸ 조회자</div>
              <table className="w-full text-left">
                <thead><tr><th className="text-center">이름</th><th className="text-center">최초조회일시</th><th className="text-center">최종조회일시</th></tr></thead>
                <tbody>
                  {readers.readers.length === 0
                    ? <tr><td colSpan={3} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
                    : readers.readers.map((x, i) => (
                      <tr key={`${x.name}-${i}`}>
                        <td className="text-center">{x.name}</td>
                        <td className="text-center">{stampText(x.firstReadAt)}</td>
                        <td className="text-center">{stampText(x.lastReadAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn" onClick={() => setReaders(null)}>닫기</button>
        </div>
      </Modal>
    </>
  )
}
