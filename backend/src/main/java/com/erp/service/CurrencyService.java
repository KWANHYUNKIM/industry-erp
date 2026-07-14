package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Currency;
import com.erp.domain.ExchangeRate;
import com.erp.dto.CurrencyDtos.ConversionResponse;
import com.erp.dto.CurrencyDtos.CurrencyRequest;
import com.erp.dto.CurrencyDtos.CurrencyResponse;
import com.erp.dto.CurrencyDtos.RateRequest;
import com.erp.dto.CurrencyDtos.RateResponse;
import com.erp.repository.CurrencyRepository;
import com.erp.repository.ExchangeRateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

/**
 * 외화 관리 — 통화 마스터와 일자별 고시환율.
 * 원화(KRW)는 기준통화라 등록 대상이 아니다.
 * 환산은 "그날 고시가 없으면 직전 고시를 쓴다"는 규칙으로 한다(주말·휴일 고시 공백).
 */
@Service
@RequiredArgsConstructor
public class CurrencyService {

    private static final String BASE_CURRENCY = "KRW";

    private final CurrencyRepository currencyRepository;
    private final ExchangeRateRepository rateRepository;

    @Transactional(readOnly = true)
    public List<CurrencyResponse> findCurrencies() {
        LocalDate today = LocalDate.now();
        return currencyRepository.findAllByOrderByCodeAsc().stream()
                .map(c -> CurrencyResponse.from(c, rateRepository.findLatest(c.getId(), today).orElse(null)))
                .toList();
    }

    @Transactional
    public CurrencyResponse createCurrency(CurrencyRequest req) {
        String code = req.code().trim().toUpperCase();
        if (BASE_CURRENCY.equals(code)) {
            throw ApiException.badRequest("원화(KRW)는 기준통화라 외화로 등록하지 않습니다.");
        }
        if (currencyRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 등록된 통화입니다: " + code);
        }
        Currency c = Currency.builder()
                .code(code)
                .name(req.name())
                .symbol(req.symbol())
                .unit(req.unit() != null ? req.unit() : 1)
                .active(req.active() == null || req.active())
                .build();
        return CurrencyResponse.from(currencyRepository.save(c), null);
    }

    @Transactional
    public CurrencyResponse updateCurrency(Long id, CurrencyRequest req) {
        Currency c = currency(id);
        c.setName(req.name());
        c.setSymbol(req.symbol());
        c.setUnit(req.unit() != null ? req.unit() : c.getUnit());
        c.setActive(req.active() == null || req.active());
        // 통화코드는 바꾸지 않는다. 이미 등록된 환율이 그 코드를 가리키고 있다.
        return CurrencyResponse.from(c, rateRepository.findLatest(c.getId(), LocalDate.now()).orElse(null));
    }

    @Transactional(readOnly = true)
    public List<RateResponse> findRates(Long currencyId) {
        return rateRepository.findAllWithCurrency(currencyId).stream().map(RateResponse::from).toList();
    }

    @Transactional
    public RateResponse createRate(RateRequest req, String username) {
        Currency c = currency(req.currencyId());
        if (rateRepository.existsByCurrencyIdAndRateDate(c.getId(), req.rateDate())) {
            throw ApiException.conflict("이미 등록된 환율입니다: " + c.getCode() + " " + req.rateDate());
        }
        ExchangeRate r = ExchangeRate.builder()
                .currency(c)
                .rateDate(req.rateDate())
                .rate(req.rate())
                .createdBy(username)
                .build();
        return RateResponse.from(rateRepository.save(r));
    }

    /** 외화 금액을 기준일 환율로 원화 환산한다. 그날 고시가 없으면 직전 고시를 적용한다. */
    @Transactional(readOnly = true)
    public ConversionResponse convert(Long currencyId, BigDecimal amount, LocalDate baseDate) {
        if (amount == null || amount.signum() <= 0) {
            throw ApiException.badRequest("환산할 금액은 0보다 커야 합니다.");
        }
        Currency c = currency(currencyId);
        LocalDate date = baseDate != null ? baseDate : LocalDate.now();
        ExchangeRate r = rateRepository.findLatest(c.getId(), date)
                .orElseThrow(() -> ApiException.badRequest(
                        c.getCode() + " 의 " + date + " 이전 고시환율이 없습니다. 환율을 먼저 등록하세요."));

        // 원화 = 외화금액 × (고시환율 / 고시단위)
        BigDecimal krw = amount.multiply(r.getRate())
                .divide(BigDecimal.valueOf(c.getUnit()), 0, RoundingMode.HALF_UP);

        return new ConversionResponse(
                c.getId(), c.getCode(), date,
                r.getRateDate(), r.getRate(), c.getUnit(),
                amount, krw);
    }

    private Currency currency(Long id) {
        return currencyRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("통화를 찾을 수 없습니다. id=" + id));
    }
}
