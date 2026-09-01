package com.erp.accounting.service;

import com.erp.accounting.domain.CardIssuer;
import com.erp.accounting.dto.CardIssuerDtos.CardIssuerResponse;
import com.erp.accounting.dto.CardIssuerDtos.CreateCardIssuerRequest;
import com.erp.accounting.dto.CardIssuerDtos.UpdateCardIssuerRequest;
import com.erp.accounting.repository.CardIssuerRepository;
import com.erp.accounting.domain.Account;
import com.erp.accounting.repository.AccountRepository;
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

    private final AccountRepository accountRepository;
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
                .account(account(req.accountId()))
                .depositAccount(req.depositAccount())
                .searchKeyword(req.searchKeyword())
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
        c.setAccount(account(req.accountId()));
        c.setDepositAccount(req.depositAccount());
        c.setSearchKeyword(req.searchKeyword());
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

    /**
     * 원본 <b>[계정]</b>. 안 고르면 안 붙인다 — 회계반영할 때 사람이 고르면 된다.
     * 없는 id 를 조용히 무시하지 않는다: 화면이 잘못 보낸 것을 모르면 값이 사라진 줄 안다.
     */
    private Account account(Long id) {
        if (id == null) return null;
        return accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정을 찾을 수 없습니다. id=" + id));
    }

    private String generateCode() {
        return "CI" + String.format("%03d", repository.countByCodeStartingWith("CI") + 1);
    }
}
