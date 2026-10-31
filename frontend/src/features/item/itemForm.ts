import { ecAlert } from '../../components/EcDialog'

/* 품목등록 창의 자료 모양 · 칸 탭 — ItemsPage(목록)와 ItemFormWindow(창)가 같이 쓴다. ItemsPage 에서 그대로 옮겼다. */

/** 원본에 있고 우리에게 받쳐 줄 것이 없는 메뉴 · 단추 — 누르면 안내만 한다. */
export const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)

/**
 * 원본 품목등록 창의 탭 일곱(loginaa C000029 실측, 2026-10-13).
 * 같은 칸이 여러 탭에 겹친다 — 품목코드는 모든 탭 맨 위, 품목명 ~ 재고수량관리는 [기본] · [품목정보] 둘 다,
 * 입고 · 출고단가는 [기본] · [단가] 둘 다. 한 상태를 같이 쓰므로 한쪽에서 고치면 다른 탭도 같은 값이다.
 */
export const FORM_TABS = ['기본', '품목정보', '수량', '단가', '원가', '부가정보', '관리대상'] as const
export type FormTab = typeof FORM_TABS[number]

/**
 * 품질검사유형 — 원본처럼 재고 II › 품질관리 › 품질검사유형등록 마스터에서 고른다(2026-10-30 실측: 유형 100
 * '출하대기검사' 의 [품목설정] 에 A001 이 있으면 A001 의 이 칸이 '출하대기검사'). 그 마스터의 [품목설정] 과
 * 같은 연결이라, 고르면 그 유형의 품목설정에 들어가고 앞 유형에서 빠진다. 품목의 qcType 글자에는 유형명을 같이 적는다.
 */
export type QcTypeOption = { id: number; code: string; name: string; active: boolean }

/*
 * 새 창의 기본값 — 원본 신규(F2) 그대로: 단위 빈칸 · 품목구분 상품 · 세트여부 사용안함 · 재고수량관리 사용 ·
 * 입고 · 출고단가 빈칸(0) · 품질검사방법 전수. 참/거짓은 'Y'/'N' 으로 든다.
 */
export const emptyForm = {
  code: '', name: '', spec: '', unit: '',
  category: 'MERCHANDISE',
  unitPrice: '0', purchasePrice: '0', safetyStock: '0',
  barcode: '', searchKeyword: '',
  remark: '',
  vatRateSales: '10', vatRatePurchase: '10',
  subcontractPrice: '0', leadTimeDays: '0', minPurchaseUnit: '0',
  /* [원가] 탭 — 원본 새 창: 표준노무시간 1 · 경비가중치 1 · 재료비표준원가 빈칸 · 나머지 셋 0(잠김). */
  stdLaborHours: '1', expenseWeight: '1', materialStdCost: '',
  expenseStdCost: '0', laborStdCost: '0', subcontractStdCost: '0',
  itemType: '', parentItemId: '',
  setItem: 'N', sharedItem: 'N', lotManaged: 'N',
  qcType: '', qcMethod: '전수', qcOnPurchase: 'N', qcOnProduction: 'N',
  autoProductionOnSales: 'N', autoProductionOnTransfer: 'N',
  supplierId: '',
  stockTracked: 'Y',
  /** 사용구분. 수정 창의 [사용중단/재사용] 로만 바꾼다 — 저장이 되살리지 않게 값은 그대로 들고 다닌다. */
  active: 'Y',
  udiDi: '',
  managementItemId: '',
  itemGroupId: '',
  /** 원본 [품목정보] 의 [생산공정] — 공정 id 를 쉼표로 이어 든다(태그 여러 개). */
  productionProcessIds: '',
}
export type ItemForm = typeof emptyForm
/** [생산공정] 칸의 쉼표로 이은 id → 숫자 목록. */
export const procIds = (v: string): number[] => v.split(',').filter(Boolean).map(Number)
