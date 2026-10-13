import { useEffect, useState, type ReactNode } from 'react'
import Modal from '../../components/Modal'
import EcAlert from '../../components/ui/EcAlert'
import EcBadge from '../../components/ui/EcBadge'
import EcButton from '../../components/ui/EcButton'
import EcEmptyRow from '../../components/ui/EcEmptyRow'

/**
 * 디자인 시스템 견본 — 토큰과 부품을 한 화면에 모아 본다(큰 회사의 Storybook 자리).
 *
 * 값은 styles/tokens.css 에서 <b>실행 중에 읽어</b> 보여 준다 — 여기 적힌 숫자가 따로 놀 일이 없다.
 * 새 부품을 만들면 여기에 한 칸 더한다. 이 화면도 규칙대로 인라인 style 없이 클래스로만 그린다.
 */

const COLORS: { token: string; cls: string; role: string }[] = [
  { token: '--ec-blue', cls: 'bg-ec-blue', role: '주 버튼 · 선택된 알약 · 쪽번호' },
  { token: '--ec-blue-hover', cls: 'bg-ec-blue-hover', role: '주 버튼에 마우스' },
  { token: '--ec-blue-tint', cls: 'bg-ec-blue-tint', role: '선택된 1단 메뉴 · 왼쪽 메뉴 묶음' },
  { token: '--ec-blue-wash', cls: 'bg-ec-blue-wash', role: '코드도움 포커스 · 알림 상자' },
  { token: '--ec-navy', cls: 'bg-ec-navy', role: '선택된 메뉴 글자 · 격자 링크' },
  { token: '--ec-ink', cls: 'bg-ec-ink', role: '본문 · 격자 칸 글자' },
  { token: '--ec-text', cls: 'bg-ec-text', role: '버튼 · 입력칸 · 메뉴 글자' },
  { token: '--ec-label', cls: 'bg-ec-label', role: '입력 폼 이름표' },
  { token: '--ec-text-muted', cls: 'bg-ec-muted', role: '왼쪽 메뉴의 화면' },
  { token: '--ec-text-hint', cls: 'bg-ec-hint', role: '안내 글자' },
  { token: '--ec-text-off', cls: 'bg-ec-off', role: '0 · 없음처럼 흐린 값' },
  { token: '--ec-danger', cls: 'bg-ec-danger', role: '음수 · 오류 · 필수(*)' },
  { token: '--ec-success', cls: 'bg-ec-success', role: '정상 · 완료' },
  { token: '--ec-warn', cls: 'bg-ec-warn', role: '대기 · 주의' },
  { token: '--ec-star', cls: 'bg-ec-star', role: '화면 제목 앞 ★' },
  { token: '--ec-bg-shell', cls: 'bg-ec-shell', role: '머리 메뉴 · 왼쪽 메뉴 바탕' },
  { token: '--ec-bg-page', cls: 'bg-ec-page', role: '본문 틀 · 격자 머리 · 하단 버튼줄' },
  { token: '--ec-bg-pill', cls: 'bg-ec-pill', role: '선택 안 된 알약' },
  { token: '--ec-bg-disabled', cls: 'bg-ec-disabled', role: '막힌 입력칸' },
  { token: '--ec-bg-row-hover', cls: 'bg-ec-row-hover', role: '격자 줄에 마우스' },
  { token: '--ec-line', cls: 'bg-ec-line', role: '기본 테두리' },
  { token: '--ec-line-soft', cls: 'bg-ec-line-soft', role: '2단 메뉴 판 · 나무선' },
  { token: '--ec-line-head', cls: 'bg-ec-line-head', role: '격자 머리 윗선' },
]
const SIZES: { token: string; role: string }[] = [
  { token: '--ec-fs', role: '본문 글자' },
  { token: '--ec-fs-menu', role: '1단 메뉴 · 화면 제목' },
  { token: '--ec-ctl-h', role: '버튼 · 입력칸 높이' },
  { token: '--ec-ctl-h-sm', role: '격자 툴바 버튼 높이' },
  { token: '--ec-radius', role: '버튼 · 입력칸 둥글기' },
  { token: '--ec-radius-menu', role: '왼쪽 메뉴 줄 둥글기' },
  { token: '--ec-radius-panel', role: '판 · 팝업 · 본문 틀 둥글기' },
  { token: '--ec-radius-pill', role: '알약 둥글기' },
  { token: '--ec-hair', role: '테두리 굵기(레티나에서 기기 픽셀 1칸)' },
  { token: '--ec-pad-th', role: '격자 머리 칸 여백' },
  { token: '--ec-pad-td', role: '격자 본문 칸 여백' },
]

