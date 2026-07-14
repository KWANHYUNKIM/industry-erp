package com.erp.dto;

import com.erp.domain.BusinessCard;
import jakarta.validation.constraints.NotBlank;

import java.util.List;

public class BusinessCardDtos {

    public record CreateCardRequest(
            @NotBlank(message = "이름을 입력하세요.") String name,
            Long partnerId,
            String companyName,
            String department,
            String jobTitle,
            String phone,
            String mobile,
            String email,
            String address,
            Long ownerUserId,
            List<String> tags,
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
