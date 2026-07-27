package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.trade.domain.MallAccount;
import com.erp.trade.dto.MallAccountDtos.CreateMallAccountRequest;
import com.erp.trade.dto.MallAccountDtos.MallAccountResponse;
import com.erp.trade.dto.MallAccountDtos.UpdateMallAccountRequest;
import com.erp.trade.repository.MallAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/** 쇼핑몰 등록(C000664) CRUD. 수집·품목코드연결의 몰 선택지 + 판매전환 기본 거래처. */
@Service
@RequiredArgsConstructor
public class MallAccountService {

    private final MallAccountRepository repository;
    private final PartnerService partnerService;   // 같은 모듈(trade)

    @Transactional(readOnly = true)
    public List<MallAccountResponse> findAll() {
        return repository.findAllWithPartner().stream().map(MallAccountResponse::from).toList();
    }

    @Transactional
    public MallAccountResponse create(CreateMallAccountRequest req) {
        String code = StringUtils.hasText(req.code()) ? req.code().trim() : generateCode();
        if (repository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 쇼핑몰코드입니다: " + code);
        }
        MallAccount a = MallAccount.builder()
                .code(code)
                .name(req.name().trim())
                .type(req.type())
                .partner(req.partnerId() != null ? partnerService.get(req.partnerId()) : null)
                .sellerId(req.sellerId())
                .memo(req.memo())
                .active(true)
                .build();
        return MallAccountResponse.from(repository.save(a));
    }

    @Transactional
    public MallAccountResponse update(Long id, UpdateMallAccountRequest req) {
        MallAccount a = get(id);
        a.setName(req.name().trim());
        a.setType(req.type());
        a.setPartner(req.partnerId() != null ? partnerService.get(req.partnerId()) : null);
        a.setSellerId(req.sellerId());
        a.setMemo(req.memo());
        if (req.active() != null) {
            a.setActive(req.active());
        }
        return MallAccountResponse.from(a);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private MallAccount get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("쇼핑몰을 찾을 수 없습니다. id=" + id));
    }

    private String generateCode() {
        return "MA" + String.format("%03d", repository.countByCodeStartingWith("MA") + 1);
    }
}