/** tokens.css 의 지금 값 — 화면에 숫자를 따로 적지 않으려고 실행 중에 읽는다 */
function useTokenValues(names: string[]) {
  const [vals, setVals] = useState<Record<string, string>>({})
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    setVals(Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim()])))
  }, [names])
  return vals
}

function Section({ title, note, code, children }: { title: string; note?: string; code?: string; children: ReactNode }) {
  return (
    <section className="ec-widget mb-[9px]">
      <div className="ec-widget-head"><span className="name">{title}</span></div>
      <div className="ec-widget-body">
        {note && <p className="mt-0 mb-[8px] text-ec-label">{note}</p>}
        {children}
        {code && <pre className="mt-[10px] mb-0 p-[9px] rounded-ec bg-ec-page text-ec-text overflow-x-auto">{code}</pre>}
      </div>
    </section>
  )
}

const ALL = [...COLORS.map((c) => c.token), ...SIZES.map((s) => s.token)]

export default function DesignSystemPage() {
  const v = useTokenValues(ALL)
  const [pill, setPill] = useState(0)
  const [modal, setModal] = useState(false)

  return (
    <div>
      <div className="ec-page-head">
        <span className="ec-page-title">디자인 시스템</span>
        <span className="text-ec-label">토큰(styles/tokens.css) → 부품(styles/*.css · components/ui) → 화면 — CLAUDE.md 10.1</span>
      </div>

      <Section title="색 토큰" note="화면에서는 이름으로만 쓴다: 클래스 text-ec-hint · bg-ec-page · border-ec-line, 또는 var(--ec-…). 값은 원본(ec56) 실측이다.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[8px]">
          {COLORS.map((c) => (
            <div key={c.token} className="flex items-center gap-[8px]">
              <span className={`${c.cls} w-[34px] h-[34px] shrink-0 rounded-ec border border-ec-line border-solid`} />
              <div className="leading-[16px]">
                <div className="font-bold text-ec-ink">{c.token}</div>
                <div className="text-ec-label">{c.cls.replace('bg-', 'text-/bg-')} · {v[c.token]}</div>
                <div className="text-ec-hint">{c.role}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="크기 · 둥글기 토큰">
        <table className="ec-grid">
          <thead><tr><th>토큰</th><th className="text-right">지금 값</th><th>쓰는 곳</th></tr></thead>
          <tbody>
            {SIZES.map((s) => (
              <tr key={s.token}><td>{s.token}</td><td className="text-right">{v[s.token]}</td><td>{s.role}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="버튼 — EcButton · .ec-btn" note="h26 · 둥글기 10 · 머리카락 테두리. 붙은 묶음은 맞닿는 쪽 모서리만 각지다."
               code={`<EcButton primary onClick={save}>저장(F8)</EcButton>\n<EcButton small>찾기(F3)</EcButton>\n<div className="ec-btn-group"><EcButton>Email</EcButton><EcButton className="ec-btn-arrow">▴</EcButton></div>`}>
        <div className="flex items-center flex-wrap gap-[5px]">
          <EcButton primary>저장(F8)</EcButton>
          <EcButton>다시 작성</EcButton>
          <EcButton disabled>선택삭제</EcButton>
          <EcButton small>찾기(F3)</EcButton>
          <div className="ec-btn-group">
            <EcButton>Email</EcButton>
            <EcButton className="ec-btn-arrow">▴</EcButton>
          </div>
        </div>
      </Section>

      <Section title="입력칸 · 코드도움 — .ec-input · .ec-code" note="h26 · 여백 5.4 · 둥글기 10. 코드도움은 [코드][🔍][명칭] 이 한 덩어리로 붙는다."
               code={`<input className="ec-input" />\n<div className="ec-code">\n  <input className="ec-input code" /><button className="ec-btn">🔍</button><input className="ec-input name" />\n</div>`}>
        <div className="flex items-center flex-wrap gap-[8px]">
          <input className="ec-input" placeholder="일반 입력칸" />
          <input className="ec-input" disabled placeholder="막힌 칸" />
          <select className="ec-input"><option>부가세율 적용</option></select>
          <div className="ec-code w-[360px] flex-none">
            <input className="ec-input code" placeholder="거래처" />
            <button className="ec-btn">🔍</button>
            <input className="ec-input name" placeholder="거래처명" />
          </div>
        </div>
      </Section>

      <Section title="알약 — .ec-pills > .ec-pill" note="h25 · 둥글기 30. 꺼진 것도 옅은 파랑 바탕이 있다."
               code={`<div className="ec-pills">\n  <button className="ec-pill active">전체</button><button className="ec-pill">결재중</button>\n</div>`}>
        <div className="ec-pills">
          {['전체', '결재중', '미확인', '확인'].map((t, i) => (
            <button key={t} className={`ec-pill${i === pill ? ' active' : ''}`} onClick={() => setPill(i)}>{t}</button>
          ))}
        </div>
      </Section>

      <Section title="안내 상자 — EcAlert · .ec-alert" code={`{error && <EcAlert tone="danger">{error}</EcAlert>}`}>
        <div className="grid gap-[6px]">
          <EcAlert tone="danger">거래처를 고르세요.</EcAlert>
          <EcAlert tone="success">저장했습니다.</EcAlert>
          <EcAlert tone="info">'판매' 검색결과 3건</EcAlert>
        </div>
      </Section>

      <Section title="상태 글자 — EcBadge" note="색을 고르지 않고 역할을 고른다." code={`<EcBadge tone="success">정상</EcBadge>`}>
        <div className="flex gap-[12px]">
          <EcBadge tone="success">정상</EcBadge>
          <EcBadge tone="danger">부족</EcBadge>
          <EcBadge tone="warn">대기</EcBadge>
          <EcBadge tone="info">진행중</EcBadge>
          <EcBadge tone="muted">사용안함</EcBadge>
        </div>
      </Section>

      <Section title="격자 — table · EcEmptyRow" note="머리 바탕 --ec-bg-page · 윗선 --ec-line-head · 머리 35 / 본문 30 · 줄에 마우스 --ec-bg-row-hover · 링크 .ec-link(--ec-navy) · 숫자 칸 text-right · 그림자 없음."
               code={`<td><button className="ec-link">2026/10/20 -1</button></td>\n<td className="text-right">1,100,000</td>\n{rows.length === 0 && <EcEmptyRow colSpan={4} />}`}>
        <table className="w-full">
          <thead><tr><th>일자-No.</th><th>거래처명</th><th className="text-right">금액합계</th><th className="text-center">인쇄</th></tr></thead>
          <tbody>
            <tr><td><button className="ec-link">2026/10/20 -1</button></td><td>부동산/임대회사</td><td className="text-right">1,100,000</td><td className="text-center"><button className="ec-link">인쇄</button></td></tr>
            <tr><td><button className="ec-link">2026/10/19 -3</button></td><td>김치좋아</td><td className="text-right">693,000</td><td className="text-center"><button className="ec-link">인쇄</button></td></tr>
            <tr className="ec-list-total"><td colSpan={2} className="text-center">합계</td><td className="text-right">1,793,000</td><td /></tr>
          </tbody>
        </table>
        <table className="w-full mt-[8px]">
          <thead><tr><th>일자-No.</th><th>거래처명</th><th className="text-right">금액합계</th><th className="text-center">인쇄</th></tr></thead>
          <tbody><EcEmptyRow colSpan={4} /></tbody>
        </table>
      </Section>

      <Section title="입력 폼 판 — .ec-form" note="흰 판 · 여백 9 · 둥글기 --ec-radius-panel. 이름표 --ec-label, 2열."
               code={`<ul className="ec-form">\n  <li><div className="title">일자</div><div className="form">…</div></li>\n</ul>`}>
        <ul className="ec-form">
          <li><div className="title">일자-No.</div><div className="form"><input className="ec-input" defaultValue="2026/10/03" /></div></li>
          <li><div className="title">거래처<span className="req">*</span></div><div className="form"><input className="ec-input" /></div></li>
          <li><div className="title">담당자</div><div className="form"><input className="ec-input" /></div></li>
          <li><div className="title">출하창고</div><div className="form"><input className="ec-input" /></div></li>
        </ul>
      </Section>

      <Section title="팝업창 — Modal" note="뒤 화면을 어둡게 하지 않는다. 파란 제목줄 · 둥글기 20 · ESC 로 닫힌다."
               code={`<Modal open={open} title="거래처검색" onClose={() => setOpen(false)}>…</Modal>`}>
        <EcButton onClick={() => setModal(true)}>팝업 열기</EcButton>
        <Modal open={modal} title="거래처검색" width={420} onClose={() => setModal(false)}>
          <EcAlert tone="info">팝업 본문 — 바탕은 본문 틀과 같은 --ec-bg-page 다.</EcAlert>
        </Modal>
      </Section>
    </div>
  )
}
