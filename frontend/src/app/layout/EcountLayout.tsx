import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { api } from '../../api/client'
import { myFolders, MY_FOLDERS_EVENT, type MyFolder } from '../../features/mypage/api'
import AppBar, { APP_ITEMS } from '../../features/appbar/AppBar'
import { Icon } from '../../features/appbar/icons'
import { openAppBarPanel } from '../../components/AppBarPanel'
import TableContextMenu from '../../components/TableContextMenu'
import EcIcon from '../../components/ui/EcIcon'
import { ecAlert } from '../../components/EcDialog'
import NoPermissionPage from '../../features/auth/components/NoPermissionPage'
import UserMenu from '../../features/usermenu/UserMenu'
import { FLAT_MENU, isGroup, matchLength, resolveActive, tabLeaves, withMyFolders, type FlatItem, type Leaf, type SideNode, type Tab, type TopMenu } from './menu'

/** 이카운트 v5 실제 레이아웃 재현:
 *  [최상단 북마크바]
 *  [흰 메인메뉴: 로고 + 대메뉴(Depth1) + 아바타]
 *  [탭바: 활성 대메뉴의 탭(Depth2)]
 *  [좌측 사이드바: 활성 탭의 트리(Depth3 그룹 / Depth4 리프)] + [본문] + [우측 세로 앱바]
 */
/**
 * 상단 북마크바 한 칸. 원본은 [즐겨찾기]로 지금 화면을 담거나 뺀다 — 사람마다 매일 여는
 * 화면이 다르다. 우리는 코드에 6개를 박아 둬서 아무도 자기 화면을 담을 수 없었고,
 * 담을 수 없으니 쓸 이유도 없었다. 이제 서버가 사용자별로 들고 있다.
 *
 * <p>브라우저에 저장하지 않은 이유: 그러면 집 PC 와 회사 PC 의 북마크가 달라진다.
 */
interface Bookmark { id: number | null; label: string; path: string; sortOrder: number }

