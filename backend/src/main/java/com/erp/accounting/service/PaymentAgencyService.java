package com.erp.accounting.service;

import com.erp.accounting.domain.PaymentAgency;
import com.erp.accounting.dto.PaymentAgencyDtos.CreatePaymentAgencyRequest;
import com.erp.accounting.dto.PaymentAgencyDtos.PaymentAgencyResponse;
import com.erp.accounting.dto.PaymentAgencyDtos.UpdatePaymentAgencyRequest;
import com.erp.accounting.repository.PaymentAgencyRepository;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/** 결제대행사(PG) 마스터(E010114) CRUD. */
@Service
@RequiredArgsConstructor
public class PaymentAgencyService {

    private final PaymentAgencyRepository repository;

    @Transactional(readOnly = true)
    public List<PaymentAgencyResponse> findAll() {
        return repository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(PaymentAgencyResponse::from).toList();
    }

    @Transactional
    public PaymentAgencyResponse create(CreatePaymentAgencyRequest req) {
        String code = StringUtils.hasText(req.code()) ? req.code().trim() : generateCode();
        if (repository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 결제대행사코드입니다: " + code);
        }
        PaymentAgency p = PaymentAgency.builder()
                .code(code)
                .name(req.name())
                .ceoName(req.ceoName())
                .phone(req.phone())
                .email(req.email())
                .remark(req.remark())
                .active(true)
                .build();
        return PaymentAgencyResponse.from(repository.save(p));
    }

    @Transactional
    public PaymentAgencyResponse update(Long id, UpdatePaymentAgencyRequest req) {
        PaymentAgency p = get(id);
        p.setName(req.name());
        p.setCeoName(req.ceoName());
        p.setPhone(req.phone());
        p.setEmail(req.email());
        p.setRemark(req.remark());
        if (req.active() != null) {
            p.setActive(req.active());
        }
        return PaymentAgencyResponse.from(p);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private PaymentAgency get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("결제대행사를 찾을 수 없습니다. id=" + id));
    }

    private String generateCode() {
        return "PA" + String.format("%03d", repository.countByCodeStartingWith("PA") + 1);
    }
}
