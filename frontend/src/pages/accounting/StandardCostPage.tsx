import { useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useItemFlags } from '../../utils/useInactiveItems'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import type { Item } from '../../types/api'
import CodePickerField from '../../components/CodePickerField'
import { EcReportHead, EcReportFoot } from '../../components/EcReportFrame'
import { useCostPeriods, costPeriodText, costPeriodRange, inCostPeriod, type CostPeriod } from '../../utils/costPeriods'

/**
 * 품목 → <b>생산공정명</b>. 원본 원가 화면 셋이 이 칸을 둔다.
 *
 * <p><b>2026-09-09 실측으로 뜻을 가렸다.</b> 여태 "우리 재고는 창고 단위라 <b>공정별 재공</b>이
 * 없어 그 칸에 넣을 값이 없다" 고 적어 두고 셋 다 안 만들고 있었는데, 원본 실제원가현황
 * (E040804)의 자료 125줄을 읽어 보니 <b>그 칸은 재공을 가르는 축이 아니었다</b> —
 * <ul>
 *   <li>줄은 <b>품목별 하나</b>다(같은 품목코드가 두 번 서는 일이 0건)</li>
 *   <li>[생산공정명]이 채워진 줄은 <b>열다섯</b>뿐이고 전부 <b>만들어지는 품목</b>이다
 *       (제품 완제품공정 · 반제품 반제품공정 · 시제품 시제품공정). 사 오는 원재료는 빈칸이다</li>
 * </ul>
 * 즉 <b>그 품목이 어느 공정에서 만들어지는가</b>이고, 그 값은 <b>BOR</b>(품목이 거치는 작업)이
 * 진작 들고 있다. 작업지시서별진행현황이 이미 같은 자리를 그렇게 쓴다.
 *
 * <p>BOR 이 없는 품목은 <b>빈칸</b>이다 — 원본도 그렇다. 창고 이름을 공정처럼 갖다 쓰지 않는다.
 */
interface BorRow { productId: number; processName: string; seq: number }
/** BOR 의 <b>첫 작업</b>(작업순서가 가장 앞선 줄)이 그 품목의 공정이다. */
function processMapOf(bors: BorRow[]) {
  const m = new Map<number, { seq: number; name: string }>()
  for (const b of bors) {
    const cur = m.get(b.productId)
    if (!cur || b.seq < cur.seq) m.set(b.productId, { seq: b.seq, name: b.processName })
  }
  return (id: number) => m.get(id)?.name ?? ''
}

/**
 * 이익관리 > 표준원가현황(E040808)
 *
 * <p><b>2026-10-13 원본 실측(loginaa)</b>: 조건 [기준월] · [품목] · [생산공정] · [기타](결재방표시 · 수량관리제외품목포함 ·
 * 사용중단품목포함 · 단가0포함, 넷 다 꺼짐) · [정렬/소계기준]. [기준월]은 월별이익현황과 같은 <b>원가 기간 코드도움</b>이고
 * 기본은 최근 기간('2026/10  ~ 2026/10  (총평균법)'). 격자는 [품목코드 · 품목명[규격] · 품목구분(세트포함) · 생산공정명 · 단가]
 * 다섯 칸, 위에 '표준원가현황' · 회사명 · 기간, 아래 [인쇄 · Excel]. 표준원가를 아직 안 만든 기간은 '등록된 데이터가 없습니다.'.
 *
 * <p>예전 우리는 기준월이 '전체' 고름칸이었고, 번호 · [기간] · 재료비 · 노무비 · 경비 열, [합계표시], 아래 소계 표,
 * [새로고침] 이 더 있었다 — 원본에 없어 뺐다(재료비 · 노무비 · 경비는 원가생성/수정의 [수정] 창이 보여 준다).
 * 원가 기간이 여러 달이면 우리 원가는 달마다 서므로 <b>품목마다 마지막 달</b>의 것을 한 줄로 낸다.
 */
interface Cost {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  period: string
  standardTotal: number
}

