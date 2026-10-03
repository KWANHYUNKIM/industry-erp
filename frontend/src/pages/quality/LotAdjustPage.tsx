import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { useCondPickers } from '../../utils/useCondPickers'
import type { Lot, LotTransaction } from '../../types/api'

const qty2 = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 원본 [재고수량] 체크 — 전체 · 1 · 0 · 기타(1 도 0 도 아닌 것). */
const QTY_KINDS = ['1', '0', '기타'] as const
type QtyKind = (typeof QTY_KINDS)[number]
const kindOf = (n: number): QtyKind => (n === 1 ? '1' : n === 0 ? '0' : '기타')

/**
 * 재고 II &gt; 시리얼/로트No. &gt; 시리얼/로트No. 재고조정 &gt; <b>시리얼/로트No.재고조정</b>(E040634) — 2026-10-04 loginaa 실측.
 *
 * <p>조건: 유효기한(구간) · 시리얼/로트No. · 품목 · 재고수량(☑전체 ☑1 ☑0 ☑기타). 격자는 <b>입력 격자</b>다 —
 * 품목코드 · 품목명 · 시리얼/로트No. · 규격 · <b>합계</b>(입력칸, 지금 로트 재고) · 상세내역 [보기] · <b>적요</b>(입력칸).
 * 위에 [합계 ▾ (값) 적용] 으로 보이는 줄 모두에 같은 값을 넣고, 아래 [저장(F8)].
 *
 * <p>원본 CRUD: QA재고2-LOT1(재고 0)의 합계를 5 로 고쳐 저장 → "저장되었습니다." → 합계 5.00, 적요 칸은 비워진다.
 * [보기] 를 누르면 시리얼/로트No.내역조회 창이 그 로트로 열리고 <b>2026/10/04 -1 · 재고조정</b> 한 줄(연결전표 없음)이 생겨 있다.
 * 즉 <b>입력한 값이 목표 재고</b>이고 차이를 재고조정 이력으로 남긴다 — 품목 재고는 건드리지 않는다(그래서 품목vs시리얼재고수량비교가 있다).
 * 우리는 로트 실사조정 API(PATCH /lots/{id}/adjust)가 같은 일을 한다 — 바뀐 줄만 보낸다.
 */
