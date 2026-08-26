import { api } from '../api/client'
import { fillAndPrint, openPrintWindow, type PrintSignLine } from './print'
import { amountToKorean } from './amountToKorean'
import { escapeHtml } from './escapeHtml'

export { amountToKorean }

/**
 * 전표 서식 인쇄 — 거래명세서·견적서·발주서처럼 <b>머리글(공급자/공급받는자) + 품목 명세 + 합계</b>
 * 구조를 갖는 정형 양식을 찍는다.
 *
 * 기존 {@link printTable} 은 "화면에 렌더된 표를 그대로 목록 인쇄"하는 도구라 성격이 다르다.
 * 이카운트 출력물 76종의 대부분은 다른 화면의 목록 인쇄(printTable 이 담당)이고, 여기서 다루는 것은
 * <b>서식이 정해진 전표</b>다. 종류마다 화면을 만들지 않고 이 템플릿 하나에 제목·양쪽 당사자·명세를
 * 넘겨 재사용한다(계획 문서 '별 트랙 — 출력물 서식'의 일반화).
 */
export interface DocParty {
  label: string
  name: string
  bizRegNo?: string | null
  ceo?: string | null
  bizType?: string | null
  bizItem?: string | null
  tel?: string | null
  address?: string | null
}

export interface DocLine {
  itemCode?: string | null
  itemName: string
  spec?: string | null
  unit?: string | null
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
  remark?: string | null
}

export interface PrintDocumentOptions {
  /** 양식 제목 (거래명세서 / 견적서 / 발주서 …) */
  title: string
  docNo: string
  docDate: string
  supplier: DocParty
  customer: DocParty
  lines: DocLine[]
  /** 일자 옆에 함께 찍을 항목 (담당자·창고·유효기간 등) */
  extra?: { label: string; value: string | null | undefined }[]
  remark?: string | null
  /** 표 아래 안내 문구 (예: 미수금 잔액, 인수 확인란 설명) */
  footNote?: string
  signLine?: PrintSignLine | null
}


const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

