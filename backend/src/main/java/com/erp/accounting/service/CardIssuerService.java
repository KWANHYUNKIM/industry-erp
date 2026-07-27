package com.erp.accounting.service;

import com.erp.accounting.domain.CardIssuer;
import com.erp.accounting.dto.CardIssuerDtos.CardIssuerResponse;
import com.erp.accounting.dto.CardIssuerDtos.CreateCardIssuerRequest;
import com.erp.accounting.dto.CardIssuerDtos.UpdateCardIssuerRequest;
import com.erp.accounting.repository.CardIssuerRepository;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;

/** 카드사 마스터(E010109) CRUD. */
@Service
@RequiredArgsConstructor
public class CardIssuerService {

    private final CardIssuerRepository repository;

    @Transactional(readOnly = true)
    public List<CardIssuerResponse> findAll() {
        return repository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(CardIssuerResponse::from).toList();
    }

    @Transactional
    public CardIssuerResponse create(CreateCardIssuerRequest req) {
        String code = StringUtils.hasText(req.code()) ? req.code().trim() : generateCode();
        if (repository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 카드사코드입니다: " + code);
        }
        CardIssuer c = CardIssuer.builder()
                .code(code)
                .name(req.name())
                .feeRate(req.feeRate() != null ? req.feeRate() : BigDecimal.ZERO)
                .remark(req.remark())
                .active(true)
                .build();
        return CardIssuerResponse.from(repository.save(c));
    }

    @Transactional
    public CardIssuerResponse update(Long id, UpdateCardIssuerRequest req) {
        CardIssuer c = get(id);
        c.setName(req.name());
        c.setFeeRate(req.feeRate() != null ? req.feeRate() : BigDecimal.ZERO);
        c.setRemark(req.remark());
        if (req.active() != null) {
            c.setActive(req.active());
        }
        return CardIssuerResponse.from(c);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private CardIssuer get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("카드사를 찾을 수 없습니다. id=" + id));
    }

    private String generateCode() {
        return "CI" + String.format("%03d", repository.countByCodeStartingWith("CI") + 1);
    }
}
