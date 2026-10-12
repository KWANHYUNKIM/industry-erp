import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import EcNumInput from '../../components/EcNumInput'
import { EcCond } from '../../components/EcStatusPanel'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'

type Side = 'SALES' | 'PURCHASE'
interface PartnerOpt { id: number; code: string; name: string }
interface Voucher {
  id: number; side: Side; sideName: string; entryDate: string; entryNo: number; vatType: string
  partnerId: number; partnerCode: string; partnerName: string
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null
}
interface Form { id?: number; side: Side; entryDate: string; vatType: string; partnerId: string; supply: string; vat: string; remark: string }

/* 원본 [부가세유형] 목록 글자 그대로(2026-10-12 loginaa 실측) — 매출 창과 매입 창이 다르다. */
const SALES_TYPES = [
  '세금계산서', '영세율', '계산서', '소매매출', '수출', '카드매출', '계산서(고정자산)', '세.계(고정자산)', '소매(면세)',
  '카드매출(면세)', '현금영수증(면세)', '현금영수증', '매입자발행세금계산서', '영세율(기타)', '기타매출',
] as const
const PURCHASE_TYPES = [
  '세금계산서', '영세율', '계산서', '세금계산서(불공)', '세금계산서(수입)', '현금영수증', '카드매입', '세.계(고정-수입)',
  '세.계(고정자산)', '영세율(수입)', '계산서(수입)', '세.계(고정-불공)', '계산서(고정자산)', '신용카드(고정자산)',
  '매입자발행세금계산서', '현금영수증(고정자산)', '기타수입', '재활용', '기타매입',
] as const
/* 부가세를 공급가액의 10% 로 채우는 유형 — 영세율 · 계산서(면세) · 수출은 0 이다. */
const TAXED = new Set(['세금계산서', '소매매출', '카드매출', '세.계(고정자산)', '현금영수증', '매입자발행세금계산서', '기타매출',
  '세금계산서(불공)', '세금계산서(수입)', '카드매입', '세.계(고정-수입)', '세.계(고정-불공)', '신용카드(고정자산)', '현금영수증(고정자산)',
  '기타매입'])
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '금년', '전년', '직전분기', '직전반기', '종료일'] as const

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
const today = () => new Date().toLocaleDateString('sv-SE')
const vatOf = (type: string, supply: string) => (TAXED.has(type) ? String(Math.round((Number(supply) || 0) / 10)) : '0')

/**
 * 세무 › 부가세 › 신고전검토자료 › <b>(세금)계산서발행/수령</b>(원본 C000068) — 2026-10-12 loginaa 실측.
 *
 * <p>목록 [☐ · 일자-NO · 구분 · 거래처코드 · 거래처명 · 비고 · 공급가액 · 부가세 · 합계], 기본 조회일자는 올해 1/1 ~ 12/31.
 * 아래 [매출(세금)계산서 ▴(매입(세금)계산서)] · 인쇄 · Excel. 매출 창은 '매출(세금)계산서발행', 매입 창은 '매입(세금)계산서수령' —
 * 전표일자 · 부가세유형 · 거래처 · 공급가액 · 부가세(공급가액 치면 10%) · 비고. 수정 창에서는 전표일자가 막히고 [삭제]가 붙는다
 * ('전표를 삭제하겠습니까?').
 *
 * <p>회계전표와 따로 도는 부가세 신고용 자료다 — 원본에서 저장해도 분개장에 줄이 생기지 않았고, 매출(세금)계산서조회(세무)에
 * [내역보기] '세무' 로만 떴다(우리도 TaxInvoiceListPage 가 그렇게 싣는다).
 *
 * <p>두지 않은 것: 부서코드 · 프로젝트코드 칸, 매출 창의 [세부내역](품목 줄 · 청구/영수 · 현금/수표/어음/외상), [저장/청구서인쇄],
 * 줄의 [인쇄] 열, 조건의 세무신고거래처코드 · 거래처관리담당자 · 최종수정자 — 대조 보드 '남은 것'.
 */
