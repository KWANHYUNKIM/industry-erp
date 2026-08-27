package com.erp.trade.dto;

import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.domain.PartnerType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class PartnerDtos {

    private PartnerDtos() {}

    public record CreatePartnerRequest(
            @NotBlank(message = "거래처코드를 입력하세요.") String code,
            @NotBlank(message = "상호를 입력하세요.") String name,
            @NotNull(message = "거래처 구분을 선택하세요.") PartnerType type,
            String bizRegNo,
            String ceoName,
            String bizType,
            String bizItem,
            String manager,
            String phone,
            /** 모바일. 원본 거래처리스트의 열 — 전화와 따로다. */
            String mobile,
            /** 이체정보 — 지급할 때 쓸 계좌. 원본 [이체정보] 열. */
            String bankName,
            String accountNo,
            String accountHolder,
            /** 우편번호. 원본 [기본] 탭의 [주소1 우편번호]. */
            String postalCode,
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
            String salesPriceGroup,
            String purchasePriceGroup,
            /** 원본 거래처검색·거래처리스트의 [검색창내용]. 부르는 이름으로 찾게 한다. */
            String searchKeyword,
            Long partnerGroupId
    ) {}

    public record UpdatePartnerRequest(
            @NotBlank(message = "상호를 입력하세요.") String name,
            @NotNull(message = "거래처 구분을 선택하세요.") PartnerType type,
            String bizRegNo,
            String ceoName,
            String bizType,
            String bizItem,
            String manager,
            String phone,
            /** 모바일. 원본 거래처리스트의 열 — 전화와 따로다. */
            String mobile,
            /** 이체정보 — 지급할 때 쓸 계좌. 원본 [이체정보] 열. */
            String bankName,
            String accountNo,
            String accountHolder,
            /** 우편번호. 원본 [기본] 탭의 [주소1 우편번호]. */
            String postalCode,
            String address,
            /** 그룹 (선택). 자세한 설명은 CreatePartnerRequest 쪽에 있다. */
            /**
             * 단가그룹 — 원본 거래처등록 [여신/단가] 탭. 특별단가등록의 '그룹별' 이 이 값을 본다.
             *
             * <p>엔티티와 응답에는 진작 있었는데 <b>등록·수정 요청에만 빠져 있어</b>
             * 화면에서는 정할 수가 없었다. 따로 있는 PATCH /partners/{id}/price-group 을
             * 직접 부르지 않으면 늘 비어 있었고, 그래서 그룹별 특별단가가 걸릴 일이 없었다.
             */
            String salesPriceGroup,
            String purchasePriceGroup,
            /** 원본 거래처검색·거래처리스트의 [검색창내용]. 부르는 이름으로 찾게 한다. */
            String searchKeyword,
            Long partnerGroupId,
            Boolean active
    ) {}

    public record UpdatePriceGroupRequest(
            String salesPriceGroup,
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
            Long partnerGroupId,
            String partnerGroupName,
            boolean active
    ) {
        public static PartnerResponse from(BusinessPartner p) {
            return new PartnerResponse(
                    p.getId(), p.getCode(), p.getName(), p.getType(), p.getType().getDisplayName(),
                    p.getBizRegNo(), p.getCeoName(), p.getBizType(), p.getBizItem(),
                    p.getManager(), p.getPhone(),
                    p.getMobile(), p.getBankName(), p.getAccountNo(), p.getAccountHolder(),
                    p.getPostalCode(), p.getAddress(),
                    p.getSalesPriceGroup(), p.getPurchasePriceGroup(), p.getSearchKeyword(),
                    p.getPartnerGroup() != null ? p.getPartnerGroup().getId() : null,
                    p.getPartnerGroup() != null ? p.getPartnerGroup().getName() : null,
                    p.isActive());
        }
    }
}
