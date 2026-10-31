import EcIcon from '../../../components/ui/EcIcon'
import { EcDateRange } from '../../../components/ui/EcDateInput'
import EcPeriodPicks, { PROJECT_PICKS, BOARD_PICKS } from '../../../components/EcPeriodPicks'
import { COND_KINDS, toggleAll, COND_PATHS, defaultPeriod, EMPTY_COND, type BoardCfg } from '../boardConfig'
import type { Dispatch, SetStateAction } from 'react'

/** 게시판 조회 조건 판 — WorkPage 에서 몸통 그대로 옮겼다. 조건 상태는 화면이 들고 판은 받아서 그린다. */
export default function WorkCondPanel({
  agg,
  aggSlots,
  applyCond,
  cfg,
  compare,
  cond,
  condOpen,
  menu,
  rep,
  setAgg,
  setAggPick,
  setCompare,
  setCond,
  setMenu,
  setRepRan,
}: {
  agg: string[]
  aggSlots: number
  applyCond: () => void
  cfg: BoardCfg
  compare: string
  cond: { kinds: string[]; doneFrom: string; doneTo: string; title: string; content: string; user: string; no: string; del: "전체" | "미삭제" | "삭제"; paths: string[]; byUpdated: boolean; from: string; to: string; }
  condOpen: boolean
  menu: "조회" | "현황" | "집계"
  rep: boolean
  setAgg: Dispatch<SetStateAction<string[]>>
  setAggPick: Dispatch<SetStateAction<number | null>>
  setCompare: Dispatch<SetStateAction<string>>
  setCond: Dispatch<SetStateAction<{ kinds: string[]; doneFrom: string; doneTo: string; title: string; content: string; user: string; no: string; del: "전체" | "미삭제" | "삭제"; paths: string[]; byUpdated: boolean; from: string; to: string; }>>
  setMenu: Dispatch<SetStateAction<"조회" | "현황" | "집계">>
  setRepRan: Dispatch<SetStateAction<boolean>>
}) {
  return (
    <>
      {/*
        원본 조건 판(2026-10-13 통합게시판 실측): 메뉴 · 게시일 · 유형 · 완료일 · 제목 · 내용1 · 사용자 · 게시글번호 · 삭제구분 · 기타 ·
        입력경로 · 적용양식, 아래 [검색(F8)] + 기간 빠른선택.
        2026-10-20 다시 잼(통합게시판 E200076): 게시일 · 유형(☐전체 ☑본문 ☐답글) · 완료일(빈칸) · 제목 · 내용1(여러 줄) · 사용자 · 게시글번호 ·
        삭제구분(○전체 ●미삭제 ○삭제) · 기타(☐수정일자순(정렬)) · 입력경로(☑전체 ☑웹(ERP) ☑자료올리기 ☑기타 ☑OAPI), 빠른선택 금년 · 전년 · 전년+금년.
        원본 [삭제] 로 걸면 전년+금년에도 '등록된 데이터가 없습니다.'(지운 글이 남지 않는다) — 우리도 지운 글은 남지 않으니 빈 목록.
        우리 글은 모두 웹(ERP)에서 들어온다. [유형] 답글 = View [답글(F8)] 로 단 하위 글. [적용양식] · 메뉴(조회/현황/집계)는 아직 없다.
      */}
      {condOpen && (
        <div className="ec-cond mb-[8px]">
          <ul className="ec-form border-0">
            {cfg.menuModes && (
              <li className="wide">
                <div className="title">메뉴</div>
                <div className="form gap-[8px]">
                  {(['조회', '현황', '집계'] as const).map((m) => (
                    <label key={m} className="inline-flex items-center gap-[3px]">
                      <input type="radio" name="work-cond-menu" checked={menu === m} onChange={() => { setMenu(m); setRepRan(false) }} />{m}
                    </label>
                  ))}
                </div>
              </li>
            )}
            {rep && (
              <>
                <li className="wide">
                  <div className="title">구분</div>
                  <div className="form gap-[6px] flex-wrap">
                    {menu === '현황' ? (
                      <select className="ec-input w-[260px]" aria-label="구분" defaultValue="전표별"><option>전표별</option></select>
                    ) : Array.from({ length: aggSlots }, (_, i) => i).map((i) => (
                      <span key={i} className="inline-flex items-center gap-[4px] w-full">
                        <span className="ec-pill no-ec">{`집계조건${i + 1}`}</span>
                        <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-hint" title={`집계조건${i + 1} 검색`} onClick={() => setAggPick(i)}><EcIcon name="search" /></button>
                        <input className="ec-input flex-1" readOnly placeholder={`집계조건${i + 1}`} value={agg[i]} onClick={() => setAggPick(i)} />
                        {agg[i] && <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-hint" title="지우기" onClick={() => setAgg((a) => { const n = [...a]; n[i] = ''; return [...n.filter(Boolean), ...n.filter((x) => !x)] })}>×</button>}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-[8px] w-full">
                      <span className="ec-pill no-ec">비교기간</span>
                      {['사용안함', '전년동일기간', '전월동일기간', '전주동일기간', '전일동일기간'].map((c) => (
                        <label key={c} className="inline-flex items-center gap-[3px]">
                          <input type="radio" name="work-cond-compare" checked={compare === c} onChange={() => setCompare(c)} />{c}
                        </label>
                      ))}
                    </span>
                  </div>
                </li>
              </>
            )}
            <li className="wide">
              <div className="title">게시일</div>
              <div className="form gap-[4px]">
                <EcDateRange from={{ className: "ec-input w-[140px]", value: cond.from, onChange: (e) => setCond((c) => ({ ...c, from: e.target.value })) }} to={{ className: "ec-input w-[140px]", value: cond.to, onChange: (e) => setCond((c) => ({ ...c, to: e.target.value })) }} />
              </div>
            </li>
            {!rep && <li className="wide">
              <div className="title">유형</div>
              <div className="form gap-[8px]">
                {COND_KINDS.map((k) => (
                  <label key={k} className="inline-flex items-center gap-[3px]">
                    <input type="checkbox" checked={cond.kinds.includes(k)}
                           onChange={(e) => setCond((c) => ({ ...c, kinds: toggleAll(c.kinds, k, e.target.checked, COND_KINDS) }))} />{k}
                  </label>
                ))}
              </div>
            </li>}
            {!rep && <li className="wide">
              <div className="title">완료일</div>
              <div className="form gap-[4px]">
                <EcDateRange from={{ className: "ec-input w-[140px]", value: cond.doneFrom, onChange: (e) => setCond((c) => ({ ...c, doneFrom: e.target.value })) }} to={{ className: "ec-input w-[140px]", value: cond.doneTo, onChange: (e) => setCond((c) => ({ ...c, doneTo: e.target.value })) }} />
              </div>
            </li>}
            <li className="wide">
              <div className="title">제목</div>
              <div className="form">
                <input className="ec-input w-full" placeholder="제목" value={cond.title}
                       onChange={(e) => setCond((c) => ({ ...c, title: e.target.value }))}
                       onKeyDown={(e) => { if (e.key === 'Enter') applyCond() }} />
              </div>
            </li>
            <li className="wide">
              <div className="title">내용1</div>
              <div className="form">
                <textarea className="ec-input w-full" placeholder="내용1" rows={2} value={cond.content}
                          onChange={(e) => setCond((c) => ({ ...c, content: e.target.value }))} />
              </div>
            </li>
            <li className="wide">
              <div className="title">사용자</div>
              <div className="form">
                <input className="ec-input w-full" placeholder="사용자" value={cond.user}
                       onChange={(e) => setCond((c) => ({ ...c, user: e.target.value }))}
                       onKeyDown={(e) => { if (e.key === 'Enter') applyCond() }} />
              </div>
            </li>
            <li className="wide">
              <div className="title">게시글번호</div>
              <div className="form">
                <input className="ec-input w-full" placeholder="게시글번호" value={cond.no}
                       onChange={(e) => setCond((c) => ({ ...c, no: e.target.value }))}
                       onKeyDown={(e) => { if (e.key === 'Enter') applyCond() }} />
              </div>
            </li>
            {!rep && <li className="wide">
              <div className="title">삭제구분</div>
              <div className="form gap-[8px]">
                {(['전체', '미삭제', '삭제'] as const).map((d) => (
                  <label key={d} className="inline-flex items-center gap-[3px]">
                    <input type="radio" name="work-cond-del" checked={cond.del === d}
                           onChange={() => setCond((c) => ({ ...c, del: d }))} />{d}
                  </label>
                ))}
              </div>
            </li>}
            {!rep && <li className="wide">
              <div className="title">기타</div>
              <div className="form">
                <label className="inline-flex items-center gap-[3px]">
                  <input type="checkbox" checked={cond.byUpdated} onChange={(e) => setCond((c) => ({ ...c, byUpdated: e.target.checked }))} />수정일자순(정렬)
                </label>
              </div>
            </li>}
            {!rep && <li className="wide">
              <div className="title">입력경로</div>
              <div className="form gap-[8px]">
                {COND_PATHS.map((p) => (
                  <label key={p} className="inline-flex items-center gap-[3px]">
                    <input type="checkbox" checked={cond.paths.includes(p)}
                           onChange={(e) => setCond((c) => ({ ...c, paths: toggleAll(c.paths, p, e.target.checked, COND_PATHS) }))} />{p}
                  </label>
                ))}
              </div>
            </li>}
            {rep && (
              <>
                <li className="wide">
                  <div className="title">진행상태</div>
                  <div className="form"><input className="ec-input w-full" placeholder="진행상태" /></div>
                </li>
                <li className="wide">
                  <div className="title">사용자지정</div>
                  <div className="form"><button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy">설정</button></div>
                </li>
              </>
            )}
            {cfg.menuModes && (
              <li className="wide">
                <div className="title">적용양식</div>
                <div className="form">
                  <select className="ec-input w-full" aria-label="적용양식" defaultValue="">
                    <option value="">{menu === '조회' ? '공유정보/업무관리 메뉴에서' : menu === '현황' ? '게시판현황' : '현황_집계'}</option>
                  </select>
                </div>
              </li>
            )}
            {rep && (
              <li className="wide">
                <div className="title">정렬기준</div>
                <div className="form"><button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy">설정</button></div>
              </li>
            )}
          </ul>
          <div className="flex flex-wrap gap-[4px] mt-[8px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={applyCond}>검색(F8)</button>
            <EcPeriodPicks labels={rep ? PROJECT_PICKS : BOARD_PICKS} currentFrom={cond.from}
                           onPick={(r) => setCond((c) => ({ ...c, from: r.from, to: r.to }))} />
            <button type="button" className="ec-btn" onClick={() => setCond({ ...defaultPeriod(cfg.period), ...EMPTY_COND })}>다시작성</button>
          </div>
        </div>
      )}
    </>
  )
}
