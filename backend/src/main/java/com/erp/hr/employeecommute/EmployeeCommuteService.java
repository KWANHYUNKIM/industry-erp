package com.erp.hr.employeecommute;

import com.erp.common.ApiException;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.ClockRequest;
import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.CommuteResponse;
import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.EventUpdateRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 관리 › 근태관리 › 출/퇴근(사원) › 출/퇴근기록부(사원)(원본 E020726).
 *
 * <p>원본 2026-10-13 실측: 사원 · 일자당 줄은 하나, 그 안에 출근 · 퇴근이 번갈아 쌓인다(이력 = EmployeeCommuteEvent).
 * 그날 기록을 열면 마지막 이력이 출근이면 [퇴근], 퇴근이면 다시 [출근]. 리스트의 출근 · 퇴근시간은 첫 출근 · 첫 퇴근이고,
 * 다시 출근한 횟수만큼 퇴근시간 옆에 '+1'. [신규(F2)]에서 퇴근 안 한 사원으로 다시 [출근]하면 막는다.
 * [선택삭제]는 '선택한 사원의 근무기록을 삭제하겠습니까?'.
 */
@Service
@RequiredArgsConstructor
public class EmployeeCommuteService {

    private final EmployeeCommuteRepository repository;
    private final EmployeeCommuteEventRepository eventRepository;
    private final EmployeeService employeeService;

    @Transactional(readOnly = true)
    public List<CommuteResponse> findInPeriod(LocalDate from, LocalDate to) {
        Map<Long, List<EmployeeCommuteEvent>> events = eventRepository.findInPeriod(from, to).stream()
                .collect(Collectors.groupingBy(ev -> ev.getCommute().getId()));
        return repository.findInPeriod(from, to).stream()
                .map(c -> CommuteResponse.from(c, events.getOrDefault(c.getId(), List.of()))).toList();
    }

    @Transactional
    public CommuteResponse clock(ClockRequest req) {
        return clock(req, null);
    }

    @Transactional
    public CommuteResponse clock(ClockRequest req, String worker) {
        LocalDate day = req.at().toLocalDate();
        var existing = repository.findByEmployee_IdAndWorkDate(req.employeeId(), day);
        if (existing.isEmpty()) {
            if (Boolean.TRUE.equals(req.out()))
                throw ApiException.badRequest("출근시간이 없습니다. [신규(F2)]로 출근을 먼저 입력바랍니다.");
            EmployeeCommute c = repository.save(EmployeeCommute.builder()
                    .employee(employeeService.get(req.employeeId()))
                    .workDate(day).clockIn(req.at())
                    .place(blank(req.place())).outside(req.outside()).morningHalf(req.morningHalf()).reason(blank(req.reason()))
                    .build());
            eventRepository.save(event(c, EmployeeCommuteEvent.IN, req, worker));
            return CommuteResponse.from(c, eventRepository.findOfCommute(c.getId()));
        }
        EmployeeCommute c = existing.get();
        List<EmployeeCommuteEvent> events = eventRepository.findOfCommute(c.getId());
        boolean working = !events.isEmpty() && events.get(events.size() - 1).isIn();
        boolean out;
        if (req.out() == null) {
            // 예전 API(qa.mjs): 처음이면 출근, 두 번째면 퇴근, 세 번째는 막는다
            if (!working) throw ApiException.conflict("이미 퇴근한 사원입니다: " + c.getEmployee().getName());
            out = true;
        } else {
            out = req.out();
        }
        if (out) {
            if (!working) throw ApiException.conflict("출근시간이 없습니다. 출근을 먼저 입력바랍니다.");
            if (req.at().isBefore(events.get(events.size() - 1).getAt()))
                throw ApiException.badRequest(after(events.get(events.size() - 1).getAt()));
        } else {
            // 원본: [신규(F2)] 창에서 그날 출근만 한 사원으로 다시 [출근]을 누르면 막는다. 퇴근 뒤에는 다시 출근이 된다.
            if (working) throw ApiException.conflict("출근시간이 입력되어 있습니다.\n해당 일자를 클릭하여 퇴근시간을 입력바랍니다.");
            if (!events.isEmpty() && req.at().isBefore(events.get(events.size() - 1).getAt()))
                throw ApiException.badRequest("출근시간이 퇴근시간보다 앞섭니다.");
        }
        eventRepository.save(event(c, out ? EmployeeCommuteEvent.OUT : EmployeeCommuteEvent.IN, req, worker));
        return CommuteResponse.from(c, sync(c));
    }

