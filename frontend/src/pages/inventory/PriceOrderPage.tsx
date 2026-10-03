import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type { PriceOrderLine } from '../../types/api'
import { useShortcut } from '../../utils/useShortcut'

type Cat = 'SALES' | 'PURCHASE'
const CAT_LABEL: Record<Cat, string> = { SALES: '영업관리', PURCHASE: '구매관리' }

/**
 * 재고 기초등록 > 단가적용순서설정 — 영업/구매 단가 적용 우선순위(실제 저장).
 *
 * <p>원본 열 실측(사본): <b>기능</b> · 적용순서 · 사용구분 · <b>상세설정</b>
 * (열 id UPRC_DV_CD · APCL_PRTY_NO · USE_TF · DETAIL_LINK).
 * 우리는 [적용순서]를 앞에 두고 [상세설정] 자리에 순서변경 화살표를 놓았다 —
 * 순서를 바꾸는 수단은 있어야 하니 화살표는 [적용순서] 칸 안으로 옮기고,
 * 원본대로 [상세설정] 자리를 되돌린다.
 *
 * <p>[상세설정]은 그 기능의 값을 실제로 적는 화면으로 보낸다. 순서만 정해 놓고
 * 특별단가를 한 줄도 안 넣으면 이 설정은 아무 일도 하지 않는데, 그 사실을 알 방법이
 * 이 화면에 없었다.
 *
 * <p><b>2026-09-09 원본을 직접 열어 쟀다</b>(그전에는 사본만 봤다). 격자는 7행 4열이고
 * 열 정렬은 기능 좌 · 적용순서 우 · 사용구분 중 · 상세설정 중 — 우리와 같다.
 * 기능 일곱의 이름과 차례도 같다(창고별특별단가 품목별·품목그룹별 → 거래처별특별단가
 * 품목별·품목그룹별 → 최종단가 → 거래처조정률 → 출고단가).
 * <b>다른 것은 [사용구분] 기본값 하나였다</b> — 원본은 <b>[출고단가]만 '사용'</b>이고
 * 나머지 여섯은 '사용안함'으로 열린다. 서버의 미저장 기본값을 그렇게 고쳤다
 * (PriceOrderService.DEFAULT_FUNCTIONS 옆).
 * 버튼줄도 원본과 같다(저장(F8) 하나) — 원본에는 [검색]이 없다.
 */

/**
 * 기능마다 값을 적는 화면. 원본 [상세설정] 링크가 가리키는 곳이다.
 *
 * <p>[최종단가]는 마지막 거래단가를 그대로 쓰는 규칙이라 따로 적을 마스터가 없다 —
 * 없는 링크를 만들어 두면 눌렀을 때 빈 화면이 뜬다.
 */
const DETAIL_LINK: Record<string, { to: string; label: string } | null> = {
  '창고별특별단가(품목별)': { to: '/sales/special-price', label: '특별단가등록' },
  '창고별특별단가(품목그룹별)': { to: '/sales/special-price', label: '특별단가등록' },
  '거래처별특별단가(품목별)': { to: '/sales/special-price', label: '특별단가등록' },
  '거래처별특별단가(품목그룹별)': { to: '/inventory/special-price-group', label: '거래처특별단가그룹' },
  '최종단가': null,
  '거래처조정률': { to: '/sales/partners', label: '거래처등록' },
  '출고단가': { to: '/inventory/items', label: '품목등록' },
}
export default function PriceOrderPage() {
  const [cat, setCat] = useState<Cat>('SALES')
  const [lines, setLines] = useState<PriceOrderLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // 저장(F8) — 버튼 라벨이 약속한 단축키. 저장 중이면 안 먹는다.
  useShortcut('F8', save, !saving)

  async function load(c: Cat) {
    setLoading(true)
    try {
      const r = await api.get<PriceOrderLine[]>('/price-order-settings', { params: { category: c } })
      setLines(r.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(cat) }, [cat])

  function setActive(idx: number, v: boolean) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, active: v } : l)))
  }

  function move(idx: number, dir: -1 | 1) {
    setLines((ls) => {
      const j = idx + dir
      if (j < 0 || j >= ls.length) return ls
      const next = [...ls]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next.map((l, i) => ({ ...l, applyOrder: i + 1 }))
    })
  }

  async function save() {
    setError('')
    setSaving(true)
    try {
      const payload = { category: cat, settings: lines.map((l, i) => ({ ...l, applyOrder: i + 1 })) }
      const r = await api.put<PriceOrderLine[]>('/price-order-settings', payload)
      setLines(r.data)
      alert(`[${CAT_LABEL[cat]}] 단가적용순서를 저장했습니다.`)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="flex items-center mb-[8px]">
        <span className="text-ec-star text-[14px] mr-[4px]">☆</span>
        <span className="text-[15px] font-extrabold text-ec-text">단가적용순서설정</span>
        <div className="ml-auto flex gap-[4px]">
          <button className="ec-btn" onClick={() => load(cat)}>새로고침</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="flex gap-[2px] mb-[8px] border-b border-b-ec-line border-solid">
        {(['SALES', 'PURCHASE'] as const).map((t) => (
          <button key={t} onClick={() => setCat(t)} className="no-ec" style={{
            padding: '6px 16px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: cat === t ? '#fff' : 'transparent', color: cat === t ? 'var(--ec-blue)' : 'var(--ec-label)',
            fontWeight: cat === t ? 700 : 400, borderBottom: cat === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{CAT_LABEL[t]}</button>
        ))}
      </div>

      <div className="max-w-[760px]">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>기능</th>
              <th className="w-[140px] text-right">적용순서</th>
              <th className="w-[150px] text-center">사용구분</th>
              <th className="text-center w-[150px]">상세설정</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="ec-empty">불러오는 중…</td></tr>
            ) : lines.map((l, i) => (
              <tr key={l.functionName}>
                <td style={{ color: l.active ? undefined : 'var(--ec-text-hint)' }}>{l.functionName}</td>
                <td className="text-right">
                  <b className="mr-[6px]">{i + 1}</b>
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px' }} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px', marginLeft: 3 }} disabled={i === lines.length - 1} onClick={() => move(i, 1)}>▼</button>
                </td>
                <td className="text-center">
                  <label className="mr-[10px] text-[12px]">
                    <input type="radio" name={`u${i}`} checked={l.active} onChange={() => setActive(i, true)} /> 사용
                  </label>
                  <label className="text-[12px]">
                    <input type="radio" name={`u${i}`} checked={!l.active} onChange={() => setActive(i, false)} /> 사용안함
                  </label>
                </td>
                <td className="text-center">
                  {DETAIL_LINK[l.functionName]
                    ? <Link to={DETAIL_LINK[l.functionName]!.to} style={{ color: 'var(--ec-blue)' }}>
                        {DETAIL_LINK[l.functionName]!.label}
                      </Link>
                    : <span className="text-ec-off">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex gap-[6px] mt-[12px]">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        </div>
      </div>
    </div>
  )
}
