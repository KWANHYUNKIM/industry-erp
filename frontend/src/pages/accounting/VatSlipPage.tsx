import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Modal from '../../components/Modal'
import type { JournalEntry, JournalLine } from '../../types/api'
import EcSlipShell from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import CodePickerField, { type CodeItem } from '../../components/codepicker/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { useCondPickers } from '../../utils/useCondPickers'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { journalNeighbors } from '../../utils/journalNav'
import { hasEKind } from '../../utils/vatSlip'
import EcDateInput from '../../components/ui/EcDateInput'
import { fmtNumber } from '../../utils/format'

/* 원본 [부가세유형] 목록 글자 그대로(2026-10-13 loginaa 매출전표 I 실측 — 세무 (세금)계산서발행/수령과 같은 목록). */
const SALES_TYPES = [
  '세금계산서', '영세율', '계산서', '소매매출', '수출', '카드매출', '계산서(고정자산)', '세.계(고정자산)', '소매(면세)',
  '카드매출(면세)', '현금영수증(면세)', '현금영수증', '매입자발행세금계산서', '영세율(기타)', '기타매출',
]
const PURCHASE_TYPES = [
  '세금계산서', '영세율', '계산서', '세금계산서(불공)', '세금계산서(수입)', '현금영수증', '카드매입', '세.계(고정-수입)',
  '세.계(고정자산)', '영세율(수입)', '계산서(수입)', '세.계(고정-불공)', '계산서(고정자산)', '신용카드(고정자산)',
  '매입자발행세금계산서', '현금영수증(고정자산)', '기타수입', '재활용', '기타매입',
]
/* 부가세를 공급가액의 10% 로 채우는 유형 — 영세율 · 계산서(면세) · 수출은 0. */
const TAXED = new Set(['세금계산서', '소매매출', '카드매출', '세.계(고정자산)', '현금영수증', '매입자발행세금계산서', '기타매출',
  '세금계산서(불공)', '세금계산서(수입)', '카드매입', '세.계(고정-수입)', '세.계(고정-불공)', '신용카드(고정자산)', '현금영수증(고정자산)',
  '기타매입'])

/** 오늘(YYYY-MM-DD) — 이 화면은 기간을 묻지 않아 기간 도구를 들이지 않는다. */
const today = () => new Date().toLocaleDateString('sv-SE')

/* 원본 [전자종류] 목록 글자 그대로(2026-10-13 loginaa — 부가세유형 세금계산서일 때만 뜬다, 기본 전자(세금)계산서-신규). */
const E_INVOICE_KINDS = ['종이(세금)계산서', '전자(세금)계산서-신규', '기재사항착오정정', '공급가액변동', '환입', '계약의해제',
  '내국신용장개설', '착오에의한이중발행']
