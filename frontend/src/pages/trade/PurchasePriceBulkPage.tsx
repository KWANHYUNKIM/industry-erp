import PriceBulkScreen from './PriceBulkScreen'

/** 구매관리 > 구매단가일괄변경. 화면 구조가 판매와 같아 PriceBulkScreen 하나를 쓴다. */
export default function PurchasePriceBulkPage() {
  return <PriceBulkScreen trade="PURCHASE" />
}
