import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { BusinessContract, Partner } from '../../types/api'
import { ymd } from '../../utils/periods'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { ContractForm } from './ContractPage'

const slash = (s: string) => s.replace(/-/g, '/')
/** 원본 처음 기간 — 1년 전 오늘 ~ 오늘(2026-10-20 실측 2025/10/20 ~ 2026/10/20). */
const oneYear = () => { const d = new Date(); return { from: ymd(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate())), to: ymd(d) } }

/**
 * '연동 필요' 안내 — 원본 [요청] · [요청취소] · [재요청]은 상대에게 메일 · 카카오톡으로 전자서명을 청한다.
 * 바깥 발송이라 원본에서 누르지 않았고 원본 문구가 없다. 지은 문구(plans/회계2.md).
 */
export const ECONTRACT_LINK_NEEDED =
  '전자계약 요청(이메일 · 카카오톡 발송 · 전자서명)은 외부 연동이 필요합니다.\n\n연동 전에는 [계약관리·전자계약] 화면의 [서명요청] · [전자서명]으로 상태만 기록할 수 있습니다.'

/**
 * 회계 II &gt; 전자계약 &gt; <b>계약서진행단계</b> (원본 E061101 · 메뉴 C061101).
 *
 * <p>2026-10-20 loginaa 실측: 머리 빠른검색 · Search(F3), 기간 1년(2025/10/20 ~ 2026/10/20), 위 쪽번호.
 * 격자 □ · 일자 · 계약서명 · 진행단계([수신정보입력] 주황 알약 · [계약서설정] 파란 테 알약) · 요청기능(요청 · 요청취소 · 재요청, 흐린 글자)
 * · 문서 · 복사 · 구분명, 아래 신규(F2) · 선택삭제 · Excel.
 * 원본 신규(F2)는 '계약서입력' 창(계약서명 · 첨부 · 2차인증사용여부 · 구분 · 부서 · 프로젝트 · 전달메시지)인데 <b>첨부(PDF)가 필수</b>라
 * 원본 등록은 하지 않았다. 우리는 첨부 대신 거래처 · 기간 · 금액 · 내용을 적는 계약 폼(계약관리·전자계약과 같은 폼)이다.
 *
 * <p>여기에는 아직 [요청]하지 않은 계약(작성)만 뜬다 — 요청한 계약은 계약서현황(E061102)으로 간다.
 * 요청기능은 바깥 발송이라 누르면 '연동 필요' 안내만 띄운다.
 */
export default function EContractProgressPage() {
  const nav = useNavigate()
  const [range, setRange] = useState(oneYear())
  const [nameCond, setNameCond] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<BusinessContract[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [copyOf, setCopyOf] = useState<BusinessContract | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  const load = () => {
    api.get<BusinessContract[]>('/contracts').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }
  useEffect(() => {
    load()
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
  }, [])

  async function deleteChecked() {
    if (checked.size === 0 || !(await ecConfirm('삭제하겠습니까?'))) return
    setError('')
    try {
      for (const id of checked) await api.delete(`/contracts/${id}`)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
    setChecked(new Set())
    load()
  }

  const day = (r: BusinessContract) => (r.createdAt ?? r.startDate).slice(0, 10)
  const q = search.trim()
  const shown = rows
    .filter((r) => r.status === 'DRAFT')
    .filter((r) => day(r) >= range.from && day(r) <= range.to)
    .filter((r) => !nameCond || r.title.includes(nameCond))
    .filter((r) => !q || r.title.includes(q) || r.partnerName.includes(q))
    .sort((a, b) => day(b).localeCompare(day(a)) || b.id - a.id)
  useTableColumnCheck(tableRef, '계약서진행단계', [shown.length])

  const saved = (c: BusinessContract, close: () => void) => {
    close()
    setNotice(`${c.contractNo} ${c.title} 저장`)
    window.setTimeout(() => setNotice(''), 2500)
    load()
  }

  return (
    <EcListShell
      title="계약서진행단계"
      search={search}
      onSearchChange={setSearch}
      formTitle="계약서입력"
      renderForm={(close) => <ContractForm partners={partners} onError={setError} onSaved={(c) => saved(c, close)} />}
      actions={[{ label: '선택삭제', onClick: deleteChecked, selected: checked.size }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[150px]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" className="ec-input w-[150px]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </EcCond>
        <EcCond label="계약서명"><input className="ec-input w-full" placeholder="계약서명" value={nameCond} onChange={(e) => setNameCond(e.target.value)} /></EcCond>
      </ul>
      <div className="text-right text-ec-hint mb-[6px]">{slash(range.from)} ~ {slash(range.to)}</div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">일자</th>
            <th>계약서명</th>
            <th className="text-center">진행단계</th>
            <th className="text-center">요청기능</th>
            <th className="text-center">문서</th>
            <th className="text-center">복사</th>
            <th>구분명</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)}
                       onChange={(e) => { const n = new Set(checked); if (e.target.checked) n.add(r.id); else n.delete(r.id); setChecked(n) }} />
              </td>
              <td className="text-center">{slash(day(r))}</td>
              <td>{r.title}<span className="text-ec-hint">_{r.partnerName}</span></td>
              <td className="text-center">
                {/* 원본 label-warning(주황 채움) · label-primary label-inverse(파란 테) — 알약은 부품 클래스로 */}
                <span className="inline-flex gap-[3px]">
                  <button type="button" className="ec-pill" onClick={() => nav('/accounting/contracts')}>수신정보입력</button>
                  <button type="button" className="ec-pill active" onClick={() => nav('/accounting/contracts')}>계약서설정</button>
                </span>
              </td>
              <td className="text-center">
                <span className="inline-flex gap-[6px]">
                  {(['요청', '요청취소', '재요청'] as const).map((l) => (
                    <a key={l} href="#" className="text-ec-hint" onClick={(e) => { e.preventDefault(); void ecAlert(ECONTRACT_LINK_NEEDED) }}>{l}</a>
                  ))}
                </span>
              </td>
              <td className="text-center"></td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setCopyOf(r) }}>복사</a></td>
              <td>{r.typeName}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal error={error} open={copyOf !== null} title="계약서입력" onClose={() => setCopyOf(null)}>{(
        copyOf && <ContractForm partners={partners} onError={setError} initial={copyOf}
                                onSaved={(c) => saved(c, () => setCopyOf(null))} />
      )}</Modal>
    </EcListShell>
  )
}
