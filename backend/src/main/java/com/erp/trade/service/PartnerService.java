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

    /** 원본 [거래처코드구분]. */
    private static final List<String> REG_NO_KINDS =
            List.of("사업자등록번호", "주민등록번호", "외국인");
    /** 원본 [업종별구분]. */
    private static final List<String> INDUSTRY_KINDS =
            List.of("일반", "관세사", "외화거래처");

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
        String regNoKind = oneOf(req.regNoKind(), REG_NO_KINDS, "사업자등록번호", "거래처코드구분");
        BusinessPartner p = BusinessPartner.builder()
                .code(req.code())
                .name(req.name())
                .type(req.type())
                .bizRegNo(requireValidRegNo(regNoKind, req.bizRegNo()))
                .regNoKind(regNoKind)
                .industryKind(oneOf(req.industryKind(), INDUSTRY_KINDS, "일반", "업종별구분"))
                .subBizNo(emptyToNull(req.subBizNo()))
                .postalCode2(emptyToNull(req.postalCode2()))
                .address2(emptyToNull(req.address2()))
                .homepage(emptyToNull(req.homepage()))
                .remark(emptyToNull(req.remark()))
                .taxReport(req.taxReport() == null || req.taxReport())
                .shipmentTarget(req.shipmentTarget() == null || req.shipmentTarget())
                .ceoName(req.ceoName())
                .bizType(req.bizType())
                .bizItem(req.bizItem())
                .manager(req.manager())
                .phone(req.phone())
                .mobile(req.mobile())
                .bankName(req.bankName())
                .accountNo(req.accountNo())
                .accountHolder(req.accountHolder())
                .postalCode(req.postalCode())
                .salesPriceGroup(emptyToNull(req.salesPriceGroup()))
                .purchasePriceGroup(emptyToNull(req.purchasePriceGroup()))
                .searchKeyword(emptyToNull(req.searchKeyword()))
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
        String regNoKind = oneOf(req.regNoKind(), REG_NO_KINDS, "사업자등록번호", "거래처코드구분");
        p.setRegNoKind(regNoKind);
        p.setBizRegNo(requireValidRegNo(regNoKind, req.bizRegNo()));
        p.setIndustryKind(oneOf(req.industryKind(), INDUSTRY_KINDS, "일반", "업종별구분"));
        p.setSubBizNo(emptyToNull(req.subBizNo()));
        p.setPostalCode2(emptyToNull(req.postalCode2()));
        p.setAddress2(emptyToNull(req.address2()));
        p.setHomepage(emptyToNull(req.homepage()));
        p.setRemark(emptyToNull(req.remark()));
        if (req.taxReport() != null) p.setTaxReport(req.taxReport());
        if (req.shipmentTarget() != null) p.setShipmentTarget(req.shipmentTarget());
        p.setCeoName(req.ceoName());
        p.setBizType(req.bizType());
        p.setBizItem(req.bizItem());
        p.setManager(req.manager());
        p.setPhone(req.phone());
        p.setMobile(req.mobile());
        p.setBankName(req.bankName());
        p.setAccountNo(req.accountNo());
        p.setAccountHolder(req.accountHolder());
        p.setPostalCode(req.postalCode());
        p.setSalesPriceGroup(emptyToNull(req.salesPriceGroup()));
        p.setPurchasePriceGroup(emptyToNull(req.purchasePriceGroup()));
        p.setSearchKeyword(emptyToNull(req.searchKeyword()));
        p.setAddress(req.address());
        p.setPartnerGroup(groupOf(req.partnerGroupId()));
        if (req.active() != null) {
            p.setActive(req.active());
        }
        return PartnerResponse.from(p);
    }

    private static String oneOf(String v, List<String> allowed, String fallback, String what) {
        if (v == null || v.isBlank()) return fallback;
        String t = v.trim();
        if (!allowed.contains(t)) {
            throw ApiException.badRequest(
                    what + "은(는) " + String.join(" · ", allowed) + " 중 하나여야 합니다: " + t);
        }
        return t;
    }

    /**
     * 등록번호는 <b>거래처코드구분</b>에 따라 자릿수가 다르다.
     *
     * <p>세금계산서에 그대로 찍히는 값이라 틀린 채로 들어가면 발행하고 나서야 안다.
     * 지금까지 우리는 아무 글자나 받았다. 외국인은 나라마다 형식이 달라 검사하지 않는다 —
     * 검사할 규칙이 없는데 막으면 넣을 방법이 없어진다.
     */
    private static String requireValidRegNo(String regNoKind, String raw) {
        String v = emptyToNull(raw);
        if (v == null || "외국인".equals(regNoKind)) return v;
        String digits = v.replaceAll("[^0-9]", "");
        int need = "주민등록번호".equals(regNoKind) ? 13 : 10;
        if (digits.length() != need) {
            throw ApiException.badRequest(
                    regNoKind + "는 숫자 " + need + "자리여야 합니다: " + v
                            + " (" + digits.length() + "자리)");
        }
        return v;
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

    private static String emptyToNull(String v) {
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
