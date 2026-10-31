import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../../components/EcListShell'
import { api, extractErrorMessage } from '../../../api/client'
import type { Item } from '../../../types/api'

/**
 * 출력물 › 기타 › 품목중심입력 (이카운트 E040633) — 거래처중심입력(E040627)의 짝.
 *
 * <p><b>2026-10-20 원본 실측</b> — 왼쪽 [품목] 찾기 칸 + 품목 목록, 오른쪽 [메뉴] 찾기 칸 + 바로가기
 * (창고별재고현황 · 판매현황 · 구매현황 · 재고수불부 · 재고일보), 아래 [전표입력]. 거래 내역 격자는
 * 원본에 없어 뺐다. 재고수불부만 품목을 주소로 받는다(?itemId=) — 나머지는 그냥 연다.
 */
const LINKS: { label: string; to: (it: Item | undefined) => string }[] = [
  { label: '창고별재고현황', to: () => '/inventory/warehouse-stock' },
  { label: '판매현황', to: () => '/sales/sales-status' },
  { label: '구매현황', to: () => '/sales/purchase-status' },
  { label: '재고수불부', to: (it) => `/inventory/ledger${it ? `?itemId=${it.id}` : ''}` },
  { label: '재고일보', to: () => '/inventory/daily-report' },
]

export default function ItemEntryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [itemId, setItemId] = useState<number | null>(null)
  const [itemKw, setItemKw] = useState('')
  const [menuKw, setMenuKw] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Item[]>('/items')
      .then((r) => setItems(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const selected = items.find((it) => it.id === itemId)
  const kw = itemKw.trim()
  const shownItems = items.filter((it) => !kw || it.name.includes(kw) || it.code.includes(kw))
  const shownLinks = LINKS.filter((l) => !menuKw.trim() || l.label.includes(menuKw.trim()))

  return (
    <EcListShell
      title="품목중심입력"
      actions={[{
        label: '전표입력', primary: true,
        onClick: () => navigate('/sales/sell'),
      }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[12px]">
        <div className="ec-form">
          <input className="ec-input w-full mb-[6px]" placeholder="품목" value={itemKw}
                 onChange={(e) => setItemKw(e.target.value)} />
          <ul className="max-h-[420px] overflow-y-auto">
            {shownItems.map((it) => (
              <li key={it.id}>
                <button type="button"
                        className={`no-ec w-full text-left py-[4px] px-[6px] text-[12.5px] ${it.id === itemId ? 'bg-ec-blue-tint font-bold' : ''}`}
                        onClick={() => setItemId(it.id === itemId ? null : it.id)}>
                  {it.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="ec-form">
          <input className="ec-input w-full mb-[6px]" placeholder="메뉴" value={menuKw}
                 onChange={(e) => setMenuKw(e.target.value)} />
          <ul>
            {shownLinks.map((l) => (
              <li key={l.label}>
                <button type="button" className="no-ec w-full text-left py-[4px] px-[6px] text-[12.5px] text-ec-navy"
                        onClick={() => navigate(l.to(selected))}>
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </EcListShell>
  )
}
