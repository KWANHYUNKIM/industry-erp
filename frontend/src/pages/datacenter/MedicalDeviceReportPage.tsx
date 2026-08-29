import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner } from '../../api/types'
import { downloadStoredFile, formatBytes } from '../../utils/fileDownload'
import { ymd } from '../../components/EcPeriodPicks'
import { partnerCodeItems } from '../../utils/codeItems'
import { dateText } from '../../utils/dateText'

/**
 * 데이터센터 > 데이터내보내기 > 의료기기공급내역보고 (이카운트 E040231)
 *
 * 대상은 <b>UDI-DI 가 등록된 품목</b>이다(품목등록에서 입력). 공급내역은 우리 전표에서 실제로 뽑히는
 * 두 가지만 낸다 — 출고(판매)·폐기(재고조정 폐기). 원본의 반품·임대·회수는 해당 전표가 없어 만들지 않았다.
 *
 * <b>대외 전송은 하지 않는다.</b> 심평원 제출 채널·인증서가 없으므로, 그 달 공급내역을 확정해
 * 보고파일(CSV)로 산출·보관하고 이력을 남기는 데까지가 이 화면의 범위다.
 */
interface SupplyLine {
  supplyDate: string
  supplyType: string
  supplyTypeName: string
  docNo: string | null
  udiDi: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  quantity: number
  partnerId: number | null
  partnerName: string | null
  partnerBizRegNo: string | null
  /** 공급받는 자의 [공급형태] — 거래처에 정해 둔 값. 폐기는 받는 자가 없어 null 이다. */
  supplyShape: string | null
}
interface ReportHistory {
  id: number
  reportMonth: string
  periodFrom: string
  periodTo: string
  lineCount: number
  totalQty: number
  fileId: number | null
  fileName: string | null
  fileSize: number | null
  createdBy: string | null
  createdAt: string | null
}

const iso = (d: Date) => ymd(d)
const thisMonth = () => ymd(new Date()).slice(0, 7)

/**
 * 원본 [공급형태] — 공급받는 자가 어떤 곳인지. 원본은 <b>여러 개를 켜고 끄는 체크박스</b>이고
 * 처음엔 전부 켜져 있다(사본 실측). 쉼표까지 원본 표기 그대로다 — 한 칸에 여러 형태를 묶어
 * 놓은 것이라 우리가 쪼개면 보고 서식의 값과 어긋난다.
 */
const SUPPLY_SHAPES = ['제조, 수입, 판매', '의료기관', '약국개설자, 의약품도매상', '견본품, 기부용, 군납용'] as const

/**
 * 원본 [조회구분] — <b>라디오 둘</b>이고 기본이 [전표별]이다(사본 실측: value 3=건별, 4=전표별, 4 가 켜짐).
 *
 * <p>우리는 건별 하나뿐이었다. 전표 하나에 UDI 품목이 여러 줄이면 <b>보고 단위를 바꿀 수가 없다</b> —
 * 한 번 판 것을 몇 줄로 셀지가 곧 보고 건수라, 그것을 못 고르면 건수를 맞출 수가 없다.
 */
const SEARCH_TYPES = ['건별', '전표별'] as const
type SearchType = typeof SEARCH_TYPES[number]

