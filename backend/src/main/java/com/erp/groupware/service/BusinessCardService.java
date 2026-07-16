package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.BusinessCard;
import com.erp.groupware.dto.BusinessCardDtos.CardResponse;
import com.erp.groupware.dto.BusinessCardDtos.CreateCardRequest;
import com.erp.groupware.repository.BusinessCardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.auth.service.UserService;
import com.erp.groupware.dto.BusinessCardDtos;
import com.erp.trade.service.PartnerService;

/** 명함관리. 거래처 담당자 연락처를 사람이 아니라 회사 자산으로 남긴다. */
@Service
@RequiredArgsConstructor
public class BusinessCardService {

    private final BusinessCardRepository cardRepository;
    private final PartnerService partnerService;
    private final UserService userService;

    @Transactional(readOnly = true)
    public List<CardResponse> findAll() {
        return cardRepository.findAllWithRefs().stream()
                .map(CardResponse::from)
                .toList();
    }

    @Transactional
    public CardResponse create(CreateCardRequest req) {
        BusinessCard c = BusinessCard.builder()
                .name(req.name().trim())
                .partner(req.partnerId() != null ? partnerService.get(req.partnerId()) : null)
                .companyName(emptyToNull(req.companyName()))
                .department(emptyToNull(req.department()))
                .jobTitle(emptyToNull(req.jobTitle()))
                .phone(emptyToNull(req.phone()))
                .mobile(emptyToNull(req.mobile()))
                .email(emptyToNull(req.email()))
                .address(emptyToNull(req.address()))
                .owner(req.ownerUserId() != null ? userService.get(req.ownerUserId()) : null)
                .tags(joinTags(req.tags()))
                .memo(emptyToNull(req.memo()))
                .build();
        validate(c);
        return CardResponse.from(cardRepository.save(c));
    }

    @Transactional
    public CardResponse update(Long id, CreateCardRequest req) {
        BusinessCard c = get(id);
        c.setName(req.name().trim());
        c.setPartner(req.partnerId() != null ? partnerService.get(req.partnerId()) : null);
        c.setCompanyName(emptyToNull(req.companyName()));
        c.setDepartment(emptyToNull(req.department()));
        c.setJobTitle(emptyToNull(req.jobTitle()));
        c.setPhone(emptyToNull(req.phone()));
        c.setMobile(emptyToNull(req.mobile()));
        c.setEmail(emptyToNull(req.email()));
        c.setAddress(emptyToNull(req.address()));
        c.setOwner(req.ownerUserId() != null ? userService.get(req.ownerUserId()) : null);
        c.setTags(joinTags(req.tags()));
        c.setMemo(emptyToNull(req.memo()));
        validate(c);
        return CardResponse.from(c);
    }

    @Transactional
    public void delete(Long id) {
        cardRepository.delete(get(id));
    }

    /**
     * 소속을 알 수 없는 명함은 연락처부에서 쓸모가 없다.
     * 거래처를 연결하거나(등록된 거래처) 회사명을 직접 적어야 한다.
     */
    private void validate(BusinessCard c) {
        if (c.getPartner() == null && (c.getCompanyName() == null)) {
            throw ApiException.badRequest("거래처를 선택하거나 회사명을 입력하세요.");
        }
        if (c.getEmail() != null && !c.getEmail().contains("@")) {
            throw ApiException.badRequest("이메일 형식이 올바르지 않습니다: " + c.getEmail());
        }
    }

    private BusinessCard get(Long id) {
        return cardRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("명함을 찾을 수 없습니다. id=" + id));
    }

    private String joinTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) return null;
        String joined = tags.stream().map(String::trim).filter(s -> !s.isEmpty())
                .distinct()
                .reduce((a, b) -> a + "," + b)
                .orElse(null);
        return emptyToNull(joined);
    }

    private String emptyToNull(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }
}
