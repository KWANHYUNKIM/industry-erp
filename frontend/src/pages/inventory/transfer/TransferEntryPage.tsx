import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../../api/client'
import Modal from '../../../components/Modal'
import type { Item, StockRow, Warehouse } from '../../../types/api'
import { TransferForm, SlipPrint, type StockTransfer, type CodeRow } from '../../../features/stocktransfer/TransferForm'

/**
 * 재고 I › 기타이동 › 창고이동입력(E040501) — 원본은 창이 아니라 <b>입력 화면</b>이다(2026-10-21 loginaa 실측,
 * 수정만 창 '창고이동수정'). 예전에는 기타이동 목록 위 창(/inventory/transfer?new=1)이었다.
 * 머리 일자 · 담당자 · 보내는창고 · 받는창고 · 프로젝트, 격자 품목코드 · 품목명 · 수량 …, 아래 저장(F8) · 저장/전표(F7) ·
 * 다시 작성 · 리스트 · 웹자료올리기. 저장하면 말 없이 머리 창고는 남기고 줄만 비운다.
 */
export default function TransferEntryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [projects, setProjects] = useState<CodeRow[]>([])
  const [employees, setEmployees] = useState<CodeRow[]>([])
  const [error, setError] = useState('')
  const [printSlip, setPrintSlip] = useState<StockTransfer[] | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Item[]>('/items'),
      api.get<Warehouse[]>('/warehouses'),
      api.get<StockRow[]>('/stock'),
      api.get<CodeRow[]>('/projects'),
      api.get<CodeRow[]>('/sales-reps'),
    ]).then(([i, w, s, pj, em]) => {
      setItems(i.data); setWarehouses(w.data); setStock(s.data); setProjects(pj.data); setEmployees(em.data)
    }).catch((err) => setError(extractErrorMessage(err)))
  }, [])

  /* 저장 뒤 [보내는창고 재고] 칸이 옮긴 만큼 줄어 보이게 재고만 다시 받는다. */
  const reloadStock = () => api.get<StockRow[]>('/stock').then((r) => setStock(r.data)).catch(() => {})

  async function openPrint(no: string) {
    try {
      setPrintSlip((await api.get<StockTransfer[]>(`/stock-transfers/slips/${encodeURIComponent(no)}`)).data)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  return (
    <>
      <TransferForm slip={null} page={{ onList: () => navigate('/inventory/transfer') }}
                    onDelete={() => {}} onNav={() => {}} onCopy={() => {}} onClose={() => navigate('/inventory/transfer')}
                    onPrint={(no) => void openPrint(no)}
                    items={items} warehouses={warehouses} stock={stock} projects={projects} employees={employees}
                    error={error} onError={setError} onSaved={() => void reloadStock()} />
      <Modal open={!!printSlip} title="창고이동" onClose={() => setPrintSlip(null)}>
        {printSlip && <SlipPrint slip={printSlip} warehouses={warehouses} items={items} onClose={() => setPrintSlip(null)} />}
      </Modal>
    </>
  )
}
