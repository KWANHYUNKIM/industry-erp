import { Link } from 'react-router-dom'

/**
 * 플로우차트 위젯 — 원본 업무 흐름 그림. 칸을 누르면 그 메뉴로 간다.
 * 줄: 판매 흐름 · 생산 흐름 · 구매 흐름, 끝에 출력물.
 */
const FLOW: { label: string; to: string }[][] = [
  [{ label: '기초등록', to: '/inventory/items' }],
  [
    { label: '견적', to: '/sales/quotations' },
    { label: '주문', to: '/sales/orders' },
    { label: '판매', to: '/sales/sell' },
    { label: '수금', to: '/sales/collection' },
  ],
  [
    { label: '작업지시서', to: '/production/work-orders' },
    { label: '불출', to: '/production/issue' },
    { label: '생산', to: '/production/receipt-bom' },
  ],
  [
    { label: '발주', to: '/sales/purchase-orders' },
    { label: '구매', to: '/sales/buy' },
    { label: '지급', to: '/sales/payment' },
  ],
  [
    { label: '재고출력물', to: '/inventory/current' },
    { label: '회계출력물', to: '/accounting/trial-balance' },
  ],
]

export default function FlowchartWidget() {
  return (
    <div className="ec-wflow">
      {FLOW.map((line, i) => (
        <div key={i} className="ec-wflow-line">
          {line.map((s, j) => (
            <span key={s.label} className="ec-wflow-step">
              {j > 0 && <span className="arrow">→</span>}
              <Link to={s.to}>{s.label}</Link>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
