import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../../components/EcListShell'
import { api, extractErrorMessage } from '../../../api/client'
import type { Partner } from '../../../types/api'

/**
 * 출력물 › 기타 › 거래처중심입력 (이카운트 E040627).
 *
 * <p><b>2026-10-20 원본 실측</b> — 화면은 두 칸이다. 왼쪽은 [거래처] 찾기 칸 + 거래처 목록,
 * 오른쪽은 [메뉴] 찾기 칸 + 바로가기 목록, 아래에 [전표입력] 하나. 거래처를 고르고 메뉴를 누르면
 * 그 거래처를 물고 그 화면이 열린다. <b>거래 내역 격자는 원본에 없다</b> — 우리가 붙여 두었던
 * 판매·구매 줄 목록과 공급가액 합계를 뺐다.
 *
 * <p>바로가기 차례(원본 그대로): 거래처관리대장 II · 채권현황 · 채권/채무현황 · 판매조회 · 구매조회 ·
 * 회계거래조회 · 채무현황 · 거래처관리대장1(채권) · 거래처관리대장1(채무).
 * 거래처관리대장 II · 회계거래조회는 우리 화면이 거래처를 주소로 받지 않아 그냥 연다.
 */
const LINKS: { label: string; to: (p: Partner | undefined) => string }[] = [
  { label: '거래처관리대장 II', to: () => '/accounting/partner-book-2' },
  { label: '채권현황', to: (p) => `/sales/receivable-status${p ? `?partner=${encodeURIComponent(p.name)}` : ''}` },
  { label: '채권/채무현황', to: (p) => `/sales/ar-ap-status${p ? `?partner=${encodeURIComponent(p.name)}` : ''}` },
  { label: '판매조회', to: (p) => `/sales/sales-list${p ? `?partner=${encodeURIComponent(p.name)}` : ''}` },
  { label: '구매조회', to: (p) => `/sales/purchase-list${p ? `?partner=${encodeURIComponent(p.name)}` : ''}` },
  { label: '회계거래조회', to: () => '/accounting/journals' },
  { label: '채무현황', to: (p) => `/sales/payable-status${p ? `?partner=${encodeURIComponent(p.name)}` : ''}` },
  // 대장은 거래처 조건이 id 다(코드도움 값) — 이름이 겹치는 거래처가 섞이지 않게 id 로 문다.
  { label: '거래처관리대장1(채권)', to: (p) => `/sales/partner-ledger-receivable${p ? `?partnerId=${p.id}` : ''}` },
  { label: '거래처관리대장1(채무)', to: (p) => `/sales/partner-ledger-payable${p ? `?partnerId=${p.id}` : ''}` },
]

export default function PartnerEntryPage() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState<Partner[]>([])
  const [partnerId, setPartnerId] = useState<number | null>(null)
  const [partnerKw, setPartnerKw] = useState('')
  const [menuKw, setMenuKw] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Partner[]>('/partners')
      .then((r) => setPartners(r.data))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const selected = partners.find((p) => p.id === partnerId)
  const shownPartners = partners.filter((p) => !partnerKw.trim()
    || p.name.includes(partnerKw.trim()) || p.code.includes(partnerKw.trim()))
  const shownLinks = LINKS.filter((l) => !menuKw.trim() || l.label.includes(menuKw.trim()))

  return (
    <EcListShell
      title="거래처중심입력"
      actions={[{
        label: '전표입력', primary: true,
        onClick: () => navigate(`/sales/sell${selected ? `?partnerId=${selected.id}` : ''}`),
      }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[12px]">
        <div className="ec-form">
          <input className="ec-input w-full mb-[6px]" placeholder="거래처" value={partnerKw}
                 onChange={(e) => setPartnerKw(e.target.value)} />
          <ul className="max-h-[420px] overflow-y-auto">
            {shownPartners.map((p) => (
              <li key={p.id}>
                <button type="button"
                        className={`no-ec w-full text-left py-[4px] px-[6px] text-[12.5px] ${p.id === partnerId ? 'bg-ec-blue-tint font-bold' : ''}`}
                        onClick={() => setPartnerId(p.id === partnerId ? null : p.id)}>
                  {p.name}
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