const DEFAULT_E_KIND = '전자(세금)계산서-신규'
/** 원본 [작업일시] '2026/10/06 오전 9:39:22'. */
function workTime(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  const h = d.getHours()
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const CONFIRM_LABEL: Record<string, string> = { CONFIRMED: '확인', UNCONFIRMED: '미확인', IN_APPROVAL: '결재중' }

interface AccountOpt { id: number; code: string; name: string }

/** [세부내역] 창 한 줄 — 월/일 · 품명 · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 비고. 숫자는 글자로 든다(입력 중 그대로). */
interface DetailItem { itemDate: string; name: string; spec: string; qty: string; unitPrice: string; supply: string; vat: string; note: string }
interface DetailState {
  serialNo: string; receipt: '청구' | '영수'; note: string
  cash: string; check: string; bill: string; credit: string
  items: DetailItem[]
}
interface VatDetailDto {
  serialNo?: string | null; receipt?: string | null; note?: string | null
  cash?: number | null; check?: number | null; bill?: number | null; credit?: number | null
  items?: { itemDate?: string | null; name?: string | null; spec?: string | null; qty?: number | null; unitPrice?: number | null
    supplyAmount?: number | null; vatAmount?: number | null; note?: string | null }[] | null
}
type VatLine = JournalLine & { departmentId?: number | null; projectId?: number | null }
type VatEntry = Omit<JournalEntry, 'lines'> & { lines: VatLine[]; vatType?: string | null; eInvoiceKind?: string | null; vatOmitted?: boolean; vatDetail?: VatDetailDto | null
  updatedBy?: string | null; confirmStatus?: string | null }

const blankItem = (itemDate = ''): DetailItem => ({ itemDate, name: '', spec: '', qty: '', unitPrice: '', supply: '', vat: '', note: '' })
/* 원본 창은 네 줄로 열리고 첫 줄 월/일이 전표 일자다. */
const blankDetail = (date: string): DetailState => ({
  serialNo: '', receipt: '청구', note: '', cash: '', check: '', bill: '', credit: '',
  items: [blankItem(date), blankItem(), blankItem(), blankItem()],
})
const num = (v: string) => Number(v) || 0
const str = (v: number | null | undefined) => (v == null || v === 0 ? '' : String(v))

/**
 * 회계 I › 매출/매입거래 › <b>매출전표 I</b> · <b>매입전표 I</b> — 2026-10-13 loginaa 실측.
 *
 * <p>칸(매출): 일자-No. · 연결거래 · 부서 · 프로젝트 · 부가세유형(기본 세금계산서) — 세금계산서면 그 아래 [전자종류] ·
 * 모든 유형에 [예정누락분] · 거래처 · 공급가액 · 부가세(공급가액의 10%, 영세율 · 계산서는 0) · 세부내역 · 적요 ·
 * 매출계정(기본 제품매출) · 입금계좌(기본 외상매출금) · 수수료. 매입은 전표일자 · 연결전표 · … · 매입계정(원재료) ·
 * 출금계좌(외상매입금) · 수수료 — <b>[세부내역]이 없다</b>.
 * 수수료 1,000 → 차) 지급수수료(판) 1,000 / 대) 입금(출금)계좌 1,000(매출 · 매입 같다, 26/10/13-9 · -11).
 * [세부내역] 창(세금계산서내역등록): 수량 × 단가 → 공급가액 → 부가세 10%, 외상매출금 = 합계 − 현금 − 수표 − 어음,
 * [적용(F8)]이 격자 합계를 공급가액 · 부가세로 옮긴다.
 *
 * <p>회계거래조회에서 전표번호를 누르면 <b>수정 창</b>(?journal=id) — 일자 · 번호는 막히고, [저장(F8)]하면 닫혀 목록으로
 * 돌아간다(공급가액 100,000 → 200,000 이면 목록 금액 220,000).
 * [저장/전표(F7)]도 [저장(F8)]과 같다(2026-10-14 실측 — 분개 판은 안 뜬다). [삭제] 확인 '전표를 삭제하겠습니까?' + '- 매출' / '- 매입전표 I'.
 *
 * <p>부가세유형 칸은 접혀 있다 — 유형 아래 표지(전자(세금)계산서-신규 · 예정누락아님)만 보이고 누르면 [전자종류] · [예정누락분]이 펼쳐진다.
 * 수정 창 [이전] · [다음] · [H](전표이력보기)는 원본대로 둔다.
 *
 * <p>두지 않은 것: 연결거래 고르기(원본도 '없음'만 보였다) · [보내기] · [웹자료올리기].
 */
export default function VatSlipPage({ sales }: { sales: boolean }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = Number(params.get('journal')) || null
  const types = sales ? SALES_TYPES : PURCHASE_TYPES
  const pickers = useCondPickers(['partners'])
  const deptProject = useDeptProjectItems()
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [date, setDate] = useState(today())
  const [slipNo, setSlipNo] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [vatType, setVatType] = useState('세금계산서')
  const [eKind, setEKind] = useState(DEFAULT_E_KIND)
  const [omitted, setOmitted] = useState(false)
  const [partnerId, setPartnerId] = useState('')
  const [supply, setSupply] = useState('')
  const [vat, setVat] = useState('')
  const [memo, setMemo] = useState('')
  const [accountId, setAccountId] = useState('')
  const [settleId, setSettleId] = useState('')
  const [fee, setFee] = useState('')
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [draft, setDraft] = useState<DetailState>(blankDetail(today()))
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** 원본 부가세유형 칸은 접혀 있다 — 유형 아래 표지(전자(세금)계산서-신규 · 예정누락아님)만 보이고 누르면 펼친다. */
  const [vatOpen, setVatOpen] = useState(false)
  /** [H] 전표이력보기 — 처음 넣은 사람 · 때와 마지막으로 고친 사람 · 때(V353 updated_by). */
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loaded, setLoaded] = useState<VatEntry | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  /** 원본 빈 저장: 알림 없이 거래처 칸만 빨간 테두리(.has-error > .validation, 0.5px rgb 215,62,62 · 둥글기 6) — 말풍선 글자는 없다(2026-10-14 실측: popover 내용 빈칸). */
  const [partnerInvalid, setPartnerInvalid] = useState(false)
  const title = editId ? (sales ? '매출전표 I(수정)' : '매입전표 I') : (sales ? '매출전표 I' : '매입전표 I')

  /* 원본 기본 계정: 매출 4049 제품매출 · 1089 외상매출금, 매입 1539 원재료 · 2519 외상매입금(우리 코드 404 · 108 · 153 · 251). */
  const defaults = useMemo(() => {
    const id = (code: string) => String(accounts.find((a) => a.code === code)?.id ?? '')
    return sales ? { main: id('4049'), settle: id('1089') } : { main: id('1539'), settle: id('2519') }
  }, [accounts, sales])
  useEffect(() => {
    api.get<AccountOpt[]>('/accounts', { params: { slip: true } }).then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])
  useEffect(() => { if (!editId) { setAccountId(defaults.main); setSettleId(defaults.settle) } }, [defaults, editId])

  /* 수정 창 — 분개 줄에서 칸을 되살린다(매출: 1줄 차변 = 입금계좌, 255 아닌 첫 대변 = 매출계정; 매입은 거꾸로, 831 차변 = 수수료). */
  useEffect(() => {
    if (!editId) return
    api.get<VatEntry>(`/journals/${editId}`).then(({ data: e }) => {
      const lines = e.lines
      const vatCode = sales ? '2559' : '1359'
      const mainLine = lines.find((l) => (sales ? l.credit > 0 : l.debit > 0) && l.accountCode !== vatCode && l.accountCode !== '8319')
      const settleLine = lines.find((l) => (sales ? l.debit > 0 : l.credit > 0) && l.accountCode !== '8319')
      const sum = (pred: (l: (typeof lines)[number]) => boolean, side: 'debit' | 'credit') =>
        lines.filter(pred).reduce((a, l) => a + l[side], 0)
      setLoaded(e)
      setVatOpen(false)
      setDate(e.entryDate)
      setSlipNo(e.docNo.replace(/^.*-0*/, ''))
      setDepartmentId(lines[0]?.departmentId ? String(lines[0].departmentId) : '')
      setProjectId(lines[0]?.projectId ? String(lines[0].projectId) : '')
      setVatType(e.vatType ?? '세금계산서')
      setEKind(e.eInvoiceKind ?? DEFAULT_E_KIND)
      setOmitted(!!e.vatOmitted)
      setPartnerId(e.partnerId ? String(e.partnerId) : '')
      setSupply(String(mainLine ? (sales ? mainLine.credit : mainLine.debit) : 0))
      setVat(String(sum((l) => l.accountCode === vatCode, sales ? 'credit' : 'debit')))
      setFee(str(sum((l) => l.accountCode === '8319', 'debit')))
      setMemo(e.description && e.description !== e.partnerName ? e.description : '')
      setAccountId(mainLine ? String(mainLine.accountId) : '')
      setSettleId(settleLine ? String(settleLine.accountId) : '')
      /* 서버는 [세부내역] 창을 안 연 전표에도 장 적요(bookMemo)만 든 빈 묶음을 둔다 — 창 칸이 하나라도 있어야 창 자료다. */
      const v = e.vatDetail
      const d = v && (v.items?.length || v.serialNo || v.receipt || v.note || v.cash || v.check || v.bill || v.credit) ? v : null
      setDetail(d ? {
        serialNo: d.serialNo ?? '', receipt: d.receipt === '영수' ? '영수' : '청구', note: d.note ?? '',
        cash: str(d.cash), check: str(d.check), bill: str(d.bill), credit: str(d.credit),
        items: [...(d.items ?? []).map((it) => ({ itemDate: it.itemDate ?? '', name: it.name ?? '', spec: it.spec ?? '',
          qty: str(it.qty), unitPrice: str(it.unitPrice), supply: str(it.supplyAmount), vat: str(it.vatAmount), note: it.note ?? '' })),
        ...Array.from({ length: Math.max(0, 4 - (d.items?.length ?? 0)) }, () => blankItem())],
      } : null)
    }).catch((err) => setError(extractErrorMessage(err)))
  }, [editId, sales])

  const accountItems: CodeItem[] = useMemo(() => accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name })), [accounts])

  function reset() {
    setDate(today()); setSlipNo(''); setDepartmentId(''); setProjectId(''); setVatType('세금계산서'); setEKind(DEFAULT_E_KIND)
    setOmitted(false); setPartnerId(''); setSupply(''); setVat(''); setMemo(''); setFee(''); setDetail(null)
    setAccountId(defaults.main); setSettleId(defaults.settle); setError(''); setPartnerInvalid(false)
  }

  const vatOf = (t: string, s: number) => (TAXED.has(t) ? Math.round(s / 10) : 0)
  function onSupply(v: string) {
    setSupply(v)
    setVat(String(vatOf(vatType, num(v))))
  }
  function onType(t: string) {
    setVatType(t)
    setVat(String(vatOf(t, num(supply))))
  }

  /* ── [세부내역] 창 ── */
  function openDetail() {
    setDraft(detail ?? blankDetail(date))
    setDetailOpen(true)
  }
  /** 외상매출금 = 합계 − 현금 − 수표 − 어음(원본은 줄을 넣자 외상매출금이 110,000 으로 따라왔다). */
  function withCredit(d: DetailState): DetailState {
    const total = d.items.reduce((a, it) => a + num(it.supply) + num(it.vat), 0)
    return { ...d, credit: String(Math.max(0, total - num(d.cash) - num(d.check) - num(d.bill))) }
  }
  function setItem(i: number, patch: Partial<DetailItem>) {
    setDraft((d) => {
      const items = d.items.map((it, k) => {
        if (k !== i) return it
        const next = { ...it, ...patch }
        if ('qty' in patch || 'unitPrice' in patch) {
          if (next.qty !== '' && next.unitPrice !== '') next.supply = String(Math.round(num(next.qty) * num(next.unitPrice)))
        }
        if ('qty' in patch || 'unitPrice' in patch || 'supply' in patch) next.vat = String(vatOf(vatType, num(next.supply)))
        return next
      })
      return withCredit({ ...d, items })
    })
  }
  const draftSupply = draft.items.reduce((a, it) => a + num(it.supply), 0)
  const draftVat = draft.items.reduce((a, it) => a + num(it.vat), 0)
  function applyDetail() {
    /* 창에서 친 값을 전표가 든다 — 일련번호 · 비고는 앞뒤 빈칸을 떼고, 현금 · 수표 · 어음 · 외상매출금은 그대로. */
    setDetail({ ...draft, serialNo: draft.serialNo.trim(), note: draft.note.trim(),
      cash: draft.cash, check: draft.check, bill: draft.bill, credit: draft.credit })
    setSupply(String(draftSupply))
    setVat(String(draftVat))
    setDetailOpen(false)
  }
  /* 창이 떠 있을 때 F8 은 [적용(F8)] — 전표 [저장(F8)]은 막아 둔다(아래 actions disabled). */
  useEffect(() => {
    if (!detailOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); applyDetail() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function detailBody() {
    if (!sales || !detail) return undefined
    const items = detail.items.filter((it) => it.name.trim() || num(it.supply) || num(it.vat))
    return {
      serialNo: detail.serialNo.trim() || undefined, receipt: detail.receipt, note: detail.note.trim() || undefined,
      cash: num(detail.cash), check: num(detail.check), bill: num(detail.bill), credit: num(detail.credit),
      items: items.map((it) => ({ itemDate: it.itemDate || undefined, name: it.name.trim() || undefined, spec: it.spec.trim() || undefined,
        qty: num(it.qty), unitPrice: num(it.unitPrice), supplyAmount: num(it.supply), vatAmount: num(it.vat), note: it.note.trim() || undefined })),
    }
  }

  async function save() {
    setError('')
    if (!partnerId) { setPartnerInvalid(true); return }
    if (!(num(supply) > 0)) { setError('공급가액: 자료를 입력 바랍니다.'); return }
    setSaving(true)
    try {
      const body = {
        sales, entryDate: date, departmentId: departmentId ? Number(departmentId) : undefined,
        projectId: projectId ? Number(projectId) : undefined, vatType, partnerId: Number(partnerId),
        supplyAmount: num(supply), vatAmount: num(vat), description: memo.trim() || undefined,
        accountId: Number(accountId), settleAccountId: Number(settleId), feeAmount: num(fee),
        eInvoiceKind: hasEKind(sales, vatType) ? eKind : undefined, vatOmitted: omitted, vatDetail: detailBody(),
      }
      if (editId) await api.put<JournalEntry>(`/journals/vat-slip/${editId}`, body)
      else await api.post<JournalEntry>('/journals/vat-slip', body)
      /* [저장/전표(F7)]도 [저장(F8)]과 같다(2026-10-14 실측): 신규는 빈 입력 화면, 수정 창은 닫히고 회계거래조회. 분개 판은 안 뜬다. */
      if (editId) navigate('/accounting/journals')
      else reset()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editId) return
    try {
      await api.delete(`/journals/${editId}`)
      setConfirmDelete(false)
      navigate('/accounting/journals')
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  /** [복사] — 같은 칸으로 새 전표를 연다(일자는 오늘). */
  function copy() {
    setDate(today()); setSlipNo('')
    navigate(sales ? '/accounting/sales-slip' : '/accounting/purchase-slip')
  }

  /* 원본 수정 창 버튼(2026-10-13 실측) — 매출: 저장 · 저장/전표 · 복사 · 매출전표II로 변경 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H,
     매입: 저장 · 저장/전표 · 복사 · 매입전표II로 변경 · 삭제 · 닫기 · 보내기 · H. II로 변경은 있고 보내기는 아직 없다.
     [이전]은 회계거래조회 목록의 아래 줄 전표(26/10/28-1 → 26/10/26-1 매입전표 I 창), [다음]은 윗줄. */
  /** [매출전표II로 변경] · [매입전표II로 변경] — 원본은 확인 없이 바꾸고 창을 닫아 회계거래조회로 간다(되돌리기 없음). */
  async function toII() {
    try {
      await api.post(`/journals/vat-slip/${editId}/to-ii`)
      navigate('/accounting/journals')
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  const nav = editId ? journalNeighbors(`${sales ? '/accounting/sales-slip' : '/accounting/purchase-slip'}?journal=${editId}`) : { prev: null, next: null }
  const actions = editId
    ? (sales
      ? [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving || detailOpen },
          { label: '저장/전표(F7)', onClick: () => void save(), disabled: saving || detailOpen },
          { label: '복사', onClick: copy },
          { label: '매출전표II로 변경', onClick: () => void toII() },
          { label: '이전', onClick: () => nav.prev && navigate(nav.prev), disabled: !nav.prev },
          { label: '다음', onClick: () => nav.next && navigate(nav.next), disabled: !nav.next },
          { label: '닫기', onClick: () => navigate('/accounting/journals') },
          { label: '삭제', onClick: () => setConfirmDelete(true) },
          { label: 'H', onClick: () => setHistoryOpen(true) },
        ]
      : [
          { label: '저장(F8)', primary: true, submit: true, disabled: saving || detailOpen },
          { label: '저장/전표(F7)', onClick: () => void save(), disabled: saving || detailOpen },
          { label: '복사', onClick: copy },
          { label: '매입전표II로 변경', onClick: () => void toII() },
          { label: '삭제', onClick: () => setConfirmDelete(true) },
          { label: '닫기', onClick: () => navigate('/accounting/journals') },
          { label: 'H', onClick: () => setHistoryOpen(true) },
        ])
    : [
        { label: '저장(F8)', primary: true, submit: true, disabled: saving || detailOpen },
        { label: '저장/전표(F7)', onClick: () => void save(), disabled: saving || detailOpen },
        { label: '다시 작성', onClick: () => reset() },
        { label: '리스트', onClick: () => navigate('/accounting/journals') },
      ]

  return (
    <>
    <form onSubmit={(e) => { e.preventDefault(); void save() }}>
      <EcSlipShell title={title} actions={actions}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-form mb-[8px]">
          <EcCond label={sales ? '일자-No.' : '전표일자'} span={2}>
            <div className="flex items-center gap-[4px]">
              <EcDateField value={date} onChange={setDate} disabled={!!editId} />
              {slipNo && <span>- {slipNo}</span>}
            </div>
          </EcCond>
          <EcCond label={sales ? '연결거래' : '연결전표'} span={2}>
            <span className="text-ec-navy">없음</span>
          </EcCond>
          <EcCond label="부서" span={2}>
            <CodePickerField label="부서" hideLabel pair fill emptyLabel="(없음)" value={departmentId} onChange={setDepartmentId} items={deptProject.departments} />
          </EcCond>
          <EcCond label="프로젝트" span={2}>
            <CodePickerField label="프로젝트" hideLabel pair fill emptyLabel="(없음)" value={projectId} onChange={setProjectId} items={deptProject.projects} />
          </EcCond>
          <EcCond label="부가세유형" span={2}>
            <div className="w-full">
              <select className="ec-input w-full" aria-label="부가세유형" value={vatType} onChange={(e) => onType(e.target.value)}>
                {types.map((t) => <option key={t}>{t}</option>)}
              </select>
              {/* 원본 표지 · 이름표: label-light — 바탕 막힘색(e9ecef) · 검정 12px · 여백 3.6/4.5/2.7 · 둥글기 10(실측). */}
              {!vatOpen ? (
                <div className="flex items-center gap-[2.7px] mt-[4px]" aria-label="부가세유형 펼치기">
                  {hasEKind(sales, vatType) && (
                    <span className="ec-label-chip bg-ec-disabled text-ec-ink cursor-pointer" onClick={() => setVatOpen(true)}>{eKind}</span>
                  )}
                  <span className="ec-label-chip bg-ec-disabled text-ec-ink cursor-pointer" onClick={() => setVatOpen(true)}>{omitted ? '예정누락' : '예정누락아님'}</span>
                </div>
              ) : (
                <>
                  {hasEKind(sales, vatType) && (
                    <div className="flex items-center gap-[6px] mt-[4px]">
                      <span className="ec-label-chip bg-ec-disabled text-ec-ink">전자종류</span>
                      <select className="ec-input flex-1" aria-label="전자종류" value={eKind} onChange={(e) => setEKind(e.target.value)}>
                        {E_INVOICE_KINDS.map((k) => <option key={k}>{k}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-[6px] mt-[4px]">
                    <span className="ec-label-chip bg-ec-disabled text-ec-ink">예정누락분</span>
                    <label><input type="radio" name="vat-omitted" checked={!omitted} onChange={() => setOmitted(false)} /> 예정누락아님</label>
                    <label><input type="radio" name="vat-omitted" checked={omitted} onChange={() => setOmitted(true)} /> 예정누락</label>
                  </div>
                </>
              )}
            </div>
          </EcCond>
          <EcCond label="거래처" span={2}>
            <div className={`w-full${partnerInvalid ? ' ec-invalid' : ''}`}>
              <CodePickerField label="거래처" hideLabel pair fill emptyLabel="(없음)" value={partnerId}
                               onChange={(v) => { setPartnerId(v); if (v) setPartnerInvalid(false) }} items={pickers.partners} />
            </div>
          </EcCond>
          <EcCond label="공급가액" span={2}>
            <EcNumInput className="ec-input w-full text-right" aria-label="공급가액" value={supply} onValue={onSupply} />
          </EcCond>
          <EcCond label="부가세" span={2}>
            <EcNumInput className="ec-input w-full text-right" aria-label="부가세" value={vat} onValue={setVat} />
          </EcCond>
          {sales && (
            <EcCond label="세부내역" span={2}>
              <a className="text-ec-navy cursor-pointer" onClick={openDetail}>세부내역</a>
            </EcCond>
          )}
          <EcCond label="적요" span={2}>
            <input className="ec-input w-full" placeholder="적요" maxLength={300} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </EcCond>
          <EcCond label={sales ? '매출계정' : '매입계정'} span={2}>
            <CodePickerField label={sales ? '매출계정' : '매입계정'} hideLabel pair fill emptyLabel="(없음)" value={accountId} onChange={setAccountId} items={accountItems} />
          </EcCond>
          <EcCond label={sales ? '입금계좌' : '출금계좌'} span={2}>
            <CodePickerField label={sales ? '입금계좌' : '출금계좌'} hideLabel pair fill emptyLabel="(없음)" value={settleId} onChange={setSettleId} items={accountItems} />
          </EcCond>
          <EcCond label="수수료" span={2}>
            <EcNumInput className="ec-input w-full text-right" aria-label="수수료" value={fee} onValue={setFee} />
          </EcCond>
        </ul>
      </EcSlipShell>
    </form>

      <Modal open={detailOpen} title="세금계산서내역등록" width={780} error={error} onClose={() => setDetailOpen(false)}>
        <ul className="ec-form mb-[8px]">
          <EcCond label="일련번호">
            <input className="ec-input w-full" placeholder="일련번호" maxLength={30} value={draft.serialNo}
                   onChange={(e) => setDraft({ ...draft, serialNo: e.target.value })} />
          </EcCond>
          <EcCond label="청구/영수">
            <label><input type="radio" name="vat-receipt" checked={draft.receipt === '청구'} onChange={() => setDraft({ ...draft, receipt: '청구' })} /> 청구</label>
            <label className="ml-[8px]"><input type="radio" name="vat-receipt" checked={draft.receipt === '영수'} onChange={() => setDraft({ ...draft, receipt: '영수' })} /> 영수</label>
          </EcCond>
          <EcCond label="비고" span={2}>
            <input className="ec-input w-full" placeholder="비고" maxLength={300} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </EcCond>
          <EcCond label="현금">
            <EcNumInput className="ec-input w-full text-right" aria-label="현금" value={draft.cash} onValue={(v) => setDraft(withCredit({ ...draft, cash: v }))} />
          </EcCond>
          <EcCond label="수표">
            <EcNumInput className="ec-input w-full text-right" aria-label="수표" value={draft.check} onValue={(v) => setDraft(withCredit({ ...draft, check: v }))} />
          </EcCond>
          <EcCond label="어음">
            <EcNumInput className="ec-input w-full text-right" aria-label="어음" value={draft.bill} onValue={(v) => setDraft(withCredit({ ...draft, bill: v }))} />
          </EcCond>
          <EcCond label="외상매출금">
            <EcNumInput className="ec-input w-full text-right" aria-label="외상매출금" value={draft.credit} onValue={(v) => setDraft({ ...draft, credit: v })} />
          </EcCond>
        </ul>
        <table className="w-full">
          <thead>
            <tr><th className="w-[30px]"></th><th>월/일</th><th>품명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th>비고</th></tr>
          </thead>
          <tbody>
            {draft.items.map((it, i) => (
              <tr key={i}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td><EcDateInput className="ec-input w-full" aria-label={`${i + 1}줄 월/일`} value={it.itemDate} onChange={(e) => setItem(i, { itemDate: e.target.value })} /></td>
                <td><input className="ec-input w-full" aria-label={`${i + 1}줄 품명`} maxLength={100} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} /></td>
                <td><input className="ec-input w-full" aria-label={`${i + 1}줄 규격`} maxLength={100} value={it.spec} onChange={(e) => setItem(i, { spec: e.target.value })} /></td>
                <td><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 수량`} value={it.qty} onValue={(v) => setItem(i, { qty: v })} /></td>
                <td><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 단가`} value={it.unitPrice} onValue={(v) => setItem(i, { unitPrice: v })} /></td>
                <td><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 공급가액`} value={it.supply} onValue={(v) => setItem(i, { supply: v })} /></td>
                <td><EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}줄 부가세`} value={it.vat} onValue={(v) => setItem(i, { vat: v })} /></td>
                <td><input className="ec-input w-full" aria-label={`${i + 1}줄 비고`} maxLength={100} value={it.note} onChange={(e) => setItem(i, { note: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={6}></td>
              <td className="text-right">{fmtNumber(draftSupply)}</td>
              <td className="text-right">{fmtNumber(draftVat)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div className="flex gap-[5px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={applyDetail}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setDetailOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={historyOpen} title="전표이력보기" width={780} error={error} onClose={() => setHistoryOpen(false)}>
        <p className="mb-[6px]">전표번호 : {date.replace(/-/g, '/')} -{slipNo}</p>
        <table className="w-full">
          <thead><tr><th className="w-[34px]"></th><th className="text-center">작업자ID</th><th className="text-center">작업일시</th><th className="text-center">전표종류</th><th className="text-center">상태</th></tr></thead>
          <tbody>
            {loaded && [
              { who: loaded.createdBy, at: loaded.createdAt, state: '신규' },
              ...(loaded.updatedAt && loaded.createdAt && workTime(loaded.updatedAt) !== workTime(loaded.createdAt)
                ? [{ who: loaded.updatedBy ?? loaded.createdBy, at: loaded.updatedAt, state: '수정' }] : []),
            ].map((h, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                <td className="text-center text-ec-navy">{(h.who ?? '').toUpperCase()}</td>
                <td className="text-center">{workTime(h.at)}</td>
                <td className="text-center">{CONFIRM_LABEL[loaded.confirmStatus ?? ''] ?? ''}</td>
                <td className="text-center">{h.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[5px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => setHistoryOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />{sales ? '- 매출' : '- 매입전표 I'}</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </>
  )
}