export default function EcountLayout() {
  const { user, logout, canRoute, isHost, companyName } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  /** 메뉴와 견줄 지금 주소 — 경로 + 검색어('?tab=공통양식등록'). matchLength 참고. */
  const here = location.pathname + location.search
  const [hoverIdx, setHoverIdx] = useState<number | null>(null) // 대메뉴 호버 시 뜨는 탭바
  const [menuQuery, setMenuQuery] = useState('')                // 메뉴검색 입력값
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])    // 상단 북마크바 (사용자별)
  const [sitemapOpen, setSitemapOpen] = useState(false)         // 사이트맵 모달
  const [sitemapIdx, setSitemapIdx] = useState(0)               // 사이트맵 좌측 레일 선택
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}) // 사이드바 그룹 접힘
  /* 앱바 [권한있는메뉴만보기] — 켜면 권한 없는 메뉴를 숨기고, 끄면(기본) 모두 보인다(권한 없는 화면은 열면 🔒 자물쇠 화면).
     기본이 꺼짐인 근거: 원본은 권한 없는 사용자에게도 왼쪽 · 위 메뉴가 그대로 보이고 누르면 자물쇠 화면이다
     (2026-10-30 loginaa 데모 사용자의 사용자관리 · 결재설정, 영상 1998 · 1514 의 판매입력 · 매출전표 I). */
  const [permOnly, setPermOnly] = useState(() => localStorage.getItem('ec-perm-only') === 'y')
  /* 머리 로고 자리 · 창 제목의 상호 — 로그인 때 받은 이름으로 시작해 회사정보(/company)를 다시 읽고,
     회사정보 화면에서 저장하면(erp:company-updated) 바로 따라 바뀐다 */
  const [brand, setBrand] = useState<string | null>(companyName)
  /* 회사 로고(마크) — 있으면 머리 로고 자리에 상호 글자 대신 그림, 탭 아이콘도 그 그림(회사정보관리에서 올림).
     그림은 인증이 필요한 /company/logo 라 blob 으로 받아 임시 URL 을 쓴다. */
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let url: string | null = null
    const showLogo = (has: boolean | undefined) => {
      if (!has) { if (alive) setLogoUrl(null); return }
      api.get('/company/logo', { responseType: 'blob' })
        .then((r) => {
          if (!alive) return
          if (url) URL.revokeObjectURL(url)
          url = URL.createObjectURL(r.data as Blob)
          setLogoUrl(url)
        })
        .catch(() => { if (alive) setLogoUrl(null) })
    }
    api.get<{ name?: string; hasLogo?: boolean }>('/company')
      .then((r) => { if (!alive) return; if (r.data?.name) setBrand(r.data.name); showLogo(r.data?.hasLogo) })
      .catch(() => {})
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent<{ name?: string; hasLogo?: boolean }>).detail
      if (d?.name) setBrand(d.name)
      if (d && 'hasLogo' in d) showLogo(d.hasLogo)
    }
    window.addEventListener('erp:company-updated', onUpdate)
    return () => { alive = false; if (url) URL.revokeObjectURL(url); window.removeEventListener('erp:company-updated', onUpdate) }
  }, [])
  /* 탭 아이콘 — 로고가 있으면 그 그림, 없으면 처음 아이콘(index.html)으로 */
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!link) return
    if (!link.dataset.defaultHref) { link.dataset.defaultHref = link.getAttribute('href') ?? ''; link.dataset.defaultType = link.type }
    if (logoUrl) { link.href = logoUrl; link.removeAttribute('type') }
    else { link.href = link.dataset.defaultHref ?? '/favicon.svg'; if (link.dataset.defaultType) link.type = link.dataset.defaultType }
  }, [logoUrl])
  const [folders, setFolders] = useState<MyFolder[] | null>(null)  // MyPage 나만의 업무 폴더 (사용자별)                 // 쪽지 안 읽은 수
  // 휴대폰·태블릿(≤768px, 원본 실측) — ☰ 메뉴판과 ★ 즐겨찾기 · 앱 모음 펼침
  const [drawer, setDrawer] = useState<{ top: number; tab: number } | null>(null)
  const [mPanel, setMPanel] = useState<'fav' | 'apps' | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)               // 본문 영역(표 우클릭 메뉴가 감시)

  // 상단 북마크바. 아무것도 담지 않은 사람에게는 서버가 기본 여섯을 내려 준다.
  useEffect(() => {
    api.get<Bookmark[]>('/bookmarks')
      .then((r) => setBookmarks(r.data))
      .catch(() => setBookmarks([]))
  }, [])

  /*
   * 지금 화면이 메뉴의 어느 항목인가. <b>가장 구체적인 것</b>을 고른다 —
   * '/sales' 가 '/sales/partners' 를 삼키면 북마크 이름이 엉뚱해진다.
   * 메뉴에 없는 화면(상세·모달 경로)은 이름을 붙일 수 없어 담지 않는다.
   */
  const currentLeaf = useMemo(() => {
    let best: FlatItem | null = null
    for (const f of FLAT_MENU) {
      if (matchLength(f.to, here) > 0
          && (!best || f.to.length > best.to.length)) best = f
    }
    return best
  }, [here])
  const bookmarked = !!currentLeaf && bookmarks.some((b) => b.path === currentLeaf.to)

  async function toggleBookmark() {
    if (!currentLeaf) return
    try {
      const res = bookmarked
        ? await api.delete<Bookmark[]>(`/bookmarks?path=${encodeURIComponent(currentLeaf.to)}`)
        : await api.post<Bookmark[]>('/bookmarks', { label: currentLeaf.label, path: currentLeaf.to })
      setBookmarks(res.data)
    } catch {
      /* 북마크는 곁다리다 — 실패해도 화면을 막지 않는다. */
    }
  }

  // 폴더는 폴더 설정 화면에서 바뀐다 — 그 화면이 바뀐 목록을 창 이벤트로 실어 보낸다(features/mypage/api).
  useEffect(() => {
    myFolders.list().then(setFolders).catch(() => setFolders(null))
    const onChange = (e: Event) => setFolders((e as CustomEvent<MyFolder[]>).detail)
    window.addEventListener(MY_FOLDERS_EVENT, onChange)
    return () => window.removeEventListener(MY_FOLDERS_EVENT, onChange)
  }, [])
  const NAV = useMemo(() => withMyFolders(folders), [folders])

  const menuPin = (location.state as { menuPin?: [number, number] } | null)?.menuPin
  const [topIdx, tabIdx] = useMemo(() => resolveActive(here, menuPin, NAV), [here, menuPin, NAV])
  const activeTop = NAV[topIdx]
  const activeTab = activeTop.tabs[tabIdx]
  /* 첫 화면(위젯) — 원본은 1단 어느 것도 켜지 않고 2단 · 왼쪽 메뉴 없이 위젯만 넓게 편다(2026-10-30 loginaa) */
  const isHome = location.pathname === '/'

  // 권한에 따른 메뉴 노출 판정. 리프는 라우트 권한으로, 상위는 하위가 하나라도 보이면 보인다.
  // 회사관리(/companies)는 본사에서만 노출한다.
  /* 지금 연 화면은 권한이 없어도(자물쇠 화면) 메뉴에 남아 켜져 있다 — 원본 실측 */
  const leafOk = (l: Leaf) =>
    (l.to === '/companies' ? isHost : true) && (!permOnly || !l.to || canRoute(l.to) || matchLength(l.to, here) > 0)
  const nodeOk = (n: SideNode) => (isGroup(n) ? n.children.some(leafOk) : leafOk(n))
  const tabOk = (t: Tab) => t.nodes.some(nodeOk)
  const topOk = (m: TopMenu) => m.tabs.some(tabOk)
  // 대메뉴/탭을 클릭했을 때 이동할 "접근 가능한" 첫 라우트 (권한 없는 첫 화면으로 튀지 않게)
  const firstAllowedTabRoute = (t: Tab) => tabLeaves(t).find((l) => l.to && canRoute(l.to))?.to
  /** 2단을 누르면 여는 화면 — 원본이 정해 둔 처음 화면(home), 권한이 없으면 첫 화면. 1단도 첫 2단의 이 화면으로 간다. */
  const tabRoute = (t: Tab) => (t.home && canRoute(t.home) ? t.home : firstAllowedTabRoute(t))

  // 메뉴검색: 입력값이 있으면 부분일치 결과(최대 12개). 권한 없는 항목은 제외.
  const menuMatches = menuQuery.trim()
    ? FLAT_MENU.filter((x) => x.label.toLowerCase().includes(menuQuery.trim().toLowerCase()))
        .filter((x) => canRoute(x.to))
        .slice(0, 12)
    : []

  /** pin — 누른 메뉴의 [대메뉴, 탭]. 같은 화면이 MyPage 폴더와 제 모듈에 함께 걸릴 때 어느 쪽을 켤지 정한다. */
  function gotoMenu(to: string, pin?: [number, number]) {
    setMenuQuery('')
    setSitemapOpen(false)
    setHoverIdx(null)
    navigate(to, pin ? { state: { menuPin: pin } } : undefined)
  }

  function openLeaf(leaf: Leaf) {
    if (leaf.to) gotoMenu(leaf.to, [topIdx, tabIdx])
    else void ecAlert(`[${leaf.label}] 메뉴는 준비 중입니다.`)
  }

  // 2단 메뉴 — 머리 메뉴 아래 떠 있는 흰 알약 판(styles/shell.css .ec-subnav)
  function subnav(menu: TopMenu, activeTabIdx: number | null) {
    if (menu.tabs.length < 2) return null
    return (
      <ul className="ec-subnav">
        {menu.tabs.map((tab, i) => {
          if (!tabOk(tab)) return null
          /* 키는 [1단:2단] 자리 — 이름으로 두면 같은 이름 2단이 둘일 때(2026-10-28 회계 II '전자계약') 1단을 오가며 다시 그릴 때
             React 가 옛 li 를 못 지워 2단이 겹쳐 쌓였다. 2단을 누르면 원본처럼 왼쪽 메뉴 펼침을 처음 상태로 되돌린다. */
          return (
            <li key={`${NAV.indexOf(menu)}:${i}`}>
              <button
                className={`ec-subnav-item${i === activeTabIdx ? ' active' : ''}`}
                onClick={() => { const to = tabRoute(tab); if (to) { setCollapsed({}); gotoMenu(to, [NAV.indexOf(menu), i]) } }}
              >
                {tab.label}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  /* 가장 길게 맞는 메뉴 하나만 켠다 — '/accounting/withholding' 과 '/accounting/withholding/pdf' 가 함께 켜지지 않게 */
  const bestLeafLen = Math.max(0, ...FLAT_MENU.map((f) => matchLength(f.to, here)))
  /* 같은 길이로 둘이 걸리면(탭 없이 연 설정 화면 — 공통양식등록 · 결재설정) 메뉴 차례로 앞의 것 하나만 켠다 */
  const activeLeafTo = bestLeafLen > 0 ? FLAT_MENU.find((f) => matchLength(f.to, here) === bestLeafLen)?.to : undefined

  const locked = !canRoute(location.pathname)
  /* 창(탭) 제목 = 지금 화면 이름 - 상호 (원본도 탭 제목이 화면 이름이다). 메뉴에 없는 화면은 상호만 */
  useEffect(() => {
    const leaf = activeLeafTo ? FLAT_MENU.find((f) => f.to === activeLeafTo) : undefined
    const site = brand || '제조 ERP'
    /* 막힌 화면은 원본처럼 창 제목이 '권한없음' */
    document.title = !locked ? (leaf ? `${leaf.label} - ${site}` : site) : '권한없음'
  }, [activeLeafTo, brand, locked])
  function sidebarLeaf(leaf: Leaf, key: number) {
    const on = !!leaf.to && leaf.to === activeLeafTo
    return (
      <button
        key={key}
        className={`ec-lnb-leaf${on ? ' active' : ''}${leaf.to ? '' : ' off'}`}
        onClick={() => openLeaf(leaf)}
      >
        {leaf.label}
      </button>
    )
  }

  // 화면을 옮기면 ☰ 메뉴판 · 펼침은 닫는다(휴대폰에서 메뉴를 고르면 바로 그 화면을 봐야 한다)
  useEffect(() => { setDrawer(null); setMPanel(null) }, [location.pathname])

  // ☰ 메뉴판 — 원본 휴대폰 화면: 왼쪽 열은 1단(고른 것 아래 2단 카드), 오른쪽 열은 그 2단의 3·4단 나무
  function mobileDrawer(at: { top: number; tab: number }) {
    const top = NAV[at.top]
    const tab = top.tabs[at.tab] ?? top.tabs[0]
    return (
      <div className="ec-drawer">
        <div className="ec-drawer-tops">
          {NAV.map((m, idx) => {
            if (!topOk(m)) return null
            const on = idx === at.top
            return (
              <div key={m.label}>
                <button className={`ec-drawer-top${on ? ' active' : ''}`} onClick={() => setDrawer({ top: idx, tab: 0 })}>{m.label}</button>
                {on && m.tabs.length > 1 && (
                  <ul className="ec-drawer-tabs">
                    {m.tabs.map((t, ti) => tabOk(t) && (
                      <li key={ti}>
                        <button className={`ec-drawer-tab${ti === at.tab ? ' active' : ''}`} onClick={() => setDrawer({ top: idx, tab: ti })}>{t.label}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        <div className="ec-drawer-tree ec-lnb">
          {tab.nodes.map((node, ni) => {
            if (!isGroup(node)) return leafOk(node) ? sidebarLeaf(node, ni) : null
            const kids = node.children.filter(leafOk)
            if (kids.length === 0) return null
            // 왼쪽 메뉴와 같은 규칙 — 지금 화면이 든 묶음만 펼치고 칠한다. 접힌 상태도 왼쪽 메뉴와 같이 쓴다.
            const current = kids.some((c) => !!c.to && matchLength(c.to, here) > 0)
            const key = `${at.top}/${at.tab}/${node.label}`
            const open = key in collapsed ? !collapsed[key] : current || !!tab.open?.includes(node.label)
            return (
              <div key={ni}>
                <button className={`ec-lnb-group${open ? ' open' : ''}${current ? ' current' : ''}`}
                        onClick={() => setCollapsed((c) => ({ ...c, [key]: open }))}>{node.label}</button>
                {open && <div className="ec-lnb-leaves">{kids.map((c, ci) => sidebarLeaf(c, ci))}</div>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 화면이 하나뿐인 메뉴(MyPage)는 원본처럼 왼쪽 메뉴 없이 본문을 넓게 쓴다
  const leafCount = activeTab.nodes.reduce((n, node) => n + (isGroup(node) ? node.children.length : 1), 0)
  const showLnb = leafCount > 1 && !isHome

  return (
    <div className="ec-shell">
      {/* ===== 최상단 북마크 줄 ===== */}
      {/* 휴대폰 폭에서 ★ 를 누르면 이 줄이 머리 아래를 덮는 판이 된다(shell.css .ec-bookbar.m-open, 원본 wrapper-frame-bookmark) */}
      <div className={`ec-bookbar${mPanel === 'fav' ? ' m-open' : ''}`}>
        <div className="ec-bookbar-search">
          <span className="icon"><EcIcon name="search" size={12} /></span>
          <input
            placeholder="메뉴검색"
            value={menuQuery}
            onChange={(e) => setMenuQuery(e.target.value)}
            onBlur={() => window.setTimeout(() => setMenuQuery(''), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && menuMatches[0]) gotoMenu(menuMatches[0].to) }}
          />
          <button className="ec-chip" onClick={() => { setSitemapIdx(isHome ? 0 : topIdx); setSitemapOpen(true) }}>사이트맵</button>
          {menuMatches.length > 0 && (
            <div className="ec-popover" style={{ left: 0, right: 'auto', top: '100%', marginTop: 3, minWidth: 260, maxHeight: 320, overflowY: 'auto', padding: 4 }}>
              {menuMatches.map((x, i) => (
                // onMouseDown로 input의 onBlur보다 먼저 이동을 처리한다
                <button
                  key={`${x.to}-${i}`}
                  onMouseDown={(e) => { e.preventDefault(); gotoMenu(x.to) }}
                  className="ec-lnb-leaf"
                  style={{ color: 'var(--ec-text)' }}
                >
                  {x.label}
                  <span className="text-[11px] text-ec-hint ml-[6px] font-normal">{x.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 원본에서 이 글은 회사가 이름을 바꿔 둔 북마크다 — 누르면 품목등록 리스트(E040103)로 간다(2026-10-30 loginaa) */}
        <NavLink to="/inventory/items" className="ec-bookbar-hint">★ 자주 사용하는 메뉴를 즐겨찾기로 추가할 수 있습니다 ★</NavLink>
        {bookmarks.map((b, i) => (
          <NavLink key={b.path + i} to={b.path} className={({ isActive }) => `ec-bookmark${isActive ? ' active' : ''}`}>
            {b.label}
          </NavLink>
        ))}
        {/* 지금 화면을 담거나 뺀다. 메뉴에 없는 화면은 이름을 붙일 수 없어 담지 않는다. */}
        <button className={`ec-bookbar-star${bookmarked ? ' on' : ''}`} title={bookmarked ? '북마크에서 빼기' : '이 화면을 북마크에 담기'}
                onClick={toggleBookmark} disabled={!currentLeaf}>
          {bookmarked ? <EcIcon name="star" size={13} glyph="★" /> : <EcIcon name="star-outline" size={13} glyph="☆" />}
        </button>
        <span className="ec-bookbar-pin"><EcIcon name="pin" size={13} /></span>
      </div>

      {/* ===== 머리 메뉴(1단) + 떠 있는 2단 메뉴 ===== */}
      <div className="ec-gnb" onMouseLeave={() => setHoverIdx(null)}>
        <Link to="/" className="ec-logo" title={brand ?? undefined}>
          {logoUrl ? <img className="ec-logo-img" src={logoUrl} alt={brand ?? '회사 로고'} />
            : <span className="ec-logo-name">{brand ?? '제조 ERP'}</span>}
        </Link>
        {/* 휴대폰·태블릿에서만 — ☰ 메뉴판, ★ 즐겨찾기 */}
        <button className="ec-m-btn ec-m-menu" aria-label="메뉴" onClick={() => { setMPanel(null); setDrawer((d) => (d ? null : { top: topIdx, tab: tabIdx })) }}>☰</button>
        <button className="ec-m-btn ec-m-fav" aria-label="즐겨찾기" onClick={() => { setDrawer(null); setMPanel((p) => (p === 'fav' ? null : 'fav')) }}><EcIcon name="star" glyph="★" /></button>
        <ul className="ec-gnb-menu">
          {NAV.map((m, idx) => {
            if (!topOk(m)) return null
            return (
              <li key={m.label} onMouseEnter={() => setHoverIdx(idx)}>
                <button
                  className={`ec-gnb-item${idx === topIdx && !isHome ? ' active' : ''}`}
                  onClick={() => {
                    // 원본은 1단마다 처음 여는 화면이 따로 있다(재고 I → 판매조회 · 세무 → 부가세신고서(일반) …) — 그 화면이 든 2단을 켠다.
                    const hi = m.home && canRoute(m.home) ? m.tabs.findIndex((t) => tabLeaves(t).some((l) => l.to === m.home)) : -1
                    const ti = hi >= 0 ? hi : m.tabs.findIndex((t) => !!tabRoute(t))
                    const to = hi >= 0 ? m.home : ti >= 0 ? tabRoute(m.tabs[ti]) : undefined
                    if (to) { setCollapsed({}); gotoMenu(to, [idx, ti]) }
                  }}
                >
                  {m.label}
                </button>
              </li>
            )
          })}
        </ul>
        {/* 다른 대메뉴에 마우스를 올리면 그 메뉴의 2단을, 아니면 지금 메뉴의 2단을 띄운다 */}
        {hoverIdx !== null && (hoverIdx !== topIdx || isHome) ? subnav(NAV[hoverIdx], null) : isHome ? null : subnav(activeTop, tabIdx)}

        <div className="ec-gnb-right">
          <button className="ec-m-apps" aria-label="앱 모음" onClick={() => { setDrawer(null); setMPanel((p) => (p === 'apps' ? null : 'apps')) }}>⋮⋮</button>
          <UserMenu name={user?.name} onLogout={logout} />
        </div>
      </div>

      {drawer && mobileDrawer(drawer)}
      {mPanel === 'apps' && (
        <div className="ec-m-panel ec-m-apps-grid">
          {APP_ITEMS.filter((a) => a.key !== 'hide').map((a) => (
            <button key={a.key} type="button" className="ec-appbar-btn" data-tone={a.tone} onClick={() => { setMPanel(null); openAppBarPanel(a.key) }}>
              <Icon name={a.icon} /><span>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ===== 왼쪽 메뉴 + 본문 틀 + 오른쪽 앱바 ===== */}
      <div className="ec-body">
        {showLnb && (
          <aside className="ec-lnb">
            {activeTab.nodes.map((node, ni) => {
              if (!isGroup(node)) return leafOk(node) ? sidebarLeaf(node, ni) : null
              const visibleChildren = node.children.filter(leafOk)
              if (visibleChildren.length === 0) return null
              const key = `${topIdx}/${tabIdx}/${node.label}`
              // 원본처럼 지금 화면이 든 묶음을 칠하고 펼친다. 원본이 처음부터 펼쳐 두는 묶음(tab.open)도 펼친다. 나머지는 접혀 있다가 누르면 펼친다.
              const current = visibleChildren.some((c) => !!c.to && matchLength(c.to, here) > 0)
              const open = key in collapsed ? !collapsed[key] : current || !!activeTab.open?.includes(node.label)
              return (
                <div key={ni}>
                  <button
                    className={`ec-lnb-group${open ? ' open' : ''}${current ? ' current' : ''}`}
                    onClick={() => setCollapsed((c) => ({ ...c, [key]: open }))}
                  >
                    {node.label}
                  </button>
                  {open && <div className="ec-lnb-leaves">{visibleChildren.map((c, ci) => sidebarLeaf(c, ci))}</div>}
                </div>
              )
            })}
          </aside>
        )}

        <div ref={contentRef} className={`ec-frame${showLnb ? '' : ' full'}${bookmarked ? ' bookmarked' : ''}`}>
          {/* EcListShell 을 쓰지 않는 화면의 표에도 우클릭 메뉴를 붙인다.
              셸이 있는 화면은 셸이 이벤트를 먼저 잡고 전파를 끊으므로 여기까지 오지 않는다. */}
          <TableContextMenu containerRef={contentRef} toolbarRef={contentRef} />
          {canRoute(location.pathname) ? (
            /* 화면 조각(lazy)을 처음 받을 때 본문만 기다린다 — 바깥(router) Suspense 만 있으면 머리 · 메뉴까지 통째로
               '불러오는 중' 으로 바뀌어, 처음 여는 화면이 한 번 빈 흰 화면으로 보였다(데이터이관 루프 19 · 출하입력). */
            <Suspense fallback={<div className="p-[24px] text-ec-hint text-[13px]">화면을 불러오는 중…</div>}>
              <Outlet />
            </Suspense>
          ) : (
            <NoPermissionPage key={location.pathname} path={location.pathname}
                              menuName={activeLeafTo ? FLAT_MENU.find((f) => f.to === activeLeafTo)?.label : undefined} />
          )}
        </div>

        {/* 오른쪽 세로 앱바 + 앱바 창(features/appbar) — 창은 화면에 고정 배치라 앱바가 숨는 휴대폰 폭에서도 뜬다 */}
        <AppBar companyName={brand} permOnly={permOnly}
                onPermOnly={(on) => { setPermOnly(on); localStorage.setItem('ec-perm-only', on ? 'y' : 'n') }} />
      </div>

      {/* 사이트맵 — 원본(2026-10-30 loginaa): 화면을 덮는 판, 왼쪽 파란 세로 줄에 1단, 오른쪽에 1단 전부를 차례로
          (회색 제목 줄 + 2단 열 + 그 아래 묶음 · 화면). 왼쪽을 누르면 그 1단으로 내려간다. 오른쪽 위 ✕ 로 닫는다. */}
      {sitemapOpen && (
        <div className="ec-sitemap-back" onClick={() => setSitemapOpen(false)}>
          <div className="ec-sitemap" role="dialog" aria-label="사이트맵" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ec-sitemap-close" aria-label="닫기" onClick={() => setSitemapOpen(false)}><EcIcon name="close" size={14} glyph="✕" /></button>
            <div className="ec-sitemap-rail">
              {NAV.map((m, i) => (
                !topOk(m) ? null :
                <button key={m.label} type="button" className={i === sitemapIdx ? 'on' : ''}
                        onClick={() => { setSitemapIdx(i); document.getElementById(`ec-sitemap-${i}`)?.scrollIntoView({ block: 'start' }) }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="ec-sitemap-body">
              {NAV.map((m, mi) => (
                !topOk(m) ? null :
                <section key={m.label} id={`ec-sitemap-${mi}`}>
                  <div className="ec-sitemap-top">{m.label}</div>
                  <div className="ec-sitemap-cols">
                    {m.tabs.map((tab) => (
                      !tabOk(tab) ? null :
                      <div key={tab.label} className="ec-sitemap-col">
                        <div className="ec-sitemap-tab">{tab.label}</div>
                        {tab.nodes.map((node) =>
                          isGroup(node) ? (
                            node.children.some(leafOk) ? (
                              <div key={node.label} className="ec-sitemap-group">
                                <div className="name">{node.label}</div>
                                {node.children.filter(leafOk).map((c) => (
                                  <button key={c.label} type="button" disabled={!c.to} onClick={() => c.to && gotoMenu(c.to)}>· {c.label}</button>
                                ))}
                              </div>
                            ) : null
                          ) : !leafOk(node) ? null : (
                            <button key={node.label} type="button" className="leaf" disabled={!node.to} onClick={() => node.to && gotoMenu(node.to)}>{node.label}</button>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