export default function MedicalDeviceReportPage() {
  const today = iso(new Date())
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const [supplyType, setSupplyType] = useState('')
  const [partnerId, setPartnerId] = useState('')
  /*
   * 원본 의료기기공급내역보고 조건에 <b>[품목]</b> 이 있다(사본 실측). 공급내역은 품목별로
   * 줄이 서는데 그것으로 거를 수가 없어, 한 기기의 공급만 보려면 표를 눈으로 훑어야 했다.
   */
  const [itemCond, setItemCond] = useState('')
  /* 원본처럼 처음엔 전부 켠다 — 하나도 안 켜면 아무것도 안 나와 화면이 고장 난 것처럼 보인다. */
  const [shapes, setShapes] = useState<string[]>([...SUPPLY_SHAPES])
  /* 원본 기본값이 [전표별] 이다 — 우리가 임의로 건별로 두면 첫 화면의 건수가 원본과 다르다. */
  const [searchType, setSearchType] = useState<SearchType>('전표별')
  const [reportMonth, setReportMonth] = useState(thisMonth())

  const [lines, setLines] = useState<SupplyLine[]>([])
  const [history, setHistory] = useState<ReportHistory[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.get<SupplyLine[]>('/medical-device-reports/lines', {
        params: { from, to, supplyType: supplyType || undefined, partnerId: partnerId || undefined },
      })
      setLines(r.data)
    } catch (err) { setError(extractErrorMessage(err)) } finally { setLoading(false) }
  }

  async function loadHistory() {
    try { setHistory((await api.get<ReportHistory[]>('/medical-device-reports')).data) } catch { /* 이력 실패는 조회를 막지 않는다 */ }
  }

  useEffect(() => {
    load(); loadHistory()
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * 전부 켠 것은 <b>안 거른다</b>는 뜻이다. 그래야 공급형태를 안 정한 거래처(그리고
   * 받는 자가 없는 폐기)가 조건을 건드리지 않은 사람 앞에서 사라지지 않는다.
   */
  const allShapes = shapes.length === SUPPLY_SHAPES.length
  const shownLines = useMemo(
    () => lines.filter((l) => (!itemCond || l.itemName === itemCond)
      && (allShapes || (l.supplyShape != null && shapes.includes(l.supplyShape)))),
    [lines, itemCond, shapes, allShapes])

  /**
   * 원본 [전표별] — 한 전표를 <b>한 줄</b>로 센다. 품목 줄은 몇 개인지와 수량 합계만 남는다.
   *
   * <p>전표번호가 없는 줄은 <b>묶지 않는다</b>. 없는 번호끼리 묶으면 서로 아무 상관 없는
   * 공급이 한 줄이 된다.
   */
  const byDoc = useMemo(() => {
    const m = new Map<string, {
      key: string; supplyDate: string; supplyType: string; supplyTypeName: string
      docNo: string | null; partnerName: string | null; supplyShape: string | null
      itemCount: number; quantity: number
    }>()
    shownLines.forEach((l, i) => {
      const key = l.docNo ? `${l.supplyType}:${l.docNo}` : `#${i}`
      const cur = m.get(key)
      if (!cur) {
        m.set(key, {
          key, supplyDate: l.supplyDate, supplyType: l.supplyType, supplyTypeName: l.supplyTypeName,
          docNo: l.docNo, partnerName: l.partnerName, supplyShape: l.supplyShape,
          itemCount: 1, quantity: Number(l.quantity),
        })
      } else {
        cur.itemCount += 1
        cur.quantity += Number(l.quantity)
      }
    })
    return [...m.values()]
  }, [shownLines])

  /* 요약도 걸러진 것으로 낸다 — 한 기기만 보면서 건수가 전체이면 숫자가 거짓말을 한다. */
  const summary = useMemo(() => ({
    // 원본 [조회구분] 이 곧 <b>무엇을 한 건으로 세느냐</b>다 — 건수 칸도 같이 따라야 한다.
    count: searchType === '전표별' ? byDoc.length : shownLines.length,
    qty: shownLines.reduce((a, l) => a + Number(l.quantity), 0),
    out: shownLines.filter((l) => l.supplyType === 'OUT').length,
    disposal: shownLines.filter((l) => l.supplyType === 'DISPOSAL').length,
  }), [shownLines, byDoc, searchType])

  async function generate() {
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await api.post<ReportHistory>('/medical-device-reports', null, { params: { reportMonth } })
      setNotice(`${r.data.reportMonth} 보고파일을 만들었습니다 — ${r.data.lineCount}건 / 수량 ${r.data.totalQty}. 아래 이력에서 내려받으세요.`)
      loadHistory()
    } catch (err) { setError(extractErrorMessage(err)) } finally { setBusy(false) }
  }

  async function removeHistory(h: ReportHistory) {
    if (!window.confirm(`${h.reportMonth} 보고 이력을 삭제할까요? 보고파일도 함께 지워집니다.`)) return
    try { await api.delete(`/medical-device-reports/${h.id}`); loadHistory() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const label = (t: string) => <div style={{ color: '#5a626e', marginBottom: 3 }}>{t}</div>

  return (
    <EcListShell
      title="의료기기공급내역보고"
      actions={[
        { label: '검색(F8)', onClick: load, primary: true },
        { label: '보고파일 생성', onClick: generate },
        { label: 'Excel' },
      ]}
      help={
        <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          <p>품목등록에 <b>UDI-DI</b>를 입력한 품목의 공급내역을 모아 보고파일(CSV)로 만듭니다.</p>
          <ul style={{ paddingLeft: 18, listStyle: 'disc' }}>
            <li>공급구분은 우리 전표에 실제로 있는 <b>출고(판매)</b>·<b>폐기(재고조정)</b>만 산출합니다. 반품·임대·회수는 해당 전표가 없습니다.</li>
            <li><b>대외 전송은 하지 않습니다.</b> 심평원 제출 채널·인증서가 붙기 전이라, 산출·보관·이력까지가 범위입니다.</li>
            <li>보고파일 항목은 제출 규격 확정 전까지 우리 산출 형식입니다.</li>
          </ul>
        </div>
      }
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <p style={{ background: '#eaf4ea', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{notice}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', border: '1px solid var(--ec-border)', background: '#f7f9fb', padding: 10, marginBottom: 10 }}>
        {/* 원본 첫 조건은 [조회구분] 이고 <b>라디오</b>다(사본 실측). */}
        <label style={{ fontSize: 12.5 }}>{label('조회구분')}
          <div style={{ display: 'flex', gap: 10, paddingTop: 3 }}>
            {SEARCH_TYPES.map((k) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="radio" name="udiSearchType" checked={searchType === k}
                       onChange={() => setSearchType(k)} />{k}
              </label>
            ))}
          </div>
        </label>
        {/* 원본 의료기기공급내역보고의 이름은 [기준일자]가 아니라 <b>[납품일자]</b> 다(사본 실측)
            — 이 구간이 재는 것이 공급(납품)한 날이다. */}
        <label style={{ fontSize: 12.5 }}>{label('납품일자')}
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
        </label>
        <label style={{ fontSize: 12.5 }}>{label('공급구분')}
          <select className="ec-input" value={supplyType} onChange={(e) => setSupplyType(e.target.value)} style={{ width: 110 }}>
            <option value="">전체</option>
            <option value="OUT">출고</option>
            <option value="DISPOSAL">폐기</option>
          </select></label>
        <CodePickerField label="거래처" value={partnerId} onChange={setPartnerId} width={160}
                         items={partnerCodeItems(partners)} />
        <label style={{ fontSize: 12.5 }}>{label('공급형태')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 3 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <input type="checkbox" checked={allShapes}
                     onChange={(e) => setShapes(e.target.checked ? [...SUPPLY_SHAPES] : [])} />전체
            </label>
            {SUPPLY_SHAPES.map((k) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" checked={shapes.includes(k)}
                       onChange={(e) => setShapes((v) => (e.target.checked ? [...v, k] : v.filter((x) => x !== k)))} />
                {k}
              </label>
            ))}
          </div>
        </label>
        <CodePickerField label="품목" value={itemCond} onChange={setItemCond} width={170}
                         items={[...new Map(lines.map((l) => [l.itemCode, l])).values()]
                           .map((l) => ({ value: l.itemName, code: l.itemCode, name: l.itemName }))} />
        <button className="ec-btn ec-btn-primary" onClick={load}>검색(F8)</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12.5 }}>{label('보고기준월')}
            <input type="month" className="ec-input" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} style={{ width: 140 }} /></label>
          <button className="ec-btn ec-btn-primary" onClick={generate} disabled={busy}>{busy ? '생성 중…' : '보고파일 생성'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        {[
          { label: '공급내역', value: summary.count.toLocaleString() },
          { label: '수량 합계', value: summary.qty.toLocaleString() },
          { label: '출고', value: summary.out.toLocaleString() },
          { label: '폐기', value: summary.disposal.toLocaleString() },
        ].map((c) => (
          <div key={c.label} style={{ border: '1px solid var(--ec-border)', padding: '8px 14px', minWidth: 110 }}>
            <div style={{ fontSize: 11.5, color: '#8a929c' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {searchType === '전표별' ? (
      /*
       * 전표별 — 한 전표가 한 줄이다. 품목·UDI-DI 는 전표 안에서 여러 개일 수 있어
       * <b>지어내지 않고</b> 몇 품목인지와 수량 합계만 낸다.
       */
      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 110 }}>공급일자</th>
          <th style={{ width: 70 }}>공급구분</th>
          <th style={{ width: 160 }}>전표번호</th>
          <th style={{ width: 150 }}>공급받는자</th>
          <th style={{ width: 160 }}>공급형태</th>
          <th style={{ width: 90, textAlign: 'right' }}>품목수</th>
          <th style={{ width: 100, textAlign: 'right' }}>수량</th>
          <th></th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : byDoc.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              보고 대상 공급내역이 없습니다. 품목등록에서 UDI-DI 를 입력한 품목의 판매·폐기만 집계됩니다.
            </td></tr>
          ) : byDoc.map((d, i) => (
            <tr key={d.key}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(d.supplyDate)}</td>
              <td style={{ color: d.supplyType === 'DISPOSAL' ? '#c60a2e' : 'var(--ec-blue)', fontWeight: 700 }}>{d.supplyTypeName}</td>
              <td style={{ fontFamily: 'monospace' }}>{d.docNo ?? ''}</td>
              <td>{d.partnerName ?? <span style={{ color: '#9aa1ab' }}>-</span>}</td>
              <td style={{ color: d.supplyShape ? undefined : '#c9ced6' }}>{d.supplyShape ?? '미지정'}</td>
              <td style={{ textAlign: 'right' }}>{d.itemCount.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{d.quantity.toLocaleString()}</td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>
      ) : (
      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 34 }}></th>
          <th style={{ width: 110 }}>공급일자</th>
          <th style={{ width: 70 }}>공급구분</th>
          <th style={{ width: 160 }}>전표번호</th>
          <th style={{ width: 150 }}>UDI-DI</th>
          <th style={{ width: 110 }}>품목코드</th>
          <th>품목명</th>
          <th style={{ width: 90, textAlign: 'right' }}>수량</th>
          <th style={{ width: 60 }}>단위</th>
          <th style={{ width: 150 }}>공급받는자</th>
          {/* 원본 조건 [공급형태]. 거를 수만 있고 볼 수가 없으면 왜 걸렸는지 알 수 없다. */}
          <th style={{ width: 160 }}>공급형태</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shownLines.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>
              보고 대상 공급내역이 없습니다. 품목등록에서 UDI-DI 를 입력한 품목의 판매·폐기만 집계됩니다.
            </td></tr>
          ) : shownLines.map((l, i) => (
            <tr key={`${l.supplyType}-${l.docNo}-${l.itemId}-${i}`}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(l.supplyDate)}</td>
              <td style={{ color: l.supplyType === 'DISPOSAL' ? '#c60a2e' : 'var(--ec-blue)', fontWeight: 700 }}>{l.supplyTypeName}</td>
              <td style={{ fontFamily: 'monospace' }}>{l.docNo ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{l.udiDi}</td>
              <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
              <td>{l.itemName}</td>
              <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{Number(l.quantity).toLocaleString()}</td>
              <td>{l.unit}</td>
              <td>{l.partnerName ?? <span style={{ color: '#9aa1ab' }}>-</span>}</td>
              <td style={{ color: l.supplyShape ? undefined : '#c9ced6' }}>{l.supplyShape ?? '미지정'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>
        보고파일 이력 <span style={{ fontWeight: 400, color: '#8a929c', fontSize: 12 }}>(원본의 ‘송신이력’ — 우리는 산출·보관까지)</span>
      </h3>
      <table className="w-full text-left">
        <thead><tr>
          <th style={{ width: 100 }}>보고기준월</th>
          <th style={{ width: 200 }}>대상기간</th>
          <th style={{ width: 90, textAlign: 'right' }}>건수</th>
          <th style={{ width: 100, textAlign: 'right' }}>수량</th>
          <th>보고파일</th>
          <th style={{ width: 90, textAlign: 'right' }}>크기</th>
          <th style={{ width: 90 }}>작성자</th>
          <th style={{ width: 60, textAlign: 'center' }}>삭제</th>
        </tr></thead>
        <tbody>
          {history.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 16 }}>등록된 데이터가 없습니다.</td></tr>
          ) : history.map((h) => (
            <tr key={h.id}>
              <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{h.reportMonth}</td>
              <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{h.periodFrom} ~ {h.periodTo}</td>
              <td style={{ textAlign: 'right' }}>{h.lineCount.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{Number(h.totalQty).toLocaleString()}</td>
              <td>
                {h.fileId ? (
                  <button onClick={() => downloadStoredFile(h.fileId!, h.fileName ?? 'report.csv')}
                          style={{ background: 'none', border: 0, padding: 0, color: 'var(--ec-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12.5 }}>
                    {h.fileName}
                  </button>
                ) : <span style={{ color: '#9aa1ab' }}>-</span>}
              </td>
              <td style={{ textAlign: 'right' }}>{formatBytes(h.fileSize)}</td>
              <td style={{ color: '#5a626e' }}>{h.createdBy ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => removeHistory(h)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
