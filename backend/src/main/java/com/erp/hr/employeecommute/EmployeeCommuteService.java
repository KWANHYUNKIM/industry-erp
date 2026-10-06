package com.erp.hr.employeecommute;

import com.erp.common.ApiException;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.ClockRequest;
import com.erp.hr.employeecommute.dto.EmployeeCommuteDtos.CommuteResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * 관리 › 근태관리 › 출/퇴근(사원) › 출/퇴근기록부(사원)(원본 E020726). 그날 첫 기록은 출근, 두 번째는 퇴근,
 * 세 번째는 막는다. [선택삭제]는 '선택한 사원의 근무기록을 삭제하겠습니까?'.
 */
@Service
@RequiredArgsConstructor
public class EmployeeCommuteService {

    private final EmployeeCommuteRepository repository;
    private final EmployeeService employeeService;

    @Transactional(readOnly = true)
    public List<CommuteResponse> findInPeriod(LocalDate from, LocalDate to) {
        return repository.findInPeriod(from, to).stream().map(CommuteResponse::from).toList();
    }

    @Transactional
    public CommuteResponse clock(ClockRequest req) {
        LocalDate day = req.at().toLocalDate();
        var existing = repository.findByEmployee_IdAndWorkDate(req.employeeId(), day);
        if (existing.isEmpty()) {
            EmployeeCommute c = EmployeeCommute.builder()
                    .employee(employeeService.get(req.employeeId()))
                    .workDate(day).clockIn(req.at())
                    .place(blank(req.place())).outside(req.outside()).morningHalf(req.morningHalf()).reason(blank(req.reason()))
                    .build();
            return CommuteResponse.from(repository.save(c));
        }
        EmployeeCommute c = existing.get();
        if (c.getClockOut() != null) throw ApiException.conflict("이미 퇴근한 사원입니다: " + c.getEmployee().getName());
        if (req.at().isBefore(c.getClockIn())) throw ApiException.badRequest("퇴근시간이 출근시간보다 앞섭니다.");
        c.setClockOut(req.at());
        if (req.reason() != null && !req.reason().isBlank()) c.setReason(req.reason().trim());
        return CommuteResponse.from(c);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(repository.findById(id).orElseThrow(() -> ApiException.notFound("출/퇴근 기록을 찾을 수 없습니다.")));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
