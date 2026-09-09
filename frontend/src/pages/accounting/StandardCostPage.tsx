import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { useItemFlags } from '../../utils/useInactiveItems'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import type { Item } from '../../api/types'
import { subtotalBy } from '../../utils/subtotalBy'

/**
 * 품목 → <b>생산공정명</b>. 원본 원가 화면 셋이 이 칸을 둔다.
 *
 * <p><b>2026-09-09 실측으로 뜻을 가렸다.</b> 여태 "우리 재고는 창고 단위라 <b>공정별 재공</b>이
 * 없어 그 칸에 넣을 값이 없다" 고 적어 두고 셋 다 안 만들고 있었는데, 원본 실제원가현황
 * (E040804)의 자료 125줄을 읽어 보니 <b>그 칸은 재공을 가르는 축이 아니었다</b> —
 * <ul>
 *   <li>줄은 <b>품목별 하나</b>다(같은 품목코드가 두 번 서는 일이 0건)</li>
 *   <li>[생산공정명]이 채워진 줄은 <b>열다섯</b>뿐이고 전부 <b>만들어지는 품목</b>이다
 *       (제품 완제품공정 · 반제품 반제품공정 · 시제품 시제품공정). 사 오는 원재료는 빈칸이다</li>
 * </ul>
 * 즉 <b>그 품목이 어느 공정에서 만들어지는가</b>이고, 그 값은 <b>BOR</b>(품목이 거치는 작업)이
 * 진작 들고 있다. 작업지시서별진행현황이 이미 같은 자리를 그렇게 쓴다.
 *
 * <p>BOR 이 없는 품목은 <b>빈칸</b>이다 — 원본도 그렇다. 창고 이름을 공정처럼 갖다 쓰지 않는다.
 */
interface BorRow { productId: number; processName: string; seq: number }
/** BOR 의 <b>첫 작업</b>(작업순서가 가장 앞선 줄)이 그 품목의 공정이다. */
function processMapOf(bors: BorRow[]) {
  const m = new Map<number, { seq: number; name: string }>()
  for (const b of bors) {
    const cur = m.get(b.productId)
    if (!cur || b.seq < cur.seq) m.set(b.productId, { seq: b.seq, name: b.processName })
  }
  return (id: number) => m.get(id)?.name ?? ''
}

/**
 * 회계 > 표준원가현황 (/api/costs)
 *
 * <p>원본 조건 판 실측(사본):
 *   기준월 · 품목 · 생산공정 · [기타] 결재방표시 · 수량관리제외품목포함 ·
 *   <b>사용중단품목포함</b> · <b>단가0포함</b> · 정렬/소계기준 · <b>합계표시</b>
 * 우리는 기간 드롭다운 하나가 전부였고, 사용중단 품목과 원가 0 인 품목이 늘 섞여 나왔다.
 * 원본은 그 둘을 <b>기본으로 빼고</b> 보여 준다 — 체크를 켜야 나온다.
 *
 * <p>[수량관리제외품목포함]은 예전에 "우리 원가에 그 값이 없어" 만들지 않았는데,
 * 품목이 이제 재고수량관리를 든다. 재고를 잡지 않는 품목(용역·운반비)에 표준원가를
 * 매기는 것은 뜻이 없어 기본으로 뺀다 — 원본도 그렇다.
 *
 * <p>생산공정·결재방표시는 여전히 우리 원가에 그 값이 없어 칸을 만들지 않는다.
 */
interface Cost {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  period: string
  materialCost: number
  laborCost: number
  overheadCost: number
  standardTotal: number
}