function partyHtml(p: DocParty): string {
  const row = (label: string, value: unknown) =>
    value ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>` : ''
  return `
    <table class="party">
      <caption>${escapeHtml(p.label)}</caption>
      <tbody>
        <tr><th>상호</th><td class="strong">${escapeHtml(p.name)}</td></tr>
        ${row('등록번호', p.bizRegNo)}
        ${row('대표자', p.ceo)}
        ${row('업태/종목', [p.bizType, p.bizItem].filter(Boolean).join(' / '))}
        ${row('연락처', p.tel)}
        ${row('주소', p.address)}
      </tbody>
    </table>`
}

const CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; margin: 20px; color: #1f2733; }
  h1 { font-size: 22px; letter-spacing: 12px; text-align: center; margin: 0 0 14px; font-weight: 800; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .docinfo { font-size: 11px; color: #46505d; }
  .docinfo b { color: #1f2733; }
  .parties { display: flex; gap: 10px; margin-bottom: 10px; }
  table { border-collapse: collapse; font-size: 11px; }
  table.party { width: 50%; }
  table.party caption { font-size: 11px; font-weight: 700; text-align: left; padding: 0 0 3px; }
  table.party th { width: 68px; background: #eff3f8; text-align: center; }
  table.party th, table.party td { border: 1px solid #c9d1da; padding: 3px 6px; }
  table.lines { width: 100%; }
  table.lines th, table.lines td { border: 1px solid #c9d1da; padding: 4px 6px; }
  table.lines th { background: #eff3f8; text-align: center; font-weight: 700; }
  td.num { text-align: right; }
  td.center { text-align: center; }
  .strong { font-weight: 700; }
  tfoot td { background: #fafbfc; font-weight: 700; }
  .sum { margin-top: 8px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
  .sum .korean { font-size: 12px; }
  .remark { margin-top: 8px; font-size: 11px; color: #46505d; white-space: pre-wrap; }
  .foot { margin-top: 10px; font-size: 10.5px; color: #6b7480; }
  /* 결재란: 도장을 찍을 자리라 칸을 넉넉히 비워둔다 */
  table.signline th { padding: 2px 10px; font-size: 10px; border: 1px solid #c9d1da; background: #eff3f8; }
  table.signline td.sign { height: 42px; min-width: 56px; text-align: center; vertical-align: bottom;
                           font-size: 10px; border: 1px solid #c9d1da; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print { body { margin: 0; } .doc { page-break-after: always; } .doc:last-child { page-break-after: auto; } }
`

function signLineHtml(line?: PrintSignLine | null): string {
  if (!line || line.slots.length === 0) return ''
  const heads = line.slots.map((s) => `<th>${escapeHtml(s.title)}</th>`).join('')
  const cells = line.slots.map((s) => `<td class="sign">${escapeHtml(s.signerName ?? '')}</td>`).join('')
  return `<table class="signline"><thead><tr>${heads}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`
}

function documentHtml(o: PrintDocumentOptions): string {
  const supply = o.lines.reduce((a, l) => a + Number(l.supplyAmount || 0), 0)
  const vat = o.lines.reduce((a, l) => a + Number(l.vatAmount || 0), 0)
  const total = supply + vat

  const extras = (o.extra ?? [])
    .filter((e) => e.value)
    .map((e) => `<div>${escapeHtml(e.label)}: <b>${escapeHtml(e.value)}</b></div>`)
    .join('')

  const body = o.lines.length === 0
    ? `<tr><td colspan="8" class="center" style="padding:16px;color:#8a929c">품목이 없습니다.</td></tr>`
    : o.lines.map((l, i) => `
        <tr>
          <td class="center">${i + 1}</td>
          <td>${escapeHtml(l.itemName)}${l.itemCode ? ` <span style="color:#8a929c">(${escapeHtml(l.itemCode)})</span>` : ''}</td>
          <td>${escapeHtml(l.spec ?? '')}</td>
          <td class="center">${escapeHtml(l.unit ?? '')}</td>
          <td class="num">${won(Number(l.quantity))}</td>
          <td class="num">${won(Number(l.unitPrice))}</td>
          <td class="num">${won(Number(l.supplyAmount))}</td>
          <td class="num">${won(Number(l.vatAmount))}</td>
        </tr>`).join('')

  return `
    <div class="doc">
      <h1>${escapeHtml(o.title)}</h1>
      <div class="top">
        <div class="docinfo">
          <div>전표번호: <b>${escapeHtml(o.docNo)}</b></div>
          <div>일자: <b>${escapeHtml(o.docDate)}</b></div>
          ${extras}
        </div>
        ${signLineHtml(o.signLine)}
      </div>

      <div class="parties">
        ${partyHtml(o.supplier)}
        ${partyHtml(o.customer)}
      </div>

      <table class="lines">
        <thead>
          <tr>
            <th style="width:34px">No</th>
            <th>품목</th>
            <th style="width:110px">규격</th>
            <th style="width:44px">단위</th>
            <th style="width:70px">수량</th>
            <th style="width:88px">단가</th>
            <th style="width:100px">공급가액</th>
            <th style="width:88px">부가세</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr>
            <td colspan="6" class="center">합 계</td>
            <td class="num">${won(supply)}</td>
            <td class="num">${won(vat)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="sum">
        <div class="korean">일금 <b>${escapeHtml(amountToKorean(total))}</b>원정 (₩${won(total)})</div>
        <div>합계금액 <b style="font-size:14px">${won(total)}</b> 원</div>
      </div>

      ${o.remark ? `<div class="remark">비고: ${escapeHtml(o.remark)}</div>` : ''}
      ${o.footNote ? `<div class="foot">${escapeHtml(o.footNote)}</div>` : ''}
    </div>`
}

/**
 * 인쇄 시점에 기본 결재란을 가져온다. 결재란이 없거나 조회가 실패하면 결재란 없이 인쇄한다 —
 * 도장칸이 없다고 출력을 막을 이유는 없다(EcListShell 과 같은 방침).
 */
async function defaultSignLine(): Promise<PrintSignLine | null> {
  try {
    const r = await api.get<PrintSignLine>('/print-sign-lines/default')
    return r.status === 204 ? null : r.data
  } catch {
    return null
  }
}

/** 회사정보(공급자). 미등록이면 null — 그 경우 공급자 칸을 회사명만으로 채운다. */
export async function loadSupplierParty(label = '공급자'): Promise<DocParty | null> {
  try {
    const r = await api.get<{
      name: string; ceo: string | null; bizRegNo: string | null
      bizType: string | null; bizItem: string | null; tel: string | null
      address: string | null; addressDetail: string | null
    } | null>('/company')
    const c = r.data
    if (!c) return null
    return {
      label,
      name: c.name,
      ceo: c.ceo,
      bizRegNo: c.bizRegNo,
      bizType: c.bizType,
      bizItem: c.bizItem,
      tel: c.tel,
      address: [c.address, c.addressDetail].filter(Boolean).join(' '),
    }
  } catch {
    return null
  }
}

/**
 * 전표 여러 건을 한 창에 이어 인쇄한다(전표마다 페이지가 나뉜다).
 * 결재란은 지정하지 않으면 기본 결재란을 가져와 모든 전표에 붙인다.
 *
 * @returns 인쇄할 전표가 없거나 팝업이 막히면 false
 */
export async function printDocuments(docs: PrintDocumentOptions[]): Promise<boolean> {
  if (docs.length === 0) return false

  // 결재란 조회(await)보다 창을 <b>먼저</b> 연다. 순서를 바꾸면 사용자 제스처가 만료돼
  // 브라우저 팝업 차단에 걸리고, 인쇄 버튼을 눌러도 아무 일도 일어나지 않는다.
  const win = openPrintWindow()
  if (!win) return false

  try {
    const sign = docs.some((d) => d.signLine === undefined) ? await defaultSignLine() : null
    const filled = docs.map((d) => ({ ...d, signLine: d.signLine === undefined ? sign : d.signLine }))

    const title = filled.length === 1 ? filled[0].title : `${filled[0].title} 외 ${filled.length - 1}건`
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8">
      <title>${escapeHtml(title)}</title><style>${CSS}</style></head>
      <body>${filled.map(documentHtml).join('')}</body></html>`)
    return true
  } catch (e) {
    // 준비 중 문구만 띄운 빈 창을 남겨두지 않는다
    win.close()
    throw e
  }
}

/** 전표 한 건 인쇄 */
export function printDocumentOne(doc: PrintDocumentOptions): Promise<boolean> {
  return printDocuments([doc])
}
