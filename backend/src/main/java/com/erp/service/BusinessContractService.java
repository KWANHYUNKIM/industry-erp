package com.erp.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.domain.BusinessContract;
import com.erp.domain.enums.BusinessContractStatus;
import com.erp.dto.BusinessContractDtos.ContractResponse;
import com.erp.dto.BusinessContractDtos.CreateContractRequest;
import com.erp.dto.BusinessContractDtos.SignRequest;
import com.erp.dto.BusinessContractDtos.TerminateRequest;
import com.erp.repository.BusinessContractRepository;
import com.erp.repository.BusinessPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 회계 II > 계약관리 · 전자계약.
 * 작성 → 서명요청 → 전자서명(서명자·서명일시·동의문구 기록) → (해지).
 * 서명이 끝난 계약만 유효한 계약으로 보고, 해지된 계약은 되돌리지 않는다.
 */
@Service
@RequiredArgsConstructor
public class BusinessContractService {

    private final BusinessContractRepository contractRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<ContractResponse> findAll() {
        LocalDate today = LocalDate.now();
        return contractRepository.findAllWithPartner().stream()
                .map(c -> ContractResponse.from(c, today))
                .toList();
    }

    @Transactional
    public ContractResponse create(CreateContractRequest req, String username) {
        if (req.endDate().isBefore(req.startDate())) {
            throw ApiException.badRequest("계약 종료일이 시작일보다 빠를 수 없습니다.");
        }
        BusinessContract c = BusinessContract.builder()
                .contractNo(docNoGenerator.next("CT-", "business_contracts", "contract_no", "start_date", req.startDate()))
                .title(req.title())
                .type(req.type())
                .status(BusinessContractStatus.DRAFT)
                .partner(partnerRepository.findById(req.partnerId())
                        .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())))
                .startDate(req.startDate())
                .endDate(req.endDate())
                .amount(req.amount())
                .paymentTerms(req.paymentTerms())
                .content(req.content())
                .createdBy(username)
                .build();
        return ContractResponse.from(contractRepository.save(c), LocalDate.now());
    }

    /** 상대에게 서명을 요청한다 (작성 상태에서만) */
    @Transactional
    public ContractResponse send(Long id) {
        BusinessContract c = contract(id);
        requireStatus(c, BusinessContractStatus.DRAFT, "서명요청");
        c.setStatus(BusinessContractStatus.SENT);
        c.setSentAt(LocalDateTime.now());
        return ContractResponse.from(c, LocalDate.now());
    }

    /** 전자서명 — 서명요청된 계약에만 서명할 수 있다 */
    @Transactional
    public ContractResponse sign(Long id, SignRequest req) {
        BusinessContract c = contract(id);
        requireStatus(c, BusinessContractStatus.SENT, "서명");
        c.setStatus(BusinessContractStatus.SIGNED);
        c.setSignerName(req.signerName());
        c.setAgreement(req.agreement());
        c.setSignedAt(LocalDateTime.now());
        return ContractResponse.from(c, LocalDate.now());
    }

    /** 해지 — 서명완료된 계약만 해지할 수 있다(작성/요청 중인 계약은 그냥 두면 된다) */
    @Transactional
    public ContractResponse terminate(Long id, TerminateRequest req) {
        BusinessContract c = contract(id);
        requireStatus(c, BusinessContractStatus.SIGNED, "해지");
        c.setStatus(BusinessContractStatus.TERMINATED);
        c.setTerminatedDate(req.terminatedDate() != null ? req.terminatedDate() : LocalDate.now());
        c.setTerminationReason(req.reason());
        return ContractResponse.from(c, LocalDate.now());
    }

    private void requireStatus(BusinessContract c, BusinessContractStatus expected, String action) {
        if (c.getStatus() != expected) {
            throw ApiException.conflict(action + "할 수 없는 상태입니다: " + c.getContractNo()
                    + " (현재 " + c.getStatus().getDisplayName() + ", " + expected.getDisplayName() + " 상태에서만 가능)");
        }
    }

    private BusinessContract contract(Long id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계약을 찾을 수 없습니다. id=" + id));
    }
}
