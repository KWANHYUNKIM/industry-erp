import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcSlipShell from '../../components/EcSlipShell'
import EcDateField from '../../components/EcDateField'
import EcNumInput from '../../components/EcNumInput'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import { useCondPickers } from '../../utils/useCondPickers'
import { useDeptProjectItems } from '../../features/cashquick/useDeptProject'

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

interface AccountOpt { id: number; code: string; name: string }

/**
 * 회계 I › 매출/매입거래 › <b>매출전표 I</b> · <b>매입전표 I</b> — 2026-10-13 loginaa 실측.
 *
 * <p>칸: 일자 · 부서 · 프로젝트 · 부가세유형(기본 세금계산서) · 거래처 · 공급가액 · 부가세(공급가액의 10%, 영세율 · 계산서는 0) · 적요 ·
 * 매출계정(기본 제품매출) · 입금계좌(기본 외상매출금) — 매입은 매입계정(원재료) · 출금계좌(외상매입금).
 * 저장하면 칸이 처음으로 돌아간다. 회계거래조회 거래유형 '매출전표 I', 전표 차) 외상매출금 110,000 / 대) 제품매출 100,000 ·
 * 부가세예수금 10,000(카드매출 · 좋은컴퓨터 · 100,000 · 10,000 으로 잼, 26/10/13-6).
 * <b>부가세유형을 전표가 든다</b>(V349) — 지출증빙현황 · 전표vs매출매입자료비교가 카드 · 현금영수증을 나눌 근거다.
 *
 * <p>두지 않은 것: 연결거래 · 전자(세금)계산서-신규 · 예정누락아님 표지 · 세부내역 · 수수료 · [저장/전표(F7)] · [웹자료올리기].
 */
export default function VatSlipPage({ sales }: { sales: boolean }) {
  const navigate = useNavigate()
  const title = sales ? '매출전표 I' : '매입전표 I'
  const types = sales ? SALES_TYPES : PURCHASE_TYPES
  const pickers = useCondPickers(['partners'])
  const deptProject = useDeptProjectItems()
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [date, setDate] = useState(today())
  const [departmentId, setDepartmentId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [vatType, setVatType] = useState('세금계산서')
  const [partnerId, setPartnerId] = useState('')
  const [supply, setSupply] = useState('')
  const [vat, setVat] = useState('')
  const [memo, setMemo] = useState('')
  const [accountId, setAccountId] = useState('')
  const [settleId, setSettleId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  /* 원본 기본 계정: 매출 4049 제품매출 · 1089 외상매출금, 매입 1539 원재료 · 2519 외상매입금(우리 코드 404 · 108 · 153 · 251). */
  const defaults = useMemo(() => {
    const id = (code: string) => String(accounts.find((a) => a.code === code)?.id ?? '')
    return sales ? { main: id('404'), settle: id('108') } : { main: id('153'), settle: id('251') }
  }, [accounts, sales])
  useEffect(() => {
    api.get<AccountOpt[]>('/accounts').then((r) => setAccounts(r.data)).catch(() => setAccounts([]))
  }, [])
  useEffect(() => { setAccountId(defaults.main); setSettleId(defaults.settle) }, [defaults])

  const accountItems: CodeItem[] = useMemo(() => accounts.map((a) => ({ value: String(a.id), code: a.code, name: a.name })), [accounts])

  function reset() {
    setDate(today()); setDepartmentId(''); setProjectId(''); setVatType('세금계산서'); setPartnerId('')
    setSupply(''); setVat(''); setMemo(''); setAccountId(defaults.main); setSettleId(defaults.settle); setError('')
  }

  function onSupply(v: string) {
    setSupply(v)
    setVat(TAXED.has(vatType) ? String(Math.round((Number(v) || 0) / 10)) : '0')
  }
  function onType(t: string) {
    setVatType(t)
    setVat(TAXED.has(t) ? String(Math.round((Number(supply) || 0) / 10)) : '0')
  }

  async function save() {
    setError('')
    if (!partnerId) { setError('거래처: 자료를 입력 바랍니다.'); return }
    if (!(Number(supply) > 0)) { setError('공급가액: 자료를 입력 바랍니다.'); return }
    setSaving(true)
    try {
      await api.post('/journals/vat-slip', {
        sales, entryDate: date, departmentId: departmentId ? Number(departmentId) : undefined,
        projectId: projectId ? Number(projectId) : undefined, vatType, partnerId: Number(partnerId),
        supplyAmount: Number(supply), vatAmount: Number(vat) || 0, description: memo.trim() || undefined,
        accountId: Number(accountId), settleAccountId: Number(settleId),
      })
      reset()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save() }}>
      <EcSlipShell
        title={title}
        actions={[
          { label: '저장(F8)', primary: true, submit: true, disabled: saving },
          { label: '다시 작성', onClick: () => reset() },
          { label: '리스트', onClick: () => navigate('/accounting/journals') },
        ]}>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <ul className="ec-form mb-[8px]">
          <EcCond label="일자" span={2}>
            <EcDateField value={date} onChange={setDate} />
          </EcCond>
          <EcCond label="부서" span={2}>
            <CodePickerField label="부서" hideLabel pair fill emptyLabel="(없음)" value={departmentId} onChange={setDepartmentId} items={deptProject.departments} />
          </EcCond>
          <EcCond label="프로젝트" span={2}>
            <CodePickerField label="프로젝트" hideLabel pair fill emptyLabel="(없음)" value={projectId} onChange={setProjectId} items={deptProject.projects} />
          </EcCond>
          <EcCond label="부가세유형" span={2}>
            <select className="ec-input w-full" aria-label="부가세유형" value={vatType} onChange={(e) => onType(e.target.value)}>
              {types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </EcCond>
          <EcCond label="거래처" span={2}>
            <CodePickerField label="거래처" hideLabel pair fill emptyLabel="(없음)" value={partnerId} onChange={setPartnerId} items={pickers.partners} />
          </EcCond>
          <EcCond label="공급가액" span={2}>
            <EcNumInput className="ec-input w-full text-right" aria-label="공급가액" value={supply} onValue={onSupply} />
          </EcCond>
          <EcCond label="부가세" span={2}>
            <EcNumInput className="ec-input w-full text-right" aria-label="부가세" value={vat} onValue={setVat} />
          </EcCond>
          <EcCond label="적요" span={2}>
            <input className="ec-input w-full" placeholder="적요" maxLength={300} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </EcCond>
          <EcCond label={sales ? '매출계정' : '매입계정'} span={2}>
            <CodePickerField label={sales ? '매출계정' : '매입계정'} hideLabel pair fill emptyLabel="(없음)" value={accountId} onChange={setAccountId} items={accountItems} />
          </EcCond>
          <EcCond label={sales ? '입금계좌' : '출금계좌'} span={2}>
            <CodePickerField label={sales ? '입금계좌' : '출금계좌'} hideLabel pair fill emptyLabel="(없음)" value={settleId} onChange={setSettleId} items={accountItems} />
          </EcCond>
        </ul>
      </EcSlipShell>
    </form>
  )
}