export default function StandardCostPage() {
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(도장칸)이 찍힌다. 기본은 <b>꺼짐</b>이다(사본 실측).
   */
  const [signBox, setSignBox] = useState(false)
  const [rows, setRows] = useState<Cost[]>([])
  const [keyword, setKeyword] = useState('')
  const [period, setPeriod] = useState('전체')
  const [withInactive, setWithInactive] = useState(false)
  const [withZero, setWithZero] = useState(false)
  const [showTotal, setShowTotal] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { inactive, untracked } = useItemFlags()
  /*
   * 2026-09-08 에 원본(E040808)의 조건 판을 재니 <b>열</b>이다(사본에는 다섯).
   * 접힌 줄은 없고 [기본]·[전체] 두 탭이 같은 판을 쓴다.
   *
   * <p>여기서 만든 둘: <b>품목구분 · 품목그룹1</b>. 둘 다 품목 마스터의 값이라
   * 마스터를 받아 원가 줄의 itemId 로 잇는다 — 원가 자료에는 그 값이 없다.
   *
   * <p>원본 [품목구분]의 후보가 이 화면만 다르다 — 다른 화면은
   * 전체·원재료·부재료·제품·반제품·상품·무형상품 인데 여기는
   * <b>전체·원재료·부재료·제품·반제품·상품·제품세트·상품세트</b> 다.
   * 후보를 지어내지 않고 <b>줄에 실제로 있는 값</b>에서 뽑는다.
   */
  const mgmt = useItemMgmt()
  const [items, setItems] = useState<Item[]>([])
  const [bors, setBors] = useState<BorRow[]>([])
  const processOf = useMemo(() => processMapOf(bors), [bors])
  const catOf = useMemo(() => new Map(items.map((i) => [i.id, i.categoryName])), [items])
  /* 원본 격자는 [품목명[규격]] 한 칸이다 — 규격은 줄에 없어 품목 마스터에서 잇는다. */
  const specOf = (itemId: number) => items.find((x) => x.id === itemId)?.spec ?? ''
  const [categoryCond, setCategoryCond] = useState('')
  const [itemGroupCond, setItemGroupCond] = useState('')
  /**
   * 원본 조건 판 [기타]의 <b>수량관리제외품목포함</b>. 기본은 꺼져 있다 —
   * 재고를 잡지 않는 품목(용역·운반비)에 표준원가를 매기는 것은 뜻이 없어서,
   * 원본도 체크를 켜야 보여 준다.
   */
  const [withUntracked, setWithUntracked] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [res, it, br] = await Promise.all([
        api.get<Cost[]>('/costs'),
        api.get<Item[]>('/items'),
        api.get<BorRow[]>('/bor'),
      ])
      setRows(res.data); setItems(it.data); setBors(br.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  /*
   * 원본 [정렬/소계기준]. 표준원가는 품목마다 한 줄이라 기준월이 여럿 섞이면
   * <b>어느 달의 원가가 얼마인지</b>를 눈으로 갈라 봐야 했다.
   */
  const SUBTOTALS = ['기준월', '품목'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('기준월')

  const periods = useMemo(() => Array.from(new Set(rows.map((r) => r.period))), [rows])
  const shown = rows
    .filter((r) => period === '전체' || r.period === period)
    .filter((r) => !keyword || r.itemName.includes(keyword) || r.itemCode.includes(keyword))
    .filter((r) => withInactive || !inactive.has(r.itemId))
    .filter((r) => withUntracked || !untracked.has(r.itemId))
    .filter((r) => withZero || r.standardTotal !== 0)
    .filter((r) => !categoryCond || (catOf.get(r.itemId) ?? '') === categoryCond)
    .filter((r) => !itemGroupCond || mgmt.groupOf(r.itemId) === itemGroupCond)
  const total = useMemo(() => shown.reduce((s, r) => s + r.standardTotal, 0), [shown])

  return (
    <EcListShell title="표준원가현황" search={keyword} onSearchChange={setKeyword}
      newLabel="새로고침" onNew={load} actions={[{ label: '검색(F8)', primary: true, onClick: load }, { label: 'Excel' }]} signLine={signBox}>
      {error && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준월">
          <select className="ec-input" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 140 }}>
            <option>전체</option>
            {periods.map((p) => <option key={p}>{p}</option>)}
          </select>
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측, 열): 기준월 · 품목 · <b>품목구분 · 품목그룹1</b> ·
          (품목그룹2/3 · 품목계층그룹) · 생산공정 · 기타 · 정렬/소계기준.
          [품목]은 이 화면에서 셸의 찾기 칸이 맡는다.
        */}
        <EcCond label="품목구분" pick>
          <select className="ec-input" value={categoryCond} style={{ width: 140 }}
                  onChange={(e) => setCategoryCond(e.target.value)}>
            <option value="">전체</option>
            {[...new Set(rows.map((r) => catOf.get(r.itemId)).filter(Boolean) as string[])].sort()
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <select className="ec-input" value={itemGroupCond} style={{ width: 160 }}
                  onChange={(e) => setItemGroupCond(e.target.value)}>
            <option value="">전체</option>
            {mgmt.groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </EcCond>
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
            사용중단품목포함
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} />
            수량관리제외품목포함
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withZero} onChange={(e) => setWithZero(e.target.checked)} />
            단가0포함
          </label>
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showTotal} onChange={(e) => setShowTotal(e.target.checked)} />
            합계표시
          </label>
        </EcCond>
        {/* 원본 [정렬/소계기준]. 조건 판의 아래쪽 줄이다(사본 실측). */}
        <EcCond label="정렬/소계기준">

          <div className="ec-pills">
            {SUBTOTALS.map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                      onClick={() => setSubtotal(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="결재방표시">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
      </ul>
      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        품목 <b style={{ color: '#3c4553' }}>{shown.length}</b>개
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString('ko-KR')}</b>
      </div>
      <table className="w-full text-left">
        {/*
          <b>2026-09-09 원본 실측(E040808).</b> 조건은 열로 대조표와 <b>글자 하나까지 같다</b>.
          격자 열은 <code>품목코드 · 품목명[규격] · 품목구분(세트포함) · 생산공정명 · 단가</code> 다.
          우리와 <b>모양이 다르다</b> — 원본은 원가를 <b>[단가] 한 칸</b>으로 내고 품목구분·
          생산공정을 옆에 두는데, 우리는 재료비·노무비·경비·원가 <b>넷으로 쪼개</b> 낸다.
          쪼갠 쪽이 원가를 읽는 데는 낫다(무엇 때문에 올랐는지 보인다).
          그래서 이 화면은 <b>열 대조표에 아직 안 넣었다</b> — 넣으려면 세 가지를 먼저 정해야 한다:
          ① [단가] 와 우리 [표준원가] 를 같은 열로 볼 것인가,
          ② [품목구분(세트포함)] 은 응답에 품목 구분을 실어야 만들 수 있고,
          ③ [생산공정명] 은 이미 '원가를 공정 단위로 쌓지 않는다' 는 예외가 있는 값이다.
          지어내지 않고 잰 값만 적어 둔다.
        */}
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/*
              <b>표준원가현황(E040808) 2026-09-09 원본 격자 실측</b>(자료 60줄) —
              [품목코드 · 품목명[규격] · 품목구분(세트포함) · <b>생산공정명</b> · <b>단가</b>]
              다섯 칸에 합계행 하나다. <b>원본은 재료비·노무비·경비로 안 가른다</b> —
              표준원가를 [단가] 한 칸으로만 낸다.
              우리는 셋으로 갈라 두고 합을 [표준원가]라 불렀다. 가른 셋은 우리 열로 남기되
              합 칸의 이름은 원본대로 <b>[단가]</b> 로 맞춘다 — 같은 값을 화면마다 다르게
              부르면 원본을 아는 사람이 여기서 다시 배워야 한다(재고실사현황에서 [실사수량]을
              [수량]으로 맞춘 것과 같은 까닭이다). 옆에 셋을 그대로 두어 무엇의 합인지 보인다.
              <b>[생산공정명]은 2026-09-09 에 만들었다</b> — 그 칸이 공정별 재공이 아니라
              그 품목이 만들어지는 공정임을 원본 자료로 가렸다(위 processMapOf 주석).
              [기간]은 우리 열이다.
            */}
            <th style={{ width: 90 }}>품목코드</th>
            <th>품목명[규격]</th>
            <th style={{ width: 80 }}>품목구분(세트포함)</th>
            {/* 원본 넷째 칸. 그 품목이 만들어지는 공정 — BOR 이 든다(위 주석). */}
            <th style={{ width: 100 }}>생산공정명</th>
            <th style={{ width: 80 }}>기간</th>
            <th style={{ textAlign: 'right' }}>표준재료비</th>
            <th style={{ textAlign: 'right' }}>표준노무비</th>
            <th style={{ textAlign: 'right' }}>표준경비</th>
            <th style={{ textAlign: 'right' }}>단가</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
              <td>{r.itemName}{specOf(r.itemId) ? ` [${specOf(r.itemId)}]` : ''}</td>
              <td style={{ color: '#5a626e' }}>{catOf.get(r.itemId) ?? ''}</td>
              {/* BOR 이 없는 품목(사 오는 원재료)은 빈칸이다 — 원본도 그렇다. */}
              <td style={{ color: '#5a626e' }}>{processOf(r.itemId)}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.period}</td>
              <td style={{ textAlign: 'right' }}>{r.materialCost.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.laborCost.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.overheadCost.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.standardTotal.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        {showTotal && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({shown.length}품목)</td>
              <td style={{ textAlign: 'right' }}>{shown.reduce((n, r) => n + r.materialCost, 0).toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right' }}>{shown.reduce((n, r) => n + r.laborCost, 0).toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right' }}>{shown.reduce((n, r) => n + r.overheadCost, 0).toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{total.toLocaleString('ko-KR')}</td>
            </tr>
          </tfoot>
        )}
      </table>

      {shown.length > 0 && (() => {
        const groups = subtotalBy(shown, (r) => (subtotal === '품목' ? r.itemName : r.period), {
          material: (r) => r.materialCost, labor: (r) => r.laborCost,
          overhead: (r) => r.overheadCost, total: (r) => r.standardTotal,
        })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 80, textAlign: 'right' }}>건수</th>
                <th style={{ width: 130, textAlign: 'right' }}>재료비</th>
                <th style={{ width: 130, textAlign: 'right' }}>노무비</th>
                <th style={{ width: 130, textAlign: 'right' }}>경비</th>
                <th style={{ width: 140, textAlign: 'right' }}>표준원가</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.sums.material.toLocaleString('ko-KR')}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.sums.labor.toLocaleString('ko-KR')}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.sums.overhead.toLocaleString('ko-KR')}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
                      {g.sums.total.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
