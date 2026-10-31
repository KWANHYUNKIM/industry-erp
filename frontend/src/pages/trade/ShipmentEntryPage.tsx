import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcSlipShell, { type SlipAction } from '../../components/EcSlipShell'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { SlipHistoryModal, slipHeadLabel } from '../../features/sliphistory/SlipHistoryModal'
import { useShipmentEntry, type ShipmentRes } from '../../features/shipment/useShipmentEntry'

/**
 * 재고 I › 영업관리 › 출하 › 출하입력(E040225) — 2026-10-21 재고1 출하 바퀴, 2026-10-31 loginad 클릭 대조.
 *
 * <p>메뉴 [출하입력] 은 이 화면(아래 줄 [리스트]), 출하조회의 [신규(F2)] · [일자-No.] 는 목록 위에 떠 있는 창(popup — [닫기]).
 * 원본 아래 줄: ✈ · 저장(F8)▲ · 저장/전표(F7) · 다시 작성 · 닫기(화면이면 리스트) · 웹자료올리기. 저장하면 <b>말 없이 빈 폼</b>(창은 닫히고 목록이 다시 읽힌다).
 * ✈ · 저장/전자결재 · 저장/전표 는 받쳐 줄 것이 없어 안내만 한다. 수정 창은 예전 그대로 저장(F8) · 닫기 · 삭제 · H.
 * 원본 표 아래 ▲▼ 접기는 아직 없다.
 */
export interface ShipmentEntryPopup {
  /** 고칠 출하(일자-No.). null 이면 새 출하. */
  editing: ShipmentRes | null
  /** 창을 닫는다. changed 면 목록을 다시 읽는다(저장 · 삭제 뒤). */
  onClose: (changed: boolean) => void
}
const NOT_HERE = '이 기능은 이 ERP 에서 제공하지 않습니다.'

export default function ShipmentEntryPage({ popup }: { popup?: ShipmentEntryPopup }) {
  const navigate = useNavigate()
  const editing = popup?.editing ?? null
  const entry = useShipmentEntry(editing)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const notHere = (what: string) => () => void ecAlert(`${NOT_HERE}\n(${what})`)

  const close = () => (popup ? popup.onClose(saved) : navigate('/sales/shipment-inquiry'))
  /** 저장 — mode 'new' 는 빈 칸으로(창을 남긴다), 'keep' 은 입력한 것을 그대로 둔다. 둘 다 아니면 창은 닫히고 화면은 빈 칸. */
  async function save(mode: 'new' | 'keep' | null = null) {
    if (!(await entry.save())) return
    setSaved(true)
    if (mode === 'keep') return
    if (popup && (editing || mode !== 'new')) { popup.onClose(true); return }
    entry.reset()
  }
  async function remove() {
    if (!editing || !(await ecConfirm('전표를 삭제하겠습니까?\n- 출하'))) return
    try { await api.delete(`/shipments/${editing.id}`); popup?.onClose(true) }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  const actions: SlipAction[] = editing ? [
    { label: '저장(F8)', primary: true, disabled: entry.busy, onClick: () => void save() },
    { label: '닫기', onClick: close },
    { label: '삭제', onClick: () => void remove() },
    { label: 'H', onClick: () => setHistoryOpen(true) },
  ] : [
    { label: '보내기', icon: 'send', onClick: notHere('전표 보내기') },
    { label: '저장(F8)', primary: true, disabled: entry.busy, onClick: () => void save(), menu: [
      { label: '저장/전자결재', onClick: notHere('저장/전자결재') },
      { label: '저장/내용유지', onClick: () => void save('keep') },
      { label: '저장/신규', onClick: () => void save('new') },
    ] },
    { label: '저장/전표(F7)', onClick: notHere('출하 저장/전표') },
    { label: '다시 작성', onClick: entry.reset },
    { label: popup ? '닫기' : '리스트', onClick: close },
    { label: '웹자료올리기', disabled: true, disabledReason: '파일 첨부는 [전자결재·드라이브]에서 씁니다.' },
  ]
  return (
    <>
      <EcSlipShell
        title={editing ? '출하입력(수정)' : '출하입력'}
        /* 원본 머리 [기본(수정불가)▾] · [Option] · [도움말](2026-10-31 loginad 출하입력 창). */
        layouts={{ label: '기본(수정불가)', items: [{ label: '✓ 기본(수정불가)' }, { label: '신규양식추가', onClick: notHere('신규양식추가') }] }}
        plainOption
        options={[{ label: '입력값 초기화', onClick: entry.reset }]}
        actions={actions}
      >
        {entry.form}
      </EcSlipShell>
      {historyOpen && editing && <SlipHistoryModal target="SHIPMENT" id={editing.id} head={slipHeadLabel(editing.shipDate, editing.shipNo)} onClose={() => setHistoryOpen(false)} />}
    </>
  )
}
