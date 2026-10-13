import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import EcEmptyRow from '../../components/ui/EcEmptyRow'
import EcHistoryButton from '../../components/EcHistory'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { useShortcut } from '../../utils/useShortcut'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { GRADE_LABELS } from '../../utils/gradePrices'
import type { Item } from '../../types/api'

/**
 * 품목별단가(원본 E040122 · 재고 I › 기초등록 › 단가관리). 2026-10-13 loginaa 에서 잰 것:
 *
 * - 열면 바로 목록: 품목코드 · 품목명 · 규격 · 단위 · 출고단가 · 입고단가 · 단가A ~ 단가J. 단가 칸은 모두 링크(파란 글씨, 오른쪽 맞춤).
 *   하단 [인쇄▲] · [Excel]. 위 오른쪽 검색창 · Search(F3) · 도움말 — 검색창이 빈 채로 Search(F3) 를 누르면 조건 판이 내려온다.
 * - 단가 칸을 누르면 '품목등록' 창이 [단가] 탭으로 뜨고 누른 칸에 커서가 간다(품목코드 · 입고단가 · 출고단가 · 단가A ~ J, 칸마다 VAT포함).
 * - 조건: 품목 · 거래처 · 창고 · 표시조건 1(품목 · 거래처 · 창고 / 코드순 · 코드명순) · 표시조건 2(없음 · 품목 · 거래처 · 창고 / 코드순 · 코드명순) ·
 *   영업단가(기본단가 ☑출고단가 ☐거래처별조정률 · ☐품목그룹별(거래처) ☐품목별(거래처) ☐품목그룹별(창고) ☐품목별(창고)) ·
 *   구매단가(☑입고단가 · 같은 넷) · 단가A to J(☑전체 ☑A … ☑J) · 설정(☑코드포함) · 기타(☐수정일자순(정렬)).
 *   거래처 쪽 칸은 표시조건에 거래처가 있어야 켜진다.
 * - 표시조건 2 = 거래처 · ☑품목별(거래처) 로 [검색(F8)] 하면 품목과 거래처를 골라야 한다 —
 *   거래처 칸 밑 안내 '검색창에 거래처코드를 입력하고 검색 바랍니다.'(품목도 같은 자리에 빨간 테두리). 고르면 열이
 *   품목코드 · 품목명 · 규격 · 단위 · 거래처 · 거래처명 · 출고단가 · 거래처별조정률 · 품목별(거래처) · 입고단가 · 단가A ~ J, 한 줄.
 *
 * 2026-10-14 다시 잼(재고1): 머리 12px **400** 가운데(이 화면은 목록인데 400 — 공용 700 규칙에서 뺀다) · 열 폭 품목코드 144 · 품목명 145 · 단가 칸 100 ·
 *   단가 링크 남색(text-ec-navy) · 머리 오른쪽 Search(F3) · 도움말(Option 없음). 단가 칸 → '품목등록' 창 960(원본은 일곱 탭 다 있는 품목 수정 창이
 *   [단가] 탭으로 열린다 — 버튼 저장(F8) · 복사 · 사용중단/재사용 · 다시 작성 · 닫기 · H). 저장하면 말 없이 닫히고 그 줄이 바뀌며, [H] 에 '수정' 한 줄이 붙는다.
 *
 * 우리에게 없는 것: 창고별 단가(품목그룹별(창고) · 품목별(창고)) · 거래처별조정률 — 담을 자료가 없어 조건에서 뺐다.
 * 품목등록 창의 VAT포함 체크 · 다른 탭(기본 · 수량 · 원가 …)은 품목등록 화면에 있다.
 */
type Axis = '품목' | '거래처'
type Sort = '코드순' | '코드명순'

