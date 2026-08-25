package com.erp.trade.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * 전표 부가세 배분. 이카운트 판매입력·구매입력 툴바의 <b>[거래별부가세계산]</b>(원본 버튼 id
 * {@code calcbySlipsubmain})에 대응한다.
 *
 * <p><b>왜 두 방식이 필요한가.</b> 라인마다 반올림하면 잔돈이 쌓인다. 공급가액 3,333 짜리 세 줄이면
 * 라인별은 333 × 3 = <b>999</b>, 거래별은 round(9,999 × 0.1) = <b>1,000</b> 으로 1원이 어긋난다.
 * 세금계산서는 전표 단위로 나가므로 어느 쪽에 맞출지는 업체가 고른다 — 그래서 버튼이다.
 *
 * <p>거래별로 계산할 때 생기는 잔차는 <b>공급가액이 가장 큰 라인 한 줄</b>에 몰아준다.
 * 여러 줄에 1원씩 흩뿌리면 같은 전표를 다시 저장할 때마다 배분이 달라져 이력이 흔들린다.
 * 이 규칙 덕분에 같은 입력은 항상 같은 결과가 된다.
 */
final class VatAllocator {

    private VatAllocator() {}

    /**
     * @param supplies 라인별 공급가액 (순서 보존)
     * @param rate     부가세율
     * @param taxable  과세 전표인가
     * @param bySlip   true 면 전표 단위로 한 번 반올림(거래별부가세계산), false 면 라인별 반올림
     * @return 라인별 부가세. 합계는 bySlip 일 때 round(공급가액합계 × 세율) 과 정확히 일치한다.
     */
    static List<BigDecimal> allocate(List<BigDecimal> supplies, BigDecimal rate,
                                     boolean taxable, boolean bySlip) {
        if (!taxable) {
            return supplies.stream().map(s -> BigDecimal.ZERO).toList();
        }
        List<BigDecimal> vats = new ArrayList<>(supplies.stream()
                .map(s -> s.multiply(rate).setScale(0, RoundingMode.HALF_UP))
                .toList());
        if (!bySlip || vats.isEmpty()) {
            return vats;
        }

        BigDecimal totalSupply = supplies.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal slipVat = totalSupply.multiply(rate).setScale(0, RoundingMode.HALF_UP);
        BigDecimal lineSum = vats.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal residual = slipVat.subtract(lineSum);
        if (residual.signum() == 0) {
            return vats;
        }

        int biggest = 0;
        for (int i = 1; i < supplies.size(); i++) {
            if (supplies.get(i).compareTo(supplies.get(biggest)) > 0) {
                biggest = i;
            }
        }
        vats.set(biggest, vats.get(biggest).add(residual));
        return vats;
    }
}
