import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import { ecConfirm } from '../../../components/EcDialog'

/** GET /exports/mappings 한 줄. */
export interface ExportMapping {
  id: number; partnerId: number; partnerCode: string; partnerName: string
  lcBank: string | null; shipper: string | null; messrs: string | null; notifyParty: string | null
  portOfLoading: string | null; destination: string | null; carrier: string | null; weightUnit: string | null; remark: string | null
}

/**
 * 목록 아래 <b>[매핑조회]</b> → 매핑리스트 — 2026-10-12 loginaa 실측.
 *
 * <p>거래처마다 마지막으로 저장한 인보이스의 머리 칸이다. 열 [거래처코드 · 거래처명 · L/C Issuing Bank · Shipper/Exporter ·
 * For Account &amp; Risk of Messrs · Notify Party · Port of Loading · Final destination · Carrier · 중량단위 · Remarks],
 * 버튼 [선택삭제 · Excel · 닫기], 오른쪽 위 검색칸. 입력 창에서 그 거래처를 고르면 이 칸들이 채워진다.
 */
export default function ExportMappingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<ExportMapping[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  function load() {
    api.get<ExportMapping[]>('/exports/mappings').then((r) => { setRows(r.data); setPicked([]) })
      .catch((e) => setErr(extractErrorMessage(e)))
  }
  useEffect(() => { if (open) { setErr(''); setQ(''); load() } }, [open])

  async function remove() {
    if (picked.length === 0) { setErr('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    if (!(await ecConfirm('선택한 전표를 삭제 하시겠습니까?'))) return
    try { await api.post('/exports/mappings/delete', { ids: picked }); load() } catch (e) { setErr(extractErrorMessage(e)) }
  }

  const word = q.trim().toLowerCase()
  const shown = word ? rows.filter((r) => [r.partnerCode, r.partnerName].some((v) => v.toLowerCase().includes(word))) : rows
  const cell = (v: string | null) => <td className="whitespace-pre-wrap">{v ?? ''}</td>

  return (
    <Modal open={open} title="매핑리스트" error={err} width={1100} onClose={onClose}>
      <div className="flex justify-end gap-[4px] mb-[6px]">
        <input className="ec-input w-[160px]" placeholder="입력 후 [Enter]" aria-label="매핑리스트 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-[55vh] overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[30px]" />
              <th>거래처코드</th><th>거래처명</th><th>L/C Issuing Bank</th><th>Shipper/Exporter</th>
              <th>For Account &amp; Risk of Messrs</th><th>Notify Party</th><th>Port of Loading</th><th>Final destination</th>
              <th>Carrier</th><th>중량단위</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={12} className="text-center text-ec-hint">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r) => (
              <tr key={r.id}>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${r.partnerName} 선택`} checked={picked.includes(r.id)}
                         onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} />
                </td>
                {cell(r.partnerCode)}{cell(r.partnerName)}{cell(r.lcBank)}{cell(r.shipper)}{cell(r.messrs)}{cell(r.notifyParty)}
                {cell(r.portOfLoading)}{cell(r.destination)}{cell(r.carrier)}{cell(r.weightUnit)}{cell(r.remark)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-[4px] mt-[10px]">
        <button type="button" className="ec-btn" onClick={() => void remove()}>선택삭제</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