export default function LotAdjustPage() {
  const pickers = useCondPickers(['items'])
  const [lots, setLots] = useState<Lot[]>([])
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [item, setItem] = useState('')
  const [kinds, setKinds] = useState<QtyKind[]>([...QTY_KINDS])
  /** 입력 — 로트 id → 합계(목표 재고) · 적요. 안 고친 줄은 없다. */
  const [edits, setEdits] = useState<Record<number, { qty?: string; remark?: string }>>({})
  const [bulk, setBulk] = useState('0')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [detail, setDetail] = useState<Lot | null>(null)
  const [detailRows, setDetailRows] = useState<LotTransaction[]>([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      setLots((await api.get<Lot[]>('/lots')).data)
      setEdits({})
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const shown = useMemo(() => lots
    .filter((l) => !expFrom || (l.expireDate ?? '') >= expFrom)
    .filter((l) => !expTo || (l.expireDate != null && l.expireDate <= expTo))
    .filter((l) => !lotNo || l.lotNo.includes(lotNo))
    .filter((l) => !item || String(l.itemId) === item)
    .filter((l) => kinds.includes(kindOf(Number(l.stockQty))))
    .sort((a, b) => a.lotNo.localeCompare(b.lotNo) || a.itemCode.localeCompare(b.itemCode)),
  [lots, expFrom, expTo, lotNo, item, kinds])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '시리얼/로트No.재고조정', [shown.length])

  const qtyOf = (l: Lot) => edits[l.id]?.qty ?? String(Number(l.stockQty))
  const setEdit = (id: number, patch: { qty?: string; remark?: string }) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }))

  /** 원본 [합계 ▾ (값) 적용] — 보이는 줄 모두의 합계를 그 값으로. */
  const applyBulk = () => setEdits((e) => {
    const next = { ...e }
    for (const l of shown) next[l.id] = { ...next[l.id], qty: bulk }
    return next
  })

  async function save() {
    const changed = shown.filter((l) => edits[l.id]?.qty !== undefined && Number(edits[l.id]!.qty) !== Number(l.stockQty))
    for (const l of changed) {
      if (edits[l.id]!.qty!.trim() === '' || Number.isNaN(Number(edits[l.id]!.qty))) { setError(`${l.lotNo} 의 합계를 숫자로 입력하세요.`); return }
    }
    setSaving(true)
    setError('')
    try {
      for (const l of changed) {
        await api.patch(`/lots/${l.id}/adjust`, { actualQty: Number(edits[l.id]!.qty), note: edits[l.id]!.remark || null })
      }
      setNotice('저장되었습니다.')
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function openDetail(l: Lot) {
    setDetail(l)
    try {
      const r = await api.get<LotTransaction[]>('/lots/transactions')
      setDetailRows(r.data.filter((t) => t.lotId === l.id).sort((a, b) => (a.txDate < b.txDate ? 1 : a.txDate > b.txDate ? -1 : b.id - a.id)))
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  return (
    <EcListShell
      title="시리얼/로트No.재고조정"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setExpFrom(''); setExpTo(''); setLotNo(''); setItem(''); setKinds([...QTY_KINDS]) } },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <p className="ec-alert ec-alert-success mb-[8px]">{notice}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="유효기한">
          <input type="date" className="ec-input w-[145px]" value={expFrom} onChange={(e) => setExpFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={expTo} onChange={(e) => setExpTo(e.target.value)} />
        </EcCond>
        <EcCond label="시리얼/로트No.">
          <input className="ec-input w-[200px]" value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="재고수량">
          <span className="inline-flex items-center gap-[8px]">
            <label className="inline-flex items-center gap-[3px]">
              <input type="checkbox" checked={kinds.length === QTY_KINDS.length}
                     onChange={(e) => setKinds(e.target.checked ? [...QTY_KINDS] : [])} /> 전체
            </label>
            {QTY_KINDS.map((k) => (
              <label key={k} className="inline-flex items-center gap-[3px]">
                <input type="checkbox" checked={kinds.includes(k)}
                       onChange={(e) => setKinds((v) => (e.target.checked ? [...v, k] : v.filter((x) => x !== k)))} /> {k}
              </label>
            ))}
          </span>
        </EcCond>
      </ul>

      {/* 원본 격자 위 [합계 ▾ (값) 적용] — 보이는 줄 모두의 합계를 한 번에 채운다. */}
      <div className="flex items-center gap-[6px] mb-[6px]">
        <select className="ec-input w-[80px]" value="합계" onChange={() => undefined}><option value="합계">합계</option></select>
        <input className="ec-input w-[120px] text-right" value={bulk} onChange={(e) => setBulk(e.target.value)} />
        <button type="button" className="ec-btn" onClick={applyBulk}>적용</button>
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th>품목코드</th>
            <th>품목명</th>
            <th>시리얼/로트No.</th>
            <th>규격</th>
            <th className="text-right w-[140px]">합계</th>
            <th className="text-center w-[80px]">상세내역</th>
            <th className="w-[180px]">적요</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((l) => (
            <tr key={l.id}>
              <td>{l.itemCode}</td>
              <td>{l.itemName}</td>
              <td>{l.lotNo}</td>
              <td>{l.spec ?? ''}</td>
              <td><input className="ec-input w-full text-right" aria-label={`${l.lotNo} 합계`} value={qtyOf(l)}
                         onChange={(e) => setEdit(l.id, { qty: e.target.value })} /></td>
              <td className="text-center"><button type="button" className="ec-btn ec-btn-sm" onClick={() => void openDetail(l)}>보기</button></td>
              <td><input className="ec-input w-full" aria-label={`${l.lotNo} 적요`} value={edits[l.id]?.remark ?? ''}
                         onChange={(e) => setEdit(l.id, { remark: e.target.value })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void save()}>저장(F8)</button>
      </div>

      {/* 원본 [보기] — 시리얼/로트No.내역조회 창이 그 로트로 열린다. */}
      <Modal error={error} open={detail != null} title="시리얼/로트No.내역조회" onClose={() => setDetail(null)} width={760}>
        <table className="w-full text-left">
          <thead><tr>
            <th className="text-center">일자-No.</th><th>품목명[규격]</th><th>시리얼/로트No.</th>
            <th className="text-right">수량</th><th className="text-center">전표구분</th><th>연결전표-No.</th><th>유효기한</th>
          </tr></thead>
          <tbody>
            {detailRows.length === 0 ? (
              <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : detailRows.map((t) => (
              <tr key={t.id}>
                <td className="text-center">{t.txDate.replace(/-/g, '/')}</td>
                <td>{t.itemName}{detail?.spec ? ` [${detail.spec}]` : ''}</td>
                <td>{t.lotNo}</td>
                <td className="text-right">{qty2(t.quantityChange)}</td>
                <td className="text-center">{t.docType ?? t.typeName}</td>
                <td>{t.sourceNo ?? ''}</td>
                <td>{(t.expireDate ?? '').replace(/-/g, '/')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </EcListShell>
  )
}
