import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { periodOf, STATUS_PICKS } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { GROUP_KEYS, aggregate, type GroupKey } from '../../utils/statusAggregate'
import type { Item, Partner, SalesDoc, Warehouse } from '../../api/types'

/** 영업 > 판매현황 — 판매 전표를 품목라인 단위로 펼친 실제 매출 내역 (/api/sales 연동) */
interface Row {
  key: string
  date: string
  docNo: string
  partner: string
  itemName: string
  qty: number
  unitPrice: number
  supply: number
  vat: number
  // 원본 조건이 거르는 값들. 화면이 이미 받아 온 전표에서 뽑아 둔다(추가 요청 없음).
  partnerId: number
  itemId: number
  warehouseName: string
  projectName: string | null
  lotNo: string | null
  taxable: boolean
  employeeName: string | null
}

export default function SalesStatusPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /*
   * 기준일자. 원본 판매현황의 **핵심 조건**인데 우리는 아예 없어서 전 기간을 통째로 뿌리고 있었다.
   * 전표가 쌓이면 못 쓴다. 기본은 원본과 같이 '금월(~오늘)'.
   */
  const [from, setFrom] = useState(() => periodOf('금월(~오늘)')!.from)
  const [to, setTo] = useState(() => periodOf('금월(~오늘)')!.to)
  /*
   * 원본 판매현황의 나머지 조건. 우리 데이터로 실제 거를 수 있는 것만 둔다 —
   * 값이 없는 조건칸을 만드는 건 5장 레시피가 금지한다.
   *   거르는 것 : 거래처 · 품목 · 창고 · 프로젝트 · 시리얼/로트 · 관리항목 · 거래유형(과세/면세)
   *   못 거르는 것: 내·외자구분 · 거래구분(일반/반품) — 우리 모델에 그 개념이 없다.
   * 시리얼/로트는 반복 1(V126 계열)에서, 관리항목은 반복 3(V127)에서 만든 것이 여기서 쓰인다.
   */
  const [partnerId, setPartnerId] = useState('')
  const [itemId, setItemId] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [mgmtItem, setMgmtItem] = useState('')
  const [taxType, setTaxType] = useState<'전체' | '과세' | '면세'>('전체')
  /*
   * 원본은 상단 [현황|집계] 로 모드를 가르고, 집계 모드에서는 `집계조건1/2` 로 **두 단계 그룹화**를 한다.
   * 우리는 현황(라인 목록)만 있었다.
   */
  const [mode, setMode] = useState<'현황' | '집계'>('현황')
  const [group1, setGroup1] = useState<GroupKey | ''>('품목별')
  const [group2, setGroup2] = useState<GroupKey | ''>('')

  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SalesDoc[]>('/sales')
      const flat: Row[] = []
      for (const d of res.data) {
        d.lines.forEach((l, idx) => flat.push({
          key: `${d.id}-${idx}`,
          date: d.saleDate,
          docNo: d.docNo,
          partner: d.partnerName,
          itemName: l.itemName,
          qty: l.quantity,
          unitPrice: l.unitPrice,
          supply: l.supplyAmount,
          vat: l.vatAmount,
          partnerId: d.partnerId,
          itemId: l.itemId,
          warehouseName: d.warehouseName,
          projectName: d.projectName,
          lotNo: l.lotNo,
          taxable: d.vatAmount > 0,
          employeeName: d.employeeName,
        }))
      }
      // 최신 일자 우선
      flat.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      setRows(flat)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // 조건에 쓸 마스터. 못 받아도 화면은 뜬다 — 조건만 비어 보인다.
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Warehouse[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
  }, [])

  /** 품목의 관리항목은 품목 마스터에서 파생한다(전표 라인이 들고 있지 않다 — 원본도 그렇다). */
  const mgmtOf = (id: number) => items.find((i) => i.id === id)?.managementItemName ?? ''
  const mgmtOptions = [...new Set(items.map((i) => i.managementItemName).filter(Boolean))] as string[]
  const projectOptions = [...new Set(rows.map((r) => r.projectName).filter(Boolean))] as string[]

  const shown = rows
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
    .filter((r) => !partnerId || String(r.partnerId) === partnerId)
    .filter((r) => !itemId || String(r.itemId) === itemId)
    .filter((r) => !warehouse || r.warehouseName === warehouse)
    .filter((r) => !project || r.projectName === project)
    .filter((r) => !lotNo || (r.lotNo ?? '').includes(lotNo))
    .filter((r) => !mgmtItem || mgmtOf(r.itemId) === mgmtItem)
    .filter((r) => taxType === '전체' || (taxType === '과세' ? r.taxable : !r.taxable))
    .filter((r) => !keyword || r.partner.includes(keyword) || r.itemName.includes(keyword))
  /** 집계는 판매·구매가 같은 규칙을 쓰므로 `utils/statusAggregate` 에 모아 두고 여기서 부른다. */
  const grouped = useMemo(
    () => (mode !== '집계' ? [] : aggregate(
      shown.map((r) => ({ ...r, managementItemName: mgmtOf(r.itemId) || null })),
      group1,
      group2,
    )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, mode, group1, group2, items],
  )

  const totals = useMemo(() => shown.reduce(
    (s, r) => ({ supply: s.supply + r.supply, vat: s.vat + r.vat }),
    { supply: 0, vat: 0 },
  ), [shown])

  return (
    <EcListShell
      title="판매현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/* 원본 상단의 메뉴 토글 — [현황]은 라인 목록, [집계]는 조건1/2로 묶은 합계다. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: 'var(--ec-label)', fontSize: 12, minWidth: 54 }}>메뉴</span>
        {(['현황', '집계'] as const).map((m) => (
          <button
            key={m} type="button"
            className={`ec-btn ec-btn-sm${mode === m ? ' ec-btn-primary' : ''}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        {mode === '집계' && (
          <>
            <span style={{ width: 12 }} />
            <span style={{ color: 'var(--ec-label)', fontSize: 12 }}>집계조건1</span>
            <select className="ec-input" value={group1} onChange={(e) => setGroup1(e.target.value as GroupKey)} style={{ width: 150 }}>
              {GROUP_KEYS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <span style={{ color: 'var(--ec-label)', fontSize: 12 }}>집계조건2</span>
            <select className="ec-input" value={group2} onChange={(e) => setGroup2(e.target.value as GroupKey | '')} style={{ width: 150 }}>
              <option value="">(없음)</option>
              {GROUP_KEYS.filter((g) => g !== group1).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </>
        )}
      </div>

      {/*
        원본 판매현황의 [기준일자] 와 하단 기간 빠른선택.
        빠른선택 묶음은 현황용이다 — 업무일지와 라벨이 다르다(금월(~오늘)·전월+금월).
      */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: 'var(--ec-label)', fontSize: 12, marginRight: 4 }}>기준일자</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <span style={{ width: 8 }} />
        <EcPeriodPicks
          labels={STATUS_PICKS}
          onPick={(r) => { setFrom(r.from); setTo(r.to) }}
        />
      </div>
      {/*
        원본의 나머지 조건. 코드도움(🔍)으로 고른다 — 마스터가 수백 건이 되면 나열로는 못 찾는다.
        내·외자구분과 거래구분(일반/반품)은 우리 모델에 개념이 없어 넣지 않았다.
      */}
      <ul className="ec-form" style={{ marginBottom: 8 }}>
        <li>
          <div className="title">거래처</div>
          <div className="form">
            <CodePickerField
              label="거래처" hideLabel fill placeholder="전체" emptyLabel="전체"
              value={partnerId} onChange={setPartnerId}
              items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.typeName }))}
            />
          </div>
        </li>
        <li>
          <div className="title">품목</div>
          <div className="form">
            <CodePickerField
              label="품목" hideLabel fill placeholder="전체" emptyLabel="전체"
              value={itemId} onChange={setItemId}
              items={items.map((i) => ({ value: String(i.id), code: i.code, name: i.name, sub: i.spec }))}
            />
          </div>
        </li>
        <li>
          <div className="title">창고</div>
          <div className="form">
            <CodePickerField
              label="창고" hideLabel fill placeholder="전체" emptyLabel="전체"
              value={warehouse} onChange={setWarehouse}
              items={warehouses.map((w) => ({ value: w.name, code: w.code, name: w.name, sub: w.location }))}
            />
          </div>
        </li>
        <li>
          <div className="title">프로젝트</div>
          <div className="form">
            <select className="ec-input" value={project} onChange={(e) => setProject(e.target.value)} style={{ width: '100%' }}>
              <option value="">전체</option>
              {projectOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </li>
        <li>
          <div className="title">관리항목</div>
          <div className="form">
            <select className="ec-input" value={mgmtItem} onChange={(e) => setMgmtItem(e.target.value)} style={{ width: '100%' }}>
              <option value="">전체</option>
              {mgmtOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </li>
        <li>
          <div className="title">시리얼/로트No.</div>
          <div className="form">
            <input className="ec-input" value={lotNo} onChange={(e) => setLotNo(e.target.value)}
                   placeholder="부분일치" style={{ width: '100%' }} />
          </div>
        </li>
        <li>
          <div className="title">거래유형</div>
          <div className="form" style={{ gap: 4 }}>
            {(['전체', '과세', '면세'] as const).map((t) => (
              <button
                key={t} type="button"
                className={`ec-btn ec-btn-sm${taxType === t ? ' ec-btn-primary' : ''}`}
                onClick={() => setTaxType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </li>
      </ul>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        공급가액 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{totals.supply.toLocaleString()}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        부가세 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{totals.vat.toLocaleString()}</b>
      </div>
      {mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>{group1 || '집계조건1'}</th>
              {group2 && <th>{group2}</th>}
              <th style={{ width: 90, textAlign: 'right' }}>건수</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th style={{ width: 130, textAlign: 'right' }}>공급가액</th>
              <th style={{ width: 130, textAlign: 'right' }}>부가세</th>
              <th style={{ width: 130, textAlign: 'right' }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr><td colSpan={group2 ? 8 : 7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>집계할 내역이 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={`${g.g1}|${g.g2}`}>
                <td style={{ textAlign: 'center', color: '#8a929c', background: '#f3f3f3' }}>{i + 1}</td>
                <td>{g.g1}</td>
                {group2 && <td>{g.g2}</td>}
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.qty.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.supply.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.vat.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
                  {(g.supply + g.vat).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={group2 ? 3 : 2} style={{ textAlign: 'right' }}>합계 ({grouped.length}개 그룹)</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.count, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.qty, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totals.vat.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{(totals.supply + totals.vat).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>일자 ▼</th>
            <th>전표번호</th>
            <th>거래처</th>
            <th>품목명</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>단가</th>
            <th style={{ textAlign: 'right' }}>공급가액</th>
            <th style={{ textAlign: 'right' }}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>판매 내역이 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.date}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
              <td>{r.partner}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{r.qty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.unitPrice.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.supply.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{r.vat.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </EcListShell>
  )
}
