import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { GRADE_LABELS } from '../../../utils/gradePrices'
import type { GroupMaster, Item, ManagementItem, Partner } from '../../../types/api'
import CustomFieldsPanel from '../../../components/CustomFieldsPanel'
import EcFileDrop from '../../../components/EcFileDrop'
import EcHistoryButton from '../../../components/EcHistory'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { partnerCodeItems } from '../../../utils/codeItems'
import ItemSuggestInput from './ItemSuggestInput'
import EcIcon from '../../../components/ui/EcIcon'
import { MenuButton } from '../../../components/EcSlipShell'
import SlipWindow from '../../../components/SlipWindow'
import { FORM_TABS, notHere, procIds, type FormTab, type ItemForm, type QcTypeOption } from '../itemForm'

const inputCls = 'ec-input w-full'

/** 원본 [품목정보] 탭 품목유형(C000029 실측). */
const ITEM_TYPES = ['양산품', '모델품', '모델부품', '공통부품']

/** 창의 칸 한 줄(이름표 + 입력). */
function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label className="mb-1 block text-sm text-ec-label">{label}</label>
      {children}
    </div>
  )
}

/** 원본 라디오 묶음. */
function Radios({ name, value, options, onChange }: {
  name: string; value: string; options: [string, string][]; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-[10px] min-h-[26px] text-[12px]">
      {options.map(([v, l]) => (
        <label key={v} className="inline-flex items-center gap-[3px] cursor-pointer">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /> {l}
        </label>
      ))}
    </div>
  )
}

