package com.erp.groupware.schedule;

import com.erp.common.ApiException;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.SaveScheduleCategoryRequest;
import com.erp.groupware.schedule.dto.ScheduleEventDtos.ScheduleCategoryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 일정관리 '일정구분검색' · '일정구분리스트' · '일정구분등록/수정'(원본 2026-10-13 실측).
 * 신규 코드는 숫자 코드 중 가장 큰 것 + 1 을 세 자리로(011 다음 012). 이름을 바꾸거나 지우면 그 이름이 붙은 일정도 따라간다.
 */
@Service
@RequiredArgsConstructor
public class ScheduleCategoryService {

    private final ScheduleCategoryRepository categoryRepository;
    private final ScheduleEventRepository eventRepository;

    @Transactional(readOnly = true)
    public List<ScheduleCategoryResponse> list() {
        return categoryRepository.findAllByOrderByCodeAsc().stream().map(ScheduleCategoryResponse::from).toList();
    }

    /** 원본 '일정구분등록' 을 열면 코드 칸에 미리 들어 있는 다음 번호. */
    @Transactional(readOnly = true)
    public String nextCode() {
        int max = 0;
        for (ScheduleCategory c : categoryRepository.findAll()) {
            if (c.getCode().matches("\\d{1,9}")) max = Math.max(max, Integer.parseInt(c.getCode()));
        }
        return String.format("%03d", max + 1);
    }

    @Transactional
    public ScheduleCategoryResponse create(SaveScheduleCategoryRequest req) {
        String code = req.code() == null ? "" : req.code().trim();
        if (code.isEmpty()) throw ApiException.badRequest("일정구분코드를 입력 바랍니다.");
        if (categoryRepository.existsByCode(code)) throw ApiException.badRequest("이미 있는 일정구분코드입니다.");
        return ScheduleCategoryResponse.from(categoryRepository.save(ScheduleCategory.builder()
                .code(code).name(name(req)).active(true).build()));
    }

    @Transactional
    public ScheduleCategoryResponse update(Long id, SaveScheduleCategoryRequest req) {
        ScheduleCategory c = get(id);
        String before = c.getName();
        c.setName(name(req));
        if (!before.equals(c.getName())) rename(before, c.getName());
        return ScheduleCategoryResponse.from(c);
    }

    @Transactional
    public ScheduleCategoryResponse setActive(Long id, boolean active) {
        ScheduleCategory c = get(id);
        c.setActive(active);
        return ScheduleCategoryResponse.from(c);
    }

    @Transactional
    public void delete(Long id) {
        ScheduleCategory c = get(id);
        rename(c.getName(), null);
        categoryRepository.delete(c);
    }

    private void rename(String from, String to) {
        for (ScheduleEvent e : eventRepository.findAll()) {
            if (from.equals(e.getCategory())) e.setCategory(to);
        }
    }

    private static String name(SaveScheduleCategoryRequest req) {
        String n = req.name() == null ? "" : req.name().trim();
        if (n.isEmpty()) throw ApiException.badRequest("일정구분명을 입력 바랍니다.");
        return n;
    }

    private ScheduleCategory get(Long id) {
        return categoryRepository.findById(id).orElseThrow(() -> ApiException.notFound("일정구분을 찾을 수 없습니다. id=" + id));
    }
}