export default function StandardCostPage() {
  const [signBox, setSignBox] = useState(false)
  const [rows, setRows] = useState<Cost[]>([])
  const [keyword, setKeyword] = useState('')
  const [withInactive, setWithInactive] = useState(false)
  const [withZero, setWithZero] = useState(false)
  const [withUntracked, setWithUntracked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { inactive, untracked } = useItemFlags()
  const mgmt = useItemMgmt()
  const [items, setItems] = useState<Item[]>([])
  const [bors, setBors] = useState<BorRow[]>([])
  const processOf = useMemo(() => processMapOf(bors), [bors])
  const catOf = useMemo(() => new Map(items.map((i) => [i.id, i.categoryName])), [items])
  /* 원본 격자는 [품목명[규격]] 한 칸이다 — 규격은 줄에 없어 품목 마스터에서 잇는다. */
  const specOf = (itemId: number) => items.find((x) => x.id === itemId)?.spec ?? ''
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  const [processCond, setProcessCond] = useState('')
  const [itemCond, setItemCond] = useState('')

  /* 원본 [기준월] — 원가 기간 코드도움. */
  const [periodId, setPeriodId] = useState('')
  const [shownPeriod, setShownPeriod] = useState<CostPeriod | null>(null)
  const { periods } = useCostPeriods((first) => {
    if (first) { setPeriodId(String(first.id)); void load(first) }
  })

  async function load(p = periods.find((x) => String(x.id) === periodId) ?? null) {
    if (!p) return
    setLoading(true)
    setError('')
    try {
      const [res, it, br] = await Promise.all([
        api.get<Cost[]>('/costs'),
        api.get<Item[]>('/items'),
        api.get<BorRow[]>('/bor'),
      ])
      setRows(res.data); setItems(it.data); setBors(br.data); setShownPeriod(p)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* 기간 안의 원가 — 품목마다 마지막 달 하나. */
  const inPeriod = useMemo(() => {
    const m = new Map<number, Cost>()
    for (const r of rows) {
      if (!shownPeriod || !inCostPeriod(shownPeriod, r.period)) continue
      const cur = m.get(r.itemId)
      if (!cur || cur.period < r.period) m.set(r.itemId, r)
    }
    return [...m.values()].sort((a, b) => a.itemCode.localeCompare(b.itemCode, 'ko', { numeric: true }))
  }, [rows, shownPeriod])
  const shown = inPeriod
    .filter((r) => !keyword || r.itemName.includes(keyword) || r.itemCode.includes(keyword))
    .filter((r) => withInactive || !inactive.has(r.itemId))
    .filter((r) => withUntracked || !untracked.has(r.itemId))
    .filter((r) => withZero || r.standardTotal !== 0)
    .filter((r) => !categoryCond || (catOf.get(r.itemId) ?? '') === categoryCond)
    .filter((r) => !itemGroupCond || mgmt.groupOf(r.itemId) === itemGroupCond)
    .filter((r) => !processCond || processOf(r.itemId) === processCond)
    .filter((r) => !itemCond || String(r.itemId) === itemCond)
  const total = shown.reduce((s, r) => s + r.standardTotal, 0)
  const processNames = [...new Set(bors.map((b) => b.processName).filter(Boolean))].sort()

  const reset = () => {
    setKeyword(''); setItemCond(''); setCategoryCond(''); setItemGroupCond(''); setProcessCond('')
    setWithInactive(false); setWithUntracked(false); setWithZero(false); setSignBox(false)
    const first = periods.find((p) => p.latest) ?? periods[0]
    setPeriodId(first ? String(first.id) : '')
  }

  return (
    <EcListShell title="표준원가현황" search={keyword} onSearchChange={setKeyword}
      actions={[{ label: '검색(F8)', primary: true, onClick: () => void load() }, { label: '다시 작성', onClick: reset },
        { label: '인쇄' }, { label: 'Excel' }]} signLine={signBox}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준월" pick>
          <CodePickerField label="기준월" hideLabel width={260} placeholder="기준월"
                           value={periodId} onChange={setPeriodId}
                           items={periods.map((p) => ({ value: String(p.id), name: costPeriodText(p) }))} />
        </EcCond>
        {/* 원본 차례(2026-09-08 실측, 열): 기준월 · 품목 · 품목구분 · 품목그룹1 · (품목그룹2/3 · 품목계층그룹) · 생산공정 · 기타 · 정렬/소계기준. */}
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name }))} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <select className="ec-input w-[140px]" value={categoryCond}
                  onChange={(e) => setCategoryCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(rows.map((r) => catOf.get(r.itemId)).filter(Boolean) as string[])].sort()
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <select className="ec-input w-[160px]" value={itemGroupCond}
                  onChange={(e) => setItemGroupCond(e.target.value)}>
            <option value="">전체</option>
            {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </EcCond>
        {/* 원본 [생산공정] — 그 품목이 만들어지는 공정(BOR 첫 작업). */}
        <EcCond label="생산공정" pick>
          <CodePickerField label="생산공정" hideLabel width={200} emptyLabel="전체"
                           value={processCond} onChange={setProcessCond}
                           items={processNames.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            결재방표시
          </label>
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} />
            수량관리제외품목포함
          </label>
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단품목포함
          </label>
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={withZero} onChange={(e) => setWithZero(e.target.checked)} />
            단가0포함
          </label>
        </EcCond>
      </ul>
      {shownPeriod && <EcReportHead title="표준원가현황" period={costPeriodRange(shownPeriod)} />}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[90px]">품목코드</th>
            <th>품목명[규격]</th>
            <th className="w-[80px]">품목구분(세트포함)</th>
            {/* 그 품목이 만들어지는 공정 — BOR 이 든다(위 processMapOf 주석). */}
            <th className="w-[100px]">생산공정명</th>
            <th className="text-right">단가</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={5} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td>{r.itemCode}</td>
              <td>{r.itemName}{specOf(r.itemId) ? ` [${specOf(r.itemId)}]` : ''}</td>
              <td>{catOf.get(r.itemId) ?? ''}</td>
              <td>{processOf(r.itemId)}</td>
              <td className="text-right">{r.standardTotal.toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={4} className="text-center">합계</td>
              <td className="text-right">{total.toLocaleString('ko-KR')}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {shownPeriod && <EcReportFoot />}
    </EcListShell>
  )
}
