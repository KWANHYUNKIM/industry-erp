import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import type { DepreciationMethod, DepreciationRow, DepreciationRun, FixedAsset } from '../../types/api'
import EcPeriodPicks, { ymd, INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

const today = () => ymd(new Date())
const thisMonth = () => ymd(new Date()).slice(0, 7)
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
  /**
   * 화면 조건 판의 <b>[기간]</b>. 서버가 이 구간만 준다 — 전에는 전 기간을 통째로 받았다.
   * 기본은 <b>비워</b> 둔다: 자산은 <b>몇 해를 두고 상각한다</b> — 올해로 자르면 재작년에 산 자산이 목록에서 사라진다.
   */
  /*
   * <b>여기는 기간 기본값을 두지 않는다.</b> 같은 날 회계 화면 넷(빠른전표·어음·수표·계약)에는
   * 금월(~오늘)을 넣었는데 이 화면은 <b>자산대장</b>이라 뜻이 다르다 — 거르는 축이
   * <b>취득일</b>이고, 위 요약이 [사용중 건수 · 취득가액 · 장부가액]을 더한다.
   * 금월로 열면 이번 달에 산 자산만 남아 <b>가진 자산이 사라진 것처럼</b> 보인다.
   * 열자마자 1,776KB 를 받는 것은 그래서 그대로 둔다(2026-09-10 실측).
   */
  const [pFrom, setPFrom] = useState('')
  const [pTo, setPTo] = useState('')
  const [tab, setTab] = useState<Tab>('자산목록')
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [deps, setDeps] = useState<DepreciationRow[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  /** 고칠 자산(원본 고정자산코드 창을 줄에서 연다). */
  const [editing, setEditing] = useState<FixedAsset | null>(null)
  /** 감소(처분) 창 — 원본 E010612. */
  const [disposing, setDisposing] = useState<FixedAsset | null>(null)
  const [period, setPeriod] = useState(thisMonth())

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3500) }

  async function load() {
    setLoading(true)
    try {
      const [a, d, acc] = await Promise.all([
        api.get<FixedAsset[]>('/fixed-assets', { params: { from: pFrom || undefined, to: pTo || undefined } }),
        api.get<DepreciationRow[]>('/fixed-assets/depreciations', { params: { from: pFrom || undefined, to: pTo || undefined } }),
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

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pFrom, pTo])

  async function runDepreciation() {
    setError('')
    if (!/^\d{4}-\d{2}$/.test(period)) return setError('귀속월을 yyyy-MM 형식으로 입력하세요.')
    try {
      const { data } = await api.post<DepreciationRun>('/fixed-assets/depreciate', { period })
      flash(data.assetCount === 0
        ? `${data.period} 상각 대상이 없습니다 (건너뜀 ${data.skippedCount}건 — 이미 상각했거나 상각 완료).`
        : `${data.period} 감가상각 ${data.assetCount}건 · 총 ${won(data.totalAmount)}원 (건너뜀 ${data.skippedCount}건)`
          + (data.gaps?.length ? ` ⚠ 앞 달 상각이 빠져 있습니다 — ${data.gaps.join(' / ')}. 빠진 달부터 차례로 돌리세요.` : ''))
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /** 감가상각 취소 — 그 귀속월 상각 행 · 분개를 지우고 누계액을 되돌린다(원본 감가상각계산 [삭제], 마지막 달부터). */
  async function cancelDepreciation(row?: DepreciationRow) {
    setError('')
    const p = row ? row.period : period
    if (!/^\d{4}-\d{2}$/.test(p)) return setError('귀속월을 yyyy-MM 형식으로 입력하세요.')
    if (!(await ecConfirm(`${p} 감가상각${row ? ` (${row.assetName})` : ''}을 취소합니다. 상각 분개도 함께 삭제됩니다. 삭제하겠습니까?`))) return
    try {
      const { data } = await api.delete<DepreciationRun>('/fixed-assets/depreciations', { params: { period: p, assetId: row?.assetId } })
      flash(`${data.period} 감가상각 ${data.assetCount}건 · ${won(data.totalAmount)}원을 취소했습니다.`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(asset: FixedAsset) {
    if (!(await ecConfirm(`${asset.name} 을(를) 삭제하겠습니까? 취득 전표도 함께 삭제됩니다.`))) return
    try {
      await api.delete(`/fixed-assets/${asset.id}`)
      flash('삭제했습니다.')
      await load()
    } catch (err) {
      await ecAlert(extractErrorMessage(err))
    }
  }

  async function cancelDisposal(asset: FixedAsset) {
    if (!(await ecConfirm(`${asset.name} 감소(처분) 전표를 삭제하겠습니까? 사용중으로 돌아갑니다.`))) return
    try {
      await api.delete(`/fixed-assets/${asset.id}/dispose`)
      flash('처분을 취소했습니다.')
      await load()
    } catch (err) {
      await ecAlert(extractErrorMessage(err))
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
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div className="flex gap-[2px] mb-[8px] border-b border-b-ec-line border-solid">
        {TABS.map((t) => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); setError('') }} className="no-ec" style={{
            padding: '6px 14px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: tab === t ? '#fff' : 'transparent', color: tab === t ? 'var(--ec-blue)' : 'var(--ec-label)',
            fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{t} ({t === '자산목록' ? assets.length : deps.length})</button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--ec-label)' }}>
          사용중 {inUse.length}건 · 취득가액 {won(totalCost)} · 장부가액 <b className="text-ec-navy">{won(totalBook)}</b>
        </span>
      </div>
      {/*
        화면 조건 판의 <b>[기간]</b> — 서버가 이 구간만 준다. 비우면 전 기간이다.
        빠른선택 줄이 없어 기간을 매번 손으로 찍어야 했다. 묶음은 조회 화면 공통(INQUIRY_PICKS)을 쓴다 —
        원본 고정자산대장은 이 계정에 <b>업무 권한이 없어</b> 조건 판을 못 봤다(2026-09-01 확인).
        원본을 열 수 있게 되면 그때 실측해서 묶음과 기본값을 맞춘다.
      */}
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label flex-wrap">
        <span>기간</span>
        <input type="date" className="ec-input" value={pFrom}
               onChange={(e) => setPFrom(e.target.value)} style={{ width: 140 }} />
        <span className="text-ec-label">~</span>
        <input type="date" className="ec-input" value={pTo}
               onChange={(e) => setPTo(e.target.value)} style={{ width: 140 }} />
        <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={pFrom}
                       onPick={(r) => { setPFrom(r.from); setPTo(r.to) }} />
      </div>


      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      {tab === '감가상각' && (
        <div className="flex items-end gap-[10px] border border-ec-line border-solid bg-white p-[12px] mb-[8px]">
          <label className="text-[12.5px]">
            <div className="text-ec-label mb-[3px]">귀속월</div>
            <input className="ec-input" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 140 }} />
          </label>
          <button className="ec-btn ec-btn-primary" onClick={runDepreciation}>감가상각 실행</button>
          <button className="ec-btn" onClick={() => cancelDepreciation()}>감가상각 취소</button>
          <span className="text-[11.5px] text-ec-hint pb-[5px]">
            ※ 사용중 자산 전체를 상각하고 차)감가상각비 / 대)감가상각누계액 분개를 자산마다 고른 계정으로 만듭니다.
            같은 달을 다시 실행해도 이중 상각되지 않습니다. 취소는 마지막 달부터 합니다.
          </span>
        </div>
      )}

      <Modal error={error} open={(showForm || !!editing) && tab === '자산목록'} title={editing ? '고정자산 수정' : '고정자산 등록'}
             onClose={() => { setShowForm(false); setEditing(null) }}>{(
        <AssetForm key={editing?.id ?? 'new'} asset={editing} accounts={accounts} onError={setError}
                   onSaved={() => { const wasEdit = !!editing; setShowForm(false); setEditing(null); flash(wasEdit ? '자산을 고쳤습니다.' : '자산을 등록했습니다.'); load() }} />
      )}</Modal>
      <Modal error={error} open={!!disposing} title="고정자산감소" onClose={() => setDisposing(null)}>{(
        disposing && <DisposeForm key={disposing.id} asset={disposing} accounts={accounts} onError={setError}
                                  onSaved={(m) => { setDisposing(null); flash(m); load() }} />
      )}</Modal>

      {loading ? <p className="ec-empty">불러오는 중…</p>
        : tab === '자산목록' ? <AssetTable rows={assets} onDispose={(a) => { setError(''); setDisposing(a) }}
                                                   onEdit={(a) => { setError(''); setEditing(a) }} onDelete={remove} onCancelDispose={cancelDisposal} />
        : <DepreciationTable rows={shownDeps} period={period} onCancel={cancelDepreciation} />}
    </EcListShell>
  )
}

function AssetTable({ rows, onDispose, onEdit, onDelete, onCancelDispose }: {
  rows: FixedAsset[]; onDispose: (a: FixedAsset) => void; onEdit: (a: FixedAsset) => void
  onDelete: (a: FixedAsset) => void; onCancelDispose: (a: FixedAsset) => void
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th className="w-[34px]"></th>
          <th className="w-[130px]">자산번호</th>
          <th>자산명</th>
          <th className="w-[110px]">자산계정</th>
          <th className="w-[100px]">취득일</th>
          <th className="w-[110px] text-right">취득가액</th>
          <th className="w-[90px] text-center">상각방법</th>
          <th className="w-[70px] text-center">내용연수</th>
          <th className="w-[110px] text-right">상각누계액</th>
          <th className="w-[110px] text-right">장부가액</th>
          <th className="w-[80px] text-center">상태</th>
          <th className="w-[150px] text-center">처리</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        ) : rows.map((a, i) => (
          <tr key={a.id}>
            <td className="text-center text-ec-hint">{i + 1}</td>
            <td>{a.assetNo}</td>
            <td className="font-semibold"><a className="cursor-pointer" onClick={() => onEdit(a)}>{a.name}</a></td>
            <td className="text-ec-label">{a.assetAccountName}</td>
            <td>{dateText(a.acquisitionDate)}</td>
            <td className="text-right">{won(a.acquisitionCost)}</td>
            <td className="text-center text-ec-label">
              {a.methodName}{a.declineRate ? ` ${a.declineRate}%` : ''}
            </td>
            <td className="text-center">{a.usefulLifeYears}년</td>
            <td className="text-right text-ec-danger">{won(a.accumulatedDepreciation)}</td>
            <td className="text-right font-bold">{won(a.bookValue)}</td>
            <td style={{ textAlign: 'center', color: a.status === 'IN_USE' ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>
              {a.statusName}{a.status === 'DISPOSED' && a.disposalDate ? ` (${a.disposalDate})` : ''}
            </td>
            <td className="text-center whitespace-nowrap">
              {a.status === 'IN_USE' ? (<>
                <button className="ec-btn ec-btn-sm" onClick={() => onEdit(a)}>수정</button>{' '}
                <button className="ec-btn ec-btn-sm" onClick={() => onDispose(a)}>처분</button>{' '}
                <button className="ec-btn ec-btn-sm" onClick={() => onDelete(a)}>삭제</button>
              </>) : (
                <button className="ec-btn ec-btn-sm" onClick={() => onCancelDispose(a)}>처분취소</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DepreciationTable({ rows, period, onCancel }: { rows: DepreciationRow[]; period: string; onCancel: (r: DepreciationRow) => void }) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <table className="w-full text-left">
      <thead>
        <tr>
          <th className="w-[34px]"></th>
          <th className="w-[90px]">귀속월</th>
          <th className="w-[130px]">자산번호</th>
          <th>자산명</th>
          <th className="w-[100px]">상각일</th>
          <th className="w-[110px] text-right">상각액</th>
          <th className="w-[120px] text-right">상각 후 누계</th>
          <th className="w-[120px] text-right">상각 후 장부가</th>
          <th className="w-[140px]">회계전표</th>
          <th className="w-[60px] text-center">취소</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={10} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
        ) : rows.map((r, i) => (
          <tr key={r.id}>
            <td className="text-center text-ec-hint">{i + 1}</td>
            <td>{r.period}</td>
            <td>{r.assetNo}</td>
            <td>{r.assetName}</td>
            <td>{dateText(r.depreciationDate)}</td>
            <td className="text-right font-bold text-ec-danger">{won(r.amount)}</td>
            <td className="text-right text-ec-hint">{won(r.accumulatedAfter)}</td>
            <td className="text-right">{won(r.bookValueAfter)}</td>
            <td className="text-ec-blue">{r.journalDocNo ?? ''}</td>
            <td className="text-center"><button className="ec-btn ec-btn-sm" onClick={() => onCancel(r)}>취소</button></td>
          </tr>
        ))}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={5} className="text-right">{period} 상각 합계</td>
            <td className="text-right">{won(total)}</td>
            <td colSpan={4}></td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

/** 계정 하나를 코드로 찾는다(기본값 — 원본 출금계좌 외상매입금 · 입금계좌 외상매출금). */
const byCode = (accounts: AccountOption[], code: string) => accounts.find((a) => a.code === code)?.id

function AssetForm({ asset, accounts, onError, onSaved }: {
  asset: FixedAsset | null; accounts: AccountOption[]; onError: (m: string) => void; onSaved: () => void
}) {
  /*
   * 고정자산은 <b>비유동(유형) 자산 계정</b>(2xx — 기계장치 206 · 차량운반구 208 · 비품 212 …)에만 단다.
   * 예전엔 자산 계정 전부라 현금·외상매출금·원재료에도 고정자산을 등록해 감가상각할 수 있었다(34회차).
   * 감가상각누계액은 차감계정이라 뺀다.
   */
  const assetAccounts = useMemo(
    () => accounts.filter((a) => a.division === 'ASSET' && a.code.startsWith('2') && !a.name.includes('누계')), [accounts])
  /* 원본 E010610 — 자산마다 감가상각충당금계정 · 감가상각비계정을 고른다. */
  const accumAccounts = useMemo(() => accounts.filter((a) => a.name.includes('누계') || a.name.includes('충당')), [accounts])
  const expenseAccounts = useMemo(() => accounts.filter((a) => a.division === 'EXPENSE'), [accounts])
  const [form, setForm] = useState(() => asset ? {
    name: asset.name, assetAccountId: String(asset.assetAccountId), acquisitionDate: asset.acquisitionDate,
    acquisitionCost: String(asset.acquisitionCost), salvageValue: asset.salvageValue ? String(asset.salvageValue) : '',
    usefulLifeYears: String(asset.usefulLifeYears), method: asset.method, declineRate: asset.declineRate ? String(asset.declineRate) : '',
    remark: asset.remark ?? '',
    accumAccountId: asset.accumAccountId ? String(asset.accumAccountId) : '',
    expenseAccountId: asset.expenseAccountId ? String(asset.expenseAccountId) : '',
    paymentAccountId: asset.paymentAccountId ? String(asset.paymentAccountId) : '',
    acquisitionVat: String(asset.acquisitionVat ?? 0),
    quantityManaged: asset.quantityManaged ? 'Y' : 'N', quantity: String(asset.quantity ?? 1),
  } : {
    name: '', assetAccountId: '', acquisitionDate: today(), acquisitionCost: '',
    salvageValue: '', usefulLifeYears: '5', method: 'STRAIGHT_LINE' as DepreciationMethod,
    declineRate: '', remark: '',
    accumAccountId: String(byCode(accounts, '203') ?? ''), expenseAccountId: String(byCode(accounts, '818') ?? ''),
    paymentAccountId: String(byCode(accounts, '251') ?? ''), acquisitionVat: '',
    quantityManaged: 'N', quantity: '1',
  })
  /* 부가세는 공급가액의 10% 로 채워지고, 손으로 고치면 그 값을 쓴다(원본 증가 전표). */
  const [vatTouched, setVatTouched] = useState(!!asset)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const cost = Number(form.acquisitionCost) || 0
  const salvage = Number(form.salvageValue) || 0
  const years = Number(form.usefulLifeYears) || 0
  const vat = vatTouched ? (Number(form.acquisitionVat) || 0) : Math.floor(cost / 10)
  const monthly = form.method === 'STRAIGHT_LINE'
    ? (years > 0 ? Math.round((cost - salvage) / (years * 12)) : 0)
    : Math.round((cost * (Number(form.declineRate) || 0)) / 100 / 12)

  async function submit() {
    onError('')
    if (!form.name) return onError('자산명을 입력하세요.')
    if (!form.assetAccountId) return onError('자산계정을 선택하세요.')
    if (!form.accumAccountId) return onError('감가상각충당금계정을 선택하세요.')
    if (!form.expenseAccountId) return onError('감가상각비계정을 선택하세요.')
    if (cost <= 0) return onError('취득가액을 입력하세요.')
    if (years <= 0) return onError('내용연수를 입력하세요.')
    if (form.quantityManaged === 'Y' && !(Number(form.quantity) > 0)) return onError('수량을 입력하세요.')
    if (form.method === 'DECLINING_BALANCE' && !(Number(form.declineRate) > 0)) {
      return onError('정률법은 연 상각률(%)이 필요합니다.')
    }
    const body = {
      name: form.name,
      assetAccountId: Number(form.assetAccountId),
      acquisitionDate: form.acquisitionDate,
      acquisitionCost: cost,
      salvageValue: salvage,
      usefulLifeYears: years,
      method: form.method,
      declineRate: form.method === 'DECLINING_BALANCE' ? Number(form.declineRate) : undefined,
      remark: form.remark || undefined,
      accumAccountId: Number(form.accumAccountId),
      expenseAccountId: Number(form.expenseAccountId),
      paymentAccountId: form.paymentAccountId ? Number(form.paymentAccountId) : undefined,
      acquisitionVat: vat,
      quantityManaged: form.quantityManaged === 'Y',
      quantity: form.quantityManaged === 'Y' ? Number(form.quantity) : 1,
    }
    try {
      if (asset) await api.put(`/fixed-assets/${asset.id}`, body)
      else await api.post('/fixed-assets', body)
      onSaved()
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">{asset ? `고정자산 수정 — ${asset.assetNo}` : '고정자산 등록'}</div>
      <div className="flex gap-[12px] flex-wrap items-end">
        <Field label="자산명 *">
          <input className="ec-input w-[170px]" name="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="CNC 선반 1호기" />
        </Field>
        <Field label="자산계정 *">
          <select className="ec-input w-[160px]" name="assetAccountId" value={form.assetAccountId} onChange={(e) => set('assetAccountId', e.target.value)}>
            <option value="">선택하세요</option>
            {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="감가상각충당금계정 *">
          <select className="ec-input w-[170px]" name="accumAccountId" value={form.accumAccountId} onChange={(e) => set('accumAccountId', e.target.value)}>
            <option value="">선택하세요</option>
            {accumAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="감가상각비계정 *">
          <select className="ec-input w-[170px]" name="expenseAccountId" value={form.expenseAccountId} onChange={(e) => set('expenseAccountId', e.target.value)}>
            <option value="">선택하세요</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="취득일 *">
          <input className="ec-input w-[140px]" name="acquisitionDate" type="date" value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} />
        </Field>
        <Field label="취득가액(공급가액) *">
          <input className="ec-input w-[130px] text-right" name="acquisitionCost" type="number" step="any" value={form.acquisitionCost} onChange={(e) => set('acquisitionCost', e.target.value)} />
        </Field>
        <Field label="부가세">
          <input className="ec-input w-[110px] text-right" name="acquisitionVat" type="number" step="any" value={vatTouched ? form.acquisitionVat : String(vat)}
                 onChange={(e) => { setVatTouched(true); set('acquisitionVat', e.target.value) }} />
        </Field>
        <Field label="출금계좌">
          <select className="ec-input w-[160px]" name="paymentAccountId" value={form.paymentAccountId} onChange={(e) => set('paymentAccountId', e.target.value)}>
            <option value="">(전표 없음)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="잔존가액">
          <input className="ec-input w-[110px] text-right" name="salvageValue" type="number" step="any" value={form.salvageValue} onChange={(e) => set('salvageValue', e.target.value)} placeholder="0" />
        </Field>
        <Field label="내용연수 *">
          <input className="ec-input w-[80px] text-right" name="usefulLifeYears" type="number" min="1" value={form.usefulLifeYears} onChange={(e) => set('usefulLifeYears', e.target.value)} />
        </Field>
        <Field label="상각방법 *">
          <select className="ec-input w-[110px]" name="method" value={form.method} onChange={(e) => set('method', e.target.value)}>
            <option value="STRAIGHT_LINE">정액법</option>
            <option value="DECLINING_BALANCE">정률법</option>
          </select>
        </Field>
        {form.method === 'DECLINING_BALANCE' && (
          <Field label="연 상각률(%) *">
            <input className="ec-input w-[100px] text-right" name="declineRate" type="number" step="any" value={form.declineRate} onChange={(e) => set('declineRate', e.target.value)} placeholder="45.1" />
          </Field>
        )}
        <div className="text-[12.5px] pb-[5px] text-ec-navy font-bold">
          월 상각액 ≈ {won(monthly)}
        </div>
        <Field label="수량관리">
          <span className="flex gap-[8px] items-center h-[26px]">
            <label><input type="radio" name="quantityManaged" checked={form.quantityManaged === 'Y'} onChange={() => set('quantityManaged', 'Y')} /> 사용</label>
            <label><input type="radio" name="quantityManaged" checked={form.quantityManaged === 'N'} onChange={() => set('quantityManaged', 'N')} /> 사용안함</label>
          </span>
        </Field>
        {form.quantityManaged === 'Y' && (
          <Field label="수량 *">
            <input className="ec-input w-[80px] text-right" name="quantity" type="number" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </Field>
        )}
        <Field label="적요">
          <input className="ec-input w-[150px]" name="remark" value={form.remark} onChange={(e) => set('remark', e.target.value)} />
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>{asset ? '저장' : '등록'}</button>
      </div>
      <div className="mt-[8px] text-[11.5px] text-ec-hint">
        ※ 저장하면 고정자산증가 전표(차) 자산계정 · 부가세대급금 / 대) 출금계좌)가 만들어집니다. 출금계좌를 비우면 전표를 만들지 않습니다.
        정액법은 (취득가액 − 잔존가액) ÷ 내용연수를 매달 1/12씩, 정률법은 기초(회계연도 첫날) 장부가액 × 상각률을 그해 매달 1/12씩 상각합니다.
      </div>
    </div>
  )
}

/**
 * 고정자산감소 — 원본 E010612: ◉매각 ○폐기 · 취득원가 · 감가상각누계액 · 공급가액(매각액) · 부가세(10% 자동) ·
 * 처분이익또는처분손실 · 입금계좌(기본 외상매출금). 처분손익 = 매각액 − (취득원가 − 누계액).
 */
function DisposeForm({ asset, accounts, onError, onSaved }: {
  asset: FixedAsset; accounts: AccountOption[]; onError: (m: string) => void; onSaved: (msg: string) => void
}) {
  const [date, setDate] = useState(today())
  const [type, setType] = useState<'SALE' | 'SCRAP'>('SALE')
  const [amount, setAmount] = useState('')
  const [vatText, setVatText] = useState<string | null>(null)
  const [receipt, setReceipt] = useState(String(byCode(accounts, '108') ?? ''))
  const amt = type === 'SCRAP' ? 0 : (Number(amount) || 0)
  const vat = type === 'SCRAP' ? 0 : vatText !== null ? (Number(vatText) || 0) : Math.floor(amt / 10)
  const gain = amt - (asset.acquisitionCost - asset.accumulatedDepreciation)

  async function submit() {
    onError('')
    if (type === 'SALE' && amt < 0) return onError('매각액이 올바르지 않습니다.')
    try {
      await api.post(`/fixed-assets/${asset.id}/dispose`, {
        disposalDate: date, disposalAmount: amt, disposalType: type, disposalVat: vat,
        receiptAccountId: receipt ? Number(receipt) : undefined,
      })
      onSaved(gain === 0 ? '처분했습니다(처분손익 없음).'
        : gain > 0 ? `처분했습니다. 처분이익 ${won(gain)}원` : `처분했습니다. 처분손실 ${won(-gain)}원`)
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">{asset.assetNo} {asset.name}</div>
      <div className="flex gap-[12px] flex-wrap items-end">
        <Field label="전표일자">
          <input className="ec-input w-[140px]" name="disposalDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="text-[12.5px] pb-[5px] flex gap-[8px]">
          <label><input type="radio" name="disposalType" checked={type === 'SALE'} onChange={() => setType('SALE')} /> 매각</label>
          <label><input type="radio" name="disposalType" checked={type === 'SCRAP'} onChange={() => setType('SCRAP')} /> 폐기</label>
        </div>
        <Field label="취득원가">
          <input className="ec-input w-[120px] text-right" name="acquisitionCost" value={won(asset.acquisitionCost)} disabled />
        </Field>
        <Field label="감가상각누계액">
          <input className="ec-input w-[120px] text-right" name="accumulatedDepreciation" value={won(asset.accumulatedDepreciation)} disabled />
        </Field>
        <Field label="공급가액(매각액)">
          <input className="ec-input w-[120px] text-right" name="disposalAmount" type="number" step="any" value={type === 'SCRAP' ? '0' : amount}
                 disabled={type === 'SCRAP'} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="부가세">
          <input className="ec-input w-[110px] text-right" name="disposalVat" type="number" step="any" value={String(vat)}
                 disabled={type === 'SCRAP'} onChange={(e) => setVatText(e.target.value)} />
        </Field>
        <Field label="처분이익또는처분손실">
          <input className="ec-input w-[130px] text-right" name="gain" value={won(gain)} disabled />
        </Field>
        <Field label="입금계좌">
          <select className="ec-input w-[160px]" name="receiptAccountId" value={receipt} onChange={(e) => setReceipt(e.target.value)}>
            <option value="">101 현금</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[12.5px]">
      <div className="text-ec-label mb-[3px]">{label}</div>
      {children}
    </label>
  )
}
