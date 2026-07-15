import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-800">제조 ERP</h1>
          <p className="mt-1 text-sm text-slate-500">Manufacturing ERP</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">회사코드</label>
            <input
              type="text"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="회사코드 (본사는 비워두세요)"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="아이디를 입력하세요"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          본사 초기 계정 — 회사코드 비움 / 아이디: admin / 비밀번호: admin1234
        </p>
      </div>
    </div>
  )
}
