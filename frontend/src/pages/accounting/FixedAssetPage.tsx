import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import type { DepreciationMethod, DepreciationRow, DepreciationRun, FixedAsset } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => new Date().toISOString().slice(0, 7)
const won = (n: number) => n.toLocaleString('ko-KR')

interface AccountOption {
  id: number
  code: string
  name: string
  division: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  detailCategory: string | null
}

const TABS = ['자산목록', '감가상각'] as const
type Tab = (typeof TABS)[number]

/**
 * 회계 I > 고정자산 — 취득 등록 · 월별 감가상각 · 처분.
 * 상각은 차)감가상각비 / 대)감가상각누계액, 처분은 장부에서 자산·누계액을 털고 처분손익을 인식한다.
 */
export default function FixedAssetPage() {
  const [tab, setTab] = useState<Tab>('자산목록')
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [deps, setDeps] = useState<DepreciationRow[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [period, setPeriod] = useState(thisMonth())

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3500) }

  async function load() {
    setLoading(true)
    try {
      const [a, d, acc] = await Promise.all([
        api.get<FixedAsset[]>('/fixed-assets'),
        api.get<DepreciationRow[]>('/fixed-assets/depreciations'),
        api.get<AccountOption[]>('/accounts'),
      ])
      setAssets(a.data)
      setDeps(d.data)
      setAccounts(acc.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function runDepreciation() {
    setError('')
    if (!/^\d{4}-\d{2}$/.test(period)) return setError('귀속월을 yyyy-MM 형식으로 입력하세요.')
    try {
      const { data } = await api.post<DepreciationRun>('/fixed-assets/depreciate', { period })
      flash(data.assetCount === 0
        ? `${data.period} 상각 대상이 없습니다 (건너뜀 ${data.skippedCount}건 — 이미 상각했거나 상각 완료).`
        : `${data.period} 감가상각 ${data.assetCount}건 · 총 ${won(data.totalAmount)}원 (건너뜀 ${data.skippedCount}건)`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function dispose(asset: FixedAsset) {
    const amountText = window.prompt(
      `${asset.name} 처분\n장부가액 ${won(asset.bookValue)}원\n처분가액(매각대금)을 입력하세요. 폐기면 0.`, '0')
    if (amountText === null) return
    const amount = Number(amountText)
    if (Number.isNaN(amount) || amount < 0) return setError('처분가액이 올바르지 않습니다.')
    try {
      await api.post(`/fixed-assets/${asset.id}/dispose`, { disposalDate: today(), disposalAmount: amount })
      const gain = amount - asset.bookValue
      flash(gain === 0 ? '처분했습니다(처분손익 없음).'
        : gain > 0 ? `처분했습니다. 처분이익 ${won(gain)}원` : `처분했습니다. 처분손실 ${won(-gain)}원`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const inUse = assets.filter((a) => a.status === 'IN_USE')
  const totalCost = inUse.reduce((s, a) => s + a.acquisitionCost, 0)
  const totalBook = inUse.reduce((s, a) => s + a.bookValue, 0)
  const shownDeps = useMemo(() => deps.filter((d) => !period || d.period === period), [deps, period])

  return (
    <EcListShell
      title="고정자산"
      newLabel={showForm ? '입력닫기' : '자산등록(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({t === '자산목록' ? assets.length : deps.length})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: '#5a626e' }}>
          사용중 {inUse.length}건 · 취득가액 {won(totalCost)} · 장부가액 <b style={{ color: 'var(--ec-blue-dark)' }}>{won(totalBook)}</b>
        </span>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {tab === '감가상각' && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 8 }}>
          <label style={{ fontSize: 12.5 }}>
            <div style={{ color: '#5a626e', marginBottom: 3 }}>귀속월</div>
            <input className="ec-input" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 140 }} />
          </label>
          <button className="ec-btn ec-btn-primary" onClick={runDepreciation}>감가상각 실행</button>
          <span style={{ fontSize: 11.5, color: '#8a929c', paddingBottom: 5 }}>
            ※ 사용중 자산 전체를 상각하고 차)감가상각비 / 대)감가상각누계액 분개를 만듭니다.
            같은 달을 다시 실행해도 이중 상각되지 않습니다.
          </span>
        </div>
      )}

      {showForm && tab === '자산목록' && (
        <AssetForm accounts={accounts} onError={setError} onSaved={() => { setShowForm(false); flash('자산을 등록했습니다.'); load() }} />
      )}

      {loading ? <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
        : tab === '자산목록' ? <AssetTable rows={assets} onDispose={dispose} />
        : <DepreciationTable rows={shownDeps} period={period} />}
    </EcListShell>
  )
}

function AssetTable({ rows, onDispose }: { rows: FixedAsset[]; onDispose: (a: FixedAsset) => void }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 130 }}>자산번호</th>
          <th>자산명</th>
          <th style={{ width: 110 }}>자산계정</th>
          <th style={{ width: 100 }}>취득일</th>
          <th style={{ width: 110, textAlign: 'right' }}>취득가액</th>
          <th style={{ width: 90, textAlign: 'center' }}>상각방법</th>
          <th style={{ width: 70, textAlign: 'center' }}>내용연수</th>
          <th style={{ width: 110, textAlign: 'right' }}>상각누계액</th>
          <th style={{ width: 110, textAlign: 'right' }}>장부가액</th>
          <th style={{ width: 80, textAlign: 'center' }}>상태</th>
          <th style={{ width: 70, textAlign: 'center' }}>처리</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 고정자산이 없습니다.</td></tr>
        ) : rows.map((a, i) => (
          <tr key={a.id}>
            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
            <td style={{ fontFamily: 'monospace' }}>{a.assetNo}</td>
            <td style={{ fontWeight: 600 }}>{a.name}</td>
            <td style={{ color: '#5a626e' }}>{a.assetAccountName}</td>
            <td>{a.acquisitionDate}</td>
            <td style={{ textAlign: 'right' }}>{won(a.acquisitionCost)}</td>
            <td style={{ textAlign: 'center', color: '#5a626e' }}>
              {a.methodName}{a.declineRate ? ` ${a.declineRate}%` : ''}
            </td>
            <td style={{ textAlign: 'center' }}>{a.usefulLifeYears}년</td>
            <td style={{ textAlign: 'right', color: '#c60a2e' }}>{won(a.accumulatedDepreciation)}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(a.bookValue)}</td>
            <td style={{ textAlign: 'center', color: a.status === 'IN_USE' ? '#1c7c3c' : '#8a929c' }}>
              {a.statusName}{a.status === 'DISPOSED' && a.disposalDate ? ` (${a.disposalDate})` : ''}
            </td>
            <td style={{ textAlign: 'center' }}>
              {a.status === 'IN_USE' && (
                <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => onDispose(a)}>처분</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DepreciationTable({ rows, period }: { rows: DepreciationRow[]; period: string }) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 90 }}>귀속월</th>
          <th style={{ width: 130 }}>자산번호</th>
          <th>자산명</th>
          <th style={{ width: 100 }}>상각일</th>
          <th style={{ width: 110, textAlign: 'right' }}>상각액</th>
          <th style={{ width: 120, textAlign: 'right' }}>상각 후 누계</th>
          <th style={{ width: 120, textAlign: 'right' }}>상각 후 장부가</th>
          <th style={{ width: 140 }}>회계전표</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>{period} 상각 내역이 없습니다.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={r.id}>
            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
            <td>{r.period}</td>
            <td style={{ fontFamily: 'monospace' }}>{r.assetNo}</td>
            <td>{r.assetName}</td>
            <td>{r.depreciationDate}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: '#c60a2e' }}>{won(r.amount)}</td>
            <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(r.accumulatedAfter)}</td>
            <td style={{ textAlign: 'right' }}>{won(r.bookValueAfter)}</td>
            <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{r.journalDocNo ?? ''}</td>
          </tr>
        ))}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={5} style={{ textAlign: 'right' }}>{period} 상각 합계</td>
            <td style={{ textAlign: 'right' }}>{won(total)}</td>
            <td colSpan={3}></td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

