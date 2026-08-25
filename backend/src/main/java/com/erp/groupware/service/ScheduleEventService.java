package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.ScheduleEvent;
import com.erp.groupware.dto.ScheduleEventDtos.CreateScheduleEventRequest;
import com.erp.groupware.dto.ScheduleEventDtos.ScheduleEventResponse;
import com.erp.groupware.dto.ScheduleEventDtos.UpdateScheduleEventRequest;
import com.erp.groupware.repository.ScheduleEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.groupware.dto.ScheduleEventDtos;

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
                .endTime(req.endTime())
                .title(req.title())
                .category(req.category())
                .owner(req.owner())
                .location(req.location())
                .attendees(req.attendees())
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
        if (req.endTime() != null) e.setEndTime(req.endTime());
        if (req.title() != null) e.setTitle(req.title());
        if (req.category() != null) e.setCategory(req.category());
        if (req.owner() != null) e.setOwner(req.owner());
        if (req.location() != null) e.setLocation(req.location());
        if (req.attendees() != null) e.setAttendees(req.attendees());
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
