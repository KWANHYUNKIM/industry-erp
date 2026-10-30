import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import NumCheck from '../../components/NumCheck'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner } from '../../types/api'
import { shortDateNo } from '../../utils/dateNo'
import { IMPORT_ENTRY, money, type ImportCostVoucher, type ImportLot } from '../../features/importcost/api'
import { EcDateRange } from '../../components/ui/EcDateInput'

/** 원본 [검색(F8) ▾] 기간 빠른선택(2026-10-14 실측). */
const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '이번기수', '직전기수', '종료일', '최근30일(+1개월)'] as const

/**
 * 회계 II › 수입비용 › <b>수입비용전표검색</b>(원본 E060208) — 2026-10-14 loginaa 실측.
 *
 * 조건 기준일자(처음 최근30일(+1개월)) · 거래처 · 거래유형 · 관리번호 · 적요. 격자 (번호 체크칸) · 전표번호(링크 → 그 입력 화면 수정) · 거래유형 ·
 * 금액 · 외화금액 · 외화거래처통화 · 거래처명 · 적요 · 전표(인쇄), 최신 번호가 위. 하단 [인쇄] [확인취소] [선택삭제] [Excel].
 * 선택삭제: 한 줄이면 '전표를 삭제하겠습니까?' + '- 본계정대체'(거래유형), 여러 줄이면 '삭제하겠습니까?'. 지우면 안내 없이 빠진다.
 */
export default function ImportCostVoucherListPage() {
  const navigate = useNavigate()
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [kind, setKind] = useState('')
  const [lot, setLot] = useState('')
  const [partner, setPartner] = useState('')
  const [remark, setRemark] = useState('')
  const [quick, setQuick] = useState('')
  const [rows, setRows] = useState<ImportCostVoucher[]>([])
  const [lots, setLots] = useState<ImportLot[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    try {
      const { data } = await api.get<ImportCostVoucher[]>('/import-costs/vouchers', { params: { from, to } })
      setRows(data)
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  useEffect(() => {
    void load()
    Promise.all([api.get<ImportLot[]>('/import-costs/lots'), api.get<Partner[]>('/partners')])
      .then(([l, p]) => { setLots(l.data); setPartners(p.data) }).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function remove() {
    setConfirm(false)
    try {
      await api.post('/import-costs/vouchers/delete', { ids: [...picked] })
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const has = (v: string | null | undefined, q: string) => (v ?? '').includes(q)
  const shown = rows
    .filter((r) => !kind || r.kind === kind)
    .filter((r) => !lot || String(r.lotId) === lot)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !remark || has(r.remark, remark))
    .filter((r) => !quick || has(r.partnerName, quick) || has(r.remark, quick) || has(r.kindName, quick))
  const one = picked.size === 1 ? rows.find((r) => picked.has(r.id)) : undefined
  const noOf = (r: ImportCostVoucher) => (r.journalDocNo ? shortDateNo(r.voucherDate, r.journalDocNo) : r.voucherDate.slice(2).replace(/-/g, '/'))

  return (
    <EcListShell
      title="수입비용전표검색"
      search={quick}
      onSearchChange={setQuick}
      onSearch={() => void load()}
      onReset={() => { setFrom(init.from); setTo(init.to); setKind(''); setLot(''); setPartner(''); setRemark('') }}
      actions={[
        { label: '인쇄' },
        { label: '확인취소' },
        { label: '선택삭제', selected: picked.size, onClick: () => setConfirm(true) },
        { label: 'Excel' },
      ]}
    >
      <ul className="ec-cond">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "시작일", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "종료일", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="거래유형">
          <select className="ec-input w-[220px]" aria-label="거래유형" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">전체</option>
            {Object.entries(IMPORT_ENTRY).map(([k, m]) => <option key={k} value={k}>{m.title}</option>)}
          </select>
        </EcCond>
        <EcCond label="관리번호" pick>
          <CodePickerField label="관리번호" hideLabel width={220} emptyLabel="전체" value={lot} onChange={setLot}
                           items={lots.map((l) => ({ value: String(l.id), code: l.code, name: l.name }))} />
        </EcCond>
        <EcCond label="적요"><input className="ec-input w-[220px]" aria-label="적요" value={remark} onChange={(e) => setRemark(e.target.value)} /></EcCond>
      </ul>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[40px]">
              <NumCheck no="" head label="전체선택" on={shown.length > 0 && shown.every((r) => picked.has(r.id))}
                        onChange={(v) => setPicked(v ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th>전표번호</th>
            <th>거래유형</th>
            <th className="text-right">금액</th>
            <th className="text-right">외화금액</th>
            <th>외화거래처통화</th>
            <th>거래처명</th>
            <th>적요</th>
            <th>전표</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center">
                <NumCheck no={i + 1} label={`${noOf(r)} 선택`} on={picked.has(r.id)}
                          onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n })} />
              </td>
              <td>
                <button type="button" className="ec-link" onClick={() => navigate(`${IMPORT_ENTRY[r.kind].path}?id=${r.id}`)}>{noOf(r)}</button>
              </td>
              <td>{r.kindName}</td>
              <td className="text-right">{money(r.total)}</td>
              <td className="text-right"></td>
              <td></td>
              <td>{r.partnerName ?? ''}</td>
              <td>{r.remark ?? ''}</td>
              <td>
                {r.journalEntryId && (
                  <button type="button" className="ec-link" onClick={() => navigate(`/accounting/vouchers?journal=${r.journalEntryId}`)}>인쇄</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={confirm} title="알림" width={420} error={error} onClose={() => setConfirm(false)}>
        <p className="mb-[12px]">
          {one ? <>전표를 삭제하겠습니까?<br />- {IMPORT_ENTRY[one.kind].short}</> : '삭제하겠습니까?'}
        </p>
        <div className="flex gap-[5px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void remove()}>확인</button>
          <button type="button" className="ec-btn" onClick={() => setConfirm(false)}>취소</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
