package com.erp.accounting.cardissuer;

import com.erp.accounting.cardissuer.dto.CardIssuerDtos.CardIssuerResponse;
import com.erp.accounting.cardissuer.dto.CardIssuerDtos.CreateCardIssuerRequest;
import com.erp.accounting.cardissuer.dto.CardIssuerDtos.UpdateCardIssuerRequest;
import com.erp.accounting.account.Account;
import com.erp.accounting.account.AccountRepository;
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
    private final com.erp.accounting.paymentagency.PaymentAgencyRepository paymentAgencyRepository;
    /** 카드사를 거래처 코드도움에 내놓는 짝 거래처 — 원본 견적 11/05-2 의 거래처가 카드사 00001 국민카드사다. */
    private final com.erp.trade.partner.PartnerService partnerService;

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
        linkPartner(c);
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
        linkPartner(c);
        return CardIssuerResponse.from(c);
    }

    @Transactional
    public void delete(Long id) {
        CardIssuer c = get(id);
        com.erp.trade.partner.BusinessPartner linked = c.getPartner();
        repository.delete(c);
        repository.flush();
        partnerService.retireLinked(linked);
    }

    private void linkPartner(CardIssuer c) {
        c.setPartner(partnerService.syncLinked(c.getPartner(), com.erp.trade.partner.PartnerService.LINKED_CARD_ISSUER,
                c.getCode(), c.getName(), c.getSearchKeyword(), c.isActive()));
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

    /**
     * 신규 창에 미리 채우는 다음 코드(2026-10-21 loginaa 카드사등록 실측: 00001 · 00002 뒤 신규 창 00022, 저장하면 다음 신규 00023,
     * 지우면 다시 00022 — 지금 있는 숫자 코드 가운데 가장 큰 것 + 1, 다섯 자리). 원본은 카드사 · 결제대행사 · 거래처가 한 이름공간이라
     * 00021 은 다른 쪽 코드다 — 우리는 카드사 · 결제대행사 코드를 같이 본다(거래처는 아직 따로).
     */
    @Transactional(readOnly = true)
    public String nextCode() {
        int max = java.util.stream.Stream.concat(
                        repository.findAll().stream().map(CardIssuer::getCode),
                        paymentAgencyRepository.findAll().stream().map(com.erp.accounting.paymentagency.PaymentAgency::getCode))
                .filter(c -> c != null && c.matches("\\d{1,9}"))
                .mapToInt(Integer::parseInt).max().orElse(0);
        return String.format("%05d", max + 1);
    }

    private String generateCode() {
        return nextCode();
    }
}
