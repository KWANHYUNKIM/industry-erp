import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import GridCode from '../../components/GridCode'
import EcNumInput from '../../components/EcNumInput'
import type { CodeItem } from '../../components/CodePickerField'
import { won, type ProductLink } from './types'

/**
 * 원본 [설정] · [상세] 글자 — 정해졌으면 주황 바탕 흰 글자(.text-warning-inverse: 12px · 여백 0.9px 1.8px · 둥글기 6 · h 19.8),
 * 아니면 보통 링크 글자(E060901 · E060902 2026-10-13 실측).
 */
export function SetTag({ set, label, onClick }: { set: boolean; label: string; onClick: () => void }) {
  return (
    <a href="#" onClick={(e) => { e.preventDefault(); onClick() }}
       className={set ? 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline' : undefined}>
      {label}
    </a>
  )
}

/** 품목코드 칸이 고르는 품목 — 고르면 품목명 · 규격 · 단가(품목 단가)가 채워진다. */
export interface ProductOption { id: number; code: string; name: string; spec: string | null; unitPrice: number }

interface Row { itemId: string; quantity: string; unitPrice: string; supply: string; vat: string }
const MIN_ROWS = 5
const empty = (): Row => ({ itemId: '', quantity: '', unitPrice: '', supply: '', vat: '' })
const num = (s: string) => Number(String(s).replace(/,/g, '')) || 0
const qty = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const supplyOf = (q: string, p: string) => String(Math.round(num(q) * num(p)))
const vatOf = (supply: string) => String(Math.floor(num(supply) / 10))

/**
 * '품목연결설정' 창 — 회계 II › 계약관리. 계약항목등록 [품목별단가 › 설정] 과 계약입력 줄 [상세] 가 같이 쓴다.
 *
 * <p>2026-10-13 loginaa 실측(계약항목 00007 렌탈 품목관리): 열 품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세,
 * 빈 줄까지 다섯 줄, 합계 줄(수량 2.00 · 공급가액 340,000 · 부가세 34,000). 줄: D001 HZ-7070 안마의자 1.00 × 120,000 = 120,000 · 12,000 /
 * D002 JYP-5000 안마침대 1.00 × 220,000 = 220,000 · 22,000. 버튼 적용(F8) · 닫기.
 * 수량 · 단가를 바꾸면 공급가액 = 수량 × 단가, 부가세 = 공급가액의 10%(원 미만 버림)로 다시 셈한다.
 */
export default function ProductLinkModal({ open, value, products, onApply, onClose }: {
  open: boolean
  value: ProductLink[]
  products: ProductOption[]
  onApply: (links: ProductLink[]) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    if (!open) return
    const rs: Row[] = value.map((p) => ({ itemId: String(p.itemId), quantity: String(Number(p.quantity)), unitPrice: String(Number(p.unitPrice)),
      supply: String(Number(p.supplyAmount ?? 0)), vat: String(Number(p.vatAmount ?? 0)) }))
    while (rs.length < MIN_ROWS) rs.push(empty())
    setRows(rs)
  // 창을 열 때만 값을 다시 읽는다 — 부모가 그릴 때마다 새 배열을 줘도 고치던 칸이 되돌아가지 않게.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const items: CodeItem[] = products.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))
  const byId = (id: string) => products.find((p) => String(p.id) === id)
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => {
    const next = rs.map((r, j) => {
      if (j !== i) return r
      const n = { ...r, ...patch }
      if ('quantity' in patch || 'unitPrice' in patch) { n.supply = supplyOf(n.quantity, n.unitPrice); n.vat = vatOf(n.supply) }
      if ('supply' in patch) n.vat = vatOf(n.supply)
      return n
    })
    if (i === next.length - 1 && next[i].itemId) next.push(empty())
    return next
  })
  const pick = (i: number, id: string) => {
    const p = byId(id)
    setRow(i, { itemId: id, quantity: rows[i].quantity || '1', unitPrice: rows[i].unitPrice || String(Number(p?.unitPrice ?? 0)) })
  }
  const filled = rows.filter((r) => r.itemId)
  const sum = (k: 'quantity' | 'supply' | 'vat') => filled.reduce((s, r) => s + num(r[k]), 0)

  function apply() {
    onApply(filled.map((r) => {
      const p = byId(r.itemId)
      return { itemId: Number(r.itemId), itemCode: p?.code ?? null, itemName: p?.name ?? null, spec: p?.spec ?? null,
        quantity: num(r.quantity), unitPrice: num(r.unitPrice), supplyAmount: num(r.supply), vatAmount: num(r.vat) }
    }))
  }

  return (
    <Modal open={open} title="품목연결설정" width={860} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); apply() } }}>
        <h3 className="text-[14px] font-bold mb-[8px]">품목연결설정</h3>
        <table className="w-full mb-[8px]">
          <thead>
            <tr>
              <th className="w-[30px]" />
              <th className="w-[110px]">품목코드</th><th>품목명</th><th className="w-[80px]">규격</th>
              <th className="text-right w-[80px]">수량</th><th className="text-right w-[100px]">단가</th>
              <th className="text-right w-[110px]">공급가액</th><th className="text-right w-[100px]">부가세</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const p = byId(r.itemId)
              return (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td><GridCode title="품목검색" codeHead="품목코드" nameHead="품목명" items={items} value={r.itemId} onPick={(v) => pick(i, v)} /></td>
                  <td>{p?.name ?? ''}</td>
                  <td>{p?.spec ?? ''}</td>
                  <td>{r.itemId && <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}행 수량`} value={r.quantity} onValue={(v) => setRow(i, { quantity: v })} />}</td>
                  <td>{r.itemId && <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}행 단가`} value={r.unitPrice} onValue={(v) => setRow(i, { unitPrice: v })} />}</td>
                  <td>{r.itemId && <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}행 공급가액`} value={r.supply} onValue={(v) => setRow(i, { supply: v })} />}</td>
                  <td>{r.itemId && <EcNumInput className="ec-input w-full text-right" aria-label={`${i + 1}행 부가세`} value={r.vat} onValue={(v) => setRow(i, { vat: v })} />}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="ec-total">
              <td /><td /><td /><td />
              <td className="text-right">{qty(sum('quantity'))}</td>
              <td />
              <td className="text-right">{won(sum('supply'))}</td>
              <td className="text-right">{won(sum('vat'))}</td>
            </tr>
          </tfoot>
        </table>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  )
}