function AssetForm({ accounts, onError, onSaved }: {
  accounts: AccountOption[]; onError: (m: string) => void; onSaved: () => void
}) {
  // 감가상각누계액(203)은 차감계정이라 자산 등록 대상에서 뺀다.
  const assetAccounts = useMemo(
    () => accounts.filter((a) => a.division === 'ASSET' && a.code !== '203'), [accounts])
  const [form, setForm] = useState({
    name: '', assetAccountId: '', acquisitionDate: today(), acquisitionCost: '',
    salvageValue: '', usefulLifeYears: '5', method: 'STRAIGHT_LINE' as DepreciationMethod,
    declineRate: '', remark: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const cost = Number(form.acquisitionCost) || 0
  const salvage = Number(form.salvageValue) || 0
  const years = Number(form.usefulLifeYears) || 0
  const monthly = form.method === 'STRAIGHT_LINE'
    ? (years > 0 ? Math.round((cost - salvage) / (years * 12)) : 0)
    : Math.round((cost * (Number(form.declineRate) || 0)) / 100 / 12)

  async function submit() {
    onError('')
    if (!form.name) return onError('자산명을 입력하세요.')
    if (!form.assetAccountId) return onError('자산계정을 선택하세요.')
    if (cost <= 0) return onError('취득가액을 입력하세요.')
    if (years <= 0) return onError('내용연수를 입력하세요.')
    if (form.method === 'DECLINING_BALANCE' && !(Number(form.declineRate) > 0)) {
      return onError('정률법은 연 상각률(%)이 필요합니다.')
    }
    try {
      await api.post('/fixed-assets', {
        name: form.name,
        assetAccountId: Number(form.assetAccountId),
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: cost,
        salvageValue: salvage,
        usefulLifeYears: years,
        method: form.method,
        declineRate: form.method === 'DECLINING_BALANCE' ? Number(form.declineRate) : undefined,
        remark: form.remark || undefined,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>고정자산 등록</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="자산명 *">
          <input className="ec-input" value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 170 }} placeholder="CNC 선반 1호기" />
        </Field>
        <Field label="자산계정 *">
          <select className="ec-input" value={form.assetAccountId} onChange={(e) => set('assetAccountId', e.target.value)} style={{ width: 160 }}>
            <option value="">선택하세요</option>
            {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="취득일 *">
          <input className="ec-input" type="date" value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label="취득가액 *">
          <input className="ec-input" type="number" step="any" value={form.acquisitionCost} onChange={(e) => set('acquisitionCost', e.target.value)} style={{ width: 130, textAlign: 'right' }} />
        </Field>
        <Field label="잔존가액">
          <input className="ec-input" type="number" step="any" value={form.salvageValue} onChange={(e) => set('salvageValue', e.target.value)} style={{ width: 110, textAlign: 'right' }} placeholder="0" />
        </Field>
        <Field label="내용연수 *">
          <input className="ec-input" type="number" min="1" value={form.usefulLifeYears} onChange={(e) => set('usefulLifeYears', e.target.value)} style={{ width: 80, textAlign: 'right' }} />
        </Field>
        <Field label="상각방법 *">
          <select className="ec-input" value={form.method} onChange={(e) => set('method', e.target.value)} style={{ width: 110 }}>
            <option value="STRAIGHT_LINE">정액법</option>
            <option value="DECLINING_BALANCE">정률법</option>
          </select>
        </Field>
        {form.method === 'DECLINING_BALANCE' && (
          <Field label="연 상각률(%) *">
            <input className="ec-input" type="number" step="any" value={form.declineRate} onChange={(e) => set('declineRate', e.target.value)} style={{ width: 100, textAlign: 'right' }} placeholder="45.1" />
          </Field>
        )}
        <div style={{ fontSize: 12.5, paddingBottom: 5, color: 'var(--ec-blue-dark)', fontWeight: 700 }}>
          월 상각액 ≈ {won(monthly)}
        </div>
        <Field label="비고">
          <input className="ec-input" value={form.remark} onChange={(e) => set('remark', e.target.value)} style={{ width: 150 }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>등록</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        ※ 정액법은 (취득가액 − 잔존가액) ÷ 내용연수를 매달 1/12씩, 정률법은 장부가액 × 상각률을 매달 1/12씩 상각합니다. 잔존가액 아래로는 내려가지 않습니다.
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12.5 }}>
      <div style={{ color: '#5a626e', marginBottom: 3 }}>{label}</div>
      {children}
    </label>
  )
}
