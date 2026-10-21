import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField, { type CodeItem } from '../../components/CodePickerField'
import EcHistoryButton from '../../components/EcHistory'
import { EcCond } from '../../components/EcStatusPanel'
import { partnerCodeItems } from '../../utils/codeItems'
import { useTableSort } from '../../utils/useTableSort'

/** 원본 목록 쪽당 줄 수(2026-10-14 loginaa 실측 — 100줄, 위 왼쪽 쪽번호). */
const PAGE_SIZE = 100

interface PriceGroup { code: string; name: string; active: boolean }

/**
 * 재고 I › 기초등록 › 단가관리 › 거래처특별단가그룹등록(원본 E040120, 화면 제목 '거래처특별단가그룹').
 *
 * <p>2026-10-14 loginaa 실측(plans/재고1/E040120.md):
 * <ul>
 *   <li>격자 거래처코드(링크) · 거래처명(링크) · 영업단가그룹명 · 구매단가그룹명 — 번호 · 체크 칸 없음, 모든 거래처, 거래처명 차례.
 *       머리 700 · 34.3, 본문 28.4. 열 폭 300.4 / 583.4 / 367.3 / 367.4(본문 1619). 영업단가그룹명 칸은 오른쪽, 구매는 가운데 정렬(원본 그대로).
 *       쪽당 100줄. 아래 버튼줄 [Excel] 하나.</li>
 *   <li>Search(F3) 조건: 거래처 · 영업단가그룹 · 구매단가그룹(코드도움) · 기타 수정일자순(정렬).</li>
 *   <li>코드 · 이름 링크 → '거래처특별단가그룹수정' 창(960): 거래처코드 · 거래처명(글자) · 영업단가그룹명 · 구매단가그룹명(코드도움, × 로 비움).
 *       버튼 저장(F8) · 다시 작성 · 닫기 · H. 저장하면 <b>말 없이 닫히고</b> 목록 줄이 바뀐다. H 는 마지막으로 고친 때 한 줄.
 *       단가그룹 코드도움 창은 제목 '영업단가그룹명'/'구매단가그룹명', 열 특별단가그룹코드 · 특별단가그룹명(470 · 470), 하단 [닫기] 하나.</li>
 * </ul>
 * 예전 우리 화면은 격자 안 select 두 개 + 일괄 [저장] + 원본에 없는 알림('n개 거래처 단가그룹을 저장했습니다.')이었다.
 */