/** 품목등록 창 — ItemsPage 에서 몸통 그대로 옮겼다. 상태는 화면(ItemsPage)이 들고 이 창은 받아서 그린다. */
export default function ItemFormWindow({
  categoryOptions,
  closeForm,
  copyAsNew,
  editId,
  editMenu,
  error,
  form,
  formTab,
  grades,
  image,
  invalid,
  itemGroups,
  items,
  mgmtItems,
  partners,
  processes,
  qcTypeId,
  qcTypes,
  removeOne,
  resetForm,
  set,
  setEditMenu,
  setFormTab,
  setGrades,
  setGroupOpen,
  setImage,
  setQcTypeId,
  setWebOpen,
  showForm,
  submit,
  toggleOne,
  uploadImage,
  uploading,
}: {
  categoryOptions: [string, string][]
  closeForm: () => void
  copyAsNew: () => void
  editId: number | null
  editMenu: boolean
  error: string
  form: ItemForm
  formTab: FormTab
  grades: string[]
  image: { id: number; name: string } | null
  invalid: boolean
  itemGroups: GroupMaster[]
  items: Item[]
  mgmtItems: ManagementItem[]
  partners: Partner[]
  processes: { id: number; code: string; name: string; active: boolean }[]
  qcTypeId: string
  qcTypes: QcTypeOption[]
  removeOne: () => Promise<void>
  resetForm: () => void
  set: (field: keyof ItemForm, value: string) => void
  setEditMenu: Dispatch<SetStateAction<boolean>>
  setFormTab: Dispatch<SetStateAction<FormTab>>
  setGrades: Dispatch<SetStateAction<string[]>>
  setGroupOpen: Dispatch<SetStateAction<boolean>>
  setImage: Dispatch<SetStateAction<{ id: number; name: string } | null>>
  setQcTypeId: Dispatch<SetStateAction<string>>
  setWebOpen: Dispatch<SetStateAction<boolean>>
  showForm: boolean
  submit: (e?: FormEvent, again?: boolean) => Promise<void>
  toggleOne: (active?: boolean) => Promise<void>
  uploadImage: (file: File) => Promise<void>
  uploading: boolean
}) {
  /** 빈 품목명 표시 — [기본] · [품목정보] 두 탭에 같은 칸이 있다. */
  const nameBad = invalid && !form.name.trim()
  const tabBad = (t: FormTab) => nameBad && (t === '기본' || t === '품목정보')

  /* ── 창의 칸들. 여러 탭이 같은 칸을 같이 쓴다. ── */
  const codeField = (
    <Field label="품목코드">
      {/* 코드는 전표가 그 값으로 묶여 있어 만들 때만 정한다 — 수정 창은 글자로만(원본도 잠김). */}
      {editId != null
        ? <div className="min-h-[26px] leading-[26px] text-[12px]">{form.code}</div>
        : <input className={inputCls} placeholder="품목코드" value={form.code} onChange={(e) => set('code', e.target.value)} />}
    </Field>
  )
  const imageField = (
    <Field label="이미지">
      {image ? (
        <div className="flex items-center gap-[8px] border border-ec-line border-solid p-[6px] bg-ec-page">
          <img src={`/api/files/${image.id}`} alt={image.name} className="w-[48px] h-[48px] object-cover bg-ec-panel" />
          <span className="text-[12.5px] text-ec-label flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{image.name}</span>
          <button type="button" className="ec-btn" onClick={() => setImage(null)}>떼기</button>
        </div>
      ) : (
        <EcFileDrop hint="이미지삽입" busy={uploading} disabled={uploading}
                    onFiles={(fs) => { if (fs[0]) void uploadImage(fs[0]) }} />
      )}
    </Field>
  )
  const groupField = (
    <Field label="품목그룹1">
      <CodePickerField label="품목그룹1" hideLabel fill pair placeholder="품목그룹1" emptyLabel="선택 해제"
                       value={form.itemGroupId} onChange={(v) => set('itemGroupId', v)}
                       items={itemGroups.map((g) => ({ value: String(g.id), code: g.code, name: g.name }))}
                       onNew={() => setGroupOpen(true)} />
    </Field>
  )
  const processField = (
    <>
    {/* 원본 [품목정보] 의 [생산공정] — 공정을 고르는 태그(A001 → 조립). BOR 목록이 이 값을 정한 품목을 보인다. */}
    <Field label="생산공정" wide>
      <div className="flex flex-wrap items-center gap-[4px]">
        {procIds(form.productionProcessIds).map((id) => (
          <button key={id} type="button" className="ec-btn ec-btn-sm" title="빼기"
                  onClick={() => set('productionProcessIds', procIds(form.productionProcessIds).filter((x) => x !== id).join(','))}>
            {processes.find((x) => x.id === id)?.name ?? id} ×
          </button>
        ))}
        <select className="ec-input w-[160px]" value="" aria-label="생산공정 추가"
                onChange={(e) => { if (e.target.value) set('productionProcessIds', [...procIds(form.productionProcessIds), Number(e.target.value)].join(',')) }}>
          <option value="">생산공정 추가</option>
          {processes.filter((x) => x.active && !procIds(form.productionProcessIds).includes(x.id))
            .map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
        </select>
      </div>
    </Field>
    </>
  )
  const remarkField = (
    <Field label="적요" wide>
      <input className={inputCls} placeholder="적요" value={form.remark} onChange={(e) => set('remark', e.target.value)} />
    </Field>
  )
  const safetyField = (
    <Field label="안전재고수량">
      <input type="number" step="any" className={inputCls} value={form.safetyStock} onChange={(e) => set('safetyStock', e.target.value)} />
    </Field>
  )
  const supplierField = (
    <Field label="구매처">
      {/* inventory 는 trade 를 참조할 수 없어 서버는 id 만 들고, 이름은 이 화면이 붙인다. */}
      <CodePickerField label="구매처" hideLabel fill placeholder="구매처" emptyLabel="선택 해제"
                       value={form.supplierId} onChange={(v) => set('supplierId', v)}
                       items={partnerCodeItems(partners)} />
    </Field>
  )
  const stockField = (
    <Field label="재고수량관리">
      {/* 사용안함이면 이 품목은 재고를 잡지 않는다(용역 · 운반비 등). */}
      <Radios name="item-stock" value={form.stockTracked} options={[['Y', '사용'], ['N', '사용안함']]} onChange={(v) => set('stockTracked', v)} />
    </Field>
  )
  /* 품목코드 ~ 단위 — [기본] · [품목정보] 둘 다 맨 위. */
  const nameFields = (
    <>
      {codeField}
      <Field label="품목명" wide>
        <div className={nameBad ? 'rounded-ec outline outline-[0.5px] outline-[color:var(--ec-text-danger)]' : undefined} aria-invalid={nameBad}>
          <ItemSuggestInput field="name" width="100%" value={form.name} onChange={(v) => set('name', v)} />
        </div>
      </Field>
      <Field label="규격">
        <ItemSuggestInput field="spec" width="100%" value={form.spec} onChange={(v) => set('spec', v)} />
      </Field>
      <Field label="단위">
        <input className={inputCls} placeholder="단위" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
      </Field>
    </>
  )
  const headFields = (
    <>
      {nameFields}
      <Field label="품목구분" wide>
        <Radios name="item-category" value={form.category} options={categoryOptions} onChange={(v) => set('category', v)} />
      </Field>
      <Field label="세트여부">
        <Radios name="item-set" value={form.setItem} options={[['Y', '사용'], ['N', '사용안함']]} onChange={(v) => set('setItem', v)} />
      </Field>
      {stockField}
    </>
  )
  const priceFields = (
    <>
      <Field label="입고단가">
        <input type="number" step="any" className={inputCls} placeholder="입고단가" value={form.purchasePrice}
               onChange={(e) => set('purchasePrice', e.target.value)} />
      </Field>
      <Field label="출고단가">
        <input type="number" step="any" className={inputCls} placeholder="출고단가" value={form.unitPrice}
               onChange={(e) => set('unitPrice', e.target.value)} />
      </Field>
    </>
  )
  const grid3 = 'grid grid-cols-1 gap-4 sm:grid-cols-3'

  return (
    <>
      {/*
        원본 품목등록 창(2026-10-31 loginad): 목록 위에 떠 있는 창 — 제목줄 [새창] [고정] [새로고침] [최대] [닫기], 머리 오른쪽 [Option],
        알약 탭 기본 · 품목정보 · 수량 · 단가 · 원가 · 부가정보 · 관리대상.
      */}
      {showForm && (
      <SlipWindow title="품목등록" popout="/inventory/items" onClose={closeForm}>
        <form onSubmit={submit} className="my-[8px] p-[14px] bg-ec-panel"
              onKeyDown={(e) => { if (e.key === 'F8') { e.preventDefault(); void submit() } }}>
          {error && <p role="alert" className="ec-error">{error}</p>}
          <div className="flex items-center gap-[4px] mb-[10px]">
            <div className="ec-pills">
              {FORM_TABS.map((t) => (
                <button key={t} type="button" className={`ec-pill no-ec relative${formTab === t ? ' active' : ''}`}
                        onClick={() => setFormTab(t)}>{t}
                  {/* 원본: 빈 칸이 있는 탭 오른쪽 위의 빨간 동그라미 '!'(16×16, 위 -6.3px). 품목명은 [기본] · [품목정보] 둘에 있다. */}
                  {tabBad(t) && (
                    <span aria-label="입력 안 된 칸" className="absolute -top-[6.3px] right-0 w-[16px] h-[16px] rounded-full bg-[var(--ec-text-danger)] text-ec-panel text-[11px] font-bold leading-[16px] text-center">!</span>
                  )}
                </button>
              ))}
            </div>
            {/* 원본 머리 [Option] — 안 항목은 원본 미측정, 우리에게 없는 설정이라 안내만. */}
            <button type="button" className="ec-btn ec-btn-sm ml-auto" onClick={notHere('품목등록 Option')}>Option</button>
          </div>

          {/*
            원본 [기본] 탭(2026-10-31 loginad): 품목코드 · 품목명 · 규격 · 단위 · 구매처 · 이미지 · 생산공정 · 품목그룹1 · 입고단가 · 출고단가 · 적요 ·
            재고수량관리 · 재고수량 · 안전재고수량. 규격 라디오(규격명/규격그룹/규격계산/규격계산그룹) · 단가 [VAT포함] · 재고수량 [입력] · 안전재고 [창고별지정]은
            우리에게 그 자료가 없어 칸을 안 둔다. 품목구분 · 세트여부는 [품목정보] 탭에 있다.
          */}
          {formTab === '기본' && (
            <div className={grid3}>
              {nameFields}
              {supplierField}
              {imageField}
              {processField}
              {groupField}
              {priceFields}
              {remarkField}
              {stockField}
              {safetyField}
            </div>
          )}

          {formTab === '품목정보' && (
            <div className={grid3}>
              {headFields}
              <Field label="품목유형" wide>
                <Radios name="item-type" value={form.itemType}
                        options={[...ITEM_TYPES.map((v) => [v, v] as [string, string]),
                          ...(form.itemType && !ITEM_TYPES.includes(form.itemType) ? [[form.itemType, form.itemType] as [string, string]] : [])]}
                        onChange={(v) => set('itemType', v)} />
              </Field>
              <Field label="부가세율(매출)">
                <input type="number" step="any" className={inputCls} value={form.vatRateSales} onChange={(e) => set('vatRateSales', e.target.value)} />
              </Field>
              <Field label="부가세율(매입)">
                <input type="number" step="any" className={inputCls} value={form.vatRatePurchase} onChange={(e) => set('vatRatePurchase', e.target.value)} />
              </Field>
              <Field label="바코드">
                <input className={inputCls} placeholder="바코드" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
              </Field>
              <Field label="검색창내용">
                <input className={inputCls} placeholder="검색창내용" value={form.searchKeyword} onChange={(e) => set('searchKeyword', e.target.value)} />
              </Field>
              <Field label="품목공유여부">
                <label className="inline-flex items-center gap-[3px] min-h-[26px] text-[12px]">
                  <input type="checkbox" checked={form.sharedItem === 'Y'} onChange={(e) => set('sharedItem', e.target.checked ? 'Y' : 'N')} /> C-Portal공유
                </label>
              </Field>
              {imageField}
              {groupField}
              {processField}
              {remarkField}
              <Field label="품질검사유형">
                <select className={inputCls} value={qcTypeId} aria-label="품질검사유형"
                        onChange={(e) => {
                          setQcTypeId(e.target.value)
                          set('qcType', (qcTypes.find((x) => String(x.id) === e.target.value)?.name ?? '').slice(0, 20))
                        }}>
                  <option value="">선택</option>
                  {qcTypes.filter((x) => x.active || String(x.id) === qcTypeId)
                    .map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
              <Field label="품질검사방법">
                <Radios name="item-qc-method" value={form.qcMethod} options={[['전수', '전수'], ['샘플링', '샘플링(%)']]} onChange={(v) => set('qcMethod', v)} />
              </Field>
              {/* 우리 값: 대표품목(관계설정의 대표 · 연결) · UDI-DI(의료기기공급내역보고). 원본에는 이 탭에 없다. */}
              <Field label="대표품목">
                <CodePickerField label="대표품목" hideLabel fill placeholder="대표품목" emptyLabel="선택 해제"
                                 value={form.parentItemId} onChange={(v) => set('parentItemId', v)}
                                 items={items.filter((x) => x.id !== editId)
                                   .map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec }))} />
              </Field>
              <Field label="UDI-DI">
                <input className={inputCls} value={form.udiDi} onChange={(e) => set('udiDi', e.target.value)} />
              </Field>
            </div>
          )}

          {formTab === '수량' && (
            <div className={grid3}>
              {codeField}
              {safetyField}
              <Field label="조달기간">
                {/* 주문하고 물건이 오기까지 걸리는 날수 — 발주계획이 이 값으로 거꾸로 센다. */}
                <input type="number" className={inputCls} value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} title="일 단위" />
              </Field>
              <Field label="최소구매단위">
                <input type="number" step="any" className={inputCls} value={form.minPurchaseUnit} onChange={(e) => set('minPurchaseUnit', e.target.value)} />
              </Field>
              {supplierField}
            </div>
          )}

          {formTab === '단가' && (
            <div className={grid3}>
              {codeField}
              {priceFields}
              {GRADE_LABELS.map((g, i) => (
                <Field key={g} label={`단가${g}`}>
                  <input type="number" step="any" className={inputCls} value={grades[i]}
                         onChange={(e) => setGrades((v) => v.map((x, j) => (j === i ? e.target.value : x)))} />
                </Field>
              ))}
            </div>
          )}

          {formTab === '원가' && (
            <div className={grid3}>
              {codeField}
              {/*
                원본 원가 탭(C000029, 2026-10-20 실측) 차례 그대로. 경비 · 노무비 · 외주비표준원가는 원본 창에서 잠긴 칸(0) —
                원가 쪽이 채우는 값이라 여기서는 보기만 한다. 숫자는 오른쪽 정렬(원본 text-align right).
              */}
              <Field label="외주비단가">
                <input type="number" step="any" className={`${inputCls} text-right`} value={form.subcontractPrice} onChange={(e) => set('subcontractPrice', e.target.value)} />
              </Field>
              <Field label="표준노무시간(노무비가중치)">
                <input type="number" step="any" className={`${inputCls} text-right`} value={form.stdLaborHours} onChange={(e) => set('stdLaborHours', e.target.value)} />
              </Field>
              <Field label="경비가중치">
                <input type="number" step="any" className={`${inputCls} text-right`} value={form.expenseWeight} onChange={(e) => set('expenseWeight', e.target.value)} />
              </Field>
              <Field label="재료비표준원가">
                <input type="number" step="any" className={`${inputCls} text-right`} value={form.materialStdCost} onChange={(e) => set('materialStdCost', e.target.value)} />
              </Field>
              <Field label="경비표준원가">
                <input type="number" readOnly className={`${inputCls} text-right`} value={form.expenseStdCost} />
              </Field>
              <Field label="노무비표준원가">
                <input type="number" readOnly className={`${inputCls} text-right`} value={form.laborStdCost} />
              </Field>
              <Field label="외주비표준원가">
                <input type="number" readOnly className={`${inputCls} text-right`} value={form.subcontractStdCost} />
              </Field>
            </div>
          )}

          {formTab === '부가정보' && (
            <div>
              <div className={grid3}>{codeField}</div>
              {/*
                원본은 [문자형추가항목1~6] · [숫자형추가항목1~10] 을 이름째 박아 둔다. 우리는 Self-Customizing &gt;
                사용자정의필드에서 이름을 지어 정의하고, 값은 그 행에 붙는 것이라 <b>수정할 때만</b> 보인다.
              */}
              {editId && <CustomFieldsPanel entityType="ITEM" entityId={editId} />}
            </div>
          )}

          {formTab === '관리대상' && (
            <div className={grid3}>
              {codeField}
              <Field label="관리항목">
                {/* 전표 라인에는 여기 값이 읽기전용으로 따라 붙는다. */}
                <CodePickerField label="관리항목" hideLabel fill placeholder="관리항목" emptyLabel="기본설정(선택입력)"
                                 value={form.managementItemId} onChange={(v) => set('managementItemId', v)}
                                 items={mgmtItems.map((m) => ({ value: String(m.id), code: m.code, name: m.name, sub: m.description }))} />
              </Field>
              <Field label="시리얼/로트No.">
                <Radios name="item-lot" value={form.lotManaged} options={[['N', '기본설정(선택입력)'], ['Y', '사용']]} onChange={(v) => set('lotManaged', v)} />
              </Field>
              <Field label="생산전표생성-판매">
                <Radios name="item-auto-sales" value={form.autoProductionOnSales} options={[['N', '기본설정(사용안함)'], ['Y', '사용']]} onChange={(v) => set('autoProductionOnSales', v)} />
              </Field>
              <Field label="생산전표생성-창고이동">
                <Radios name="item-auto-transfer" value={form.autoProductionOnTransfer} options={[['N', '기본설정(사용안함)'], ['Y', '사용']]} onChange={(v) => set('autoProductionOnTransfer', v)} />
              </Field>
              <Field label="품질검사요청-구매">
                <Radios name="item-qc-purchase" value={form.qcOnPurchase} options={[['N', '기본설정'], ['Y', '사용']]} onChange={(v) => set('qcOnPurchase', v)} />
              </Field>
              <Field label="품질검사요청-생산입고">
                <Radios name="item-qc-production" value={form.qcOnProduction} options={[['N', '기본설정'], ['Y', '사용']]} onChange={(v) => set('qcOnProduction', v)} />
              </Field>
            </div>
          )}

          {/*
            원본 버튼: 신규 저장(F8) · 다규격품목 · 다시 작성 · 웹자료올리기 · 닫기 /
            수정 저장(F8) · 복사 · 사용중단/재사용 ▴(사용중단 · 삭제) · 다시 작성 · 닫기 · H.
          */}
          <div className="mt-[12px] flex justify-end gap-[4px]">
            {/* 원본 [저장(F8)│▲] — ▲ 안 항목은 원본 미측정이라 다른 마스터 창(자료수집처등록)과 같은 [저장/신규] 만 둔다. */}
            <MenuButton label="저장(F8)" className="ec-btn ec-btn-primary" up onMain={() => void submit()}
                        items={[{ label: '저장/신규', onClick: () => void submit(undefined, true) }]} />
            {editId == null ? (
              <>
                {/* 다규격품목(규격 여럿을 한 품목에) 은 우리에게 그 자료가 없다 — 남은 것. */}
                <button type="button" className="ec-btn" disabled title="다규격품목은 아직 없습니다">다규격품목</button>
                <button type="button" className="ec-btn" onClick={resetForm}>다시 작성</button>
                <button type="button" className="ec-btn" onClick={() => setWebOpen(true)}>웹자료올리기</button>
              </>
            ) : (
              <>
                <button type="button" className="ec-btn" onClick={copyAsNew}>복사</button>
                <span className="ec-btn-group relative">
                  <button type="button" className="ec-btn" onClick={() => toggleOne()}>사용중단/재사용</button>
                  <button type="button" className="ec-btn ec-btn-arrow" aria-label="사용중단/재사용 더보기" onClick={() => setEditMenu((v) => !v)}><EcIcon name="caret-up" size={10} glyph="▴" /></button>
                  {editMenu && (
                    <div className="absolute bottom-full left-0 mb-[2px] z-[41] min-w-[110px] p-[4px] bg-ec-panel border border-ec-line border-solid rounded-ec">
                      <button type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                              onClick={() => { setEditMenu(false); void toggleOne(false) }}>사용중단</button>
                      <button type="button" className="no-ec block w-full text-left py-[6px] px-[8px] text-[12px] bg-transparent border-0 cursor-pointer"
                              onClick={() => { setEditMenu(false); void removeOne() }}>삭제</button>
                    </div>
                  )}
                </span>
                <button type="button" className="ec-btn" onClick={resetForm}>다시 작성</button>
              </>
            )}
            <button type="button" className="ec-btn" onClick={closeForm}>닫기</button>
            {/* 원본 수정 창 끝 [H] — 신규 창(id 없음)에서는 저절로 안 그린다. */}
            <EcHistoryButton target="ITEM" id={editId} />
          </div>
        </form>
      </SlipWindow>
      )}
    </>
  )
}
