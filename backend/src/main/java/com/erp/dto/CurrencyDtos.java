package com.erp.dto;

import com.erp.domain.Currency;
import com.erp.domain.ExchangeRate;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class CurrencyDtos {

    private CurrencyDtos() {}

    public record CurrencyRequest(
            @NotBlank(message = "통화코드를 입력하세요.") String code,
            @NotBlank(message = "통화명을 입력하세요.") String name,
            String symbol,
            /** 고시 단위. 엔화처럼 100단위로 고시하면 100 */
            @Positive(message = "고시 단위는 0보다 커야 합니다.") Integer unit,
            Boolean active
    ) {}

    public record CurrencyResponse(
            Long id, String code, String name, String symbol, Integer unit, boolean active,
            /** 오늘 기준 가장 최근 고시환율 (없으면 null) */
            BigDecimal latestRate, LocalDate latestRateDate
    ) {
        public static CurrencyResponse from(Currency c, ExchangeRate latest) {
            return new CurrencyResponse(
                    c.getId(), c.getCode(), c.getName(), c.getSymbol(), c.getUnit(), c.isActive(),
                    latest != null ? latest.getRate() : null,
                    latest != null ? latest.getRateDate() : null);
        }
    }

    public record RateRequest(
            @NotNull(message = "통화를 선택하세요.") Long currencyId,
            @NotNull(message = "고시일자를 입력하세요.") LocalDate rateDate,
            @NotNull @Positive(message = "환율은 0보다 커야 합니다.") BigDecimal rate
    ) {}

    public record RateResponse(
            Long id, Long currencyId, String currencyCode, String currencyName, Integer unit,
            LocalDate rateDate, BigDecimal rate,
            /** 1 통화당 원화 (rate / unit) */
            BigDecimal ratePerUnit,
            String createdBy
    ) {
        public static RateResponse from(ExchangeRate r) {
            Currency c = r.getCurrency();
            return new RateResponse(
                    r.getId(), c.getId(), c.getCode(), c.getName(), c.getUnit(),
                    r.getRateDate(), r.getRate(),
                    r.getRate().divide(BigDecimal.valueOf(c.getUnit()), 4, java.math.RoundingMode.HALF_UP),
                    r.getCreatedBy());
        }
    }

    /** 외화 → 원화 환산 결과 */
    public record ConversionResponse(
            Long currencyId, String currencyCode, LocalDate baseDate,
            LocalDate appliedRateDate, BigDecimal appliedRate, Integer unit,
            BigDecimal foreignAmount, BigDecimal krwAmount
    ) {}
}
