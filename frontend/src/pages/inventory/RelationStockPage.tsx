import { useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { StockRow } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcReportFoot, EcReportHead, reportPeriod } from '../../components/EcReportFrame'
import { useCondPickers } from '../../utils/useCondPickers'
import { useRequired } from '../../utils/useRequired'

/**
 * 재고 I › 출력물 › 재고현황 › 관계별재고현황 (이카운트 E040728, 2026-10-22 원본 실측)
 *
 * <p>조건(펼쳐서 시작): 기준일자(한 날짜, 기본 [금일]) · 창고 · <b>품목(필수)</b> · 양식(적용양식 기본(수정불가) · 양식구분 [결재방표시]).
 * 품목을 비운 채 [검색(F8)] 을 누르면 글자 알림 없이 품목 칸만 빨간 테두리(has-error)로 두른다.
 *
 * <p>결과는 출력물이다: 제목 · '회사명 : … / A001(익스트림 울트라 명품 조립PC)' · 기준일자, 열 넷
 * <b>품목코드 · 품목명[규격] · 재고수량 · 환산수량</b>, 맨 끝 [합계] 줄, [P.1] · 출력한 때.
 * 원본 A001 은 재고수량 1,432.00 · 환산수량 1,432.00 한 줄이었다.
 *
 * <p>'관계' 는 품목등록 [관계설정](관계품목과 환산수량)이다. 우리는 그 설정이 모양만 있고 자료가 없어
 * 고른 품목 한 줄만 나오고 환산수량 = 재고수량(환산 1)이다 — 관계설정을 저장하게 되면 그 품목들을 줄로 더한다.
 */
export default function RelationStockPage() {
  const pickers = useCondPickers(['items', 'warehouses'])
  const req = useRequired()
  const [date, setDate] = useState(periodOf('금일')!.to)
  const [warehouseId, setWarehouseId] = useState('')
  const [itemId, setItemId] = useState('')
  const [signBox, setSignBox] = useState(false)
  const [result, setResult] = useState<{ date: string; itemId: string; warehouseId: string; stock: StockRow[] } | null>(null)
  const [error, setError] = useState('')

  function load() {
    if (!req.check({ item: !!itemId })) return
    setError('')
    const shown = { date, itemId, warehouseId }
    api.get<StockRow[]>('/stock', { params: { asOf: date } })
      .then((r) => setResult({ ...shown, stock: r.data }))
      .catch((e) => setError(extractErrorMessage(e)))
  }

  const reset = () => {
    setDate(periodOf('금일')!.to); setWarehouseId(''); setItemId(''); setSignBox(false); req.reset()
  }

  const n2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const item = result ? pickers.items.find((i) => i.value === result.itemId) : undefined
  const qty = result
    ? result.stock
      .filter((s) => String(s.itemId) === result.itemId)
      .filter((s) => !result.warehouseId || String(s.warehouseId) === result.warehouseId)
      .reduce((t, s) => t + Number(s.quantity), 0)
    : 0

  return (
    <EcListShell
      title="관계별재고현황"
      searchable={false}
      signLine={signBox}
      onReset={reset}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel single from={date} to={date} onPeriod={(r) => setDate(r.from)} picks={STOCK_PICKS}>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={220} emptyLabel="전체" value={warehouseId} onChange={setWarehouseId}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" popupTitle="품목검색" hideLabel width={220} value={itemId} onChange={setItemId}
                           items={pickers.items} invalid={req.on('item', !!itemId)} />
        </EcCond>
        <EcCond label="적용양식">
          <select className="ec-input w-[220px]" defaultValue="기본(수정불가)">
            <option>기본(수정불가)</option>
          </select>
        </EcCond>
        <EcCond label="양식구분">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} /> 결재방표시
          </label>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {result && (
        <div className="overflow-x-auto">
          <div className="ec-report-frame">
            <EcReportHead title="관계별재고현황" period={reportPeriod(result.date)} sign={signBox}
                          sub={item ? `${item.code ?? ''}(${item.name})` : undefined} />
            <table className="text-left ec-report ec-report-head400">
              <thead>
                <tr>
                  <th>품목코드</th>
                  <th>품목명[규격]</th>
                  <th className="text-right">재고수량</th>
                  <th className="text-right">환산수량</th>
                </tr>
              </thead>
              <tbody>
                {item ? (
                  <tr>
                    <td>{item.code}</td>
                    <td>{item.name}{item.sub ? ` [${item.sub}]` : ''}</td>
                    <td className="text-right">{n2(qty)}</td>
                    <td className="text-right">{n2(qty)}</td>
                  </tr>
                ) : (
                  <tr><td colSpan={4} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
                )}
              </tbody>
              {item && (
                <tfoot>
                  <tr>
                    <td colSpan={2} className="text-center">합계</td>
                    <td className="text-right">{n2(qty)}</td>
                    <td className="text-right">{n2(qty)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            <EcReportFoot />
          </div>
        </div>
      )}
    </EcListShell>
  )
}
