import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { api, extractErrorMessage } from '../api/client'
import { ecAlert } from '../components/EcDialog'
import '../styles/login.css'

/**
 * 로그인 — login.ecount.com 과 같은 틀(2026-10-30 실측, plans/데이터이관/클릭대조/대조-로그인.md).
 *
 * 가운데 판: 로고 · [회사코드][아이디][비밀번호] 밑줄 칸 · ☐저장 [Code, ID] ☐출근체크 · [로그인] · 아래 링크 줄.
 * 오른쪽 끝: 파란 알약 셋 + 도움 목록. 휴대폰(≤768)에서는 알약이 [로그인] 아래 글자 줄이 되고 도움 목록은 숨는다.
 *
 * 원본처럼 빈 칸으로 [로그인] 을 누르면 글로 알리지 않고 빈 칸을 빨갛게 칠한다(칸에 글자를 넣으면 풀린다).
 * 원본이 다른 사이트 · 상담 창을 여는 링크는 우리에게 없어서 짧은 안내만 띄운다(화면을 떠나지 않는다).
 */

/** 저장 [Code, ID] — 체크하고 들어가면 회사코드 · 아이디를 다음에 채운다. */
const SAVE_KEY = 'erp_login_save'
/** 예전(체크칸 전) 마지막 회사코드 — 있으면 저장된 것으로 읽어 준다. */
const LAST_COMPANY_KEY = 'erp_last_company_code'

type Field = 'code' | 'id' | 'pw'

function readSaved(): { code: string; id: string } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return JSON.parse(raw)
    const old = localStorage.getItem(LAST_COMPANY_KEY)
    if (old) return { code: old, id: '' }
  } catch { /* 저장소를 못 쓰면 빈 칸으로 */ }
  return null
}

/** 원본 언어 목록(글자만 같고, 한국어 말고는 안내만) */
const LANGS = ['한국 (한국어)', 'United States (English)', '中国 (简体中文)', '台湾 (繁體中文)', '日本 (日本語)',
  'Việt Nam (Tiếng Việt)', 'América Latina (Español)', 'Malaysia (English)', 'Indonesia (Bahasa Indonesia)',
  'ประเทศไทย (ไทย)', 'Philippines (English)', 'Uzbekistan (Russian)', '香港 (繁體中文)']

const FAMILY = ['홈페이지', 'Customer Portal', 'UserPay']
const HELP = ['바로가기생성', '전화상담요청', '브라우저 최적화', '접속장애 해결요청', '원격지원', '이메일 문의', 'API']

const NOT_HERE = '이 기능은 이 ERP 에서 제공하지 않습니다.\n회사 관리자에게 문의하세요.'

/* 칸 앞 그림(16×16, 색은 칸 글자색) — 원본 회사 · 사람 · 자물쇠 */
const ICON_CODE = 'M3 1.5h7v13H3zM4.5 3.5h1.5v1.5H4.5zM7 3.5h1.5v1.5H7zM4.5 6.5h1.5V8H4.5zM7 6.5h1.5V8H7zM4.5 9.5h1.5V11H4.5zM7 9.5h1.5V11H7zM11 6h3v8.5h-3z'
const ICON_ID = 'M8 1.5a3.2 3.2 0 1 1 0 6.4a3.2 3.2 0 1 1 0-6.4zM2 14.5c0-3 2.7-5 6-5s6 2 6 5z'
const ICON_PW = 'M5 7V5a3 3 0 0 1 6 0v2h1.5v7.5h-9V7zM6.5 7h3V5a1.5 1.5 0 0 0-3 0zM7.3 9.5h1.4v2.8H7.3z'
const ICON_HELP = 'M8 1a7 7 0 1 1 0 14A7 7 0 1 1 8 1z'

