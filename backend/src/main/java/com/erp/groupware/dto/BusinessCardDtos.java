package com.erp.groupware.dto;

import com.erp.groupware.domain.BusinessCard;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public class BusinessCardDtos {

    public record CreateCardRequest(
            @Size(max = 100, message = "이름은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "이름을 입력하세요.") String name,
            Long partnerId,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String companyName,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String department,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String jobTitle,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String phone,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String mobile,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String email,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String address,
            Long ownerUserId,
            List<String> tags,
            @Size(max = 1000, message = "입력한 글자가 너무 깁니다. 1000자까지 넣을 수 있습니다.")
            String memo
    ) {}

    public record CardResponse(
            Long id,
            String name,
            Long partnerId,
            String partnerName,
            String companyName,
            String department,
            String jobTitle,
            String phone,
            String mobile,
            String email,
            String address,
            Long ownerUserId,
            String ownerName,
            List<String> tags,
            String memo
    ) {
        public static CardResponse from(BusinessCard c) {
            return new CardResponse(
                    c.getId(), c.getName(),
                    c.getPartner() != null ? c.getPartner().getId() : null,
                    c.getPartner() != null ? c.getPartner().getName() : null,
                    // 거래처가 연결돼 있으면 그 상호가 회사명이다
                    c.getPartner() != null ? c.getPartner().getName() : c.getCompanyName(),
                    c.getDepartment(), c.getJobTitle(),
                    c.getPhone(), c.getMobile(), c.getEmail(), c.getAddress(),
                    c.getOwner() != null ? c.getOwner().getId() : null,
                    c.getOwner() != null ? c.getOwner().getName() : null,
                    splitTags(c.getTags()),
                    c.getMemo());
        }

        private static List<String> splitTags(String tags) {
            if (tags == null || tags.isBlank()) return List.of();
            return List.of(tags.split(",")).stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        }
    }
}