export default function SpecialPriceGroupPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [cond, setCond] = useState({ partner: '', sales: '', purchase: '' })
  const [page, setPage] = useState(1)
  /** Search(F3) 기타 [수정일자순(정렬)] — 켜면 최근에 고친 거래처가 먼저 */
  const [byUpdated, setByUpdated] = useState(false)

  /* 수정 창 */
  const [edit, setEdit] = useState<Partner | null>(null)
  const [form, setForm] = useState({ sales: '', purchase: '' })
  const [formError, setFormError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [p, g] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<PriceGroup[]>('/special-prices/groups'),
      ])
      setPartners(p.data)
      setPriceGroups(g.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const groupName = (code: string | null | undefined) => (code ? priceGroups.find((g) => g.code === code)?.name ?? code : '')
  const groupItems: CodeItem[] = useMemo(
    () => priceGroups.map((g) => ({ value: g.code, code: g.code, name: g.name, stopped: !g.active })), [priceGroups])
  const groupCols = [
    { head: '특별단가그룹코드', width: 470, cell: (i: CodeItem) => i.code ?? '', link: true },
    { head: '특별단가그룹명', width: 470, cell: (i: CodeItem) => i.name, link: true },
  ]
  const partnerItems = useMemo(() => partnerCodeItems(partners), [partners])

  function openEdit(p: Partner) {
    setEdit(p)
    setForm({ sales: p.salesPriceGroup ?? '', purchase: p.purchasePriceGroup ?? '' })
    setFormError('')
  }

  async function save(ev?: FormEvent) {
    ev?.preventDefault()
    if (!edit) return
    try {
      await api.patch(`/partners/${edit.id}/price-group`, {
        salesPriceGroup: form.sales || null,
        purchasePriceGroup: form.purchase || null,
      })
      setEdit(null)          // 원본: 저장하면 말 없이 닫힌다
      void load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  const shownRows = partners
    .filter((p) => !keyword || p.code.includes(keyword) || p.name.includes(keyword))
    .filter((p) => !cond.partner || String(p.id) === cond.partner)
    .filter((p) => !cond.sales || p.salesPriceGroup === cond.sales)
    .filter((p) => !cond.purchase || p.purchasePriceGroup === cond.purchase)
    // 원본 기본 차례 = 거래처명(글자 차례 — '!!! …' · '### …' · 'QA재고1-…' · 'QA회계2-…'). [수정일자순(정렬)] 은 고친 날짜 늦은 것부터
    .sort((a, b) => (byUpdated
      ? (b.updatedDate ?? '').localeCompare(a.updatedDate ?? '')
      : 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  const sort = useTableSort(shownRows, {
    거래처코드: (p) => p.code,
    거래처명: (p) => p.name,
    영업단가그룹명: (p) => groupName(p.salesPriceGroup),
    구매단가그룹명: (p) => groupName(p.purchasePriceGroup),
  })
  const all = sort.sorted
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const shown = all.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [keyword, cond, byUpdated])

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '거래처특별단가그룹', [shown.length])

  return (
    <EcListShell
      title="거래처특별단가그룹"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={() => undefined}
      collapseConditions
      onReset={() => { setCond({ partner: '', sales: '', purchase: '' }); setByUpdated(false) }}
      actions={[{ label: 'Excel' }]}
    >
      {/* 원본 Search(F3) 조건: 거래처 · 영업단가그룹 · 구매단가그룹 · 기타 수정일자순(정렬) · 양식 적용양식 기본(수정불가) */}
      <ul className="ec-cond">
        <EcCond label="거래처">
          <CodePickerField label="거래처" hideLabel fill placeholder="거래처" emptyLabel=""
                           value={cond.partner} onChange={(v) => setCond({ ...cond, partner: v })} items={partnerItems} />
        </EcCond>
        <EcCond label="영업단가그룹">
          <CodePickerField label="영업단가그룹" hideLabel fill placeholder="영업단가그룹" emptyLabel="" plain hideNew columns={groupCols}
                           value={cond.sales} onChange={(v) => setCond({ ...cond, sales: v })} items={groupItems} />
        </EcCond>
        <EcCond label="구매단가그룹">
          <CodePickerField label="구매단가그룹" hideLabel fill placeholder="구매단가그룹" emptyLabel="" plain hideNew columns={groupCols}
                           value={cond.purchase} onChange={(v) => setCond({ ...cond, purchase: v })} items={groupItems} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px]"><input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)</label>
        </EcCond>
        <EcCond label="양식">
          <span className="mr-[6px]">적용양식</span>
          <select className="ec-input w-[200px]" aria-label="적용양식" disabled><option>기본(수정불가)</option></select>
        </EcCond>
      </ul>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {pages > 1 && (
        <nav className="ec-paging mb-[5px]" aria-label="쪽">
          {Array.from({ length: pages }, (_, n) => n + 1)
            .filter((n) => Math.floor((n - 1) / 10) === Math.floor((cur - 1) / 10))
            .map((n) => (
              <button key={n} type="button" className={n === cur ? 'active' : undefined}
                      aria-current={n === cur ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
            ))}
        </nav>
      )}

      <table ref={tableRef} className="w-full text-left">
        <colgroup>
          <col className="w-[18.55%]" /><col className="w-[36.03%]" /><col className="w-[22.71%]" /><col className="w-[22.71%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="cursor-pointer" onClick={() => sort.toggle('거래처코드')}>거래처코드 {sort.mark('거래처코드')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('거래처명')}>거래처명 {sort.mark('거래처명')}</th>
            <th className="text-right cursor-pointer" onClick={() => sort.toggle('영업단가그룹명')}>영업단가그룹명 {sort.mark('영업단가그룹명')}</th>
            <th className="text-center cursor-pointer" onClick={() => sort.toggle('구매단가그룹명')}>구매단가그룹명 {sort.mark('구매단가그룹명')}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={4} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((p) => (
            <tr key={p.id}>
              {/* 원본: 코드 · 이름을 누르면 '거래처특별단가그룹수정' 창 */}
              <td onClick={(e) => { e.preventDefault(); openEdit(p) }}><a href="#" className="text-ec-navy">{p.code}</a></td>
              <td onClick={(e) => { e.preventDefault(); openEdit(p) }}><a href="#" className="text-ec-navy">{p.name}</a></td>
              <td className="text-right">{groupName(p.salesPriceGroup)}</td>
              <td className="text-center">{groupName(p.purchasePriceGroup)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal error={formError} open={!!edit} title="거래처특별단가그룹수정" width={960} onClose={() => setEdit(null)}>{edit && (
        <form onSubmit={save}>
          <ul className="ec-form">
            <li className="wide"><span className="title">거래처코드</span><div className="form"><span>{edit.code}</span></div></li>
            <li className="wide"><span className="title">거래처명</span><div className="form"><span>{edit.name}</span></div></li>
            <li className="wide"><span className="title">영업단가그룹명</span><div className="form">
              <CodePickerField label="영업단가그룹명" popupTitle="영업단가그룹명" hideLabel fill placeholder="영업단가그룹명" emptyLabel="" plain hideNew columns={groupCols}
                               value={form.sales} onChange={(v) => setForm({ ...form, sales: v })} items={groupItems} />
            </div></li>
            <li className="wide"><span className="title">구매단가그룹명</span><div className="form">
              <CodePickerField label="구매단가그룹명" popupTitle="구매단가그룹명" hideLabel fill placeholder="구매단가그룹명" emptyLabel="" plain hideNew columns={groupCols}
                               value={form.purchase} onChange={(v) => setForm({ ...form, purchase: v })} items={groupItems} />
            </div></li>
          </ul>
          <div className="flex gap-[6px] mt-[12px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => openEdit(edit)}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setEdit(null)}>닫기</button>
            <EcHistoryButton target="PARTNER" id={edit.id} last />
          </div>
        </form>
      )}</Modal>
    </EcListShell>
  )
}
