import { fmtAmount } from '../../../utils/format'
/**
 * 종이 세금계산서 — (세금)계산서발행/수령(원본 E030202) 줄의 [인쇄] · [저장/청구서인쇄] 가 띄우는 '청구서' 창의 서식.
 *
 * <p>2026-10-20 loginaa 실측: [별지 제14호서식] 두 장(공급자 보관용 빨강 rgb(255,51,0) · 공급받는자 보관용 파랑 rgb(0,51,153)),
 * 일련번호 'YYYYMMDD - 000N', 공급가액 11칸 · 세액 10칸 숫자를 오른쪽부터 한 자리씩, 공란 수 = 11 - 공급가액 자릿수,
 * 품목 줄 첫 줄에 월 · 일 · 공급가액 · 세액, 합계금액 · 외상미수금 = 합계, 끝 '이 금액을 청구 함'.
 */
export interface PaperParty { bizRegNo?: string | null; name?: string | null; ceo?: string | null; address?: string | null; bizType?: string | null; bizItem?: string | null }
export interface PaperVoucher { entryDate: string; entryNo: number; supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null }

/** 숫자를 n 칸에 오른쪽부터 한 자리씩. 남는 칸은 빈칸. */
function digits(n: number, cells: number): string[] {
  const s = String(Math.abs(Math.round(n)))
  const pad = Math.max(0, cells - s.length)
  return [...Array(pad).fill(''), ...s.slice(-cells).split('')]
}
const SUPPLY_HEAD = ['백', '십', '억', '천', '백', '십', '만', '천', '백', '십', '일']
const TAX_HEAD = ['십', '억', '천', '백', '십', '만', '천', '백', '십', '일']

function Party({ side, p }: { side: string; p: PaperParty }) {
  return (
    <table>
      <colgroup><col className="w-[22px]" /><col className="w-[40px]" /><col /><col className="w-[22px]" /><col className="w-[60px]" /></colgroup>
      <tbody>
        <tr><th rowSpan={4}>{side}</th><th>등록<br />번호</th><td colSpan={3} className="c">{p.bizRegNo ?? ''}</td></tr>
        <tr><th>상호<br />(법인명)</th><td className="v">{p.name ?? ''}</td><th>성<br />명</th><td className="v">{p.ceo ?? ''}</td></tr>
        <tr><th>사업장<br />주소</th><td colSpan={3} className="v">{p.address ?? ''}</td></tr>
        <tr><th>업태</th><td className="v">{p.bizType ?? ''}</td><th>종<br />목</th><td className="v">{p.bizItem ?? ''}</td></tr>
      </tbody>
    </table>
  )
}

/** [표시설정] 창 값(2026-10-22 실측: 도장 · 일자 · 일련번호 표시 / 인쇄구분 전체 · 공급자 · 공급받는자 / 청구·영수 동그라미 · 미적용 · 문자인쇄 / 2건 · 페이지). */
export interface PaperDisplay { stamp: boolean; date: boolean; serial: boolean; copies: 'all' | 'supplier' | 'buyer'; claim: 'circle' | 'none' | 'text'; two: boolean }
export const DEFAULT_PAPER_DISPLAY: PaperDisplay = { stamp: true, date: true, serial: true, copies: 'all', claim: 'circle', two: true }
/** 종이 종류 — '종이세금계산서'(제목 세 금 계 산 서) · '종이계산서'(제목 계 산 서, 면세용). */
export type PaperKind = '청구서' | '종이세금계산서' | '종이계산서'

