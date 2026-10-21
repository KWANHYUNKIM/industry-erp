import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Lot, LotTransaction } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { dateNo } from '../../utils/dateNo'
import { expiryDirectRange } from '../../utils/expiryRange'
import EditStateMenu from '../../components/EditStateMenu'
import BulkChangeModal from '../../components/BulkChangeModal'
import EcHistoryButton from '../../components/EcHistory'
import { ecConfirm } from '../../components/EcDialog'

/**
 * 재고 II &gt; 시리얼/로트No. &gt; <b>시리얼/로트No.등록</b> (이카운트 E040617)
 *
 * <p>원본은 로트 <b>마스터 목록</b>이다(2026-10-13 실측, plans/재고2/E040617.md). 등록은 번호 · 품목 · 유효기한 · udi코드만 만들고
 * <b>수량 · 내역은 아무것도 생기지 않는다</b> — 수량은 내역입력(/quality/lot-tx-list) · 전표 · 재고조정(/quality/lot-adjust)이 만든다.
 *
 * <p>예전 이 화면은 입고수량 · 현재고 · 창고 · 상태 · 처리(출고 · 실사 · 보류) 열을 든 <b>재고 판</b>이었다. 그 일은 원본에서
 * 다른 화면 몫이라 그쪽에 있다: 잔량 = 시리얼/로트No.재고현황(/quality/lot-stock), 실사 = 재고조정, 출고 = 내역입력 '판매'.
 */

type Tab = '기본' | '시리얼/로트No.정보' | '부가정보'
const TABS: Tab[] = ['기본', '시리얼/로트No.정보', '부가정보']
/* 원본 [사용구분] 라디오 — 기본 '사용'. */
const USES = ['전체', '사용', '사용중단'] as const
type Use = typeof USES[number]

const today = () => ymd(new Date())
/* 원본 유효기한 기본 = 오늘 + 5년 − 1일(2026/10/13 → 2031/10/12). */
const defaultExpire = () => expiryDirectRange(today()).to
const emptyForm = () => ({ itemId: '', udiCode: '', expireDate: defaultExpire(), lotNos: '' })

