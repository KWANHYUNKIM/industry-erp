import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import type { Currency, CurrencyConversion, ExchangeRate } from '../../api/types'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => n.toLocaleString('ko-KR')
const rateText = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

const TABS = ['통화등록', '고시환율'] as const
type Tab = (typeof TABS)[number]

/**
 * 기초등록 > 외화 — 통화 마스터와 일자별 고시환율.
 * 원화(KRW)는 기준통화라 등록 대상이 아니다.
 * 환산은 기준일에 고시가 없으면 직전 고시를 적용한다(주말·휴일 공백).
 */
export default function CurrencyPage() {
  const [tab, setTab] = useState<Tab>('통화등록')
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3000) }

  async function load() {
    setLoading(true)
    try {
      const [c, r] = await Promise.all([
        api.get<Currency[]>('/currencies'),
        api.get<ExchangeRate[]>('/currencies/rates'),
      ])
      setCurrencies(c.data)
      setRates(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <EcListShell
      title="외화 (통화·고시환율)"
      newLabel={showForm ? '입력닫기' : `${tab === '통화등록' ? '통화 등록' : '환율 등록'}(F2)`}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: tab === t ? 700 : 400,
            borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({t === '통화등록' ? currencies.length : rates.length})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11.5, color: '#8a929c' }}>
          원화(KRW)는 기준통화라 등록하지 않습니다.
        </span>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <Modal open={showForm && tab === '통화등록'} title="외화 (통화·고시환율) 등록" onClose={() => setShowForm(false)}>{(
        <CurrencyForm onError={setError} onSaved={() => { setShowForm(false); flash('통화를 등록했습니다.'); load() }} />
      )}</Modal>
      <Modal open={showForm && tab === '고시환율'} title="외화 (통화·고시환율) 등록" onClose={() => setShowForm(false)}>{(
        <RateForm currencies={currencies} onError={setError}
          onSaved={(r) => { setShowForm(false); flash(`${r.currencyCode} ${r.rateDate} 환율 ${rateText(r.rate)}원 등록`); load() }} />
      )}</Modal>

      {tab === '고시환율' && <Converter currencies={currencies} onError={setError} />}

      {loading ? <p style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</p>
        : tab === '통화등록' ? <CurrencyTable rows={currencies} />
        : <RateTable rows={rates} />}
    </EcListShell>
  )
}