export default function TaxVoucherPage() {
  const year = new Date().getFullYear()
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(`${year}-12-31`)
  const [sideCond, setSideCond] = useState<'' | Side>('')
  const [partnerCond, setPartnerCond] = useState('')
  const [typeCond, setTypeCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [rows, setRows] = useState<Voucher[]>([])
  const [partners, setPartners] = useState<PartnerOpt[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [formError, setFormError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function load() {
    setError('')
    try {
      const r = await api.get<Voucher[]>('/tax-vouchers', { params: { from, to, side: sideCond || undefined } })
      setRows(r.data)
      setPicked(new Set())
    } catch (e) {
      setRows([]); setError(extractErrorMessage(e))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])
  useEffect(() => {
    api.get<PartnerOpt[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [])

  const list = useMemo(() => rows.filter((r) =>
    (!partnerCond || String(r.partnerId) === partnerCond)
    && (!typeCond || r.vatType === typeCond)
    && (!remarkCond.trim() || (r.remark ?? '').includes(remarkCond.trim()))), [rows, partnerCond, typeCond, remarkCond])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '(세금)계산서발행/수령', [list.length])
  const allPicked = list.length > 0 && list.every((r) => picked.has(r.id))

  const open = (side: Side) => {
    setFormError(''); setConfirmDelete(false)
    setForm({ side, entryDate: today(), vatType: '세금계산서', partnerId: '', supply: '0', vat: '0', remark: '' })
  }
  const openRow = (r: Voucher) => {
    setFormError(''); setConfirmDelete(false)
    setForm({ id: r.id, side: r.side, entryDate: r.entryDate, vatType: r.vatType, partnerId: String(r.partnerId),
      supply: String(r.supplyAmount), vat: String(r.vatAmount), remark: r.remark ?? '' })
  }
  const set = (patch: Partial<Form>) => form && setForm({ ...form, ...patch })

  async function save() {
    if (!form) return
    if (!form.partnerId) { setFormError('거래처를 입력 바랍니다.'); return }
    const body = { side: form.side, entryDate: form.entryDate, vatType: form.vatType, partnerId: Number(form.partnerId),
      supplyAmount: Number(form.supply) || 0, vatAmount: Number(form.vat) || 0, remark: form.remark }
    try {
      if (form.id) await api.put(`/tax-vouchers/${form.id}`, body)
      else await api.post('/tax-vouchers', body)
      setForm(null)
      await load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!form?.id) return
    try {
      await api.delete(`/tax-vouchers/${form.id}`)
      setForm(null)
      await load()
    } catch (e) {
      setFormError(extractErrorMessage(e))
    }
  }

  const types = form?.side === 'PURCHASE' ? PURCHASE_TYPES : SALES_TYPES
  const formTitle = form?.side === 'PURCHASE' ? '매입(세금)계산서수령' : '매출(세금)계산서발행'
  const partnerItems = partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))

  return (
    <EcListShell title="(세금)계산서발행/수령" onSearch={load} collapseConditions
                 newLabel="매출(세금)계산서" onNew={() => open('SALES')}
                 actions={[{ label: '매입(세금)계산서', onClick: () => open('PURCHASE') }, { label: '인쇄' }, { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="조회일자">
          <input type="date" className="ec-input w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          ~
          <input type="date" className="ec-input w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </EcCond>
        <EcCond label="거래처">
          <CodePickerField label="거래처" hideLabel fill value={partnerCond} onChange={(v) => setPartnerCond(v)} items={partnerItems} />
        </EcCond>
        <EcCond label="부가세유형">
          <select className="ec-input w-[200px]" value={typeCond} onChange={(e) => setTypeCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set([...SALES_TYPES, ...PURCHASE_TYPES])].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </EcCond>
        <EcCond label="매출/매입구분">
          {([['', '전체'], ['SALES', '매출'], ['PURCHASE', '매입']] as const).map(([v, l]) => (
            <label key={l} className="inline-flex items-center gap-[3px] mr-[10px]">
              <input type="radio" name="tax-voucher-side" checked={sideCond === v} onChange={() => setSideCond(v)} /> {l}
            </label>
          ))}
        </EcCond>
        <EcCond label="비고">
          <input className="ec-input w-full" placeholder="비고" value={remarkCond} onChange={(e) => setRemarkCond(e.target.value)} />
        </EcCond>
        <li className="full">
          <button className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
          <EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          <button className="ec-btn ec-btn-pick" onClick={() => {
            const r = periodOf('금년')!; setFrom(r.from); setTo(r.to); setSideCond(''); setPartnerCond(''); setTypeCond(''); setRemarkCond('')
          }}>다시 작성</button>
        </li>
      </ul>

      <p className="text-right mb-[4px]">{from.replaceAll('-', '/')} ~{to.replaceAll('-', '/')}</p>

      <table ref={tableRef} className="w-full">
        <thead>
          <tr>
            <th className="w-[34px]">
              <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                     onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((r) => r.id)))} />
            </th>
            <th className="text-center">일자-NO</th>
            <th className="text-center">구분</th>
            <th className="text-center">거래처코드</th>
            <th>거래처명</th>
            <th>비고</th>
            <th className="text-right">공급가액</th>
            <th className="text-right">부가세</th>
            <th className="text-right">합계</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : list.map((r, i) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-center">
                <input type="checkbox" aria-label={`${r.entryDate}-${r.entryNo} 선택`} checked={picked.has(r.id)}
                       onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                {' '}{i + 1}
              </td>
              <td className="text-center">
                <button className="ec-link" onClick={() => openRow(r)}>{r.entryDate.replaceAll('-', '/')}-{r.entryNo}</button>
              </td>
              <td className="text-center">{r.sideName}</td>
              <td className="text-center">{r.partnerCode}</td>
              <td>{r.partnerName}</td>
              <td>{r.remark ?? ''}</td>
              <td className="text-right">{won(r.supplyAmount)}</td>
              <td className="text-right">{won(r.vatAmount)}</td>
              <td className="text-right">{won(r.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal open error={formError} title={formTitle} width={780} onClose={() => setForm(null)}>
          <ul className="ec-form [&>li>.title]:basis-[100px]">
            <EcCond label="전표일자" span={2}>
              <input type="date" className="ec-input w-[150px]" value={form.entryDate} disabled={!!form.id}
                     onChange={(e) => set({ entryDate: e.target.value })} />
              {form.id && <span>- {rows.find((r) => r.id === form.id)?.entryNo}</span>}
            </EcCond>
            <EcCond label="부가세유형" span={2}>
              <select className="ec-input w-full" value={form.vatType}
                      onChange={(e) => set({ vatType: e.target.value, vat: vatOf(e.target.value, form.supply) })}>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </EcCond>
            <EcCond label="거래처" span={2}>
              <CodePickerField label="거래처" hideLabel fill pair emptyLabel="(선택 안 함)" value={form.partnerId}
                               onChange={(v) => set({ partnerId: v })} items={partnerItems} />
            </EcCond>
            <EcCond label="공급가액" span={2}>
              <EcNumInput className="ec-input w-full text-right" value={form.supply}
                          onValue={(v) => set({ supply: v, vat: vatOf(form.vatType, v) })} />
            </EcCond>
            <EcCond label="부가세" span={2}>
              <EcNumInput className="ec-input w-full text-right" value={form.vat} onValue={(v) => set({ vat: v })} />
            </EcCond>
            <EcCond label="비고" span={2}>
              <input className="ec-input w-full" placeholder="비고" value={form.remark} onChange={(e) => set({ remark: e.target.value })} />
            </EcCond>
          </ul>
          {confirmDelete && (
            <div className="ec-alert mt-[8px] flex items-center gap-[6px]">
              전표를 삭제하겠습니까?
              <button className="ec-btn ec-btn-primary" onClick={remove}>확인</button>
              <button className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
            </div>
          )}
          <div className="flex gap-[6px] mt-[12px]">
            <button className="ec-btn ec-btn-primary" onClick={save}>저장(F8)</button>
            {form.id
              ? <button className="ec-btn" onClick={() => setConfirmDelete(true)}>삭제</button>
              : <button className="ec-btn" onClick={() => open(form.side)}>다시 작성</button>}
            <button className="ec-btn" onClick={() => setForm(null)}>닫기</button>
          </div>
        </Modal>
      )}
    </EcListShell>
  )
}
