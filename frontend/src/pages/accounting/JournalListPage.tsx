import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import type { JournalEntry } from '../../types/api'

/** 원본 회계거래조회 탭 [결재중 · 미확인 · 확인] — 전표의 진행상태. */
type ConfirmStatus = 'UNCONFIRMED' | 'IN_APPROVAL' | 'CONFIRMED'
type Row = JournalEntry & { confirmStatus: ConfirmStatus; /** 마지막으로 고친 사람(V353) — 조건 [최종수정자] */ updatedBy?: string | null }
const STATUS_TABS = ['전체', '결재중', '미확인', '확인'] as const
const STATUS_OF: Record<string, ConfirmStatus> = { 결재중: 'IN_APPROVAL', 미확인: 'UNCONFIRMED', 확인: 'CONFIRMED' }

interface JournalListResponse {
  rows: Row[]
  /** 조건에 걸린 전체 전표 수. 잘렸을 때 "몇 장 중 몇 장" 을 말하려고 받는다. */
  totalRows: number
  /** 잘라서 온 것인가. 이때만 [오천건이상조회] 를 띄운다. */
  truncated: boolean
}
import { periodOf } from '../../components/EcPeriodPicks'
import { JOURNAL_INQUIRY_PICKS } from '../../utils/periods'
import CodePickerField from '../../components/CodePickerField'
import EcNumInput from '../../components/EcNumInput'
import { useCondPickers } from '../../utils/useCondPickers'
import { CASH_QUICK_KINDS, VOUCHER_SCREEN_BY_TYPE_NAME } from '../../features/cashquick/kinds'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'
import { lineInDeptProject } from '../../utils/deptProject'
import { saveJournalNav } from '../../utils/journalNav'

const won = (n: number) => n.toLocaleString('ko-KR')
/** 원본 기본 기간 [6개월(+1개월)] — 2026-10-13 에 2026/04/01 ~ 2026/11/12 였다. */
const defaultPeriod = () => periodOf('6개월(+1개월)')!

/** 원본 [전표번호] 모양 — GL-20261012-0002 → 26/10/12-2 (회계거래조회 실측). */
function slipNo(docNo: string) {
  const m = /^[A-Z]+-(\d{2})(\d{2})(\d{2})(\d{2})-0*(\d+)$/.exec(docNo)
  return m ? `${m[2]}/${m[3]}/${m[4]}-${m[5]}` : docNo
}

/** 원본 [거래유형] 이름 — 판매 회계반영은 '매출전표 I', 구매는 '매입전표 I', 직접 입력은 '일반전표'. */
const TYPE_NAME: Record<string, string> = { SALES: '매출전표 I', PURCHASE: '매입전표 I', MANUAL: '일반전표', VAT_SALES: '매출전표 I', VAT_PURCHASE: '매입전표 I' }
/**
 * 원본 조건 [업무] 코드도움 '업무검색'(2026-10-13 loginaa 실측) — 전표를 넣은 화면. 고르면 그 화면의 [거래유형] 전표만 남는다
 * (업무 '매출' → 거래유형 '매출전표 I' 만, 판매 회계반영 전표도 매출전표 I 다). 묶음은 원본 나무의 2단.
 */
const WORK_TREE: [string, string[]][] = [
  ['FastEntry', ['일반전표', '지출결의서', '입금보고서', '가지급금정산서', '잔액조정']],
  ['매출매입거래', ['매출', '매입']],
  ['현금거래', ['매출처로부터', '카드매출대금회수', '일시적으로(입금)', '은행차입으로', '기타입금', '매입처로', '영수증으로',
    '법인카드대금결제', '계좌간이동', '일시적으로(출금)', '은행으로', '기타출금']],
  ['비현금거래', ['일반영수증', '신용카드전표', '기타']],
  ['어음거래', ['받을어음증가', '받을어음감소', '지급어음증가', '지급어음감소']],
  ['고정자산', ['고정자산증가', '고정자산감소']],
  ['수입비용', ['매입대금청구서수령', '(세금)계산서수령', '일반영수증수령', '거래대금지급', '관세사에지급', '본계정대체']],
]
/** 업무 이름과 [거래유형] 글자가 다른 것 — 나머지는 같은 글자다. */
const WORK_TYPE_LABEL: Record<string, string> = {
  매출: '매출전표 I', 매입: '매입전표 I', '일시적으로(입금)': '입금-일시적으로', '일시적으로(출금)': '출금-일시적으로',
}
const WORK_ITEMS = WORK_TREE.flatMap(([group, names]) => names.map((n) => ({ value: `${group}/${n}`, name: n, sub: group })))
const workTypeOf = (value: string) => { const n = value.split('/')[1]; return WORK_TYPE_LABEL[n] ?? n }

