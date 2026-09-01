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

    private final com.erp.inventory.service.ProjectService projectService;
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
                .labelText(req.labelText())
                .remark(req.remark())
                /* 안 주면 공유다 — 예전 일정이 다 그랬고, 갑자기 안 보이는 것이 더 놀랍다. */
                .shared(req.shared() == null || req.shared())
                .project(projectOf(req.projectId()))
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
        if (req.labelText() != null) e.setLabelText(req.labelText());
        if (req.remark() != null) e.setRemark(req.remark());
        if (req.shared() != null) e.setShared(req.shared());
        if (req.projectId() != null) e.setProject(projectOf(req.projectId()));
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

    /** 원본 [프로젝트]. 안 고르면 안 붙인다. 없는 id 를 조용히 흘리지 않는다. */
    private com.erp.inventory.domain.Project projectOf(Long id) {
        if (id == null) return null;
        return projectService.get(id);
    }

}
