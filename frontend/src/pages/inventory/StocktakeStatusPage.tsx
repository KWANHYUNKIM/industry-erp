import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { STOCKTAKE_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useItemMgmt } from '../../utils/itemMgmtItems'

/**
 * 재고 > 재고실사현황 (이카운트 E040615)
 *
 * 기타이동현황 그룹에서 마지막으로 남아 있던 빈칸. 재고실사는 <b>입력만</b> 있고
 * "지난달 실사에서 뭐가 얼마나 틀어졌나"를 되짚어 볼 화면이 없었다.
 * 실사는 재고가 안 맞을 때 원인을 찾는 출발점이라 이력이 남아야 뜻이 있다.
 *
 * <b>주의:</b> E040615 자체의 조건 판은 실측하지 못했다(원본 세션에 접근할 수 없었다).
 * 같은 그룹의 형제 화면들(창고이동현황 E040505·자가사용현황 E040506 …)에서 <b>실측한</b>
 * 조건 모양 — 구분[내역|집계] · 일자 구간(기본 금월(~오늘)) · 창고 · 품목 · 적요 — 을 따랐다.
 * 원본을 다시 열 수 있게 되면 이 화면부터 대조해야 한다.
 *
 * 형제 화면에 없지만 여기에 둔 것: <b>상태</b>(요청/반영완료/반려)와 <b>차이있는것만</b>.
 * 실사는 단계를 거치는 전표라(StagedStatus) 상태를 못 거르면 아직 반영도 안 된 요청이
 * 확정된 차이인 것처럼 섞인다.
 */
type Status = '' | 'REQUESTED' | 'APPLIED' | 'REJECTED'

interface Staged {
  id: number
  adjustNo: string
  requestDate: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  bookQty: number
  actualQty: number
  diff: number
  reason: string | null
  status: Exclude<Status, ''>
  statusName: string
  requester: string | null
  handler: string | null
  /** 원본 [품목구분]. 품목 마스터의 값이고 이번에 응답에 실었다. */
  itemCategoryName: string | null
}

const num = (n: number) => n.toLocaleString()
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n))
const diffColor = (n: number) => (n < 0 ? '#c60a2e' : n > 0 ? 'var(--ec-blue)' : '#9aa1ab')