/** 매출전표 I · 매입전표 I 화면으로 넣은 전표 — 전표번호를 누르면 그 화면의 수정 창(?journal=)이 열린다(원본 실측). */
const VAT_SLIP_SCREEN: Record<string, string> = { VAT_SALES: '/accounting/sales-slip', VAT_PURCHASE: '/accounting/purchase-slip' }

/** 회계전표 조회 — 판매/구매 회계반영으로 생성된 분개(차변/대변)를 전표 단위로 조회. */
export default function JournalListPage() {
  const navigate = useNavigate()
  /*
   * ?entryId= 로 특정 전표를 지목해서 들어온다 — 일괄회계반영·결제내역조회의
   * [회계전표No.] 가 여기로 보낸다. 목록만 열어 주면 사람이 다시 찾아야 하고,
   * 그러면 그 열을 만든 이유가 없어진다.
   */
  const [params] = useSearchParams()
  const wanted = Number(params.get('entryId')) || null

  const [rows, setRows] = useState<Row[]>([])
  /* 원본 조건 [부서] · [프로젝트] — 그 부서 · 프로젝트가 붙은 줄(V343)이 하나라도 있는 전표. */
  const [deptCond, setDeptCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const deptProject = useDeptProjectItems()
  /* 원본은 [확인] 탭으로 열린다(2026-10-13 실측 — 저장한 전표는 곧 확인이라 거기 다 있다). */
  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]>('확인')
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** 원본 격자 첫 칸(체크) — [확인] · [확인취소] · [선택삭제] 가 고른 줄에 걸린다. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  /** 간편전표 분개 → 그 결의서 id. [선택삭제]는 결의서째 지운다(분개만 지우면 결의서가 남는다). */
  const [voucherIdOf, setVoucherIdOf] = useState<Record<number, number>>({})
  /** 간편전표 분개 → 그 결의서 종류(지출결의서 · 입금보고서 · 가지급금정산서). 원본 [거래유형]이 그 이름이다. */
  const [voucherType, setVoucherType] = useState<Record<number, string>>({})
  /** 영수증으로 [거래처명] — 거래처 등록 없이 친 이름. 원본 회계거래조회가 그 글자를 [거래처명]에 찍는다. */
  const [payeeOf, setPayeeOf] = useState<Record<number, string>>({})
  /** 현금거래(매출처로부터 · 은행차입으로 …)의 원본 [금액]은 금액+수수료다 — 은행차입으로 50,000 · 수수료 1,000 → 51,000(분개는 50,000). */
  const [cashQuickTotal, setCashQuickTotal] = useState<Record<number, number>>({})
  const amountOf = (r: JournalEntry) => cashQuickTotal[r.id] ?? r.totalDebit
  /* 원본 거래유형: 받을어음증가 화면으로 넣은 어음의 전표는 '받을어음증가'(지급은 '지급어음증가') — 2026-10-13 실측.
     우리 수취/발행 분개 적요가 '받을어음 수취/발행 BN-…' 이다. 할인료 · 부도 전표 이름은 못 쟀다. */
  const noteLabel = (r: JournalEntry) => ((r.sourceType as string) === 'NOTE' && /^(받을어음|지급어음) 수취\/발행/.test(r.description ?? '')
    ? `${(r.description ?? '').split(' ')[0]}증가` : undefined)
  /** 전표번호를 누르면 열리는 입력 화면 — 결의서 · 현금거래는 그 화면, 매출전표 I · 매입전표 I 은 그 수정 창. 나머지는 분개를 펼친다. */
  const screenOf = (r: JournalEntry) => voucherType[r.id]
    ? `${VOUCHER_SCREEN_BY_TYPE_NAME[voucherType[r.id]] ?? '/accounting/vouchers'}?journal=${r.id}`
    : VAT_SLIP_SCREEN[r.sourceType] ? `${VAT_SLIP_SCREEN[r.sourceType]}?journal=${r.id}` : null
  const typeLabel = (r: JournalEntry) => voucherType[r.id] ?? noteLabel(r) ?? TYPE_NAME[r.sourceType] ?? r.sourceTypeName
  /* 원본 줄 색: 매출전표 분홍 · 매입전표 연두(td.danger · td.success). */
  const rowBg = (r: JournalEntry) => (r.sourceType as string) === 'SALES' || (r.sourceType as string) === 'VAT_SALES' ? 'bg-[var(--ec-bg-sales-row)]'
    : (r.sourceType as string) === 'PURCHASE' || (r.sourceType as string) === 'VAT_PURCHASE' ? 'bg-[var(--ec-bg-basic)]' : ''
  const [from, setFrom] = useState(defaultPeriod().from)
  const [to, setTo] = useState(defaultPeriod().to)
  /* 원본 조건(2026-10-13 실측): 기준일자 · 회계전표No. · 거래처 · 계정 · 부서 · 프로젝트 · 업무 · 관리번호 · 금액 ~ ·
     채권/채무(어음) No. · 적요 · 작성자 · 최종수정자 · 기타[수정일자순(정렬)]. 관리번호(원본 코드도움 '관리번호' —
     관리번호코드 · 관리번호명, 수입 건별 번호) · 채권/채무No. 는 회계전표가 들지 않아 없다. 최종수정자는 V353(updated_by) — 전표를 고치거나 확인 · 확인취소한 사람. */
  const pickers = useCondPickers(['partners'])
  const [docCond, setDocCond] = useState('')
  const [workCond, setWorkCond] = useState<string[]>([])
  const [partnerCond, setPartnerCond] = useState('')
  const [accountCond, setAccountCond] = useState('')
  const [amountFrom, setAmountFrom] = useState('')
  const [amountTo, setAmountTo] = useState('')
  const [memoCond, setMemoCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [editorCond, setEditorCond] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [openId, setOpenId] = useState<number | null>(wanted)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  /** 조건에 걸린 전체 전표 수와, 잘라서 받았는지. 원본 [오천건이상조회] 자리를 위한 값이다. */
  const [totalRows, setTotalRows] = useState(0)
  const [truncated, setTruncated] = useState(false)

  /*
   * <b>넓게 물으면 앞 5천 장만 받는다.</b> 이 화면은 연초부터를 기본으로 열어서, 재 보니
   * 2만 9천 줄·16MB 를 받고 있었다(1.1초). 원본도 큰 결과를 그냥 주지 않는다 —
   * 조회 화면 139곳에 [오천건이상조회] 버튼을 두고 그 위로는 눌러야 가게 한다(사본 실측).
   * 재고수불부와 같은 방식이고, 자른 것은 숨기지 않는다.
   *
   * <p><b>검색창도 잘린 안에서만 찾는다.</b> 이 화면의 검색은 받아 온 줄에서 거르는 것이라,
   * 잘렸으면 그 밖의 전표는 쳐도 안 나온다. 그래서 안내 문구에 합계뿐 아니라 검색도
   * 함께 적는다 — 못 찾은 것을 '없다' 로 읽으면 안 된다.
   */
  function load(range?: { from: string; to: string }, all = false) {
    setError('')
    const params: Record<string, string | boolean> = { ...(range ?? { from, to }) }
    if (all) params.all = true
    api.get<JournalListResponse>('/journals', { params })
      .then((r) => { setRows(r.data.rows); setTotalRows(r.data.totalRows); setTruncated(r.data.truncated) })
      .catch((err) => { setError(extractErrorMessage(err)); setRows([]); setTotalRows(0); setTruncated(false) })
    api.get<{ rows: { id: number; journalEntryId: number | null; type: string; typeName: string; payeeName: string | null; totalAmount: number }[] }>('/vouchers', { params: { ...(range ?? { from, to }), all: true } })
      .then((r) => {
        const vs = r.data.rows.filter((v) => v.journalEntryId)
        setVoucherType(Object.fromEntries(vs.map((v) => [v.journalEntryId!, v.typeName])))
        setVoucherIdOf(Object.fromEntries(vs.map((v) => [v.journalEntryId!, v.id])))
        setPayeeOf(Object.fromEntries(vs.filter((v) => v.payeeName).map((v) => [v.journalEntryId!, v.payeeName!])))
        setCashQuickTotal(Object.fromEntries(vs.filter((v) => CASH_QUICK_KINDS.some((k) => k.type === v.type))
          .map((v) => [v.journalEntryId!, v.totalAmount])))
      })
      .catch(() => { setVoucherType({}); setVoucherIdOf({}); setPayeeOf({}); setCashQuickTotal({}) })
  }

  useEffect(() => {
    // 지목받은 전표는 올해 밖일 수 있다. 기본 기간으로 열면 "없는 전표" 처럼 보인다.
    if (wanted) {
      const wide = { from: '1900-01-01', to: '2099-12-31' }
      setFrom(wide.from); setTo(wide.to); load(wide)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accountItems = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) for (const l of r.lines) m.set(l.accountCode, l.accountName)
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([code, name]) => ({ value: code, code, name }))
  }, [rows])
  const authorItems = useMemo(() => [...new Set(rows.map((r) => r.createdBy ?? '').filter(Boolean))].sort()
    .map((n) => ({ value: n, name: n })), [rows])
  const editorItems = useMemo(() => [...new Set(rows.map((r) => r.updatedBy ?? r.createdBy ?? '').filter(Boolean))].sort()
    .map((n) => ({ value: n, name: n })), [rows])

  const shown = useMemo(() => rows.filter((r) =>
    (statusTab === '전체' || STATUS_OF[statusTab] === r.confirmStatus)
    && (!docCond || r.docNo.includes(docCond) || slipNo(r.docNo).includes(docCond))
    && (!partnerCond || String(r.partnerId) === partnerCond)
    && (!accountCond || r.lines.some((l) => l.accountCode === accountCond))
    && (workCond.length === 0 || workCond.some((w) => workTypeOf(w) === typeLabel(r)))
    && ((!deptCond && !projectCond) || r.lines.some((l) => lineInDeptProject(l, deptCond, projectCond)))
    && (!amountFrom || amountOf(r) >= Number(amountFrom))
    && (!amountTo || amountOf(r) <= Number(amountTo))
    && (!memoCond || (r.description ?? '').includes(memoCond))
    && (!authorCond || (r.createdBy ?? '') === authorCond)
    && (!editorCond || (r.updatedBy ?? r.createdBy ?? '') === editorCond)
    && (!keyword || r.docNo.includes(keyword) || (r.description ?? '').includes(keyword) || (r.partnerName ?? '').includes(keyword))
  ).sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') : 0)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows, keyword, statusTab, docCond, workCond, voucherType, partnerCond, accountCond, deptCond, projectCond, amountFrom, amountTo, memoCond, authorCond, editorCond, byUpdated, cashQuickTotal])

  const picked = shown.filter((r) => checked.has(r.id))

  /** 원본 [확인] · [확인취소] — 고른 전표의 진행상태를 미확인 ↔ 확인. */
  async function changeStatus(status: 'CONFIRMED' | 'UNCONFIRMED') {
    if (picked.length === 0) { setError('바꿀 전표를 고르세요.'); return }
    setError('')
    try {
      const r = await api.post<{ changed: number }>('/journals/status', { ids: picked.map((x) => x.id), status })
      setChecked(new Set())
      load()
      if (r.data.changed === 0) setError('이미 그 진행상태입니다.')
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 원본 [선택삭제]. 결의서 · 현금거래로 만든 전표는 그 결의서째 지운다(계좌 입출금도 되돌아간다),
   * 일반전표는 분개를 지운다. 판매 · 구매에서 온 전표는 회계반영 취소로만 지워진다(서버가 막는다).
   */
  async function removeChecked() {
    setConfirmDelete(false)
    if (picked.length === 0) { setError('지울 전표를 고르세요.'); return }
    setError('')
    const results = await Promise.allSettled(picked.map((x) => voucherIdOf[x.id]
      ? api.delete(`/vouchers/${voucherIdOf[x.id]}`)
      : api.delete(`/journals/${x.id}`)))
    const failed = results.filter((x) => x.status === 'rejected') as PromiseRejectedResult[]
    setChecked(new Set())
    load()
    if (failed.length > 0) {
      setError(`${picked.length - failed.length}건 삭제, ${failed.length}건 실패 — ${extractErrorMessage(failed[0].reason)}`)
    }
  }

  const total = shown.reduce((a, r) => a + amountOf(r), 0)
  const reset = () => {
    const p = defaultPeriod(); setFrom(p.from); setTo(p.to); setKeyword('')
    setDocCond(''); setWorkCond([]); setPartnerCond(''); setAccountCond(''); setDeptCond(''); setProjectCond(''); setAmountFrom(''); setAmountTo(''); setMemoCond(''); setAuthorCond(''); setEditorCond(''); setByUpdated(false)
  }

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="회계전표조회"
      /* 회계 출력물은 인쇄용결재라인등록(회계) 결재라인 1 을 찍는다(원본 회계거래조회 › 전표 인쇄) */
      signLine
      search={keyword}
      onSearchChange={setKeyword}
      actions={[
        /* 인자 없이 부른다 — onClick 이 무엇을 넘기든 range 로 새면 안 된다. */
        { label: '검색(F8)', primary: true, onClick: () => load() },
        /* 원본 버튼줄: 신규 · 보내기 · 확인 · 확인취소 · 전자결재 · 선택삭제. */
        { label: '확인', onClick: () => void changeStatus('CONFIRMED'), disabled: checked.size === 0 },
        { label: '확인취소', onClick: () => void changeStatus('UNCONFIRMED'), disabled: checked.size === 0 },
        /* 원본 확인창 '전표를 삭제하겠습니까? - 회계거래조회'. 확인한 전표도 지워진다(잠그지 않는다 — 2026-10-13 실측). */
        { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: () => setConfirmDelete(true), disabled: checked.size === 0 },
        /* 잘려서 왔을 때만 누를 수 있다 — 안 잘렸으면 더 가져올 것이 없다. */
        { label: '오천건이상조회', onClick: () => load(undefined, true), disabled: !truncated },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={JOURNAL_INQUIRY_PICKS}
      >
        <EcCond label="회계전표No.">
          <input className="ec-input w-full" placeholder="회계전표No." value={docCond} onChange={(e) => setDocCond(e.target.value)} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel fill emptyLabel="전체" value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="계정" pick>
          <CodePickerField label="계정" hideLabel fill emptyLabel="전체" value={accountCond} onChange={setAccountCond} items={accountItems} />
        </EcCond>
        <EcCond label="부서" pick>
          <CodePickerField label="부서" hideLabel fill emptyLabel="전체" value={deptCond} onChange={setDeptCond} items={deptProject.departments} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel fill emptyLabel="전체" value={projectCond} onChange={setProjectCond} items={deptProject.projects} />
        </EcCond>
        <EcCond label="업무" pick>
          <CodePickerField label="업무" hideLabel fill multiple emptyLabel="" values={workCond}
                           onChangeMulti={(v) => setWorkCond(v)} items={WORK_ITEMS} />
        </EcCond>
        <EcCond label="금액">
          <span className="inline-flex w-full items-center gap-[4px]">
            <EcNumInput className="ec-input w-full text-right" aria-label="금액부터" placeholder="금액" value={amountFrom} onValue={setAmountFrom} />
            <span>~</span>
            <EcNumInput className="ec-input w-full text-right" aria-label="금액까지" value={amountTo} onValue={setAmountTo} />
          </span>
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input w-full" placeholder="적요" value={memoCond} onChange={(e) => setMemoCond(e.target.value)} />
        </EcCond>
        <EcCond label="작성자" pick>
          <CodePickerField label="작성자" hideLabel fill emptyLabel="전체" value={authorCond} onChange={setAuthorCond} items={authorItems} />
        </EcCond>
        <EcCond label="최종수정자" pick>
          <CodePickerField label="최종수정자" hideLabel fill emptyLabel="전체" value={editorCond} onChange={setEditorCond} items={editorItems} />
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
      </EcStatusPanel>

      <div className="ec-pills mb-[8px]">
        {STATUS_TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${statusTab === t ? ' active' : ''}`}
                  onClick={() => { setStatusTab(t); setChecked(new Set()) }}>{t}</button>
        ))}
      </div>

      <div className="mb-[8px] text-[12.5px] text-ec-label text-right">
        총 <b className="text-ec-text">{shown.length}</b>건
        <span className="ml-[8px] text-ec-hint">행을 클릭하면 분개가 펼쳐집니다.</span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {/*
        잘라서 받았으면 <b>반드시 말한다.</b> 이 화면은 아래에 차변·대변 합계를 찍는데,
        그 합계는 <b>지금 보고 있는 줄</b>을 더한 값이다. 잘린 줄 알려 주지 않으면
        사람은 그 숫자를 기간 전체의 합으로 읽는다 — 틀린 숫자를 맞다고 믿게 된다.
      */}
      {truncated && (
        <p style={{ background: 'var(--ec-warn-bg)', color: '#7a5b00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>
          모두 {totalRows.toLocaleString('ko-KR')}장 중 앞 {rows.length.toLocaleString('ko-KR')}장만 보고 있습니다 —
          아래 합계도, 위 검색창도 이 {rows.length.toLocaleString('ko-KR')}장 안에서만 셉니다.
          기간을 좁히거나, 그대로 다 보려면 [오천건이상조회]를 누르세요.
        </p>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px]">
              <input type="checkbox" aria-label="전체 선택"
                     checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th className="w-[34px]"></th>
            {/* 원본 회계거래조회 격자(2026-10-12 실측): 전표번호 · 거래유형 · 금액 · 거래처명 · 적요. 일자는 전표번호(26/10/12-2)가 든다. */}
            <th>전표번호</th><th>거래유형</th>
            <th className="text-right">금액</th><th>거래처명</th><th>적요</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="text-center text-ec-hint p-[20px]">조회된 회계전표가 없습니다. (판매/구매 화면에서 회계반영하면 생성됩니다)</td></tr>
          ) : shown.map((r, i) => (
            <Fragment key={r.id}>
              <tr onClick={() => setOpenId(openId === r.id ? null : r.id)} className={`cursor-pointer ${rowBg(r)}`}>
                <td className="text-center" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`${slipNo(r.docNo)} 선택`} checked={checked.has(r.id)}
                         onChange={(e) => setChecked((prev) => {
                           const next = new Set(prev)
                           if (e.target.checked) next.add(r.id); else next.delete(r.id)
                           return next
                         })} />
                </td>
                <td className="text-center text-ec-hint">{i + 1}</td>
                <td>
                  {/* 원본: 전표번호를 누르면 그 전표의 입력 화면(지출결의서 · 입금보고서 …)이 열린다. 우리는 결의서만 열고 나머지는 분개를 펼친다. */}
                  <a className="text-ec-navy cursor-pointer" title={r.docNo}
                     onClick={(e) => {
                       const to = screenOf(r)
                       if (!to) return
                       e.stopPropagation()
                       /* 매출전표 I 수정 창의 [이전] · [다음] 이 이 목록 차례대로 옮겨 간다(원본 — [이전]은 아래 줄 전표). */
                       saveJournalNav(shown.map((x) => screenOf(x) ?? `/accounting/journals?entryId=${x.id}`))
                       navigate(to)
                     }}>
                    {slipNo(r.docNo)}
                  </a>
                </td>
                <td>{typeLabel(r)}</td>
                <td className="text-right">{won(amountOf(r))}</td>
                <td>{r.partnerName ?? payeeOf[r.id] ?? ''}</td>
                <td>{r.description}</td>
              </tr>
              {openId === r.id && (
                <tr className="no-ec">
                  <td colSpan={7} className="p-0 bg-ec-page">
                    <table className="w-full text-left my-[4px] mx-0">
                      <thead>
                        <tr><th className="w-[34px]"></th><th>계정코드</th><th>계정과목</th><th>적요</th><th className="text-right">차변</th><th className="text-right">대변</th></tr>
                      </thead>
                      <tbody>
                        {r.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="text-center text-ec-hint">{l.lineNo}</td>
                            <td>{l.accountCode}</td>
                            <td>{l.accountName}</td>
                            <td className="text-ec-hint">{l.description ?? ''}</td>
                            <td style={{ textAlign: 'right', color: l.debit > 0 ? '#1a4d8f' : 'var(--ec-text-off)' }}>{l.debit > 0 ? won(l.debit) : ''}</td>
                            <td style={{ textAlign: 'right', color: l.credit > 0 ? '#a5561b' : 'var(--ec-text-off)' }}>{l.credit > 0 ? won(l.credit) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-ec-page">
            <td colSpan={4} className="text-right">합계 ({shown.length}건)</td>
            <td className="text-right">{won(total)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>

      <Modal open={confirmDelete} title="알림" width={420} error={error} onClose={() => setConfirmDelete(false)}>
        <p className="mb-[12px]">전표를 삭제하겠습니까?<br />- 회계거래조회</p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" disabled={picked.length === 0} onClick={() => void removeChecked()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirmDelete(false)}>취소</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