function Copy({ buyerCopy, v, supplier, buyer, kind, display }: { buyerCopy: boolean; v: PaperVoucher; supplier: PaperParty; buyer: PaperParty; kind: PaperKind; display: PaperDisplay }) {
  const [y, m, d] = v.entryDate.split('-')
  const supplyLen = String(Math.abs(Math.round(v.supplyAmount))).length
  return (
    <div className={`ec-taxform${buyerCopy ? ' buyer' : ''}`}>
      <p className="mb-[2px]">■ 부가가치세법 시행규칙 [별지 제14호서식]</p>
      <table>
        <tbody>
          <tr>
            <td rowSpan={2} className="w-[60%]"><span className="tf-title">{kind === '종이계산서' ? '계 산 서' : '세 금 계 산 서'}</span> ({buyerCopy ? '공급받는자' : '공급자'} 보관용)</td>
            <th>책번호</th><td>권</td><td>호</td>
          </tr>
          <tr><th>일련번호</th><td colSpan={2} className="c">{display.serial ? `${y}${m}${d} - ${String(v.entryNo).padStart(4, '0')}` : ''}</td></tr>
        </tbody>
      </table>
      <div className="flex">
        <div className="flex-1"><Party side="공급자" p={supplier} /></div>
        <div className="flex-1"><Party side="공급받는자" p={buyer} /></div>
      </div>
      <table>
        <colgroup><col className="w-[34px]" /><col /><col /><col />{Array.from({ length: 21 }, (_, i) => <col key={i} />)}</colgroup>
        <tbody>
          <tr><th colSpan={4}>작성</th><th colSpan={11}>공급가액</th><th colSpan={10}>세액</th></tr>
          <tr>
            <th>년</th><th>월</th><th>일</th><th>공란</th>
            {SUPPLY_HEAD.map((h, i) => <th key={`s${i}`}>{h}</th>)}
            {TAX_HEAD.map((h, i) => <th key={`t${i}`}>{h}</th>)}
          </tr>
          <tr>
            <td className="c">{display.date ? y : ''}</td><td className="c">{display.date ? m : ''}</td><td className="c">{display.date ? d : ''}</td><td className="c">{Math.max(0, 11 - supplyLen)}</td>
            {digits(v.supplyAmount, 11).map((c, i) => <td key={`sd${i}`} className="c">{c}</td>)}
            {digits(v.vatAmount, 10).map((c, i) => <td key={`td${i}`} className="c">{c}</td>)}
          </tr>
          <tr><th colSpan={4}>비 고</th><td colSpan={21} className="v">{v.remark ?? ''}</td></tr>
        </tbody>
      </table>
      <table>
        <colgroup><col className="w-[26px]" /><col className="w-[26px]" /><col /><col className="w-[50px]" /><col className="w-[60px]" /><col className="w-[90px]" /><col className="w-[80px]" /><col className="w-[60px]" /></colgroup>
        <tbody>
          <tr><th>월</th><th>일</th><th>품 목 및 규 격</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th><th>비고</th></tr>
          {[0, 1, 2, 3].map((i) => (
            <tr key={i}>
              <td className="c">{i === 0 ? m : ''}</td><td className="c">{i === 0 ? d : ''}</td><td className="v" /><td className="n" /><td className="n" />
              <td className="n">{i === 0 ? fmtAmount(v.supplyAmount) : ''}</td><td className="n">{i === 0 ? fmtAmount(v.vatAmount) : ''}</td><td className="v" />
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <tbody>
          <tr><th>합계금액</th><th>현금</th><th>수표</th><th>어음</th><th>외상미수금</th><td rowSpan={2}>이 금액을{' '}
              {display.claim === 'text' ? '청 구' : <>영 수 {display.claim === 'circle' ? <span className="inline-block border border-current rounded-full px-[3px]">청 구</span> : '청 구'}</>} 함.</td></tr>
          <tr><td className="n">{fmtAmount(v.totalAmount)}</td><td className="n" /><td className="n" /><td className="n" /><td className="n">{fmtAmount(v.totalAmount)}</td></tr>
        </tbody>
      </table>
    </div>
  )
}

export default function TaxInvoicePaper({ v, supplier, buyer, kind = '종이세금계산서', display = DEFAULT_PAPER_DISPLAY }: {
  v: PaperVoucher; supplier: PaperParty; buyer: PaperParty; kind?: PaperKind; display?: PaperDisplay
}) {
  return (
    <div className="ec-print-area">
      {display.copies !== 'buyer' && <Copy buyerCopy={false} v={v} supplier={supplier} buyer={buyer} kind={kind} display={display} />}
      {display.copies !== 'supplier' && <Copy buyerCopy v={v} supplier={supplier} buyer={buyer} kind={kind} display={display} />}
    </div>
  )
}
