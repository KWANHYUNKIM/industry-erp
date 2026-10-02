import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { extractErrorMessage } from '../api/client'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [companyCode, setCompanyCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(companyCode, username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(extractErrorMessage(err, '로그인에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ec-page px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ec-text">제조 ERP</h1>
          <p className="mt-1 text-sm text-ec-hint">Manufacturing ERP</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ec-text">회사코드</label>
            <input
              type="text"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-ec-line px-3 py-2 text-ec-text outline-none focus:border-ec-blue focus:ring-2 focus:ring-ec-blue-tint"
              placeholder="회사코드 (본사는 비워두세요)"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ec-text">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-ec-line px-3 py-2 text-ec-text outline-none focus:border-ec-blue focus:ring-2 focus:ring-ec-blue-tint"
              placeholder="아이디를 입력하세요"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ec-text">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-ec-line px-3 py-2 text-ec-text outline-none focus:border-ec-blue focus:ring-2 focus:ring-ec-blue-tint"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-ec-blue py-2.5 font-medium text-white transition hover:bg-ec-blue-hover disabled:opacity-60"
          >
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ec-off">
          본사 초기 계정 — 회사코드 비움 / 아이디: admin / 비밀번호: admin1234
        </p>
      </div>
    </div>
  )
}
