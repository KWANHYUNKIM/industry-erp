import PriceBulkScreen from './PriceBulkScreen'

/** 영업관리 > 판매단가일괄변경. 화면 구조가 구매와 같아 PriceBulkScreen 하나를 쓴다. */
export default function SalesPriceBulkPage() {
  return <PriceBulkScreen trade="SALES" />
}
