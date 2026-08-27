package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.domain.PartnerGroup;
import com.erp.trade.dto.PartnerDtos.CreatePartnerRequest;
import com.erp.trade.dto.PartnerDtos.PartnerResponse;
import com.erp.trade.dto.PartnerDtos.UpdatePartnerRequest;
import com.erp.trade.dto.PartnerDtos.UpdatePriceGroupRequest;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.PartnerGroupRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.trade.dto.PartnerDtos;

@Service
@RequiredArgsConstructor
public class PartnerService {

    private final BusinessPartnerRepository partnerRepository;
    private final PartnerGroupRepository partnerGroupRepository;

    @Transactional(readOnly = true)
    public List<PartnerResponse> findAll() {
        return partnerRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(PartnerResponse::from)
                .toList();
    }

    @Transactional
    public PartnerResponse create(CreatePartnerRequest req) {
        if (partnerRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 거래처코드입니다: " + req.code());
        }
        BusinessPartner p = BusinessPartner.builder()
                .code(req.code())
                .name(req.name())
                .type(req.type())
                .bizRegNo(req.bizRegNo())
                .ceoName(req.ceoName())
                .bizType(req.bizType())
                .bizItem(req.bizItem())
                .manager(req.manager())
                .phone(req.phone())
                .mobile(req.mobile())
                .bankName(req.bankName())
                .accountNo(req.accountNo())
                .accountHolder(req.accountHolder())
                .address(req.address())
                .partnerGroup(groupOf(req.partnerGroupId()))
                .active(true)
                .build();
        return PartnerResponse.from(partnerRepository.save(p));
    }

    @Transactional
    public PartnerResponse update(Long id, UpdatePartnerRequest req) {
        BusinessPartner p = getPartner(id);
        p.setName(req.name());
        p.setType(req.type());
        p.setBizRegNo(req.bizRegNo());
        p.setCeoName(req.ceoName());
        p.setBizType(req.bizType());
        p.setBizItem(req.bizItem());
        p.setManager(req.manager());
        p.setPhone(req.phone());
        p.setMobile(req.mobile());
        p.setBankName(req.bankName());
        p.setAccountNo(req.accountNo());
        p.setAccountHolder(req.accountHolder());
        p.setAddress(req.address());
        p.setPartnerGroup(groupOf(req.partnerGroupId()));
        if (req.active() != null) {
            p.setActive(req.active());
        }
        return PartnerResponse.from(p);
    }

    @Transactional
    public PartnerResponse updatePriceGroup(Long id, UpdatePriceGroupRequest req) {
        BusinessPartner p = getPartner(id);
        p.setSalesPriceGroup(emptyToNull(req.salesPriceGroup()));
        p.setPurchasePriceGroup(emptyToNull(req.purchasePriceGroup()));
        return PartnerResponse.from(p);
    }

    @Transactional
    public void delete(Long id) {
        partnerRepository.delete(getPartner(id));
    }

    private String emptyToNull(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }

    /** 다른 서비스가 거래처 엔티티를 얻는 진입점 (리포지토리를 직접 주입하지 않도록). */
    @Transactional(readOnly = true)
    public BusinessPartner get(Long id) {
        return getPartner(id);
    }

    /** 거래처그룹. null 이면 그룹 없음 — 없는 id 를 주면 조용히 무시하지 않고 알린다. */
    private PartnerGroup groupOf(Long groupId) {
        if (groupId == null) return null;
        return partnerGroupRepository.findById(groupId)
                .orElseThrow(() -> ApiException.badRequest("거래처그룹을 찾을 수 없습니다. id=" + groupId));
    }

    private BusinessPartner getPartner(Long id) {
        return partnerRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + id));
    }

    /** 통합검색용. 부분일치 상위 limit 건과 총 건수. */
    @Transactional(readOnly = true)
    public List<PartnerResponse> search(String like, int limit) {
        return partnerRepository.searchTop(like, PageRequest.of(0, limit)).stream()
                .map(PartnerResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long searchCount(String like) {
        return partnerRepository.searchCount(like);
    }

}