export default function SerialLotPage() {
  const [rows, setRows] = useState<Lot[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /* 원본 조건: 유효기한(구간) · 품목 · 시리얼/로트No.(~ 구간) · 사용구분. */
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [lotFrom, setLotFrom] = useState('')
  const [lotTo, setLotTo] = useState('')
  const [use, setUse] = useState<Use>('사용')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  /* 신규 · 수정 창 — editing 이 있으면 수정('시리얼/로트No.등록'), 없으면 신규('시리얼/로트 No. 생성'). */
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Lot | null>(null)
  const [tab, setTab] = useState<Tab>('기본')
  const [form, setForm] = useState(emptyForm)
  const [lotMissing, setLotMissing] = useState(false)
  const [formError, setFormError] = useState('')
  /* 원본 [Fn] ▸ 번호생성(2026-10-21 실측): 생성개수 N + 코드생성 창(반복코드[3] · 기호1[1] '_' · 일련번호[4]) → 'QA2_0001' 꼴 N 줄. */
  const [genCount, setGenCount] = useState('')
  const [genOpen, setGenOpen] = useState(false)
  const [genPrefix, setGenPrefix] = useState('')
  const [genSym, setGenSym] = useState('_')
  /* 원본 삭제가 막히면 뜨는 '알림' 창 — [코드 | 코드명 | 자료] 표(2026-10-13 실측: 'QA재고2-L01 | | 구매: 20261013-0'). */
  const [blocked, setBlocked] = useState<{ code: string; data: string[] } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  /* [보기] — 그 로트로 거른 내역조회 창. */
  const [detail, setDetail] = useState<Lot | null>(null)
  const [detailRows, setDetailRows] = useState<LotTransaction[]>([])

  async function load() {
    setLoading(true)
    try {
      const [l, i] = await Promise.all([api.get<Lot[]>('/lots'), api.get<Item[]>('/items')])
      setRows(l.data)
      setItems(i.data)
      setChecked(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const shown = useMemo(() => rows
    .filter((r) => use === '전체' || (use === '사용') === r.useYn)
    .filter((r) => !keyword || r.lotNo.includes(keyword) || r.itemName.includes(keyword))
    .filter((r) => !expFrom || (r.expireDate ?? '') >= expFrom)
    .filter((r) => !expTo || (r.expireDate != null && r.expireDate <= expTo))
    .filter((r) => !itemCond || String(r.itemId) === itemCond)
    .filter((r) => !lotFrom || r.lotNo >= lotFrom)
    .filter((r) => !lotTo || r.lotNo <= lotTo)
    .sort((a, b) => a.lotNo.localeCompare(b.lotNo)),
  [rows, use, keyword, expFrom, expTo, itemCond, lotFrom, lotTo])

  const itemOptions = items.filter((it) => it.active !== false)
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))
  const specOf = (id: string) => items.find((it) => String(it.id) === id)?.spec ?? ''

  function openNew() {
    setEditing(null); setForm(emptyForm()); setTab('기본'); setLotMissing(false); setFormError(''); setFormOpen(true)
  }
  function openEdit(r: Lot) {
    setEditing(r)
    setForm({ itemId: String(r.itemId), udiCode: r.udiCode ?? '', expireDate: r.expireDate ?? '', lotNos: r.lotNo })
    setTab('기본'); setLotMissing(false); setFormError(''); setFormOpen(true)
  }
  function set(k: keyof ReturnType<typeof emptyForm>, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function save() {
    setFormError('')
    try {
      if (editing) {
        await api.put(`/lots/${editing.id}`, { itemId: Number(form.itemId), expireDate: form.expireDate || null, udiCode: form.udiCode || null })
      } else {
        const lotNos = form.lotNos.split('\n').map((s) => s.trim()).filter(Boolean)
        /* 원본: 비우고 저장하면 문구 없이 시리얼/로트No.정보 탭으로 넘어가 칸을 빨갛게 한다. */
        if (lotNos.length === 0) { setLotMissing(true); setTab('시리얼/로트No.정보'); return }
        if (!form.itemId) { setTab('기본'); setFormError('품목을 선택하세요.'); return }
        for (const lotNo of lotNos) {
          await api.post('/lots', { lotNo, itemId: Number(form.itemId), expireDate: form.expireDate || null, udiCode: form.udiCode || null })
        }
      }
      setFormOpen(false)
      void load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  async function remove() {
    if (!editing || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.delete(`/lots/${editing.id}`)
      setFormOpen(false)
      void load()
    } catch (err) {
      const msg = extractErrorMessage(err)
      if (!msg.startsWith('처리가 불가능한 코드입니다')) { setFormError(msg); return }
      /* 자료 = 그 로트를 쓴 내역 — '구매: 20261013-0'(내역입력처럼 연결전표가 없으면 -0). */
      const txs = (await api.get<LotTransaction[]>('/lots/transactions')).data.filter((t) => t.lotId === editing.id)
      setBlocked({
        code: editing.lotNo,
        data: [...new Set(txs.map((t) => `${t.docType ?? t.typeName}: ${t.txDate.replace(/-/g, '')}-${t.sourceNo ? Number(t.sourceNo.split('-').pop()) || 0 : 0}`))],
      })
    }
  }

  /* 원본 [사용중단/재사용] — 확인 창 · 안내 없이 바로 바뀐다. */
  async function setUseOf(ids: number[], value: boolean) {
    if (ids.length === 0) { setError('리스트에 선택된 자료가 없습니다.'); return }
    setError('')
    try {
      await api.post('/lots/use', { ids, use: value })
      if (editing) setFormOpen(false)
      void load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function openDetail(r: Lot) {
    setDetail(r)
    try {
      const all = (await api.get<LotTransaction[]>('/lots/transactions')).data
      setDetailRows(all.filter((t) => t.lotId === r.id))
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  /* 일자-No. — 같은 날 줄의 차례. */
  const detailSeq = useMemo(() => {
    const m = new Map<number, number>(); const per = new Map<string, number>()
    for (const t of [...detailRows].sort((a, b) => a.id - b.id)) { const n = (per.get(t.txDate) ?? 0) + 1; per.set(t.txDate, n); m.set(t.id, n) }
    return m
  }, [detailRows])

  const allChecked = shown.length > 0 && shown.every((r) => checked.has(r.id))
  function toggle(id: number) {
    setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  return (
    <EcListShell
      title="시리얼/로트No.등록"
      search={keyword}
      onSearchChange={setKeyword}
      collapseConditions
      onNew={openNew}
      actions={[
        { label: '바코드(시리얼/로트No.)', disabled: true },
        { label: '변경', onClick: () => { if (checked.size === 0) setError('리스트에 선택된 자료가 없습니다.'); else { setError(''); setBulkOpen(true) } } },
        { label: '사용중단/재사용', menu: [
          { label: '사용중단', onClick: () => void setUseOf([...checked], false) },
          { label: '재사용', onClick: () => void setUseOf([...checked], true) },
        ] },
        { label: 'Excel' },
        { label: '웹자료올리기', disabled: true },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="유효기한">
          <input className="ec-input w-[130px]" type="date" value={expFrom} onChange={(e) => setExpFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input className="ec-input w-[130px]" type="date" value={expTo} onChange={(e) => setExpTo(e.target.value)} />
        </EcCond>
        <EcCond label="품목">
          <CodePickerField label="품목" hideLabel width={220} placeholder="품목" emptyLabel="선택 해제"
                           value={itemCond} onChange={setItemCond} items={itemOptions} />
        </EcCond>
        <EcCond label="시리얼/로트No.">
          <input className="ec-input w-[150px]" value={lotFrom} onChange={(e) => setLotFrom(e.target.value)} />
          <span className="mx-[4px]">~</span>
          <input className="ec-input w-[150px]" value={lotTo} onChange={(e) => setLotTo(e.target.value)} />
        </EcCond>
        <EcCond label="사용구분">
          {USES.map((u) => (
            <label key={u} className="mr-[10px] cursor-pointer">
              <input type="radio" name="lot-use" checked={use === u} onChange={() => setUse(u)} className="mr-[4px] align-middle" />{u}
            </label>
          ))}
        </EcCond>
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={allChecked}
                     onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th className="w-[260px]">시리얼/로트No.</th>
            <th>품목명[규격]</th>
            <th className="w-[140px]">규격</th>
            <th className="w-[110px]">유효기한</th>
            <th className="w-[80px] text-center">상세내역</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center"><input type="checkbox" checked={checked.has(r.id)} onChange={() => toggle(r.id)} /></td>
              <td><a className="cursor-pointer" onClick={() => openEdit(r)}>{r.lotNo}</a></td>
              <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
              <td>{r.spec ?? ''}</td>
              <td>{dateText(r.expireDate) || ''}</td>
              <td className="text-center">
                <button type="button" className="ec-btn ec-btn-sm" onClick={() => void openDetail(r)}>보기</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={formOpen} title={editing ? '시리얼/로트No.등록' : '시리얼/로트 No. 생성'} error={formError} width={720} onClose={() => setFormOpen(false)}>
        <div className="ec-pills mb-[8px]">
          {TABS.map((t) => (
            <button key={t} type="button" className={`ec-pill${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t}{lotMissing && t !== '부가정보' ? ' !' : ''}
            </button>
          ))}
        </div>
        <ul className="ec-form">
          {tab === '부가정보' ? (
            ['문자형식2', '문자형식3', '문자형식4', '문자형식5', '코드형식1', '코드형식2', '코드형식3', '숫자형식1', '숫자형식2', '숫자형식3', '일자형식1', '일자형식2']
              .map((n) => <EcCond key={n} label={n}><input className="ec-input w-[220px]" disabled /></EcCond>)
          ) : (
            <>
              {tab === '시리얼/로트No.정보' && lotField()}
              <EcCond label="품목">
                <CodePickerField label="품목" hideLabel width={260} placeholder="품목" emptyLabel="선택 해제"
                                 value={form.itemId} onChange={(v) => set('itemId', v)} items={itemOptions} />
              </EcCond>
              {tab === '기본' && (
                <EcCond label="udi코드">
                  <input className="ec-input w-[260px]" placeholder="udi코드" value={form.udiCode} onChange={(e) => set('udiCode', e.target.value)} />
                </EcCond>
              )}
              <EcCond label="규격"><span>{specOf(form.itemId)}</span></EcCond>
              <EcCond label="유효기한">
                <input className="ec-input w-[140px]" type="date" value={form.expireDate} onChange={(e) => set('expireDate', e.target.value)} />
              </EcCond>
              {tab === '기본' && lotField()}
            </>
          )}
        </ul>
        <div className="mt-[8px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => editing ? openEdit(editing) : setForm(emptyForm())}>다시 작성</button>
          {/* 원본 수정 창: [사용중단/재사용 ▲] → 사용중단(재사용) · 삭제, 끝에 [H](마지막으로 고친 때 한 줄 — 2026-10-14 실측 "2026/02/25 오전 10:16:32 [GUEST]"). */}
          {editing && (
            <EditStateMenu active={editing.useYn} onPick={(op) => op === '삭제' ? void remove() : void setUseOf([editing.id], op === '재사용')} />
          )}
          <button type="button" className="ec-btn" onClick={() => setFormOpen(false)}>닫기</button>
          <EcHistoryButton target="LOT" id={editing?.id} last />
        </div>
      </Modal>

      <Modal open={genOpen} title="코드생성" width={520} error={error} onClose={() => setGenOpen(false)}>
        <div className="flex items-center gap-[6px]">
          <label>반복코드[3] <input className="ec-input w-[80px]" maxLength={3} aria-label="반복코드" value={genPrefix} onChange={(e) => setGenPrefix(e.target.value)} /></label>
          <label>기호1[1] <input className="ec-input w-[40px]" maxLength={1} aria-label="기호1" value={genSym} onChange={(e) => setGenSym(e.target.value)} /></label>
          <label>일련번호[4] <input className="ec-input w-[70px]" readOnly value="****" aria-label="일련번호" /></label>
        </div>
        <div className="mt-[8px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => {
            if (genPrefix.length !== 3) return setFormError('자릿수가 맞지 않습니다.')
            const n = Math.min(Number(genCount || 1), 500)
            set('lotNos', Array.from({ length: n }, (_, i) => `${genPrefix}${genSym}${String(i + 1).padStart(4, '0')}`).join('\n'))
            setGenOpen(false)
          }}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setGenOpen(false)}>닫기</button>
        </div>
      </Modal>

      <Modal open={blocked != null} title="알림" width={520} error={error} onClose={() => setBlocked(null)}>
        <p className="m-0 leading-[18px]">처리가 불가능한 코드입니다.<br />다음 사항을 확인 바랍니다.</p>
        <p className="mt-[9px] mb-[6px] font-bold">[처리가 불가능한 코드]</p>
        <table className="w-full text-left">
          <thead><tr><th>코드</th><th>코드명</th><th>자료</th></tr></thead>
          <tbody>
            <tr><td>{blocked?.code}</td><td></td><td>{blocked?.data.join(', ')}</td></tr>
          </tbody>
        </table>
        <div className="mt-[9px]"><button type="button" className="ec-btn" onClick={() => setBlocked(null)}>닫기</button></div>
      </Modal>

      {bulkOpen && (
        <BulkChangeModal rows={rows.filter((r) => checked.has(r.id)).map((r) => ({ ...r, code: r.lotNo }))} codeLabel="시리얼/로트No."
                         fields={[
                           { key: 'expireDate', label: '유효기한', kind: 'date' },
                           { key: 'udiCode', label: 'udi코드', kind: 'text' },
                           { key: 'useYn', label: '사용구분', kind: 'select', options: [['true', '사용'], ['false', '사용중단']] },
                         ]}
                         initial={(r) => ({ expireDate: r.expireDate ?? '', udiCode: r.udiCode ?? '', useYn: String(r.useYn) })}
                         saveRow={async (r, d) => {
                           await api.put(`/lots/${r.id}`, { itemId: r.itemId, expireDate: d.expireDate || null, udiCode: d.udiCode.trim() || null })
                           if (String(r.useYn) !== d.useYn) await api.post('/lots/use', { ids: [r.id], use: d.useYn !== 'false' })
                         }}
                         onClose={() => setBulkOpen(false)}
                         onSaved={() => { setBulkOpen(false); void load() }} />
      )}

      <Modal open={detail != null} title="시리얼/로트No.내역조회" width={760} error={error} onClose={() => setDetail(null)}>
        <table className="w-full text-left">
          <thead><tr>
            <th className="text-center">일자-No.</th><th>품목명[규격]</th><th>시리얼/로트No.</th>
            <th className="text-right">수량</th><th className="text-center">전표구분</th><th>연결전표-No.</th><th>유효기한</th>
          </tr></thead>
          <tbody>
            {detailRows.length === 0 ? (
              <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : detailRows.map((t) => (
              <tr key={t.id}>
                <td className="text-center">{`${t.txDate.replace(/-/g, '/')} -${detailSeq.get(t.id) ?? ''}`}</td>
                <td>{t.itemName}{detail?.spec ? ` [${detail.spec}]` : ''}</td>
                <td>{t.lotNo}</td>
                <td className="text-right">{Math.abs(Number(t.quantityChange)).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="text-center">{t.docType ?? t.typeName}</td>
                <td>{t.sourceNo ? dateNo(t.txDate, t.sourceNo) : ''}</td>
                <td>{(detail?.expireDate ?? '').replace(/-/g, '/')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </EcListShell>
  )

  /* 시리얼/로트No. 칸 — 신규는 여러 줄(한 줄에 하나), 수정은 글자로 잠긴다. */
  function lotField() {
    return (
      <EcCond label="시리얼/로트No.">
        {editing ? <span>{editing.lotNo}</span> : (<div>
          {/* 원본(2026-10-21 실측): 칸 위에 [생성개수] 입력, 칸 오른쪽 [Fn] ▸ 번호생성(코드생성 창: 반복코드[3] · 기호1[1] '_' · 일련번호[4] '****' · 적용(F8)) · 번호생성설정. 모양만. */}
          <input className="ec-input w-[420px] mb-[3px] text-right" placeholder="생성개수" aria-label="생성개수" inputMode="numeric" value={genCount} onChange={(e) => setGenCount(e.target.value.replace(/\D/g, ''))} />
          <textarea className={`ec-input w-[420px] h-[60px]${lotMissing ? ' border-ec-danger' : ''}`} placeholder="시리얼/로트No."
                    value={form.lotNos} onChange={(e) => { set('lotNos', e.target.value); setLotMissing(false) }} />
          <button type="button" className="ec-btn ec-btn-sm ml-[3px] italic align-top" onClick={() => setGenOpen(true)}>Fn</button>
        </div>)}
      </EcCond>
    )
  }
}
