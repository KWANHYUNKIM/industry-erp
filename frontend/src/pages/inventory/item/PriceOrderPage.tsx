import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import type { PriceOrderLine } from '../../../types/api'
import { useShortcut } from '../../../utils/useShortcut'
import { ecAlert } from '../../../components/EcDialog'
import EcHistoryButton from '../../../components/EcHistory'
import Modal from '../../../components/Modal'

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
 * [상세설정] 칸 — 2026-10-14 원본(E040126 영업 · E040125 구매) 실측: 일곱 줄 중 <b>[거래처조정률] 한 줄에만 '설정'</b>이 있고
 * 나머지 칸은 비어 있다. 원본 '설정' 은 '소수점처리설정(영업관리/구매관리)' 창(소수점단위 · 처리방법 반올림 · [적용(F8)] [닫기])을 띄운다 —
 * 창은 있고(2026-10-21) 소수점단위 값 목록 · 저장은 원본 재기 필요 — [적용] 은 닫기만 한다. 예전엔 줄마다 등록 화면 링크를 달았다(원본에 없음).
 */
const DETAIL_SETTING = '거래처조정률'
export default function PriceOrderPage() {
  const [cat, setCat] = useState<Cat>('SALES')
  const [lines, setLines] = useState<PriceOrderLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  /** 불러온(마지막 저장) 값 — 원본은 바꾼 것 없이 [저장] 하면 '수정된 내역이 없습니다.' 를 띄운다. */
  const [savedKey, setSavedKey] = useState('')
  const [decimalOpen, setDecimalOpen] = useState(false)
  const keyOf = (ls: PriceOrderLine[]) => ls.map((l) => `${l.functionName}:${l.active}`).join('|')

  // 저장(F8) — 버튼 라벨이 약속한 단축키. 저장 중이면 안 먹는다.
  useShortcut('F8', save, !saving)

  async function load(c: Cat) {
    setLoading(true)
    try {
      const r = await api.get<PriceOrderLine[]>('/price-order-settings', { params: { category: c } })
      setLines(r.data)
      setSavedKey(keyOf(r.data))
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

  async function save() {
    setError('')
    if (keyOf(lines) === savedKey) { void ecAlert('수정된 내역이 없습니다.'); return }
    setSaving(true)
    try {
      const payload = { category: cat, settings: lines.map((l, i) => ({ ...l, applyOrder: i + 1 })) }
      const r = await api.put<PriceOrderLine[]>('/price-order-settings', payload)
      setLines(r.data)
      setSavedKey(keyOf(r.data))   // 원본은 저장 뒤 아무 말도 없다
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
          <button className="ec-btn">도움말</button>
        </div>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/* 원본 탭은 알약(켜짐 파란 바탕 · 흰 글, h24.6 · 여백 6.3px 11.7px) — 2026-10-14 실측 */}
      <div className="ec-pills mb-[8px]">
        {(['SALES', 'PURCHASE'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${cat === t ? ' active' : ''}`} onClick={() => setCat(t)}>{CAT_LABEL[t]}</button>
        ))}
      </div>

      {/* 원본 격자는 본문 폭 전부 · 열 46.6% · 10.7% · 29.3% · 13.3%, 머리 400 가운데(2026-10-14 E040126 실측, 폭 1628 에서 759.5 · 173.6 · 477.4 · 217) */}
      <div>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[46.6%] text-left font-normal">기능</th>
              <th className="w-[10.7%] text-right font-normal">적용순서</th>
              <th className="w-[29.3%] text-center font-normal">사용구분</th>
              <th className="w-[13.3%] text-center font-normal">상세설정</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="ec-empty">불러오는 중…</td></tr>
            ) : lines.map((l, i) => (
              // 원본 줄 높이 36.5(라디오 칸) — 우리 28.9 였다
              <tr key={l.functionName} className="h-[36.5px]">
                <td>{l.functionName}</td>
                <td className="text-right">{i + 1}</td>
                <td className="text-center">
                  <label className="mr-[10px] text-[12px]">
                    <input type="radio" name={`u${i}`} checked={l.active} onChange={() => setActive(i, true)} /> 사용
                  </label>
                  <label className="text-[12px]">
                    <input type="radio" name={`u${i}`} checked={!l.active} onChange={() => setActive(i, false)} /> 사용안함
                  </label>
                </td>
                <td className="text-center">
                  {l.functionName === DETAIL_SETTING && <button type="button" className="ec-link" onClick={() => setDecimalOpen(true)}>설정</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex gap-[6.3px] mt-[15.3px]">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          {/* 원본 [H] — '이력' 아래 한 줄(마지막으로 고친 때 [사람]), 탭마다 따로. PriceOrderService.save 가 PRICE_ORDER 1(영업) · 2(구매)로 적는다 */}
          <EcHistoryButton key={cat} target="PRICE_ORDER" id={cat === 'SALES' ? 1 : 2} last />
        </div>
      </div>

      {/*
        원본 '소수점처리설정(영업관리)' · '(구매관리)' — 탭에 따라 제목이 하나다(2026-10-21 실측). 소수점단위 소수점없음 · 소수점 1자리 … 10자리
        (기본 10자리), 처리방법 반올림 · 올림 · 버림(기본 반올림). [적용(F8)] 은 말 없이 창을 닫는다.
        우리는 단가 계산에 이 값을 쓰지 않아 고른 값을 저장하지 않는다(스키마 없음 — plans 재고1:67).
      */}
      <Modal open={decimalOpen} title={`소수점처리설정(${cat === 'SALES' ? '영업관리' : '구매관리'})`} width={420} error={error} onClose={() => setDecimalOpen(false)}>
        <div className="ec-form">
          <div className="flex items-center gap-[10px] mb-[6px]">
            <span className="w-[100px] text-ec-label">소수점단위</span>
            <select className="ec-input flex-1" aria-label="소수점단위" defaultValue="소수점 10자리">
              {['소수점없음', ...Array.from({ length: 10 }, (_, i) => `소수점 ${i + 1}자리`)].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-[10px]">
            <span className="w-[100px] text-ec-label">처리방법</span>
            <select className="ec-input flex-1" aria-label="처리방법" defaultValue="반올림">
              {['반올림', '올림', '버림'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-[4px] mt-[9px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => setDecimalOpen(false)}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setDecimalOpen(false)}>닫기</button>
        </div>
      </Modal>
    </div>
  )
}
