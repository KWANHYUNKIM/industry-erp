import Modal from '../../../components/Modal'
import EcDateInput from '../../../components/ui/EcDateInput'
import type { WorkPostStatus, WorkPost } from '../../../types/api'
import EcDateTimeSelect from '../../../components/EcDateTimeSelect'
import GridCode from '../../../components/codepicker/GridCode'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import EcDateTimeRange from '../../../components/EcDateTimeRange'
import { PostLinkField, SlipLinkField } from './LinkFields'
import EcFileDrop from '../../../components/EcFileDrop'
import EcIcon from '../../../components/ui/EcIcon'
import EcRichEditor from '../../../components/EcRichEditor'
import { MenuButton } from '../../../components/EcSlipShell'
import { NameChips } from './NameChips'
import { VEHICLES, POST_BOARD_TITLE, POST_BOARD_PATH, BOARD_CFG, MINUTE_TEAMS, WEEKS, emptyForm, type PostBoardCode, type BoardCfg, type Form } from '../boardConfig'
import type { Dispatch, SetStateAction } from 'react'

/** 게시글 입력 창('…입력' / '…입력(수정)') — WorkPage 에서 몸통 그대로 옮겼다. 상태 · 저장은 화면이 들고 창은 받아서 그린다. */
export default function WorkPostFormModal({
  attachment,
  board,
  ccMenu,
  cfg,
  closeForm,
  copyId,
  editId,
  employees,
  error,
  firstStage,
  form,
  forwardMenu,
  itemList,
  kanbanPosts,
  meetingTitle,
  namedStages,
  partnerList,
  projects,
  removeOne,
  rows,
  set,
  setAttachment,
  setCcMenu,
  setCopyId,
  setEditId,
  setError,
  setForm,
  setForwardMenu,
  setLinkPickFor,
  setLinkTab,
  setPickFor,
  setShowForm,
  setStatusBlank,
  setViewing,
  setWeekMenu,
  showForm,
  stageLabel,
  statusBlank,
  submit,
  title,
  upload,
  uploading,
  weekMenu,
}: {
  attachment: { id: number; name: string; } | null
  board: PostBoardCode
  ccMenu: boolean
  cfg: BoardCfg
  closeForm: () => Promise<void>
  copyId: number | null
  editId: number | null
  employees: { code: string; name: string; }[]
  error: string
  firstStage: string
  form: Form
  forwardMenu: boolean
  itemList: { code: string; name: string; }[]
  kanbanPosts: WorkPost[]
  meetingTitle: (id: number | null | undefined) => string
  namedStages: boolean
  partnerList: { code: string; name: string; }[]
  projects: { id: number; code: string; name: string; }[]
  removeOne: (id: number) => void
  rows: WorkPost[]
  set: <K extends keyof Form>(k: K, v: Form[K]) => void
  setAttachment: Dispatch<SetStateAction<{ id: number; name: string; } | null>>
  setCcMenu: Dispatch<SetStateAction<boolean>>
  setCopyId: Dispatch<SetStateAction<number | null>>
  setEditId: Dispatch<SetStateAction<number | null>>
  setError: Dispatch<SetStateAction<string>>
  setForm: Dispatch<SetStateAction<Form>>
  setForwardMenu: Dispatch<SetStateAction<boolean>>
  setLinkPickFor: Dispatch<SetStateAction<number | null>>
  setLinkTab: Dispatch<SetStateAction<string>>
  setPickFor: Dispatch<SetStateAction<"forwardTo" | "ccTo" | null>>
  setShowForm: Dispatch<SetStateAction<boolean>>
  setStatusBlank: Dispatch<SetStateAction<boolean>>
  setViewing: Dispatch<SetStateAction<WorkPost | null>>
  setWeekMenu: Dispatch<SetStateAction<boolean>>
  showForm: boolean
  stageLabel: string
  statusBlank: boolean
  submit: (after?: "close" | "new" | "keep") => Promise<void>
  title: string
  upload: (file: File) => Promise<void>
  uploading: boolean
  weekMenu: boolean
}) {
  /** 입력 창 [제목] 줄 — 통합회의록은 맨 위, 다른 게시판은 참조자 아래. */
  const titleRow = (
    <li className="wide">
      <div className="title">제목</div>
      <div className="form flex-col items-start">
        <input className="ec-input w-full" placeholder="제목" value={form.title}
               onChange={(e) => set('title', e.target.value)} />
        {/* 원본은 제목 칸 바로 아래에 [공지사항여부]를 단다. 켜면 목록 맨 위에 한 번 더 붙는다. */}
        {!cfg.minutes && <label className="inline-flex items-center gap-[6px] text-[12px] cursor-pointer">
          공지사항여부
          <input type="checkbox" checked={form.notice} onChange={(e) => set('notice', e.target.checked)} />
        </label>}
      </div>
    </li>
  )


  return (
    <>
      {/* 원본 '공지사항입력' / '공지사항입력(수정)' 창 — 항목이 한 줄에 하나씩 세로로 놓인다. */}
      <Modal error={error} open={showForm} title={`${title}입력${editId != null ? '(수정)' : ''}`}
             onClose={() => void closeForm()} width={780}>
        <ul className="ec-form mb-[10px]">
          {/*
            [일자] — 목록 [일자-No.] · [일자] 열과 조회 기간(게시일)이 보는 날. 처음 값 오늘. 원본 예시 글은 2025년 날짜로 올라가 있어
            옮겨 넣을 때 그 날을 적는다. 수정에서는 바꾸지 않는다(일자는 그 글이 언제 올라갔는지의 기록 — 서버도 무시한다).
          */}
          <li className="wide">
            <div className="title">일자</div>
            <div className="form">
              <EcDateInput className="ec-input w-[140px]" aria-label="일자" value={form.postDate} disabled={editId != null} onChange={(e) => set('postDate', e.target.value)} />
            </div>
          </li>
          {cfg.minutes && titleRow}
          {/* 원본 통합회의록 [진행상태] — 진행중 · 완료(처음 진행중). 원본 고르기의 '==' 는 두지 않았다. */}
          {cfg.minutes && (
            <li className="wide">
              <div className="title">진행상태</div>
              <div className="form">
                {/* 원본 진행상태 목록(2026-10-21 통합회의록 실측): '==' · 진행중(처음 값) · 완료. '==' 는 안 고른 칸 — 저장하면 진행중. */}
                <select className="ec-input w-[260px]" aria-label="진행상태" value={statusBlank ? '==' : form.status}
                        onChange={(e) => { setStatusBlank(e.target.value === '=='); set('status', (e.target.value === '==' ? 'IN_PROGRESS' : e.target.value) as WorkPostStatus) }}>
                  <option value="==">==</option>
                  <option value="IN_PROGRESS">진행중</option>
                  <option value="DONE">완료</option>
                </select>
              </div>
            </li>
          )}
          {/* 원본 입력 창 맨 위 [진행상태] — 회사가 정한 이름(통합게시판 'Default' 하나). */}
          {namedStages && (
            <li className="wide">
              <div className="title">{stageLabel}</div>
              <div className="form">
                <select className="ec-input w-[260px]" aria-label={stageLabel} value={form.stage || firstStage} onChange={(e) => set('stage', e.target.value)}>
                  {cfg.stages!.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
            </li>
          )}
          {/*
            원본 간판제작 입력 창(2026-10-20 실측) 차례: 진행상태 · 프로젝트 · 라벨 · 칸반연결 · 완료일시 · 전달자 · 참조자 · 권한 · 비밀번호 · 제목 · 첨부.
            [프로젝트] 는 '프로젝트검색' 코드도움(프로젝트코드 · 프로젝트명 — 프로젝트 마스터), [완료일시] 는 처음 값이 지금(년 / 월 / 일 오후 시 : 분).
            📅 프로젝트 진행현황 칸반 글의 판에 이 글이 [프로젝트] 열의 카드로 뜬다.
          */}
          {board === 'AS_CARE' && (
            <li>
              <div className="title">완료일시</div>
              <div className="form">
                <EcDateTimeSelect value={form.done} onChange={(v) => set('done', v)} />
              </div>
            </li>
          )}
          {board === 'SIGN' && (
            <>
              <li>
                <div className="title">프로젝트</div>
                <div className="form">
                  <GridCode title="프로젝트검색" codeHead="프로젝트코드" nameHead="프로젝트명" showName
                            items={[...projects.map((x) => ({ value: x.name, code: x.code, name: x.name })),
                              ...(form.project && !projects.some((x) => x.name === form.project) ? [{ value: form.project, code: '', name: form.project }] : [])]}
                            value={form.project} onPick={(v) => set('project', v)} />
                </div>
              </li>
              <li>
                <div className="title">칸반연결</div>
                <div className="form">
                  <select className="ec-input w-full" aria-label="칸반연결" value={form.kanbanPostId ?? ''}
                          onChange={(e) => set('kanbanPostId', e.target.value ? Number(e.target.value) : null)}>
                    <option value="">(연결 안 함)</option>
                    {kanbanPosts.map((k) => <option key={k.id} value={k.id}>{k.postNo} {k.title}</option>)}
                  </select>
                </div>
              </li>
              <li>
                <div className="title">완료일시</div>
                <div className="form">
                  <EcDateTimeSelect value={form.done} onChange={(v) => set('done', v)} />
                </div>
              </li>
            </>
          )}
          {/*
            원본 [전달자]: 글자 링크 '전체' 를 누르면 [전체][선택] 판, '선택' 이면 🔍 사용자검색 + 이름 칩.
            [참조자] 는 처음부터 '선택'. 원본은 전달자에게 알림을 보내지만 우리는 적어 두기만 한다.
          */}
          <li className="wide">
            <div className="title">전달자</div>
            <div className="form gap-[6px] relative">
              <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy underline"
                      onClick={() => setForwardMenu((v) => !v)}>{form.forwardAll ? '전체' : '선택'}</button>
              {forwardMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setForwardMenu(false)} />
                  <ul role="menu" aria-label="전달자"
                      className="absolute top-full left-0 mt-[2px] z-[41] min-w-[110px] py-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                    {(['전체', '선택'] as const).map((m) => (
                      <li key={m}>
                        <button type="button" role="menuitem" className="no-ec w-full text-left px-[10px] py-[4px] bg-transparent border-0 cursor-pointer hover:bg-ec-blue-wash"
                                onClick={() => { setForwardMenu(false); set('forwardAll', m === '전체') }}>{m}</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!form.forwardAll && <NameChips names={form.forwardTo} placeholder="전달자" onPick={() => setPickFor('forwardTo')}
                                              onRemove={(n) => set('forwardTo', form.forwardTo.filter((x) => x !== n))} />}
            </div>
          </li>
          {cfg.minutes && (
            <li className="wide">
              <div className="title">공지사항여부</div>
              <div className="form gap-[12px] text-[12px]">
                {([['Y', true], ['N', false]] as const).map(([t, v]) => (
                  <label key={t} className="inline-flex items-center gap-[4px] cursor-pointer">
                    <input type="radio" name="minutes-notice" checked={form.notice === v} onChange={() => set('notice', v)} /> {t}
                  </label>
                ))}
              </div>
            </li>
          )}
          <li className="wide">
            <div className="title">참조자</div>
            <div className="form gap-[6px] relative">
              {cfg.ccAll ? (
                <button type="button" className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-navy underline"
                        onClick={() => setCcMenu((v) => !v)}>{form.ccAll ? '전체' : '선택'}</button>
              ) : <span className="text-ec-ink">선택</span>}
              {ccMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCcMenu(false)} />
                  <ul role="menu" aria-label="참조자"
                      className="absolute top-full left-0 mt-[2px] z-[41] min-w-[110px] py-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                    {(['전체', '선택'] as const).map((m) => (
                      <li key={m}>
                        <button type="button" role="menuitem" className="no-ec w-full text-left px-[10px] py-[4px] bg-transparent border-0 cursor-pointer hover:bg-ec-blue-wash"
                                onClick={() => { setCcMenu(false); set('ccAll', m === '전체') }}>{m}</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!form.ccAll && <NameChips names={form.ccTo} placeholder="참조자" onPick={() => setPickFor('ccTo')}
                                         onRemove={(n) => set('ccTo', form.ccTo.filter((x) => x !== n))} />}
            </div>
          </li>
          {/* 원본 차례: 진행상태 · 권한 · 비밀번호 · 전달자 · 참조자 · 제목(+공지사항여부) · 첨부 (통합회의록은 제목이 맨 위 · 공지는 Y/N 줄) */}
          {!cfg.minutes && titleRow}
          {/* 게시판별 입력항목(원본 🚗 1. 차량 정보관리: 제목 아래 [출고일자] · [차량번호]). */}
          {cfg.extras?.map((x) => (
            <li key={x.name}>
              <div className="title">{x.name}</div>
              <div className="form">
                {x.type === 'emp' ? (
                  /* 원본 입력 창 [담당자](2026-10-21 칸반보드 활용 예시 실측): 코드 · 🔍 · 이름 두 칸 — '사원검색'(사원코드 · 사원명)에서 고른다. */
                  <CodePickerField label={x.name} hideLabel fill pair plain popupTitle="사원검색"
                                   value={employees.find((e) => e.name === form.extra[x.name])?.code ?? ''}
                                   onChange={(v) => set('extra', { ...form.extra, [x.name]: employees.find((e) => e.code === v)?.name ?? '' })}
                                   items={employees.map((e) => ({ value: e.code, code: e.code, name: e.name }))} />
                ) : x.type === 'vehicle' || x.type === 'item' || x.type === 'partner' || x.type === 'project' ? (
                  /* 원본 코드도움 칸: 코드 · 🔍 · 이름 두 칸 — 차량번호검색(코드 001 ~ 005) · 품목검색 · 거래처검색 · 프로젝트검색. 고른 이름이 값으로 저장된다. */
                  (() => {
                    const src = x.type === 'vehicle' ? VEHICLES.map(([c, n]) => ({ code: c, name: n }))
                      : x.type === 'item' ? itemList : x.type === 'partner' ? partnerList : projects
                    return (
                      <CodePickerField label={x.name} hideLabel fill pair plain
                                       popupTitle={x.type === 'vehicle' ? '차량번호검색' : x.type === 'item' ? '품목검색' : x.type === 'partner' ? '거래처검색' : '프로젝트검색'}
                                       value={src.find((e) => e.name === form.extra[x.name])?.code ?? ''}
                                       onChange={(v) => set('extra', { ...form.extra, [x.name]: src.find((e) => e.code === v)?.name ?? '' })}
                                       items={src.map((e) => ({ value: e.code, code: e.code, name: e.name }))} />
                    )
                  })()
                ) : x.type === 'range' ? (
                  <EcDateTimeRange label={x.name} value={form.extra[x.name] ?? ''} onChange={(v) => set('extra', { ...form.extra, [x.name]: v })} />
                ) : x.type === 'post' ? (
                  <PostLinkField label={x.name} board={x.board!} boardTitle={POST_BOARD_TITLE[x.board!] ?? ''} path={POST_BOARD_PATH[x.board!]}
                                 stages={BOARD_CFG[x.board!].stages} defaultStage={BOARD_CFG[x.board!].defaultStage} freePill={BOARD_CFG[x.board!].freePill}
                                 dateNo={!!BOARD_CFG[x.board!].cols?.includes('dateNo')}
                                 value={form.extra[x.name] ?? ''} onChange={(v) => set('extra', { ...form.extra, [x.name]: v })} />
                ) : x.type === 'slip' ? (
                  <SlipLinkField label={x.name} kind={x.slip!} value={form.extra[x.name] ?? ''} onChange={(v) => set('extra', { ...form.extra, [x.name]: v })} />
                ) : (
                  <input className="ec-input w-full" type={x.type} placeholder={x.name} aria-label={x.name}
                         value={form.extra[x.name] ?? ''} onChange={(e) => set('extra', { ...form.extra, [x.name]: e.target.value })} />
                )}
              </div>
            </li>
          ))}
          <li className="wide">
            <div className="title">첨부</div>
            <div className="form">
              <EcFileDrop busy={uploading} disabled={uploading}
                          onFiles={(fs) => { if (fs[0]) void upload(fs[0]) }}>
                {attachment && (
                  <span className="text-[12px] text-ec-navy">
                    {attachment.name}
                    <span onClick={() => setAttachment(null)} className="cursor-pointer ml-[6px] font-bold">×</span>
                  </span>
                )}
              </EcFileDrop>
            </div>
          </li>
          {/* 원본 통합회의록 입력 창: 첨부 아래 부서 칸 넷(두 칸씩) · [주 차 구분](코드 🔍 · 이름). */}
          {cfg.minutes && MINUTE_TEAMS.map((t, i) => (
            <li key={t}>
              <div className="title">{t} 회의록</div>
              <div className="form gap-[4px]">
                <div className="flex-1 flex items-center gap-[4px] ec-input">
                  <button type="button" aria-label={`${t} 회의록 검색`} className="no-ec bg-transparent border-0 p-0 cursor-pointer text-ec-hint"
                          onClick={() => { setLinkTab('전체'); setLinkPickFor(i) }}><EcIcon name="search" /></button>
                  <span className={`flex-1 truncate ${form.links[i] == null ? 'text-ec-hint' : ''}`}>
                    {form.links[i] == null ? `${t} 회의록` : meetingTitle(form.links[i])}
                  </span>
                  {form.links[i] != null && (
                    <button type="button" aria-label={`${t} 회의록 지우기`} className="no-ec bg-transparent border-0 p-0 cursor-pointer"
                            onClick={() => set('links', form.links.map((x, j) => (j === i ? null : x)))}>×</button>
                  )}
                </div>
              </div>
            </li>
          ))}
          {(cfg.minutes || cfg.weekPick) && (
            <li>
              <div className="title">주 차 구분</div>
              <div className="form gap-[4px] relative">
                <span className="ec-input w-[80px]">{form.weekNo ?? ''}</span>
                <button type="button" aria-label="주차검색" className="ec-btn" onClick={() => setWeekMenu((v) => !v)}><EcIcon name="search" /></button>
                <span className="ec-input flex-1">{form.weekNo ? `${form.weekNo}주차` : ''}</span>
                {weekMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setWeekMenu(false)} />
                    <div role="dialog" aria-label="주차검색"
                         className="absolute top-full left-0 mt-[2px] z-[41] min-w-[220px] p-[6px] bg-ec-panel border border-ec-line border-solid rounded-ec shadow-lg">
                      <table className="w-full text-left">
                        <thead><tr><th className="text-center">코드</th><th className="text-center">항목명</th></tr></thead>
                        <tbody>
                          {WEEKS.map((w) => (
                            <tr key={w} className="cursor-pointer" onClick={() => { set('weekNo', w); setWeekMenu(false) }}>
                              <td className="text-center text-ec-navy">{w}</td><td className="text-ec-navy">{w}주차</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </li>
          )}
        </ul>
        <EcRichEditor value={form.content} onChange={(h) => set('content', h)} />
        <div className="flex gap-[6px] mt-[10px]">
          {/* 원본 신규: 저장(F8) · 다시 작성 · 리스트 · 닫기 / 수정: 저장(F8) · 리스트 · View · 닫기 · 삭제 */}
          <MenuButton label="저장(F8)" className="ec-btn ec-btn-primary" up onMain={() => void submit()}
                      items={[{ label: '저장/신규', onClick: () => void submit('new') }, { label: '저장/내용유지', onClick: () => void submit('keep') }]} />
          {editId == null && copyId == null && (
            <button className="ec-btn" onClick={() => { setForm(emptyForm()); setAttachment(null); setError('') }}>다시 작성</button>
          )}
          <button className="ec-btn" onClick={() => { setShowForm(false); setEditId(null) }}>리스트</button>
          {(editId != null || copyId != null) && (
            <button className="ec-btn" onClick={() => {
              const r = rows.find((x) => x.id === (editId ?? copyId))
              setShowForm(false); setEditId(null); setCopyId(null)
              if (r) setViewing(r)
            }}>View</button>
          )}
          <button className="ec-btn" onClick={() => void closeForm()}>닫기</button>
          {editId != null && <button className="ec-btn" onClick={() => removeOne(editId)}>삭제</button>}
        </div>
      </Modal>
    </>
  )
}