function FieldIcon({ d }: { d: string }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d={d} fillRule="evenodd" /></svg>
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const saved = readSaved()
  const [companyCode, setCompanyCode] = useState(saved?.code ?? '')
  const [username, setUsername] = useState(saved?.id ?? '')
  const [password, setPassword] = useState('')
  const [save, setSave] = useState(!!saved)
  const [clockIn, setClockIn] = useState(false)
  const [errors, setErrors] = useState<Set<Field>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const refs = { code: useRef<HTMLInputElement>(null), id: useRef<HTMLInputElement>(null), pw: useRef<HTMLInputElement>(null) }

  // 탭 제목 — 원본 '이카운트 로그인 | ECOUNT'
  useEffect(() => {
    const prev = document.title
    document.title = '로그인 | 제조 ERP'
    return () => { document.title = prev }
  }, [])

  // 처음 커서 — 비어 있는 첫 칸
  useEffect(() => {
    (!saved?.code ? refs.code : !saved?.id ? refs.id : refs.pw).current?.focus()
  }, [])

  // 언어 목록은 바깥을 누르면 닫는다
  useEffect(() => {
    if (!langOpen) return
    const close = () => setLangOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [langOpen])

  function clearError(f: Field) {
    if (errors.has(f)) setErrors((s) => { const n = new Set(s); n.delete(f); return n })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const empty = new Set<Field>()
    if (!companyCode.trim()) empty.add('code')
    if (!username.trim()) empty.add('id')
    if (!password) empty.add('pw')
    setErrors(empty)
    if (empty.size) {
      refs[(['code', 'id', 'pw'] as Field[]).find((f) => empty.has(f))!].current?.focus()
      return
    }
    setSubmitting(true)
    try {
      await login(companyCode.trim(), username.trim(), password)
    } catch (err) {
      setSubmitting(false)
      await ecAlert(extractErrorMessage(err, '로그인에 실패했습니다.'))
      refs.pw.current?.focus()
      return
    }
    try {
      localStorage.removeItem(LAST_COMPANY_KEY)
      if (save) localStorage.setItem(SAVE_KEY, JSON.stringify({ code: companyCode.trim(), id: username.trim() }))
      else localStorage.removeItem(SAVE_KEY)
    } catch { /* 저장 못 해도 로그인은 됐다 */ }
    if (clockIn) await checkIn()
    navigate('/', { replace: true })
  }

  /** 출근체크 — 오늘 출근 기록이 없을 때만 지금 시각으로 넣는다(이미 있으면 퇴근이 찍히므로 건너뛴다). */
  async function checkIn() {
    try {
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const rows = (await api.get<{ username: string; workDate: string }[]>('/attendances')).data
      if (rows.some((r) => r.workDate === today && r.username === username.trim())) return
      await api.post('/attendances/record', { date: today, time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
        place: '사무실', outsideWork: false, halfLeave: false, reason: '' })
    } catch (err) {
      await ecAlert('출근체크를 못 했습니다.\n' + extractErrorMessage(err))
    }
  }

  const field = (f: Field, icon: string, input: ReactNode) => (
    <div className={`ec-login-field${errors.has(f) ? ' has-error' : ''}`}>
      <FieldIcon d={icon} />
      {input}
    </div>
  )

  return (
    <div className="ec-login">
      <div className="ec-login-contents">
        {/* 원본은 이카운트 로고 그림 — 우리는 앱 이름 */}
        <div className="ec-login-logo">제조 ERP</div>

        <form className="ec-login-form" onSubmit={handleSubmit} noValidate>
          <div>
            {field('code', ICON_CODE, <input ref={refs.code} type="text" name="com_code" maxLength={6} placeholder="회사코드"
              value={companyCode} onChange={(e) => { setCompanyCode(e.target.value); clearError('code') }} />)}
            {field('id', ICON_ID, <input ref={refs.id} type="text" name="id" maxLength={30} autoComplete="username" placeholder="아이디"
              value={username} onChange={(e) => { setUsername(e.target.value); clearError('id') }} />)}
            {field('pw', ICON_PW, <input ref={refs.pw} type="password" name="passwd" autoComplete="current-password" placeholder="비밀번호"
              value={password} onChange={(e) => { setPassword(e.target.value); clearError('pw') }} />)}
          </div>

          <div className="ec-login-option">
            <label className="ec-login-check">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />저장 [Code, ID]
            </label>
            <label className="ec-login-check">
              <input type="checkbox" checked={clockIn} onChange={(e) => setClockIn(e.target.checked)} />출근체크
            </label>
          </div>

          <button type="submit" className="ec-login-submit" disabled={submitting}>로그인</button>
        </form>

        <div className="ec-login-side">
          <div className="ec-login-family">
            {FAMILY.map((t) => (
              <button key={t} type="button" onClick={() => void ecAlert(NOT_HERE)}><span>{t}</span><span>→</span></button>
            ))}
          </div>
          <div className="ec-login-help">
            {HELP.map((t) => (
              <button key={t} type="button" onClick={() => void ecAlert(NOT_HERE)}>{t}<FieldIcon d={ICON_HELP} /></button>
            ))}
          </div>
        </div>

        <ul className="ec-login-links">
          <li>
            <button type="button" onClick={() => void ecAlert('비밀번호를 잊었으면 회사 관리자에게 초기화를 요청하세요.\n(Self-Customizing › 사용자 · 권한)')}>
              비밀번호 찾기
            </button>
          </li>
          <li>
            <button type="button" className="is-bold" onClick={() => void ecAlert('개인정보처리방침은 회사 관리자에게 문의하세요.')}>
              개인정보처리방침
            </button>
          </li>
          <li>
            <button type="button" className="ec-login-lang" onClick={(e) => { e.stopPropagation(); setLangOpen((o) => !o) }}>
              {LANGS[0]}
              <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
            </button>
            {langOpen && (
              <div className="ec-login-lang-menu">
                {LANGS.map((l, i) => (
                  <button key={l} type="button" onClick={() => { setLangOpen(false); if (i) void ecAlert('한국어만 제공합니다.') }}>{l}</button>
                ))}
              </div>
            )}
          </li>
        </ul>
      </div>
    </div>
  )
}
