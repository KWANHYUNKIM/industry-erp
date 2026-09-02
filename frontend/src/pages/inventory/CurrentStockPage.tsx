import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { StockRow } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STOCK_PICKS, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { periodOf } from '../../components/EcPeriodPicks'
import { useItemFlags } from '../../utils/useInactiveItems'

/**
 * 재고 > 재고현황 (이카운트 E040701)
 *
 * 원본 조건: 기준일자 · 창고 · 품목 · 기타(수량관리제외품목포함 / 사용중단품목포함 /
 * 안전재고설정미만표시) · 재고수량(범위).
 *
 * <b>기준일자가 한 날짜다</b> — 재고는 구간이 아니라 시점을 보는 것이라서다.
 * 그래서 기간 빠른선택도 [금일][전일] 둘뿐이다(구간 버튼은 뜻이 없다).
 *
 * 우리 화면은 조건이 '안전재고 미달만 보기' 체크박스 하나뿐이었다.
 *
 * <p>[기준일자]는 이제 <b>실제로 조회에 쓴다</b>. 예전에는 칸만 두고 무시했다 —
 * 날짜를 바꿔도 늘 현재고가 나왔고, 그 사실을 화면에 적어 두긴 했지만 조건이 있으면
 * 사람은 그 값이 반영된 줄 안다. 서버가 현재고에서 그 뒤의 입출고를 빼서 낸다
 * (GET /stock?asOf=). 안전재고 미달 표시도 <b>그 시점 수량으로</b> 다시 잰다.
 */
