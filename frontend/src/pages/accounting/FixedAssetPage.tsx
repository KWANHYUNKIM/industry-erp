import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/codepicker/CodePickerField'
import type { DepreciationMethod, FixedAsset } from '../../types/api'
import EcPeriodPicks, { INQUIRY_PICKS } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'
import { todayYmd } from '../../utils/periods'
import { fmtNumber } from '../../utils/format'


interface AccountOption {
  id: number
  code: string
  name: string
  division: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  detailCategory: string | null
}

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
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  /** 고칠 자산(원본 고정자산코드 창을 줄에서 연다). */
  const [editing, setEditing] = useState<FixedAsset | null>(null)
  /** 감소(처분) 창 — 원본 E010612. */
  const [disposing, setDisposing] = useState<FixedAsset | null>(null)
  /** 같은 자산에 증가 전표 더하기(원본 E010611 — 10/15 수량 5 · 500,000) */
  const [increasing, setIncreasing] = useState<FixedAsset | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 3500) }

  async function load() {
    setLoading(true)
    try {
      const [a, acc] = await Promise.all([
        api.get<FixedAsset[]>('/fixed-assets', { params: { from: pFrom || undefined, to: pTo || undefined } }),
        api.get<AccountOption[]>('/accounts', { params: { slip: true } }),
      ])
      setAssets(a.data)
      setAccounts(acc.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pFrom, pTo])

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

  return (
    <EcListShell
      title="고정자산"
      newLabel={showForm ? '입력닫기' : '자산등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <div className="text-right mb-[8px] text-[12px] text-ec-label">
        사용중 {inUse.length}건 · 취득가액 {fmtNumber(totalCost)} · 장부가액 <b className="text-ec-navy">{fmtNumber(totalBook)}</b>
      </div>
      {/*
        화면 조건 판의 <b>[기간]</b> — 서버가 이 구간만 준다. 비우면 전 기간이다.
        빠른선택 줄이 없어 기간을 매번 손으로 찍어야 했다. 묶음은 조회 화면 공통(INQUIRY_PICKS)을 쓴다 —
        원본 고정자산대장은 이 계정에 <b>업무 권한이 없어</b> 조건 판을 못 봤다(2026-09-01 확인).
        원본을 열 수 있게 되면 그때 실측해서 묶음과 기본값을 맞춘다.
      */}
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label flex-wrap">
        <span>기간</span>
        <EcDateRange from={{ className: "ec-input", value: pFrom, onChange: (e) => setPFrom(e.target.value) }} to={{ className: "ec-input", value: pTo, onChange: (e) => setPTo(e.target.value) }} />
        <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={pFrom}
                       onPick={(r) => { setPFrom(r.from); setPTo(r.to) }} />
      </div>


      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <Modal error={error} open={showForm || !!editing} title={editing ? '고정자산 수정' : '고정자산 등록'}
             onClose={() => { setShowForm(false); setEditing(null) }}>{(
        <AssetForm key={editing?.id ?? 'new'} asset={editing} accounts={accounts} onError={setError}
                   onSaved={() => { const wasEdit = !!editing; setShowForm(false); setEditing(null); flash(wasEdit ? '자산을 고쳤습니다.' : '자산을 등록했습니다.'); load() }} />
      )}</Modal>
      <Modal error={error} open={!!increasing} title="고정자산증가" onClose={() => setIncreasing(null)}>{(
        increasing && <IncreaseForm key={increasing.id} asset={increasing} accounts={accounts} onError={setError}
                                    onSaved={(m) => { setIncreasing(null); flash(m); load() }} />
      )}</Modal>
      <Modal error={error} open={!!disposing} title="고정자산감소" onClose={() => setDisposing(null)}>{(
        disposing && <DisposeForm key={disposing.id} asset={disposing} accounts={accounts} onError={setError}
                                  onSaved={(m) => { setDisposing(null); flash(m); load() }} />
      )}</Modal>

      {loading ? <p className="ec-empty">불러오는 중…</p>
        : <AssetTable rows={assets} onDispose={(a) => { setError(''); setDisposing(a) }}
                                                   onIncrease={(a) => { setError(''); setIncreasing(a) }}
                                                   onEdit={(a) => { setError(''); setEditing(a) }} onDelete={remove} onCancelDispose={cancelDisposal} />}
    </EcListShell>
  )
}

function AssetTable({ rows, onDispose, onIncrease, onEdit, onDelete, onCancelDispose }: {
  rows: FixedAsset[]; onDispose: (a: FixedAsset) => void; onIncrease: (a: FixedAsset) => void; onEdit: (a: FixedAsset) => void
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
            {/* 사용중이면 남은 취득가 · 남은 누계(감소 전표를 뺀 것), 처분됐으면 증가 합 그대로 */}
            <td className="text-right">{fmtNumber(a.status === 'DISPOSED' ? a.acquisitionCost : a.acquisitionCost - (a.decreasedCost ?? 0))}</td>
            <td className="text-center text-ec-label">
              {a.methodName}{a.declineRate ? ` ${a.declineRate}%` : ''}
            </td>
            <td className="text-center">{a.usefulLifeYears}년</td>
            <td className="text-right text-ec-danger">{fmtNumber(a.status === 'DISPOSED' ? a.accumulatedDepreciation : a.accumulatedDepreciation - (a.decreasedAccum ?? 0))}</td>
            <td className="text-right font-bold">{fmtNumber(a.bookValue)}</td>
            <td style={{ textAlign: 'center', color: a.status === 'IN_USE' ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>
              {a.statusName}{a.status === 'DISPOSED' && a.disposalDate ? ` (${a.disposalDate})` : ''}
            </td>
            <td className="text-center whitespace-nowrap">
              {a.status === 'IN_USE' ? (<>
                <button className="ec-btn ec-btn-sm" onClick={() => onEdit(a)}>수정</button>{' '}
                {a.quantityManaged && <><button className="ec-btn ec-btn-sm" onClick={() => onIncrease(a)}>증가</button>{' '}</>}
                <button className="ec-btn ec-btn-sm" onClick={() => onDispose(a)}>처분</button>{' '}
                {(a.decreasedQuantity ?? 0) > 0
                  ? <button className="ec-btn ec-btn-sm" onClick={() => onCancelDispose(a)}>처분취소</button>
                  : <button className="ec-btn ec-btn-sm" onClick={() => onDelete(a)}>삭제</button>}
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
    acquisitionFee: asset.acquisitionFee ? String(asset.acquisitionFee) : '', partnerId: asset.partnerId ? String(asset.partnerId) : '',
  } : {
    name: '', assetAccountId: '', acquisitionDate: todayYmd(), acquisitionCost: '',
    salvageValue: '', usefulLifeYears: '5', method: 'STRAIGHT_LINE' as DepreciationMethod,
    declineRate: '', remark: '',
    accumAccountId: String(byCode(accounts, '2099') ?? ''), expenseAccountId: String(byCode(accounts, '8239') ?? ''),
    paymentAccountId: String(byCode(accounts, '2519') ?? ''), acquisitionVat: '',
    quantityManaged: 'N', quantity: '1', acquisitionFee: '', partnerId: '',
  })
  const partners = usePartners()
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
      acquisitionFee: Number(form.acquisitionFee) || 0,
      partnerId: form.partnerId ? Number(form.partnerId) : undefined,
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
          <EcDateInput className="ec-input w-[140px]" name="acquisitionDate" value={form.acquisitionDate} onChange={(e) => set('acquisitionDate', e.target.value)} />
        </Field>
        <Field label="취득가액(공급가액) *">
          <input className="ec-input w-[130px] text-right" name="acquisitionCost" type="number" step="any" value={form.acquisitionCost} onChange={(e) => set('acquisitionCost', e.target.value)} />
        </Field>
        <Field label="부가세">
          <input className="ec-input w-[110px] text-right" name="acquisitionVat" type="number" step="any" value={vatTouched ? form.acquisitionVat : String(vat)}
                 onChange={(e) => { setVatTouched(true); set('acquisitionVat', e.target.value) }} />
        </Field>
        <Field label="수수료">
          <input className="ec-input w-[100px] text-right" name="acquisitionFee" type="number" step="any" value={form.acquisitionFee} onChange={(e) => set('acquisitionFee', e.target.value)} />
        </Field>
        <Field label="거래처">
          <PartnerSelect value={form.partnerId} onChange={(v) => set('partnerId', v)} partners={partners} />
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
          월 상각액 ≈ {fmtNumber(monthly)}
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
  const [date, setDate] = useState(todayYmd())
  const [type, setType] = useState<'SALE' | 'SCRAP'>('SALE')
  const [amount, setAmount] = useState('')
  const [vatText, setVatText] = useState<string | null>(null)
  const [receipt, setReceipt] = useState(String(byCode(accounts, '1089') ?? ''))
  const [feeText, setFeeText] = useState('')
  const [partnerId, setPartnerId] = useState(asset.partnerId ? String(asset.partnerId) : '')
  /* 원본 [처분손익계정] 은 필수 — 비면 '처분이익 또는 처분손실 관련 계정을 입력 바랍니다.' */
  const [gainAccount, setGainAccount] = useState('')
  const partners = usePartners()
  /*
   * 수량관리 자산은 일부 감소(원본 E010612 2026-10-21 실측): 수량 · 잔량은 증가 합(앞 감소를 빼지 않는다),
   * 취득원가 = 증가 합계 단가 × 수량, 감가상각누계액은 0 으로 시작해 손으로 넣는다. 처분손익 = 매각액 + 누계 − 취득원가.
   */
  const partial = asset.quantityManaged
  const [qtyText, setQtyText] = useState(String(Number(asset.quantity)))
  const [accumText, setAccumText] = useState('0')
  const qty = Number(qtyText) || 0
  const cost = partial ? Math.round(Number(asset.acquisitionCost) * qty / (Number(asset.quantity) || 1)) : asset.acquisitionCost
  const accum = partial ? (Number(accumText) || 0) : asset.accumulatedDepreciation
  const amt = type === 'SCRAP' ? 0 : (Number(amount) || 0)
  const vat = type === 'SCRAP' ? 0 : vatText !== null ? (Number(vatText) || 0) : Math.floor(amt / 10)
  const gain = amt + accum - cost

  async function submit() {
    onError('')
    if (type === 'SALE' && amt < 0) return onError('매각액이 올바르지 않습니다.')
    if (!gainAccount) return onError('처분이익 또는 처분손실 관련 계정을 입력 바랍니다.')
    const extra = { fee: Number(feeText) || 0, partnerId: partnerId ? Number(partnerId) : undefined, gainLossAccountId: Number(gainAccount) }
    try {
      if (partial) {
        if (qty <= 0) return onError('수량을 입력하세요.')
        await api.post(`/fixed-assets/${asset.id}/decreases`, {
          slipDate: date, quantity: qty, amount: cost, accumAmount: accum, saleAmount: amt, vat, disposalType: type,
          accountId: receipt ? Number(receipt) : undefined, ...extra,
        })
      } else {
        await api.post(`/fixed-assets/${asset.id}/dispose`, {
          disposalDate: date, disposalAmount: amt, disposalType: type, disposalVat: vat,
          receiptAccountId: receipt ? Number(receipt) : undefined, ...extra,
        })
      }
      onSaved(gain === 0 ? '처분했습니다(처분손익 없음).'
        : gain > 0 ? `처분했습니다. 처분이익 ${fmtNumber(gain)}원` : `처분했습니다. 처분손실 ${fmtNumber(-gain)}원`)
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">{asset.assetNo} {asset.name}</div>
      <div className="flex gap-[12px] flex-wrap items-end">
        <Field label="전표일자">
          <EcDateInput className="ec-input w-[140px]" name="disposalDate" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="text-[12.5px] pb-[5px] flex gap-[8px]">
          <label><input type="radio" name="disposalType" checked={type === 'SALE'} onChange={() => setType('SALE')} /> 매각</label>
          <label><input type="radio" name="disposalType" checked={type === 'SCRAP'} onChange={() => setType('SCRAP')} /> 폐기</label>
        </div>
        {partial && <>
          <Field label="수량">
            <input className="ec-input w-[80px] text-right" name="quantity" type="number" step="any" value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
          </Field>
          <Field label="잔량">
            <input className="ec-input w-[80px] text-right" name="remainQuantity" value={String(Number(asset.quantity))} disabled />
          </Field>
        </>}
        <Field label="취득원가">
          <input className="ec-input w-[120px] text-right" name="acquisitionCost" value={fmtNumber(cost)} disabled />
        </Field>
        <Field label="감가상각누계액">
          {partial
            ? <input className="ec-input w-[120px] text-right" name="accumulatedDepreciation" type="number" step="any" value={accumText} onChange={(e) => setAccumText(e.target.value)} />
            : <input className="ec-input w-[120px] text-right" name="accumulatedDepreciation" value={fmtNumber(asset.accumulatedDepreciation)} disabled />}
        </Field>
        <Field label="공급가액(매각액)">
          <input className="ec-input w-[120px] text-right" name="disposalAmount" type="number" step="any" value={type === 'SCRAP' ? '0' : amount}
                 disabled={type === 'SCRAP'} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="부가세">
          <input className="ec-input w-[110px] text-right" name="disposalVat" type="number" step="any" value={String(vat)}
                 disabled={type === 'SCRAP'} onChange={(e) => setVatText(e.target.value)} />
        </Field>
        <Field label="수수료">
          <input className="ec-input w-[100px] text-right" name="disposalFee" type="number" step="any" value={feeText} onChange={(e) => setFeeText(e.target.value)} />
        </Field>
        <Field label="처분이익또는처분손실">
          <input className="ec-input w-[130px] text-right" name="gain" value={fmtNumber(gain)} disabled />
        </Field>
        <Field label="처분손익계정 *">
          <select className="ec-input w-[170px]" name="gainLossAccountId" value={gainAccount} onChange={(e) => setGainAccount(e.target.value)}>
            <option value="">선택하세요</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <Field label="거래처">
          <PartnerSelect value={partnerId} onChange={setPartnerId} partners={partners} />
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

/** 고정자산증가 — 같은 자산코드에 증가 전표 한 장 더(원본 E010611). 부가세는 공급가액의 10% 자동. */
function IncreaseForm({ asset, accounts, onError, onSaved }: {
  asset: FixedAsset; accounts: AccountOption[]; onError: (m: string) => void; onSaved: (msg: string) => void
}) {
  const [date, setDate] = useState(todayYmd())
  const [qtyText, setQtyText] = useState('1')
  const [amount, setAmount] = useState('')
  const [vatText, setVatText] = useState<string | null>(null)
  const [pay, setPay] = useState(String(asset.paymentAccountId ?? byCode(accounts, '2519') ?? ''))
  const [feeText, setFeeText] = useState('')
  const [partnerId, setPartnerId] = useState(asset.partnerId ? String(asset.partnerId) : '')
  const partners = usePartners()
  const amt = Number(amount) || 0
  const vat = vatText !== null ? (Number(vatText) || 0) : Math.floor(amt / 10)

  async function submit() {
    onError('')
    if (!(Number(qtyText) > 0)) return onError('수량을 입력하세요.')
    if (!(amt > 0)) return onError('공급가액을 입력하세요.')
    try {
      await api.post(`/fixed-assets/${asset.id}/increases`, {
        slipDate: date, quantity: Number(qtyText), amount: amt, vat, accountId: pay ? Number(pay) : undefined,
        fee: Number(feeText) || 0, partnerId: partnerId ? Number(partnerId) : undefined,
      })
      onSaved('증가 전표를 저장했습니다.')
    } catch (err) {
      onError(extractErrorMessage(err))
    }
  }

  return (
    <div className="border border-ec-line border-solid bg-white p-[14px] mb-[8px]">
      <div className="text-[13px] font-extrabold text-ec-navy mb-[10px]">{asset.assetNo} {asset.name}</div>
      <div className="flex gap-[12px] flex-wrap items-end">
        <Field label="전표일자">
          <EcDateInput className="ec-input w-[140px]" name="slipDate" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="수량">
          <input className="ec-input w-[80px] text-right" name="quantity" type="number" step="any" value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
        </Field>
        <Field label="공급가액">
          <input className="ec-input w-[120px] text-right" name="amount" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="부가세">
          <input className="ec-input w-[110px] text-right" name="vat" type="number" step="any" value={String(vat)} onChange={(e) => setVatText(e.target.value)} />
        </Field>
        <Field label="수수료">
          <input className="ec-input w-[100px] text-right" name="fee" type="number" step="any" value={feeText} onChange={(e) => setFeeText(e.target.value)} />
        </Field>
        <Field label="거래처">
          <PartnerSelect value={partnerId} onChange={setPartnerId} partners={partners} />
        </Field>
        <Field label="출금계좌">
          <select className="ec-input w-[160px]" name="paymentAccountId" value={pay} onChange={(e) => setPay(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </Field>
        <button className="ec-btn ec-btn-primary" onClick={submit}>저장</button>
      </div>
    </div>
  )
}

interface PartnerOpt { id: number; code: string; name: string }
/** 증가 · 감소 전표의 [거래처] 고르기 목록(원본 고정자산증가 · 감소 전표의 거래처). */
function usePartners() {
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  useEffect(() => { api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([])) }, [])
  return partners
}

function PartnerSelect({ value, onChange, partners }: { value: string; onChange: (v: string) => void; partners: PartnerOpt[] }) {
  return (
    <CodePickerField label="거래처" hideLabel width={160} emptyLabel="(없음)" value={value} onChange={onChange}
                     items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
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