interface Partner { id: number; code: string | null; name: string; salesPriceGroup: string | null; purchasePriceGroup: string | null }
/** 특별단가(E040124) — 그룹 × 품목 적용단가. 품목그룹별은 적용단가 알약(/applied)의 '품목그룹별' 줄로 본다. */
interface SpecialPrice { kind?: string; groupCode: string; itemId: number; unitPrice: number; active?: boolean }

/** 단가 칸 하나 — 출고 · 입고 · A ~ J. 창이 이 칸에 커서를 둔다. */
type PriceKey = 'unitPrice' | 'purchasePrice' | `g${number}`

const SALES_KEYS = ['salesGroup', 'salesItem'] as const
const BUY_KEYS = ['buyGroup', 'buyItem'] as const
const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('ko-KR')
const ITEM_MSG = '검색창에 품목코드를 입력하고 검색 바랍니다.'
const PARTNER_MSG = '검색창에 거래처코드를 입력하고 검색 바랍니다.'

export default function ItemPricePage() {
  const pickers = useCondPickers(['items', 'partners'])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [specials, setSpecials] = useState<SpecialPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // 조건 — 판에서 고치는 값(draft)과 [검색(F8)] 으로 굳힌 값(applied)을 나눈다(원본도 판만 바꾸면 목록은 그대로다).
  const [itemCond, setItemCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [axis1, setAxis1] = useState<Axis>('품목')
  const [sort1, setSort1] = useState<Sort>('코드순')
  const [axis2, setAxis2] = useState<Axis | '없음'>('없음')
  const [sort2, setSort2] = useState<Sort>('코드순')
  const [outPrice, setOutPrice] = useState(true)
  const [inPrice, setInPrice] = useState(true)
  const [special, setSpecial] = useState({ salesGroup: false, salesItem: false, buyGroup: false, buyItem: false })
  const [grades, setGrades] = useState<boolean[]>(GRADE_LABELS.map(() => true))
  const [withCode, setWithCode] = useState(true)
  const [byUpdated, setByUpdated] = useState(false)
  const [condErr, setCondErr] = useState<{ item?: boolean; partner?: boolean }>({})

  const draft = { itemCond, partnerCond, axis1, sort1, axis2, sort2, outPrice, inPrice, special, grades, withCode, byUpdated }
  const [applied, setApplied] = useState(draft)

  const partnerAxis = axis1 === '거래처' || axis2 === '거래처'
  const anySpecial = Object.values(special).some(Boolean)

  async function load() {
    setLoading(true); setError('')
    try {
      setItems((await api.get<Item[]>('/items')).data)
      // 거래처 · 특별단가는 영업 권한이 없으면 못 읽는다 — 품목 단가만으로도 화면은 돈다.
      const [p, s] = await Promise.allSettled([api.get<Partner[]>('/partners'), api.get<SpecialPrice[]>('/special-prices/applied')])
      if (p.status === 'fulfilled') setPartners(p.value.data)
      if (s.status === 'fulfilled') setSpecials(s.value.data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  /** [검색(F8)] — 거래처 단가를 켜고 품목 · 거래처를 안 고르면 원본처럼 그 칸에 안내를 띄우고 멈춘다. */
  function applyConds() {
    const useSpecial = partnerAxis && anySpecial
    const err = { item: useSpecial && !itemCond, partner: useSpecial && !partnerCond }
    setCondErr(err)
    if (err.item || err.partner) return false
    setApplied({ ...draft, special: partnerAxis ? special : { salesGroup: false, salesItem: false, buyGroup: false, buyItem: false } })
    return true
  }

  const a = applied
  const showPartner = (a.axis1 === '거래처' || a.axis2 === '거래처') && !!a.partnerCond
  const partner = partners.find((p) => String(p.id) === a.partnerCond)

  const specialOf = (type: 'SALES' | 'PURCHASE', itemId: number, byGroup: boolean) => {
    if (!partner) return 0
    // 거래처가 든 특별단가그룹(영업 · 구매 단가그룹 칸 = 그룹 코드)의 적용단가 — 품목별단가 · 품목그룹별
    const group = type === 'SALES' ? partner.salesPriceGroup : partner.purchasePriceGroup
    const hit = !!group && specials.find((s) => s.groupCode === group && s.itemId === itemId &&
      s.kind === (byGroup ? '품목그룹별' : '품목별단가'))
    return hit ? hit.unitPrice : 0
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sortKey = (it: Item) => (a.sort1 === '코드명순' ? it.name : it.code)
    return items
      .filter((it) => !a.itemCond || String(it.id) === a.itemCond)
      .filter((it) => !q || it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
      .sort((x, y) => (a.byUpdated
        ? (y.updatedDate ?? '').localeCompare(x.updatedDate ?? '')
        : sortKey(x).localeCompare(sortKey(y))))
  }, [items, a, search])

  // 열 — 표시조건 차례대로 품목 · 거래처, 그 뒤 단가.
  const keyCols: Axis[] = showPartner ? (a.axis1 === '거래처' ? ['거래처', '품목'] : ['품목', '거래처']) : ['품목']
  const gradeIdx = GRADE_LABELS.map((_, i) => i).filter((i) => a.grades[i])
  const salesSpecial = showPartner ? SALES_KEYS.filter((k) => a.special[k]) : []
  const buySpecial = showPartner ? BUY_KEYS.filter((k) => a.special[k]) : []
  const SPECIAL_LABEL = { salesGroup: '품목그룹별(거래처)', salesItem: '품목별(거래처)', buyGroup: '품목그룹별(거래처)', buyItem: '품목별(거래처)' }
  const keyColCount = keyCols.reduce((n, k) => n + (k === '품목' ? (a.withCode ? 4 : 3) : (a.withCode ? 2 : 1)), 0)
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '품목별단가', [loading, applied, rows.length])
  const colCount = keyColCount + (a.outPrice ? 1 : 0) + salesSpecial.length + (a.inPrice ? 1 : 0) + buySpecial.length + gradeIdx.length

  // ── 품목등록 [단가] 창 ──
  const [edit, setEdit] = useState<Item | null>(null)
  const [focusKey, setFocusKey] = useState<PriceKey>('unitPrice')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [saveErr, setSaveErr] = useState('')
  const firstRef = useRef<HTMLDivElement>(null)
  useShortcut('F8', () => void savePrices(), !!edit)

  function openPrice(it: Item, key: PriceKey) {
    setSaveErr('')
    setEdit(it); setFocusKey(key)
    const v: Record<string, string> = { unitPrice: String(it.unitPrice ?? 0), purchasePrice: String(it.purchasePrice ?? 0) }
    GRADE_LABELS.forEach((_, i) => { v[`g${i}`] = String(it.gradePrices?.[i] ?? 0) })
    setVals(v)
  }
  useEffect(() => {
    if (!edit) return
    const t = window.setTimeout(() => {
      const el = firstRef.current?.querySelector<HTMLInputElement>(`[data-key="${focusKey}"] input`)
      el?.focus(); el?.select()
    }, 50)
    return () => window.clearTimeout(t)
  }, [edit, focusKey])

  async function savePrices() {
    if (!edit) return
    setSaveErr('')
    try {
      await api.patch(`/items/${edit.id}/prices`, {
        unitPrice: Number(vals.unitPrice || 0),
        purchasePrice: Number(vals.purchasePrice || 0),
        gradePrices: GRADE_LABELS.map((_, i) => Number(vals[`g${i}`] || 0)),
      })
      setEdit(null)
      void load()
    } catch (err) { setSaveErr(extractErrorMessage(err)) }
  }

  const priceLink = (it: Item, key: PriceKey, value: number) => (
    <td key={key} className="text-right">
      <a href="#" className="text-ec-navy" onClick={(e) => { e.preventDefault(); openPrice(it, key) }}>{num(value)}</a>
    </td>
  )
  /** [다시 작성] — 창을 연 때 값으로 */
  const resetPrices = () => { if (edit) openPrice(edit, focusKey) }

  const checkbox = (label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className={`inline-flex items-center gap-[3px] mr-[10px]${disabled ? ' text-ec-text-off' : ''}`}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  )
  const axisSelect = (value: string, onChange: (v: string) => void, withNone: boolean) => (
    <select className="ec-input w-[280px] mr-[6px]" value={value} onChange={(e) => onChange(e.target.value)}>
      {withNone && <option>없음</option>}
      <option>품목</option>
      <option>거래처</option>
    </select>
  )
  const sortSelect = (value: Sort, onChange: (v: Sort) => void) => (
    <select className="ec-input w-[280px]" value={value} onChange={(e) => onChange(e.target.value as Sort)}>
      <option>코드순</option>
      <option>코드명순</option>
    </select>
  )
  const specialBoxes = (keys: readonly ('salesGroup' | 'salesItem' | 'buyGroup' | 'buyItem')[]) => keys.map((k) =>
    <span key={k}>{checkbox(SPECIAL_LABEL[k], special[k], (v) => setSpecial((s) => ({ ...s, [k]: v })), !partnerAxis)}</span>)

  return (
    <EcListShell
      title="품목별단가"
      collapseConditions
      option={false}
      search={search}
      onSearchChange={setSearch}
      onSearch={() => applyConds()}
      actions={[{ label: '인쇄', primary: true }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {/* 원본은 판을 연 채 그 칸 밑에 띄운다. 우리 판은 [검색(F8)] 을 누르면 닫히므로 목록 위에도 같은 문구를 낸다. */}
      {(condErr.item || condErr.partner) && (
        <p className="ec-alert ec-alert-danger mb-[8px]">{condErr.item ? ITEM_MSG : PARTNER_MSG}</p>
      )}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={260} emptyLabel="전체" value={itemCond}
            onChange={(v) => { setItemCond(v); setCondErr((e) => ({ ...e, item: false })) }} items={pickers.items} />
          {condErr.item && <span className="ml-[8px] text-ec-danger">{ITEM_MSG}</span>}
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={260} emptyLabel="전체" value={partnerCond}
            onChange={(v) => { setPartnerCond(v); setCondErr((e) => ({ ...e, partner: false })) }} items={pickers.partners} />
          {condErr.partner && <span className="ml-[8px] text-ec-danger">{PARTNER_MSG}</span>}
        </EcCond>
        <EcCond label="표시조건 1">
          {axisSelect(axis1, (v) => setAxis1(v as Axis), false)}
          {sortSelect(sort1, setSort1)}
        </EcCond>
        <EcCond label="표시조건 2">
          {axisSelect(axis2, (v) => setAxis2(v as Axis | '없음'), true)}
          {sortSelect(sort2, setSort2)}
        </EcCond>
        <EcCond label="영업단가">
          <span className="mr-[6px]">기본단가</span>
          {checkbox('출고단가', outPrice, setOutPrice)}
          {checkbox('거래처별조정률', false, () => {}, true)}
          <br />
          {specialBoxes(SALES_KEYS)}
        </EcCond>
        <EcCond label="구매단가">
          <span className="mr-[6px]">기본단가</span>
          {checkbox('입고단가', inPrice, setInPrice)}
          {checkbox('거래처별조정률', false, () => {}, true)}
          <br />
          {specialBoxes(BUY_KEYS)}
        </EcCond>
        <EcCond label="단가A to J">
          {checkbox('전체', grades.every(Boolean), (v) => setGrades(grades.map(() => v)))}
          {GRADE_LABELS.map((g, i) => (
            <span key={g}>{checkbox(`단가${g}`, grades[i], (v) => setGrades(grades.map((x, j) => (j === i ? v : x))))}</span>
          ))}
        </EcCond>
        <EcCond label="설정">{checkbox('코드포함', withCode, setWithCode)}</EcCond>
        <EcCond label="기타">{checkbox('수정일자순(정렬)', byUpdated, setByUpdated)}</EcCond>
      </ul>

      {/* 원본 머리는 400 — ec-report-head400 이 공용 목록 격자 700 규칙에서 뺀다 */}
      <table ref={tableRef} className="w-full ec-report-head400">
        <thead>
          <tr>
            {keyCols.map((k) => (k === '품목'
              ? [a.withCode && <th key="ic" className="w-[144px]">품목코드</th>, <th key="in" className="w-[145px]">품목명</th>,
                 <th key="sp" className="w-[100px]">규격</th>, <th key="un" className="w-[100px]">단위</th>]
              : [a.withCode && <th key="pc">거래처</th>, <th key="pn">거래처명</th>]))}
            {a.outPrice && <th className="w-[100px]">출고단가</th>}
            {salesSpecial.map((k) => <th key={k} className="w-[100px]">{SPECIAL_LABEL[k]}</th>)}
            {a.inPrice && <th className="w-[100px]">입고단가</th>}
            {buySpecial.map((k) => <th key={k} className="w-[100px]">{SPECIAL_LABEL[k]}</th>)}
            {gradeIdx.map((i) => <th key={i} className="w-[100px]">단가{GRADE_LABELS[i]}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading ? <EcEmptyRow colSpan={colCount} loading /> : rows.length === 0 && <EcEmptyRow colSpan={colCount} />}
          {!loading && rows.map((it) => (
            <tr key={it.id}>
              {keyCols.map((k) => (k === '품목'
                ? [a.withCode && <td key="ic">{it.code}</td>, <td key="in">{it.name}</td>, <td key="sp">{it.spec ?? ''}</td>, <td key="un">{it.unit}</td>]
                : [a.withCode && <td key="pc">{partner?.code ?? ''}</td>, <td key="pn">{partner?.name ?? ''}</td>]))}
              {a.outPrice && priceLink(it, 'unitPrice', it.unitPrice)}
              {salesSpecial.map((k) => <td key={k} className="text-right">{num(specialOf('SALES', it.id, k === 'salesGroup'))}</td>)}
              {a.inPrice && priceLink(it, 'purchasePrice', it.purchasePrice)}
              {buySpecial.map((k) => <td key={k} className="text-right">{num(specialOf('PURCHASE', it.id, k === 'buyGroup'))}</td>)}
              {gradeIdx.map((i) => priceLink(it, `g${i}`, it.gradePrices?.[i] ?? 0))}
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!edit} error={saveErr} title="품목등록" width={960} onClose={() => setEdit(null)}>
        <div className="ec-pills mb-[8px]">
          <button type="button" className="ec-pill no-ec active">단가</button>
        </div>
        <div className="ec-form" ref={firstRef}>
          <div className="flex items-center gap-[10px] mb-[6px]">
            <span className="w-[120px] text-ec-label">품목코드</span>
            <span>{edit?.code}</span>
          </div>
          {([['purchasePrice', '입고단가'], ['unitPrice', '출고단가'], ...GRADE_LABELS.map((g, i) => [`g${i}`, `단가${g}`])] as [PriceKey, string][]).map(([key, label]) => (
            <div key={key} data-key={key} className="flex items-center gap-[10px] mb-[6px]">
              <span className="w-[120px] text-ec-label">{label}</span>
              <EcNumInput className="ec-input flex-1 text-right" value={vals[key] ?? ''}
                onValue={(v) => setVals((s) => ({ ...s, [key]: v }))} />
            </div>
          ))}
        </div>
        <div className="flex gap-[4px] mt-[9px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void savePrices()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={resetPrices}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={() => setEdit(null)}>닫기</button>
          <EcHistoryButton target="ITEM" id={edit?.id} />
        </div>
      </Modal>
    </EcListShell>
  )
}
