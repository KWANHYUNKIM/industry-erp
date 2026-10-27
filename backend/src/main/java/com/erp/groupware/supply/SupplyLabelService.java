package com.erp.groupware.supply;

import com.erp.common.ApiException;
import com.erp.groupware.supply.dto.SupplyLabelDtos.SaveSupplyLabelRequest;
import com.erp.groupware.supply.dto.SupplyLabelDtos.SupplyLabelResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

/** 공용품관리 '라벨조회' — 라벨코드 · 라벨명 · 색상. 이름을 바꾸거나 지우면 그 이름이 붙은 사용내역도 따라간다. */
@Service
@RequiredArgsConstructor
public class SupplyLabelService {

    private static final Pattern COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private final SupplyLabelRepository labelRepository;
    private final SupplyUsageRepository usageRepository;

    @Transactional(readOnly = true)
    public List<SupplyLabelResponse> list() {
        return labelRepository.findAllByOrderByCodeAsc().stream().map(SupplyLabelResponse::from).toList();
    }

    @Transactional
    public SupplyLabelResponse create(SaveSupplyLabelRequest req) {
        String code = req.code() == null ? "" : req.code().trim();
        if (code.isEmpty()) throw ApiException.badRequest("라벨코드를 입력하세요.");
        if (labelRepository.existsByCode(code)) throw ApiException.badRequest("이미 있는 라벨코드입니다.");
        return SupplyLabelResponse.from(labelRepository.save(SupplyLabel.builder()
                .code(code).name(name(req)).color(color(req)).active(true).build()));
    }

    @Transactional
    public SupplyLabelResponse update(Long id, SaveSupplyLabelRequest req) {
        SupplyLabel label = get(id);
        String before = label.getName();
        label.setName(name(req));
        label.setColor(color(req));
        if (!before.equals(label.getName())) rename(before, label.getName());
        return SupplyLabelResponse.from(label);
    }

    @Transactional
    public SupplyLabelResponse setActive(Long id, boolean active) {
        SupplyLabel label = get(id);
        label.setActive(active);
        return SupplyLabelResponse.from(label);
    }

    @Transactional
    public void delete(Long id) {
        SupplyLabel label = get(id);
        rename(label.getName(), null);
        labelRepository.delete(label);
    }

    private void rename(String from, String to) {
        for (SupplyUsage u : usageRepository.findByLabelText(from)) u.setLabelText(to);
    }

    private static String name(SaveSupplyLabelRequest req) {
        String n = req.name() == null ? "" : req.name().trim();
        if (n.isEmpty()) throw ApiException.badRequest("라벨명을 입력하세요.");
        return n;
    }

    private static String color(SaveSupplyLabelRequest req) {
        if (req.color() == null || req.color().isBlank()) return "#000000";
        if (!COLOR.matcher(req.color()).matches()) throw ApiException.badRequest("색상을 다시 고르세요.");
        return req.color().toLowerCase();
    }

    private SupplyLabel get(Long id) {
        return labelRepository.findById(id).orElseThrow(() -> ApiException.notFound("라벨을 찾을 수 없습니다. id=" + id));
    }
}
