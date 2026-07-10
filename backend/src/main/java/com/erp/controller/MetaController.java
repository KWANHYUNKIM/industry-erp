package com.erp.controller;

import com.erp.domain.ItemCategory;
import com.erp.domain.PartnerType;
import com.erp.domain.StockTransactionType;
import com.erp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 프론트 드롭다운용 코드/라벨 목록.
 */
@RestController
@RequestMapping("/api/meta")
@RequiredArgsConstructor
public class MetaController {

    private final UserRepository userRepository;

    /** 결재선/담당자 지정용 사용자 목록(활성 사용자, 최소 정보). 인증된 사용자면 조회 가능. */
    @GetMapping("/users")
    public List<Map<String, Object>> users() {
        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .filter(u -> u.isEnabled())
                .<Map<String, Object>>map(u -> Map.of(
                        "id", u.getId(),
                        "name", u.getName(),
                        "department", u.getDepartment() != null ? u.getDepartment() : ""))
                .toList();
    }

    @GetMapping("/item-categories")
    public List<Map<String, String>> itemCategories() {
        return Arrays.stream(ItemCategory.values())
                .map(c -> Map.of("code", c.name(), "name", c.getDisplayName()))
                .toList();
    }

    @GetMapping("/stock-transaction-types")
    public List<Map<String, String>> stockTransactionTypes() {
        return Arrays.stream(StockTransactionType.values())
                .map(t -> Map.of("code", t.name(), "name", t.getDisplayName()))
                .toList();
    }

    @GetMapping("/partner-types")
    public List<Map<String, String>> partnerTypes() {
        return Arrays.stream(PartnerType.values())
                .map(t -> Map.of("code", t.name(), "name", t.getDisplayName()))
                .toList();
    }
}
