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
    /** 원본 [거래유형(영업)]·[거래유형(구매)]. 안 정할 수 있다 — 정하면 전표의 기본값이 된다. */
    private static final List<String> TAX_TYPES = List.of("과세", "면세");

    private static final List<String> INDUSTRY_KINDS =
            List.of("일반", "관세사", "외화거래처");
    /**
     * 원본 의료기기공급내역보고(UDI001M)의 <b>[공급형태]</b> — 공급받는 자가 어떤 곳인지.
     * 원본 화면에서 그대로 읽은 네 가지다. 쉼표까지 원본의 표기다 — 한 칸에 여러 형태를
     * 묶어 놓은 것이라 우리가 임의로 쪼개면 보고 서식의 값과 어긋난다.
     */
    private static final List<String> UDI_SUPPLY_SHAPES = List.of(
            "제조, 수입, 판매", "의료기관", "약국개설자, 의약품도매상", "견본품, 기부용, 군납용");

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
                .udiSupplyShape(oneOfOrNull(req.udiSupplyShape(), UDI_SUPPLY_SHAPES, "공급형태"))
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
                .email(emptyToNull(req.email()))
                .fax(emptyToNull(req.fax()))
                .creditLimit(req.creditLimit() != null ? req.creditLimit() : java.math.BigDecimal.ZERO)
                .bankName(req.bankName())
                .accountNo(req.accountNo())
                .accountHolder(req.accountHolder())
                .postalCode(req.postalCode())
                .salesPriceGroup(emptyToNull(req.salesPriceGroup()))
                .purchasePriceGroup(emptyToNull(req.purchasePriceGroup()))
                .searchKeyword(emptyToNull(req.searchKeyword()))
                .address(req.address())
                .partnerGroup(groupOf(req.partnerGroupId()))
                .parent(parentOf(req.parentId(), null))
                .foreignCurrency(Boolean.TRUE.equals(req.foreignCurrency()))
                .salesTaxType(oneOfOrNull(req.salesTaxType(), TAX_TYPES, "거래유형(영업)"))
                .purchaseTaxType(oneOfOrNull(req.purchaseTaxType(), TAX_TYPES, "거래유형(구매)"))
                .creditDays(req.creditDays() != null ? req.creditDays() : 0)
                .settleDueDay(req.settleDueDay() != null ? req.settleDueDay() : 0)
                .arNoManaged(Boolean.TRUE.equals(req.arNoManaged()))
                .apNoManaged(Boolean.TRUE.equals(req.apNoManaged()))
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
        p.setUdiSupplyShape(oneOfOrNull(req.udiSupplyShape(), UDI_SUPPLY_SHAPES, "공급형태"));
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
        p.setEmail(emptyToNull(req.email()));
        p.setFax(emptyToNull(req.fax()));
        p.setCreditLimit(req.creditLimit() != null ? req.creditLimit() : java.math.BigDecimal.ZERO);
        p.setBankName(req.bankName());
        p.setAccountNo(req.accountNo());
        p.setAccountHolder(req.accountHolder());
        p.setPostalCode(req.postalCode());
        p.setSalesPriceGroup(emptyToNull(req.salesPriceGroup()));
        p.setPurchasePriceGroup(emptyToNull(req.purchasePriceGroup()));
        p.setSearchKeyword(emptyToNull(req.searchKeyword()));
        p.setAddress(req.address());
        p.setPartnerGroup(groupOf(req.partnerGroupId()));
        p.setParent(parentOf(req.parentId(), p));
        p.setForeignCurrency(Boolean.TRUE.equals(req.foreignCurrency()));
        p.setSalesTaxType(oneOfOrNull(req.salesTaxType(), TAX_TYPES, "거래유형(영업)"));
        p.setPurchaseTaxType(oneOfOrNull(req.purchaseTaxType(), TAX_TYPES, "거래유형(구매)"));
        p.setCreditDays(req.creditDays() != null ? req.creditDays() : 0);
        p.setSettleDueDay(req.settleDueDay() != null ? req.settleDueDay() : 0);
        p.setArNoManaged(Boolean.TRUE.equals(req.arNoManaged()));
        p.setApNoManaged(Boolean.TRUE.equals(req.apNoManaged()));
        if (req.active() != null) {
            p.setActive(req.active());
        }
        return PartnerResponse.from(p);
    }

    /**
     * 안 정해도 되는 값. 비어 있으면 null 이고, 값이 있으면 <b>허용 목록 안이어야</b> 한다.
     * 아무 글자나 받으면 보고파일에 서식 밖의 값이 실려 나간다 — 내보내고 나서야 안다.
     */
    private static String oneOfOrNull(String v, List<String> allowed, String what) {
        if (v == null || v.isBlank()) return null;
        return oneOf(v, allowed, null, what);
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

    /**
     * 원본 [관계설정]의 <b>대표거래처</b>. null 이면 자기가 곧 대표다.
     *
     * <p>세 가지를 거절한다. 조용히 무시하면 거래처관리대장의 [대표거래처로 합산]이
     * <b>어떤 줄을 어디로 모을지 아무도 말할 수 없는 상태</b>가 된다.
     * <ul>
     *   <li>없는 거래처</li>
     *   <li>자기 자신 — 자기 밑으로 합산한다는 말이 성립하지 않는다</li>
     *   <li>이미 남의 종속인 거래처를 대표로 삼는 것 — 두 단계까지만 둔다.
     *       사슬을 허용하면 어디서 멈추는지가 읽는 사람마다 달라지고, 되돌아오면 무한루프다.</li>
     * </ul>
     *
     * @param self 수정 중인 거래처(등록이면 null). 자기 자신 검사에 쓴다.
     */
    private BusinessPartner parentOf(Long parentId, BusinessPartner self) {
        if (parentId == null) return null;
        if (self != null && parentId.equals(self.getId())) {
            throw ApiException.badRequest("자기 자신을 대표거래처로 둘 수 없습니다.");
        }
        BusinessPartner parent = partnerRepository.findById(parentId)
                .orElseThrow(() -> ApiException.badRequest("대표거래처를 찾을 수 없습니다. id=" + parentId));
        if (parent.getParent() != null) {
            throw ApiException.badRequest(
                    "대표거래처는 다시 다른 거래처에 딸릴 수 없습니다: "
                            + parent.getName() + " → " + parent.getParent().getName());
        }
        /*
         * 이 거래처를 대표로 삼고 있는 거래처가 있으면, 이 거래처는 남의 밑으로 갈 수 없다.
         * (대표 → 종속 → 종속 이 되어 위와 같은 사슬이 생긴다.)
         */
        if (self != null && partnerRepository.existsByParentId(self.getId())) {
            throw ApiException.badRequest(
                    "이 거래처를 대표로 삼는 거래처가 있어 다른 거래처에 딸릴 수 없습니다.");
        }
        return parent;
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
