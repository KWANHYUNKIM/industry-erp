package com.erp.groupware.schedule;

import com.erp.common.ApiException;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.SaveScheduleLabelRequest;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.ScheduleLabelResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 일정관리 '라벨검색' — 라벨코드 · 라벨명 · 색상. 일정은 코드로 붙어 있어 이름 · 색을 바꾸면 따로 손댈 것 없이 따라간다.
 * 지우면 그 코드가 붙은 일정에서 라벨을 뗀다.
 */
@Service
@RequiredArgsConstructor
public class ScheduleLabelService {

    private static final Pattern COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private final ScheduleLabelRepository labelRepository;
    private final ScheduleEventRepository eventRepository;

    @Transactional(readOnly = true)
    public List<ScheduleLabelResponse> list() {
        return labelRepository.findAllByOrderByCodeAsc().stream().map(ScheduleLabelResponse::from).toList();
    }

    @Transactional
    public ScheduleLabelResponse create(SaveScheduleLabelRequest req) {
        String code = req.code() == null ? "" : req.code().trim();
        if (code.isEmpty()) throw ApiException.badRequest("라벨코드를 입력하세요.");
        if (labelRepository.existsByCode(code)) throw ApiException.badRequest("이미 있는 라벨코드입니다.");
        return ScheduleLabelResponse.from(labelRepository.save(ScheduleLabel.builder()
                .code(code).name(name(req)).color(color(req)).active(true).build()));
    }

    @Transactional
    public ScheduleLabelResponse update(Long id, SaveScheduleLabelRequest req) {
        ScheduleLabel label = get(id);
        label.setName(name(req));
        label.setColor(color(req));
        return ScheduleLabelResponse.from(label);
    }

    @Transactional
    public ScheduleLabelResponse setActive(Long id, boolean active) {
        ScheduleLabel label = get(id);
        label.setActive(active);
        return ScheduleLabelResponse.from(label);
    }

    @Transactional
    public void delete(Long id) {
        ScheduleLabel label = get(id);
        for (ScheduleEvent e : eventRepository.findByLabelCode(label.getCode())) e.setLabelCode(null);
        labelRepository.delete(label);
    }

    private static String name(SaveScheduleLabelRequest req) {
        String n = req.name() == null ? "" : req.name().trim();
        if (n.isEmpty()) throw ApiException.badRequest("라벨명을 입력하세요.");
        return n;
    }

    private static String color(SaveScheduleLabelRequest req) {
        if (req.color() == null || req.color().isBlank()) return "#000000";
        if (!COLOR.matcher(req.color()).matches()) throw ApiException.badRequest("색상을 다시 고르세요.");
        return req.color().toLowerCase();
    }

    private ScheduleLabel get(Long id) {
        return labelRepository.findById(id).orElseThrow(() -> ApiException.notFound("라벨을 찾을 수 없습니다. id=" + id));
    }
}