export default function CurrentStockPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = ymd(new Date())
  const [cond, setCond] = useState({
    date: periodOf('금일')!.to,   // 원본 기준일자 기본값은 [금일] 이다(사본 실측)
    warehouse: '',
    item: '',
    /*
     * 원본 [기타]는 <b>셋</b>이다(2026-09-02 E040701 실측):
     * [수량관리제외품목포함] · [사용중단품목포함] · [안전재고설정미만표시].
     * 우리에겐 마지막 하나뿐이라, <b>안 세는 품목과 내린 품목이 늘 섞여</b> 있었다 —
     * 용역·수수료처럼 수량을 안 세는 품목이 재고표에 0 으로 줄을 차지하고,
     * 내린 품목도 그대로 남아 지금 파는 것이 무엇인지 눈으로 골라야 했다.
     * 원본대로 <b>셋 다 꺼진 채</b> 열린다 — 켜야 보인다.
     */
    withUntracked: false,
    withInactive: false,
    belowSafetyOnly: false,
    qtyFrom: '',
    qtyTo: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))
  /* 품목의 [수량관리]·[사용여부] 는 품목 마스터가 들고 있다 — 재고 줄에는 없어 따로 받는다. */
  const { inactive, untracked } = useItemFlags()

  function load() {
    setLoading(true)
    api
      .get<StockRow[]>('/stock', { params: { asOf: cond.date } })
      .then((res) => setRows(res.data))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const warehouses = useMemo(
    () => [...new Set(rows.map((r) => r.warehouseName))].sort(), [rows])

  const shownRows = rows
    /* 안 켜면 뺀다 — 원본이 [포함] 이라 이름 지은 것은 기본이 '안 넣음' 이라는 뜻이다. */
    .filter((r) => cond.withUntracked || !untracked.has(r.itemId))
    .filter((r) => cond.withInactive || !inactive.has(r.itemId))
    .filter((r) => !cond.belowSafetyOnly || r.belowSafety)
    .filter((r) => !cond.warehouse || r.warehouseName === cond.warehouse)
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
    .filter((r) => !cond.qtyFrom || r.quantity >= Number(cond.qtyFrom))
    .filter((r) => !cond.qtyTo || r.quantity <= Number(cond.qtyTo))

  /* 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(shownRows, {
    품목코드: (r) => r.itemCode,
    품목명: (r) => r.itemName,
    창고: (r) => r.warehouseName,
  })
  const shown = sort.sorted

  const belowCount = rows.filter((r) => r.belowSafety).length
  const totalQty = shown.reduce((s, r) => s + r.quantity, 0)
  const reset = () => setCond({ date: today, warehouse: '', item: '', withUntracked: false, withInactive: false, belowSafetyOnly: false, qtyFrom: '', qtyTo: '' })

  return (
    <EcListShell
      title="재고현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        single
        from={cond.date} to={cond.date}
        onPeriod={(r) => setC({ date: r.from })}
        picks={STOCK_PICKS}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouse} onChange={(v) => setC({ warehouse: v })}
                           items={warehouses.map((w) => ({ value: w, name: w }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        {/* 원본 [기타] 차례 그대로: 수량관리제외품목포함 · 사용중단품목포함 · 안전재고설정미만표시 */}
        <EcCond label="기타">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={cond.withUntracked}
                     onChange={(e) => setC({ withUntracked: e.target.checked })} /> 수량관리제외품목포함
            </label>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={cond.withInactive}
                     onChange={(e) => setC({ withInactive: e.target.checked })} /> 사용중단품목포함
            </label>
            <label style={{ fontSize: 12 }}>
              <input type="checkbox" checked={cond.belowSafetyOnly}
                     onChange={(e) => setC({ belowSafetyOnly: e.target.checked })} /> 안전재고설정미만표시
            </label>
          </div>
        </EcCond>
        <EcCond label="재고수량">
          <input className="ec-input" type="number" value={cond.qtyFrom}
                 onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 120 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input className="ec-input" type="number" value={cond.qtyTo}
                 onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 120 }} />
        </EcCond>
      </EcStatusPanel>

      {cond.date !== today && (
        <p style={{ marginBottom: 8, background: '#eef3ff', border: '1px solid #cfe0f5', color: '#2b5b91', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>
          <b>{cond.date}</b> 시점의 재고입니다. 현재고에서 그 뒤의 입출고를 빼서 냅니다.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, fontSize: 12.5, color: '#5a6472' }}>
        <span>품목 × 창고 현재고</span>
        <span style={{ marginLeft: 'auto' }}>
          건수 <b style={{ color: '#3c4553' }}>{shown.length.toLocaleString()}</b>
          <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
          수량 <b style={{ color: '#3c4553', fontSize: 14 }}>{totalQty.toLocaleString()}</b>
          {belowCount > 0 && (
            <>
              <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
              안전재고 미달 <b style={{ color: '#c60a2e', fontSize: 14 }}>{belowCount}</b>건
            </>
          )}
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <colgroup>
            <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col />
            <col style={{ width: '16%' }} /><col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목코드')}>품목코드 {sort.mark('품목코드')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목명')}>품목명 {sort.mark('품목명')}</th>
              <th>규격정보</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('창고')}>창고 {sort.mark('창고')}</th>
              <th style={{ textAlign: 'right' }}>현재고</th>
              <th style={{ textAlign: 'right' }}>안전재고</th>
              <th style={{ textAlign: 'center' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : (
              shown.map((r, idx) => (
                <tr key={`${r.itemId}-${r.warehouseId}`} style={r.belowSafety ? { background: '#fdf1f3' } : undefined}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                  <td>{r.itemName}</td>
                  <td>{r.spec ?? ''}</td>
                  <td>{r.warehouseName}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: r.belowSafety ? '#c60a2e' : undefined }}>
                    {r.quantity.toLocaleString()} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.safetyStock.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}>
                    {r.belowSafety
                      ? <span style={{ color: '#c60a2e', fontWeight: 700 }}>부족</span>
                      : <span style={{ color: '#2f8401' }}>정상</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계 ({shown.length}건)</td>
                <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{totalQty.toLocaleString()}</td>
                <td colSpan={2} style={{ background: '#f5f7fa' }}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}
