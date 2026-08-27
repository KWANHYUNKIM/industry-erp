import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import type { PriceOrderLine } from '../../api/types'
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#f5b301', fontSize: 14, marginRight: 4 }}>☆</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ec-text)' }}>단가적용순서설정</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="ec-btn" onClick={() => load(cat)}>새로고침</button>
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--ec-border)' }}>
        {(['SALES', 'PURCHASE'] as const).map((t) => (
          <button key={t} onClick={() => setCat(t)} className="no-ec" style={{
            padding: '6px 16px', fontSize: 12.5, border: 'none', cursor: 'pointer',
            background: cat === t ? '#fff' : 'transparent', color: cat === t ? 'var(--ec-blue)' : '#5a626e',
            fontWeight: cat === t ? 700 : 400, borderBottom: cat === t ? '2px solid var(--ec-blue)' : '2px solid transparent',
          }}>{CAT_LABEL[t]}</button>
        ))}
      </div>

      <div style={{ maxWidth: 760 }}>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>기능</th>
              <th style={{ width: 140, textAlign: 'right' }}>적용순서</th>
              <th style={{ width: 150, textAlign: 'center' }}>사용구분</th>
              <th style={{ textAlign: 'center', width: 150 }}>상세설정</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : lines.map((l, i) => (
              <tr key={l.functionName}>
                <td style={{ color: l.active ? undefined : '#9aa1ab' }}>{l.functionName}</td>
                <td style={{ textAlign: 'right' }}>
                  <b style={{ marginRight: 6 }}>{i + 1}</b>
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px' }} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button className="ec-btn" style={{ height: 20, padding: '0 6px', marginLeft: 3 }} disabled={i === lines.length - 1} onClick={() => move(i, 1)}>▼</button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <label style={{ marginRight: 10, fontSize: 12 }}>
                    <input type="radio" name={`u${i}`} checked={l.active} onChange={() => setActive(i, true)} /> 사용
                  </label>
                  <label style={{ fontSize: 12 }}>
                    <input type="radio" name={`u${i}`} checked={!l.active} onChange={() => setActive(i, false)} /> 사용안함
                  </label>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {DETAIL_LINK[l.functionName]
                    ? <Link to={DETAIL_LINK[l.functionName]!.to} style={{ color: 'var(--ec-blue)' }}>
                        {DETAIL_LINK[l.functionName]!.label}
                      </Link>
                    : <span style={{ color: '#c9ced6' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
        </div>
      </div>
    </div>
  )
}