export default function StocktakeStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items'])
  const [rows, setRows] = useState<Staged[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  /*
   * 원본은 <b>금년</b>으로 연다(사본 실측 — 달 스핀박스가 01·12 다). 실사는 한 해에
   * 몇 번뿐이라 금월로 자르면 열자마자 <b>빈 표</b>가 뜬다.
   */
  const init = periodOf('금년', new Date()) ?? { from: ymd(new Date()), to: ymd(new Date()) }
  const [cond, setCond] = useState({
    from: init.from, to: init.to, warehouseId: '', item: '', reason: '',
    status: '' as Status, diffOnly: false, handler: '',
    /*
     * 2026-09-08 에 원본(E040615)의 조건 판을 재니 <b>스물하나</b>다(사본에는 아홉).
     * 접힌 줄은 없다. 여기서 만든 셋: 품목구분 · 품목그룹1 · 최초작성자.
     */
    category: '', itemGroup: '', author: '',
    /*
     * 원본 [기타]의 <b>[수량관리제외품목포함]</b> — 기본은 꺼짐이다(2026-09-08 실측).
     *
     * <p>앞 바퀴에 '실사 요청 줄이 품목의 수량관리 여부를 안 들어 만들 수 없다' 고
     * 적었는데 <b>사실이 아니었다</b> — 품목 마스터가 <code>stockTracked</code> 를
     * 진작 들고 있다(품목등록의 [재고수량관리] 열이 그 값이다). 줄의 itemId 로 이으면
     * 그만이라, 이유를 고쳐 쓸 것이 아니라 만들 일이었다.
     *
     * <p>꺼져 있으면 <b>수량관리제외 품목의 줄을 감춘다</b> — 용역·운반비처럼 재고를
     * 잡지 않는 품목이 실사 표에 섞이면 '실사했는데 차이가 늘 0' 인 줄이 늘어선다.
     */
    inclUntracked: false,
  })
  /** [품목그룹1] — 품목 마스터에 붙는 값이라 마스터를 받아 itemId 로 잇는다. */
  const mgmt = useItemMgmt()
  /** [수량관리제외품목포함] 도 품목 마스터의 값이다 — 같은 길로 잇는다. */
  const [items, setItems] = useState<Item[]>([])
  const untracked = useMemo(
    () => new Set(items.filter((i) => i.stockTracked === false).map((i) => i.id)),
    [items])
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      api.get<Staged[]>('/staged-adjustments'),
      api.get<Warehouse[]>('/warehouses'),
      api.get<Item[]>('/items'),
    ])
      .then(([s, w, it]) => { setRows(s.data); setWarehouses(w.data); setItems(it.data) })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const shown = rows
    .filter((r) => !cond.from || r.requestDate >= cond.from)
    .filter((r) => !cond.to || r.requestDate <= cond.to)
    .filter((r) => !cond.warehouseId || String(r.warehouseId) === cond.warehouseId)
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
    /* 원본 재고실사현황 차례: 구분 · 창고 · 품목 · <b>담당자</b> · 적요.
       실사를 누가 맞췄는지가 자료에는 있는데 거를 수가 없었다. */
    .filter((r) => !cond.handler || (r.handler ?? '') === cond.handler)
    .filter((r) => !cond.category || (r.itemCategoryName ?? '') === cond.category)
    .filter((r) => !cond.itemGroup || mgmt.groupOf(r.itemId) === cond.itemGroup)
    .filter((r) => !cond.author || (r.requester ?? '') === cond.author)
    .filter((r) => !cond.reason || (r.reason ?? '').includes(cond.reason))
    .filter((r) => !cond.status || r.status === cond.status)
    .filter((r) => !cond.diffOnly || r.diff !== 0)
    /* [수량관리제외품목포함] 이 꺼져 있으면 재고를 잡지 않는 품목의 줄을 감춘다. */
    .filter((r) => cond.inclUntracked || !untracked.has(r.itemId))

  /**
   * 원본 [데이터 보기형식] · [그래프로 보기].
   * 실사는 <b>차이</b>를 보는 화면이다 — 실사수량이 아니라 장부와 어긋난 양을 그린다.
   * 차이가 0 인 품목은 그림에서 뺀다(막대가 없는 줄이 늘어서면 어긋난 것을 못 찾는다).
   * 차이는 남기도 모자라기도 하므로 <b>절댓값</b>으로 더한다 — 서로 지워지면 안 된다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')
  const chartRows = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of shown) {
      if (r.diff === 0) continue
      const label = `${r.warehouseName} · ${r.itemName}`
      m.set(label, (m.get(label) ?? 0) + Math.abs(r.diff))
    }
    return [...m].map(([label, value]) => ({ label, value }))
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rows, cond])

  /** 집계 — 창고 × 품목. 실사를 여러 번 했으면 차이가 누적된다. */
  const summary = useMemo(() => {
    const m = new Map<string, { k: string; warehouseName: string; itemCode: string; itemName: string; unit: string; book: number; actual: number; diff: number; count: number }>()
    shown.forEach((r) => {
      const k = `${r.warehouseId}:${r.itemId}`
      const g = m.get(k) ?? { k, warehouseName: r.warehouseName, itemCode: r.itemCode, itemName: r.itemName, unit: r.unit, book: 0, actual: 0, diff: 0, count: 0 }
      g.book += r.bookQty; g.actual += r.actualQty; g.diff += r.diff; g.count += 1
      m.set(k, g)
    })
    return [...m.values()].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cond])

  const totals = shown.reduce(
    (a, r) => ({ book: a.book + r.bookQty, actual: a.actual + r.actualQty, diff: a.diff + r.diff }),
    { book: 0, actual: 0, diff: 0 },
  )
  const mismatched = shown.filter((r) => r.diff !== 0).length

  const reset = () => {
    setMode('내역')
    setCond({ from: init.from, to: init.to, warehouseId: '', item: '', reason: '', handler: '', status: '', diffOnly: false,
      category: '', itemGroup: '', author: '', inclUntracked: false })
  }

  return (
    <EcListShell
      title="재고실사현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={STOCKTAKE_PICKS}
        dateLabel="일자"
        view={view} onViewChange={setView}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['내역', '집계'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouseId} onChange={(v) => setC({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측, 스물하나): 구분 · 일자 · <b>구분(전체·간편·단계별)</b> ·
          창고 · (창고계층그룹) · 품목 · <b>품목구분 · 품목그룹1</b> ·
          (품목그룹2/3 · 품목계층그룹) · 담당자 · 적요 · 기타 · <b>최초작성자</b> ·
          (최종수정자 · 양식) · 적용양식 · 양식구분 · 정렬/소계기준 · 데이터 보기형식.
          <b>[구분]이 두 벌</b>이라 대조표에는 둘째를 [실사:구분] 으로 밝혀 적었다
          (작업내역현황의 [작업품목:품목구분] 과 같은 방식이다).
        */}
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={140} emptyLabel="전체"
                           value={cond.category} onChange={(v) => setC({ category: v })}
                           items={[...new Set(rows.map((r) => r.itemCategoryName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체"
                           value={cond.itemGroup} onChange={(v) => setC({ itemGroup: v })}
                           items={mgmt.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          {/* 담당자는 사원 마스터를 물지 않고 이름으로 적히므로, 후보를 실제 담당자들에서 뽑는다. */}
          <CodePickerField label="담당자" hideLabel width={150} emptyLabel="전체"
                           value={cond.handler} onChange={(v) => setCond((c) => ({ ...c, handler: v }))}
                           items={[...new Set(rows.map((r) => r.handler).filter(Boolean))]
                             .map((n) => ({ value: n as string, name: n as string }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={cond.reason}
                 onChange={(e) => setC({ reason: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        {/*
          원본 [기타]의 체크는 <b>[수량관리제외품목포함]</b> 하나다(2026-09-08 실측, 꺼짐).
          우리 것은 <b>[차이있는것만]</b> 이라 <b>다른 칸</b>이다 — 수량관리 여부를
          실사 요청 줄이 들고 있지 않아 그 체크를 만들 수 없다. 이름만 같고 뜻이 다르다.
        */}
        <EcCond label="기타">
          {/* 원본 [기타]의 체크는 <b>[수량관리제외품목포함]</b> 하나다(기본 꺼짐). */}
          <label style={{ fontSize: 12 }}>
            <input type="checkbox" checked={cond.inclUntracked}
                   onChange={(e) => setC({ inclUntracked: e.target.checked })} /> 수량관리제외품목포함
          </label>
          {/* [차이있는것만] 은 원본에 없는 우리 체크다 — 실사는 어긋난 줄만 보려고 여는 화면이라 남긴다. */}
          <label style={{ fontSize: 12, marginLeft: 10 }}>
            <input type="checkbox" checked={cond.diffOnly}
                   onChange={(e) => setC({ diffOnly: e.target.checked })} /> 차이있는것만
          </label>
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={150} emptyLabel="전체"
                           value={cond.author} onChange={(v) => setC({ author: v })}
                           items={[...new Set(rows.map((r) => r.requester).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        {/*
          <b>[상태]는 원본에 없는 우리 축이다.</b> 원본은 그 자리에 [구분](전체·간편·단계별)
          — <b>실사 방식</b>을 둔다. 우리 실사는 요청·반영완료·반려로 흐르므로 그 축을
          그대로 옮길 수 없다. 지우면 반려된 줄을 감출 길이 사라지므로 <b>남기되</b>,
          실측한 차례를 흐트리지 않게 맨 뒤에 둔다.
        */}
        <EcCond label="상태">
          <select className="ec-input" value={cond.status}
                  onChange={(e) => setC({ status: e.target.value as Status })} style={{ width: 220 }}>
            <option value="">전체</option>
            <option value="REQUESTED">요청</option>
            <option value="APPLIED">반영완료</option>
            <option value="REJECTED">반려</option>
          </select>
        </EcCond>
      </EcStatusPanel>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '내역' ? '건수' : '품목×창고'}{' '}
        <b style={{ color: '#3c4553' }}>{num(mode === '내역' ? shown.length : summary.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        차이 <b style={{ color: diffColor(totals.diff), fontSize: 14 }}>{signed(totals.diff)}</b>
        {mismatched > 0 && (
          <>
            <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
            안 맞은 줄 <b style={{ color: '#c60a2e', fontSize: 14 }}>{num(mismatched)}</b>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        {view === '그래프' ? (
          <EcBarChart rows={chartRows} unit="" emptyText="장부와 어긋난 품목이 없습니다." />
        ) : mode === '내역' ? (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '13%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} /><col />
              <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>전표번호</th>
                <th>일자</th>
                <th>창고</th>
                <th>품목</th>
                <th style={{ textAlign: 'right' }}>장부수량</th>
                <th style={{ textAlign: 'right' }}>실사수량</th>
                <th style={{ textAlign: 'right' }}>차이</th>
                <th style={{ textAlign: 'center' }}>상태</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.id} style={r.diff !== 0 ? { background: '#fdf7f8' } : undefined}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.adjustNo}</td>
                  <td>{r.requestDate.replace(/-/g, '/')}</td>
                  <td>{r.warehouseName}</td>
                  <td>{r.itemName} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.itemCode}</span></td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.bookQty)}</td>
                  <td style={{ textAlign: 'right' }}>{num(r.actualQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: diffColor(r.diff) }}>
                    {signed(r.diff)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  <td style={{ textAlign: 'center', color: r.status === 'APPLIED' ? '#2f8401' : r.status === 'REJECTED' ? '#c60a2e' : '#b6791b' }}>
                    {r.statusName}
                  </td>
                  <td style={{ color: '#5a626e' }}>{r.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.book)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.actual)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: diffColor(totals.diff) }}>{signed(totals.diff)}</td>
                  <td colSpan={2} style={{ background: '#f5f7fa' }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '5%' }} /><col style={{ width: '18%' }} />
              <col style={{ width: '15%' }} /><col />
              <col style={{ width: '9%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>창고</th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ textAlign: 'right' }}>실사횟수</th>
                <th style={{ textAlign: 'right' }}>장부수량</th>
                <th style={{ textAlign: 'right' }}>실사수량</th>
                <th style={{ textAlign: 'right' }}>차이</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : summary.map((g, i) => (
                <tr key={g.k} style={g.diff !== 0 ? { background: '#fdf7f8' } : undefined}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td>{g.warehouseName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                  <td>{g.itemName}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.book)}</td>
                  <td style={{ textAlign: 'right' }}>{num(g.actual)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: diffColor(g.diff) }}>
                    {signed(g.diff)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{g.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.book)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totals.actual)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: diffColor(totals.diff) }}>{signed(totals.diff)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}
