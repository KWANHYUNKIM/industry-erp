package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.ScheduleEvent;
import com.erp.dto.ScheduleEventDtos.CreateScheduleEventRequest;
import com.erp.dto.ScheduleEventDtos.ScheduleEventResponse;
import com.erp.dto.ScheduleEventDtos.UpdateScheduleEventRequest;
import com.erp.repository.ScheduleEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ScheduleEventService {

    private final ScheduleEventRepository scheduleEventRepository;

    /** 일자 오름차순, 그다음 시간/ID 순. */
    @Transactional(readOnly = true)
    public List<ScheduleEventResponse> findAll() {
        return scheduleEventRepository.findAll(
                        Sort.by(Sort.Order.asc("eventDate"), Sort.Order.asc("startTime"), Sort.Order.asc("id"))).stream()
                .map(ScheduleEventResponse::from)
                .toList();
    }

    @Transactional
    public ScheduleEventResponse create(CreateScheduleEventRequest req, String username) {
        ScheduleEvent e = ScheduleEvent.builder()
                .eventDate(req.eventDate())
                .startTime(req.startTime())
                .title(req.title())
                .category(req.category())
                .owner(req.owner())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return ScheduleEventResponse.from(scheduleEventRepository.save(e));
    }

    @Transactional
    public ScheduleEventResponse update(Long id, UpdateScheduleEventRequest req) {
        ScheduleEvent e = get(id);
        if (req.eventDate() != null) e.setEventDate(req.eventDate());
        if (req.startTime() != null) e.setStartTime(req.startTime());
        if (req.title() != null) e.setTitle(req.title());
        if (req.category() != null) e.setCategory(req.category());
        if (req.owner() != null) e.setOwner(req.owner());
        if (req.remark() != null) e.setRemark(req.remark());
        return ScheduleEventResponse.from(e);
    }

    @Transactional
    public void delete(Long id) {
        scheduleEventRepository.delete(get(id));
    }

    private ScheduleEvent get(Long id) {
        return scheduleEventRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("일정을 찾을 수 없습니다. id=" + id));
    }
}