    /** 이력 한 줄 펼쳐 [저장] — 장소 · 시간 · □외근(출근만) · □반차 · 사유 */
    @Transactional
    public CommuteResponse updateEvent(Long eventId, EventUpdateRequest req, String worker) {
        EmployeeCommuteEvent ev = getEvent(eventId);
        if (!ev.getAt().toLocalDate().equals(req.at().toLocalDate()))
            throw ApiException.badRequest("일자는 바꿀 수 없습니다. 시간만 고쳐 주십시오.");
        ev.setAt(req.at());
        ev.setPlace(blank(req.place()));
        ev.setOutside(ev.isIn() && req.outside());
        ev.setHalfDay(req.halfDay());
        ev.setReason(blank(req.reason()));
        ev.setUpdatedBy(worker);
        EmployeeCommute c = ev.getCommute();
        return CommuteResponse.from(c, sync(c));
    }

    /** 이력 한 줄 [삭제] — 원본은 퇴근 줄에만 [삭제]가 있고 확인 창 없이 지운다 */
    @Transactional
    public CommuteResponse deleteEvent(Long eventId) {
        EmployeeCommuteEvent ev = getEvent(eventId);
        if (ev.isIn()) throw ApiException.badRequest("출근 기록은 지울 수 없습니다. 근무기록을 [선택삭제] 하십시오.");
        EmployeeCommute c = ev.getCommute();
        eventRepository.delete(ev);
        eventRepository.flush();
        return CommuteResponse.from(c, sync(c));
    }

    @Transactional
    public void delete(Long id) {
        EmployeeCommute c = repository.findById(id).orElseThrow(() -> ApiException.notFound("출/퇴근 기록을 찾을 수 없습니다."));
        eventRepository.deleteAll(eventRepository.findOfCommute(id));
        repository.delete(c);
    }

    /** 이력으로 줄 요약을 다시 맞춘다 — 첫 출근 · 첫 퇴근 · 오전반차(첫 출근) · 오후반차(퇴근 중 하나라도) */
    private List<EmployeeCommuteEvent> sync(EmployeeCommute c) {
        List<EmployeeCommuteEvent> events = eventRepository.findOfCommute(c.getId()).stream()
                .sorted(Comparator.comparing(EmployeeCommuteEvent::getAt).thenComparing(EmployeeCommuteEvent::getId)).toList();
        events.stream().filter(EmployeeCommuteEvent::isIn).findFirst().ifPresent(in -> {
            c.setClockIn(in.getAt());
            c.setPlace(in.getPlace());
            c.setOutside(in.isOutside());
            c.setMorningHalf(in.isHalfDay());
            c.setReason(in.getReason());
        });
        c.setClockOut(events.stream().filter(e -> !e.isIn()).map(EmployeeCommuteEvent::getAt).findFirst().orElse(null));
        c.setAfternoonHalf(events.stream().anyMatch(e -> !e.isIn() && e.isHalfDay()));
        return events;
    }

    private EmployeeCommuteEvent getEvent(Long id) {
        return eventRepository.findById(id).orElseThrow(() -> ApiException.notFound("출/퇴근 이력을 찾을 수 없습니다."));
    }

    /** 원본 2026-10-13: 출근 3:03:44 뒤 3:03 으로 퇴근하면 '오후 3:03 이후로 입력 바랍니다.' */
    private static String after(java.time.LocalDateTime t) {
        int h = t.getHour();
        return (h < 12 ? "오전 " : "오후 ") + (h % 12 == 0 ? 12 : h % 12) + ":" + String.format("%02d", t.getMinute()) + " 이후로 입력 바랍니다.";
    }

    private static EmployeeCommuteEvent event(EmployeeCommute c, String kind, ClockRequest req, String worker) {
        boolean in = EmployeeCommuteEvent.IN.equals(kind);
        return EmployeeCommuteEvent.builder().commute(c).kind(kind).at(req.at())
                .place(blank(req.place())).outside(in && req.outside())
                .halfDay(in ? req.morningHalf() : req.afternoonHalf())
                .reason(blank(req.reason())).createdBy(worker).updatedBy(worker).build();
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
