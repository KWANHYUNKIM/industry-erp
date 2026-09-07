package com.erp.trade.dto;

import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.domain.PartnerType;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class PartnerDtos {

    private PartnerDtos() {}

    public record CreatePartnerRequest(
            @Size(max = 50, message = "거래처코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "거래처코드를 입력하세요.") String code,
            @Size(max = 200, message = "상호는 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "상호를 입력하세요.") String name,
            @NotNull(message = "거래처 구분을 선택하세요.") PartnerType type,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String bizRegNo,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String ceoName,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bizType,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bizItem,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String manager,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String phone,
            /** 모바일. 원본 거래처리스트의 열 — 전화와 따로다. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String mobile,
            /** 원본 거래처관리대장 I 머리말의 Email. */
            @Size(max = 150, message = "입력한 글자가 너무 깁니다. 150자까지 넣을 수 있습니다.")
            String email,
            /** 원본 거래처관리대장 I 머리말의 Fax. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String fax,
            /** 원본 거래처관리대장 I 머리말의 여신한도. 안 주면 0. */
            java.math.BigDecimal creditLimit,
            /** 이체정보 — 지급할 때 쓸 계좌. 원본 [이체정보] 열. */
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bankName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String accountNo,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String accountHolder,
            /** 우편번호. 원본 [기본] 탭의 [주소1 우편번호]. */
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String postalCode,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String address,
            /**
             * 그룹 (선택). 엔티티에는 관계가 있는데 <b>요청에만 빠져 있어</b> 아무도 그룹을
             * 지정할 수 없었다 — 그래서 채권/채무현황의 거래처그룹 소계가 늘 '(미지정)' 하나였고,
             * 특별단가의 '그룹별' 도 걸릴 일이 없었다.
             */
            /**
             * 단가그룹 — 원본 거래처등록 [여신/단가] 탭. 특별단가등록의 '그룹별' 이 이 값을 본다.
             *
             * <p>엔티티와 응답에는 진작 있었는데 <b>등록·수정 요청에만 빠져 있어</b>
             * 화면에서는 정할 수가 없었다. 따로 있는 PATCH /partners/{id}/price-group 을
             * 직접 부르지 않으면 늘 비어 있었고, 그래서 그룹별 특별단가가 걸릴 일이 없었다.
             */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String salesPriceGroup,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String purchasePriceGroup,
            /** 원본 거래처검색·거래처리스트의 [검색창내용]. 부르는 이름으로 찾게 한다. */
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String searchKeyword,
            /** 원본 [거래처코드구분] — 사업자등록번호 · 주민등록번호 · 외국인. 안 주면 사업자등록번호. */
            String regNoKind,
            /** 원본 [업종별구분] — 일반 · 관세사 · 외화거래처. 안 주면 일반. */
            String industryKind,
            /**
             * 원본 의료기기공급내역보고의 <b>[공급형태]</b> — 이 거래처가 <b>어떤 곳인지</b>.
             * '제조, 수입, 판매' · '의료기관' · '약국개설자, 의약품도매상' ·
             * '견본품, 기부용, 군납용' (원본 실측). 안 정할 수도 있다 — 의료기기를 안 다루는
             * 회사에는 없는 개념이다.
             */
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String udiSupplyShape,
            /** 원본 [종사업장번호]. */
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String subBizNo,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String postalCode2,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String address2,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String homepage,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark,
            /** 원본 [세무신고거래처]. 안 주면 대상. */
            Boolean taxReport,
            /** 원본 [출하대상거래처]. 안 주면 대상. */
            Boolean shipmentTarget,
            /**
             * 원본 [관계설정]의 대표거래처 (선택). 이 거래처가 어느 회사의 지점·사업장이면
             * 그 회사를 가리킨다. 거래처관리대장의 [대표거래처로 합산]이 이걸 쓴다.
             */
            Long parentId,
            Long partnerGroupId,
            /* 원본 거래처등록 폼의 나머지 칸들. */
            Boolean foreignCurrency,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String salesTaxType,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String purchaseTaxType,
            @PositiveOrZero(message = "여신기간은 0 이상이어야 합니다.") Integer creditDays,
            @PositiveOrZero(message = "수금/지급예정일은 0 이상이어야 합니다.")
            @Max(value = 31, message = "수금/지급예정일은 31일까지입니다.") Integer settleDueDay,
            Boolean arNoManaged,
            Boolean apNoManaged
    ) {}

    public record UpdatePartnerRequest(
            @Size(max = 200, message = "상호는 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "상호를 입력하세요.") String name,
            @NotNull(message = "거래처 구분을 선택하세요.") PartnerType type,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String bizRegNo,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String ceoName,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bizType,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bizItem,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String manager,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String phone,
            /** 모바일. 원본 거래처리스트의 열 — 전화와 따로다. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String mobile,
            /** 원본 거래처관리대장 I 머리말의 Email. */
            @Size(max = 150, message = "입력한 글자가 너무 깁니다. 150자까지 넣을 수 있습니다.")
            String email,
            /** 원본 거래처관리대장 I 머리말의 Fax. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String fax,
            /** 원본 거래처관리대장 I 머리말의 여신한도. 안 주면 0. */
            java.math.BigDecimal creditLimit,
            /** 이체정보 — 지급할 때 쓸 계좌. 원본 [이체정보] 열. */
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String bankName,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String accountNo,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String accountHolder,
            /** 우편번호. 원본 [기본] 탭의 [주소1 우편번호]. */
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String postalCode,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String address,
            /** 그룹 (선택). 자세한 설명은 CreatePartnerRequest 쪽에 있다. */
            /**
             * 단가그룹 — 원본 거래처등록 [여신/단가] 탭. 특별단가등록의 '그룹별' 이 이 값을 본다.
             *
             * <p>엔티티와 응답에는 진작 있었는데 <b>등록·수정 요청에만 빠져 있어</b>
             * 화면에서는 정할 수가 없었다. 따로 있는 PATCH /partners/{id}/price-group 을
             * 직접 부르지 않으면 늘 비어 있었고, 그래서 그룹별 특별단가가 걸릴 일이 없었다.
             */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String salesPriceGroup,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String purchasePriceGroup,
            /** 원본 거래처검색·거래처리스트의 [검색창내용]. 부르는 이름으로 찾게 한다. */
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String searchKeyword,
            /** 원본 [거래처코드구분] — 사업자등록번호 · 주민등록번호 · 외국인. 안 주면 사업자등록번호. */
            String regNoKind,
            /** 원본 [업종별구분] — 일반 · 관세사 · 외화거래처. 안 주면 일반. */
            String industryKind,
            /**
             * 원본 의료기기공급내역보고의 <b>[공급형태]</b> — 이 거래처가 <b>어떤 곳인지</b>.
             * '제조, 수입, 판매' · '의료기관' · '약국개설자, 의약품도매상' ·
             * '견본품, 기부용, 군납용' (원본 실측). 안 정할 수도 있다 — 의료기기를 안 다루는
             * 회사에는 없는 개념이다.
             */
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String udiSupplyShape,
            /** 원본 [종사업장번호]. */
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String subBizNo,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String postalCode2,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String address2,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String homepage,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark,
            /** 원본 [세무신고거래처]. 안 주면 대상. */
            Boolean taxReport,
            /** 원본 [출하대상거래처]. 안 주면 대상. */
            Boolean shipmentTarget,
            /**
             * 원본 [관계설정]의 대표거래처 (선택). 이 거래처가 어느 회사의 지점·사업장이면
             * 그 회사를 가리킨다. 거래처관리대장의 [대표거래처로 합산]이 이걸 쓴다.
             */
            Long parentId,
            Long partnerGroupId,
            Boolean active,
            /* 원본 거래처등록 폼의 나머지 칸들. */
            Boolean foreignCurrency,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String salesTaxType,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String purchaseTaxType,
            @PositiveOrZero(message = "여신기간은 0 이상이어야 합니다.") Integer creditDays,
            @PositiveOrZero(message = "수금/지급예정일은 0 이상이어야 합니다.")
            @Max(value = 31, message = "수금/지급예정일은 31일까지입니다.") Integer settleDueDay,
            Boolean arNoManaged,
            Boolean apNoManaged
    ) {}

    public record UpdatePriceGroupRequest(
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String salesPriceGroup,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String purchasePriceGroup
    ) {}

    public record PartnerResponse(
            Long id,
            String code,
            String name,
            PartnerType type,
            String typeName,
            String bizRegNo,
            String ceoName,
            String bizType,
            String bizItem,
            String manager,
            String phone,
            /** 모바일. 원본 거래처리스트의 열 — 전화와 따로다. */
            String mobile,
            /** 원본 거래처관리대장 I 머리말의 Email. */
            String email,
            /** 원본 거래처관리대장 I 머리말의 Fax. */
            String fax,
            /** 원본 거래처관리대장 I 머리말의 여신한도. 안 주면 0. */
            java.math.BigDecimal creditLimit,
            /** 이체정보 — 지급할 때 쓸 계좌. 원본 [이체정보] 열. */
            String bankName,
            String accountNo,
            String accountHolder,
            /** 우편번호. 원본 [기본] 탭의 [주소1 우편번호]. */
            String postalCode,
            String address,
            String salesPriceGroup,
            String purchasePriceGroup,
            String searchKeyword,
            String regNoKind,
            String industryKind,
            /** 원본 의료기기공급내역보고의 [공급형태]. 안 정했으면 null. */
            String udiSupplyShape,
            String subBizNo,
            String postalCode2,
            String address2,
            String homepage,
            String remark,
            boolean taxReport,
            boolean shipmentTarget,
            /** 원본 [관계설정]의 대표거래처. 미지정이면 자기가 곧 대표다. */
            Long parentId,
            String parentName,
            Long partnerGroupId,
            String partnerGroupName,
            boolean active,
            /**
             * 원본 거래처등록 조건의 <b>[최초작성일자]·[최종수정일자]</b>.
             * BaseTimeEntity 가 진작 들고 있는데 응답에 안 실어 <b>언제 만든 거래처인지</b>를
             * 화면에서 알 수가 없었다 — 새로 딴 거래처만 골라 보려면 코드를 외워야 했다.
             */
            java.time.LocalDate createdDate,
            java.time.LocalDate updatedDate,
            /* 원본 거래처등록 폼의 나머지 칸들. */
            boolean foreignCurrency, String salesTaxType, String purchaseTaxType,
            Integer creditDays, Integer settleDueDay,
            boolean arNoManaged, boolean apNoManaged
    ) {
        public static PartnerResponse from(BusinessPartner p) {
            return new PartnerResponse(
                    p.getId(), p.getCode(), p.getName(), p.getType(), p.getType().getDisplayName(),
                    p.getBizRegNo(), p.getCeoName(), p.getBizType(), p.getBizItem(),
                    p.getManager(), p.getPhone(),
                    p.getMobile(), p.getEmail(), p.getFax(), p.getCreditLimit(),
                    p.getBankName(), p.getAccountNo(), p.getAccountHolder(),
                    p.getPostalCode(), p.getAddress(),
                    p.getSalesPriceGroup(), p.getPurchasePriceGroup(), p.getSearchKeyword(),
                    p.getRegNoKind(), p.getIndustryKind(), p.getUdiSupplyShape(), p.getSubBizNo(),
                    p.getPostalCode2(), p.getAddress2(), p.getHomepage(), p.getRemark(),
                    p.isTaxReport(), p.isShipmentTarget(),
                    p.getParent() != null ? p.getParent().getId() : null,
                    p.getParent() != null ? p.getParent().getName() : null,
                    p.getPartnerGroup() != null ? p.getPartnerGroup().getId() : null,
                    p.getPartnerGroup() != null ? p.getPartnerGroup().getName() : null,
                    p.isActive(),
                    p.getCreatedAt() != null ? p.getCreatedAt().toLocalDate() : null,
                    p.getUpdatedAt() != null ? p.getUpdatedAt().toLocalDate() : null,
                    p.isForeignCurrency(), p.getSalesTaxType(), p.getPurchaseTaxType(),
                    p.getCreditDays(), p.getSettleDueDay(),
                    p.isArNoManaged(), p.isApNoManaged());
        }
    }
}