function CurrencyTable({ rows }: { rows: Currency[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 80 }}>통화코드</th>
          <th style={{ width: 160 }}>통화명</th>
          <th style={{ width: 70, textAlign: 'center' }}>기호</th>
          <th style={{ width: 90, textAlign: 'right' }}>고시단위</th>
          <th style={{ width: 150, textAlign: 'right' }}>최근 고시환율</th>
          <th style={{ width: 110 }}>고시일</th>
          <th style={{ width: 70, textAlign: 'center' }}>사용</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 통화가 없습니다.</td></tr>
        ) : rows.map((c, i) => (
          <tr key={c.id}>
            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue)' }}>{c.code}</td>
            <td>{c.name}</td>
            <td style={{ textAlign: 'center' }}>{c.symbol ?? ''}</td>
            <td style={{ textAlign: 'right' }}>{c.unit}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>
              {c.latestRate === null ? <span style={{ color: '#c60a2e', fontWeight: 400 }}>미등록</span> : `${rateText(c.latestRate)}원`}
            </td>
            <td style={{ color: '#5a626e' }}>{c.latestRateDate ?? ''}</td>
            <td style={{ textAlign: 'center', color: c.active ? '#1c7c3c' : '#8a929c' }}>{c.active ? '사용' : '중지'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RateTable({ rows }: { rows: ExchangeRate[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 110 }}>고시일 ▼</th>
          <th style={{ width: 80 }}>통화</th>
          <th style={{ width: 140 }}>통화명</th>
          <th style={{ width: 90, textAlign: 'right' }}>고시단위</th>
          <th style={{ width: 140, textAlign: 'right' }}>고시환율</th>
          <th style={{ width: 150, textAlign: 'right' }}>1통화당 원화</th>
          <th>등록자</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 환율이 없습니다.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={r.id}>
            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
            <td>{r.rateDate}</td>
            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue)' }}>{r.currencyCode}</td>
            <td>{r.currencyName}</td>
            <td style={{ textAlign: 'right', color: '#5a626e' }}>{r.unit}</td>
            <td style={{ textAlign: 'right', fontWeight: 700 }}>{rateText(r.rate)}원</td>
            <td style={{ textAlign: 'right', color: '#5a626e' }}>{rateText(r.ratePerUnit)}원</td>
            <td style={{ color: '#5a626e' }}>{r.createdBy ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 외화 → 원화 환산 계산기 */
function Converter({ currencies, onError }: { currencies: Currency[]; onError: (m: string) => void }) {
  const usable = currencies.filter((c) => c.active)
  const [currencyId, setCurrencyId] = useState(usable[0] ? String(usable[0].id) : '')
  const [amount, setAmount] = useState('')
  const [baseDate, setBaseDate] = useState(today())
  const [result, setResult] = useState<CurrencyConversion | null>(null)

  async function convert() {
    onError('')
    setResult(null)
    if (!currencyId) return onError('통화를 선택하세요.')
    if (!(Number(amount) > 0)) return onError('환산할 금액을 입력하세요.')
    try {
      const { data } = await api.get<CurrencyConversion>('/currencies/convert', {
        params: { currencyId: Number(currencyId), amount: Number(amount), baseDate },
      })
      setResult(data)
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="통화">
          <select className="ec-input" value={currencyId} onChange={(e) => setCurrencyId(e.target.value)} style={{ width: 150 }}>
            {usable.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
          </select>
        </Field>
        <Field label="외화 금액">
          <input className="ec-input" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 130, textAlign: 'right' }} />
        </Field>
        <Field label="기준일">
          <input className="ec-input" type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} style={{ width: 140 }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={convert}>원화 환산</button>
        {result && (
          <div style={{ fontSize: 13, paddingBottom: 4 }}>
            <b style={{ color: 'var(--ec-blue-dark)', fontSize: 16 }}>{won(result.krwAmount)}원</b>
            <span style={{ color: '#8a929c', marginLeft: 8, fontSize: 11.5 }}>
              {result.appliedRateDate} 고시 {rateText(result.appliedRate)}원 / {result.unit}{result.currencyCode} 적용
              {result.appliedRateDate !== result.baseDate && ' (기준일 고시가 없어 직전 고시 적용)'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function CurrencyForm({ onError, onSaved }: { onError: (m: string) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', symbol: '', unit: '1' })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    onError('')
    if (!form.code) return onError('통화코드를 입력하세요.')
    if (!form.name) return onError('통화명을 입력하세요.')
    try {
      await api.post('/currencies', {
        code: form.code.toUpperCase(),
        name: form.name,
        symbol: form.symbol || undefined,
        unit: Number(form.unit) || 1,
      })
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>통화 등록</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="통화코드 *">
          <input className="ec-input" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} style={{ width: 90 }} placeholder="GBP" maxLength={3} />
        </Field>
        <Field label="통화명 *">
          <input className="ec-input" value={form.name} onChange={(e) => set('name', e.target.value)} style={{ width: 170 }} placeholder="영국 파운드" />
        </Field>
        <Field label="기호">
          <input className="ec-input" value={form.symbol} onChange={(e) => set('symbol', e.target.value)} style={{ width: 70 }} placeholder="£" />
        </Field>
        <Field label="고시단위">
          <input className="ec-input" type="number" min="1" value={form.unit} onChange={(e) => set('unit', e.target.value)} style={{ width: 90, textAlign: 'right' }} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>등록</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        ※ 고시단위는 엔화처럼 100단위로 고시하는 통화에 씁니다(JPY 100 = 950원이면 단위 100, 환율 950).
      </div>
    </div>
  )
}

function RateForm({ currencies, onError, onSaved }: {
  currencies: Currency[]; onError: (m: string) => void; onSaved: (r: ExchangeRate) => void
}) {
  const usable = currencies.filter((c) => c.active)
  const [form, setForm] = useState({
    currencyId: usable[0] ? String(usable[0].id) : '', rateDate: today(), rate: '',
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const selected = usable.find((c) => String(c.id) === form.currencyId)

  async function submit() {
    onError('')
    if (!form.currencyId) return onError('통화를 선택하세요.')
    if (!(Number(form.rate) > 0)) return onError('환율을 입력하세요.')
    try {
      const { data } = await api.post<ExchangeRate>('/currencies/rates', {
        currencyId: Number(form.currencyId),
        rateDate: form.rateDate,
        rate: Number(form.rate),
      })
      onSaved(data)
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 10 }}>고시환율 등록</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="통화 *">
          <select className="ec-input" value={form.currencyId} onChange={(e) => set('currencyId', e.target.value)} style={{ width: 170 }}>
            {usable.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
          </select>
        </Field>
        <Field label="고시일 *">
          <input className="ec-input" type="date" value={form.rateDate} onChange={(e) => set('rateDate', e.target.value)} style={{ width: 140 }} />
        </Field>
        <Field label={`환율 (${selected ? selected.unit : 1}${selected ? selected.code : ''} 당 원화) *`}>
          <input className="ec-input" type="number" step="any" value={form.rate} onChange={(e) => set('rate', e.target.value)} style={{ width: 140, textAlign: 'right' }} placeholder="1385.50" />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>등록</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        ※ 같은 통화의 같은 날 환율은 하나만 등록됩니다. 기준일에 고시가 없으면 환산 시 직전 고시를 적용합니다.
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
