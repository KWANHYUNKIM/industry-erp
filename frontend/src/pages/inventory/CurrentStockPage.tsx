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
     * 원본 조건 <b>[품목구분]·[품목그룹1]</b>([품목] 바로 뒤에 선다 — 2026-09-09 실측).
     * 재고를 "원재료만" · "이 그룹만" 으로 좁혀 보는 일이 잦은데 품목을 하나씩만
     * 고를 수 있었다. 품목 마스터가 드는 값이라 이름으로 이으면 된다.
     */
    category: '',
    itemGroup: '',
    /*
     * 원본 [기타]는 <b>셋</b>이다(2026-09-02 E040701 실측):
     * [수량관리제외품목포함] · [사용중단품목포함] · [안전재고설정미만표시].
     * 우리에겐 마지막 하나뿐이라, <b>안 세는 품목과 내린 품목이 늘 섞여</b> 있었다 —
     * 용역·수수료처럼 수량을 안 세는 품목이 재고표에 0 으로 줄을 차지하고,
     * 내린 품목도 그대로 남아 지금 파는 것이 무엇인지 눈으로 골라야 했다.
     * <p><b>2026-09-09 에 다시 재니 셋이 다 꺼진 것이 아니었다</b> —
     * [사용중단품목포함]은 <b>켜짐</b>이 기본이다. 끄고 열면 <b>안 쓰기로 한 품목의
     * 재고가 화면에서 사라진다</b>. 창고에 그 물건이 그대로 있는데 재고현황에서
     * 빠지니 실사와 숫자가 어긋난다 — 원본이 굳이 켜 두는 까닭이다.
     * (재고잔량분석표에서도 같은 것이 뒤집혀 있었다.)
     */
    withUntracked: false,
    withInactive: true,
    belowSafetyOnly: false,
    qtyFrom: '',
    qtyTo: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))
  /* 품목의 [수량관리]·[사용여부] 는 품목 마스터가 들고 있다 — 재고 줄에는 없어 따로 받는다. */
  const { inactive, untracked, categoryOf, groupOf, categories, groups } = useItemFlags()

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
    .filter((r) => !cond.category || categoryOf(r.itemId) === cond.category)
    .filter((r) => !cond.itemGroup || groupOf(r.itemId) === cond.itemGroup)
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
  const reset = () => setCond({ date: today, warehouse: '', item: '', category: '', itemGroup: '',
    withUntracked: false, withInactive: true, belowSafetyOnly: false, qtyFrom: '', qtyTo: '' })

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
        <EcCond label="품목구분">
          <select className="ec-input" value={cond.category} style={{ width: 130 }}
                  onChange={(e) => setC({ category: e.target.value })}>
            <option value="">전체</option>
            {categories.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1">
          <select className="ec-input" value={cond.itemGroup} style={{ width: 150 }}
                  onChange={(e) => setC({ itemGroup: e.target.value })}>
            <option value="">전체</option>
            {groups.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
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
            <col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목코드')}>품목코드 {sort.mark('품목코드')}</th>
              {/*
                <b>재고현황(E040701) 2026-09-09 원본 격자 실측</b> — 열이 <b>셋</b>뿐이다:
                [품목코드 · 품목명[규격] · 재고수량] (아래 합계행 하나).
                우리는 (1) 품목명과 규격을 <b>두 칸</b>으로 갈라 두었고 — 원본은 규격을
                품목명 뒤 대괄호에 붙인다, (2) 수량 칸을 [현재고]라 불렀다 — 원본은
                <b>[재고수량]</b> 이고 조건 이름도 그것이다(조건 [재고수량] ~ 범위).
                [창고]·[안전재고]·[상태]는 원본 이 화면에 없는 우리 열이다 —
                원본은 품목 하나를 <b>한 줄</b>로 합치고, 창고별로 펴는 것은
                <b>창고별재고현황(E040711)</b> 이라는 다른 화면이다. 우리는 창고별로 펴므로
                그 열을 남긴다(합치는 축은 [대표품목으로 합산] 과 함께 아직 못 만들었다).
              */}
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('품목명')}>품목명[규격] {sort.mark('품목명')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('창고')}>창고 {sort.mark('창고')}</th>
              <th style={{ textAlign: 'right' }}>재고수량</th>
              <th style={{ textAlign: 'right' }}>안전재고</th>
              <th style={{ textAlign: 'center' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
            ) : (
              shown.map((r, idx) => (
                <tr key={`${r.itemId}-${r.warehouseId}`} style={r.belowSafety ? { background: '#fdf1f3' } : undefined}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                  {/* 원본은 규격을 품목명 뒤 대괄호에 붙인다. */}
                  <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
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
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계 ({shown.length}건)</td>
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
